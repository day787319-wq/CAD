import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from web3 import Web3

from src.config.database import db
from src.services.contract_service import (
    build_registry_sync_preview,
    get_registry_integration_status,
)
from src.services.market_service import get_market_snapshot
from src.services.template_chain_config import (
    DEFAULT_TEMPLATE_CHAIN,
    ETHEREUM_SWAP_TOKENS,
    TEMPLATE_CHAIN_ARBITRUM,
    TEMPLATE_CHAIN_AVALANCHE,
    TEMPLATE_CHAIN_BASE,
    TEMPLATE_CHAIN_BNB,
    TEMPLATE_CHAIN_ETHEREUM,
    TEMPLATE_CHAIN_OPTIMISM,
    TEMPLATE_CHAIN_POLYGON,
    TEMPLATE_CHAIN_TOKEN_BY_ADDRESS,
    TEMPLATE_CHAIN_TOKEN_BY_SYMBOL,
    TEMPLATE_CHAIN_XLAYER,
    get_swap_backend_label,
    get_template_chain_choices,
    get_template_chain_config,
    get_template_chain_swap_backends,
    get_template_chain_token,
    get_template_chain_tokens,
    is_wrapped_native_template_token,
    normalize_template_chain,
)
from src.services.wallet_service import (
    CONTRACT_NATIVE_ETH_TRANSFER_GAS_LIMIT,
    ERC20_APPROVE_GAS_LIMIT,
    ERC20_TRANSFER_GAS_LIMIT,
    ETH_TRANSFER_GAS_LIMIT,
    LEGACY_GAS_STAGE_APPROVAL,
    LEGACY_GAS_STAGE_BATCH_SEND,
    LEGACY_GAS_STAGE_DEPLOY_TREASURY,
    LEGACY_GAS_STAGE_FUND_SUBWALLET,
    LEGACY_GAS_STAGE_FUND_TREASURY,
    LEGACY_GAS_STAGE_RETURN_SWEEP,
    LEGACY_GAS_STAGE_SWAP,
    LEGACY_GAS_STAGE_TOP_UP,
    LEGACY_GAS_STAGE_WRAP,
    MANAGED_TOKEN_DISTRIBUTOR_DEPLOY_GAS_LIMIT,
    MANAGED_TOKEN_DISTRIBUTOR_EXECUTE_GAS_LIMIT,
    UNISWAP_V3_SWAP_GAS_LIMIT,
    WETH_DEPOSIT_GAS_LIMIT,
    estimate_legacy_aggressive_multi_stage_fee_eth,
    estimate_legacy_aggressive_stage_fee_eth,
    resolve_legacy_aggressive_gas_pricing,
    format_decimal as format_wallet_decimal,
    get_web3,
    quote_uniswap_swap,
    resolve_token,
    wei_to_decimal,
)


DEFAULT_TEMPLATE_SOURCE = "library"
TEMPLATE_VERSION_V2 = "v2"
MAX_TEMPLATE_PREVIEW_COUNT = 100
UNISWAP_FEE_TIERS = [500, 3000, 10000]

CURATED_USD_STABLECOINS = ETHEREUM_SWAP_TOKENS
CURATED_USD_STABLECOIN_BY_ADDRESS = TEMPLATE_CHAIN_TOKEN_BY_ADDRESS[TEMPLATE_CHAIN_ETHEREUM]
CURATED_USD_STABLECOIN_BY_SYMBOL = TEMPLATE_CHAIN_TOKEN_BY_SYMBOL[TEMPLATE_CHAIN_ETHEREUM]
DISTRIBUTION_MODE_VALUES = {"none", "equal", "manual_percent", "manual_weth_amount"}
ROUTE_STATUS_NO_ROUTE_FOUND = "No route found"
ROUTE_CHECK_PROBE_WETH_AMOUNT = Decimal("0.001")


def _format_decimal(value: Decimal | None):
    if value is None:
        return None
    if value == 0:
        return "0"
    return format(value.normalize(), "f")


def _normalize_route_status(value) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def _normalize_route_error_message(message: str | None) -> str | None:
    normalized = str(message or "").strip()
    if not normalized:
        return None
    if "no swap route found" in normalized.casefold():
        return ROUTE_STATUS_NO_ROUTE_FOUND
    return normalized


def _normalize_preview_error_message(message: str | None) -> str | None:
    normalized = str(message or "").strip()
    if not normalized:
        return None
    if normalized.casefold() == "internal server error":
        return None
    return normalized


def _dedupe_preview_details(values) -> list[str]:
    unique_values: list[str] = []
    seen_values: set[str] = set()
    for value in values or []:
        normalized = str(value or "").strip()
        if not normalized or normalized in seen_values:
            continue
        seen_values.add(normalized)
        unique_values.append(normalized)
    return unique_values


def _build_template_preview_issue(
    code: str,
    title: str,
    summary: str,
    *,
    details: list[str] | None = None,
    hint: str | None = None,
    context: dict | None = None,
) -> dict:
    return {
        "code": str(code or "preview_failed"),
        "title": str(title or "Automation check failed"),
        "summary": str(summary or "The automation check failed before it could finish."),
        "details": _dedupe_preview_details(details or []),
        "hint": str(hint).strip() if str(hint or "").strip() else None,
        "context": context or None,
    }


def build_template_preview_error_payload(exc: Exception) -> dict:
    message = _normalize_preview_error_message(str(exc))
    normalized_route_message = _normalize_route_error_message(message)
    lowered = (normalized_route_message or "").casefold()

    if "rpc is unavailable" in lowered:
        return _build_template_preview_issue(
            "rpc_unavailable",
            "Chain RPC unavailable",
            normalized_route_message or "The selected chain RPC is unavailable.",
            details=[normalized_route_message] if normalized_route_message else [],
            hint="Retry the automation check after the node recovers. Do not treat this as a permanent no-route result.",
        )

    if "live wallet balances are unavailable" in lowered:
        return _build_template_preview_issue(
            "live_balances_unavailable",
            "Live wallet balances unavailable",
            normalized_route_message or "The backend could not refresh the live main wallet balances for this preview.",
            details=[normalized_route_message] if normalized_route_message else [],
            hint="Refresh the wallet on the selected chain and make sure the chain RPC is healthy before trying again.",
        )

    if "wallet not found" in lowered:
        return _build_template_preview_issue(
            "wallet_not_found",
            "Main wallet not found",
            "The selected main wallet is no longer available to the preview check.",
            details=[normalized_route_message] if normalized_route_message else [],
            hint="Reload the page, reselect the main wallet, and try the automation check again.",
        )

    if "template not found" in lowered:
        return _build_template_preview_issue(
            "template_not_found",
            "Template not found",
            "The selected template is no longer available to the automation check.",
            details=[normalized_route_message] if normalized_route_message else [],
            hint="Reload the template list, select a valid template, and try again.",
        )

    if "select a main wallet" in lowered:
        return _build_template_preview_issue(
            "main_wallet_required",
            "Main wallet required",
            "This automation check can only run from a main wallet.",
            details=[normalized_route_message] if normalized_route_message else [],
            hint="Go back and choose the main wallet instead of one of its subwallets.",
        )

    if "contract_count must be between" in lowered:
        return _build_template_preview_issue(
            "invalid_contract_count",
            "Invalid subwallet count",
            normalized_route_message or "The selected subwallet count is outside the supported range.",
            details=[normalized_route_message] if normalized_route_message else [],
            hint="Use a subwallet count between 1 and 100, then run the check again.",
        )

    if "testing_recipient_address is required" in lowered or "recipient_address is required" in lowered:
        return _build_template_preview_issue(
            "missing_recipient",
            "Recipient address required",
            normalized_route_message or "This template needs a recipient address before automation can continue.",
            details=[normalized_route_message] if normalized_route_message else [],
            hint="Open the template, set the recipient address, and rerun the automation check.",
        )

    if ROUTE_STATUS_NO_ROUTE_FOUND.casefold() in lowered or "no swap route found" in lowered:
        return _build_template_preview_issue(
            "route_unavailable",
            "Token route unavailable",
            normalized_route_message or "One or more funded token routes do not currently have a live swap route.",
            details=[normalized_route_message] if normalized_route_message else [],
            hint="Recheck the affected token, remove it from the funded list, or wait for routing support to recover.",
        )

    fallback_summary = (
        message
        or "The automation check failed before the app could finish validating balances, routes, and funding."
    )
    fallback_details = [message] if message else ["The backend did not return any additional error details for this preview failure."]
    return _build_template_preview_issue(
        "preview_failed",
        "Automation check failed",
        fallback_summary,
        details=fallback_details,
        hint="Retry the automation check. If this keeps failing, inspect the chain RPC, wallet balances, recipient settings, and funded token routes.",
    )


def _build_allocation_route_metadata(
    route_status: str | None = None,
    route_error: str | None = None,
) -> dict:
    normalized_status = _normalize_route_status(route_status)
    normalized_error = _normalize_route_error_message(route_error)
    if normalized_error == ROUTE_STATUS_NO_ROUTE_FOUND:
        normalized_status = ROUTE_STATUS_NO_ROUTE_FOUND
    if normalized_status == ROUTE_STATUS_NO_ROUTE_FOUND and normalized_error is None:
        normalized_error = ROUTE_STATUS_NO_ROUTE_FOUND
    return {
        "route_status": normalized_status,
        "route_error": normalized_error,
    }


def _get_testing_recipient_address(template: dict) -> str | None:
    return template.get("testing_recipient_address") or template.get("recipient_address")


def _get_test_auto_batch_send_enabled(template: dict) -> bool:
    return bool(
        template.get(
            "test_auto_batch_send_after_funding",
            template.get("test_auto_execute_after_funding", False),
        )
    )


BUILTIN_TEMPLATE_NOTES = (
    "Curated token basket seeded from the provided chain addresses. "
    "This template starts with a zero swap budget so it can be used immediately for gas-only flows. "
    "Add a recipient and a positive budget when you want live routed swaps."
)

BUILTIN_TEMPLATE_DEFINITIONS = [
    {
        "id": "template_builtin_arbitrum_core_basket",
        "name": "Arbitrum Core Basket",
        "chain": TEMPLATE_CHAIN_ARBITRUM,
        "allocation_symbols": ["USDC", "USDT0", "DAI"],
    },
    {
        "id": "template_builtin_avalanche_core_basket",
        "name": "Avalanche Core Basket",
        "chain": TEMPLATE_CHAIN_AVALANCHE,
        "allocation_symbols": ["USDC", "USDT", "DAI"],
    },
    {
        "id": "template_builtin_base_core_basket",
        "name": "Base Core Basket",
        "chain": TEMPLATE_CHAIN_BASE,
        "allocation_symbols": ["USDC", "DAI"],
    },
    {
        "id": "template_builtin_optimism_core_basket",
        "name": "Optimism Core Basket",
        "chain": TEMPLATE_CHAIN_OPTIMISM,
        "allocation_symbols": ["USDC", "USDT", "DAI"],
    },
    {
        "id": "template_builtin_polygon_core_basket",
        "name": "Polygon Core Basket",
        "chain": TEMPLATE_CHAIN_POLYGON,
        "allocation_symbols": ["USDC", "USDT", "DAI"],
    },
    {
        "id": "template_builtin_xlayer_core_basket",
        "name": "X Layer Core Basket",
        "chain": TEMPLATE_CHAIN_XLAYER,
        "allocation_symbols": ["USDC", "USDT", "USDG"],
    },
]


def _build_builtin_template_allocation(chain: str, symbol: str) -> dict:
    token = get_template_chain_token(chain, symbol=symbol)
    return {
        "token_symbol": token["symbol"],
        "token_address": token["address"],
        "percent": None,
        "weth_amount_per_contract": None,
    }


