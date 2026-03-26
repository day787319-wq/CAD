import os
import threading
from datetime import datetime, timezone
from uuid import uuid4

from web3 import Web3

from src.config.database import db
from src.services.template_chain_config import TEMPLATE_CHAIN_ETHEREUM, normalize_template_chain
from src.services.wallet_service import (
    ERC20_ABI,
    format_decimal,
    get_chain_runtime_config,
    get_onchain_token_metadata,
    get_wallet_summary_tracked_tokens,
    get_wallet_record,
    get_web3,
    list_wallet_records,
    list_wallet_runs,
    token_units_to_decimal,
    wei_to_decimal,
)

DEFAULT_MONITOR_CHAIN = TEMPLATE_CHAIN_ETHEREUM
DEFAULT_EVENT_LIMIT = 20
MAX_EVENT_LIMIT = 200
MONITOR_POLL_INTERVAL_SECONDS = max(int(os.getenv("ASSET_MONITOR_POLL_INTERVAL_SECONDS", "15")), 5)
ROLE_PRIORITY = {
    "main_wallet": 0,
    "sub_wallet": 1,
    "managed_token_distributor": 2,
    "return_wallet": 3,
    "recipient_wallet": 4,
    "custom_address": 5,
}

_asset_monitor_stop_event = threading.Event()
_asset_monitor_thread: threading.Thread | None = None
_asset_monitor_thread_lock = threading.Lock()
_asset_monitor_sync_lock = threading.Lock()
_asset_monitor_state_lock = threading.Lock()
_asset_monitor_state = {
    "status": "idle",
    "last_synced_at": None,
    "latest_block": None,
    "last_error": None,
}


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_event_limit(limit: int | None) -> int:
    try:
        normalized = int(limit or DEFAULT_EVENT_LIMIT)
    except (TypeError, ValueError):
        normalized = DEFAULT_EVENT_LIMIT
    return max(0, min(normalized, MAX_EVENT_LIMIT))


def _short_address(address: str | None) -> str:
    if not address:
        return "Unknown"
    return f"{address[:6]}...{address[-4:]}"


def _set_worker_state(*, status: str, latest_block: int | None = None, error: str | None = None):
    with _asset_monitor_state_lock:
        _asset_monitor_state["status"] = status
        _asset_monitor_state["latest_block"] = latest_block
        _asset_monitor_state["last_synced_at"] = _utcnow_iso()
        _asset_monitor_state["last_error"] = error


def _get_worker_state() -> dict:
    with _asset_monitor_state_lock:
        return dict(_asset_monitor_state)


def _list_all_wallet_records() -> list[dict]:
    db.connect_keyspace()
    rows = db.session.execute("SELECT * FROM wallets")
    return [dict(row._asdict()) for row in rows.all()]


def _iter_run_deployed_contracts(run: dict) -> list[dict]:
    contracts: list[dict] = []
    seen: set[tuple[str, str, str, str]] = set()

    def append_contract(contract: dict | None):
        if not isinstance(contract, dict):
            return
        key = (
            str(contract.get("contract_address") or "").lower(),
            str(contract.get("tx_hash") or "").lower(),
            str(contract.get("wallet_id") or "").lower(),
            str(contract.get("token_address") or "").lower(),
        )
        if key in seen:
            return
        seen.add(key)
        contracts.append(contract)

    for contract in run.get("deployed_contracts") or []:
        append_contract(contract)

    for sub_wallet in run.get("sub_wallets") or []:
        append_contract(sub_wallet.get("deployed_contract"))
        for contract in sub_wallet.get("deployed_contracts") or []:
            append_contract(contract)

    return contracts


def _run_mentions_wallet(run: dict, wallet_id: str | None, wallet_address: str | None) -> bool:
    normalized_wallet_id = str(wallet_id or "").strip().lower()
    normalized_wallet_address = str(wallet_address or "").strip().lower()

    if normalized_wallet_id and str(run.get("main_wallet_id") or "").lower() == normalized_wallet_id:
        return True
    if normalized_wallet_address and str(run.get("main_wallet_address") or "").lower() == normalized_wallet_address:
        return True

    for sub_wallet in run.get("sub_wallets") or []:
        if normalized_wallet_id and str(sub_wallet.get("wallet_id") or "").lower() == normalized_wallet_id:
            return True
        if normalized_wallet_address and str(sub_wallet.get("address") or "").lower() == normalized_wallet_address:
            return True

    return False


