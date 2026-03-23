from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import threading
from uuid import uuid4

from web3 import Web3

from src.config.database import db
from src.services.wallet_service import (
    ETH_TRANSFER_GAS_LIMIT,
    decimal_to_wei,
    format_decimal,
    get_wallet,
    get_wallet_record,
    get_web3,
    transfer_native_eth_from_wallet,
    wei_to_decimal,
)


SUPPORTED_ASSET_SYMBOL = "ETH"
ADDRESS_ROLE_VALUES = {"main", "sub", "contract"}
MODE_VALUES = {"monitor_only", "alert_only", "auto_top_up"}
ROOT_WALLET_TYPES = {"main", "imported_private_key"}
DEFAULT_COOLDOWN_SECONDS = 900
MAX_EVENT_LIMIT = 200
DAILY_CAP_EVENT_SCAN_LIMIT = 1000
_EVALUATION_LOCK = threading.Lock()
_UNSET = object()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _utcnow_iso() -> str:
    return _utcnow().isoformat()


def _parse_iso_datetime(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value))
        except ValueError:
            return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_decimal(value, field_name: str, *, allow_zero: bool = True) -> Decimal:
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise ValueError(f"Invalid {field_name}")

    if parsed < 0 or (not allow_zero and parsed <= 0):
        comparator = "greater than 0" if not allow_zero else "0 or greater"
        raise ValueError(f"{field_name} must be {comparator}")
    return parsed


def _parse_optional_decimal(value, field_name: str) -> Decimal | None:
    if value in (None, ""):
        return None
    return _parse_decimal(value, field_name, allow_zero=False)


def _normalize_limit(limit: int | None) -> int:
    try:
        normalized = int(limit or MAX_EVENT_LIMIT)
    except (TypeError, ValueError):
        normalized = MAX_EVENT_LIMIT
    return max(0, min(normalized, MAX_EVENT_LIMIT))


def _short_address(address: str | None) -> str:
    if not address:
        return "Unknown"
    return f"{address[:6]}...{address[-4:]}"


def _event_amount_decimal(event: dict) -> Decimal:
    details = event.get("details") or {}
    amount = details.get("amount")
    if amount in (None, ""):
        return Decimal("0")
    try:
        return Decimal(str(amount))
    except (InvalidOperation, TypeError):
        return Decimal("0")


def _resolve_target_address(rule: dict) -> str:
    address = rule.get("target_address")
    if not address or not Web3.is_address(address):
        raise ValueError("Rule target address is invalid")
    return Web3.to_checksum_address(address)


def _resolve_source_wallet(rule: dict) -> dict:
    source_wallet_id = str(rule.get("source_wallet_id") or "").strip()
    if not source_wallet_id:
        raise ValueError("source_wallet_id is required for auto top-up rules")

    wallet = get_wallet(source_wallet_id)
    if not wallet:
        raise ValueError("Source wallet not found")
    if wallet.get("type") not in ROOT_WALLET_TYPES:
        raise ValueError("source_wallet_id must reference a main or imported private-key wallet")
    return wallet


def _has_pending_transactions(web3_client: Web3, address: str) -> bool:
    checksum_address = Web3.to_checksum_address(address)
    latest_nonce = int(web3_client.eth.get_transaction_count(checksum_address, "latest"))
    pending_nonce = int(web3_client.eth.get_transaction_count(checksum_address, "pending"))
    return pending_nonce > latest_nonce


def _is_signal_cooldown_active(rule: dict, now: datetime) -> bool:
    cooldown_seconds = max(int(rule.get("cooldown_seconds") or 0), 0)
    if cooldown_seconds <= 0:
        return False
    last_triggered_at = _parse_iso_datetime(rule.get("last_triggered_at"))
    if not last_triggered_at:
        return False
    return (now - last_triggered_at).total_seconds() < cooldown_seconds


def _today_confirmed_top_up_total(rule_id: str, now: datetime) -> Decimal:
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    total = Decimal("0")
    for event in db.list_balance_rule_events(rule_id=rule_id, limit=DAILY_CAP_EVENT_SCAN_LIMIT):
        observed_at = _parse_iso_datetime(event.get("observed_at"))
        if not observed_at:
            continue
        if observed_at < day_start:
            continue
        if event.get("event_type") != "auto_top_up_confirmed":
            continue
        total += _event_amount_decimal(event)
    return total


