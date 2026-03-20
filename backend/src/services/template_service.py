import json
from datetime import datetime
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from src.config.database import db
from src.services.market_service import get_market_snapshot
from src.services.wallet_service import (
    WETH_ADDRESS,
    estimate_execution_network_fee_wei,
    format_decimal as format_wallet_decimal,
    quote_uniswap_swap,
    wei_to_decimal,
)


DEFAULT_TEMPLATE_SOURCE = "library"
TEMPLATE_VERSION_V2 = "v2"
MAX_TEMPLATE_PREVIEW_COUNT = 100
UNISWAP_FEE_TIERS = [500, 3000, 10000]

CURATED_USD_STABLECOINS = [
    {
        "symbol": "USDC",
        "name": "USD Coin",
        "address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        "decimals": 6,
    },
    {
        "symbol": "USDT",
        "name": "Tether USD",
        "address": "0xdac17f958d2ee523a2206206994597c13d831ec7",
        "decimals": 6,
    },
    {
        "symbol": "DAI",
        "name": "Dai",
        "address": "0x6b175474e89094c44da98b954eedeac495271d0f",
        "decimals": 18,
    },
    {
        "symbol": "USDE",
        "name": "Ethena USDe",
        "address": "0x4c9edd5852cd905f086c759e8383e09bff1e68b3",
        "decimals": 18,
    },
    {
        "symbol": "USDS",
        "name": "Sky Dollar",
        "address": "0xdc035d45d973e3ec169d2276ddab16f1e407384f",
        "decimals": 18,
    },
    {
        "symbol": "PYUSD",
        "name": "PayPal USD",
        "address": "0x6c3ea9036406852006290770bedfcaba0e23a0e8",
        "decimals": 6,
    },
    {
        "symbol": "FRAX",
        "name": "Frax",
        "address": "0x853d955acef822db058eb8505911ed77f175b99e",
        "decimals": 18,
    },
    {
        "symbol": "LUSD",
        "name": "Liquity USD",
        "address": "0x5f98805a4e8be255a32880fdec7f6728c6568ba0",
        "decimals": 18,
    },
    {
        "symbol": "TUSD",
        "name": "TrueUSD",
        "address": "0x0000000000085d4780b73119b644ae5ecd22b376",
        "decimals": 18,
    },
    {
        "symbol": "USDP",
        "name": "Pax Dollar",
        "address": "0x8e870d67f660d95d5be530380d0ec0bd388289e1",
        "decimals": 18,
    },
    {
        "symbol": "GUSD",
        "name": "Gemini Dollar",
        "address": "0x056fd409e1d7a124bd7017459dfea2f387b6d5cd",
        "decimals": 2,
    },
    {
        "symbol": "CRVUSD",
        "name": "crvUSD",
        "address": "0xf939e0a03fb07f59a73314e73794be0e57ac1b4e",
        "decimals": 18,
    },
    {
        "symbol": "SUSD",
        "name": "sUSD",
        "address": "0x57ab1ec28d129707052df4df418d58a2d46d5f51",
        "decimals": 18,
    },
]
CURATED_USD_STABLECOIN_BY_ADDRESS = {
    coin["address"].lower(): coin for coin in CURATED_USD_STABLECOINS
}
CURATED_USD_STABLECOIN_BY_SYMBOL = {
    coin["symbol"].upper(): coin for coin in CURATED_USD_STABLECOINS
}
DISTRIBUTION_MODE_VALUES = {"none", "equal", "manual_percent", "manual_weth_amount"}


def _format_decimal(value: Decimal | None):
    if value is None:
        return None
    if value == 0:
        return "0"
    return format(value.normalize(), "f")


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


def _parse_fee_tier(value) -> int | None:
    if value in (None, "", "auto"):
        return None
    try:
        fee_tier = int(value)
    except (TypeError, ValueError):
        raise ValueError("Invalid fee_tier")
    if fee_tier not in UNISWAP_FEE_TIERS:
        raise ValueError("Unsupported fee_tier")
    return fee_tier