def _register_target(
    targets: dict[str, dict],
    address: str | None,
    *,
    role: str,
    address_type: str,
    wallet_id: str | None = None,
    parent_wallet_id: str | None = None,
    wallet_type: str | None = None,
    index: int | None = None,
    source_run_id: str | None = None,
    token_symbol: str | None = None,
):
    if not address or not Web3.is_address(address):
        return

    checksum_address = Web3.to_checksum_address(address)
    key = checksum_address.lower()
    target = targets.setdefault(
        key,
        {
            "address": checksum_address,
            "address_type": address_type,
            "roles": set(),
            "wallet_ids": set(),
            "parent_wallet_ids": set(),
            "source_run_ids": set(),
            "token_symbols": set(),
            "wallet_type": None,
            "index": None,
        },
    )
    target["roles"].add(role)
    target["address_type"] = "contract" if address_type == "contract" else target["address_type"]
    if wallet_id:
        target["wallet_ids"].add(wallet_id)
    if parent_wallet_id:
        target["parent_wallet_ids"].add(parent_wallet_id)
    if wallet_type and not target.get("wallet_type"):
        target["wallet_type"] = wallet_type
    if index is not None and (target.get("index") is None or index < int(target["index"])):
        target["index"] = index
    if source_run_id:
        target["source_run_ids"].add(source_run_id)
    if token_symbol:
        target["token_symbols"].add(token_symbol)


def _build_target_label(target: dict) -> str:
    roles = set(target.get("roles") or [])
    if "main_wallet" in roles:
        return "Main wallet"
    if "sub_wallet" in roles:
        index = target.get("index")
        return f"Sub-wallet {int(index) + 1}" if index is not None else "Sub-wallet"
    if "managed_token_distributor" in roles:
        token_symbols = sorted(target.get("token_symbols") or [])
        if token_symbols:
            return f"BatchTreasuryDistributor ({', '.join(token_symbols)})"
        return "BatchTreasuryDistributor"
    if "return_wallet" in roles and "recipient_wallet" in roles:
        return "Return / recipient wallet"
    if "return_wallet" in roles:
        return "Return wallet"
    if "recipient_wallet" in roles:
        return "Recipient wallet"
    return "Tracked address"


def _finalize_target(target: dict) -> dict:
    roles = sorted(target.get("roles") or [], key=lambda item: (ROLE_PRIORITY.get(item, 99), item))
    return {
        "address": target["address"],
        "address_type": target.get("address_type") or "wallet",
        "label": _build_target_label(target),
        "roles": roles,
        "wallet_ids": sorted(target.get("wallet_ids") or []),
        "parent_wallet_ids": sorted(target.get("parent_wallet_ids") or []),
        "source_run_ids": sorted(target.get("source_run_ids") or []),
        "token_symbols": sorted(target.get("token_symbols") or []),
        "wallet_type": target.get("wallet_type"),
        "index": target.get("index"),
    }


def _target_sort_key(target: dict):
    roles = target.get("roles") or []
    primary_role = min((ROLE_PRIORITY.get(role, 99) for role in roles), default=99)
    index = target.get("index")
    normalized_index = int(index) if isinstance(index, int) or isinstance(index, float) else 999_999
    return (primary_role, normalized_index, target.get("label") or "", target.get("address") or "")