def _append_rule_event(
    rule: dict,
    *,
    event_type: str,
    status: str,
    message: str,
    tx_hash: str | None = None,
    details: dict | None = None,
):
    return db.append_balance_rule_event(
        {
            "id": uuid4().hex,
            "rule_id": rule["id"],
            "observed_at": _utcnow_iso(),
            "event_type": event_type,
            "status": status,
            "message": message,
            "rule_name": rule.get("name"),
            "mode": rule.get("mode"),
            "address_role": rule.get("address_role"),
            "asset_symbol": rule.get("asset_symbol"),
            "target_wallet_id": rule.get("target_wallet_id"),
            "target_address": rule.get("target_address"),
            "source_wallet_id": rule.get("source_wallet_id"),
            "source_address": rule.get("source_address"),
            "tx_hash": tx_hash,
            "details": details or {},
        }
    )


def _save_rule_state(
    rule: dict,
    *,
    last_evaluated_at=_UNSET,
    last_triggered_at=_UNSET,
    last_action_at=_UNSET,
    last_result=_UNSET,
    last_error=_UNSET,
    last_tx_hash=_UNSET,
    last_observed_balance=_UNSET,
):
    updated_rule = dict(rule)
    for key, value in (
        ("last_evaluated_at", last_evaluated_at),
        ("last_triggered_at", last_triggered_at),
        ("last_action_at", last_action_at),
        ("last_result", last_result),
        ("last_error", last_error),
        ("last_tx_hash", last_tx_hash),
        ("last_observed_balance", last_observed_balance),
    ):
        if value is not _UNSET:
            updated_rule[key] = value
    updated_rule["updated_at"] = _utcnow_iso()
    return db.upsert_balance_rule(updated_rule)


def _build_default_rule_name(address_role: str, target_address: str, mode: str) -> str:
    role_label = {
        "main": "Main wallet",
        "sub": "Sub-wallet",
        "contract": "Contract",
    }.get(address_role, "Address")
    mode_label = {
        "monitor_only": "monitor",
        "alert_only": "alert",
        "auto_top_up": "auto top-up",
    }.get(mode, mode)
    return f"{role_label} {_short_address(target_address)} {mode_label}"


