#!/usr/bin/env python3
import os
import json
import time
import requests
from datetime import datetime, timezone

TELEGRAM_BOT_TOKEN = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
TELEGRAM_CHAT_ID = (os.getenv("TELEGRAM_CHAT_ID") or "").strip()

TIMEOUT = 10

# Internal nodes
CHAINS = {
    "ETH": {
        "type": "EVM",
        "rpc": "http://100.100.0.35:8545",
        # optional public/reference RPC for "behind"
        "ref_rpc": "https://ethereum-rpc.publicnode.com",
    },
    "BNB": {
        "type": "EVM",
        "rpc": "http://100.100.0.50:8545",
        "ref_rpc": "https://bsc-rpc.publicnode.com",
    },
    "ARB": {
        "type": "EVM",
        "rpc": "http://100.100.0.13:8547",
        "ref_rpc": "https://arbitrum-one-rpc.publicnode.com",
    },
    "OP": {
        "type": "EVM",
        "rpc": "http://100.100.0.8:8545",
        "ref_rpc": "https://optimism-rpc.publicnode.com",
    },
    "BASE": {
        "type": "EVM",
        "rpc": "http://100.100.0.8:9545",
        "ref_rpc": "https://base-rpc.publicnode.com",
    },
    "AVAX": {
        "type": "EVM",
        "rpc": "http://100.100.0.10:9650/ext/bc/C/rpc",
        "ref_rpc": "https://avalanche-c-chain-rpc.publicnode.com",
    },
    "XLAYER": {
        "type": "EVM",
        "rpc": "http://100.100.0.10:10545",
        # add real public/ref RPC if you have one
        "ref_rpc": None,
    },
    "POLYGON": {
        "type": "EVM",
        "rpc": "http://100.100.0.10:11545",
        "ref_rpc": "https://polygon-bor-rpc.publicnode.com",
    },
    "BTC": {
        "type": "BTC",
        "rpc": "http://100.100.0.8:8332",
        "rpc_user": "bitcoinrpc",
        "rpc_password": "your_btc_rpc_password",
        # optional external reference
        "ref_rpc": None,
    },
    "SOLANA": {
        "type": "SOLANA",
        "rpc": "http://100.100.0.4:8899",
        "ref_rpc": "https://api.mainnet-beta.solana.com",
    },
    "TRON": {
        "type": "TRON",
        "rpc": "http://100.100.0.13:8090",
        "ref_rpc": "https://api.trongrid.io",
    },
}

def utc_now_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

def post_json(url, payload, headers=None, auth=None):
    return requests.post(
        url,
        json=payload,
        headers=headers or {},
        auth=auth,
        timeout=TIMEOUT,
    )

def evm_get_block_number(rpc_url):
    payload = {
        "jsonrpc": "2.0",
        "method": "eth_blockNumber",
        "params": [],
        "id": 1,
    }
    r = post_json(rpc_url, payload)
    r.raise_for_status()
    data = r.json()
    if "result" not in data:
        raise RuntimeError(f"EVM invalid response: {data}")
    return int(data["result"], 16)

def tron_get_block_number(rpc_url):
    # works with fullnode /wallet/getnowblock
    url = rpc_url.rstrip("/") + "/wallet/getnowblock"
    r = requests.post(url, json={}, timeout=TIMEOUT)
    r.raise_for_status()
    data = r.json()
    if "block_header" not in data:
        raise RuntimeError(f"TRON invalid response: {data}")
    return int(data["block_header"]["raw_data"]["number"])

def solana_get_slot(rpc_url):
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getSlot",
    }
    r = post_json(rpc_url, payload)
    r.raise_for_status()
    data = r.json()
    if "result" not in data:
        raise RuntimeError(f"SOLANA invalid response: {data}")
    return int(data["result"])

def btc_rpc_call(rpc_url, rpc_user, rpc_password, method, params=None):
    payload = {
        "jsonrpc": "1.0",
        "id": "status",
        "method": method,
        "params": params or [],
    }
    r = post_json(rpc_url, payload, auth=(rpc_user, rpc_password))
    r.raise_for_status()
    data = r.json()
    if data.get("error"):
        raise RuntimeError(f"BTC RPC error: {data['error']}")
    return data["result"]

def btc_get_block_number(cfg):
    return int(btc_rpc_call(
        cfg["rpc"],
        cfg["rpc_user"],
        cfg["rpc_password"],
        "getblockcount"
    ))

def get_chain_height(name, cfg):
    chain_type = cfg["type"]

    if chain_type == "EVM":
        return evm_get_block_number(cfg["rpc"])
    elif chain_type == "TRON":
        return tron_get_block_number(cfg["rpc"])
    elif chain_type == "SOLANA":
        return solana_get_slot(cfg["rpc"])
    elif chain_type == "BTC":
        return btc_get_block_number(cfg)
    else:
        raise ValueError(f"Unsupported chain type: {chain_type}")

def get_reference_height(name, cfg):
    ref_rpc = cfg.get("ref_rpc")
    if not ref_rpc:
        return None

    chain_type = cfg["type"]
    try:
        if chain_type == "EVM":
            return evm_get_block_number(ref_rpc)
        elif chain_type == "TRON":
            return tron_get_block_number(ref_rpc)
        elif chain_type == "SOLANA":
            return solana_get_slot(ref_rpc)
        else:
            return None
    except Exception:
        return None

def status_label(diff):
    if diff is None:
        return "UNKNOWN"
    if diff <= 2:
        return "正常"
    if diff <= 10:
        return "⚠️ DELAY"
    return "❌ LAGGING"

def send_telegram_message(text):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        raise RuntimeError("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be configured.")
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    r = requests.post(url, json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()

def build_report(results):
    now = utc_now_str()

    ok_count = sum(1 for x in results if x["status"] == "正常")
    warn_count = sum(1 for x in results if x["status"] != "正常")

    header_icon = "✅" if warn_count == 0 else "⚠️"

    lines = []
    lines.append(f"<b>{header_icon} Multi-Chain Node Status</b>")
    lines.append(f"<b>Time:</b> {now}")
    lines.append("")

    for r in results:
        line = (
            f"<b>{r['name']}</b> | {r['type']} | "
            f"Block: <code>{r['height']}</code> | "
            f"Behind: <code>{r['behind_text']}</code> | "
            f"Status: {r['status']}"
        )
        lines.append(line)

    lines.append("")
    lines.append(f"<b>Summary:</b> {ok_count} OK / {warn_count} warning")

    return "\n".join(lines)

def main():
    results = []

    for name, cfg in CHAINS.items():
        try:
            local_height = get_chain_height(name, cfg)
            ref_height = get_reference_height(name, cfg)

            if ref_height is None:
                diff = None
                behind_text = "N/A"
                status = "正常"
            else:
                diff = max(0, ref_height - local_height)
                behind_text = str(diff)
                status = status_label(diff)

            results.append({
                "name": name,
                "type": cfg["type"],
                "height": local_height,
                "behind_text": behind_text,
                "status": status,
            })

        except Exception as e:
            results.append({
                "name": name,
                "type": cfg["type"],
                "height": "ERROR",
                "behind_text": "N/A",
                "status": f"❌ {str(e)[:80]}",
            })

    message = build_report(results)
    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        send_telegram_message(message)
    print(message)

if __name__ == "__main__":
    main()
