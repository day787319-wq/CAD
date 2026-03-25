import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal


DEFAULT_BASE_URLS = [
    "https://pro-api.coingecko.com/api/v3",
    "https://api.coingecko.com/api/v3",
]


def _coingecko_headers_for_base_url(base_url: str) -> dict:
    headers = {
        "Accept": "application/json",
        "User-Agent": "CAD/1.0 (+https://coingecko.com)",
    }
    api_key = (os.getenv("COINGECKO_API_KEY") or "").strip()
    if not api_key:
        return headers

    if "pro-api.coingecko.com" in base_url:
        headers["x-cg-pro-api-key"] = api_key
    elif "api.coingecko.com" in base_url:
        headers["x-cg-demo-api-key"] = api_key

    return headers


def _coingecko_base_urls() -> list[str]:
    configured_base_url = os.getenv("COINGECKO_API_BASE_URL")
    if configured_base_url:
        return [configured_base_url.rstrip("/")]
    api_key = (os.getenv("COINGECKO_API_KEY") or "").strip()
    if api_key:
        return DEFAULT_BASE_URLS
    return ["https://api.coingecko.com/api/v3"]


def _coingecko_get_json(path: str, params: dict) -> dict:
    query = urllib.parse.urlencode(params)
    last_error = None

    for base_url in _coingecko_base_urls():
        url = f"{base_url}{path}?{query}"
        request = urllib.request.Request(url, headers=_coingecko_headers_for_base_url(base_url))
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as exc:
            try:
                error_payload = exc.read().decode("utf-8", errors="replace").strip()
            except Exception:
                error_payload = ""
            last_error = f"{exc} {error_payload}".strip()
        except Exception as exc:
            last_error = exc

    raise RuntimeError(f"CoinGecko request failed: {last_error}")


def get_market_snapshot(
    token_addresses: list[str],
    wrapped_native_address: str,
    *,
    asset_platform: str = "ethereum",
    native_coin_id: str = "ethereum",
) -> dict:
    snapshot = {
        "available": False,
        "currency": "usd",
        "eth_usd": None,
        "weth_usd": None,
        "token_prices": {},
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "error": None,
    }

    try:
        eth_payload = _coingecko_get_json(
            "/simple/price",
            {
                "ids": native_coin_id,
                "vs_currencies": "usd",
            },
        )

        addresses = []
        for address in [wrapped_native_address, *(token_addresses or [])]:
            normalized = address.lower()
            if normalized not in addresses:
                addresses.append(normalized)

        token_payload = _coingecko_get_json(
            f"/simple/token_price/{asset_platform}",
            {
                "contract_addresses": ",".join(addresses),
                "vs_currencies": "usd",
            },
        )

        token_prices = {}
        for address in token_addresses or []:
            usd_value = token_payload.get(address.lower(), {}).get("usd")
            token_prices[address.lower()] = str(Decimal(str(usd_value))) if usd_value is not None else None

        eth_usd = eth_payload.get(native_coin_id, {}).get("usd")
        weth_usd = token_payload.get(wrapped_native_address.lower(), {}).get("usd")

        snapshot.update(
            {
                "available": True,
                "eth_usd": str(Decimal(str(eth_usd))) if eth_usd is not None else None,
                "weth_usd": str(Decimal(str(weth_usd))) if weth_usd is not None else None,
                "token_prices": token_prices,
            }
        )
    except Exception as exc:
        snapshot["error"] = str(exc)

    return snapshot