def _discover_scope(wallet_id: str | None = None, address: str | None = None) -> dict:
    targets: dict[str, dict] = {}

    if address:
        _register_target(targets, address, role="custom_address", address_type="wallet")
        return {
            "scope": {"type": "address", "wallet_id": None, "address": Web3.to_checksum_address(address)},
            "targets": sorted((_finalize_target(target) for target in targets.values()), key=_target_sort_key),
            "runs": [],
        }

    wallet_record = get_wallet_record(wallet_id) if wallet_id else None
    if wallet_id and not wallet_record:
        raise ValueError("Wallet not found")

    all_runs = list_wallet_runs()
    relevant_runs: list[dict] = []

    if wallet_record:
        wallet_address = wallet_record.get("address")
        if wallet_record.get("type") in {"main", "imported_private_key"}:
            _register_target(
                targets,
                wallet_address,
                role="main_wallet",
                address_type="wallet",
                wallet_id=wallet_record.get("id"),
                wallet_type=wallet_record.get("type"),
            )
            sub_wallets = sorted(
                list_wallet_records(wallet_record["id"]),
                key=lambda item: str(item.get("created_at") or ""),
            )
            for index, sub_wallet in enumerate(sub_wallets):
                _register_target(
                    targets,
                    sub_wallet.get("address"),
                    role="sub_wallet",
                    address_type="wallet",
                    wallet_id=sub_wallet.get("id"),
                    parent_wallet_id=wallet_record.get("id"),
                    wallet_type=sub_wallet.get("type"),
                    index=index,
                )
            relevant_runs = [run for run in all_runs if str(run.get("main_wallet_id") or "") == wallet_record["id"]]
        else:
            _register_target(
                targets,
                wallet_address,
                role="sub_wallet",
                address_type="wallet",
                wallet_id=wallet_record.get("id"),
                parent_wallet_id=wallet_record.get("parent_id"),
                wallet_type=wallet_record.get("type"),
            )
            relevant_runs = [run for run in all_runs if _run_mentions_wallet(run, wallet_record.get("id"), wallet_address)]
    else:
        wallet_records = sorted(_list_all_wallet_records(), key=lambda item: str(item.get("created_at") or ""))
        subwallet_index_by_parent: dict[str, int] = {}
        for wallet in wallet_records:
            wallet_type = wallet.get("type")
            if wallet_type in {"main", "imported_private_key"}:
                _register_target(
                    targets,
                    wallet.get("address"),
                    role="main_wallet",
                    address_type="wallet",
                    wallet_id=wallet.get("id"),
                    wallet_type=wallet_type,
                )
                continue

            parent_id = wallet.get("parent_id")
            next_index = subwallet_index_by_parent.get(parent_id or "", 0)
            subwallet_index_by_parent[parent_id or ""] = next_index + 1
            _register_target(
                targets,
                wallet.get("address"),
                role="sub_wallet",
                address_type="wallet",
                wallet_id=wallet.get("id"),
                parent_wallet_id=parent_id,
                wallet_type=wallet_type,
                index=next_index,
            )
        relevant_runs = all_runs
        try:
            from src.services.balance_rule_service import list_enabled_balance_rule_targets

            for rule_target in list_enabled_balance_rule_targets():
                target_address_type = "contract" if rule_target.get("address_role") == "contract" else "wallet"
                _register_target(
                    targets,
                    rule_target.get("address"),
                    role="custom_address",
                    address_type=target_address_type,
                    wallet_id=rule_target.get("target_wallet_id"),
                )
        except Exception:
            pass

    for run in relevant_runs:
        run_id = run.get("id")
        for sub_wallet in run.get("sub_wallets") or []:
            _register_target(
                targets,
                sub_wallet.get("address"),
                role="sub_wallet",
                address_type="wallet",
                wallet_id=sub_wallet.get("wallet_id"),
                parent_wallet_id=run.get("main_wallet_id"),
                wallet_type="sub",
                index=sub_wallet.get("index"),
                source_run_id=run_id,
            )

        for contract in _iter_run_deployed_contracts(run):
            _register_target(
                targets,
                contract.get("contract_address"),
                role="managed_token_distributor",
                address_type="contract",
                wallet_id=contract.get("wallet_id"),
                source_run_id=run_id,
                token_symbol=contract.get("token_symbol"),
            )
            _register_target(
                targets,
                contract.get("recipient_address"),
                role="recipient_wallet",
                address_type="wallet",
                source_run_id=run_id,
            )
            _register_target(
                targets,
                contract.get("return_wallet_address"),
                role="return_wallet",
                address_type="wallet",
                source_run_id=run_id,
            )

    finalized_targets = sorted((_finalize_target(target) for target in targets.values()), key=_target_sort_key)
    scope_type = "global" if not wallet_id else "wallet"
    return {
        "scope": {"type": scope_type, "wallet_id": wallet_id, "address": None},
        "targets": finalized_targets,
        "runs": relevant_runs,
    }


def _normalize_monitor_chain(chain: str | None = None) -> str:
    return normalize_template_chain(chain or DEFAULT_MONITOR_CHAIN)


def _infer_run_chain(run: dict, template_chain_cache: dict[str, str]) -> str:
    direct_chain = (
        run.get("chain")
        or run.get("template_chain")
        or ((run.get("template") or {}).get("chain") if isinstance(run.get("template"), dict) else None)
        or ((run.get("preview") or {}).get("chain") if isinstance(run.get("preview"), dict) else None)
        or ((run.get("contract_execution") or {}).get("template", {}).get("chain") if isinstance(run.get("contract_execution"), dict) else None)
    )
    if direct_chain:
        return _normalize_monitor_chain(direct_chain)

    template_id = str(run.get("template_id") or "").strip()
    if template_id:
        cached_chain = template_chain_cache.get(template_id)
        if cached_chain:
            return cached_chain
        template_record = db.get_template(template_id)
        if template_record and template_record.get("chain"):
            resolved_chain = _normalize_monitor_chain(template_record.get("chain"))
            template_chain_cache[template_id] = resolved_chain
            return resolved_chain

    return DEFAULT_MONITOR_CHAIN