def _build_builtin_template(definition: dict) -> dict:
    chain = normalize_template_chain(definition["chain"])
    allocations = [
        _build_builtin_template_allocation(chain, symbol)
        for symbol in definition["allocation_symbols"]
    ]
    return {
        "id": definition["id"],
        "name": definition["name"],
        "chain": chain,
        "template_version": TEMPLATE_VERSION_V2,
        "gas_reserve_eth_per_contract": "0.02",
        "swap_budget_eth_per_contract": "0",
        "direct_contract_eth_per_contract": "0",
        "direct_contract_native_eth_per_contract": "0",
        "direct_contract_weth_per_contract": "0",
        "recipient_address": None,
        "testing_recipient_address": None,
        "return_wallet_address": None,
        "test_auto_execute_after_funding": False,
        "test_auto_batch_send_after_funding": False,
        "slippage_percent": "0.5",
        "fee_tier": None,
        "auto_top_up_enabled": False,
        "auto_top_up_threshold_eth": "0",
        "auto_top_up_target_eth": "0",
        "auto_wrap_eth_to_weth": True,
        "stablecoin_distribution_mode": "equal",
        "stablecoin_allocations": allocations,
        "notes": BUILTIN_TEMPLATE_NOTES,
        "is_active": True,
        "source": DEFAULT_TEMPLATE_SOURCE,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def ensure_builtin_templates_seeded():
    for definition in BUILTIN_TEMPLATE_DEFINITIONS:
        if db.get_template(definition["id"]) is not None:
            continue
        db.upsert_template(_serialize_template_for_storage(_build_builtin_template(definition)))


def _parse_decimal(value, field_name: str, *, allow_zero: bool = True) -> Decimal:
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise ValueError(f"Invalid {field_name}")

    if parsed < 0 or (not allow_zero and parsed <= 0):
        comparator = "greater than 0" if not allow_zero else "0 or greater"
        raise ValueError(f"{field_name} must be {comparator}")

    return parsed


def _parse_slippage_percent(value) -> Decimal:
    slippage = _parse_decimal(value, "slippage_percent")
    if slippage > Decimal("100"):
        raise ValueError("slippage_percent must be between 0 and 100")
    return slippage


def _parse_fee_tier(value, chain: str | None = None) -> int | None:
    normalized_chain = normalize_template_chain(chain)
    if "uniswap_v3" not in get_template_chain_swap_backends(normalized_chain):
        return None
    if value in (None, "", "auto"):
        return None
    try:
        fee_tier = int(value)
    except (TypeError, ValueError):
        raise ValueError("Invalid fee_tier")
    if fee_tier not in UNISWAP_FEE_TIERS:
        raise ValueError("Unsupported fee_tier")
    return fee_tier


def _parse_optional_address(value, field_name: str) -> str | None:
    normalized = (value or "").strip()
    if not normalized:
        return None
    if not Web3.is_address(normalized):
        raise ValueError(f"{field_name} must be a valid EVM address")
    return Web3.to_checksum_address(normalized)


def _parse_auto_top_up_settings(payload: dict, chain: str) -> dict:
    enabled = bool(payload.get("auto_top_up_enabled", False))
    threshold = _parse_decimal(
        payload.get("auto_top_up_threshold_eth", "0"),
        "auto_top_up_threshold_eth",
    )
    target = _parse_decimal(
        payload.get("auto_top_up_target_eth", "0"),
        "auto_top_up_target_eth",
    )

    if enabled:
        if target <= 0:
            raise ValueError("auto_top_up_target_eth must be greater than 0 when auto top-up is enabled")
        if chain == TEMPLATE_CHAIN_BNB:
            if target < threshold:
                raise ValueError("auto_top_up_target_eth must be equal to or greater than auto_top_up_threshold_eth on BNB Chain")
        elif target <= threshold:
            raise ValueError("auto_top_up_target_eth must be greater than auto_top_up_threshold_eth")

    return {
        "enabled": enabled,
        "threshold": threshold,
        "target": target,
    }


def _normalize_stablecoin(
    chain: str,
    address: str | None = None,
    symbol: str | None = None,
):
    chain_config = get_template_chain_config(chain)
    if is_wrapped_native_template_token(chain, address=address, symbol=symbol):
        raise ValueError(
            f"{chain_config['wrapped_native_symbol']} is the wrapped input asset on {chain_config['label']}. "
            f"Do not add it as a swap target. Use swap_budget_eth_per_contract or direct_contract_weth_per_contract instead."
        )
    try:
        return get_template_chain_token(chain, address=address, symbol=symbol)
    except ValueError:
        if address and Web3.is_address(address):
            token = resolve_token(address, chain)
            if is_wrapped_native_template_token(chain, address=token["address"], symbol=token["symbol"]):
                raise ValueError(
                    f"{chain_config['wrapped_native_symbol']} is the wrapped input asset on {chain_config['label']}. "
                    f"Do not add it as a swap target. Use swap_budget_eth_per_contract or direct_contract_weth_per_contract instead."
                )
            return token
        raise


def resolve_template_token(address: str, chain: str | None = None):
    normalized_chain = normalize_template_chain(chain)
    normalized_address = (address or "").strip()
    if not Web3.is_address(normalized_address):
        raise ValueError("token_address must be a valid EVM address")

    chain_config = get_template_chain_config(normalized_chain)
    if is_wrapped_native_template_token(normalized_chain, address=normalized_address):
        raise ValueError(
            f"{chain_config['wrapped_native_symbol']} is reserved for wrapping on {chain_config['label']}. "
            "It cannot be added as a swap target."
        )

    token = resolve_token(normalized_address, normalized_chain)
    if is_wrapped_native_template_token(normalized_chain, address=token["address"], symbol=token["symbol"]):
        raise ValueError(
            f"{chain_config['wrapped_native_symbol']} is reserved for wrapping on {chain_config['label']}. "
            "It cannot be added as a swap target."
        )
    saved_token = db.get_template_token(normalized_chain, token["address"])
    return {
        "symbol": token["symbol"],
        "name": token["name"],
        "address": token["address"],
        "decimals": int(token["decimals"]),
        "official_source": None,
        "is_custom": bool(saved_token.get("is_custom", False)) if saved_token else False,
        **_probe_template_token_route(
            normalized_chain,
            token["address"],
            token_symbol=token["symbol"],
            slippage_percent="0.5",
        ),
    }


def _merge_template_token_option(token: dict, saved_token: dict | None = None):
    merged = {
        "symbol": token["symbol"],
        "name": token["name"],
        "address": token["address"],
        "decimals": int(token["decimals"]) if token.get("decimals") is not None else None,
        "official_source": token.get("official_source"),
        "tested": None,
        "route_status": None,
        "route_error": None,
        "is_custom": False,
    }
    if saved_token:
        merged.update(
            {
                "symbol": saved_token.get("symbol") or merged["symbol"],
                "name": saved_token.get("name") or merged["name"],
                "address": saved_token.get("address") or merged["address"],
                "decimals": saved_token.get("decimals")
                if saved_token.get("decimals") is not None
                else merged["decimals"],
                "official_source": saved_token.get("official_source"),
                "tested": saved_token.get("tested"),
                "route_status": saved_token.get("route_status"),
                "route_error": saved_token.get("route_error"),
                "is_custom": bool(saved_token.get("is_custom", False)),
            }
        )
    return merged


def get_template_chain_token_options(chain: str | None = None):
    normalized_chain = normalize_template_chain(chain)
    saved_tokens = {
        (record.get("address") or "").lower(): record
        for record in db.list_template_tokens(normalized_chain)
        if record.get("address")
    }
    merged_tokens = []
    seen_addresses = set()

    for token in get_template_chain_tokens(normalized_chain):
        normalized_address = token["address"].lower()
        seen_addresses.add(normalized_address)
        merged_tokens.append(_merge_template_token_option(token, saved_tokens.get(normalized_address)))

    for normalized_address, saved_token in saved_tokens.items():
        if normalized_address in seen_addresses or not saved_token.get("is_custom"):
            continue
        merged_tokens.append(
            {
                "symbol": saved_token.get("symbol"),
                "name": saved_token.get("name") or saved_token.get("symbol"),
                "address": saved_token.get("address"),
                "decimals": saved_token.get("decimals"),
                "official_source": saved_token.get("official_source"),
                "tested": saved_token.get("tested"),
                "route_status": saved_token.get("route_status"),
                "route_error": saved_token.get("route_error"),
                "is_custom": True,
            }
        )

    return merged_tokens


def recheck_template_token(
    address: str,
    chain: str | None = None,
    *,
    persist: bool = False,
    is_custom: bool = False,
):
    checked_token = resolve_template_token(address, chain)
    normalized_chain = normalize_template_chain(chain)
    if persist:
        existing = db.get_template_token(normalized_chain, checked_token["address"]) or {}
        db.upsert_template_token(
            {
                "chain": normalized_chain,
                "symbol": checked_token["symbol"],
                "name": checked_token["name"],
                "address": checked_token["address"],
                "decimals": checked_token["decimals"],
                "official_source": checked_token.get("official_source"),
                "tested": checked_token.get("tested"),
                "route_status": checked_token.get("route_status"),
                "route_error": checked_token.get("route_error"),
                "is_custom": bool(is_custom or existing.get("is_custom", False)),
            }
        )
        checked_token["is_custom"] = bool(is_custom or existing.get("is_custom", False))
    return checked_token


def delete_template_token(address: str, chain: str | None = None):
    normalized_chain = normalize_template_chain(chain)
    normalized_address = (address or "").strip()
    if not Web3.is_address(normalized_address):
        raise ValueError("token_address must be a valid EVM address")

    deleted = db.delete_template_token(normalized_chain, Web3.to_checksum_address(normalized_address))
    if deleted is None:
        return {"deleted": False}
    return {"deleted": True, "token": deleted}


def get_template_chain_token_route_statuses(chain: str | None = None):
    normalized_chain = normalize_template_chain(chain)
    tokens = get_template_chain_tokens(normalized_chain)
    chain_config = get_template_chain_config(normalized_chain)

    if not chain_config["quote_supported"]:
        return {
            "chain": normalized_chain,
            "stablecoins": [
                {
                    "symbol": token["symbol"],
                    "name": token["name"],
                    "address": token["address"],
                    "decimals": int(token["decimals"]) if token.get("decimals") is not None else None,
                    "official_source": None,
                    "tested": False,
                    "route_status": None,
                    "route_error": None,
                }
                for token in tokens
            ],
        }

    def probe_token(token: dict):
        return {
            "symbol": token["symbol"],
            "name": token["name"],
            "address": token["address"],
            "decimals": int(token["decimals"]) if token.get("decimals") is not None else None,
            "official_source": None,
            **_probe_template_token_route(
                normalized_chain,
                token["address"],
                token_symbol=token["symbol"],
                slippage_percent="0.5",
            ),
        }

    max_workers = min(6, max(1, len(tokens)))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        stablecoins = list(executor.map(probe_token, tokens))

    return {
        "chain": normalized_chain,
        "stablecoins": stablecoins,
    }


def _parse_allocations(
    allocations_payload,
    distribution_mode: str,
    swap_budget_eth_per_contract: Decimal,
    chain: str,
):
    if distribution_mode == "none":
        if swap_budget_eth_per_contract > 0:
            raise ValueError("Swap budget must be 0 when stablecoin distribution is set to none")
        return []

    allocations_payload = allocations_payload or []
    if not isinstance(allocations_payload, list) or len(allocations_payload) == 0:
        raise ValueError("Select at least one stablecoin allocation")

    allocations = []
    seen_addresses = set()

    for raw_allocation in allocations_payload:
        if not isinstance(raw_allocation, dict):
            raise ValueError("Invalid stablecoin allocation")

        token = _normalize_stablecoin(
            chain,
            raw_allocation.get("token_address"),
            raw_allocation.get("token_symbol"),
        )
        if token["address"] in seen_addresses:
            raise ValueError("Duplicate stablecoin allocation")
        seen_addresses.add(token["address"])

        allocation = {
            "token_symbol": token["symbol"],
            "token_address": token["address"],
        }
        allocation_route_metadata = _build_allocation_route_metadata(
            raw_allocation.get("route_status"),
            raw_allocation.get("route_error"),
        )
        if allocation_route_metadata["route_status"] is not None:
            allocation["route_status"] = allocation_route_metadata["route_status"]
        if allocation_route_metadata["route_error"] is not None:
            allocation["route_error"] = allocation_route_metadata["route_error"]

        if distribution_mode == "manual_percent":
            percent = _parse_decimal(raw_allocation.get("percent"), "percent", allow_zero=False)
            allocation["percent"] = _format_decimal(percent)
            allocation["weth_amount_per_contract"] = None
        elif distribution_mode == "manual_weth_amount":
            weth_amount = _parse_decimal(
                raw_allocation.get("weth_amount_per_contract"),
                "weth_amount_per_contract",
                allow_zero=False,
            )
            allocation["percent"] = None
            allocation["weth_amount_per_contract"] = _format_decimal(weth_amount)
        else:
            allocation["percent"] = None
            allocation["weth_amount_per_contract"] = None

        allocations.append(allocation)

    if distribution_mode == "equal":
        return allocations

    if distribution_mode == "manual_percent":
        total_percent = sum(Decimal(allocation["percent"]) for allocation in allocations)
        if total_percent != Decimal("100"):
            raise ValueError("Stablecoin percentages must total exactly 100")
        return allocations

    if distribution_mode == "manual_weth_amount":
        total_weth = sum(Decimal(allocation["weth_amount_per_contract"]) for allocation in allocations)
        if total_weth != swap_budget_eth_per_contract:
            raise ValueError("Manual WETH amounts must total the swap budget per contract")
        if swap_budget_eth_per_contract <= 0:
            raise ValueError("Swap budget must be greater than 0 when stablecoin swapping is enabled")
        return allocations

    raise ValueError("Unsupported stablecoin distribution mode")


def _build_template_payload(template_id: str, payload: dict, created_at: str | None = None):
    name = (payload.get("name") or "").strip()
    if not name:
        raise ValueError("Template name is required")

    chain = normalize_template_chain(payload.get("chain"))
    chain_config = get_template_chain_config(chain)
    template_version = payload.get("template_version") or TEMPLATE_VERSION_V2
    if template_version != TEMPLATE_VERSION_V2:
        raise ValueError("Unsupported template version")

    distribution_mode = (payload.get("stablecoin_distribution_mode") or "none").strip()
    if distribution_mode not in DISTRIBUTION_MODE_VALUES:
        raise ValueError("Unsupported stablecoin distribution mode")

    gas_reserve = _parse_decimal(
        payload.get("gas_reserve_eth_per_contract", "0"),
        "gas_reserve_eth_per_contract",
    )
    swap_budget = _parse_decimal(
        payload.get("swap_budget_eth_per_contract", "0"),
        "swap_budget_eth_per_contract",
    )
    direct_eth = Decimal("0")
    direct_contract_native_eth = _parse_decimal(
        payload.get("direct_contract_native_eth_per_contract", "0"),
        "direct_contract_native_eth_per_contract",
    )
    direct_weth = _parse_decimal(
        payload.get("direct_contract_weth_per_contract", "0"),
        "direct_contract_weth_per_contract",
    )
    if swap_budget > 0 and not get_template_chain_swap_backends(chain):
        raise ValueError(f"Token swap execution is not configured for {chain_config['label']} yet")
    testing_recipient_address = _parse_optional_address(
        payload.get("testing_recipient_address") or payload.get("recipient_address"),
        "testing_recipient_address",
    )
    return_wallet_address = _parse_optional_address(payload.get("return_wallet_address"), "return_wallet_address")
    test_auto_execute_after_funding = bool(
        payload.get(
            "test_auto_batch_send_after_funding",
            payload.get("test_auto_execute_after_funding", False),
        )
    )
    requires_recipient = (
        direct_contract_native_eth > 0
        or direct_weth > 0
        or (distribution_mode != "none" and swap_budget > 0)
    )
    if requires_recipient and testing_recipient_address is None:
        raise ValueError(
            f"testing_recipient_address is required when token swaps or direct contract "
            f"{chain_config['native_symbol']}/{chain_config['wrapped_native_symbol']} funding are enabled"
        )
    if test_auto_execute_after_funding and testing_recipient_address is None:
        raise ValueError("testing_recipient_address is required when test_auto_batch_send_after_funding is enabled")
    if requires_recipient and not test_auto_execute_after_funding:
        raise ValueError(
            "Testing only currently requires test_auto_batch_send_after_funding when token swaps or direct contract "
            "funding are enabled, because the app does not yet expose a later release path for funded "
            "BatchTreasuryDistributor contracts."
        )
    slippage_percent = _parse_slippage_percent(payload.get("slippage_percent", "0.5"))
    fee_tier = _parse_fee_tier(payload.get("fee_tier"), chain)
    auto_top_up = _parse_auto_top_up_settings(payload, chain)

    allocations = _parse_allocations(
        payload.get("stablecoin_allocations"),
        distribution_mode,
        swap_budget,
        chain,
    )

    return {
        "id": template_id,
        "name": name,
        "chain": chain,
        "template_version": TEMPLATE_VERSION_V2,
        "gas_reserve_eth_per_contract": _format_decimal(gas_reserve),
        "swap_budget_eth_per_contract": _format_decimal(swap_budget),
        "direct_contract_eth_per_contract": _format_decimal(direct_eth),
        "direct_contract_native_eth_per_contract": _format_decimal(direct_contract_native_eth),
        "direct_contract_weth_per_contract": _format_decimal(direct_weth),
        "recipient_address": testing_recipient_address,
        "testing_recipient_address": testing_recipient_address,
        "return_wallet_address": return_wallet_address,
        "test_auto_execute_after_funding": test_auto_execute_after_funding,
        "test_auto_batch_send_after_funding": test_auto_execute_after_funding,
        "slippage_percent": _format_decimal(slippage_percent),
        "fee_tier": fee_tier,
        "auto_top_up_enabled": auto_top_up["enabled"],
        "auto_top_up_threshold_eth": _format_decimal(auto_top_up["threshold"]),
        "auto_top_up_target_eth": _format_decimal(auto_top_up["target"]),
        # Swap routes still wrap inside the sub-wallet. Direct distributor WETH can be sourced from the main wallet.
        "auto_wrap_eth_to_weth": True,
        "stablecoin_distribution_mode": distribution_mode,
        "stablecoin_allocations": allocations,
        "notes": (payload.get("notes") or "").strip() or None,
        "is_active": bool(payload.get("is_active", True)),
        "source": payload.get("source") or DEFAULT_TEMPLATE_SOURCE,
        "created_at": created_at or datetime.now(timezone.utc).isoformat(),
    }


def _serialize_template_for_storage(template: dict):
    stablecoin_allocations = template.get("stablecoin_allocations") or []
    stablecoin_allocations_json = json.dumps(stablecoin_allocations)
    primary_target = stablecoin_allocations[0] if stablecoin_allocations else None

    return {
        "id": template["id"],
        "name": template["name"],
        "chain": template.get("chain") or DEFAULT_TEMPLATE_CHAIN,
        "target_token_symbol": primary_target.get("token_symbol") if primary_target else None,
        "target_token_address": primary_target.get("token_address") if primary_target else None,
        "weth_per_subwallet": template["swap_budget_eth_per_contract"],
        "slippage_percent": template["slippage_percent"],
        "fee_tier": template["fee_tier"],
        "auto_wrap_eth": template["auto_wrap_eth_to_weth"],
        "gas_reserve_eth_per_subwallet": template["gas_reserve_eth_per_contract"],
        "contract_budget_eth_per_subwallet": template["direct_contract_eth_per_contract"],
        "notes": template.get("notes"),
        "recipient_address": template.get("testing_recipient_address") or template.get("recipient_address"),
        "testing_recipient_address": template.get("testing_recipient_address") or template.get("recipient_address"),
        "return_wallet_address": template.get("return_wallet_address"),
        "test_auto_execute_after_funding": _get_test_auto_batch_send_enabled(template),
        "test_auto_batch_send_after_funding": _get_test_auto_batch_send_enabled(template),
        "is_active": template.get("is_active", True),
        "source": template.get("source") or DEFAULT_TEMPLATE_SOURCE,
        "created_at": template["created_at"],
        "template_version": TEMPLATE_VERSION_V2,
        "gas_reserve_eth_per_contract": template["gas_reserve_eth_per_contract"],
        "swap_budget_eth_per_contract": template["swap_budget_eth_per_contract"],
        "direct_contract_eth_per_contract": template["direct_contract_eth_per_contract"],
        "direct_contract_native_eth_per_contract": template.get("direct_contract_native_eth_per_contract", "0"),
        "direct_contract_weth_per_contract": template["direct_contract_weth_per_contract"],
        "auto_top_up_enabled": template["auto_top_up_enabled"],
        "auto_top_up_threshold_eth": template["auto_top_up_threshold_eth"],
        "auto_top_up_target_eth": template["auto_top_up_target_eth"],
        "auto_wrap_eth_to_weth": template["auto_wrap_eth_to_weth"],
        "stablecoin_distribution_mode": template["stablecoin_distribution_mode"],
        "stablecoin_allocations": stablecoin_allocations_json,
    }


def _deserialize_template_record(record: dict | None):
    if not record:
        return None

    template_version = record.get("template_version")
    if template_version != TEMPLATE_VERSION_V2:
        return None

    allocations = record.get("stablecoin_allocations") or []
    if isinstance(allocations, str):
        try:
            allocations = json.loads(allocations)
        except json.JSONDecodeError:
            allocations = []

    return {
        "id": record["id"],
        "name": record.get("name"),
        "chain": normalize_template_chain(record.get("chain")),
        "template_version": TEMPLATE_VERSION_V2,
        "gas_reserve_eth_per_contract": record.get("gas_reserve_eth_per_contract") or "0",
        "swap_budget_eth_per_contract": record.get("swap_budget_eth_per_contract") or "0",
        "direct_contract_eth_per_contract": record.get("direct_contract_eth_per_contract") or "0",
        "direct_contract_native_eth_per_contract": record.get("direct_contract_native_eth_per_contract") or "0",
        "direct_contract_weth_per_contract": record.get("direct_contract_weth_per_contract") or "0",
        "auto_top_up_enabled": bool(record.get("auto_top_up_enabled", False)),
        "auto_top_up_threshold_eth": record.get("auto_top_up_threshold_eth") or "0",
        "auto_top_up_target_eth": record.get("auto_top_up_target_eth") or "0",
        "recipient_address": record.get("testing_recipient_address") or record.get("recipient_address"),
        "testing_recipient_address": record.get("testing_recipient_address") or record.get("recipient_address"),
        "return_wallet_address": record.get("return_wallet_address"),
        "test_auto_execute_after_funding": bool(
            record.get("test_auto_batch_send_after_funding", record.get("test_auto_execute_after_funding", False))
        ),
        "test_auto_batch_send_after_funding": bool(
            record.get("test_auto_batch_send_after_funding", record.get("test_auto_execute_after_funding", False))
        ),
        "slippage_percent": record.get("slippage_percent") or "0.5",
        "fee_tier": record.get("fee_tier"),
        "auto_wrap_eth_to_weth": True,
        "stablecoin_distribution_mode": record.get("stablecoin_distribution_mode") or "none",
        "stablecoin_allocations": allocations,
        "notes": record.get("notes"),
        "is_active": bool(record.get("is_active", True)),
        "source": record.get("source") or DEFAULT_TEMPLATE_SOURCE,
        "created_at": record.get("created_at"),
    }


def _usd_value(amount: Decimal, price_value: str | None):
    if price_value is None:
        return None
    return _format_decimal(amount * Decimal(price_value))


def _empty_market_snapshot():
    return {
        "available": False,
        "currency": "usd",
        "eth_usd": None,
        "weth_usd": None,
        "token_prices": {},
        "fetched_at": None,
        "error": None,
    }


def _build_allocation_budget_snapshot(
    template: dict,
    allocation: dict,
    distribution_mode: str,
    swap_budget_eth_per_contract: Decimal,
):
    allocations = template.get("stablecoin_allocations") or []
    if distribution_mode == "equal":
        if not allocations:
            return Decimal("0"), Decimal("0")
        percent = Decimal("100") / Decimal(len(allocations))
        per_contract_weth = swap_budget_eth_per_contract / Decimal(len(allocations))
    elif distribution_mode == "manual_percent":
        percent = Decimal(str(allocation["percent"]))
        per_contract_weth = swap_budget_eth_per_contract * (percent / Decimal("100"))
    else:
        per_contract_weth = Decimal(str(allocation["weth_amount_per_contract"]))
        percent = (
            per_contract_weth / swap_budget_eth_per_contract * Decimal("100")
            if swap_budget_eth_per_contract > 0
            else Decimal("0")
        )
    return percent, per_contract_weth


def _probe_template_allocation_route(template: dict, allocation: dict) -> dict:
    chain = template.get("chain") or DEFAULT_TEMPLATE_CHAIN
    return _probe_template_token_route(
        chain,
        allocation.get("token_address"),
        token_symbol=allocation.get("token_symbol"),
        fee_tier=template.get("fee_tier"),
        slippage_percent=template.get("slippage_percent"),
        minimum_amount=Decimal(
            str(
                max(
                    _build_allocation_budget_snapshot(
                        template,
                        allocation,
                        template.get("stablecoin_distribution_mode") or "none",
                        Decimal(str(template.get("swap_budget_eth_per_contract") or "0")),
                    )[1],
                    ROUTE_CHECK_PROBE_WETH_AMOUNT,
                )
            )
        ),
    )


def _probe_template_token_route(
    chain: str,
    token_address: str | None,
    *,
    token_symbol: str | None = None,
    fee_tier: int | None = None,
    slippage_percent: str | float | Decimal | None = None,
    minimum_amount: Decimal | None = None,
):
    chain_config = get_template_chain_config(chain)
    if not chain_config["quote_supported"]:
        return {
            "tested": False,
            "route_status": None,
            "route_error": None,
        }

    token = _normalize_stablecoin(
        chain,
        token_address,
        token_symbol,
    )
    probe_amount = max(minimum_amount or Decimal("0"), ROUTE_CHECK_PROBE_WETH_AMOUNT)

    try:
        quote_uniswap_swap(
            chain_config["wrapped_native_symbol"],
            token["address"],
            _format_decimal(probe_amount),
            fee_tier=fee_tier,
            slippage_percent=slippage_percent,
            chain=chain,
        )
        return {
            "tested": True,
            "route_status": None,
            "route_error": None,
        }
    except Exception as exc:
        route_error = _normalize_route_error_message(str(exc))
        route_status = ROUTE_STATUS_NO_ROUTE_FOUND if route_error == ROUTE_STATUS_NO_ROUTE_FOUND else None
        return {
            "tested": True,
            "route_status": route_status,
            "route_error": route_error,
        }


def _build_allocation_preview(
    template: dict,
    allocation: dict,
    distribution_mode: str,
    swap_budget_eth_per_contract: Decimal,
    contract_count: int,
    market_snapshot: dict,
    *,
    include_live_market: bool = False,
):
    chain_config = get_template_chain_config(template.get("chain"))
    token = _normalize_stablecoin(
        template.get("chain") or DEFAULT_TEMPLATE_CHAIN,
        allocation.get("token_address"),
        allocation.get("token_symbol"),
    )
    contract_count_decimal = Decimal(contract_count)
    percent, per_contract_weth = _build_allocation_budget_snapshot(
        template,
        allocation,
        distribution_mode,
        swap_budget_eth_per_contract,
    )

    total_weth = per_contract_weth * contract_count_decimal
    route_metadata = _build_allocation_route_metadata(
        allocation.get("route_status"),
        allocation.get("route_error"),
    )
    route_status = route_metadata["route_status"]
    route_error = route_metadata["route_error"]

    quote = {
        "available": False,
        "token_in": chain_config["wrapped_native_symbol"],
        "token_out": token["symbol"],
        "error": None,
        "source": "template-allocation",
        "slippage_percent": template.get("slippage_percent"),
    }
    per_contract_output = None
    total_output = None
    per_contract_min_output = None
    total_min_output = None

    if include_live_market and per_contract_weth > 0 and chain_config["quote_supported"]:
        try:
            raw_quote = quote_uniswap_swap(
                chain_config["wrapped_native_symbol"],
                token["address"],
                _format_decimal(per_contract_weth),
                fee_tier=template.get("fee_tier"),
                slippage_percent=template.get("slippage_percent"),
                chain=template.get("chain"),
            )
            quote = {
                "available": True,
                **raw_quote,
            }
            per_contract_output = Decimal(str(raw_quote["amount_out"]))
            total_output = per_contract_output * contract_count_decimal
            per_contract_min_output = Decimal(str(raw_quote["min_amount_out"]))
            total_min_output = per_contract_min_output * contract_count_decimal
            route_status = None
            route_error = None
        except Exception as exc:
            normalized_error = _normalize_route_error_message(str(exc))
            quote = {
                "available": False,
                "token_in": chain_config["wrapped_native_symbol"],
                "token_out": token["symbol"],
                "error": normalized_error,
                "source": "template-allocation",
                "slippage_percent": template.get("slippage_percent"),
            }
            route_status = ROUTE_STATUS_NO_ROUTE_FOUND if normalized_error == ROUTE_STATUS_NO_ROUTE_FOUND else route_status
            route_error = normalized_error
    elif include_live_market and per_contract_weth > 0:
        quote = {
            "available": False,
            "token_in": chain_config["wrapped_native_symbol"],
            "token_out": token["symbol"],
            "error": f"Live swap quotes are not configured for {chain_config['label']} yet.",
            "source": "template-allocation",
            "slippage_percent": template.get("slippage_percent"),
        }
    elif include_live_market:
        route_probe = _probe_template_allocation_route(template, allocation)
        if route_probe["tested"]:
            route_status = route_probe["route_status"]
            route_error = route_probe["route_error"]
            if route_error and not quote["error"]:
                quote["error"] = route_error

    token_price_usd = market_snapshot.get("token_prices", {}).get(token["address"].lower()) if include_live_market else None
    return {
        "token_symbol": token["symbol"],
        "token_name": token["name"],
        "token_address": token["address"],
        "route_status": route_status,
        "route_error": route_error,
        "percent": _format_decimal(percent),
        "per_contract_weth_amount": _format_decimal(per_contract_weth),
        "total_weth_amount": _format_decimal(total_weth),
        "per_contract_weth_usd": _usd_value(per_contract_weth, market_snapshot.get("weth_usd")) if include_live_market else None,
        "total_weth_usd": _usd_value(total_weth, market_snapshot.get("weth_usd")) if include_live_market else None,
        "quote": quote,
        "per_contract_output": _format_decimal(per_contract_output),
        "total_output": _format_decimal(total_output),
        "per_contract_min_output": _format_decimal(per_contract_min_output),
        "total_min_output": _format_decimal(total_min_output),
        "token_usd": token_price_usd,
        "per_contract_output_usd": _usd_value(per_contract_output, token_price_usd) if per_contract_output is not None else None,
        "total_output_usd": _usd_value(total_output, token_price_usd) if total_output is not None else None,
        "per_contract_min_output_usd": _usd_value(per_contract_min_output, token_price_usd) if per_contract_min_output is not None else None,
        "total_min_output_usd": _usd_value(total_min_output, token_price_usd) if total_min_output is not None else None,
    }


def _get_estimated_gas_price_wei(chain: str | None = None) -> Decimal:
    gas_price_wei = Decimal("0")
    try:
        web3_client = get_web3(chain)
        if web3_client and web3_client.is_connected():
            gas_price_wei = Decimal(
                resolve_legacy_aggressive_gas_pricing(
                    web3_client,
                    chain=chain,
                    tx_stage=LEGACY_GAS_STAGE_SWAP,
                )["submitted_gas_price_wei"]
            )
    except Exception:
        gas_price_wei = Decimal("0")
    return gas_price_wei


def _build_template_execution_estimate(template: dict, contract_count: int, *, gas_price_wei: Decimal | None = None):
    swap_budget = Decimal(str(template["swap_budget_eth_per_contract"]))
    direct_contract_native_eth = Decimal(str(template.get("direct_contract_native_eth_per_contract") or "0"))
    direct_weth = Decimal(str(template["direct_contract_weth_per_contract"]))
    recipient_address = _get_testing_recipient_address(template)
    return_wallet_address = template.get("return_wallet_address")
    test_auto_execute_after_funding = _get_test_auto_batch_send_enabled(template)
    stablecoin_routes = [
        route
        for route in build_template_stablecoin_routes(template, contract_count=1)
        if Decimal(str(route.get("per_contract_weth_amount") or "0")) > 0
    ]
    route_count = len(stablecoin_routes)
    router_approval_count_per_wallet = len(get_template_chain_swap_backends(template.get("chain"))) if route_count > 0 else 0
    local_erc20_funding_targets_per_wallet = route_count
    main_wallet_erc20_funding_targets_per_wallet = 1 if direct_weth > 0 else 0
    main_wallet_native_eth_funding_targets_per_wallet = 1 if direct_contract_native_eth > 0 else 0
    erc20_funding_targets_per_wallet = (
        local_erc20_funding_targets_per_wallet + main_wallet_erc20_funding_targets_per_wallet
    )
    native_eth_funding_targets_per_wallet = main_wallet_native_eth_funding_targets_per_wallet
    funded_asset_count_per_wallet = erc20_funding_targets_per_wallet + native_eth_funding_targets_per_wallet
    required_weth_per_contract = swap_budget
    wrap_transaction_count = contract_count if required_weth_per_contract > 0 else 0
    approval_transaction_count = contract_count * router_approval_count_per_wallet
    swap_transaction_count = contract_count * route_count
    deployment_transaction_count = contract_count if recipient_address and funded_asset_count_per_wallet > 0 else 0
    contract_funding_transaction_count = contract_count * funded_asset_count_per_wallet if recipient_address else 0
    execute_transaction_count = contract_count if recipient_address and test_auto_execute_after_funding and funded_asset_count_per_wallet > 0 else 0
    return_sweep_token_transfer_count_per_wallet = (
        route_count + (1 if swap_budget > 0 else 0)
        if return_wallet_address
        else 0
    )
    return_sweep_transaction_count_per_wallet = (
        1 + return_sweep_token_transfer_count_per_wallet
        if return_wallet_address
        else 0
    )
    return_sweep_transaction_count = contract_count * return_sweep_transaction_count_per_wallet

    wrap_gas_units_per_wallet = WETH_DEPOSIT_GAS_LIMIT if required_weth_per_contract > 0 else 0
    approval_gas_units_per_wallet = ERC20_APPROVE_GAS_LIMIT * router_approval_count_per_wallet
    swap_gas_units_per_wallet = UNISWAP_V3_SWAP_GAS_LIMIT * route_count
    deployment_gas_units_per_wallet = (
        MANAGED_TOKEN_DISTRIBUTOR_DEPLOY_GAS_LIMIT
        if recipient_address and funded_asset_count_per_wallet > 0
        else 0
    )
    local_contract_funding_gas_units_per_wallet = (
        ERC20_TRANSFER_GAS_LIMIT * local_erc20_funding_targets_per_wallet
        if recipient_address
        else 0
    )
    main_wallet_direct_funding_gas_units_per_wallet = (
        (ERC20_TRANSFER_GAS_LIMIT * main_wallet_erc20_funding_targets_per_wallet)
        + (CONTRACT_NATIVE_ETH_TRANSFER_GAS_LIMIT * main_wallet_native_eth_funding_targets_per_wallet)
        if recipient_address
        else 0
    )
    contract_funding_gas_units_per_wallet = (
        local_contract_funding_gas_units_per_wallet + main_wallet_direct_funding_gas_units_per_wallet
    )
    execute_gas_units_per_wallet = (
        (120000 + (ERC20_TRANSFER_GAS_LIMIT * funded_asset_count_per_wallet))
        if recipient_address and test_auto_execute_after_funding and funded_asset_count_per_wallet > 0
        else 0
    )
    return_sweep_gas_units_per_wallet = (
        ETH_TRANSFER_GAS_LIMIT + (ERC20_TRANSFER_GAS_LIMIT * return_sweep_token_transfer_count_per_wallet)
        if return_wallet_address
        else 0
    )
    local_execution_gas_units_per_wallet = (
        wrap_gas_units_per_wallet
        + approval_gas_units_per_wallet
        + swap_gas_units_per_wallet
        + deployment_gas_units_per_wallet
        + local_contract_funding_gas_units_per_wallet
        + execute_gas_units_per_wallet
        + return_sweep_gas_units_per_wallet
    )
    local_execution_gas_units_total = local_execution_gas_units_per_wallet * contract_count
    chain = template.get("chain")
    wrap_gas_price_wei = Decimal("0")
    approval_gas_price_wei = Decimal("0")
    swap_gas_price_wei = Decimal("0")
    deployment_gas_price_wei = Decimal("0")
    fund_treasury_gas_price_wei = Decimal("0")
    batch_send_gas_price_wei = Decimal("0")
    return_sweep_gas_price_wei = Decimal("0")
    top_up_gas_price_wei = Decimal("0")
    fund_subwallet_gas_price_wei = Decimal("0")
    try:
        web3_client = get_web3(chain)
        if web3_client and web3_client.is_connected():
            # Fetch the node gas price once and reuse for all stage calculations
            # to avoid 9 separate RPC calls that can cause timeouts.
            cached_gas = int(web3_client.eth.gas_price)
            _gp = lambda stage: Decimal(resolve_legacy_aggressive_gas_pricing(web3_client, chain=chain, tx_stage=stage, cached_node_gas_price_wei=cached_gas)["submitted_gas_price_wei"])
            wrap_gas_price_wei = _gp(LEGACY_GAS_STAGE_WRAP)
            approval_gas_price_wei = _gp(LEGACY_GAS_STAGE_APPROVAL)
            swap_gas_price_wei = _gp(LEGACY_GAS_STAGE_SWAP)
            deployment_gas_price_wei = _gp(LEGACY_GAS_STAGE_DEPLOY_TREASURY)
            fund_treasury_gas_price_wei = _gp(LEGACY_GAS_STAGE_FUND_TREASURY)
            batch_send_gas_price_wei = _gp(LEGACY_GAS_STAGE_BATCH_SEND)
            return_sweep_gas_price_wei = _gp(LEGACY_GAS_STAGE_RETURN_SWEEP)
            top_up_gas_price_wei = _gp(LEGACY_GAS_STAGE_TOP_UP)
            fund_subwallet_gas_price_wei = _gp(LEGACY_GAS_STAGE_FUND_SUBWALLET)
    except Exception:
        pass

    local_execution_stage_gas_units_per_wallet = {
        LEGACY_GAS_STAGE_WRAP: wrap_gas_units_per_wallet,
        LEGACY_GAS_STAGE_APPROVAL: approval_gas_units_per_wallet,
        LEGACY_GAS_STAGE_SWAP: swap_gas_units_per_wallet,
        LEGACY_GAS_STAGE_DEPLOY_TREASURY: deployment_gas_units_per_wallet,
        LEGACY_GAS_STAGE_FUND_TREASURY: local_contract_funding_gas_units_per_wallet,
        LEGACY_GAS_STAGE_BATCH_SEND: execute_gas_units_per_wallet,
        LEGACY_GAS_STAGE_RETURN_SWEEP: return_sweep_gas_units_per_wallet,
    }
    local_execution_stage_gas_units_total = {
        stage: int(units) * contract_count
        for stage, units in local_execution_stage_gas_units_per_wallet.items()
    }
    stage_gas_prices_wei = {
        LEGACY_GAS_STAGE_FUND_SUBWALLET: fund_subwallet_gas_price_wei,
        LEGACY_GAS_STAGE_TOP_UP: top_up_gas_price_wei,
        LEGACY_GAS_STAGE_WRAP: wrap_gas_price_wei,
        LEGACY_GAS_STAGE_APPROVAL: approval_gas_price_wei,
        LEGACY_GAS_STAGE_SWAP: swap_gas_price_wei,
        LEGACY_GAS_STAGE_DEPLOY_TREASURY: deployment_gas_price_wei,
        LEGACY_GAS_STAGE_FUND_TREASURY: fund_treasury_gas_price_wei,
        LEGACY_GAS_STAGE_BATCH_SEND: batch_send_gas_price_wei,
        LEGACY_GAS_STAGE_RETURN_SWEEP: return_sweep_gas_price_wei,
    }
    local_execution_gas_fee_wei_per_wallet = (
        int(wrap_gas_price_wei) * wrap_gas_units_per_wallet
        + int(approval_gas_price_wei) * approval_gas_units_per_wallet
        + int(swap_gas_price_wei) * swap_gas_units_per_wallet
        + int(deployment_gas_price_wei) * deployment_gas_units_per_wallet
        + int(fund_treasury_gas_price_wei) * local_contract_funding_gas_units_per_wallet
        + int(batch_send_gas_price_wei) * execute_gas_units_per_wallet
        + int(return_sweep_gas_price_wei) * return_sweep_gas_units_per_wallet
    )
    local_execution_gas_fee_wei_total = local_execution_gas_fee_wei_per_wallet * contract_count
    gas_price_wei = gas_price_wei if gas_price_wei is not None else max(
        stage_gas_prices_wei.values(),
        default=Decimal("0"),
    )

    return {
        "stablecoin_routes": stablecoin_routes,
        "route_count": route_count,
        "deployment_targets_per_wallet": funded_asset_count_per_wallet,
        "funded_asset_count_per_wallet": funded_asset_count_per_wallet,
        "local_erc20_funding_targets_per_wallet": local_erc20_funding_targets_per_wallet,
        "main_wallet_erc20_funding_targets_per_wallet": main_wallet_erc20_funding_targets_per_wallet,
        "main_wallet_native_eth_funding_targets_per_wallet": main_wallet_native_eth_funding_targets_per_wallet,
        "erc20_funding_targets_per_wallet": erc20_funding_targets_per_wallet,
        "native_eth_funding_targets_per_wallet": native_eth_funding_targets_per_wallet,
        "required_weth_per_contract": required_weth_per_contract,
        "router_approval_count_per_wallet": router_approval_count_per_wallet,
        "wrap_transaction_count": wrap_transaction_count,
        "approval_transaction_count": approval_transaction_count,
        "swap_transaction_count": swap_transaction_count,
        "deployment_transaction_count": deployment_transaction_count,
        "contract_funding_transaction_count": contract_funding_transaction_count,
        "execute_transaction_count": execute_transaction_count,
        "wrap_gas_units_per_wallet": wrap_gas_units_per_wallet,
        "approval_gas_units_per_wallet": approval_gas_units_per_wallet,
        "swap_gas_units_per_wallet": swap_gas_units_per_wallet,
        "deployment_gas_units_per_wallet": deployment_gas_units_per_wallet,
        "local_contract_funding_gas_units_per_wallet": local_contract_funding_gas_units_per_wallet,
        "main_wallet_direct_funding_gas_units_per_wallet": main_wallet_direct_funding_gas_units_per_wallet,
        "contract_funding_gas_units_per_wallet": contract_funding_gas_units_per_wallet,
        "execute_gas_units_per_wallet": execute_gas_units_per_wallet,
        "return_sweep_token_transfer_count_per_wallet": return_sweep_token_transfer_count_per_wallet,
        "return_sweep_transaction_count_per_wallet": return_sweep_transaction_count_per_wallet,
        "return_sweep_transaction_count": return_sweep_transaction_count,
        "return_sweep_gas_units_per_wallet": return_sweep_gas_units_per_wallet,
        "local_execution_gas_units_per_wallet": local_execution_gas_units_per_wallet,
        "local_execution_gas_units_total": local_execution_gas_units_total,
        "local_execution_stage_gas_units_per_wallet": local_execution_stage_gas_units_per_wallet,
        "local_execution_stage_gas_units_total": local_execution_stage_gas_units_total,
        "local_execution_gas_fee_eth_per_wallet": wei_to_decimal(local_execution_gas_fee_wei_per_wallet),
        "local_execution_gas_fee_eth_total": wei_to_decimal(local_execution_gas_fee_wei_total),
        "gas_price_wei": gas_price_wei,
        "fund_subwallet_gas_price_wei": fund_subwallet_gas_price_wei,
        "top_up_gas_price_wei": top_up_gas_price_wei,
        "wrap_gas_price_wei": wrap_gas_price_wei,
        "approval_gas_price_wei": approval_gas_price_wei,
        "swap_gas_price_wei": swap_gas_price_wei,
        "deployment_gas_price_wei": deployment_gas_price_wei,
        "fund_treasury_gas_price_wei": fund_treasury_gas_price_wei,
        "batch_send_gas_price_wei": batch_send_gas_price_wei,
        "return_sweep_gas_price_wei": return_sweep_gas_price_wei,
    }


def _build_route_preflight_status(template: dict):
    chain = template.get("chain") or DEFAULT_TEMPLATE_CHAIN
    chain_config = get_template_chain_config(chain)
    funded_routes = [
        route
        for route in build_template_stablecoin_routes(template, contract_count=1)
        if Decimal(str(route.get("per_contract_weth_amount") or "0")) > 0
    ]
    if not funded_routes:
        return {"available": True, "errors": []}

    errors = []
    for route in funded_routes:
        try:
            quote_uniswap_swap(
                chain_config["wrapped_native_symbol"],
                route["token_address"],
                route["per_contract_weth_amount"],
                fee_tier=template.get("fee_tier"),
                slippage_percent=template.get("slippage_percent"),
                chain=chain,
            )
        except Exception as exc:
            normalized_error = _normalize_route_error_message(str(exc)) or str(exc)
            errors.append(f"{route['token_symbol']}: {normalized_error}")

    return {
        "available": len(errors) == 0,
        "errors": errors,
    }


def _build_auto_top_up_projection(
    template: dict,
    contract_count: int,
    *,
    required_eth_per_contract: Decimal,
    required_weth_per_contract: Decimal,
    reserved_native_eth_per_contract: Decimal,
    execution_estimate: dict,
):
    enabled = bool(template.get("auto_top_up_enabled", False))
    threshold = Decimal(str(template.get("auto_top_up_threshold_eth") or "0"))
    target = Decimal(str(template.get("auto_top_up_target_eth") or "0"))
    top_up_gas_price_wei = Decimal(str(execution_estimate.get("top_up_gas_price_wei") or "0"))
    wrap_gas_price_wei = Decimal(str(execution_estimate.get("wrap_gas_price_wei") or "0"))
    wrap_gas_units_per_wallet = int(execution_estimate.get("wrap_gas_units_per_wallet") or 0)
    wrap_gas_fee_eth_per_wallet = wei_to_decimal(int(wrap_gas_price_wei) * wrap_gas_units_per_wallet)
    projected_post_wrap_eth_per_wallet = max(
        required_eth_per_contract - required_weth_per_contract - reserved_native_eth_per_contract - wrap_gas_fee_eth_per_wallet,
        Decimal("0"),
    )
    projected_triggered = (
        enabled
        and (required_weth_per_contract > 0 or reserved_native_eth_per_contract > 0)
        and projected_post_wrap_eth_per_wallet <= threshold
        and target > projected_post_wrap_eth_per_wallet
    )
    projected_top_up_eth_per_wallet = (
        target - projected_post_wrap_eth_per_wallet
        if projected_triggered
        else Decimal("0")
    )
    projected_transaction_count = contract_count if projected_top_up_eth_per_wallet > 0 else 0
    projected_total_eth = projected_top_up_eth_per_wallet * Decimal(contract_count)
    projected_network_fee_eth = wei_to_decimal(
        int(top_up_gas_price_wei) * ETH_TRANSFER_GAS_LIMIT * projected_transaction_count
    )

    return {
        "enabled": enabled,
        "threshold_eth": _format_decimal(threshold),
        "target_eth": _format_decimal(target),
        "projected_post_wrap_eth_per_contract": _format_decimal(projected_post_wrap_eth_per_wallet),
        "projected_triggered": projected_triggered,
        "projected_eth_per_contract": _format_decimal(projected_top_up_eth_per_wallet),
        "projected_total_eth": _format_decimal(projected_total_eth),
        "projected_transaction_count": projected_transaction_count,
        "projected_network_fee_eth": _format_decimal(projected_network_fee_eth),
    }


def _build_template_cost_snapshot(template: dict, contract_count: int, *, include_live_market: bool = False):
    chain_config = get_template_chain_config(template.get("chain"))
    gas_reserve = Decimal(str(template["gas_reserve_eth_per_contract"]))
    swap_budget = Decimal(str(template["swap_budget_eth_per_contract"]))
    direct_contract_native_eth = Decimal(str(template.get("direct_contract_native_eth_per_contract") or "0"))
    direct_weth = Decimal(str(template["direct_contract_weth_per_contract"]))
    contract_count_decimal = Decimal(contract_count)
    gas_price_wei = _get_estimated_gas_price_wei(template.get("chain"))
    execution_estimate = _build_template_execution_estimate(
        template,
        contract_count,
        gas_price_wei=gas_price_wei,
    )

    local_wrap_eth_per_contract = swap_budget
    configured_unwrapped_eth_per_contract = gas_reserve
    minimum_unwrapped_eth_per_contract = max(
        configured_unwrapped_eth_per_contract,
        Decimal(str(execution_estimate["local_execution_gas_fee_eth_per_wallet"])),
    )
    auto_added_gas_buffer_eth_per_contract = max(
        minimum_unwrapped_eth_per_contract - configured_unwrapped_eth_per_contract,
        Decimal("0"),
    )
    required_eth_per_contract = minimum_unwrapped_eth_per_contract + local_wrap_eth_per_contract
    required_weth_per_contract = execution_estimate["required_weth_per_contract"]
    required_eth_total = required_eth_per_contract * contract_count_decimal
    required_weth_total = required_weth_per_contract * contract_count_decimal
    direct_contract_native_eth_total = direct_contract_native_eth * contract_count_decimal
    direct_contract_weth_total = direct_weth * contract_count_decimal
    auto_top_up = _build_auto_top_up_projection(
        template,
        contract_count,
        required_eth_per_contract=required_eth_per_contract,
        required_weth_per_contract=required_weth_per_contract,
        reserved_native_eth_per_contract=Decimal("0"),
        execution_estimate=execution_estimate,
    )
    funding_transaction_count = contract_count if required_eth_per_contract > 0 else 0
    funding_stage_gas_price_wei = Decimal(str(execution_estimate.get("fund_subwallet_gas_price_wei") or "0"))
    top_up_stage_gas_price_wei = Decimal(str(execution_estimate.get("top_up_gas_price_wei") or "0"))
    wrap_stage_gas_price_wei = Decimal(str(execution_estimate.get("wrap_gas_price_wei") or "0"))
    fund_treasury_stage_gas_price_wei = Decimal(str(execution_estimate.get("fund_treasury_gas_price_wei") or "0"))
    funding_network_fee_eth = wei_to_decimal(int(funding_stage_gas_price_wei) * ETH_TRANSFER_GAS_LIMIT * funding_transaction_count)
    projected_auto_top_up_eth_total = Decimal(str(auto_top_up.get("projected_total_eth") or "0"))
    top_up_network_fee_eth = Decimal(str(auto_top_up.get("projected_network_fee_eth") or "0"))
    main_wallet_weth_wrap_count = 1 if direct_contract_weth_total > 0 else 0
    main_wallet_weth_wrap_network_fee_eth = wei_to_decimal(
        int(wrap_stage_gas_price_wei) * WETH_DEPOSIT_GAS_LIMIT * main_wallet_weth_wrap_count
    )
    main_wallet_direct_funding_network_fee_eth = wei_to_decimal(
        int(fund_treasury_stage_gas_price_wei)
        * int(execution_estimate.get("main_wallet_direct_funding_gas_units_per_wallet") or 0)
        * contract_count
    )
    contract_sync_network_fee_eth = Decimal("0")
    total_network_fee_eth = (
        Decimal(str(execution_estimate["local_execution_gas_fee_eth_total"]))
        + funding_network_fee_eth
        + top_up_network_fee_eth
        + main_wallet_direct_funding_network_fee_eth
        + main_wallet_weth_wrap_network_fee_eth
        + contract_sync_network_fee_eth
    )
    total_eth_required_with_fees = (
        required_eth_total
        + direct_contract_native_eth_total
        + direct_contract_weth_total
        + projected_auto_top_up_eth_total
        + funding_network_fee_eth
        + top_up_network_fee_eth
        + main_wallet_direct_funding_network_fee_eth
        + main_wallet_weth_wrap_network_fee_eth
        + contract_sync_network_fee_eth
    )

    stablecoin_addresses = [allocation["token_address"] for allocation in template["stablecoin_allocations"]]
    market_snapshot = (
        get_market_snapshot(
            stablecoin_addresses,
            chain_config["wrapped_native_address"],
            asset_platform=chain_config["coingecko_asset_platform"],
            native_coin_id=chain_config["coingecko_native_coin_id"],
        )
        if include_live_market
        else _empty_market_snapshot()
    )
    stablecoin_quotes = [
        _build_allocation_preview(
            template,
            allocation,
            template["stablecoin_distribution_mode"],
            swap_budget,
            contract_count,
            market_snapshot,
            include_live_market=include_live_market,
        )
        for allocation in template["stablecoin_allocations"]
    ]

    total_output_usd = (
        sum(
            Decimal(str(item["total_output_usd"]))
            for item in stablecoin_quotes
            if item.get("total_output_usd") is not None
        )
        if any(item.get("total_output_usd") is not None for item in stablecoin_quotes)
        else None
    )

    required_eth_total_usd = _usd_value(required_eth_total, market_snapshot.get("eth_usd")) if include_live_market else None
    required_weth_total_usd = _usd_value(required_weth_total, market_snapshot.get("weth_usd")) if include_live_market else None
    projected_auto_top_up_eth_total_usd = (
        _usd_value(projected_auto_top_up_eth_total, market_snapshot.get("eth_usd"))
        if include_live_market
        else None
    )
    total_network_fee_eth_usd = (
        _usd_value(total_network_fee_eth, market_snapshot.get("eth_usd"))
        if include_live_market
        else None
    )
    total_eth_required_with_fees_usd = (
        _usd_value(total_eth_required_with_fees, market_snapshot.get("eth_usd"))
        if include_live_market
        else None
    )
    combined_cost_usd = total_eth_required_with_fees_usd

    return {
        "contract_count": contract_count,
        "slippage_percent": template["slippage_percent"],
        "fee_tier": template.get("fee_tier"),
        "return_wallet_address": template.get("return_wallet_address"),
        "testing_recipient_address": _get_testing_recipient_address(template),
        "test_auto_execute_after_funding": _get_test_auto_batch_send_enabled(template),
        "test_auto_batch_send_after_funding": _get_test_auto_batch_send_enabled(template),
        "auto_top_up": auto_top_up,
        "per_contract": {
            "gas_reserve_eth": _format_decimal(gas_reserve),
            "swap_budget_eth": _format_decimal(swap_budget),
            "direct_contract_native_eth": _format_decimal(direct_contract_native_eth),
            "direct_contract_weth": _format_decimal(direct_weth),
            "return_wallet_address": template.get("return_wallet_address"),
            "auto_top_up_threshold_eth": auto_top_up["threshold_eth"],
            "auto_top_up_target_eth": auto_top_up["target_eth"],
            "projected_auto_top_up_eth": auto_top_up["projected_eth_per_contract"],
            "configured_unwrapped_eth": _format_decimal(configured_unwrapped_eth_per_contract),
            "minimum_unwrapped_eth": _format_decimal(minimum_unwrapped_eth_per_contract),
            "auto_added_gas_buffer_eth": _format_decimal(auto_added_gas_buffer_eth_per_contract),
            "local_execution_gas_fee_eth": _format_decimal(Decimal(str(execution_estimate["local_execution_gas_fee_eth_per_wallet"]))),
            "required_eth": _format_decimal(required_eth_per_contract),
            "required_weth": _format_decimal(required_weth_per_contract),
            "total_eth_if_no_weth_available": _format_decimal(
                required_eth_per_contract + direct_contract_native_eth + direct_weth
            ),
        },
        "totals": {
            "required_eth_total": _format_decimal(required_eth_total),
            "required_weth_total": _format_decimal(required_weth_total),
            "gas_reserve_eth_total": _format_decimal(gas_reserve * contract_count_decimal),
            "swap_budget_eth_total": _format_decimal(swap_budget * contract_count_decimal),
            "direct_contract_native_eth_total": _format_decimal(direct_contract_native_eth_total),
            "direct_contract_weth_total": _format_decimal(direct_contract_weth_total),
            "projected_auto_top_up_eth_total": auto_top_up["projected_total_eth"],
            "projected_auto_top_up_eth_total_usd": projected_auto_top_up_eth_total_usd,
            "configured_unwrapped_eth_total": _format_decimal(configured_unwrapped_eth_per_contract * contract_count_decimal),
            "minimum_unwrapped_eth_total": _format_decimal(minimum_unwrapped_eth_per_contract * contract_count_decimal),
            "auto_added_gas_buffer_eth_total": _format_decimal(auto_added_gas_buffer_eth_per_contract * contract_count_decimal),
            "local_execution_gas_fee_eth_total": _format_decimal(Decimal(str(execution_estimate["local_execution_gas_fee_eth_total"]))),
            "total_network_fee_eth": _format_decimal(total_network_fee_eth),
            "total_network_fee_eth_usd": total_network_fee_eth_usd,
            "total_eth_if_no_weth_available_total": _format_decimal(
                required_eth_total + direct_contract_native_eth_total + direct_contract_weth_total
            ),
            "total_eth_required_with_fees": _format_decimal(total_eth_required_with_fees),
            "total_eth_required_with_fees_usd": total_eth_required_with_fees_usd,
            "required_eth_total_usd": required_eth_total_usd,
            "required_weth_total_usd": required_weth_total_usd,
            "combined_cost_usd": combined_cost_usd,
            "stablecoin_output_total_usd": _format_decimal(total_output_usd) if total_output_usd is not None else None,
        },
        "stablecoin_distribution_mode": template["stablecoin_distribution_mode"],
        "stablecoin_quotes": stablecoin_quotes,
        "price_snapshot": market_snapshot,
        "execution_estimate": {
            "estimated_gas_price_gwei": _format_decimal(gas_price_wei / Decimal("1000000000")),
            "fund_subwallet_gas_price_wei": _format_decimal(Decimal(str(execution_estimate["fund_subwallet_gas_price_wei"]))),
            "top_up_gas_price_wei": _format_decimal(Decimal(str(execution_estimate["top_up_gas_price_wei"]))),
            "wrap_gas_price_wei": _format_decimal(Decimal(str(execution_estimate["wrap_gas_price_wei"]))),
            "approval_gas_price_wei": _format_decimal(Decimal(str(execution_estimate["approval_gas_price_wei"]))),
            "swap_gas_price_wei": _format_decimal(Decimal(str(execution_estimate["swap_gas_price_wei"]))),
            "deployment_gas_price_wei": _format_decimal(Decimal(str(execution_estimate["deployment_gas_price_wei"]))),
            "fund_treasury_gas_price_wei": _format_decimal(Decimal(str(execution_estimate["fund_treasury_gas_price_wei"]))),
            "batch_send_gas_price_wei": _format_decimal(Decimal(str(execution_estimate["batch_send_gas_price_wei"]))),
            "return_sweep_gas_price_wei": _format_decimal(Decimal(str(execution_estimate["return_sweep_gas_price_wei"]))),
            "wrap_transaction_count": execution_estimate["wrap_transaction_count"],
            "approval_transaction_count": execution_estimate["approval_transaction_count"],
            "swap_transaction_count": execution_estimate["swap_transaction_count"],
            "deployment_transaction_count": execution_estimate["deployment_transaction_count"],
            "contract_funding_transaction_count": execution_estimate["contract_funding_transaction_count"],
            "contract_funding_gas_units_per_wallet": execution_estimate["contract_funding_gas_units_per_wallet"],
            "main_wallet_direct_funding_gas_units_per_wallet": execution_estimate["main_wallet_direct_funding_gas_units_per_wallet"],
            "execute_transaction_count": execution_estimate["execute_transaction_count"],
            "top_up_transaction_count": auto_top_up["projected_transaction_count"],
            "top_up_network_fee_eth": auto_top_up["projected_network_fee_eth"],
            "execute_gas_units_per_wallet": execution_estimate["execute_gas_units_per_wallet"],
            "return_sweep_transaction_count": execution_estimate["return_sweep_transaction_count"],
            "return_sweep_gas_units_per_wallet": execution_estimate["return_sweep_gas_units_per_wallet"],
            "local_execution_gas_units_per_wallet": execution_estimate["local_execution_gas_units_per_wallet"],
            "local_execution_gas_units_total": execution_estimate["local_execution_gas_units_total"],
            "local_execution_gas_fee_eth_per_wallet": _format_decimal(Decimal(str(execution_estimate["local_execution_gas_fee_eth_per_wallet"]))),
            "local_execution_gas_fee_eth_total": _format_decimal(Decimal(str(execution_estimate["local_execution_gas_fee_eth_total"]))),
            "route_count": execution_estimate["route_count"],
            "deployment_targets_per_wallet": execution_estimate["deployment_targets_per_wallet"],
        },
    }


def get_template_options(chain: str | None = None):
    ensure_builtin_templates_seeded()
    normalized_chain = normalize_template_chain(chain)
    chain_config = get_template_chain_config(normalized_chain)
    swap_backends = get_template_chain_swap_backends(normalized_chain)
    primary_backend = swap_backends[0] if swap_backends else None
    primary_backend_label = get_swap_backend_label(primary_backend)
    fallback_backend_labels = [get_swap_backend_label(backend) for backend in swap_backends[1:]]
    if not chain_config.get("quote_supported"):
        fee_tiers = [
            {
                "value": None,
                "label": "Routing unavailable",
                "description": f"Live swap routing is not configured for {chain_config['label']} yet.",
            }
        ]
        swap_settings_note = (
            f"Token selection and pricing are available for {chain_config['label']}, "
            "but live swap quoting and swap execution are not wired in this build yet. "
            "Keep the swap budget at 0 for now."
        )
    else:
        fee_tiers = [
            {
                "value": None,
                "label": "Auto best route",
                "description": "Try standard Uniswap V3 fee tiers and keep the best quote.",
            },
            {
                "value": 500,
                "label": "0.05%",
                "description": "Use the 500 fee tier pool when you want the tightest pool fee.",
            },
            {
                "value": 3000,
                "label": "0.30%",
                "description": "Use the 3000 fee tier pool, often the most liquid default.",
            },
            {
                "value": 10000,
                "label": "1.00%",
                "description": "Use the 10000 fee tier pool for tokens that route there best.",
            },
        ]
        swap_settings_note = (
            f"Primary routing uses {primary_backend_label}. "
            + (
                f"Fallback order: {', '.join(fallback_backend_labels)}. "
                if fallback_backend_labels
                else ""
            )
            + "Slippage sets your minimum received guardrail. Fee tier can stay on auto unless you want to force a V3 pool fee."
        )

    return {
        "available_chains": get_template_chain_choices(),
        "selected_chain": normalized_chain,
        "native_symbol": chain_config["native_symbol"],
        "wrapped_native_symbol": chain_config["wrapped_native_symbol"],
        "quote_supported": chain_config["quote_supported"],
        "primary_swap_backend": primary_backend,
        "primary_swap_backend_label": primary_backend_label,
        "fallback_swap_backends": swap_backends[1:],
        "fallback_swap_backend_labels": fallback_backend_labels,
        "stablecoins": get_template_chain_token_options(normalized_chain),
        "distribution_modes": [
            {
                "value": "none",
                "label": "No swap",
                "description": (
                    f"Keep this template focused on gas, sub-wallet {chain_config['native_symbol']}, and optional "
                    f"direct contract {chain_config['native_symbol']}/{chain_config['wrapped_native_symbol']} funding only."
                ),
            },
            {
                "value": "equal",
                "label": "Equal split",
                "description": "Split the per-contract swap budget evenly across the selected tokens.",
            },
            {
                "value": "manual_percent",
                "label": "Manual %",
                "description": "Assign exact percentages across the selected tokens.",
            },
            {
                "value": "manual_weth_amount",
                "label": f"Manual exact {chain_config['wrapped_native_symbol']}",
                "description": (
                    f"Assign exact {chain_config['wrapped_native_symbol']} amounts per contract across the selected tokens."
                ),
            },
        ],
        "fee_tiers": fee_tiers,
        "defaults": {
            "chain": normalized_chain,
            "template_version": TEMPLATE_VERSION_V2,
            "recipient_address": None,
            "testing_recipient_address": None,
            "return_wallet_address": None,
            "test_auto_execute_after_funding": False,
            "test_auto_batch_send_after_funding": False,
            "gas_reserve_eth_per_contract": "0.02",
            "swap_budget_eth_per_contract": "0",
            "direct_contract_eth_per_contract": "0",
            "direct_contract_native_eth_per_contract": "0",
            "direct_contract_weth_per_contract": "0",
            "auto_top_up_enabled": False,
            "auto_top_up_threshold_eth": "0",
            "auto_top_up_target_eth": "0",
            "slippage_percent": "0.5",
            "fee_tier": None,
            "auto_wrap_eth_to_weth": True,
            "stablecoin_distribution_mode": "none",
            "stablecoin_allocations": [],
        },
        "hints": {
            "summary": f"This template defines one contract / one subwallet on {chain_config['label']}.",
            "swap_budget_note": (
                f"Token swaps use {chain_config['wrapped_native_symbol']}, but the run funds "
                f"{chain_config['native_symbol']} first and wraps only the required "
                f"{chain_config['wrapped_native_symbol']} amount inside each sub-wallet."
            ),
            "swap_settings_note": swap_settings_note,
            "auto_top_up_note": (
                f"If a sub-wallet's post-wrap {chain_config['native_symbol']} balance falls to or below the trigger, "
                f"the run can send a second {chain_config['native_symbol']} transfer from the main wallet to refill it to the target before swaps and deployments continue."
            ),
            "return_wallet_note": (
                f"If set, the run sweeps leftover {chain_config['native_symbol']}, {chain_config['wrapped_native_symbol']}, "
                f"and supported token balances from each sub-wallet into this address after execution. This is a sub-wallet cleanup destination, not the testing payout target."
            ),
            "test_auto_execute_note": (
                "Testing only. This must stay enabled whenever BatchTreasuryDistributor will be funded. "
                "After deployment and funding, the sub-wallet immediately calls batchSend() and sends every funded "
                "asset entry to testing_recipient_address."
            ),
        },
        "contract_sync": get_registry_integration_status(),
    }


def get_template_editor_market_snapshot(chain: str | None = None):
    normalized_chain = normalize_template_chain(chain)
    chain_config = get_template_chain_config(normalized_chain)
    stablecoin_addresses = [coin["address"] for coin in chain_config["tokens"]]
    return get_market_snapshot(
        stablecoin_addresses,
        chain_config["wrapped_native_address"],
        asset_platform=chain_config["coingecko_asset_platform"],
        native_coin_id=chain_config["coingecko_native_coin_id"],
    )


def list_templates():
    ensure_builtin_templates_seeded()
    templates = []
    for record in db.list_templates():
        template = _deserialize_template_record(record)
        if template and template.get("is_active", True):
            templates.append(template)
    return templates


def get_template(template_id: str):
    ensure_builtin_templates_seeded()
    template = _deserialize_template_record(db.get_template(template_id))
    if not template or not template.get("is_active", True):
        return None
    return template


def build_template_stablecoin_routes(template: dict, contract_count: int = 1):
    swap_budget = Decimal(str(template["swap_budget_eth_per_contract"]))
    market_snapshot = _empty_market_snapshot()
    return [
        _build_allocation_preview(
            template,
            allocation,
            template["stablecoin_distribution_mode"],
            swap_budget,
            contract_count,
            market_snapshot,
            include_live_market=False,
        )
        for allocation in template.get("stablecoin_allocations") or []
    ]


def refresh_template_route_statuses(template_id: str | None = None):
    if template_id:
        template = get_template(template_id)
        if not template:
            raise ValueError("Template not found")
        templates = [template]
    else:
        templates = list_templates()

    refreshed_templates = []
    for template in templates:
        updated_allocations = []
        token_results = []
        has_changes = False

        for allocation in template.get("stablecoin_allocations") or []:
            route_probe = _probe_template_allocation_route(template, allocation)
            next_allocation = {
                key: value
                for key, value in allocation.items()
                if key not in {"route_status", "route_error"}
            }
            if not route_probe["tested"]:
                next_allocation = dict(allocation)
            else:
                if route_probe["route_status"] == ROUTE_STATUS_NO_ROUTE_FOUND:
                    next_allocation["route_status"] = route_probe["route_status"]
                if route_probe["route_error"] == ROUTE_STATUS_NO_ROUTE_FOUND:
                    next_allocation["route_error"] = route_probe["route_error"]

            if next_allocation != allocation:
                has_changes = True

            updated_allocations.append(next_allocation)
            token_results.append(
                {
                    "token_symbol": next_allocation.get("token_symbol"),
                    "token_address": next_allocation.get("token_address"),
                    "tested": route_probe["tested"],
                    "route_status": next_allocation.get("route_status"),
                    "route_error": next_allocation.get("route_error"),
                }
            )

        next_template = {**template, "stablecoin_allocations": updated_allocations}
        if has_changes:
            db.upsert_template(_serialize_template_for_storage(next_template))

        refreshed_templates.append(
            {
                "template_id": template["id"],
                "template_name": template["name"],
                "chain": template.get("chain"),
                "updated": has_changes,
                "tokens": token_results,
            }
        )

    return {"templates": refreshed_templates}


def _normalize_template_name(value: str) -> str:
    return value.strip().casefold()


def _ensure_unique_template_name(name: str, current_template_id: str | None = None):
    normalized = _normalize_template_name(name)
    for existing in list_templates():
        if current_template_id and existing.get("id") == current_template_id:
            continue
        if _normalize_template_name(existing.get("name") or "") == normalized:
            raise ValueError("Template name already exists")


def market_check_template(template_id: str, contract_count: int = 1):
    if contract_count < 1 or contract_count > MAX_TEMPLATE_PREVIEW_COUNT:
        raise ValueError(f"contract_count must be between 1 and {MAX_TEMPLATE_PREVIEW_COUNT}")

    template = get_template(template_id)
    if not template:
        raise ValueError("Template not found")

    return {
        "template_id": template["id"],
        "template_name": template["name"],
        **_build_template_cost_snapshot(template, contract_count, include_live_market=True),
    }


def create_template(payload: dict):
    template_id = f"template_{int(datetime.utcnow().timestamp())}_{uuid4().hex[:8]}"
    template = _build_template_payload(template_id, payload)
    _ensure_unique_template_name(template["name"])
    return _deserialize_template_record(db.upsert_template(_serialize_template_for_storage(template)))


def update_template(template_id: str, payload: dict):
    existing = _deserialize_template_record(db.get_template(template_id))
    if not existing:
        raise ValueError("Template not found")

    template = _build_template_payload(template_id, payload, created_at=existing.get("created_at"))
    _ensure_unique_template_name(template["name"], current_template_id=template_id)
    template["is_active"] = existing.get("is_active", True)
    template["source"] = existing.get("source") or DEFAULT_TEMPLATE_SOURCE
    return _deserialize_template_record(db.upsert_template(_serialize_template_for_storage(template)))


def soft_delete_template(template_id: str):
    existing = _deserialize_template_record(db.get_template(template_id))
    if not existing:
        raise ValueError("Template not found")

    existing["is_active"] = False
    db.upsert_template(_serialize_template_for_storage(existing))
    return {"id": template_id, "deleted": True}


def preview_template(wallet_id: str, template_id: str, contract_count: int):
    if contract_count < 1 or contract_count > MAX_TEMPLATE_PREVIEW_COUNT:
        raise ValueError(f"contract_count must be between 1 and {MAX_TEMPLATE_PREVIEW_COUNT}")

    template = get_template(template_id)
    if not template:
        raise ValueError("Template not found")
    chain = template.get("chain") or DEFAULT_TEMPLATE_CHAIN
    chain_config = get_template_chain_config(chain)

    from src.services.wallet_service import get_wallet_summary

    wallet = get_wallet_summary(wallet_id, chain=chain)
    if not wallet:
        raise ValueError("Wallet not found")
    if wallet.get("type") == "sub":
        raise ValueError("Select a main wallet to preview template costs")
    if wallet.get("eth_balance") is None or wallet.get("weth_balance") is None:
        raise RuntimeError(wallet.get("balance_error") or "Live wallet balances are unavailable")

    cost_snapshot = _build_template_cost_snapshot(template, contract_count, include_live_market=False)
    required_eth_total = Decimal(str(cost_snapshot["totals"]["required_eth_total"]))
    required_weth_total = Decimal(str(cost_snapshot["totals"]["required_weth_total"]))
    required_eth_per_contract = Decimal(str(cost_snapshot["per_contract"]["required_eth"]))
    required_weth_per_contract = Decimal(str(cost_snapshot["per_contract"]["required_weth"]))
    local_execution_gas_fee_eth_per_wallet = Decimal(str(cost_snapshot["per_contract"]["local_execution_gas_fee_eth"]))
    local_execution_gas_fee_eth_total = Decimal(str(cost_snapshot["totals"]["local_execution_gas_fee_eth_total"]))
    projected_auto_top_up_eth_total = Decimal(str(cost_snapshot["totals"].get("projected_auto_top_up_eth_total") or "0"))
    recipient_address = _get_testing_recipient_address(template)
    execution_estimate = cost_snapshot["execution_estimate"]
    deployment_contracts_per_wallet = int(execution_estimate["deployment_targets_per_wallet"])
    requires_recipient = deployment_contracts_per_wallet > 0
    test_auto_batch_send_enabled = _get_test_auto_batch_send_enabled(template)

    available_eth = Decimal(str(wallet["eth_balance"]))
    available_weth = Decimal(str(wallet["weth_balance"]))
    direct_contract_native_eth_total = Decimal(str(cost_snapshot["totals"].get("direct_contract_native_eth_total") or "0"))
    direct_contract_weth_total = Decimal(str(cost_snapshot["totals"].get("direct_contract_weth_total") or "0"))
    weth_from_main_wallet = direct_contract_weth_total
    weth_from_existing_main_wallet = min(available_weth, direct_contract_weth_total)
    main_wallet_weth_wrapped = max(direct_contract_weth_total - available_weth, Decimal("0"))
    funding_transaction_count = contract_count if required_eth_per_contract > 0 else 0
    wrap_transaction_count = int(execution_estimate["wrap_transaction_count"])
    approval_transaction_count = int(execution_estimate["approval_transaction_count"])
    swap_transaction_count = int(execution_estimate["swap_transaction_count"])
    deployment_transaction_count = int(execution_estimate["deployment_transaction_count"])
    contract_funding_transaction_count = int(execution_estimate["contract_funding_transaction_count"])
    main_wallet_wrap_transaction_count = 1 if main_wallet_weth_wrapped > 0 else 0
    funding_gas_units = ETH_TRANSFER_GAS_LIMIT * funding_transaction_count
    main_wallet_wrap_gas_units = WETH_DEPOSIT_GAS_LIMIT * main_wallet_wrap_transaction_count
    funding_gas_price_wei = Decimal(str(execution_estimate.get("fund_subwallet_gas_price_wei") or "0"))
    wrap_gas_price_wei = Decimal(str(execution_estimate.get("wrap_gas_price_wei") or "0"))
    fund_treasury_gas_price_wei = Decimal(str(execution_estimate.get("fund_treasury_gas_price_wei") or "0"))
    main_wallet_direct_funding_gas_units = (
        int(execution_estimate.get("main_wallet_direct_funding_gas_units_per_wallet") or 0) * contract_count
    )
    total_execution_gas_units = (
        funding_gas_units
        + int(execution_estimate["local_execution_gas_units_total"])
        + main_wallet_direct_funding_gas_units
        + main_wallet_wrap_gas_units
    )
    funding_network_fee_eth = wei_to_decimal(int(funding_gas_price_wei) * funding_gas_units)
    main_wallet_direct_funding_network_fee_eth = wei_to_decimal(
        int(fund_treasury_gas_price_wei) * main_wallet_direct_funding_gas_units
    )
    main_wallet_wrap_network_fee_eth = wei_to_decimal(int(wrap_gas_price_wei) * main_wallet_wrap_gas_units)
    registry_sync_preview = build_registry_sync_preview(
        wallet["address"],
        contract_count,
        template.get("stablecoin_allocations") or [],
    )
    contract_record_count = int(registry_sync_preview["expected_action_count"])
    contract_sync_transaction_count = 0
    contract_sync_network_fee_eth = Decimal(str(registry_sync_preview["fee_eth"] or "0"))
    top_up_transaction_count = int(execution_estimate.get("top_up_transaction_count") or 0)
    execute_transaction_count = int(execution_estimate.get("execute_transaction_count") or 0)
    route_preflight = _build_route_preflight_status(template)
    top_up_network_fee_eth = Decimal(str(execution_estimate.get("top_up_network_fee_eth") or "0"))
    top_up_gas_units = ETH_TRANSFER_GAS_LIMIT * top_up_transaction_count
    return_sweep_transaction_count = int(execution_estimate.get("return_sweep_transaction_count") or 0)
    total_network_fee_eth = (
        Decimal(str(cost_snapshot["totals"]["local_execution_gas_fee_eth_total"]))
        + funding_network_fee_eth
        + top_up_network_fee_eth
        + main_wallet_direct_funding_network_fee_eth
        + main_wallet_wrap_network_fee_eth
        + contract_sync_network_fee_eth
    )
    wrappable_eth = main_wallet_weth_wrapped
    effective_weth_available = weth_from_existing_main_wallet + main_wallet_weth_wrapped
    weth_from_wrapped_eth = required_weth_total
    total_eth_deducted = required_eth_total + direct_contract_native_eth_total + main_wallet_weth_wrapped
    total_eth_required_with_fees = (
        total_eth_deducted
        + projected_auto_top_up_eth_total
        + funding_network_fee_eth
        + top_up_network_fee_eth
        + main_wallet_direct_funding_network_fee_eth
        + main_wallet_wrap_network_fee_eth
        + contract_sync_network_fee_eth
    )
    remaining_eth_after_funding = available_eth - total_eth_deducted
    remaining_eth_after_run = available_eth - total_eth_required_with_fees
    remaining_weth_after_funding = max(available_weth - weth_from_existing_main_wallet, Decimal("0"))
    total_transaction_count = (
        funding_transaction_count
        + top_up_transaction_count
        + execute_transaction_count
        + wrap_transaction_count
        + approval_transaction_count
        + swap_transaction_count
        + deployment_transaction_count
        + contract_funding_transaction_count
        + return_sweep_transaction_count
        + main_wallet_wrap_transaction_count
    )
    can_proceed = (
        available_eth >= total_eth_required_with_fees
        and (not requires_recipient or bool(recipient_address))
        and (not requires_recipient or test_auto_batch_send_enabled)
        and route_preflight["available"]
    )

    shortfall_reason = None
    if requires_recipient and not recipient_address:
        shortfall_reason = (
            "testing_recipient_address is required for templates that swap into BatchTreasuryDistributor "
            f"or fund direct contract {chain_config['native_symbol']}/{chain_config['wrapped_native_symbol']} distributors."
        )
    elif requires_recipient and not test_auto_batch_send_enabled:
        shortfall_reason = (
            "Testing only currently requires test_auto_batch_send_after_funding for templates that fund "
            "BatchTreasuryDistributor, because the app does not yet expose a later release path for those assets."
        )
    elif available_eth < required_eth_total:
        shortfall_reason = (
            f"Not enough {chain_config['native_symbol']} in the main wallet. "
            f"Need {_format_decimal(required_eth_total - available_eth)} more {chain_config['native_symbol']} "
            f"to fund gas reserve, sub-wallet {chain_config['native_symbol']}, "
            f"automatic local execution gas headroom, and the local {chain_config['wrapped_native_symbol']} swap budget for the new subwallets."
        )
    elif available_eth < total_eth_deducted:
        shortfall_reason = (
            f"Not enough {chain_config['native_symbol']} in the main wallet. "
            f"Need {_format_decimal(total_eth_deducted - available_eth)} more {chain_config['native_symbol']} "
            f"to fund the sub-wallets, send direct contract {chain_config['native_symbol']}, "
            f"and cover any direct contract {chain_config['wrapped_native_symbol']} wrap shortfall on the main wallet."
        )
    elif available_eth < total_eth_required_with_fees:
        shortfall_reason = (
            f"Not enough {chain_config['native_symbol']} in the main wallet. "
            f"Need {_format_decimal(total_eth_required_with_fees - available_eth)} more {chain_config['native_symbol']} "
            "to fund the new subwallets, reserve any projected auto top-ups, and cover the main-wallet funding transaction fees."
        )
    elif not route_preflight["available"]:
        shortfall_reason = (
            f"Live swap routing is unavailable for {chain_config['label']} on: "
            + "; ".join(route_preflight["errors"])
        )

    preview_issue = None
    if requires_recipient and not recipient_address:
        preview_issue = _build_template_preview_issue(
            "missing_recipient",
            "Recipient address required",
            "This template funds BatchTreasuryDistributor, so a testing recipient address is required before automation can start.",
            details=[
                f"Template: {template.get('name') or template.get('id')}",
                f"Chain: {chain_config['label']}",
                "testing_recipient_address is currently empty.",
                f"Wallets to create: {contract_count}",
            ],
            hint="Open the template, set testing_recipient_address (or recipient_address), then run the automation check again.",
            context={
                "chain": chain,
                "chain_label": chain_config["label"],
                "native_symbol": chain_config["native_symbol"],
                "wrapped_native_symbol": chain_config["wrapped_native_symbol"],
                "contract_count": contract_count,
            },
        )
    elif requires_recipient and not test_auto_batch_send_enabled:
        preview_issue = _build_template_preview_issue(
            "testing_batch_send_required",
            "Testing batch send must be enabled",
            "This template funds BatchTreasuryDistributor, but testing auto batch send is turned off.",
            details=[
                f"Template: {template.get('name') or template.get('id')}",
                f"Chain: {chain_config['label']}",
                "test_auto_batch_send_after_funding is currently disabled.",
                "The current testing flow only supports funded treasury contracts when batchSend() runs immediately after funding.",
            ],
            hint="Enable test_auto_batch_send_after_funding before starting automation for this template.",
            context={
                "chain": chain,
                "chain_label": chain_config["label"],
                "contract_count": contract_count,
            },
        )
    elif available_eth < required_eth_total:
        missing_eth = required_eth_total - available_eth
        preview_issue = _build_template_preview_issue(
            "insufficient_native_balance",
            f"Not enough {chain_config['native_symbol']} in the main wallet",
            f"Add {_format_decimal(missing_eth)} more {chain_config['native_symbol']} before starting automation.",
            details=[
                f"Available now: {_format_decimal(available_eth)} {chain_config['native_symbol']}",
                f"Needed for subwallet funding, gas reserve, local execution, and local {chain_config['wrapped_native_symbol']} swaps: {_format_decimal(required_eth_total)} {chain_config['native_symbol']}",
                f"Wallets to create: {contract_count}",
            ],
            hint=f"Top up the main wallet, reduce the wallet count, or lower the gas reserve / swap budget for this template.",
            context={
                "chain": chain,
                "chain_label": chain_config["label"],
                "native_symbol": chain_config["native_symbol"],
                "missing_native_amount": _format_decimal(missing_eth),
                "required_native_total": _format_decimal(required_eth_total),
                "available_native": _format_decimal(available_eth),
            },
        )
    elif available_eth < total_eth_deducted:
        missing_eth = total_eth_deducted - available_eth
        preview_issue = _build_template_preview_issue(
            "insufficient_native_balance",
            f"Not enough {chain_config['native_symbol']} in the main wallet",
            f"Add {_format_decimal(missing_eth)} more {chain_config['native_symbol']} to cover the planned funding transfers.",
            details=[
                f"Available now: {_format_decimal(available_eth)} {chain_config['native_symbol']}",
                f"Needed for direct funding and required wraps before fees: {_format_decimal(total_eth_deducted)} {chain_config['native_symbol']}",
                f"Direct contract {chain_config['native_symbol']} total: {_format_decimal(direct_contract_native_eth_total)} {chain_config['native_symbol']}",
                f"Main-wallet {chain_config['wrapped_native_symbol']} wrap shortfall: {_format_decimal(main_wallet_weth_wrapped)} {chain_config['native_symbol']}",
            ],
            hint="Top up the main wallet or lower the direct contract funding and wrapped-native requirements before retrying.",
            context={
                "chain": chain,
                "chain_label": chain_config["label"],
                "native_symbol": chain_config["native_symbol"],
                "missing_native_amount": _format_decimal(missing_eth),
                "required_native_total": _format_decimal(total_eth_deducted),
                "available_native": _format_decimal(available_eth),
            },
        )
    elif available_eth < total_eth_required_with_fees:
        missing_eth = total_eth_required_with_fees - available_eth
        preview_issue = _build_template_preview_issue(
            "insufficient_native_balance",
            f"Not enough {chain_config['native_symbol']} in the main wallet",
            f"Add {_format_decimal(missing_eth)} more {chain_config['native_symbol']} to cover projected fees and reserves.",
            details=[
                f"Available now: {_format_decimal(available_eth)} {chain_config['native_symbol']}",
                f"Needed including projected fees and auto top-up reserve: {_format_decimal(total_eth_required_with_fees)} {chain_config['native_symbol']}",
                f"Projected auto top-up reserve: {_format_decimal(projected_auto_top_up_eth_total)} {chain_config['native_symbol']}",
                f"Estimated network fees: {format_wallet_decimal(total_network_fee_eth)} {chain_config['native_symbol']}",
            ],
            hint="Top up the main wallet or lower the contract count, auto top-up reserve, or gas-heavy steps before retrying.",
            context={
                "chain": chain,
                "chain_label": chain_config["label"],
                "native_symbol": chain_config["native_symbol"],
                "missing_native_amount": _format_decimal(missing_eth),
                "required_native_total": format_wallet_decimal(total_eth_required_with_fees),
                "available_native": _format_decimal(available_eth),
            },
        )
    elif not route_preflight["available"]:
        route_errors = _dedupe_preview_details(route_preflight["errors"])
        rpc_only = bool(route_errors) and all("rpc is unavailable" in item.casefold() for item in route_errors)
        no_route_count = sum(1 for item in route_errors if ROUTE_STATUS_NO_ROUTE_FOUND.casefold() in item.casefold())
        preview_issue = _build_template_preview_issue(
            "rpc_unavailable" if rpc_only else "route_unavailable",
            f"{chain_config['label']} route check failed",
            (
                f"The live preview could not verify any funded routes on {chain_config['label']} because the chain RPC is unavailable."
                if rpc_only
                else (
                    "One or more funded token routes do not currently have a usable live swap route."
                    if no_route_count
                    else f"One or more funded token routes failed the live route check on {chain_config['label']}."
                )
            ),
            details=route_errors,
            hint=(
                "Retry after the chain RPC recovers. Do not treat this result as a permanent no-route decision."
                if rpc_only
                else "Recheck or remove the listed tokens, or lower the swap budget until those funded routes are available again."
            ),
            context={
                "chain": chain,
                "chain_label": chain_config["label"],
                "native_symbol": chain_config["native_symbol"],
                "wrapped_native_symbol": chain_config["wrapped_native_symbol"],
                "route_error_count": len(route_errors),
                "no_route_count": no_route_count,
            },
        )

    return {
        "template_id": template["id"],
        "wallet_id": wallet_id,
        "contract_count": contract_count,
        "chain": chain,
        "chain_label": chain_config["label"],
        "native_symbol": chain_config["native_symbol"],
        "wrapped_native_symbol": chain_config["wrapped_native_symbol"],
        "testing_recipient_address": recipient_address,
        "return_wallet_address": template.get("return_wallet_address"),
        "test_auto_execute_after_funding": test_auto_batch_send_enabled,
        "test_auto_batch_send_after_funding": test_auto_batch_send_enabled,
        "can_proceed": can_proceed,
        "shortfall_reason": shortfall_reason,
        "balances": {
            "available_eth": _format_decimal(available_eth),
            "available_weth": _format_decimal(available_weth),
            "wrappable_eth": _format_decimal(wrappable_eth),
            "remaining_eth_after_funding": _format_decimal(remaining_eth_after_funding),
            "remaining_weth_after_funding": _format_decimal(remaining_weth_after_funding),
        },
        "funding": {
            "eth_sent_to_subwallets": _format_decimal(required_eth_total),
            "weth_sent_to_subwallets": "0",
            "weth_from_main_wallet": _format_decimal(weth_from_main_wallet),
            "weth_from_wrapped_eth": _format_decimal(weth_from_wrapped_eth),
            "main_wallet_weth_wrapped": _format_decimal(main_wallet_weth_wrapped),
            "auto_top_up_eth_reserved": _format_decimal(projected_auto_top_up_eth_total),
            "total_eth_deducted": _format_decimal(total_eth_deducted),
        },
        "effective_weth_available": _format_decimal(effective_weth_available),
        "execution": {
            "funding_network_fee_eth": format_wallet_decimal(funding_network_fee_eth),
            "top_up_network_fee_eth": format_wallet_decimal(top_up_network_fee_eth),
            "main_wallet_network_fee_eth": format_wallet_decimal(
                funding_network_fee_eth
                + top_up_network_fee_eth
                + main_wallet_direct_funding_network_fee_eth
                + main_wallet_wrap_network_fee_eth
            ),
            "local_execution_gas_fee_eth": format_wallet_decimal(local_execution_gas_fee_eth_total),
            "local_execution_gas_fee_per_wallet_eth": format_wallet_decimal(local_execution_gas_fee_eth_per_wallet),
            "contract_sync_network_fee_eth": format_wallet_decimal(contract_sync_network_fee_eth),
            "total_network_fee_eth": format_wallet_decimal(total_network_fee_eth),
            "estimated_gas_price_gwei": execution_estimate.get("estimated_gas_price_gwei"),
            "estimated_gas_units": total_execution_gas_units + top_up_gas_units,
            "execute_gas_units_per_wallet": execution_estimate.get("execute_gas_units_per_wallet"),
            "return_sweep_gas_units_per_wallet": execution_estimate.get("return_sweep_gas_units_per_wallet"),
            "local_execution_gas_units_per_wallet": execution_estimate["local_execution_gas_units_per_wallet"],
            "funding_transaction_count": funding_transaction_count,
            "main_wallet_wrap_transaction_count": main_wallet_wrap_transaction_count,
            "main_wallet_wrap_gas_units": main_wallet_wrap_gas_units,
            "top_up_transaction_count": top_up_transaction_count,
            "execute_transaction_count": execute_transaction_count,
            "wrap_transaction_count": wrap_transaction_count,
            "approval_transaction_count": approval_transaction_count,
            "swap_transaction_count": swap_transaction_count,
            "deployment_transaction_count": deployment_transaction_count,
            "contract_funding_transaction_count": contract_funding_transaction_count,
            "contract_funding_gas_units_per_wallet": execution_estimate.get("contract_funding_gas_units_per_wallet"),
            "return_sweep_transaction_count": return_sweep_transaction_count,
            "contract_sync_transaction_count": contract_sync_transaction_count,
            "total_transaction_count": total_transaction_count,
            "total_eth_required_with_fees": format_wallet_decimal(total_eth_required_with_fees),
            "remaining_eth_after_run": format_wallet_decimal(remaining_eth_after_run),
        },
        "contract_sync": {
            "enabled": bool(registry_sync_preview["enabled"]),
            "main_wallet_registry_enabled": bool(registry_sync_preview["main_wallet_registry_enabled"]),
            "sub_wallet_registry_enabled": bool(registry_sync_preview["sub_wallet_registry_enabled"]),
            "main_wallet_registration_required": bool(registry_sync_preview["main_wallet_registration_required"]),
            "expected_action_count": contract_record_count,
            "message": registry_sync_preview["message"],
        },
        "route_preflight": route_preflight,
        "preview_issue": preview_issue,
        **cost_snapshot,
    }