def _normalize_rule_payload(payload: dict, *, existing: dict | None = None) -> dict:
    existing = existing or {}
    address_role = str(payload.get("address_role", existing.get("address_role", "")) or "").strip().lower()
    if address_role not in ADDRESS_ROLE_VALUES:
        raise ValueError("address_role must be one of: main, sub, contract")

    mode = str(payload.get("mode", existing.get("mode", "monitor_only")) or "").strip().lower()
    if mode not in MODE_VALUES:
        raise ValueError("mode must be one of: monitor_only, alert_only, auto_top_up")

    asset_symbol = str(payload.get("asset_symbol", existing.get("asset_symbol", SUPPORTED_ASSET_SYMBOL)) or "").strip().upper()
    if asset_symbol != SUPPORTED_ASSET_SYMBOL:
        raise ValueError("Only ETH minimum-balance rules are supported in this version")

    enabled = bool(payload.get("enabled", existing.get("enabled", True)))
    min_balance = _parse_decimal(payload.get("min_balance", existing.get("min_balance", "0")), "min_balance")

    raw_target_balance = payload.get("target_balance", existing.get("target_balance"))
    target_balance = min_balance if raw_target_balance in (None, "") else _parse_decimal(raw_target_balance, "target_balance")
    if target_balance < min_balance:
        raise ValueError("target_balance must be greater than or equal to min_balance")

    try:
        cooldown_seconds = int(payload.get("cooldown_seconds", existing.get("cooldown_seconds", DEFAULT_COOLDOWN_SECONDS)))
    except (TypeError, ValueError):
        raise ValueError("Invalid cooldown_seconds")
    if cooldown_seconds < 0:
        raise ValueError("cooldown_seconds must be 0 or greater")

    max_top_up_amount = _parse_optional_decimal(
        payload.get("max_top_up_amount", existing.get("max_top_up_amount")),
        "max_top_up_amount",
    )
    daily_top_up_cap = _parse_optional_decimal(
        payload.get("daily_top_up_cap", existing.get("daily_top_up_cap")),
        "daily_top_up_cap",
    )
    source_min_reserve = _parse_decimal(
        payload.get("source_min_reserve", existing.get("source_min_reserve", "0")),
        "source_min_reserve",
    )
    pending_tx_lock = bool(payload.get("pending_tx_lock", existing.get("pending_tx_lock", True)))

    target_wallet_id = str(payload.get("target_wallet_id", existing.get("target_wallet_id", "")) or "").strip() or None
    raw_target_address = str(payload.get("target_address", existing.get("target_address", "")) or "").strip() or None
    target_address = None

    if address_role == "contract":
        if not raw_target_address:
            raise ValueError("target_address is required for contract rules")
        if not Web3.is_address(raw_target_address):
            raise ValueError("target_address must be a valid Ethereum address")
        target_address = Web3.to_checksum_address(raw_target_address)
        target_wallet_id = None
    else:
        if not target_wallet_id:
            raise ValueError("target_wallet_id is required for main and sub wallet rules")
        target_wallet = get_wallet_record(target_wallet_id)
        if not target_wallet:
            raise ValueError("Target wallet not found")
        if address_role == "main" and target_wallet.get("type") not in ROOT_WALLET_TYPES:
            raise ValueError("target_wallet_id must reference a main or imported private-key wallet")
        if address_role == "sub" and target_wallet.get("type") != "sub":
            raise ValueError("target_wallet_id must reference a sub-wallet")
        target_address = Web3.to_checksum_address(target_wallet["address"])

    source_wallet_id = str(payload.get("source_wallet_id", existing.get("source_wallet_id", "")) or "").strip() or None
    source_address = None
    if source_wallet_id:
        source_wallet = get_wallet_record(source_wallet_id)
        if not source_wallet:
            raise ValueError("Source wallet not found")
        if source_wallet.get("type") not in ROOT_WALLET_TYPES:
            raise ValueError("source_wallet_id must reference a main or imported private-key wallet")
        source_address = Web3.to_checksum_address(source_wallet["address"])

    if mode == "auto_top_up":
        if address_role != "sub":
            raise ValueError("auto_top_up mode is only supported for sub-wallet rules")
        if not source_wallet_id:
            raise ValueError("source_wallet_id is required when mode is auto_top_up")
        if source_wallet_id == target_wallet_id or source_address == target_address:
            raise ValueError("source_wallet_id must be different from the target sub-wallet")
        if target_balance <= min_balance or target_balance <= 0:
            raise ValueError("target_balance must be greater than min_balance when mode is auto_top_up")
    else:
        source_wallet_id = None
        source_address = None
        source_min_reserve = Decimal("0")
        max_top_up_amount = None
        daily_top_up_cap = None

    name = str(payload.get("name", existing.get("name", "")) or "").strip() or _build_default_rule_name(
        address_role,
        target_address,
        mode,
    )
    notes_value = payload.get("notes", existing.get("notes"))
    notes = str(notes_value).strip() if notes_value is not None else None
    if notes == "":
        notes = None

    return {
        "id": existing.get("id") or payload.get("id") or uuid4().hex,
        "name": name,
        "enabled": enabled,
        "asset_symbol": asset_symbol,
        "address_role": address_role,
        "mode": mode,
        "target_wallet_id": target_wallet_id,
        "target_address": target_address,
        "source_wallet_id": source_wallet_id,
        "source_address": source_address,
        "min_balance": format_decimal(min_balance),
        "target_balance": format_decimal(target_balance),
        "source_min_reserve": format_decimal(source_min_reserve),
        "cooldown_seconds": cooldown_seconds,
        "max_top_up_amount": format_decimal(max_top_up_amount) if max_top_up_amount is not None else None,
        "daily_top_up_cap": format_decimal(daily_top_up_cap) if daily_top_up_cap is not None else None,
        "pending_tx_lock": pending_tx_lock,
        "notes": notes,
        "created_at": existing.get("created_at") or _utcnow_iso(),
        "updated_at": _utcnow_iso(),
        "last_evaluated_at": existing.get("last_evaluated_at"),
        "last_triggered_at": existing.get("last_triggered_at"),
        "last_action_at": existing.get("last_action_at"),
        "last_result": existing.get("last_result"),
        "last_error": existing.get("last_error"),
        "last_tx_hash": existing.get("last_tx_hash"),
        "last_observed_balance": existing.get("last_observed_balance"),
    }