def _register_tracked_token(
    tokens: dict[str, dict],
    *,
    chain: str,
    address: str | None,
    symbol: str | None = None,
    name: str | None = None,
    decimals: int | str | None = None,
):
    if not address or not Web3.is_address(address):
        return

    checksum_address = Web3.to_checksum_address(address)
    existing = tokens.get(checksum_address.lower())
    resolved_symbol = symbol or (existing or {}).get("symbol") or checksum_address[-6:].upper()
    resolved_name = name or (existing or {}).get("name") or resolved_symbol
    resolved_decimals = existing.get("decimals") if existing else None

    if decimals is not None:
        try:
            resolved_decimals = int(decimals)
        except (TypeError, ValueError):
            resolved_decimals = resolved_decimals

    if resolved_decimals is None or not resolved_symbol or not resolved_name:
        try:
            metadata = get_onchain_token_metadata(checksum_address, chain)
        except Exception:
            metadata = None
        if metadata:
            resolved_symbol = metadata.get("symbol") or resolved_symbol
            resolved_name = metadata.get("name") or resolved_name
            resolved_decimals = int(metadata.get("decimals") if metadata.get("decimals") is not None else (resolved_decimals or 18))

    tokens[checksum_address.lower()] = {
        "address": checksum_address,
        "symbol": resolved_symbol,
        "name": resolved_name,
        "decimals": int(resolved_decimals if resolved_decimals is not None else 18),
    }


def _iter_run_token_records(run: dict):
    for contract in _iter_run_deployed_contracts(run):
        yield {
            "address": contract.get("token_address"),
            "symbol": contract.get("token_symbol"),
            "decimals": contract.get("token_decimals"),
        }
        for asset in contract.get("funded_assets") or []:
            yield {
                "address": asset.get("token_address"),
                "symbol": asset.get("token_symbol"),
                "decimals": asset.get("token_decimals"),
            }

    for sub_wallet in run.get("sub_wallets") or []:
        for swap in sub_wallet.get("swap_transactions") or []:
            yield {
                "address": swap.get("token_address"),
                "symbol": swap.get("token_symbol"),
                "decimals": swap.get("token_decimals"),
            }


def _collect_tracked_tokens(chain: str | None = None, runs: list[dict] | None = None) -> list[dict]:
    normalized_chain = _normalize_monitor_chain(chain)
    runtime = get_chain_runtime_config(normalized_chain)
    tokens: dict[str, dict] = {}

    wrapped_native_address = Web3.to_checksum_address(runtime["wrapped_native_address"])
    tokens[wrapped_native_address.lower()] = {
        "address": wrapped_native_address,
        "symbol": runtime["wrapped_native_symbol"],
        "name": f"Wrapped {runtime['native_symbol']}",
        "decimals": 18,
    }

    for token in get_wallet_summary_tracked_tokens(normalized_chain):
        _register_tracked_token(
            tokens,
            chain=normalized_chain,
            address=token.get("address"),
            symbol=token.get("symbol"),
            name=token.get("name"),
            decimals=token.get("decimals"),
        )

    template_chain_cache: dict[str, str] = {}
    for run in runs or []:
        if _infer_run_chain(run, template_chain_cache) != normalized_chain:
            continue
        for token_record in _iter_run_token_records(run):
            _register_tracked_token(
                tokens,
                chain=normalized_chain,
                address=token_record.get("address"),
                symbol=token_record.get("symbol"),
                decimals=token_record.get("decimals"),
            )

    return sorted(tokens.values(), key=lambda item: item["symbol"])


def _build_token_contracts(web3_client: Web3, tracked_tokens: list[dict]) -> dict[str, object]:
    return {
        token["address"].lower(): web3_client.eth.contract(
            address=Web3.to_checksum_address(token["address"]),
            abi=ERC20_ABI,
        )
        for token in tracked_tokens
    }