def _normalize_stablecoin(address: str | None = None, symbol: str | None = None):
    if address:
        token = CURATED_USD_STABLECOIN_BY_ADDRESS.get(address.strip().lower())
        if token:
            return token
    if symbol:
        token = CURATED_USD_STABLECOIN_BY_SYMBOL.get(symbol.strip().upper())
        if token:
            return token
    raise ValueError("Unsupported stablecoin")


def _parse_allocations(
    allocations_payload,
    distribution_mode: str,
    swap_budget_eth_per_contract: Decimal,
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
        if swap_budget_eth_per_contract <= 0:
            raise ValueError("Swap budget must be greater than 0 when stablecoin swapping is enabled")
        return allocations

    if distribution_mode == "manual_percent":
        total_percent = sum(Decimal(allocation["percent"]) for allocation in allocations)
        if total_percent != Decimal("100"):
            raise ValueError("Stablecoin percentages must total exactly 100")
        if swap_budget_eth_per_contract <= 0:
            raise ValueError("Swap budget must be greater than 0 when stablecoin swapping is enabled")
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
    direct_eth = _parse_decimal(
        payload.get("direct_contract_eth_per_contract", "0"),
        "direct_contract_eth_per_contract",
    )
    direct_weth = _parse_decimal(
        payload.get("direct_contract_weth_per_contract", "0"),
        "direct_contract_weth_per_contract",
    )
    slippage_percent = _parse_slippage_percent(payload.get("slippage_percent", "0.5"))
    fee_tier = _parse_fee_tier(payload.get("fee_tier"))

    allocations = _parse_allocations(
        payload.get("stablecoin_allocations"),
        distribution_mode,
        swap_budget,
    )

    return {
        "id": template_id,
        "name": name,
        "template_version": TEMPLATE_VERSION_V2,
        "gas_reserve_eth_per_contract": _format_decimal(gas_reserve),
        "swap_budget_eth_per_contract": _format_decimal(swap_budget),
        "direct_contract_eth_per_contract": _format_decimal(direct_eth),
        "direct_contract_weth_per_contract": _format_decimal(direct_weth),
        "slippage_percent": _format_decimal(slippage_percent),
        "fee_tier": fee_tier,
        "auto_wrap_eth_to_weth": bool(payload.get("auto_wrap_eth_to_weth", True)),
        "stablecoin_distribution_mode": distribution_mode,
        "stablecoin_allocations": allocations,
        "notes": (payload.get("notes") or "").strip() or None,
        "is_active": bool(payload.get("is_active", True)),
        "source": payload.get("source") or DEFAULT_TEMPLATE_SOURCE,
        "created_at": created_at or datetime.utcnow().isoformat(),
    }


def _serialize_template_for_storage(template: dict):
    stablecoin_allocations = template.get("stablecoin_allocations") or []
    stablecoin_allocations_json = json.dumps(stablecoin_allocations)
    primary_target = stablecoin_allocations[0] if stablecoin_allocations else None

    return {
        "id": template["id"],
        "name": template["name"],
        "target_token_symbol": primary_target.get("token_symbol") if primary_target else None,
        "target_token_address": primary_target.get("token_address") if primary_target else None,
        "weth_per_subwallet": template["swap_budget_eth_per_contract"],
        "slippage_percent": template["slippage_percent"],
        "fee_tier": template["fee_tier"],
        "auto_wrap_eth": template["auto_wrap_eth_to_weth"],
        "gas_reserve_eth_per_subwallet": template["gas_reserve_eth_per_contract"],
        "contract_budget_eth_per_subwallet": template["direct_contract_eth_per_contract"],
        "notes": template.get("notes"),
        "is_active": template.get("is_active", True),
        "source": template.get("source") or DEFAULT_TEMPLATE_SOURCE,
        "created_at": template["created_at"],
        "template_version": TEMPLATE_VERSION_V2,
        "gas_reserve_eth_per_contract": template["gas_reserve_eth_per_contract"],
        "swap_budget_eth_per_contract": template["swap_budget_eth_per_contract"],
        "direct_contract_eth_per_contract": template["direct_contract_eth_per_contract"],
        "direct_contract_weth_per_contract": template["direct_contract_weth_per_contract"],
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
        "template_version": TEMPLATE_VERSION_V2,
        "gas_reserve_eth_per_contract": record.get("gas_reserve_eth_per_contract") or "0",
        "swap_budget_eth_per_contract": record.get("swap_budget_eth_per_contract") or "0",
        "direct_contract_eth_per_contract": record.get("direct_contract_eth_per_contract") or "0",
        "direct_contract_weth_per_contract": record.get("direct_contract_weth_per_contract") or "0",
        "slippage_percent": record.get("slippage_percent") or "0.5",
        "fee_tier": record.get("fee_tier"),
        "auto_wrap_eth_to_weth": bool(record.get("auto_wrap_eth_to_weth", True)),
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
    token = _normalize_stablecoin(
        allocation.get("token_address"),
        allocation.get("token_symbol"),
    )
    contract_count_decimal = Decimal(contract_count)

    if distribution_mode == "equal":
        percent = Decimal("100") / Decimal(len(template["stablecoin_allocations"]))
        per_contract_weth = swap_budget_eth_per_contract / Decimal(len(template["stablecoin_allocations"]))
    elif distribution_mode == "manual_percent":
        percent = Decimal(str(allocation["percent"]))
        per_contract_weth = swap_budget_eth_per_contract * (percent / Decimal("100"))
    else:
        per_contract_weth = Decimal(str(allocation["weth_amount_per_contract"]))
        percent = (per_contract_weth / swap_budget_eth_per_contract * Decimal("100")) if swap_budget_eth_per_contract > 0 else Decimal("0")

    total_weth = per_contract_weth * contract_count_decimal

    quote = {
        "available": False,
        "token_in": "WETH",
        "token_out": token["symbol"],
        "error": None,
        "source": "template-allocation",
        "slippage_percent": template.get("slippage_percent"),
    }
    per_contract_output = None
    total_output = None
    per_contract_min_output = None
    total_min_output = None

    if include_live_market and per_contract_weth > 0:
        try:
            raw_quote = quote_uniswap_swap(
                "WETH",
                token["address"],
                _format_decimal(per_contract_weth),
                fee_tier=template.get("fee_tier"),
                slippage_percent=template.get("slippage_percent"),
            )
            quote = {
                "available": True,
                **raw_quote,
            }
            per_contract_output = Decimal(str(raw_quote["amount_out"]))
            total_output = per_contract_output * contract_count_decimal
            per_contract_min_output = Decimal(str(raw_quote["min_amount_out"]))
            total_min_output = per_contract_min_output * contract_count_decimal
        except Exception as exc:
            quote = {
                "available": False,
                "token_in": "WETH",
                "token_out": token["symbol"],
                "error": str(exc),
                "source": "template-allocation",
                "slippage_percent": template.get("slippage_percent"),
            }

    token_price_usd = market_snapshot.get("token_prices", {}).get(token["address"].lower()) if include_live_market else None
    return {
        "token_symbol": token["symbol"],
        "token_name": token["name"],
        "token_address": token["address"],
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


def _build_template_cost_snapshot(template: dict, contract_count: int, *, include_live_market: bool = False):
    gas_reserve = Decimal(str(template["gas_reserve_eth_per_contract"]))
    swap_budget = Decimal(str(template["swap_budget_eth_per_contract"]))
    direct_eth = Decimal(str(template["direct_contract_eth_per_contract"]))
    direct_weth = Decimal(str(template["direct_contract_weth_per_contract"]))
    contract_count_decimal = Decimal(contract_count)

    required_eth_per_contract = gas_reserve + direct_eth
    required_weth_per_contract = swap_budget + direct_weth
    required_eth_total = required_eth_per_contract * contract_count_decimal
    required_weth_total = required_weth_per_contract * contract_count_decimal

    stablecoin_addresses = [allocation["token_address"] for allocation in template["stablecoin_allocations"]]
    market_snapshot = get_market_snapshot(stablecoin_addresses, WETH_ADDRESS) if include_live_market else _empty_market_snapshot()
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
    combined_cost_usd = None
    if required_eth_total_usd is not None and required_weth_total_usd is not None:
        combined_cost_usd = _format_decimal(Decimal(required_eth_total_usd) + Decimal(required_weth_total_usd))

    return {
        "contract_count": contract_count,
        "slippage_percent": template["slippage_percent"],
        "fee_tier": template.get("fee_tier"),
        "per_contract": {
            "gas_reserve_eth": _format_decimal(gas_reserve),
            "swap_budget_eth": _format_decimal(swap_budget),
            "direct_contract_eth": _format_decimal(direct_eth),
            "direct_contract_weth": _format_decimal(direct_weth),
            "required_eth": _format_decimal(required_eth_per_contract),
            "required_weth": _format_decimal(required_weth_per_contract),
            "total_eth_if_no_weth_available": _format_decimal(required_eth_per_contract + required_weth_per_contract),
        },
        "totals": {
            "required_eth_total": _format_decimal(required_eth_total),
            "required_weth_total": _format_decimal(required_weth_total),
            "gas_reserve_eth_total": _format_decimal(gas_reserve * contract_count_decimal),
            "swap_budget_eth_total": _format_decimal(swap_budget * contract_count_decimal),
            "direct_contract_eth_total": _format_decimal(direct_eth * contract_count_decimal),
            "direct_contract_weth_total": _format_decimal(direct_weth * contract_count_decimal),
            "total_eth_if_no_weth_available_total": _format_decimal(
                (required_eth_per_contract + required_weth_per_contract) * contract_count_decimal
            ),
            "required_eth_total_usd": required_eth_total_usd,
            "required_weth_total_usd": required_weth_total_usd,
            "combined_cost_usd": combined_cost_usd,
            "stablecoin_output_total_usd": _format_decimal(total_output_usd) if total_output_usd is not None else None,
        },
        "stablecoin_distribution_mode": template["stablecoin_distribution_mode"],
        "stablecoin_quotes": stablecoin_quotes,
        "price_snapshot": market_snapshot,
    }


def get_template_options():
    return {
        "stablecoins": CURATED_USD_STABLECOINS,
        "distribution_modes": [
            {
                "value": "none",
                "label": "No swap",
                "description": "Keep this template focused on gas and direct contract funding only.",
            },
            {
                "value": "equal",
                "label": "Equal split",
                "description": "Split the per-contract swap budget evenly across the selected stablecoins.",
            },
            {
                "value": "manual_percent",
                "label": "Manual %",
                "description": "Assign exact percentages across the selected stablecoins.",
            },
            {
                "value": "manual_weth_amount",
                "label": "Manual exact WETH",
                "description": "Assign exact WETH amounts per contract across the selected stablecoins.",
            },
        ],
        "fee_tiers": [
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
        ],
        "defaults": {
            "template_version": TEMPLATE_VERSION_V2,
            "gas_reserve_eth_per_contract": "0.02",
            "swap_budget_eth_per_contract": "0",
            "direct_contract_eth_per_contract": "0",
            "direct_contract_weth_per_contract": "0",
            "slippage_percent": "0.5",
            "fee_tier": None,
            "auto_wrap_eth_to_weth": True,
            "stablecoin_distribution_mode": "none",
            "stablecoin_allocations": [],
        },
        "hints": {
            "summary": "This template defines one contract / one subwallet.",
            "swap_budget_note": "Stablecoin swaps always use WETH. ETH can be wrapped first when needed.",
            "swap_settings_note": "Slippage sets your minimum received guardrail. Fee tier can stay on auto unless you want to force a pool.",
        },
    }


def list_templates():
    templates = []
    for record in db.list_templates():
        template = _deserialize_template_record(record)
        if template and template.get("is_active", True):
            templates.append(template)
    return templates


def get_template(template_id: str):
    template = _deserialize_template_record(db.get_template(template_id))
    if not template or not template.get("is_active", True):
        return None
    return template


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

    from src.services.wallet_service import get_wallet_details

    wallet = get_wallet_details(wallet_id)
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

    available_eth = Decimal(str(wallet["eth_balance"]))
    available_weth = Decimal(str(wallet["weth_balance"]))
    auto_wrap = bool(template.get("auto_wrap_eth_to_weth", True))
    weth_from_main_wallet = min(available_weth, required_weth_total)
    weth_shortfall = max(required_weth_total - weth_from_main_wallet, Decimal("0"))
    funding_transaction_count = (
        (1 if auto_wrap and weth_shortfall > 0 else 0)
        + (contract_count if required_eth_per_contract > 0 else 0)
        + (contract_count if required_weth_per_contract > 0 else 0)
    )
    execution_fee = estimate_execution_network_fee_wei(
        contract_count,
        eth_per_wallet=required_eth_per_contract,
        weth_per_wallet=required_weth_per_contract,
        wrap_eth_total=weth_shortfall if auto_wrap else Decimal("0"),
    )
    funding_network_fee_eth = wei_to_decimal(execution_fee["fee_wei"])
    wrappable_eth = max(available_eth - required_eth_total - funding_network_fee_eth, Decimal("0")) if auto_wrap else Decimal("0")
    effective_weth_available = available_weth + wrappable_eth
    weth_from_wrapped_eth = weth_shortfall if auto_wrap else Decimal("0")
    total_eth_deducted = required_eth_total + weth_from_wrapped_eth
    total_eth_required_with_fees = total_eth_deducted + funding_network_fee_eth
    remaining_eth_after_funding = available_eth - total_eth_deducted
    remaining_eth_after_run = available_eth - total_eth_required_with_fees
    remaining_weth_after_funding = available_weth - weth_from_main_wallet
    can_proceed = (
        available_eth >= total_eth_required_with_fees
        if auto_wrap
        else available_eth >= (required_eth_total + funding_network_fee_eth) and available_weth >= required_weth_total
    )

    shortfall_reason = None
    if available_eth < (required_eth_total + funding_network_fee_eth) and available_weth >= required_weth_total:
        shortfall_reason = (
            f"Not enough ETH in the main wallet. Need {_format_decimal((required_eth_total + funding_network_fee_eth) - available_eth)} more ETH "
            "to cover direct funding and the network fee for the funding transactions."
        )
    elif available_eth < required_eth_total:
        shortfall_reason = (
            f"Not enough ETH in the main wallet. Need {_format_decimal(required_eth_total - available_eth)} more ETH "
            "to fund gas reserve and direct ETH for the new subwallets."
        )
    elif not auto_wrap and available_weth < required_weth_total:
        shortfall_reason = (
            f"Not enough WETH in the main wallet. Need {_format_decimal(required_weth_total - available_weth)} more WETH "
            "because auto-wrap is disabled."
        )
    elif auto_wrap and available_eth < total_eth_required_with_fees:
        shortfall_reason = (
            f"Not enough ETH in the main wallet. Need {_format_decimal(total_eth_required_with_fees - available_eth)} more ETH "
            "to wrap into WETH, fund the new subwallets, and cover network fees."
        )

    return {
        "template_id": template["id"],
        "wallet_id": wallet_id,
        "contract_count": contract_count,
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
            "weth_sent_to_subwallets": _format_decimal(required_weth_total),
            "weth_from_main_wallet": _format_decimal(weth_from_main_wallet),
            "weth_from_wrapped_eth": _format_decimal(weth_from_wrapped_eth),
            "total_eth_deducted": _format_decimal(total_eth_deducted),
        },
        "effective_weth_available": _format_decimal(effective_weth_available),
        "execution": {
            "funding_network_fee_eth": format_wallet_decimal(funding_network_fee_eth),
            "estimated_gas_price_gwei": format_wallet_decimal(Decimal(execution_fee["gas_price_wei"]) / Decimal("1000000000")),
            "funding_transaction_count": funding_transaction_count,
            "total_eth_required_with_fees": format_wallet_decimal(total_eth_required_with_fees),
            "remaining_eth_after_run": format_wallet_decimal(remaining_eth_after_run),
        },
        **cost_snapshot,
    }