def _decorate_rule(rule: dict) -> dict:
    decorated = dict(rule)
    decorated["cooldown_active"] = _is_signal_cooldown_active(rule, _utcnow())
    return decorated


def list_balance_rules():
    return [_decorate_rule(rule) for rule in db.list_balance_rules()]


def get_balance_rule(rule_id: str):
    rule = db.get_balance_rule(rule_id)
    return _decorate_rule(rule) if rule else None


def create_balance_rule(payload: dict):
    normalized_rule = _normalize_rule_payload(payload)
    return _decorate_rule(db.upsert_balance_rule(normalized_rule))


def update_balance_rule(rule_id: str, payload: dict):
    existing = db.get_balance_rule(rule_id)
    if not existing:
        raise ValueError("Balance rule not found")
    normalized_rule = _normalize_rule_payload(payload, existing=existing)
    normalized_rule["id"] = rule_id
    normalized_rule["created_at"] = existing.get("created_at") or normalized_rule["created_at"]
    return _decorate_rule(db.upsert_balance_rule(normalized_rule))


def delete_balance_rule(rule_id: str):
    deleted = db.delete_balance_rule(rule_id)
    if not deleted:
        raise ValueError("Balance rule not found")
    return {
        "id": rule_id,
        "deleted": True,
    }


def list_balance_rule_events(rule_id: str | None = None, *, limit: int = MAX_EVENT_LIMIT):
    return db.list_balance_rule_events(rule_id=rule_id, limit=_normalize_limit(limit))


def list_enabled_balance_rule_targets() -> list[dict]:
    targets = []
    for rule in db.list_balance_rules():
        if not rule.get("enabled"):
            continue
        address = rule.get("target_address")
        if not address or not Web3.is_address(address):
            continue
        targets.append(
            {
                "rule_id": rule["id"],
                "name": rule.get("name"),
                "address": Web3.to_checksum_address(address),
                "address_role": rule.get("address_role"),
                "target_wallet_id": rule.get("target_wallet_id"),
                "mode": rule.get("mode"),
            }
        )
    return targets