def _fetch_snapshot(
    web3_client: Web3,
    target: dict,
    *,
    runtime: dict,
    latest_block: int,
    chain_id: int,
    tracked_tokens: list[dict],
    token_contracts: dict[str, object],
) -> dict:
    errors: list[str] = []
    address = target["address"]
    observed_at = _utcnow_iso()

    native_raw_balance: int | None = None
    try:
        native_raw_balance = int(web3_client.eth.get_balance(address, block_identifier=latest_block))
    except Exception as exc:
        errors.append(f"{runtime['native_symbol']} balance unavailable: {str(exc)[:160]}")

    tracked_token_balances = []
    for token in tracked_tokens:
        raw_balance: int | None = None
        error: str | None = None
        try:
            contract = token_contracts[token["address"].lower()]
            raw_balance = int(contract.functions.balanceOf(address).call(block_identifier=latest_block))
        except Exception as exc:
            error = str(exc)[:160]
            errors.append(f"{token['symbol']} balance unavailable: {error}")
        tracked_token_balances.append(
            {
                "symbol": token["symbol"],
                "name": token["name"],
                "token_address": token["address"],
                "decimals": int(token["decimals"]),
                "raw_balance": str(raw_balance) if raw_balance is not None else None,
                "balance": format_decimal(token_units_to_decimal(raw_balance, int(token["decimals"]))) if raw_balance is not None else None,
                "error": error,
            }
        )

    status = "ok"
    if native_raw_balance is None and tracked_tokens:
        status = "error"
    elif errors:
        status = "partial"

    return {
        "address": address,
        "updated_at": observed_at,
        "chain": runtime["chain"],
        "chain_label": runtime["chain_label"],
        "chain_id": chain_id,
        "block_number": latest_block,
        "status": status,
        "error": " | ".join(errors) if errors else None,
        "label": target["label"],
        "address_type": target["address_type"],
        "roles": target["roles"],
        "wallet_ids": target["wallet_ids"],
        "parent_wallet_ids": target["parent_wallet_ids"],
        "source_run_ids": target["source_run_ids"],
        "wallet_type": target.get("wallet_type"),
        "index": target.get("index"),
        "token_symbols": target.get("token_symbols") or [],
        "native_balance": {
            "symbol": runtime["native_symbol"],
            "raw_balance": str(native_raw_balance) if native_raw_balance is not None else None,
            "balance": format_decimal(wei_to_decimal(native_raw_balance)) if native_raw_balance is not None else None,
            "error": None if native_raw_balance is not None else "Unavailable",
        },
        "tracked_tokens": tracked_token_balances,
    }


def _index_token_balances(snapshot: dict | None) -> dict[str, dict]:
    balances: dict[str, dict] = {}
    if not snapshot:
        return balances
    for token in snapshot.get("tracked_tokens") or []:
        token_address = str(token.get("token_address") or "").lower()
        if token_address:
            balances[token_address] = token
    return balances


def _build_first_observed_changes(snapshot: dict) -> list[dict]:
    changes: list[dict] = []
    native_balance = snapshot.get("native_balance") or {}
    native_raw = native_balance.get("raw_balance")
    if native_raw not in (None, "0"):
        changes.append(
            {
                "asset_type": "native",
                "symbol": native_balance.get("symbol") or "NATIVE",
                "token_address": None,
                "before_raw_balance": None,
                "after_raw_balance": native_raw,
                "before_balance": None,
                "after_balance": native_balance.get("balance"),
            }
        )

    for token in snapshot.get("tracked_tokens") or []:
        raw_balance = token.get("raw_balance")
        if raw_balance in (None, "0"):
            continue
        changes.append(
            {
                "asset_type": "token",
                "symbol": token.get("symbol"),
                "token_address": token.get("token_address"),
                "before_raw_balance": None,
                "after_raw_balance": raw_balance,
                "before_balance": None,
                "after_balance": token.get("balance"),
            }
        )
    return changes


def _build_balance_changes(previous_snapshot: dict | None, current_snapshot: dict) -> list[dict]:
    if not previous_snapshot:
        return _build_first_observed_changes(current_snapshot)

    changes: list[dict] = []

    previous_native = (previous_snapshot.get("native_balance") or {})
    current_native = (current_snapshot.get("native_balance") or {})
    previous_native_raw = previous_native.get("raw_balance")
    current_native_raw = current_native.get("raw_balance")
    if (
        previous_native_raw is not None
        and current_native_raw is not None
        and previous_native_raw != current_native_raw
    ):
        changes.append(
            {
                "asset_type": "native",
                "symbol": current_native.get("symbol") or previous_native.get("symbol") or "NATIVE",
                "token_address": None,
                "before_raw_balance": previous_native_raw,
                "after_raw_balance": current_native_raw,
                "before_balance": previous_native.get("balance"),
                "after_balance": current_native.get("balance"),
            }
        )

    previous_tokens = _index_token_balances(previous_snapshot)
    current_tokens = _index_token_balances(current_snapshot)
    for token_address in sorted(set(previous_tokens) | set(current_tokens)):
        previous_token = previous_tokens.get(token_address)
        current_token = current_tokens.get(token_address)
        previous_raw = previous_token.get("raw_balance") if previous_token else None
        current_raw = current_token.get("raw_balance") if current_token else None
        if previous_raw is None or current_raw is None or previous_raw == current_raw:
            continue
        changes.append(
            {
                "asset_type": "token",
                "symbol": (current_token or previous_token).get("symbol"),
                "token_address": (current_token or previous_token).get("token_address"),
                "before_raw_balance": previous_raw,
                "after_raw_balance": current_raw,
                "before_balance": previous_token.get("balance") if previous_token else None,
                "after_balance": current_token.get("balance") if current_token else None,
            }
        )

    return changes


