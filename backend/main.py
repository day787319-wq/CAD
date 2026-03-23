import os
import json
import base64
import logging
import sys
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.append(str(BACKEND_DIR))

ENV_PATH = BACKEND_DIR / ".env"

from src.routers.wallet_router import router as wallet_router
from src.routers.balance_rule_router import router as balance_rule_router
from src.routers.template_router import router as template_router
from src.routers.monitor_router import router as monitor_router
from src.services.monitor_service import start_asset_monitoring_worker, stop_asset_monitoring_worker

# Silence web3 "method not available" noise from private nodes
logging.getLogger("web3").setLevel(logging.CRITICAL)
logging.getLogger("urllib3").setLevel(logging.CRITICAL)

load_dotenv(ENV_PATH)

BTC_USER = os.getenv("BTC_USER", "")
BTC_PASS = os.getenv("BTC_PASS", "")
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in (os.getenv("CORS_ALLOWED_ORIGINS") or "*").split(",")
    if origin.strip()
]

POA_CHAINS = {"BNB", "POLYGON", "OP", "BASE", "XLAYER"}

CHAINS = {
    "ETH":     {"type": "EVM",    "rpc": "http://100.100.0.35:8545"},
    "BNB":     {"type": "EVM",    "rpc": "http://100.100.0.50:8545"},
    "ARB":     {"type": "EVM",    "rpc": "http://100.100.0.13:8547"},
    "OP":      {"type": "EVM",    "rpc": "http://100.100.0.8:8545"},
    "BASE":    {"type": "EVM",    "rpc": "http://100.100.0.8:9545"},
    "AVAX":    {"type": "EVM",    "rpc": "http://100.100.0.10:9650/ext/bc/C/rpc"},
    "XLAYER":  {"type": "EVM",    "rpc": "http://100.100.0.10:10545"},
    "POLYGON": {"type": "EVM",    "rpc": "http://100.100.0.10:11545"},
    "BTC":     {"type": "BTC",    "rpc": "http://100.100.0.8:8332"},
    "SOLANA":  {"type": "SOLANA", "rpc": "http://100.100.0.4:8899"},
    "TRON":    {"type": "TRON",   "rpc": "http://100.100.0.13:8090"},
}

TIMEOUT = 5