def _evaluate_balance_rule(rule: dict, web3_client: Web3, now: datetime) -> dict:
    target_address = _resolve_target_address(rule)
    min_balance = Decimal(str(rule.get("min_balance") or "0"))
    target_balance = Decimal(str(rule.get("target_balance") or rule.get("min_balance") or "0"))
    current_balance = wei_to_decimal(int(web3_client.eth.get_balance(target_address)))
    current_balance_text = format_decimal(current_balance)
    updated_rule = _save_rule_state(
        rule,
        last_evaluated_at=now.isoformat(),
        last_observed_balance=current_balance_text,
        last_error=None,
    )

    if current_balance > min_balance:
        _save_rule_state(
            updated_rule,
            last_result="healthy",
            last_error=None,
        )
        return {
            "rule_id": rule["id"],
            "name": rule.get("name"),
            "status": "healthy",
            "mode": rule.get("mode"),
            "address_role": rule.get("address_role"),
            "target_address": target_address,
            "current_balance": current_balance_text,
            "message": f"Balance is above the configured minimum for {_short_address(target_address)}.",
            "tx_hash": None,
        }

    cooldown_active = _is_signal_cooldown_active(updated_rule, now)
    if rule.get("mode") in {"monitor_only", "alert_only"}:
        result_status = "low_balance_alert" if rule.get("mode") == "alert_only" else "low_balance_observed"
        if not cooldown_active:
            _append_rule_event(
                updated_rule,
                event_type=result_status,
                status="warning" if rule.get("mode") == "alert_only" else "observed",
                message=(
                    f"{rule.get('name')}: {current_balance_text} ETH is at or below the configured "
                    f"minimum of {rule.get('min_balance')} ETH."
                ),
                details={
                    "current_balance": current_balance_text,
                    "min_balance": rule.get("min_balance"),
                    "target_balance": rule.get("target_balance"),
                },
            )
            updated_rule = _save_rule_state(
                updated_rule,
                last_triggered_at=now.isoformat(),
                last_result=result_status,
                last_error=None,
            )
        else:
            updated_rule = _save_rule_state(
                updated_rule,
                last_result="low_balance_suppressed",
                last_error=None,
            )
        return {
            "rule_id": rule["id"],
            "name": rule.get("name"),
            "status": updated_rule.get("last_result"),
            "mode": rule.get("mode"),
            "address_role": rule.get("address_role"),
            "target_address": target_address,
            "current_balance": current_balance_text,
            "message": (
                f"{rule.get('name')}: {current_balance_text} ETH is at or below the configured "
                f"minimum of {rule.get('min_balance')} ETH."
            ),
            "tx_hash": None,
        }

    if cooldown_active:
        _save_rule_state(
            updated_rule,
            last_result="skipped_cooldown",
            last_error=None,
        )
        return {
            "rule_id": rule["id"],
            "name": rule.get("name"),
            "status": "skipped_cooldown",
            "mode": rule.get("mode"),
            "address_role": rule.get("address_role"),
            "target_address": target_address,
            "current_balance": current_balance_text,
            "message": f"{rule.get('name')}: cooldown is still active, so no top-up was attempted.",
            "tx_hash": None,
        }

    source_wallet = _resolve_source_wallet(rule)
    if bool(rule.get("pending_tx_lock", True)):
        if _has_pending_transactions(web3_client, source_wallet["address"]) or _has_pending_transactions(web3_client, target_address):
            _append_rule_event(
                updated_rule,
                event_type="auto_top_up_pending_locked",
                status="skipped",
                message=f"{rule.get('name')}: pending transactions were detected, so auto top-up was skipped.",
                details={
                    "current_balance": current_balance_text,
                    "min_balance": rule.get("min_balance"),
                    "target_balance": rule.get("target_balance"),
                },
            )
            _save_rule_state(
                updated_rule,
                last_triggered_at=now.isoformat(),
                last_result="skipped_pending_tx",
                last_error=None,
            )
            return {
                "rule_id": rule["id"],
                "name": rule.get("name"),
                "status": "skipped_pending_tx",
                "mode": rule.get("mode"),
                "address_role": rule.get("address_role"),
                "target_address": target_address,
                "current_balance": current_balance_text,
                "message": f"{rule.get('name')}: pending transactions were detected, so auto top-up was skipped.",
                "tx_hash": None,
            }

    top_up_amount = target_balance - current_balance
    max_top_up_amount = Decimal(str(rule.get("max_top_up_amount"))) if rule.get("max_top_up_amount") not in (None, "") else None
    if max_top_up_amount is not None and top_up_amount > max_top_up_amount:
        _append_rule_event(
            updated_rule,
            event_type="auto_top_up_cap_exceeded",
            status="skipped",
            message=(
                f"{rule.get('name')}: required refill of {format_decimal(top_up_amount)} ETH exceeds the per-top-up cap "
                f"of {rule.get('max_top_up_amount')} ETH."
            ),
            details={
                "current_balance": current_balance_text,
                "top_up_amount": format_decimal(top_up_amount),
                "max_top_up_amount": rule.get("max_top_up_amount"),
            },
        )
        _save_rule_state(
            updated_rule,
            last_triggered_at=now.isoformat(),
            last_result="skipped_max_top_up_amount",
            last_error=None,
        )
        return {
            "rule_id": rule["id"],
            "name": rule.get("name"),
            "status": "skipped_max_top_up_amount",
            "mode": rule.get("mode"),
            "address_role": rule.get("address_role"),
            "target_address": target_address,
            "current_balance": current_balance_text,
            "message": f"{rule.get('name')}: the required refill exceeds the per-top-up cap.",
            "tx_hash": None,
        }

    daily_top_up_cap = Decimal(str(rule.get("daily_top_up_cap"))) if rule.get("daily_top_up_cap") not in (None, "") else None
    if daily_top_up_cap is not None:
        used_today = _today_confirmed_top_up_total(rule["id"], now)
        if used_today + top_up_amount > daily_top_up_cap:
            _append_rule_event(
                updated_rule,
                event_type="auto_top_up_daily_cap_reached",
                status="skipped",
                message=(
                    f"{rule.get('name')}: topping up {format_decimal(top_up_amount)} ETH would exceed the daily cap "
                    f"of {rule.get('daily_top_up_cap')} ETH."
                ),
                details={
                    "current_balance": current_balance_text,
                    "top_up_amount": format_decimal(top_up_amount),
                    "daily_top_up_cap": rule.get("daily_top_up_cap"),
                    "used_today": format_decimal(used_today),
                },
            )
            _save_rule_state(
                updated_rule,
                last_triggered_at=now.isoformat(),
                last_result="skipped_daily_cap",
                last_error=None,
            )
            return {
                "rule_id": rule["id"],
                "name": rule.get("name"),
                "status": "skipped_daily_cap",
                "mode": rule.get("mode"),
                "address_role": rule.get("address_role"),
                "target_address": target_address,
                "current_balance": current_balance_text,
                "message": f"{rule.get('name')}: the daily top-up cap would be exceeded.",
                "tx_hash": None,
            }

    gas_price_wei = int(web3_client.eth.gas_price)
    network_fee_eth = wei_to_decimal(gas_price_wei * ETH_TRANSFER_GAS_LIMIT)
    source_min_reserve = Decimal(str(rule.get("source_min_reserve") or "0"))
    source_balance = wei_to_decimal(int(web3_client.eth.get_balance(Web3.to_checksum_address(source_wallet["address"]))))
    minimum_required_source_balance = source_min_reserve + top_up_amount + network_fee_eth
    if source_balance < minimum_required_source_balance:
        _append_rule_event(
            updated_rule,
            event_type="auto_top_up_source_reserve_blocked",
            status="skipped",
            message=(
                f"{rule.get('name')}: auto top-up was skipped because the source wallet would fall below its reserve."
            ),
            details={
                "current_balance": current_balance_text,
                "top_up_amount": format_decimal(top_up_amount),
                "source_balance": format_decimal(source_balance),
                "source_min_reserve": rule.get("source_min_reserve"),
                "network_fee_eth": format_decimal(network_fee_eth),
            },
        )
        _save_rule_state(
            updated_rule,
            last_triggered_at=now.isoformat(),
            last_result="skipped_source_reserve",
            last_error=None,
        )
        return {
            "rule_id": rule["id"],
            "name": rule.get("name"),
            "status": "skipped_source_reserve",
            "mode": rule.get("mode"),
            "address_role": rule.get("address_role"),
            "target_address": target_address,
            "current_balance": current_balance_text,
            "message": f"{rule.get('name')}: the source wallet reserve would be violated, so no top-up was attempted.",
            "tx_hash": None,
        }

    try:
        transfer_result = transfer_native_eth_from_wallet(
            web3_client,
            wallet_address=source_wallet["address"],
            private_key=source_wallet["private_key"],
            recipient_address=target_address,
            amount_wei=decimal_to_wei(top_up_amount),
            nonce=web3_client.eth.get_transaction_count(Web3.to_checksum_address(source_wallet["address"]), "pending"),
            gas_price_wei=gas_price_wei,
        )
        updated_balance = wei_to_decimal(int(web3_client.eth.get_balance(target_address)))
        _append_rule_event(
            updated_rule,
            event_type="auto_top_up_confirmed",
            status="confirmed",
            message=(
                f"{rule.get('name')}: topped up {_short_address(target_address)} by {format_decimal(top_up_amount)} ETH."
            ),
            tx_hash=transfer_result.get("tx_hash"),
            details={
                "amount": format_decimal(top_up_amount),
                "current_balance_before": current_balance_text,
                "balance_after": format_decimal(updated_balance),
                "min_balance": rule.get("min_balance"),
                "target_balance": rule.get("target_balance"),
                "source_wallet_id": rule.get("source_wallet_id"),
                "source_address": source_wallet["address"],
            },
        )
        _save_rule_state(
            updated_rule,
            last_triggered_at=now.isoformat(),
            last_action_at=now.isoformat(),
            last_result="auto_top_up_confirmed",
            last_error=None,
            last_tx_hash=transfer_result.get("tx_hash"),
            last_observed_balance=format_decimal(updated_balance),
        )
        return {
            "rule_id": rule["id"],
            "name": rule.get("name"),
            "status": "auto_top_up_confirmed",
            "mode": rule.get("mode"),
            "address_role": rule.get("address_role"),
            "target_address": target_address,
            "current_balance": current_balance_text,
            "balance_after": format_decimal(updated_balance),
            "message": f"{rule.get('name')}: auto top-up completed successfully.",
            "tx_hash": transfer_result.get("tx_hash"),
        }
    except Exception as exc:
        _append_rule_event(
            updated_rule,
            event_type="auto_top_up_failed",
            status="failed",
            message=f"{rule.get('name')}: auto top-up failed: {exc}",
            details={
                "amount": format_decimal(top_up_amount),
                "current_balance_before": current_balance_text,
                "min_balance": rule.get("min_balance"),
                "target_balance": rule.get("target_balance"),
                "source_wallet_id": rule.get("source_wallet_id"),
                "source_address": rule.get("source_address"),
            },
        )
        _save_rule_state(
            updated_rule,
            last_triggered_at=now.isoformat(),
            last_result="auto_top_up_failed",
            last_error=str(exc),
        )
        return {
            "rule_id": rule["id"],
            "name": rule.get("name"),
            "status": "auto_top_up_failed",
            "mode": rule.get("mode"),
            "address_role": rule.get("address_role"),
            "target_address": target_address,
            "current_balance": current_balance_text,
            "message": f"{rule.get('name')}: auto top-up failed: {exc}",
            "tx_hash": None,
        }