def _append_snapshot_event(snapshot: dict, changes: list[dict], *, event_type: str):
    if not changes:
        return None
    return db.append_asset_monitor_event(
        {
            "id": uuid4().hex,
            "address": snapshot["address"],
            "observed_at": snapshot["updated_at"],
            "event_type": event_type,
            "label": snapshot.get("label"),
            "address_type": snapshot.get("address_type"),
            "roles": snapshot.get("roles") or [],
            "wallet_ids": snapshot.get("wallet_ids") or [],
            "parent_wallet_ids": snapshot.get("parent_wallet_ids") or [],
            "source_run_ids": snapshot.get("source_run_ids") or [],
            "chain": snapshot.get("chain"),
            "chain_id": snapshot.get("chain_id"),
            "block_number": snapshot.get("block_number"),
            "changes": changes,
            "native_balance": snapshot.get("native_balance"),
            "tracked_tokens": snapshot.get("tracked_tokens") or [],
        }
    )


def _merge_snapshot_with_target(snapshot: dict | None, target: dict, runtime: dict) -> dict:
    if snapshot is None:
        return {
            "address": target["address"],
            "updated_at": None,
            "chain": runtime["chain"],
            "chain_label": runtime["chain_label"],
            "chain_id": None,
            "block_number": None,
            "status": "pending",
            "error": None,
            "label": target["label"],
            "address_type": target["address_type"],
            "roles": target["roles"],
            "wallet_ids": target["wallet_ids"],
            "parent_wallet_ids": target["parent_wallet_ids"],
            "source_run_ids": target["source_run_ids"],
            "wallet_type": target.get("wallet_type"),
            "index": target.get("index"),
            "token_symbols": target.get("token_symbols") or [],
            "native_balance": {"symbol": runtime["native_symbol"], "raw_balance": None, "balance": None, "error": None},
            "tracked_tokens": [],
        }
    merged = dict(snapshot)
    merged["label"] = target["label"]
    merged["address_type"] = target["address_type"]
    merged["roles"] = target["roles"]
    merged["wallet_ids"] = target["wallet_ids"]
    merged["parent_wallet_ids"] = target["parent_wallet_ids"]
    merged["source_run_ids"] = target["source_run_ids"]
    merged["wallet_type"] = target.get("wallet_type")
    merged["index"] = target.get("index")
    merged["token_symbols"] = target.get("token_symbols") or []
    return merged


def _merge_event_with_target(event: dict, target: dict | None) -> dict:
    merged = dict(event)
    if target:
        merged["label"] = target["label"]
        merged["address_type"] = target["address_type"]
        merged["roles"] = target["roles"]
        merged["wallet_ids"] = target["wallet_ids"]
        merged["parent_wallet_ids"] = target["parent_wallet_ids"]
        merged["source_run_ids"] = target["source_run_ids"]
        merged["wallet_type"] = target.get("wallet_type")
        merged["index"] = target.get("index")
    return merged


def _summarize_status(snapshots: list[dict], fallback_status: str = "online") -> str:
    statuses = {snapshot.get("status") for snapshot in snapshots}
    if "error" in statuses:
        return "degraded"
    if "partial" in statuses:
        return "degraded"
    if fallback_status == "offline":
        return "offline"
    return fallback_status