def _jsonrpc_post(url: str, method: str, params=None, auth: tuple | None = None) -> dict | None:
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}).encode()
    headers = {"Content-Type": "application/json"}
    if auth:
        token = base64.b64encode(f"{auth[0]}:{auth[1]}".encode()).decode()
        headers["Authorization"] = f"Basic {token}"
    req = urllib.request.Request(url, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def _safe(fn, default=None):
    try:
        return fn()
    except Exception:
        return default


def _rpc_call(rpc: str, method: str, params=None):
    """Direct JSON-RPC call — never logs, returns None on any failure."""
    r = _jsonrpc_post(rpc, method, params)
    if r and "result" in r:
        return r["result"]
    return None


def _check_evm(chain: str, rpc: str) -> dict:
    w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": TIMEOUT}))
    if chain in POA_CHAINS:
        w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
    try:
        block = w3.eth.get_block("latest", full_transactions=False)
        block_number  = block["number"]
        block_ts      = block["timestamp"]
        block_hash    = block["hash"].hex()
        tx_count      = len(block.get("transactions", []))
        gas_used      = block.get("gasUsed", 0)
        gas_limit     = block.get("gasLimit", 1)
        gas_used_pct  = round(gas_used / gas_limit * 100, 1) if gas_limit else None
        now_ts        = int(datetime.now(timezone.utc).timestamp())
        lag           = now_ts - block_ts

        # base fee (EIP-1559) — already in the block, no extra call
        base_fee_wei  = block.get("baseFeePerGas")
        base_fee_gwei = round(base_fee_wei / 1e9, 2) if base_fee_wei else None

        # Optional calls via direct JSON-RPC (no web3 logging on failure)
        gp = _rpc_call(rpc, "eth_gasPrice")
        gas_price_gwei = round(int(gp, 16) / 1e9, 2) if gp else None

        cid = _rpc_call(rpc, "eth_chainId")
        chain_id = int(cid, 16) if cid else None

        pc = _rpc_call(rpc, "net_peerCount")
        peer_count = int(pc, 16) if pc else None

        return {
            "chain": chain, "type": "EVM", "status": "online",
            "block":          block_number,
            "block_hash":     block_hash[:10] + "…" + block_hash[-6:],
            "timestamp":      datetime.utcfromtimestamp(block_ts).strftime("%Y-%m-%d %H:%M:%S"),
            "lag":            lag,
            "tx_count":       tx_count,
            "gas_used_pct":   gas_used_pct,
            "gas_price_gwei": gas_price_gwei,
            "base_fee_gwei":  base_fee_gwei,
            "chain_id":       chain_id,
            "peer_count":     peer_count,
        }
    except Exception as e:
        return {"chain": chain, "type": "EVM", "status": "offline", "error": str(e)[:120]}


def _check_btc(chain: str, rpc: str) -> dict:
    auth = (BTC_USER, BTC_PASS) if BTC_USER and BTC_PASS else None
    info = _jsonrpc_post(rpc, "getblockchaininfo", auth=auth)
    mempool = _jsonrpc_post(rpc, "getmempoolinfo", auth=auth)
    net = _jsonrpc_post(rpc, "getnetworkinfo", auth=auth)

    if info and "result" in info:
        r = info["result"]
        m = mempool["result"] if mempool and "result" in mempool else {}
        n = net["result"]     if net     and "result" in net     else {}
        return {
            "chain": chain, "type": "BTC", "status": "online",
            "block":            r.get("blocks"),
            "block_hash":       (r.get("bestblockhash") or "")[:10] + "…",
            "timestamp":        None,
            "lag":              round(r.get("verificationprogress", 0) * 100, 4),
            "difficulty":       r.get("difficulty"),
            "headers":          r.get("headers"),
            "chain_name":       r.get("chain"),
            "mempool_tx":       m.get("size"),
            "mempool_mb":       round(m.get("bytes", 0) / 1e6, 2) if m.get("bytes") else None,
            "peer_count":       n.get("connections"),
            "version":          n.get("subversion"),
            "pruned":           r.get("pruned"),
        }
    return {"chain": chain, "type": "BTC", "status": "offline"}


def _check_solana(chain: str, rpc: str) -> dict:
    slot_res   = _jsonrpc_post(rpc, "getSlot",      [{"commitment": "finalized"}])
    epoch_res  = _jsonrpc_post(rpc, "getEpochInfo", [{"commitment": "finalized"}])
    health_res = _jsonrpc_post(rpc, "getHealth")
    version_res = _jsonrpc_post(rpc, "getVersion")

    slot = slot_res["result"] if slot_res and "result" in slot_res else None
    if slot is None:
        return {"chain": chain, "type": "SOLANA", "status": "offline"}

    epoch_info = epoch_res["result"] if epoch_res and "result" in epoch_res else {}
    version    = version_res["result"] if version_res and "result" in version_res else {}

    # TPS via recent performance samples
    perf_res = _jsonrpc_post(rpc, "getRecentPerformanceSamples", [1])
    tps = None
    if perf_res and "result" in perf_res and perf_res["result"]:
        s = perf_res["result"][0]
        if s.get("numTransactions") and s.get("samplePeriodSecs"):
            tps = round(s["numTransactions"] / s["samplePeriodSecs"], 1)

    return {
        "chain": chain, "type": "SOLANA", "status": "online",
        "block":             slot,
        "timestamp":         None,
        "lag":               None,
        "epoch":             epoch_info.get("epoch"),
        "slot_index":        epoch_info.get("slotIndex"),
        "slots_in_epoch":    epoch_info.get("slotsInEpoch"),
        "absolute_slot":     epoch_info.get("absoluteSlot"),
        "block_height":      epoch_info.get("blockHeight"),
        "transaction_count": epoch_info.get("transactionCount"),
        "tps":               tps,
        "solana_core":       version.get("solana-core"),
        "health":            health_res.get("result") if health_res else "unknown",
    }


def _check_tron(chain: str, rpc: str) -> dict:
    try:
        def _get(path):
            req = urllib.request.Request(f"{rpc}{path}", headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read())

        block_data = _get("/wallet/getnowblock")
        raw        = block_data.get("block_header", {}).get("raw_data", {})
        block_number = raw.get("number")
        block_ts_ms  = raw.get("timestamp", 0)
        witness      = raw.get("witness_address", "")
        tx_count     = len(block_data.get("transactions", []))
        now_ts       = int(datetime.now(timezone.utc).timestamp())
        lag          = now_ts - block_ts_ms // 1000 if block_ts_ms else None

        # node info
        node_data = _safe(lambda: _get("/wallet/getnodeinfo"), {})
        peers     = node_data.get("peerList", [])
        peer_count = len(peers)
        block_hash = block_data.get("blockID", "")

        return {
            "chain": chain, "type": "TRON", "status": "online",
            "block":       block_number,
            "block_hash":  block_hash[:10] + "…" + block_hash[-6:] if block_hash else None,
            "timestamp":   datetime.utcfromtimestamp(block_ts_ms / 1000).strftime("%Y-%m-%d %H:%M:%S") if block_ts_ms else None,
            "lag":         lag,
            "tx_count":    tx_count,
            "witness":     witness[-8:] if witness else None,
            "peer_count":  peer_count,
        }
    except Exception as e:
        return {"chain": chain, "type": "TRON", "status": "offline", "error": str(e)[:120]}


def check_chain(chain: str, info: dict) -> dict:
    t = info["type"]
    if t == "EVM":    return _check_evm(chain, info["rpc"])
    if t == "BTC":    return _check_btc(chain, info["rpc"])
    if t == "SOLANA": return _check_solana(chain, info["rpc"])
    if t == "TRON":   return _check_tron(chain, info["rpc"])
    return {"chain": chain, "type": t, "status": "unknown"}


app = FastAPI(title="Treasury V2 Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=CORS_ALLOWED_ORIGINS != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/status")
def get_status():
    results = [check_chain(chain, info) for chain, info in CHAINS.items()]
    return {"status": results, "checked_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")}


@app.get("/health")
def health():
    return {"ok": True}


@app.on_event("startup")
def start_background_services():
    start_asset_monitoring_worker()


@app.on_event("shutdown")
def stop_background_services():
    stop_asset_monitoring_worker()


app.include_router(wallet_router)
app.include_router(balance_rule_router)
app.include_router(template_router)
app.include_router(monitor_router)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8006))
    uvicorn.run(app, host="0.0.0.0", port=port)