def evaluate_balance_rules(*, sync_monitoring: bool = False) -> dict:
    if sync_monitoring:
        from src.services.monitor_service import get_asset_monitoring_overview

        get_asset_monitoring_overview(sync=True, limit=0)

    enabled_rules = [rule for rule in db.list_balance_rules() if rule.get("enabled")]
    if not enabled_rules:
        return {
            "evaluated_count": 0,
            "healthy_count": 0,
            "low_balance_count": 0,
            "top_up_success_count": 0,
            "top_up_failure_count": 0,
            "skipped_count": 0,
            "results": [],
        }

    web3_client = get_web3()
    if not web3_client or not web3_client.is_connected():
        raise RuntimeError("Ethereum RPC is unavailable")

    now = _utcnow()
    results = []
    with _EVALUATION_LOCK:
        for rule in enabled_rules:
            try:
                results.append(_evaluate_balance_rule(rule, web3_client, now))
            except Exception as exc:
                _save_rule_state(
                    rule,
                    last_evaluated_at=now.isoformat(),
                    last_result="evaluation_error",
                    last_error=str(exc),
                )
                _append_rule_event(
                    rule,
                    event_type="evaluation_error",
                    status="failed",
                    message=f"{rule.get('name')}: balance-rule evaluation failed: {exc}",
                )
                results.append(
                    {
                        "rule_id": rule["id"],
                        "name": rule.get("name"),
                        "status": "evaluation_error",
                        "mode": rule.get("mode"),
                        "address_role": rule.get("address_role"),
                        "target_address": rule.get("target_address"),
                        "current_balance": rule.get("last_observed_balance"),
                        "message": f"{rule.get('name')}: balance-rule evaluation failed: {exc}",
                        "tx_hash": None,
                    }
                )

    return {
        "evaluated_count": len(results),
        "healthy_count": sum(1 for result in results if result["status"] == "healthy"),
        "low_balance_count": sum(1 for result in results if "low_balance" in result["status"]),
        "top_up_success_count": sum(1 for result in results if result["status"] == "auto_top_up_confirmed"),
        "top_up_failure_count": sum(1 for result in results if result["status"] == "auto_top_up_failed"),
        "skipped_count": sum(1 for result in results if result["status"].startswith("skipped_")),
        "results": results,
    }