def _build_monitor_response(
    *,
    chain: str | None,
    scope: dict,
    targets: list[dict],
    tracked_tokens: list[dict],
    latest_block: int | None,
    chain_id: int | None,
    events_limit: int,
    status: str,
    synced_at: str | None = None,
    error: str | None = None,
) -> dict:
    normalized_chain = _normalize_monitor_chain(chain)
    runtime = get_chain_runtime_config(normalized_chain)
    address_map = {target["address"].lower(): target for target in targets}
    addresses = [target["address"] for target in targets]
    snapshot_records = db.list_asset_monitor_snapshots(addresses=addresses, chain=normalized_chain) if addresses else []
    event_records = db.list_asset_monitor_events(addresses=addresses, limit=events_limit, chain=normalized_chain) if addresses else []

    snapshot_map = {
        str(snapshot.get("address") or "").lower(): snapshot
        for snapshot in snapshot_records
        if snapshot.get("address")
    }
    merged_snapshots = [
        _merge_snapshot_with_target(snapshot_map.get(target["address"].lower()), target, runtime)
        for target in targets
    ]
    merged_events = [
        _merge_event_with_target(event, address_map.get(str(event.get("address") or "").lower()))
        for event in event_records
    ]

    worker_state = _get_worker_state()
    derived_status = _summarize_status(merged_snapshots, fallback_status=status)

    return {
        "scope": scope,
        "status": derived_status,
        "error": error,
        "synced_at": synced_at,
        "latest_block": latest_block,
        "chain": runtime["chain"],
        "chain_label": runtime["chain_label"],
        "chain_id": chain_id,
        "native_symbol": runtime["native_symbol"],
        "wrapped_native_symbol": runtime["wrapped_native_symbol"],
        "poll_interval_seconds": MONITOR_POLL_INTERVAL_SECONDS,
        "target_count": len(targets),
        "tracked_token_count": len(tracked_tokens),
        "tracked_tokens": tracked_tokens,
        "targets": targets,
        "snapshots": merged_snapshots,
        "events": merged_events,
        "worker": worker_state,
    }


def _run_monitor_sync(wallet_id: str | None = None, address: str | None = None, *, limit: int, chain: str | None = None) -> dict:
    normalized_chain = _normalize_monitor_chain(chain)
    runtime = get_chain_runtime_config(normalized_chain)
    scope_data = _discover_scope(wallet_id=wallet_id, address=address)
    targets = scope_data["targets"]
    tracked_tokens = _collect_tracked_tokens(normalized_chain, scope_data["runs"])
    synced_at = _utcnow_iso()

    web3_client = get_web3(normalized_chain)
    if not web3_client or not web3_client.is_connected():
        error = f"{runtime['chain_label']} RPC is unavailable"
        if wallet_id is None and address is None:
            _set_worker_state(status="offline", latest_block=None, error=error)
        return _build_monitor_response(
            chain=normalized_chain,
            scope=scope_data["scope"],
            targets=targets,
            tracked_tokens=tracked_tokens,
            latest_block=None,
            chain_id=None,
            events_limit=limit,
            status="offline",
            synced_at=synced_at,
            error=error,
        )

    latest_block = int(web3_client.eth.block_number)
    chain_id = int(web3_client.eth.chain_id)
    token_contracts = _build_token_contracts(web3_client, tracked_tokens)
    previous_snapshots = (
        {
            str(snapshot.get("address") or "").lower(): snapshot
            for snapshot in db.list_asset_monitor_snapshots(
                addresses=[target["address"] for target in targets],
                chain=normalized_chain,
            )
        }
        if targets
        else {}
    )

    for target in targets:
        current_snapshot = _fetch_snapshot(
            web3_client,
            target,
            runtime=runtime,
            latest_block=latest_block,
            chain_id=chain_id,
            tracked_tokens=tracked_tokens,
            token_contracts=token_contracts,
        )
        previous_snapshot = previous_snapshots.get(target["address"].lower())
        db.upsert_asset_monitor_snapshot(current_snapshot)
        balance_changes = _build_balance_changes(previous_snapshot, current_snapshot)
        if balance_changes:
            event_type = "first_observed" if previous_snapshot is None else "balance_change"
            _append_snapshot_event(current_snapshot, balance_changes, event_type=event_type)

    if wallet_id is None and address is None:
        _set_worker_state(status="online", latest_block=latest_block, error=None)

    return _build_monitor_response(
        chain=normalized_chain,
        scope=scope_data["scope"],
        targets=targets,
        tracked_tokens=tracked_tokens,
        latest_block=latest_block,
        chain_id=chain_id,
        events_limit=limit,
        status="online",
        synced_at=synced_at,
    )


def get_wallet_asset_monitoring(wallet_id: str, *, sync: bool = True, limit: int = DEFAULT_EVENT_LIMIT, chain: str | None = None) -> dict:
    normalized_chain = _normalize_monitor_chain(chain)
    normalized_limit = _normalize_event_limit(limit)
    with _asset_monitor_sync_lock:
        if sync:
            return _run_monitor_sync(wallet_id=wallet_id, limit=normalized_limit, chain=normalized_chain)

        scope_data = _discover_scope(wallet_id=wallet_id)
        tracked_tokens = _collect_tracked_tokens(normalized_chain, scope_data["runs"])
        return _build_monitor_response(
            chain=normalized_chain,
            scope=scope_data["scope"],
            targets=scope_data["targets"],
            tracked_tokens=tracked_tokens,
            latest_block=_get_worker_state().get("latest_block"),
            chain_id=None,
            events_limit=normalized_limit,
            status=_get_worker_state().get("status") or "idle",
            synced_at=_get_worker_state().get("last_synced_at"),
            error=_get_worker_state().get("last_error"),
        )


def get_address_asset_monitoring(address: str, *, sync: bool = True, limit: int = DEFAULT_EVENT_LIMIT, chain: str | None = None) -> dict:
    normalized_chain = _normalize_monitor_chain(chain)
    normalized_limit = _normalize_event_limit(limit)
    with _asset_monitor_sync_lock:
        if sync:
            return _run_monitor_sync(address=address, limit=normalized_limit, chain=normalized_chain)

        scope_data = _discover_scope(address=address)
        return _build_monitor_response(
            chain=normalized_chain,
            scope=scope_data["scope"],
            targets=scope_data["targets"],
            tracked_tokens=_collect_tracked_tokens(normalized_chain, scope_data["runs"]),
            latest_block=_get_worker_state().get("latest_block"),
            chain_id=None,
            events_limit=normalized_limit,
            status=_get_worker_state().get("status") or "idle",
            synced_at=_get_worker_state().get("last_synced_at"),
            error=_get_worker_state().get("last_error"),
        )


def get_asset_monitoring_overview(*, sync: bool = False, limit: int = DEFAULT_EVENT_LIMIT, chain: str | None = None) -> dict:
    normalized_chain = _normalize_monitor_chain(chain)
    normalized_limit = _normalize_event_limit(limit)
    with _asset_monitor_sync_lock:
        if sync:
            return _run_monitor_sync(limit=normalized_limit, chain=normalized_chain)

        scope_data = _discover_scope()
        tracked_tokens = _collect_tracked_tokens(normalized_chain, scope_data["runs"])
        worker_state = _get_worker_state()
        return _build_monitor_response(
            chain=normalized_chain,
            scope=scope_data["scope"],
            targets=scope_data["targets"],
            tracked_tokens=tracked_tokens,
            latest_block=worker_state.get("latest_block"),
            chain_id=None,
            events_limit=normalized_limit,
            status=worker_state.get("status") or "idle",
            synced_at=worker_state.get("last_synced_at"),
            error=worker_state.get("last_error"),
        )


def _asset_monitor_worker_loop():
    while not _asset_monitor_stop_event.is_set():
        try:
            web3_client = get_web3()
            if not web3_client or not web3_client.is_connected():
                _set_worker_state(status="offline", latest_block=None, error="Ethereum RPC is unavailable")
            else:
                latest_block = int(web3_client.eth.block_number)
                previous_state = _get_worker_state()
                if latest_block != previous_state.get("latest_block") or previous_state.get("status") != "online":
                    with _asset_monitor_sync_lock:
                        _run_monitor_sync(limit=0)
                    try:
                        from src.services.balance_rule_service import evaluate_balance_rules

                        evaluate_balance_rules(sync_monitoring=False)
                    except Exception as exc:
                        _set_worker_state(
                            status="error",
                            latest_block=latest_block,
                            error=f"Balance-rule automation failed: {exc}",
                        )
        except Exception as exc:
            _set_worker_state(status="error", latest_block=_get_worker_state().get("latest_block"), error=str(exc))

        _asset_monitor_stop_event.wait(MONITOR_POLL_INTERVAL_SECONDS)


def start_asset_monitoring_worker():
    global _asset_monitor_thread

    with _asset_monitor_thread_lock:
        if _asset_monitor_thread and _asset_monitor_thread.is_alive():
            return

        _asset_monitor_stop_event.clear()
        _asset_monitor_thread = threading.Thread(
            target=_asset_monitor_worker_loop,
            name="asset-monitor-worker",
            daemon=True,
        )
        _asset_monitor_thread.start()


def stop_asset_monitoring_worker():
    global _asset_monitor_thread

    with _asset_monitor_thread_lock:
        _asset_monitor_stop_event.set()
        if _asset_monitor_thread and _asset_monitor_thread.is_alive():
            _asset_monitor_thread.join(timeout=max(MONITOR_POLL_INTERVAL_SECONDS, 5))
        _asset_monitor_thread = None
