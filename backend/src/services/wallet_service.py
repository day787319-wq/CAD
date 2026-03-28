import base64
import hmac
import json
import os
import re
import time
import zipfile
from uuid import uuid4
from functools import lru_cache
from datetime import datetime, timezone
from pathlib import Path
from decimal import Decimal, InvalidOperation, ROUND_DOWN
import xml.etree.ElementTree as ET

from mnemonic import Mnemonic
from eth_account import Account
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from web3 import Web3
from web3.exceptions import TimeExhausted, TransactionNotFound
from dotenv import load_dotenv

from src.config.database import db
from src.services.template_chain_config import (
    SWAP_BACKEND_PANCAKESWAP_V2,
    SWAP_BACKEND_UNISWAP_V3,
    TEMPLATE_CHAIN_ARBITRUM,
    TEMPLATE_CHAIN_AVALANCHE,
    TEMPLATE_CHAIN_BASE,
    TEMPLATE_CHAIN_BNB,
    TEMPLATE_CHAIN_ETHEREUM,
    TEMPLATE_CHAIN_OPTIMISM,
    TEMPLATE_CHAIN_POLYGON,
    TEMPLATE_CHAIN_XLAYER,
    get_template_chain_config,
    get_template_chain_tokens,
    get_template_chain_swap_backends,
    normalize_template_chain,
)

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_PATH)
Account.enable_unaudited_hdwallet_features()

WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'  # Mainnet WETH
NATIVE_ETH_SENTINEL_ADDRESS = "0x0000000000000000000000000000000000000000"
UNISWAP_FEE_TIERS = [500, 3000, 10000]
UNISWAP_V3_ROUTER_ADDRESSES = {
    TEMPLATE_CHAIN_ETHEREUM: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    TEMPLATE_CHAIN_BNB: "0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2",
    TEMPLATE_CHAIN_ARBITRUM: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    TEMPLATE_CHAIN_AVALANCHE: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE",
    TEMPLATE_CHAIN_BASE: "0x2626664c2603336E57B271c5C0b26F421741e481",
    TEMPLATE_CHAIN_OPTIMISM: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    TEMPLATE_CHAIN_POLYGON: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    TEMPLATE_CHAIN_XLAYER: "0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900",
}
UNISWAP_V3_QUOTER_V2_ADDRESSES = {
    TEMPLATE_CHAIN_ETHEREUM: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    TEMPLATE_CHAIN_BNB: "0x78D78E420Da98ad378D7799bE8f4AF69033EB077",
    TEMPLATE_CHAIN_ARBITRUM: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    TEMPLATE_CHAIN_AVALANCHE: "0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F",
    TEMPLATE_CHAIN_BASE: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    TEMPLATE_CHAIN_OPTIMISM: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    TEMPLATE_CHAIN_POLYGON: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    TEMPLATE_CHAIN_XLAYER: "0x2d01411773c8c24805306e89a41f7855c3c4fe65",
}
PANCAKESWAP_V2_ROUTER_ADDRESSES = {
    TEMPLATE_CHAIN_BNB: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
}
TOKEN_SHEET_NAMESPACE = {'a': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
CHAIN_RPC_ENV_CANDIDATES = {
    TEMPLATE_CHAIN_ETHEREUM: ["ETHEREUM_RPC_URL"],
    TEMPLATE_CHAIN_BNB: ["BNB_RPC_URL", "BSC_RPC_URL"],
    TEMPLATE_CHAIN_ARBITRUM: ["ARB_RPC_URL", "ARBITRUM_RPC_URL"],
    TEMPLATE_CHAIN_AVALANCHE: ["AVAX_RPC_URL", "AVALANCHE_RPC_URL"],
    TEMPLATE_CHAIN_BASE: ["BASE_RPC_URL"],
    TEMPLATE_CHAIN_OPTIMISM: ["OP_RPC_URL", "OPTIMISM_RPC_URL"],
    TEMPLATE_CHAIN_POLYGON: ["POLYGON_RPC_URL"],
    TEMPLATE_CHAIN_XLAYER: ["XLAYER_RPC_URL"],
}
CHAIN_TRUSTWALLET_SLUG = {
    TEMPLATE_CHAIN_ETHEREUM: "ethereum",
    TEMPLATE_CHAIN_BNB: "smartchain",
    TEMPLATE_CHAIN_ARBITRUM: "arbitrum",
    TEMPLATE_CHAIN_AVALANCHE: "avalanchec",
    TEMPLATE_CHAIN_BASE: "base",
    TEMPLATE_CHAIN_OPTIMISM: "optimism",
    TEMPLATE_CHAIN_POLYGON: "polygon",
    TEMPLATE_CHAIN_XLAYER: "xlayer",
}
CONFIGURABLE_EVM_TEMPLATE_CHAINS = [
    TEMPLATE_CHAIN_ETHEREUM,
    TEMPLATE_CHAIN_BNB,
    TEMPLATE_CHAIN_ARBITRUM,
    TEMPLATE_CHAIN_AVALANCHE,
    TEMPLATE_CHAIN_BASE,
    TEMPLATE_CHAIN_OPTIMISM,
    TEMPLATE_CHAIN_POLYGON,
    TEMPLATE_CHAIN_XLAYER,
]
WETH_ABI = [
    {
        "constant": True,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function"
    },
    {
        "inputs": [],
        "name": "deposit",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "constant": False,
        "inputs": [
            {"name": "_to", "type": "address"},
            {"name": "_value", "type": "uint256"},
        ],
        "name": "transfer",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "constant": False,
        "inputs": [
            {"name": "_spender", "type": "address"},
            {"name": "_value", "type": "uint256"},
        ],
        "name": "approve",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]
ERC20_ABI = [
    {
        "constant": True,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function"
    },
    {
        "constant": True,
        "inputs": [
            {"name": "_owner", "type": "address"},
            {"name": "_spender", "type": "address"},
        ],
        "name": "allowance",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
    },
    {
        "constant": False,
        "inputs": [
            {"name": "_spender", "type": "address"},
            {"name": "_value", "type": "uint256"},
        ],
        "name": "approve",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "constant": False,
        "inputs": [
            {"name": "_to", "type": "address"},
            {"name": "_value", "type": "uint256"},
        ],
        "name": "transfer",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]
ERC20_METADATA_ABI = [
    {
        "constant": True,
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "type": "function"
    },
    {
        "constant": True,
        "inputs": [],
        "name": "symbol",
        "outputs": [{"name": "", "type": "string"}],
        "type": "function"
    },
    {
        "constant": True,
        "inputs": [],
        "name": "name",
        "outputs": [{"name": "", "type": "string"}],
        "type": "function"
    }
]
UNISWAP_QUOTER_ABI = [
    {
        "inputs": [
            {"internalType": "bytes", "name": "path", "type": "bytes"},
            {"internalType": "uint256", "name": "amountIn", "type": "uint256"},
        ],
        "name": "quoteExactInput",
        "outputs": [
            {"internalType": "uint256", "name": "amountOut", "type": "uint256"},
            {"internalType": "uint160[]", "name": "sqrtPriceX96AfterList", "type": "uint160[]"},
            {"internalType": "uint32[]", "name": "initializedTicksCrossedList", "type": "uint32[]"},
            {"internalType": "uint256", "name": "gasEstimate", "type": "uint256"},
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]
UNISWAP_V3_ROUTER_ABI = [
    {
        "inputs": [
            {
                "components": [
                    {"internalType": "bytes", "name": "path", "type": "bytes"},
                    {"internalType": "address", "name": "recipient", "type": "address"},
                    {"internalType": "uint256", "name": "amountIn", "type": "uint256"},
                    {"internalType": "uint256", "name": "amountOutMinimum", "type": "uint256"},
                ],
                "internalType": "struct IV3SwapRouter.ExactInputParams",
                "name": "params",
                "type": "tuple"
            }
        ],
        "name": "exactInput",
        "outputs": [{"internalType": "uint256", "name": "amountOut", "type": "uint256"}],
        "stateMutability": "payable",
        "type": "function"
    }
]
PANCAKESWAP_V2_ROUTER_ABI = [
    {
        "inputs": [
            {"internalType": "uint256", "name": "amountIn", "type": "uint256"},
            {"internalType": "address[]", "name": "path", "type": "address[]"},
        ],
        "name": "getAmountsOut",
        "outputs": [{"internalType": "uint256[]", "name": "amounts", "type": "uint256[]"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "amountIn", "type": "uint256"},
            {"internalType": "uint256", "name": "amountOutMin", "type": "uint256"},
            {"internalType": "address[]", "name": "path", "type": "address[]"},
            {"internalType": "address", "name": "to", "type": "address"},
            {"internalType": "uint256", "name": "deadline", "type": "uint256"},
        ],
        "name": "swapExactTokensForTokens",
        "outputs": [{"internalType": "uint256[]", "name": "amounts", "type": "uint256[]"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]
TOKEN_CONFIG = {
    'ETH': {
        'symbol': 'ETH',
        'name': 'Ethereum',
        'address': WETH_ADDRESS,
        'decimals': 18,
        'logo_url': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    },
    'WETH': {
        'symbol': 'WETH',
        'name': 'Wrapped Ether',
        'address': WETH_ADDRESS,
        'decimals': 18,
        'logo_url': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    },
    'USDC': {
        'symbol': 'USDC',
        'name': 'USD Coin',
        'address': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        'decimals': 6,
        'logo_url': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    },
    'USDT': {
        'symbol': 'USDT',
        'name': 'Tether USD',
        'address': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        'decimals': 6,
        'logo_url': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
    },
    'DAI': {
        'symbol': 'DAI',
        'name': 'Dai',
        'address': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        'decimals': 18,
        'logo_url': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',
    },
}
NON_STANDARD_ERC20_TRANSFER_RETURN_TOKENS = {
    TOKEN_CONFIG["USDT"]["address"].lower(),
}
ETH_DECIMALS = Decimal("1000000000000000000")
ETH_TRANSFER_GAS_LIMIT = 21_000
CONTRACT_NATIVE_ETH_TRANSFER_GAS_LIMIT = 50_000
ERC20_APPROVE_GAS_LIMIT = 70_000
WETH_TRANSFER_GAS_LIMIT = 90_000
ERC20_TRANSFER_GAS_LIMIT = 90_000
WETH_DEPOSIT_GAS_LIMIT = 120_000
UNISWAP_V3_SWAP_GAS_LIMIT = 350_000
MANAGED_TOKEN_DISTRIBUTOR_DEPLOY_GAS_LIMIT = 900_000
MANAGED_TOKEN_DISTRIBUTOR_EXECUTE_GAS_LIMIT = 180_000
BATCH_TREASURY_DISTRIBUTOR_DEPLOY_GAS_LIMIT = 900_000
BATCH_TREASURY_DISTRIBUTOR_BATCH_SEND_BASE_GAS_LIMIT = 120_000
BATCH_TREASURY_DISTRIBUTOR_BATCH_SEND_PER_ENTRY_GAS_LIMIT = 90_000
DEFAULT_TRANSACTION_RECEIPT_TIMEOUT_SECONDS = 180
WETH_WRAP_MAX_ATTEMPTS = 3
TOKEN_APPROVAL_MAX_ATTEMPTS = 3
TOKEN_TRANSFER_MAX_ATTEMPTS = 3
TOKEN_SWAP_MAX_ATTEMPTS = 3
MANAGED_TOKEN_DISTRIBUTOR_DEPLOY_MAX_ATTEMPTS = 3
MANAGED_TOKEN_DISTRIBUTOR_EXECUTE_MAX_ATTEMPTS = 3
BATCH_TREASURY_DISTRIBUTOR_DEPLOY_MAX_ATTEMPTS = 3
BATCH_TREASURY_DISTRIBUTOR_BATCH_SEND_MAX_ATTEMPTS = 3
WETH_WRAP_GAS_PRICE_BUMP_MULTIPLIER = Decimal("1.20")
TOKEN_APPROVAL_GAS_PRICE_BUMP_MULTIPLIER = Decimal("1.20")
TOKEN_TRANSFER_GAS_PRICE_BUMP_MULTIPLIER = Decimal("1.20")
TOKEN_SWAP_GAS_PRICE_BUMP_MULTIPLIER = Decimal("1.20")
MANAGED_TOKEN_DISTRIBUTOR_DEPLOY_GAS_PRICE_BUMP_MULTIPLIER = Decimal("1.20")
MANAGED_TOKEN_DISTRIBUTOR_EXECUTE_GAS_PRICE_BUMP_MULTIPLIER = Decimal("1.20")
BATCH_TREASURY_DISTRIBUTOR_DEPLOY_GAS_PRICE_BUMP_MULTIPLIER = Decimal("1.20")
BATCH_TREASURY_DISTRIBUTOR_BATCH_SEND_GAS_PRICE_BUMP_MULTIPLIER = Decimal("1.20")
WETH_WRAP_POST_TIMEOUT_GRACE_SECONDS = 45
WETH_WRAP_POST_TIMEOUT_POLL_INTERVAL_SECONDS = 5
TOKEN_APPROVAL_POST_TIMEOUT_GRACE_SECONDS = 45
TOKEN_APPROVAL_POST_TIMEOUT_POLL_INTERVAL_SECONDS = 5
TOKEN_TRANSFER_POST_TIMEOUT_GRACE_SECONDS = 45
TOKEN_TRANSFER_POST_TIMEOUT_POLL_INTERVAL_SECONDS = 5
TOKEN_SWAP_POST_TIMEOUT_GRACE_SECONDS = 45
TOKEN_SWAP_POST_TIMEOUT_POLL_INTERVAL_SECONDS = 5
MANAGED_TOKEN_DISTRIBUTOR_DEPLOY_POST_TIMEOUT_GRACE_SECONDS = 45
MANAGED_TOKEN_DISTRIBUTOR_DEPLOY_POST_TIMEOUT_POLL_INTERVAL_SECONDS = 5
MANAGED_TOKEN_DISTRIBUTOR_EXECUTE_POST_TIMEOUT_GRACE_SECONDS = 45
MANAGED_TOKEN_DISTRIBUTOR_EXECUTE_POST_TIMEOUT_POLL_INTERVAL_SECONDS = 5
BATCH_TREASURY_DISTRIBUTOR_DEPLOY_POST_TIMEOUT_GRACE_SECONDS = 45
BATCH_TREASURY_DISTRIBUTOR_DEPLOY_POST_TIMEOUT_POLL_INTERVAL_SECONDS = 5
BATCH_TREASURY_DISTRIBUTOR_BATCH_SEND_POST_TIMEOUT_GRACE_SECONDS = 45
BATCH_TREASURY_DISTRIBUTOR_BATCH_SEND_POST_TIMEOUT_POLL_INTERVAL_SECONDS = 5
LEGACY_GAS_STAGE_TOP_UP = "top_up"
LEGACY_GAS_STAGE_FUND_SUBWALLET = "fund_subwallet"
LEGACY_GAS_STAGE_WRAP = "wrap"
LEGACY_GAS_STAGE_APPROVAL = "approval"
LEGACY_GAS_STAGE_SWAP = "swap"
LEGACY_GAS_STAGE_DEPLOY_TREASURY = "deploy_treasury"
LEGACY_GAS_STAGE_FUND_TREASURY = "fund_treasury"
LEGACY_GAS_STAGE_BATCH_SEND = "batch_send"
LEGACY_GAS_STAGE_RETURN_SWEEP = "return_sweep"
LEGACY_EVM_GAS_STAGE_MULTIPLIERS = {
    LEGACY_GAS_STAGE_TOP_UP: {
        TEMPLATE_CHAIN_ETHEREUM: Decimal("1.08"),
        "default": Decimal("1.20"),
    },
    LEGACY_GAS_STAGE_FUND_SUBWALLET: {
        TEMPLATE_CHAIN_ETHEREUM: Decimal("1.08"),
        "default": Decimal("1.20"),
    },
    LEGACY_GAS_STAGE_WRAP: {
        TEMPLATE_CHAIN_ETHEREUM: Decimal("1.08"),
        "default": Decimal("1.20"),
    },
    LEGACY_GAS_STAGE_APPROVAL: {
        TEMPLATE_CHAIN_ETHEREUM: Decimal("1.08"),
        "default": Decimal("1.20"),
    },
    LEGACY_GAS_STAGE_SWAP: {
        TEMPLATE_CHAIN_ETHEREUM: Decimal("1.15"),
        "default": Decimal("1.30"),
    },
    LEGACY_GAS_STAGE_DEPLOY_TREASURY: {
        TEMPLATE_CHAIN_ETHEREUM: Decimal("1.22"),
        "default": Decimal("1.40"),
    },
    LEGACY_GAS_STAGE_FUND_TREASURY: {
        TEMPLATE_CHAIN_ETHEREUM: Decimal("1.08"),
        "default": Decimal("1.20"),
    },
    LEGACY_GAS_STAGE_BATCH_SEND: {
        TEMPLATE_CHAIN_ETHEREUM: Decimal("1.22"),
        "default": Decimal("1.35"),
    },
    LEGACY_GAS_STAGE_RETURN_SWEEP: {
        TEMPLATE_CHAIN_ETHEREUM: Decimal("1.08"),
        "default": Decimal("1.20"),
    },
}
LEGACY_EVM_GAS_STAGE_PENDING_TIMEOUT_SECONDS = {
    LEGACY_GAS_STAGE_TOP_UP: 45,
    LEGACY_GAS_STAGE_FUND_SUBWALLET: 45,
    LEGACY_GAS_STAGE_WRAP: 45,
    LEGACY_GAS_STAGE_APPROVAL: 45,
    LEGACY_GAS_STAGE_SWAP: 75,
    LEGACY_GAS_STAGE_DEPLOY_TREASURY: 90,
    LEGACY_GAS_STAGE_FUND_TREASURY: 45,
    LEGACY_GAS_STAGE_BATCH_SEND: 90,
    LEGACY_GAS_STAGE_RETURN_SWEEP: 45,
}
LEGACY_EVM_RETRY_GAS_PRICE_MULTIPLIERS = {
    2: Decimal("1.20"),
    3: Decimal("1.25"),
}


class WalletTransactionError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        tx_hash: str | None = None,
        nonce: int | None = None,
        gas_price_wei: int | None = None,
        retryable: bool = False,
        details: dict | None = None,
    ):
        super().__init__(message)
        self.tx_hash = tx_hash
        self.nonce = nonce
        self.gas_price_wei = gas_price_wei
        self.retryable = retryable
        self.details = details or {}

def get_token_list_paths() -> list[Path]:
    configured_path = os.getenv('TOKEN_LIST_XLSX_PATH')
    candidates = []
    if configured_path:
        candidates.append(Path(configured_path))

    repo_candidate = Path(__file__).resolve().parents[3] / 'backend' / 'data' / 'EVM chain Token.xlsx'
    desktop_candidate = Path.home() / 'Desktop' / 'EVM chain Token.xlsx'
    candidates.extend([repo_candidate, desktop_candidate])
    return candidates

def extract_symbol_from_name(token_name: str, fallback_address: str) -> str:
    match = re.search(r'\(([^()]+)\)\s*$', token_name)
    if match:
        return match.group(1).strip().upper()
    cleaned_name = re.sub(r'[^A-Za-z0-9]+', '', token_name).upper()
    if cleaned_name:
        return cleaned_name[:10]
    return fallback_address[-6:].upper()

def build_logo_url(address: str, chain: str = 'smartchain') -> str:
    return f'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/{chain}/assets/{address}/logo.png'

def _read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if 'xl/sharedStrings.xml' not in archive.namelist():
        return []

    root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
    shared_strings = []
    for item in root.findall('a:si', TOKEN_SHEET_NAMESPACE):
        texts = [text_node.text or '' for text_node in item.findall('.//a:t', TOKEN_SHEET_NAMESPACE)]
        shared_strings.append(''.join(texts))
    return shared_strings

def _resolve_sheet_target(archive: zipfile.ZipFile) -> str:
    workbook_root = ET.fromstring(archive.read('xl/workbook.xml'))
    sheets = workbook_root.find('a:sheets', TOKEN_SHEET_NAMESPACE)
    if sheets is None:
        raise ValueError('Workbook has no sheets')

    first_sheet = sheets.findall('a:sheet', TOKEN_SHEET_NAMESPACE)[0]
    rel_id = first_sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
    relationships_root = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
    for relationship in relationships_root:
        if relationship.attrib.get('Id') == rel_id:
            return relationship.attrib['Target']
    raise ValueError('Workbook sheet target not found')

def _read_sheet_rows(path: Path) -> list[list[str]]:
    with zipfile.ZipFile(path) as archive:
        shared_strings = _read_shared_strings(archive)
        target = _resolve_sheet_target(archive)
        sheet_root = ET.fromstring(archive.read(f'xl/{target}'))

    rows = []
    for row in sheet_root.findall('.//a:sheetData/a:row', TOKEN_SHEET_NAMESPACE):
        values = []
        for cell in row.findall('a:c', TOKEN_SHEET_NAMESPACE):
            cell_type = cell.attrib.get('t')
            value_node = cell.find('a:v', TOKEN_SHEET_NAMESPACE)
            value = value_node.text if value_node is not None else ''
            if cell_type == 's' and value:
                value = shared_strings[int(value)]
            values.append(value)
        rows.append(values)
    return rows

@lru_cache(maxsize=1)
def load_external_tokens() -> list[dict]:
    workbook_path = next((path for path in get_token_list_paths() if path.exists()), None)
    if workbook_path is None:
        return []

    tokens = []
    seen_addresses = set()
    for row in _read_sheet_rows(workbook_path)[1:]:
        if len(row) < 2:
            continue

        name = (row[0] or '').strip()
        address = (row[1] or '').strip()
        if not name or not Web3.is_address(address):
            continue

        checksum_address = Web3.to_checksum_address(address)
        if checksum_address in seen_addresses:
            continue

        seen_addresses.add(checksum_address)
        tokens.append({
            'symbol': extract_symbol_from_name(name, checksum_address),
            'name': name,
            'address': checksum_address,
            'logo_url': build_logo_url(checksum_address),
        })

    return tokens

@lru_cache(maxsize=512)
def get_onchain_token_metadata(address: str, chain: str | None = None) -> dict:
    runtime = get_chain_runtime_config(chain)
    web3_client = get_web3(runtime["chain"])
    if not web3_client or not web3_client.is_connected():
        raise RuntimeError(f"{runtime['chain_label']} RPC is unavailable")

    checksum_address = Web3.to_checksum_address(address)
    contract = web3_client.eth.contract(address=checksum_address, abi=ERC20_METADATA_ABI)

    try:
        decimals = contract.functions.decimals().call()
    except Exception as exc:
        raise ValueError("Token decimals unavailable on current chain") from exc

    try:
        symbol = contract.functions.symbol().call()
    except Exception:
        symbol = checksum_address[-6:].upper()

    try:
        name = contract.functions.name().call()
    except Exception:
        name = symbol

    return {
        'symbol': symbol,
        'name': name,
        'address': checksum_address,
        'decimals': int(decimals),
    }

def resolve_token(identifier: str, chain: str | None = None) -> dict:
    runtime = get_chain_runtime_config(chain)
    chain_config = get_template_chain_config(runtime["chain"])
    normalized = (identifier or '').strip()
    if not normalized:
        raise ValueError("Token is required")

    wrapped_native_token = {
        'symbol': runtime["wrapped_native_symbol"],
        'name': f"Wrapped {runtime['native_symbol']}",
        'address': runtime["wrapped_native_address"],
        'decimals': 18,
        'logo_url': build_logo_url(runtime["wrapped_native_address"], runtime["trustwallet_slug"]),
    }
    native_token = {
        'symbol': runtime["native_symbol"],
        'name': chain_config["label"],
        'address': runtime["wrapped_native_address"],
        'decimals': 18,
        'logo_url': wrapped_native_token['logo_url'],
    }

    if normalized.upper() == runtime["native_symbol"]:
        return native_token
    if normalized.upper() == runtime["wrapped_native_symbol"]:
        return wrapped_native_token

    for token in chain_config["tokens"]:
        if token.get("symbol", "").upper() != normalized.upper():
            continue
        metadata = None
        if token.get("decimals") is None:
            metadata = get_onchain_token_metadata(token["address"], runtime["chain"])
        return {
            'symbol': token.get('symbol') or (metadata or {}).get('symbol'),
            'name': token.get('name') or (metadata or {}).get('name'),
            'address': (metadata or {}).get('address', Web3.to_checksum_address(token["address"])),
            'decimals': int(token.get('decimals') if token.get('decimals') is not None else (metadata or {}).get('decimals', 18)),
            'logo_url': build_logo_url(Web3.to_checksum_address(token["address"]), runtime["trustwallet_slug"]),
        }

    if runtime["chain"] == TEMPLATE_CHAIN_ETHEREUM:
        token_by_symbol = TOKEN_CONFIG.get(normalized.upper())
        if token_by_symbol:
            return token_by_symbol

    if Web3.is_address(normalized):
        checksum_identifier = Web3.to_checksum_address(normalized)

        if checksum_identifier.lower() == runtime["wrapped_native_address"].lower():
            return wrapped_native_token

        for token in chain_config["tokens"]:
            if token['address'].lower() != checksum_identifier.lower():
                continue
            metadata = None
            if token.get('decimals') is None:
                metadata = get_onchain_token_metadata(token['address'], runtime["chain"])
            return {
                'symbol': token.get('symbol') or (metadata or {}).get('symbol'),
                'name': token.get('name') or (metadata or {}).get('name'),
                'address': (metadata or {}).get('address', checksum_identifier),
                'decimals': int(token.get('decimals') if token.get('decimals') is not None else (metadata or {}).get('decimals', 18)),
                'logo_url': build_logo_url(checksum_identifier, runtime["trustwallet_slug"]),
            }

        if runtime["chain"] == TEMPLATE_CHAIN_ETHEREUM:
            for token in TOKEN_CONFIG.values():
                if token['address'].lower() == checksum_identifier.lower():
                    return token

        for token in load_external_tokens():
            if token['address'].lower() == checksum_identifier.lower():
                metadata = get_onchain_token_metadata(token['address'], runtime["chain"])
                return {
                    'symbol': token.get('symbol') or metadata['symbol'],
                    'name': token.get('name') or metadata['name'],
                    'address': metadata['address'],
                    'decimals': metadata['decimals'],
                    'logo_url': token.get('logo_url'),
                }

        metadata = get_onchain_token_metadata(checksum_identifier, runtime["chain"])
        metadata['logo_url'] = build_logo_url(metadata['address'], runtime["trustwallet_slug"])
        return metadata

    raise ValueError("Unsupported token")

def derive_key(passphrase: bytes, salt: bytes = b'salt_') -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(passphrase))
    return key

def get_master_passphrase() -> bytes:
    passphrase = (os.getenv('MASTER_PASSPHRASE') or '').strip()
    insecure_values = {
        '',
        'your_secure_passphrase_here',
        'changeme',
        'default',
    }
    if passphrase in insecure_values or len(passphrase) < 20:
        raise RuntimeError(
            "MASTER_PASSPHRASE must be a non-default secret with at least 20 characters."
        )
    return passphrase.encode()

@lru_cache(maxsize=1)
def get_legacy_fernet() -> Fernet:
    return Fernet(derive_key(get_master_passphrase()))


def encrypt_secret(secret: str) -> str:
    salt = os.urandom(16)
    fernet = Fernet(derive_key(get_master_passphrase(), salt=salt))
    ciphertext = fernet.encrypt(secret.encode()).decode()
    return json.dumps(
        {
            "v": 2,
            "salt": base64.urlsafe_b64encode(salt).decode(),
            "ciphertext": ciphertext,
        }
    )


def decrypt_secret(payload: str) -> str:
    serialized = (payload or "").strip()
    if not serialized:
        raise ValueError("Encrypted payload is missing")

    try:
        envelope = json.loads(serialized)
    except json.JSONDecodeError:
        envelope = None

    if isinstance(envelope, dict) and envelope.get("v") == 2:
        salt_value = envelope.get("salt")
        ciphertext = envelope.get("ciphertext")
        if not isinstance(salt_value, str) or not isinstance(ciphertext, str):
            raise ValueError("Encrypted payload is invalid")

        try:
            salt = base64.urlsafe_b64decode(salt_value.encode())
        except Exception as exc:
            raise ValueError("Encrypted payload salt is invalid") from exc

        fernet = Fernet(derive_key(get_master_passphrase(), salt=salt))
        return fernet.decrypt(ciphertext.encode()).decode()

    return get_legacy_fernet().decrypt(serialized.encode()).decode()


def get_wallet_access_passphrase() -> str:
    passphrase = (os.getenv("WALLET_ACCESS_PASSPHRASE") or "").strip()
    if len(passphrase) < 20:
        raise RuntimeError("WALLET_ACCESS_PASSPHRASE must be configured with at least 20 characters.")
    master_passphrase = (os.getenv("MASTER_PASSPHRASE") or "").strip()
    if master_passphrase and hmac.compare_digest(passphrase, master_passphrase):
        raise RuntimeError("WALLET_ACCESS_PASSPHRASE must be different from MASTER_PASSPHRASE.")
    return passphrase


def verify_wallet_access_passphrase(candidate: str):
    provided = (candidate or "").strip()
    expected = get_wallet_access_passphrase()
    if not hmac.compare_digest(provided, expected):
        raise ValueError("Invalid wallet access passphrase")

def get_chain_runtime_config(chain: str | None = None) -> dict:
    normalized_chain = normalize_template_chain(chain)
    chain_config = get_template_chain_config(normalized_chain)
    rpc_env_candidates = CHAIN_RPC_ENV_CANDIDATES.get(normalized_chain, [])
    rpc_env_name = next(
        (candidate for candidate in rpc_env_candidates if (os.getenv(candidate) or "").strip()),
        rpc_env_candidates[0] if rpc_env_candidates else None,
    )
    rpc_url = (os.getenv(rpc_env_name or "") or "").strip() if rpc_env_name else ""
    native_symbol = chain_config["native_symbol"]
    wrapped_native_symbol = chain_config["wrapped_native_symbol"]
    return {
        "chain": normalized_chain,
        "chain_label": chain_config["label"],
        "rpc_env_name": rpc_env_name,
        "rpc_url": rpc_url,
        "native_symbol": native_symbol,
        "wrapped_native_symbol": wrapped_native_symbol,
        "wrapped_native_address": Web3.to_checksum_address(chain_config["wrapped_native_address"]),
        "native_balance_key": "eth_balance",
        "wrapped_balance_key": "weth_balance",
        "wrapped_address_key": "weth_address",
        "trustwallet_slug": CHAIN_TRUSTWALLET_SLUG.get(normalized_chain, "smartchain"),
    }


def list_configured_template_chains(*, include_unconfigured: bool = False) -> list[str]:
    configured_chains: list[str] = []
    for chain in CONFIGURABLE_EVM_TEMPLATE_CHAINS:
        runtime = get_chain_runtime_config(chain)
        if include_unconfigured or runtime["rpc_url"]:
            configured_chains.append(chain)
    return configured_chains


@lru_cache(maxsize=32)
def get_wallet_summary_tracked_tokens(chain: str) -> list[dict]:
    normalized_chain = normalize_template_chain(chain)
    tracked_tokens: list[dict] = []
    seen_addresses: set[str] = set()

    for token in get_template_chain_tokens(normalized_chain, include_wrapped_native=False):
        token_address = str(token.get("address") or "").strip()
        if not Web3.is_address(token_address):
            continue
        checksum_address = Web3.to_checksum_address(token_address)
        if checksum_address.lower() in seen_addresses:
            continue
        seen_addresses.add(checksum_address.lower())
        tracked_tokens.append(
            {
                "symbol": token.get("symbol") or checksum_address[-6:].upper(),
                "name": token.get("name") or token.get("symbol") or checksum_address[-6:].upper(),
                "address": checksum_address,
                "decimals": token.get("decimals"),
            }
        )

    return tracked_tokens


def get_swap_runtime_config(chain: str | None = None, backend: str | None = None) -> dict:
    runtimes = get_swap_runtime_configs(chain)
    if backend is None:
        return runtimes[0]
    for runtime in runtimes:
        if runtime["protocol"] == backend:
            return runtime
    normalized_chain = normalize_template_chain(chain)
    chain_config = get_template_chain_config(normalized_chain)
    raise ValueError(f"{backend} routing is not configured for {chain_config['label']}")


def get_swap_runtime_configs(chain: str | None = None) -> list[dict]:
    normalized_chain = normalize_template_chain(chain)
    chain_config = get_template_chain_config(normalized_chain)
    runtimes = []
    for backend in get_template_chain_swap_backends(normalized_chain):
        if backend == SWAP_BACKEND_UNISWAP_V3:
            router_address = UNISWAP_V3_ROUTER_ADDRESSES.get(normalized_chain)
            quoter_address = UNISWAP_V3_QUOTER_V2_ADDRESSES.get(normalized_chain)
            if not router_address or not quoter_address:
                raise ValueError(f"Uniswap V3 routing is not configured for {chain_config['label']}")
            runtimes.append(
                {
                    "protocol": backend,
                    "router_address": Web3.to_checksum_address(router_address),
                    "router_abi": UNISWAP_V3_ROUTER_ABI,
                    "quoter_address": Web3.to_checksum_address(quoter_address),
                    "quoter_abi": UNISWAP_QUOTER_ABI,
                    "supported_fee_tiers": chain_config.get("fee_tiers") or UNISWAP_FEE_TIERS,
                    "route_intermediary_symbols": chain_config.get("route_intermediary_symbols", []),
                }
            )
            continue
        if backend == SWAP_BACKEND_PANCAKESWAP_V2:
            router_address = PANCAKESWAP_V2_ROUTER_ADDRESSES.get(normalized_chain)
            if not router_address:
                raise ValueError(f"PancakeSwap routing is not configured for {chain_config['label']}")
            runtimes.append(
                {
                    "protocol": backend,
                    "router_address": Web3.to_checksum_address(router_address),
                    "router_abi": PANCAKESWAP_V2_ROUTER_ABI,
                    "quoter_address": None,
                    "quoter_abi": None,
                    "supported_fee_tiers": [],
                    "route_intermediary_symbols": chain_config.get("route_intermediary_symbols", []),
                }
            )

    if not runtimes:
        raise ValueError(f"Swap routing is not configured for {chain_config['label']}")
    return runtimes


def _find_chain_token_by_symbol(chain: str, symbol: str) -> dict | None:
    target = (symbol or "").strip().upper()
    if not target:
        return None
    chain_config = get_template_chain_config(chain)
    for token in chain_config["tokens"]:
        if token.get("symbol", "").upper() == target:
            return token
    return None


def _encode_uniswap_v3_path(path_addresses: list[str], path_fee_tiers: list[int]) -> bytes:
    if len(path_addresses) < 2:
        raise ValueError("A Uniswap V3 path needs at least two tokens")
    if len(path_fee_tiers) != len(path_addresses) - 1:
        raise ValueError("Uniswap V3 path fee tier count must match the hop count")

    encoded = bytearray()
    for index, address in enumerate(path_addresses):
        encoded.extend(bytes.fromhex(Web3.to_checksum_address(address)[2:]))
        if index < len(path_fee_tiers):
            encoded.extend(int(path_fee_tiers[index]).to_bytes(3, "big"))
    return bytes(encoded)


def _build_uniswap_v3_route_candidates(
    chain: str,
    token_in: dict,
    token_out: dict,
    fee_tier: int | None,
    supported_fee_tiers: list[int],
    route_intermediary_symbols: list[str],
) -> list[dict]:
    token_in_address = Web3.to_checksum_address(token_in["address"])
    token_out_address = Web3.to_checksum_address(token_out["address"])
    selected_fee_tiers = [int(fee_tier)] if fee_tier is not None else [int(value) for value in supported_fee_tiers]

    seen_routes: set[tuple[str, ...]] = set()
    candidates: list[dict] = []

    def add_candidate(path_symbols: list[str], path_addresses: list[str], path_fee_tiers: list[int], route_type: str):
        key = tuple([address.lower() for address in path_addresses] + [str(value) for value in path_fee_tiers])
        if key in seen_routes:
            return
        seen_routes.add(key)
        candidates.append(
            {
                "route_type": route_type,
                "path_symbols": path_symbols,
                "path_addresses": [Web3.to_checksum_address(address) for address in path_addresses],
                "path_fee_tiers": [int(value) for value in path_fee_tiers],
            }
        )

    for direct_fee_tier in selected_fee_tiers:
        add_candidate(
            [token_in["symbol"], token_out["symbol"]],
            [token_in_address, token_out_address],
            [direct_fee_tier],
            "direct",
        )

    for intermediary_symbol in route_intermediary_symbols:
        intermediary = _find_chain_token_by_symbol(chain, intermediary_symbol)
        if not intermediary:
            continue
        intermediary_address = Web3.to_checksum_address(intermediary["address"])
        if intermediary_address.lower() in {token_in_address.lower(), token_out_address.lower()}:
            continue
        if fee_tier is not None:
            fee_pairs = [(int(fee_tier), int(fee_tier))]
        else:
            fee_pairs = [
                (first_fee_tier, second_fee_tier)
                for first_fee_tier in selected_fee_tiers
                for second_fee_tier in selected_fee_tiers
            ]
        for first_fee_tier, second_fee_tier in fee_pairs:
            add_candidate(
                [token_in["symbol"], intermediary.get("symbol") or intermediary_symbol, token_out["symbol"]],
                [token_in_address, intermediary_address, token_out_address],
                [first_fee_tier, second_fee_tier],
                "multihop",
            )

    return candidates


def _build_v2_swap_paths(chain: str, token_in_address: str, token_out_address: str) -> list[list[str]]:
    chain_config = get_template_chain_config(chain)
    token_in_checksum = Web3.to_checksum_address(token_in_address)
    token_out_checksum = Web3.to_checksum_address(token_out_address)
    candidate_paths: list[list[str]] = [[token_in_checksum, token_out_checksum]]
    seen_paths = {tuple(address.lower() for address in candidate_paths[0])}

    for symbol in chain_config.get("route_intermediary_symbols", []):
        intermediary = next(
            (token for token in chain_config["tokens"] if token.get("symbol", "").upper() == symbol.upper()),
            None,
        )
        if not intermediary:
            continue
        intermediary_address = Web3.to_checksum_address(intermediary["address"])
        if intermediary_address.lower() in {token_in_checksum.lower(), token_out_checksum.lower()}:
            continue
        path = [token_in_checksum, intermediary_address, token_out_checksum]
        path_key = tuple(address.lower() for address in path)
        if path_key in seen_paths:
            continue
        candidate_paths.append(path)
        seen_paths.add(path_key)

    return candidate_paths


WEB3_RPC_TIMEOUT_SECONDS = 10


def get_web3(chain: str | None = None) -> Web3 | None:
    runtime = get_chain_runtime_config(chain)
    if not runtime["rpc_url"]:
        return None
    return Web3(Web3.HTTPProvider(
        runtime["rpc_url"],
        request_kwargs={"timeout": WEB3_RPC_TIMEOUT_SECONDS},
    ))


def ensure_supported_template_chain(template: dict):
    get_template_chain_config(template.get("chain"))


def get_weth_balance(address: str, web3_client: Web3 | None = None, *, chain: str | None = None) -> float | None:
    runtime = get_chain_runtime_config(chain)
    client = web3_client or get_web3(chain)
    if not client or not client.is_connected():
        return None

    try:
        weth_contract = client.eth.contract(address=runtime["wrapped_native_address"], abi=WETH_ABI)
        balance_wei = weth_contract.functions.balanceOf(address).call()
        balance_eth = client.from_wei(balance_wei, 'ether')
        return float(balance_eth)
    except Exception:
        return None


def get_eth_balance(address: str, web3_client: Web3 | None = None, *, chain: str | None = None) -> float | None:
    client = web3_client or get_web3(chain)
    if not client or not client.is_connected():
        return None

    try:
        balance_wei = client.eth.get_balance(address)
        balance_eth = client.from_wei(balance_wei, 'ether')
        return float(balance_eth)
    except Exception:
        return None


def get_wallet_balances(address: str, chain: str | None = None, *, live_balances: bool = True) -> dict:
    runtime = get_chain_runtime_config(chain)
    payload = {
        'chain': runtime["chain"],
        'chain_label': runtime["chain_label"],
        'native_symbol': runtime["native_symbol"],
        'wrapped_native_symbol': runtime["wrapped_native_symbol"],
        'eth_balance': None,
        'weth_balance': None,
        'weth_address': runtime["wrapped_native_address"],
        'balances_live': False,
        'balance_error': None,
        'balance_refreshed_at': None,
        'funding_gas_price_gwei': None,
    }

    if not live_balances:
        return payload

    web3_client = get_web3(chain)
    refreshed_at = datetime.now(timezone.utc).isoformat()
    gas_price_gwei = None
    payload['balance_refreshed_at'] = refreshed_at

    if not web3_client:
        payload['balance_error'] = (
            f"{runtime['rpc_env_name']} is not configured"
            if runtime["rpc_env_name"]
            else f"{runtime['chain_label']} RPC is not configured"
        )
        return payload

    if not web3_client.is_connected():
        payload['balance_error'] = f"{runtime['chain_label']} RPC is unavailable"
        return payload

    eth_balance = get_eth_balance(address, web3_client, chain=runtime["chain"])
    weth_balance = get_weth_balance(address, web3_client, chain=runtime["chain"])
    try:
        gas_price_gwei = float(web3_client.from_wei(web3_client.eth.gas_price, 'gwei'))
    except Exception:
        gas_price_gwei = None

    payload['eth_balance'] = eth_balance
    payload['weth_balance'] = weth_balance
    payload['funding_gas_price_gwei'] = gas_price_gwei
    payload['balances_live'] = eth_balance is not None and weth_balance is not None
    if not payload['balances_live']:
        payload['balance_error'] = (
            f"Failed to fetch live {runtime['native_symbol']} and {runtime['wrapped_native_symbol']} balances"
        )

    return {
        **payload,
    }


def get_wallet_summary_token_holdings(address: str, chain: str | None = None) -> list[dict]:
    owner_address = Web3.to_checksum_address(address)
    token_holdings: list[dict] = []
    if chain is None:
        source_chains = list_configured_template_chains()
    else:
        source_chains = [normalize_template_chain(chain)]

    for source_chain in source_chains:
        tracked_tokens = get_wallet_summary_tracked_tokens(source_chain)
        if not tracked_tokens:
            continue

        runtime = get_chain_runtime_config(source_chain)
        web3_client = get_web3(source_chain)
        if not web3_client or not web3_client.is_connected():
            continue

        for token in tracked_tokens:
            token_contract = web3_client.eth.contract(address=token["address"], abi=ERC20_ABI)
            try:
                raw_balance = int(token_contract.functions.balanceOf(owner_address).call())
            except Exception:
                continue

            if raw_balance <= 0:
                continue

            decimals = token.get("decimals")
            symbol = token.get("symbol") or token["address"][-6:].upper()
            name = token.get("name") or symbol
            if decimals is None:
                try:
                    metadata = get_onchain_token_metadata(token["address"], source_chain)
                except Exception:
                    continue
                decimals = metadata["decimals"]
                symbol = metadata.get("symbol") or symbol
                name = metadata.get("name") or name

            token_holdings.append(
                {
                    "symbol": symbol,
                    "name": name,
                    "address": token["address"],
                    "decimals": int(decimals),
                    "raw_balance": str(raw_balance),
                    "balance": format_decimal(token_units_to_decimal(raw_balance, int(decimals))),
                    "error": None,
                    "chain": source_chain,
                    "chain_label": runtime["chain_label"],
                }
            )

    token_holdings.sort(
        key=lambda item: (
            str(item.get("chain_label") or ""),
            str(item.get("symbol") or ""),
            str(item.get("address") or ""),
        )
    )
    return token_holdings


def format_decimal(value: Decimal | None):
    if value is None:
        return None
    if value == 0:
        return "0"
    return format(value.normalize(), "f")


def get_legacy_gas_stage_multiplier(chain: str | None, tx_stage: str) -> Decimal:
    normalized_chain = normalize_template_chain(chain)
    stage_policy = LEGACY_EVM_GAS_STAGE_MULTIPLIERS.get(tx_stage) or {}
    return stage_policy.get(normalized_chain, stage_policy.get("default", Decimal("1.0")))


def get_legacy_gas_stage_pending_timeout_seconds(tx_stage: str) -> int:
    return int(
        LEGACY_EVM_GAS_STAGE_PENDING_TIMEOUT_SECONDS.get(
            tx_stage,
            DEFAULT_TRANSACTION_RECEIPT_TIMEOUT_SECONDS,
        )
    )


def _apply_gas_price_multiplier(value_wei: int, multiplier: Decimal) -> int:
    if value_wei <= 0:
        return 0
    bumped = int((Decimal(value_wei) * multiplier).to_integral_value(rounding=ROUND_DOWN))
    if multiplier > Decimal("1") and bumped <= value_wei:
        bumped = value_wei + 1
    return max(bumped, value_wei)


def resolve_legacy_aggressive_gas_pricing(
    web3_client: Web3,
    *,
    chain: str | None,
    tx_stage: str,
    attempt: int = 1,
    previous_gas_price_wei: int | None = None,
    cached_node_gas_price_wei: int | None = None,
) -> dict:
    node_gas_price_wei = cached_node_gas_price_wei if cached_node_gas_price_wei is not None else int(web3_client.eth.gas_price)
    stage_multiplier = get_legacy_gas_stage_multiplier(chain, tx_stage)
    suggested_gas_price_wei = _apply_gas_price_multiplier(node_gas_price_wei, stage_multiplier)
    retry_multiplier = None
    submitted_gas_price_wei = suggested_gas_price_wei

    if attempt > 1 and previous_gas_price_wei and previous_gas_price_wei > 0:
        retry_multiplier = LEGACY_EVM_RETRY_GAS_PRICE_MULTIPLIERS.get(
            int(attempt),
            LEGACY_EVM_RETRY_GAS_PRICE_MULTIPLIERS[max(LEGACY_EVM_RETRY_GAS_PRICE_MULTIPLIERS)],
        )
        retry_bumped_gas_price_wei = _apply_gas_price_multiplier(previous_gas_price_wei, retry_multiplier)
        submitted_gas_price_wei = max(suggested_gas_price_wei, retry_bumped_gas_price_wei)

    return {
        "chain": normalize_template_chain(chain),
        "tx_stage": tx_stage,
        "attempt": int(attempt),
        "node_gas_price_wei": node_gas_price_wei,
        "submitted_gas_price_wei": submitted_gas_price_wei,
        "stage_multiplier": str(stage_multiplier),
        "retry_multiplier": str(retry_multiplier) if retry_multiplier is not None else None,
        "pending_timeout_seconds": get_legacy_gas_stage_pending_timeout_seconds(tx_stage),
    }


def build_legacy_gas_log_details(gas_pricing: dict | None) -> dict:
    if not gas_pricing:
        return {}
    node_gas_price_wei = int(gas_pricing.get("node_gas_price_wei") or 0)
    submitted_gas_price_wei = int(gas_pricing.get("submitted_gas_price_wei") or 0)
    return {
        "tx_stage": gas_pricing.get("tx_stage"),
        "attempt": gas_pricing.get("attempt"),
        "node_gas_price_wei": node_gas_price_wei,
        "submitted_gas_price_wei": submitted_gas_price_wei,
        "node_gas_price_gwei": format_decimal(Decimal(node_gas_price_wei) / Decimal("1000000000")),
        "submitted_gas_price_gwei": format_decimal(Decimal(submitted_gas_price_wei) / Decimal("1000000000")),
        "multiplier": gas_pricing.get("stage_multiplier"),
        "retry_multiplier": gas_pricing.get("retry_multiplier"),
        "pending_timeout_seconds": gas_pricing.get("pending_timeout_seconds"),
    }


def estimate_legacy_aggressive_stage_fee_eth(
    web3_client: Web3,
    gas_units: int,
    *,
    chain: str | None,
    tx_stage: str,
    gas_price_wei: int | None = None,
) -> Decimal:
    resolved_gas_price_wei = (
        int(gas_price_wei)
        if gas_price_wei is not None and int(gas_price_wei) > 0
        else int(
            resolve_legacy_aggressive_gas_pricing(
                web3_client,
                chain=chain,
                tx_stage=tx_stage,
            )["submitted_gas_price_wei"]
        )
    )
    return wei_to_decimal(max(int(gas_units), 0) * resolved_gas_price_wei)


def estimate_legacy_aggressive_multi_stage_fee_eth(
    web3_client: Web3,
    stage_gas_units: dict[str, int],
    *,
    chain: str | None,
) -> Decimal:
    total_fee_eth = Decimal("0")
    for tx_stage, gas_units in stage_gas_units.items():
        if int(gas_units or 0) <= 0:
            continue
        total_fee_eth += estimate_legacy_aggressive_stage_fee_eth(
            web3_client,
            int(gas_units),
            chain=chain,
            tx_stage=tx_stage,
        )
    return total_fee_eth


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def append_run_log(
    logs: list[dict],
    *,
    stage: str,
    event: str,
    message: str,
    status: str = "info",
    tx_hash: str | None = None,
    wallet_id: str | None = None,
    wallet_address: str | None = None,
    movement: dict | None = None,
    details: dict | None = None,
):
    entry = {
        "timestamp": utcnow_iso(),
        "stage": stage,
        "event": event,
        "status": status,
        "message": message,
    }
    if tx_hash:
        entry["tx_hash"] = tx_hash
    if wallet_id:
        entry["wallet_id"] = wallet_id
    if wallet_address:
        entry["wallet_address"] = wallet_address
    if movement:
        entry["movement"] = movement
    if details:
        entry["details"] = details
    logs.append(entry)
    return entry


def parse_decimal_amount(value, field_name: str) -> Decimal:
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise ValueError(f"Invalid {field_name}") from exc

    if parsed < 0:
        raise ValueError(f"{field_name} must be 0 or greater")
    return parsed


def decimal_to_wei(value: Decimal) -> int:
    normalized = (value * ETH_DECIMALS).quantize(Decimal("1"), rounding=ROUND_DOWN)
    return int(normalized)


def wei_to_decimal(value: int) -> Decimal:
    return Decimal(value) / ETH_DECIMALS


def decimal_to_token_units(value: Decimal, decimals: int) -> int:
    scale = Decimal(10) ** decimals
    normalized = (value * scale).quantize(Decimal("1"), rounding=ROUND_DOWN)
    return int(normalized)


def token_units_to_decimal(value: int, decimals: int) -> Decimal:
    return Decimal(value) / (Decimal(10) ** decimals)


def estimate_execution_network_fee_wei(contract_count: int, *, eth_per_wallet: Decimal, weth_per_wallet: Decimal, wrap_eth_total: Decimal) -> dict:
    web3_client = get_web3()
    if not web3_client or not web3_client.is_connected():
        raise RuntimeError("Ethereum RPC is unavailable")

    gas_price = web3_client.eth.gas_price
    gas_units = 0
    if wrap_eth_total > 0:
        gas_units += WETH_DEPOSIT_GAS_LIMIT
    if eth_per_wallet > 0:
        gas_units += ETH_TRANSFER_GAS_LIMIT * contract_count
    if weth_per_wallet > 0:
        gas_units += WETH_TRANSFER_GAS_LIMIT * contract_count

    fee_wei = gas_units * gas_price
    return {
        "gas_price_wei": gas_price,
        "gas_units": gas_units,
        "fee_wei": fee_wei,
        "fee_eth": format_decimal(wei_to_decimal(fee_wei)),
    }


def build_transaction_envelope(
    web3_client: Web3,
    sender: str,
    nonce: int,
    *,
    gas: int,
    value: int = 0,
    gas_price_wei: int | None = None,
    to: str | None = None,
) -> dict:
    payload = {
        "chainId": web3_client.eth.chain_id,
        "from": sender,
        "nonce": nonce,
        "gas": gas,
        "gasPrice": gas_price_wei or web3_client.eth.gas_price,
        "value": value,
    }
    if to:
        payload["to"] = Web3.to_checksum_address(to)
    return payload


def send_signed_transaction(web3_client: Web3, tx: dict, private_key: str) -> str:
    signed = Account.sign_transaction(tx, private_key)
    raw_transaction = getattr(signed, "raw_transaction", None)
    if raw_transaction is None:
        raw_transaction = getattr(signed, "rawTransaction")
    tx_hash = web3_client.eth.send_raw_transaction(raw_transaction)
    return tx_hash.hex()


def wait_for_transaction_success(
    web3_client: Web3,
    tx_hash: str,
    *,
    timeout: int = DEFAULT_TRANSACTION_RECEIPT_TIMEOUT_SECONDS,
):
    receipt = web3_client.eth.wait_for_transaction_receipt(tx_hash, timeout=timeout)
    if not receipt or int(receipt.status) != 1:
        raise RuntimeError(f"Transaction failed: {tx_hash}")
    return receipt


def get_transaction_receipt_if_available(web3_client: Web3, tx_hash: str | None):
    if not tx_hash:
        return None
    try:
        return web3_client.eth.get_transaction_receipt(tx_hash)
    except TransactionNotFound:
        return None


def _rlp_encode_bytes(value: bytes) -> bytes:
    if len(value) == 1 and value[0] < 0x80:
        return value
    if len(value) <= 55:
        return bytes([0x80 + len(value)]) + value

    length_bytes = len(value).to_bytes((len(value).bit_length() + 7) // 8, "big")
    return bytes([0xB7 + len(length_bytes)]) + length_bytes + value


def _rlp_encode_list(items: list[bytes]) -> bytes:
    payload = b"".join(items)
    if len(payload) <= 55:
        return bytes([0xC0 + len(payload)]) + payload

    length_bytes = len(payload).to_bytes((len(payload).bit_length() + 7) // 8, "big")
    return bytes([0xF7 + len(length_bytes)]) + length_bytes + payload


def compute_create_contract_address(deployer_address: str, nonce: int) -> str:
    deployer_bytes = bytes.fromhex(Web3.to_checksum_address(deployer_address)[2:])
    nonce_bytes = b"" if nonce == 0 else nonce.to_bytes((nonce.bit_length() + 7) // 8, "big")
    encoded = _rlp_encode_list([
        _rlp_encode_bytes(deployer_bytes),
        _rlp_encode_bytes(nonce_bytes),
    ])
    derived_address = Web3.keccak(encoded)[-20:].hex()
    return Web3.to_checksum_address(f"0x{derived_address}")


def contract_code_exists(web3_client: Web3, contract_address: str | None) -> bool:
    if not contract_address:
        return False
    code = web3_client.eth.get_code(Web3.to_checksum_address(contract_address))
    return len(bytes(code)) > 0


def build_deployment_result_from_receipt(
    receipt,
    *,
    tx_hash: str,
    deployer_address: str,
    nonce: int | None = None,
    gas_price_wei: int | None = None,
) -> dict:
    contract_address = getattr(receipt, "contractAddress", None)
    if not contract_address:
        raise RuntimeError(f"Contract deployment failed: {tx_hash}")

    return {
        "tx_hash": tx_hash,
        "contract_address": Web3.to_checksum_address(contract_address),
        "status": "deployed",
        "deployer_address": Web3.to_checksum_address(deployer_address),
        "gas_used": int(getattr(receipt, "gasUsed", 0) or 0),
        "block_number": int(getattr(receipt, "blockNumber", 0) or 0),
        "nonce": nonce,
        "gas_price_wei": gas_price_wei,
    }


def build_deployment_result_from_contract_address(
    contract_address: str,
    *,
    tx_hash: str | None,
    deployer_address: str,
    nonce: int | None = None,
    gas_price_wei: int | None = None,
    confirmation_source: str = "code_check",
) -> dict:
    return {
        "tx_hash": tx_hash,
        "contract_address": Web3.to_checksum_address(contract_address),
        "status": "deployed",
        "deployer_address": Web3.to_checksum_address(deployer_address),
        "gas_used": None,
        "block_number": None,
        "nonce": nonce,
        "gas_price_wei": gas_price_wei,
        "confirmation_source": confirmation_source,
    }


def _is_retryable_transaction_wait_error(exc: Exception) -> bool:
    return isinstance(exc, TimeExhausted) or "not in the chain after" in str(exc).lower()


def _is_retryable_transaction_submit_error(exc: Exception) -> bool:
    error_message = str(exc).lower()
    return any(
        pattern in error_message
        for pattern in (
            "replacement transaction underpriced",
            "already known",
            "nonce too low",
        )
    )


def get_bumped_gas_price_wei(
    web3_client: Web3,
    previous_gas_price_wei: int | None,
    *,
    multiplier: Decimal = MANAGED_TOKEN_DISTRIBUTOR_DEPLOY_GAS_PRICE_BUMP_MULTIPLIER,
) -> int:
    latest_gas_price_wei = int(web3_client.eth.gas_price)
    if not previous_gas_price_wei or previous_gas_price_wei <= 0:
        return latest_gas_price_wei

    bumped = int((Decimal(previous_gas_price_wei) * multiplier).to_integral_value(rounding=ROUND_DOWN))
    if bumped <= previous_gas_price_wei:
        bumped = previous_gas_price_wei + 1
    return max(latest_gas_price_wei, bumped)


def recover_deployment_after_timeout(
    web3_client: Web3,
    *,
    deployer_address: str,
    nonce: int | None,
    tx_hash: str | None,
    gas_price_wei: int | None,
    grace_seconds: int = MANAGED_TOKEN_DISTRIBUTOR_DEPLOY_POST_TIMEOUT_GRACE_SECONDS,
    poll_interval_seconds: int = MANAGED_TOKEN_DISTRIBUTOR_DEPLOY_POST_TIMEOUT_POLL_INTERVAL_SECONDS,
) -> dict | None:
    expected_contract_address = (
        compute_create_contract_address(deployer_address, nonce)
        if nonce is not None
        else None
    )
    deadline = time.monotonic() + max(int(grace_seconds), 0)

    while True:
        receipt = get_transaction_receipt_if_available(web3_client, tx_hash)
        if receipt:
            if int(getattr(receipt, "status", 0) or 0) == 1:
                return build_deployment_result_from_receipt(
                    receipt,
                    tx_hash=tx_hash or "",
                    deployer_address=deployer_address,
                    nonce=nonce,
                    gas_price_wei=gas_price_wei,
                )
            raise RuntimeError(f"Transaction failed: {tx_hash}")

        if expected_contract_address and contract_code_exists(web3_client, expected_contract_address):
            return build_deployment_result_from_contract_address(
                expected_contract_address,
                tx_hash=tx_hash,
                deployer_address=deployer_address,
                nonce=nonce,
                gas_price_wei=gas_price_wei,
            )

        if time.monotonic() >= deadline:
            return None

        time.sleep(max(int(poll_interval_seconds), 1))


def deploy_contract_from_wallet(
    web3_client: Web3,
    *,
    chain: str | None = None,
    wallet_address: str,
    private_key: str,
    abi: list[dict],
    bytecode: str,
    constructor_args: list,
    nonce: int | None = None,
    gas_price_wei: int | None = None,
    wait_timeout: int | None = None,
    gas_limit: int = MANAGED_TOKEN_DISTRIBUTOR_DEPLOY_GAS_LIMIT,
) -> dict:
    deployer = Web3.to_checksum_address(wallet_address)
    contract = web3_client.eth.contract(abi=abi, bytecode=bytecode)
    deployment_nonce = nonce if nonce is not None else web3_client.eth.get_transaction_count(deployer, "pending")
    deployment_gas_price_wei = (
        int(gas_price_wei)
        if gas_price_wei is not None and int(gas_price_wei) > 0
        else int(
            resolve_legacy_aggressive_gas_pricing(
                web3_client,
                chain=chain,
                tx_stage=LEGACY_GAS_STAGE_DEPLOY_TREASURY,
            )["submitted_gas_price_wei"]
        )
    )
    deployment_wait_timeout = int(wait_timeout or get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_DEPLOY_TREASURY))

    try:
        estimated_gas = contract.constructor(*constructor_args).estimate_gas({
            "from": deployer,
        })
    except Exception:
        estimated_gas = gas_limit

    deployment_tx = contract.constructor(*constructor_args).build_transaction(
        build_transaction_envelope(
            web3_client,
            deployer,
            deployment_nonce,
            gas=max(int(estimated_gas), gas_limit),
            gas_price_wei=deployment_gas_price_wei,
        )
    )
    try:
        tx_hash = send_signed_transaction(web3_client, deployment_tx, private_key)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            nonce=deployment_nonce,
            gas_price_wei=deployment_gas_price_wei,
            retryable=_is_retryable_transaction_submit_error(exc),
        ) from exc

    try:
        receipt = wait_for_transaction_success(web3_client, tx_hash, timeout=deployment_wait_timeout)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            tx_hash=tx_hash,
            nonce=deployment_nonce,
            gas_price_wei=deployment_gas_price_wei,
            retryable=_is_retryable_transaction_wait_error(exc),
        ) from exc

    return build_deployment_result_from_receipt(
        receipt,
        tx_hash=tx_hash,
        deployer_address=deployer,
        nonce=deployment_nonce,
        gas_price_wei=deployment_gas_price_wei,
    )


def build_contract_call_result_from_receipt(
    receipt,
    *,
    tx_hash: str,
    nonce: int | None = None,
    gas_price_wei: int | None = None,
    confirmation_source: str = "receipt",
) -> dict:
    return {
        "tx_hash": tx_hash,
        "status": "confirmed",
        "gas_used": int(getattr(receipt, "gasUsed", 0) or 0),
        "block_number": int(getattr(receipt, "blockNumber", 0) or 0),
        "nonce": nonce,
        "gas_price_wei": gas_price_wei,
        "confirmation_source": confirmation_source,
    }


def build_contract_call_result_from_state(
    *,
    tx_hash: str | None,
    nonce: int | None = None,
    gas_price_wei: int | None = None,
    confirmation_source: str = "state_check",
) -> dict:
    return {
        "tx_hash": tx_hash,
        "status": "confirmed",
        "gas_used": None,
        "block_number": None,
        "nonce": nonce,
        "gas_price_wei": gas_price_wei,
        "confirmation_source": confirmation_source,
    }


def recover_managed_token_distributor_execution_after_timeout(
    web3_client: Web3,
    *,
    contract_address: str,
    abi: list[dict],
    tx_hash: str | None,
    nonce: int | None,
    gas_price_wei: int | None,
    grace_seconds: int = MANAGED_TOKEN_DISTRIBUTOR_EXECUTE_POST_TIMEOUT_GRACE_SECONDS,
    poll_interval_seconds: int = MANAGED_TOKEN_DISTRIBUTOR_EXECUTE_POST_TIMEOUT_POLL_INTERVAL_SECONDS,
) -> dict | None:
    contract = web3_client.eth.contract(
        address=Web3.to_checksum_address(contract_address),
        abi=abi,
    )
    deadline = time.monotonic() + max(int(grace_seconds), 0)

    while True:
        receipt = get_transaction_receipt_if_available(web3_client, tx_hash)
        if receipt:
            if int(getattr(receipt, "status", 0) or 0) == 1:
                return build_contract_call_result_from_receipt(
                    receipt,
                    tx_hash=tx_hash or "",
                    nonce=nonce,
                    gas_price_wei=gas_price_wei,
                )
            raise RuntimeError(f"Transaction failed: {tx_hash}")

        try:
            if bool(contract.functions.executed().call()):
                return build_contract_call_result_from_state(
                    tx_hash=tx_hash,
                    nonce=nonce,
                    gas_price_wei=gas_price_wei,
                )
        except Exception:
            pass

        if time.monotonic() >= deadline:
            return None

        time.sleep(max(int(poll_interval_seconds), 1))


def execute_managed_token_distributor_from_wallet(
    web3_client: Web3,
    *,
    chain: str | None = None,
    contract_address: str,
    wallet_address: str,
    private_key: str,
    abi: list[dict],
    nonce: int,
    gas_price_wei: int | None = None,
    wait_timeout: int | None = None,
    gas_limit: int = MANAGED_TOKEN_DISTRIBUTOR_EXECUTE_GAS_LIMIT,
) -> dict:
    owner = Web3.to_checksum_address(wallet_address)
    contract = web3_client.eth.contract(
        address=Web3.to_checksum_address(contract_address),
        abi=abi,
    )
    execution_gas_price_wei = (
        int(gas_price_wei)
        if gas_price_wei is not None and int(gas_price_wei) > 0
        else int(
            resolve_legacy_aggressive_gas_pricing(
                web3_client,
                chain=chain,
                tx_stage=LEGACY_GAS_STAGE_BATCH_SEND,
            )["submitted_gas_price_wei"]
        )
    )
    execution_wait_timeout = int(wait_timeout or get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_BATCH_SEND))

    try:
        estimated_gas = contract.functions.execute().estimate_gas({"from": owner})
    except Exception:
        try:
            contract.functions.execute().call({"from": owner})
        except Exception as call_exc:
            raise WalletTransactionError(
                str(call_exc),
                nonce=nonce,
                gas_price_wei=execution_gas_price_wei,
                retryable=False,
            ) from call_exc
        estimated_gas = gas_limit

    tx = contract.functions.execute().build_transaction(
        build_transaction_envelope(
            web3_client,
            owner,
            nonce,
            gas=max(int(estimated_gas), gas_limit),
            gas_price_wei=execution_gas_price_wei,
        )
    )

    try:
        tx_hash = send_signed_transaction(web3_client, tx, private_key)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            nonce=nonce,
            gas_price_wei=execution_gas_price_wei,
            retryable=_is_retryable_transaction_submit_error(exc),
        ) from exc

    try:
        receipt = wait_for_transaction_success(web3_client, tx_hash, timeout=execution_wait_timeout)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            tx_hash=tx_hash,
            nonce=nonce,
            gas_price_wei=execution_gas_price_wei,
            retryable=_is_retryable_transaction_wait_error(exc),
        ) from exc

    return build_contract_call_result_from_receipt(
        receipt,
        tx_hash=tx_hash,
        nonce=nonce,
        gas_price_wei=execution_gas_price_wei,
    )


def recover_batch_treasury_distributor_batch_send_after_timeout(
    web3_client: Web3,
    *,
    tx_hash: str | None,
    nonce: int | None,
    gas_price_wei: int | None,
    grace_seconds: int = BATCH_TREASURY_DISTRIBUTOR_BATCH_SEND_POST_TIMEOUT_GRACE_SECONDS,
    poll_interval_seconds: int = BATCH_TREASURY_DISTRIBUTOR_BATCH_SEND_POST_TIMEOUT_POLL_INTERVAL_SECONDS,
) -> dict | None:
    deadline = time.monotonic() + max(int(grace_seconds), 0)

    while True:
        receipt = get_transaction_receipt_if_available(web3_client, tx_hash)
        if receipt:
            if int(getattr(receipt, "status", 0) or 0) == 1:
                return build_contract_call_result_from_receipt(
                    receipt,
                    tx_hash=tx_hash or "",
                    nonce=nonce,
                    gas_price_wei=gas_price_wei,
                )
            raise RuntimeError(f"Transaction failed: {tx_hash}")

        if time.monotonic() >= deadline:
            return None

        time.sleep(max(int(poll_interval_seconds), 1))


def execute_batch_treasury_distributor_batch_send_from_wallet(
    web3_client: Web3,
    *,
    chain: str | None = None,
    contract_address: str,
    wallet_address: str,
    private_key: str,
    abi: list[dict],
    recipients: list[str],
    eth_amounts: list[int],
    tokens: list[str],
    token_amounts: list[int],
    nonce: int,
    gas_price_wei: int | None = None,
    wait_timeout: int | None = None,
) -> dict:
    owner = Web3.to_checksum_address(wallet_address)
    contract = web3_client.eth.contract(
        address=Web3.to_checksum_address(contract_address),
        abi=abi,
    )
    batch_send_gas_price_wei = (
        int(gas_price_wei)
        if gas_price_wei is not None and int(gas_price_wei) > 0
        else int(
            resolve_legacy_aggressive_gas_pricing(
                web3_client,
                chain=chain,
                tx_stage=LEGACY_GAS_STAGE_BATCH_SEND,
            )["submitted_gas_price_wei"]
        )
    )
    batch_send_wait_timeout = int(wait_timeout or get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_BATCH_SEND))
    normalized_recipients = [Web3.to_checksum_address(address) for address in recipients]
    normalized_tokens = [
        Web3.to_checksum_address(token) if token != NATIVE_ETH_SENTINEL_ADDRESS else Web3.to_checksum_address("0x0000000000000000000000000000000000000000")
        for token in tokens
    ]
    base_gas_limit = (
        BATCH_TREASURY_DISTRIBUTOR_BATCH_SEND_BASE_GAS_LIMIT
        + (BATCH_TREASURY_DISTRIBUTOR_BATCH_SEND_PER_ENTRY_GAS_LIMIT * len(normalized_recipients))
    )

    try:
        estimated_gas = contract.functions.batchSend(
            normalized_recipients,
            eth_amounts,
            normalized_tokens,
            token_amounts,
        ).estimate_gas({"from": owner})
    except Exception:
        try:
            contract.functions.batchSend(
                normalized_recipients,
                eth_amounts,
                normalized_tokens,
                token_amounts,
            ).call({"from": owner})
        except Exception as call_exc:
            raise WalletTransactionError(
                str(call_exc),
                nonce=nonce,
                gas_price_wei=batch_send_gas_price_wei,
                retryable=False,
            ) from call_exc
        estimated_gas = base_gas_limit

    tx = contract.functions.batchSend(
        normalized_recipients,
        eth_amounts,
        normalized_tokens,
        token_amounts,
    ).build_transaction(
        build_transaction_envelope(
            web3_client,
            owner,
            nonce,
            gas=max(int(estimated_gas), base_gas_limit),
            gas_price_wei=batch_send_gas_price_wei,
        )
    )

    try:
        tx_hash = send_signed_transaction(web3_client, tx, private_key)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            nonce=nonce,
            gas_price_wei=batch_send_gas_price_wei,
            retryable=_is_retryable_transaction_submit_error(exc),
        ) from exc

    try:
        receipt = wait_for_transaction_success(web3_client, tx_hash, timeout=batch_send_wait_timeout)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            tx_hash=tx_hash,
            nonce=nonce,
            gas_price_wei=batch_send_gas_price_wei,
            retryable=_is_retryable_transaction_wait_error(exc),
        ) from exc

    return build_contract_call_result_from_receipt(
        receipt,
        tx_hash=tx_hash,
        nonce=nonce,
        gas_price_wei=batch_send_gas_price_wei,
    )


def wrap_eth_to_weth_from_wallet(
    web3_client: Web3,
    *,
    chain: str | None = None,
    wallet_address: str,
    private_key: str,
    wrapped_native_address: str | None = None,
    amount_wei: int,
    nonce: int,
    gas_price_wei: int | None = None,
    wait_timeout: int | None = None,
    gas_limit: int = WETH_DEPOSIT_GAS_LIMIT,
) -> dict:
    owner = Web3.to_checksum_address(wallet_address)
    wrapped_token_address = Web3.to_checksum_address(wrapped_native_address or WETH_ADDRESS)
    weth_contract = web3_client.eth.contract(
        address=wrapped_token_address,
        abi=WETH_ABI,
    )
    wrap_gas_price_wei = (
        int(gas_price_wei)
        if gas_price_wei is not None and int(gas_price_wei) > 0
        else int(
            resolve_legacy_aggressive_gas_pricing(
                web3_client,
                chain=chain,
                tx_stage=LEGACY_GAS_STAGE_WRAP,
            )["submitted_gas_price_wei"]
        )
    )
    wrap_wait_timeout = int(wait_timeout or get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_WRAP))

    try:
        estimated_gas = weth_contract.functions.deposit().estimate_gas(
            {
                "from": owner,
                "value": amount_wei,
            }
        )
    except Exception:
        estimated_gas = gas_limit

    wrap_tx = weth_contract.functions.deposit().build_transaction(
        build_transaction_envelope(
            web3_client,
            owner,
            nonce,
            gas=max(int(estimated_gas), gas_limit),
            value=amount_wei,
            gas_price_wei=wrap_gas_price_wei,
        )
    )

    try:
        tx_hash = send_signed_transaction(web3_client, wrap_tx, private_key)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            nonce=nonce,
            gas_price_wei=wrap_gas_price_wei,
            retryable=_is_retryable_transaction_submit_error(exc),
        ) from exc

    try:
        receipt = wait_for_transaction_success(web3_client, tx_hash, timeout=wrap_wait_timeout)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            tx_hash=tx_hash,
            nonce=nonce,
            gas_price_wei=wrap_gas_price_wei,
            retryable=_is_retryable_transaction_wait_error(exc),
        ) from exc

    return build_wrap_result(
        tx_hash=tx_hash,
        amount_wei=amount_wei,
        nonce=nonce,
        gas_price_wei=wrap_gas_price_wei,
        gas_used=int(getattr(receipt, "gasUsed", 0) or 0),
        block_number=int(getattr(receipt, "blockNumber", 0) or 0),
    )


def get_token_allowance(
    web3_client: Web3,
    *,
    token_address: str,
    owner_address: str,
    spender_address: str,
) -> int:
    token_contract = web3_client.eth.contract(address=Web3.to_checksum_address(token_address), abi=ERC20_ABI)
    return int(token_contract.functions.allowance(
        Web3.to_checksum_address(owner_address),
        Web3.to_checksum_address(spender_address),
    ).call())


def build_approval_result_from_receipt(
    receipt,
    *,
    tx_hash: str,
    nonce: int | None = None,
    gas_price_wei: int | None = None,
) -> dict:
    return {
        "tx_hash": tx_hash,
        "status": "confirmed",
        "gas_used": int(getattr(receipt, "gasUsed", 0) or 0),
        "block_number": int(getattr(receipt, "blockNumber", 0) or 0),
        "nonce": nonce,
        "gas_price_wei": gas_price_wei,
    }


def build_approval_result_from_allowance(
    *,
    tx_hash: str | None,
    nonce: int | None = None,
    gas_price_wei: int | None = None,
    confirmation_source: str = "allowance_check",
) -> dict:
    return {
        "tx_hash": tx_hash,
        "status": "confirmed",
        "gas_used": None,
        "block_number": None,
        "nonce": nonce,
        "gas_price_wei": gas_price_wei,
        "confirmation_source": confirmation_source,
    }


def build_wrap_result(
    *,
    tx_hash: str | None,
    amount_wei: int,
    nonce: int | None = None,
    gas_price_wei: int | None = None,
    gas_used: int | None = None,
    block_number: int | None = None,
    confirmation_source: str = "receipt",
) -> dict:
    return {
        "tx_hash": tx_hash,
        "status": "confirmed",
        "eth_wrapped": format_decimal(wei_to_decimal(amount_wei)),
        "gas_used": gas_used,
        "block_number": block_number,
        "nonce": nonce,
        "gas_price_wei": gas_price_wei,
        "confirmation_source": confirmation_source,
    }


def build_token_transfer_result(
    *,
    tx_hash: str | None,
    amount_units: int,
    token_decimals: int,
    nonce: int | None = None,
    gas_price_wei: int | None = None,
    gas_used: int | None = None,
    block_number: int | None = None,
    confirmation_source: str = "receipt",
) -> dict:
    return {
        "tx_hash": tx_hash,
        "status": "confirmed",
        "amount": format_decimal(token_units_to_decimal(amount_units, token_decimals)),
        "amount_units": amount_units,
        "gas_used": gas_used,
        "block_number": block_number,
        "nonce": nonce,
        "gas_price_wei": gas_price_wei,
        "confirmation_source": confirmation_source,
    }


def build_native_transfer_result(
    *,
    tx_hash: str | None,
    amount_wei: int,
    nonce: int | None = None,
    gas_price_wei: int | None = None,
    gas_used: int | None = None,
    block_number: int | None = None,
    confirmation_source: str = "receipt",
) -> dict:
    return {
        "tx_hash": tx_hash,
        "status": "confirmed",
        "amount": format_decimal(wei_to_decimal(amount_wei)),
        "amount_wei": amount_wei,
        "gas_used": gas_used,
        "block_number": block_number,
        "nonce": nonce,
        "gas_price_wei": gas_price_wei,
        "confirmation_source": confirmation_source,
    }


def build_swap_result(
    *,
    tx_hash: str | None,
    amount_in: str | None,
    backend: str | None,
    fee_tier: int | None,
    min_amount_out: str | None,
    amount_out_units: int,
    token_decimals: int,
    route_type: str | None,
    path_symbols: list[str] | None,
    path_addresses: list[str] | None,
    path_fee_tiers: list[int] | None,
    source: str | None,
    nonce: int | None = None,
    gas_price_wei: int | None = None,
    gas_used: int | None = None,
    block_number: int | None = None,
    confirmation_source: str = "receipt",
) -> dict:
    return {
        "tx_hash": tx_hash,
        "status": "confirmed",
        "backend": backend,
        "fee_tier": fee_tier,
        "amount_in": amount_in,
        "min_amount_out": min_amount_out,
        "amount_out": format_decimal(token_units_to_decimal(amount_out_units, token_decimals)),
        "amount_out_units": amount_out_units,
        "route_type": route_type,
        "path_symbols": path_symbols,
        "path_addresses": path_addresses,
        "path_fee_tiers": path_fee_tiers,
        "gas_used": gas_used,
        "block_number": block_number,
        "source": source,
        "nonce": nonce,
        "gas_price_wei": gas_price_wei,
        "confirmation_source": confirmation_source,
    }


def recover_weth_wrap_after_timeout(
    web3_client: Web3,
    *,
    wallet_address: str,
    wrapped_native_address: str | None = None,
    amount_wei: int,
    balance_before_units: int,
    tx_hash: str | None,
    nonce: int | None,
    gas_price_wei: int | None,
    grace_seconds: int = WETH_WRAP_POST_TIMEOUT_GRACE_SECONDS,
    poll_interval_seconds: int = WETH_WRAP_POST_TIMEOUT_POLL_INTERVAL_SECONDS,
) -> dict | None:
    owner = Web3.to_checksum_address(wallet_address)
    wrapped_token_address = Web3.to_checksum_address(wrapped_native_address or WETH_ADDRESS)
    weth_contract = web3_client.eth.contract(
        address=wrapped_token_address,
        abi=WETH_ABI,
    )
    deadline = time.monotonic() + max(int(grace_seconds), 0)

    while True:
        receipt = get_transaction_receipt_if_available(web3_client, tx_hash)
        if receipt:
            if int(getattr(receipt, "status", 0) or 0) == 1:
                return build_wrap_result(
                    tx_hash=tx_hash,
                    amount_wei=amount_wei,
                    nonce=nonce,
                    gas_price_wei=gas_price_wei,
                    gas_used=int(getattr(receipt, "gasUsed", 0) or 0),
                    block_number=int(getattr(receipt, "blockNumber", 0) or 0),
                )
            raise RuntimeError(f"Transaction failed: {tx_hash}")

        balance_after_units = int(weth_contract.functions.balanceOf(owner).call())
        if balance_after_units >= int(balance_before_units) + int(amount_wei):
            return build_wrap_result(
                tx_hash=tx_hash,
                amount_wei=amount_wei,
                nonce=nonce,
                gas_price_wei=gas_price_wei,
                confirmation_source="balance_check",
            )

        if time.monotonic() >= deadline:
            return None

        time.sleep(max(int(poll_interval_seconds), 1))


def recover_token_transfer_after_timeout(
    web3_client: Web3,
    *,
    token_address: str,
    recipient_address: str,
    amount_units: int,
    token_decimals: int,
    recipient_balance_before: int,
    tx_hash: str | None,
    nonce: int | None,
    gas_price_wei: int | None,
    grace_seconds: int = TOKEN_TRANSFER_POST_TIMEOUT_GRACE_SECONDS,
    poll_interval_seconds: int = TOKEN_TRANSFER_POST_TIMEOUT_POLL_INTERVAL_SECONDS,
) -> dict | None:
    token_contract = web3_client.eth.contract(
        address=Web3.to_checksum_address(token_address),
        abi=ERC20_ABI,
    )
    recipient = Web3.to_checksum_address(recipient_address)
    deadline = time.monotonic() + max(int(grace_seconds), 0)

    while True:
        receipt = get_transaction_receipt_if_available(web3_client, tx_hash)
        recipient_balance_after = int(token_contract.functions.balanceOf(recipient).call())

        if receipt:
            if int(getattr(receipt, "status", 0) or 0) == 1:
                return build_token_transfer_result(
                    tx_hash=tx_hash,
                    amount_units=amount_units,
                    token_decimals=token_decimals,
                    nonce=nonce,
                    gas_price_wei=gas_price_wei,
                    gas_used=int(getattr(receipt, "gasUsed", 0) or 0),
                    block_number=int(getattr(receipt, "blockNumber", 0) or 0),
                )
            raise RuntimeError(f"Transaction failed: {tx_hash}")

        if recipient_balance_after >= int(recipient_balance_before) + int(amount_units):
            return build_token_transfer_result(
                tx_hash=tx_hash,
                amount_units=amount_units,
                token_decimals=token_decimals,
                nonce=nonce,
                gas_price_wei=gas_price_wei,
                confirmation_source="balance_check",
            )

        if time.monotonic() >= deadline:
            return None

        time.sleep(max(int(poll_interval_seconds), 1))


def recover_native_eth_transfer_after_timeout(
    web3_client: Web3,
    *,
    recipient_address: str,
    amount_wei: int,
    recipient_balance_before_wei: int,
    tx_hash: str | None,
    nonce: int | None,
    gas_price_wei: int | None,
    grace_seconds: int = TOKEN_TRANSFER_POST_TIMEOUT_GRACE_SECONDS,
    poll_interval_seconds: int = TOKEN_TRANSFER_POST_TIMEOUT_POLL_INTERVAL_SECONDS,
) -> dict | None:
    recipient = Web3.to_checksum_address(recipient_address)
    deadline = time.monotonic() + max(int(grace_seconds), 0)

    while True:
        receipt = get_transaction_receipt_if_available(web3_client, tx_hash)
        recipient_balance_after_wei = int(web3_client.eth.get_balance(recipient))

        if receipt:
            if int(getattr(receipt, "status", 0) or 0) == 1:
                return build_native_transfer_result(
                    tx_hash=tx_hash,
                    amount_wei=amount_wei,
                    nonce=nonce,
                    gas_price_wei=gas_price_wei,
                    gas_used=int(getattr(receipt, "gasUsed", 0) or 0),
                    block_number=int(getattr(receipt, "blockNumber", 0) or 0),
                )
            raise RuntimeError(f"Transaction failed: {tx_hash}")

        if recipient_balance_after_wei >= int(recipient_balance_before_wei) + int(amount_wei):
            return build_native_transfer_result(
                tx_hash=tx_hash,
                amount_wei=amount_wei,
                nonce=nonce,
                gas_price_wei=gas_price_wei,
                confirmation_source="balance_check",
            )

        if time.monotonic() >= deadline:
            return None

        time.sleep(max(int(poll_interval_seconds), 1))


def recover_approval_after_timeout(
    web3_client: Web3,
    *,
    token_address: str,
    owner_address: str,
    spender_address: str,
    amount_units: int,
    tx_hash: str | None,
    nonce: int | None,
    gas_price_wei: int | None,
    grace_seconds: int = TOKEN_APPROVAL_POST_TIMEOUT_GRACE_SECONDS,
    poll_interval_seconds: int = TOKEN_APPROVAL_POST_TIMEOUT_POLL_INTERVAL_SECONDS,
) -> dict | None:
    deadline = time.monotonic() + max(int(grace_seconds), 0)

    while True:
        receipt = get_transaction_receipt_if_available(web3_client, tx_hash)
        if receipt:
            if int(getattr(receipt, "status", 0) or 0) == 1:
                return build_approval_result_from_receipt(
                    receipt,
                    tx_hash=tx_hash or "",
                    nonce=nonce,
                    gas_price_wei=gas_price_wei,
                )
            raise RuntimeError(f"Transaction failed: {tx_hash}")

        allowance_units = get_token_allowance(
            web3_client,
            token_address=token_address,
            owner_address=owner_address,
            spender_address=spender_address,
        )
        if allowance_units >= int(amount_units):
            return build_approval_result_from_allowance(
                tx_hash=tx_hash,
                nonce=nonce,
                gas_price_wei=gas_price_wei,
            )

        if time.monotonic() >= deadline:
            return None

        time.sleep(max(int(poll_interval_seconds), 1))


def recover_swap_after_timeout(
    web3_client: Web3,
    *,
    wallet_address: str,
    token_out: dict,
    tx_hash: str | None,
    nonce: int | None,
    gas_price_wei: int | None,
    swap_details: dict | None,
    grace_seconds: int = TOKEN_SWAP_POST_TIMEOUT_GRACE_SECONDS,
    poll_interval_seconds: int = TOKEN_SWAP_POST_TIMEOUT_POLL_INTERVAL_SECONDS,
) -> dict | None:
    owner = Web3.to_checksum_address(wallet_address)
    token_contract = web3_client.eth.contract(
        address=Web3.to_checksum_address(token_out["address"]),
        abi=ERC20_ABI,
    )
    token_decimals = int((swap_details or {}).get("token_decimals") or token_out["decimals"])
    balance_before = int((swap_details or {}).get("balance_before") or 0)
    deadline = time.monotonic() + max(int(grace_seconds), 0)

    while True:
        receipt = get_transaction_receipt_if_available(web3_client, tx_hash)
        balance_after = int(token_contract.functions.balanceOf(owner).call())
        amount_out_units = max(balance_after - balance_before, 0)

        if receipt:
            if int(getattr(receipt, "status", 0) or 0) == 1:
                return build_swap_result(
                    tx_hash=tx_hash,
                    amount_in=(swap_details or {}).get("amount_in"),
                    backend=(swap_details or {}).get("backend"),
                    fee_tier=(swap_details or {}).get("fee_tier"),
                    min_amount_out=(swap_details or {}).get("min_amount_out"),
                    amount_out_units=amount_out_units,
                    token_decimals=token_decimals,
                    route_type=(swap_details or {}).get("route_type"),
                    path_symbols=(swap_details or {}).get("path_symbols"),
                    path_addresses=(swap_details or {}).get("path_addresses"),
                    path_fee_tiers=(swap_details or {}).get("path_fee_tiers"),
                    source=(swap_details or {}).get("source"),
                    nonce=nonce,
                    gas_price_wei=gas_price_wei,
                    gas_used=int(getattr(receipt, "gasUsed", 0) or 0),
                    block_number=int(getattr(receipt, "blockNumber", 0) or 0),
                    confirmation_source="receipt",
                )
            raise RuntimeError(f"Transaction failed: {tx_hash}")

        if amount_out_units > 0:
            return build_swap_result(
                tx_hash=tx_hash,
                amount_in=(swap_details or {}).get("amount_in"),
                backend=(swap_details or {}).get("backend"),
                fee_tier=(swap_details or {}).get("fee_tier"),
                min_amount_out=(swap_details or {}).get("min_amount_out"),
                amount_out_units=amount_out_units,
                token_decimals=token_decimals,
                route_type=(swap_details or {}).get("route_type"),
                path_symbols=(swap_details or {}).get("path_symbols"),
                path_addresses=(swap_details or {}).get("path_addresses"),
                path_fee_tiers=(swap_details or {}).get("path_fee_tiers"),
                source=(swap_details or {}).get("source"),
                nonce=nonce,
                gas_price_wei=gas_price_wei,
                confirmation_source="balance_check",
            )

        if time.monotonic() >= deadline:
            return None

        time.sleep(max(int(poll_interval_seconds), 1))


def approve_token_from_wallet(
    web3_client: Web3,
    *,
    token_address: str,
    chain: str | None = None,
    wallet_address: str,
    private_key: str,
    spender_address: str,
    amount_units: int,
    nonce: int,
    gas_price_wei: int | None = None,
    wait_timeout: int | None = None,
    gas_limit: int = ERC20_APPROVE_GAS_LIMIT,
) -> dict:
    owner = Web3.to_checksum_address(wallet_address)
    token_contract = web3_client.eth.contract(address=Web3.to_checksum_address(token_address), abi=ERC20_ABI)
    approval_gas_price_wei = (
        int(gas_price_wei)
        if gas_price_wei is not None and int(gas_price_wei) > 0
        else int(
            resolve_legacy_aggressive_gas_pricing(
                web3_client,
                chain=chain,
                tx_stage=LEGACY_GAS_STAGE_APPROVAL,
            )["submitted_gas_price_wei"]
        )
    )
    approval_wait_timeout = int(wait_timeout or get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_APPROVAL))

    try:
        estimated_gas = token_contract.functions.approve(
            Web3.to_checksum_address(spender_address),
            amount_units,
        ).estimate_gas({"from": owner})
    except Exception:
        estimated_gas = gas_limit

    tx = token_contract.functions.approve(
        Web3.to_checksum_address(spender_address),
        amount_units,
    ).build_transaction(
        build_transaction_envelope(
            web3_client,
            owner,
            nonce,
            gas=max(int(estimated_gas), gas_limit),
            gas_price_wei=approval_gas_price_wei,
        )
    )
    try:
        tx_hash = send_signed_transaction(web3_client, tx, private_key)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            nonce=nonce,
            gas_price_wei=approval_gas_price_wei,
            retryable=_is_retryable_transaction_submit_error(exc),
        ) from exc

    try:
        receipt = wait_for_transaction_success(web3_client, tx_hash, timeout=approval_wait_timeout)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            tx_hash=tx_hash,
            nonce=nonce,
            gas_price_wei=approval_gas_price_wei,
            retryable=_is_retryable_transaction_wait_error(exc),
        ) from exc

    return build_approval_result_from_receipt(
        receipt,
        tx_hash=tx_hash,
        nonce=nonce,
        gas_price_wei=approval_gas_price_wei,
    )


def transfer_native_eth_from_wallet(
    web3_client: Web3,
    *,
    chain: str | None = None,
    wallet_address: str,
    private_key: str,
    recipient_address: str,
    amount_wei: int,
    nonce: int,
    gas_price_wei: int | None = None,
    tx_stage: str = LEGACY_GAS_STAGE_FUND_TREASURY,
    wait_timeout: int | None = None,
    gas_limit: int = ETH_TRANSFER_GAS_LIMIT,
) -> dict:
    owner = Web3.to_checksum_address(wallet_address)
    recipient = Web3.to_checksum_address(recipient_address)
    transfer_gas_price_wei = (
        int(gas_price_wei)
        if gas_price_wei is not None and int(gas_price_wei) > 0
        else int(
            resolve_legacy_aggressive_gas_pricing(
                web3_client,
                chain=chain,
                tx_stage=tx_stage,
            )["submitted_gas_price_wei"]
        )
    )
    transfer_wait_timeout = int(wait_timeout or DEFAULT_TRANSACTION_RECEIPT_TIMEOUT_SECONDS)
    recipient_balance_before_wei = int(web3_client.eth.get_balance(recipient))
    try:
        estimated_gas = web3_client.eth.estimate_gas({
            "from": owner,
            "to": recipient,
            "value": amount_wei,
        })
    except Exception:
        estimated_gas = gas_limit
    tx = build_transaction_envelope(
        web3_client,
        owner,
        nonce,
        gas=max(int(estimated_gas), gas_limit),
        gas_price_wei=transfer_gas_price_wei,
        value=amount_wei,
        to=recipient,
    )
    try:
        tx_hash = send_signed_transaction(web3_client, tx, private_key)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            nonce=nonce,
            gas_price_wei=transfer_gas_price_wei,
            retryable=_is_retryable_transaction_submit_error(exc),
            details={
                "recipient_address": recipient_address,
                "amount_wei": amount_wei,
                "recipient_balance_before_wei": recipient_balance_before_wei,
            },
        ) from exc

    try:
        receipt = wait_for_transaction_success(web3_client, tx_hash, timeout=transfer_wait_timeout)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            tx_hash=tx_hash,
            nonce=nonce,
            gas_price_wei=transfer_gas_price_wei,
            retryable=_is_retryable_transaction_wait_error(exc),
            details={
                "recipient_address": recipient_address,
                "amount_wei": amount_wei,
                "recipient_balance_before_wei": recipient_balance_before_wei,
            },
        ) from exc

    return build_native_transfer_result(
        tx_hash=tx_hash,
        amount_wei=amount_wei,
        nonce=nonce,
        gas_price_wei=transfer_gas_price_wei,
        gas_used=int(getattr(receipt, "gasUsed", 0) or 0),
        block_number=int(getattr(receipt, "blockNumber", 0) or 0),
    )


def transfer_token_from_wallet(
    web3_client: Web3,
    *,
    token_address: str,
    chain: str | None = None,
    wallet_address: str,
    private_key: str,
    recipient_address: str,
    amount_units: int,
    nonce: int,
    gas_price_wei: int | None = None,
    tx_stage: str = LEGACY_GAS_STAGE_FUND_TREASURY,
    wait_timeout: int | None = None,
    gas_limit: int = ERC20_TRANSFER_GAS_LIMIT,
) -> dict:
    owner = Web3.to_checksum_address(wallet_address)
    recipient = Web3.to_checksum_address(recipient_address)
    token_contract = web3_client.eth.contract(address=Web3.to_checksum_address(token_address), abi=ERC20_ABI)
    transfer_gas_price_wei = (
        int(gas_price_wei)
        if gas_price_wei is not None and int(gas_price_wei) > 0
        else int(
            resolve_legacy_aggressive_gas_pricing(
                web3_client,
                chain=chain,
                tx_stage=tx_stage,
            )["submitted_gas_price_wei"]
        )
    )
    transfer_wait_timeout = int(wait_timeout or DEFAULT_TRANSACTION_RECEIPT_TIMEOUT_SECONDS)
    token_decimals = int(resolve_token(token_address, chain)["decimals"])
    recipient_balance_before = int(token_contract.functions.balanceOf(recipient).call())

    try:
        estimated_gas = token_contract.functions.transfer(
            recipient,
            amount_units,
        ).estimate_gas({"from": owner})
    except Exception:
        estimated_gas = gas_limit

    tx = token_contract.functions.transfer(
        recipient,
        amount_units,
    ).build_transaction(
        build_transaction_envelope(
            web3_client,
            owner,
            nonce,
            gas=max(int(estimated_gas), gas_limit),
            gas_price_wei=transfer_gas_price_wei,
        )
    )
    try:
        tx_hash = send_signed_transaction(web3_client, tx, private_key)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            nonce=nonce,
            gas_price_wei=transfer_gas_price_wei,
            retryable=_is_retryable_transaction_submit_error(exc),
            details={
                "token_address": token_address,
                "recipient_address": recipient_address,
                "amount_units": amount_units,
                "token_decimals": token_decimals,
                "recipient_balance_before": recipient_balance_before,
            },
        ) from exc

    try:
        receipt = wait_for_transaction_success(web3_client, tx_hash, timeout=transfer_wait_timeout)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            tx_hash=tx_hash,
            nonce=nonce,
            gas_price_wei=transfer_gas_price_wei,
            retryable=_is_retryable_transaction_wait_error(exc),
            details={
                "token_address": token_address,
                "recipient_address": recipient_address,
                "amount_units": amount_units,
                "token_decimals": token_decimals,
                "recipient_balance_before": recipient_balance_before,
            },
        ) from exc

    return build_token_transfer_result(
        tx_hash=tx_hash,
        amount_units=amount_units,
        token_decimals=token_decimals,
        nonce=nonce,
        gas_price_wei=transfer_gas_price_wei,
        gas_used=int(getattr(receipt, "gasUsed", 0) or 0),
        block_number=int(getattr(receipt, "blockNumber", 0) or 0),
    )


def swap_weth_to_token_from_wallet(
    web3_client: Web3,
    *,
    chain: str | None = None,
    wallet_address: str,
    private_key: str,
    token_out: dict,
    amount_in: Decimal,
    fee_tier: int | None,
    slippage_percent: str | float | Decimal | None,
    prepared_quote: dict | None = None,
    nonce: int,
    gas_price_wei: int | None = None,
    wait_timeout: int | None = None,
    gas_limit: int = UNISWAP_V3_SWAP_GAS_LIMIT,
) -> dict:
    runtime = get_chain_runtime_config(chain)
    owner = Web3.to_checksum_address(wallet_address)
    token_out_checksum = Web3.to_checksum_address(token_out["address"])
    token_contract = web3_client.eth.contract(address=token_out_checksum, abi=ERC20_ABI)
    quote = prepared_quote or quote_uniswap_swap(
        runtime["wrapped_native_symbol"],
        token_out["address"],
        format_decimal(amount_in),
        fee_tier=fee_tier,
        slippage_percent=slippage_percent,
        chain=runtime["chain"],
    )
    swap_runtime = get_swap_runtime_config(runtime["chain"], backend=quote.get("backend"))
    router_contract = web3_client.eth.contract(address=swap_runtime["router_address"], abi=swap_runtime["router_abi"])
    amount_in_units = decimal_to_wei(amount_in)
    min_amount_out_units = decimal_to_token_units(Decimal(str(quote["min_amount_out"])), int(token_out["decimals"]))
    balance_before = token_contract.functions.balanceOf(owner).call()
    swap_gas_price_wei = (
        int(gas_price_wei)
        if gas_price_wei is not None and int(gas_price_wei) > 0
        else int(
            resolve_legacy_aggressive_gas_pricing(
                web3_client,
                chain=runtime["chain"],
                tx_stage=LEGACY_GAS_STAGE_SWAP,
            )["submitted_gas_price_wei"]
        )
    )
    swap_wait_timeout = int(wait_timeout or get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_SWAP))
    swap_details = {
        "backend": quote.get("backend"),
        "fee_tier": int(quote["fee_tier"]) if quote.get("fee_tier") is not None else None,
        "amount_in": format_decimal(amount_in),
        "min_amount_out": quote["min_amount_out"],
        "route_type": quote.get("route_type"),
        "path_symbols": quote.get("path_symbols"),
        "path_addresses": quote.get("path_addresses"),
        "path_fee_tiers": quote.get("path_fee_tiers"),
        "source": quote.get("source"),
        "token_decimals": int(token_out["decimals"]),
        "balance_before": int(balance_before),
    }
    deadline = int(datetime.utcnow().timestamp()) + 900
    if swap_runtime["protocol"] == SWAP_BACKEND_UNISWAP_V3:
        path_addresses = quote.get("path_addresses") or [runtime["wrapped_native_address"], token_out_checksum]
        path_fee_tiers = quote.get("path_fee_tiers") or ([int(quote["fee_tier"])] if quote.get("fee_tier") is not None else [])
        params = (
            _encode_uniswap_v3_path(path_addresses, path_fee_tiers),
            owner,
            amount_in_units,
            min_amount_out_units,
        )
        try:
            estimated_gas = router_contract.functions.exactInput(params).estimate_gas({"from": owner})
        except Exception:
            estimated_gas = gas_limit

        tx = router_contract.functions.exactInput(params).build_transaction(
            build_transaction_envelope(
                web3_client,
                owner,
                nonce,
                gas=max(int(estimated_gas), gas_limit),
                gas_price_wei=swap_gas_price_wei,
            )
        )
    else:
        path = [
            Web3.to_checksum_address(address)
            for address in (
                quote.get("path_addresses")
                or [runtime["wrapped_native_address"], token_out_checksum]
            )
        ]
        try:
            estimated_gas = router_contract.functions.swapExactTokensForTokens(
                amount_in_units,
                min_amount_out_units,
                path,
                owner,
                deadline,
            ).estimate_gas({"from": owner})
        except Exception:
            estimated_gas = gas_limit

        tx = router_contract.functions.swapExactTokensForTokens(
            amount_in_units,
            min_amount_out_units,
            path,
            owner,
            deadline,
        ).build_transaction(
            build_transaction_envelope(
                web3_client,
                owner,
                nonce,
                gas=max(int(estimated_gas), gas_limit),
                gas_price_wei=swap_gas_price_wei,
            )
        )
    try:
        tx_hash = send_signed_transaction(web3_client, tx, private_key)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            nonce=nonce,
            gas_price_wei=swap_gas_price_wei,
            retryable=_is_retryable_transaction_submit_error(exc),
            details=swap_details,
        ) from exc

    try:
        receipt = wait_for_transaction_success(web3_client, tx_hash, timeout=swap_wait_timeout)
    except Exception as exc:
        raise WalletTransactionError(
            str(exc),
            tx_hash=tx_hash,
            nonce=nonce,
            gas_price_wei=swap_gas_price_wei,
            retryable=_is_retryable_transaction_wait_error(exc),
            details=swap_details,
        ) from exc

    balance_after = token_contract.functions.balanceOf(owner).call()
    amount_out_units = max(int(balance_after) - int(balance_before), 0)

    return build_swap_result(
        tx_hash=tx_hash,
        amount_in=swap_details["amount_in"],
        backend=swap_details["backend"],
        fee_tier=swap_details["fee_tier"],
        min_amount_out=swap_details["min_amount_out"],
        amount_out_units=amount_out_units,
        token_decimals=int(token_out["decimals"]),
        route_type=swap_details["route_type"],
        path_symbols=swap_details["path_symbols"],
        path_addresses=swap_details["path_addresses"],
        path_fee_tiers=swap_details["path_fee_tiers"],
        source=swap_details["source"],
        nonce=nonce,
        gas_price_wei=swap_gas_price_wei,
        gas_used=int(getattr(receipt, "gasUsed", 0) or 0),
        block_number=int(getattr(receipt, "blockNumber", 0) or 0),
    )

def get_supported_tokens():
    static_tokens = []
    seen_addresses = set()

    for token in TOKEN_CONFIG.values():
        static_tokens.append({
            'symbol': token['symbol'],
            'name': token['name'],
            'address': token['address'],
            'decimals': token['decimals'],
            'logo_url': token.get('logo_url'),
        })
        seen_addresses.add(token['address'].lower())

    external_tokens = []
    for token in load_external_tokens():
        if token['address'].lower() in seen_addresses:
            continue

        external_tokens.append({
            'symbol': token['symbol'],
            'name': token['name'],
            'address': token['address'],
            'decimals': None,
            'logo_url': token.get('logo_url'),
        })
        seen_addresses.add(token['address'].lower())

    return static_tokens + external_tokens

def quote_uniswap_swap(
    token_in_identifier: str,
    token_out_identifier: str,
    amount_in: str,
    fee_tier: int | None = None,
    slippage_percent: str | float | Decimal | None = None,
    chain: str | None = None,
):
    normalized_chain = normalize_template_chain(chain)
    chain_config = get_template_chain_config(normalized_chain)
    token_in = resolve_token(token_in_identifier, normalized_chain)
    token_out = resolve_token(token_out_identifier, normalized_chain)
    token_in_key = token_in['symbol'].upper().strip()
    token_out_key = token_out['symbol'].upper().strip()

    try:
        amount_decimal = Decimal(str(amount_in))
    except (InvalidOperation, TypeError):
        raise ValueError("Invalid amount")

    if amount_decimal <= 0:
        raise ValueError("Amount must be greater than 0")

    web3_client = get_web3(normalized_chain)
    if not web3_client or not web3_client.is_connected():
        raise RuntimeError(f"{chain_config['label']} RPC is unavailable")

    amount_in_units = int(amount_decimal * (Decimal(10) ** token_in['decimals']))
    if amount_in_units <= 0:
        raise ValueError("Amount is too small")

    slippage_decimal = Decimal('0')
    if slippage_percent is not None:
        try:
            slippage_decimal = Decimal(str(slippage_percent))
        except (InvalidOperation, TypeError):
            raise ValueError("Invalid slippage percent")

        if slippage_decimal < 0 or slippage_decimal > 100:
            raise ValueError("Slippage percent must be between 0 and 100")

    if token_in_key == token_out_key:
        return {
            'backend': None,
            'token_in': token_in['symbol'],
            'token_out': token_out['symbol'],
            'amount_in': str(amount_decimal),
            'amount_out': str(amount_decimal),
            'min_amount_out': str(amount_decimal),
            'fee_tier': None,
            'route_type': 'same_token',
            'path_symbols': [token_in['symbol']],
            'path_addresses': [Web3.to_checksum_address(token_in['address'])],
            'path_fee_tiers': [],
            'source': 'same-token',
            'slippage_percent': format(slippage_decimal.normalize(), 'f'),
        }

    if token_in['address'].lower() == token_out['address'].lower():
        return {
            'backend': None,
            'token_in': token_in['symbol'],
            'token_out': token_out['symbol'],
            'amount_in': str(amount_decimal),
            'amount_out': str(amount_decimal),
            'min_amount_out': str(amount_decimal),
            'fee_tier': None,
            'route_type': 'same_address',
            'path_symbols': [token_in['symbol']],
            'path_addresses': [Web3.to_checksum_address(token_in['address'])],
            'path_fee_tiers': [],
            'source': 'wrapped-native',
            'slippage_percent': format(slippage_decimal.normalize(), 'f'),
        }

    best_quote = None
    swap_runtimes = get_swap_runtime_configs(normalized_chain)
    if fee_tier is not None:
        primary_runtime = swap_runtimes[0]
        if (
            primary_runtime["protocol"] == SWAP_BACKEND_UNISWAP_V3
            and fee_tier not in primary_runtime["supported_fee_tiers"]
        ):
            raise ValueError("Unsupported fee tier")

    for runtime_index, swap_runtime in enumerate(swap_runtimes):
        runtime_quote = None
        if swap_runtime["protocol"] == SWAP_BACKEND_UNISWAP_V3:
            quoter = web3_client.eth.contract(
                address=swap_runtime["quoter_address"],
                abi=swap_runtime["quoter_abi"],
            )
            for candidate in _build_uniswap_v3_route_candidates(
                normalized_chain,
                token_in,
                token_out,
                fee_tier,
                swap_runtime["supported_fee_tiers"],
                swap_runtime["route_intermediary_symbols"],
            ):
                try:
                    quote_response = quoter.functions.quoteExactInput(
                        _encode_uniswap_v3_path(candidate["path_addresses"], candidate["path_fee_tiers"]),
                        amount_in_units,
                    ).call()
                except Exception:
                    continue

                amount_out_units = int(quote_response[0] if isinstance(quote_response, (list, tuple)) else quote_response)
                if amount_out_units <= 0:
                    continue

                amount_out_decimal = Decimal(amount_out_units) / (Decimal(10) ** token_out['decimals'])
                min_amount_out_decimal = amount_out_decimal * (Decimal('1') - (slippage_decimal / Decimal('100')))
                quote_payload = {
                    'backend': swap_runtime["protocol"],
                    'token_in': token_in['symbol'],
                    'token_out': token_out['symbol'],
                    'amount_in': str(amount_decimal.normalize()),
                    'amount_out': format(amount_out_decimal.normalize(), 'f'),
                    'min_amount_out': format(min_amount_out_decimal.normalize(), 'f'),
                    'amount_out_units': amount_out_units,
                    'fee_tier': candidate["path_fee_tiers"][0] if len(set(candidate["path_fee_tiers"])) == 1 else None,
                    'route_type': candidate["route_type"],
                    'path_symbols': candidate["path_symbols"],
                    'path_addresses': candidate["path_addresses"],
                    'path_fee_tiers': candidate["path_fee_tiers"],
                    'source': 'uniswap-v3-quoter-v2',
                    'slippage_percent': format(slippage_decimal.normalize(), 'f'),
                }
                if runtime_quote is None or amount_out_units > runtime_quote['amount_out_units']:
                    runtime_quote = quote_payload
        elif swap_runtime["protocol"] == SWAP_BACKEND_PANCAKESWAP_V2:
            router = web3_client.eth.contract(
                address=swap_runtime["router_address"],
                abi=swap_runtime["router_abi"],
            )

            for path in _build_v2_swap_paths(normalized_chain, token_in["address"], token_out["address"]):
                try:
                    amounts = router.functions.getAmountsOut(amount_in_units, path).call()
                except Exception:
                    continue

                if not amounts:
                    continue
                amount_out_units = int(amounts[-1])
                if amount_out_units <= 0:
                    continue

                path_addresses = [Web3.to_checksum_address(address) for address in path]
                path_symbols = [resolve_token(address, normalized_chain)["symbol"] for address in path_addresses]
                amount_out_decimal = Decimal(amount_out_units) / (Decimal(10) ** token_out['decimals'])
                min_amount_out_decimal = amount_out_decimal * (Decimal('1') - (slippage_decimal / Decimal('100')))
                quote_payload = {
                    'backend': swap_runtime["protocol"],
                    'token_in': token_in['symbol'],
                    'token_out': token_out['symbol'],
                    'amount_in': str(amount_decimal.normalize()),
                    'amount_out': format(amount_out_decimal.normalize(), 'f'),
                    'min_amount_out': format(min_amount_out_decimal.normalize(), 'f'),
                    'amount_out_units': amount_out_units,
                    'fee_tier': None,
                    'route_type': 'direct' if len(path_addresses) == 2 else 'multihop',
                    'path_symbols': path_symbols,
                    'path_addresses': path_addresses,
                    'path_fee_tiers': [],
                    'source': 'pancakeswap-v2-router',
                    'slippage_percent': format(slippage_decimal.normalize(), 'f'),
                }
                if runtime_quote is None or amount_out_units > runtime_quote['amount_out_units']:
                    runtime_quote = quote_payload

        if runtime_quote is not None:
            best_quote = runtime_quote
            if runtime_index > 0:
                best_quote["route_type"] = "secondary_backend"
            break

    if not best_quote:
        raise ValueError(f"No swap route found for this token pair on {chain_config['label']}")

    del best_quote['amount_out_units']
    return best_quote

def detect_wallet_source_token(wallet_details: dict, chain: str | None = None) -> str:
    runtime = get_chain_runtime_config(chain or wallet_details.get("chain"))
    total_eth = sum((sub_wallet.get('eth_balance') or 0) for sub_wallet in wallet_details.get('sub_wallets', []))
    total_weth = sum((sub_wallet.get('weth_balance') or 0) for sub_wallet in wallet_details.get('sub_wallets', []))
    if total_weth >= total_eth:
        return runtime["wrapped_native_symbol"]
    return runtime["native_symbol"]

def quote_wallet_batch_swap(
    wallet_id: str,
    token_out_identifier: str,
    fee_tier: int | None = None,
    slippage_percent: str | float | Decimal | None = None,
    chain: str | None = None,
):
    wallet_details = get_wallet_details(wallet_id, chain=chain)
    if not wallet_details:
        raise ValueError("Wallet not found")
    runtime = get_chain_runtime_config(chain or wallet_details.get("chain"))

    sub_wallets = wallet_details.get('sub_wallets', [])
    if not sub_wallets:
        raise ValueError("No subwallets available")
    if any(sub_wallet.get('eth_balance') is None or sub_wallet.get('weth_balance') is None for sub_wallet in sub_wallets):
        raise RuntimeError("Live subwallet balances are unavailable")

    source_token = detect_wallet_source_token(wallet_details, runtime["chain"])
    source_balance_field = runtime["wrapped_balance_key"] if source_token == runtime["wrapped_native_symbol"] else runtime["native_balance_key"]

    total_input = Decimal('0')
    total_output = Decimal('0')
    total_min_output = Decimal('0')
    used_fee_tiers = set()
    quoted_wallets = []

    for sub_wallet in sub_wallets:
        amount_in = Decimal(str(sub_wallet.get(source_balance_field) or 0))
        if amount_in <= 0:
            continue

        quote = quote_uniswap_swap(
            source_token,
            token_out_identifier,
            str(amount_in),
            fee_tier=fee_tier,
            slippage_percent=slippage_percent,
            chain=runtime["chain"],
        )

        total_input += Decimal(quote['amount_in'])
        total_output += Decimal(quote['amount_out'])
        total_min_output += Decimal(quote['min_amount_out'])
        if quote.get('fee_tier') is not None:
            used_fee_tiers.add(int(quote['fee_tier']))

        quoted_wallets.append({
            'wallet_id': sub_wallet['id'],
            'address': sub_wallet['address'],
            'amount_in': quote['amount_in'],
            'amount_out': quote['amount_out'],
            'min_amount_out': quote['min_amount_out'],
            'backend': quote.get('backend'),
            'fee_tier': quote['fee_tier'],
            'route_type': quote.get('route_type'),
            'path_symbols': quote.get('path_symbols'),
            'path_addresses': quote.get('path_addresses'),
            'path_fee_tiers': quote.get('path_fee_tiers'),
        })

    if not quoted_wallets:
        raise ValueError(f"No {source_token} balance found in subwallets")

    quoted_count = len(quoted_wallets)
    average_input = total_input / quoted_count
    average_output = total_output / quoted_count
    average_min_output = total_min_output / quoted_count
    target_token = resolve_token(token_out_identifier, runtime["chain"])

    return {
        'wallet_id': wallet_id,
        'token_in': source_token,
        'token_out': target_token['symbol'],
        'wallet_count': len(sub_wallets),
        'quoted_wallet_count': quoted_count,
        'skipped_wallet_count': len(sub_wallets) - quoted_count,
        'average_amount_in': format(average_input.normalize(), 'f'),
        'average_amount_out': format(average_output.normalize(), 'f'),
        'average_min_amount_out': format(average_min_output.normalize(), 'f'),
        'total_input': format(total_input.normalize(), 'f'),
        'total_output': format(total_output.normalize(), 'f'),
        'total_min_output': format(total_min_output.normalize(), 'f'),
        'fee_tier': fee_tier if fee_tier is not None else (next(iter(used_fee_tiers)) if len(used_fee_tiers) == 1 else None),
        'fee_tiers': sorted(used_fee_tiers),
        'slippage_percent': format(Decimal(str(slippage_percent or 0)).normalize(), 'f'),
        'source': 'multi-backend-batch-quoter',
        'quoted_wallets': quoted_wallets,
    }

def import_main_wallet(seed_phrase: str):
    mnemo = Mnemonic("english")
    if not mnemo.check(seed_phrase):
        raise ValueError("Invalid BIP39 seed phrase")

    # Derive root account for main address (path m/44'/60'/0'/0/0)
    root_account = Account.from_mnemonic(seed_phrase, account_path="m/44'/60'/0'/0/0")
    encrypted_mnemonic = encrypt_secret(seed_phrase)

    return {
        'address': root_account.address,
        'encrypted_seed': encrypted_mnemonic,
        **get_wallet_balances(root_account.address),
    }

def generate_main_wallet():
    seed_phrase = Mnemonic("english").generate(strength=128)
    wallet_data = import_main_wallet(seed_phrase)
    wallet_data['seed_phrase'] = seed_phrase
    return wallet_data

def import_private_key_wallet(private_key: str):
    normalized_key = private_key.strip()
    if not normalized_key:
        raise ValueError("Private key is required")

    try:
        account = Account.from_key(normalized_key)
    except Exception as exc:
        raise ValueError("Invalid private key") from exc

    encrypted_private_key = encrypt_secret(account.key.hex())

    return {
        'address': account.address,
        'encrypted_key': encrypted_private_key,
        **get_wallet_balances(account.address),
    }

def _parse_derivation_index(value) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None

def _wallet_record_sort_key(record: dict) -> str:
    return str(record.get("created_at") or "")

def _persist_wallet_record(record: dict):
    db.connect_keyspace()
    created_at = record.get("created_at")
    if isinstance(created_at, str):
        try:
            created_at = datetime.fromisoformat(created_at)
        except ValueError:
            created_at = datetime.now()
    if created_at is None:
        created_at = datetime.now()

    query = """
        INSERT INTO wallets (id, type, address, encrypted_key, parent_id, created_at, derivation_index)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """
    db.session.execute(
        query,
        (
            record["id"],
            record["type"],
            record["address"],
            record["encrypted_key"],
            record.get("parent_id"),
            created_at,
            _parse_derivation_index(record.get("derivation_index")),
        ),
    )

def _backfill_child_wallet_derivation_indices(parent_wallet: dict, child_records: list[dict] | None = None):
    records = sorted(
        [dict(record) for record in (child_records or list_wallet_records(parent_wallet["id"]))],
        key=_wallet_record_sort_key,
    )
    if parent_wallet.get("type") not in {"main", "imported_private_key"}:
        return records

    assigned_indices = {
        derivation_index
        for derivation_index in (_parse_derivation_index(record.get("derivation_index")) for record in records)
        if derivation_index is not None
    }
    missing_records = [
        record
        for record in records
        if _parse_derivation_index(record.get("derivation_index")) is None
    ]
    if not missing_records:
        return records

    if parent_wallet["type"] == "main":
        decrypted_mnemonic = decrypt_secret(parent_wallet["encrypted_key"])
        unresolved_by_address = {
            record["address"].lower(): record
            for record in missing_records
        }
        max_known_index = max(assigned_indices, default=0)
        search_limit = max(
            max_known_index + len(missing_records) + 512,
            len(records) * 16,
            2048,
        )
        for child_index in range(1, search_limit + 1):
            if not unresolved_by_address:
                break
            if child_index in assigned_indices:
                continue

            derived_account = Account.from_mnemonic(
                decrypted_mnemonic,
                account_path=f"m/44'/60'/0'/0/{child_index}",
            )
            record = unresolved_by_address.pop(derived_account.address.lower(), None)
            if record is None:
                continue

            record["derivation_index"] = child_index
            assigned_indices.add(child_index)

        next_fallback_index = max(assigned_indices, default=0) + 1
        for record in unresolved_by_address.values():
            while next_fallback_index in assigned_indices:
                next_fallback_index += 1
            record["derivation_index"] = next_fallback_index
            assigned_indices.add(next_fallback_index)
            next_fallback_index += 1
    else:
        next_candidate_index = 0
        for record in records:
            derivation_index = _parse_derivation_index(record.get("derivation_index"))
            if derivation_index is not None:
                continue
            while next_candidate_index in assigned_indices:
                next_candidate_index += 1
            record["derivation_index"] = next_candidate_index
            assigned_indices.add(next_candidate_index)
            next_candidate_index += 1

    for record in records:
        if _parse_derivation_index(record.get("derivation_index")) is None:
            continue
        _persist_wallet_record(record)

    return records

def _next_child_derivation_index(parent_wallet: dict, child_records: list[dict]) -> int:
    existing_indices = [
        derivation_index
        for derivation_index in (_parse_derivation_index(record.get("derivation_index")) for record in child_records)
        if derivation_index is not None
    ]
    if existing_indices:
        return max(existing_indices) + 1
    return 1 if parent_wallet["type"] == "main" else 0

def generate_sub_wallets(main_id: str, count: int = 1):
    main_wallet = get_wallet(main_id)
    if not main_wallet or main_wallet['type'] not in {'main', 'imported_private_key'}:
        raise ValueError("Invalid main wallet ID")

    sub_wallets = []
    decrypted_mnemonic = None
    existing_sub_wallets = _backfill_child_wallet_derivation_indices(main_wallet, list_wallet_records(main_id))
    next_index = _next_child_derivation_index(main_wallet, existing_sub_wallets)

    if main_wallet['type'] == 'main':
        decrypted_mnemonic = decrypt_secret(main_wallet['encrypted_key'])

    for i in range(count):
        child_index = next_index + i
        if main_wallet['type'] == 'main':
            # Main wallet uses m/44'/60'/0'/0/0, so subwallets start from index 1 onward.
            child_account = Account.from_mnemonic(
                decrypted_mnemonic,
                account_path=f"m/44'/60'/0'/0/{child_index}",
            )
            child_private_key = child_account._key_obj.to_hex()
        else:
            # Imported private-key wallets cannot derive HD children, so we create linked wallets instead.
            child_account = Account.create()
            child_private_key = child_account.key.hex()

        encrypted_child_key = encrypt_secret(child_private_key)
        balances = get_wallet_balances(child_account.address)

        sub_data = {
            'address': child_account.address,
            'encrypted_key': encrypted_child_key,  # Store encrypted child private key
            **balances,
            'index': child_index,
            'derivation_index': child_index,
        }

        sub_id = f"sub_{int(datetime.now().timestamp())}_{uuid4().hex[:8]}"
        store_wallet(sub_id, sub_data, 'sub', parent_id=main_id)
        sub_wallets.append({
            'id': sub_id,
            'address': sub_data['address'],
            'eth_balance': sub_data['eth_balance'],
            'weth_balance': sub_data['weth_balance'],
            'weth_address': sub_data['weth_address'],
            'index': child_index
        })

    return sub_wallets


def _is_usable_client_run_preview(
    preview: dict | None,
    *,
    main_id: str,
    template_id: str,
    count: int,
) -> bool:
    if not isinstance(preview, dict):
        return False
    if str(preview.get("wallet_id") or "") != str(main_id):
        return False
    if str(preview.get("template_id") or "") != str(template_id):
        return False
    if int(preview.get("contract_count") or 0) != int(count):
        return False
    if not isinstance(preview.get("execution"), dict):
        return False
    if not isinstance(preview.get("funding"), dict):
        return False
    if not isinstance(preview.get("per_contract"), dict):
        return False
    return True


def create_wallet_run(main_id: str, template_id: str, count: int = 1, *, preview: dict | None = None):
    if count < 1 or count > 100:
        raise ValueError("Count must be between 1 and 100")

    from src.services.template_service import get_template, preview_template
    from src.services.contract_service import build_contract_execution_snapshot

    main_wallet = get_wallet(main_id)
    if not main_wallet or main_wallet["type"] not in {"main", "imported_private_key"}:
        raise ValueError("Invalid main wallet ID")

    template = get_template(template_id)
    if not template:
        raise ValueError("Template not found")
    ensure_supported_template_chain(template)
    template_chain = normalize_template_chain(template.get("chain"))
    chain_config = get_template_chain_config(template_chain)
    native_symbol = chain_config["native_symbol"]
    wrapped_native_symbol = chain_config["wrapped_native_symbol"]
    wrapped_native_address = Web3.to_checksum_address(chain_config["wrapped_native_address"])

    if _is_usable_client_run_preview(preview, main_id=main_id, template_id=template_id, count=count):
        preview = preview or {}
    else:
        preview = preview_template(main_id, template_id, count)
    if not preview.get("can_proceed"):
        raise ValueError(preview.get("shortfall_reason") or "This main wallet cannot support the selected template right now.")

    created_at = utcnow_iso()
    run_id = f"run_{int(datetime.utcnow().timestamp())}_{uuid4().hex[:8]}"
    contract_execution = build_contract_execution_snapshot(
        main_wallet={
            "id": main_id,
            "address": main_wallet["address"],
            "type": main_wallet["type"],
        },
        template=template,
        sub_wallets=[],
    )

    queued_log = {
        "timestamp": created_at,
        "stage": "run",
        "event": "run_queued",
        "status": "queued",
        "message": (
            f"Queued automation for template {template['name']} with {count} sub-wallet"
            f"{'s' if count != 1 else ''}."
        ),
        "details": {
            "main_wallet_id": main_id,
            "template_id": template_id,
            "subwallet_count": count,
        },
    }

    run_record = {
        "id": run_id,
        "main_wallet_id": main_id,
        "main_wallet_address": main_wallet["address"],
        "main_wallet_type": main_wallet["type"],
        "template_id": template["id"],
        "template_name": template["name"],
        "contract_count": count,
        "status": "queued",
        "created_at": created_at,
        "error": None,
        "preview": preview,
        "funding_fee_estimate": {
            "fee_eth": preview["execution"].get("total_network_fee_eth"),
            "funding_fee_eth": preview["execution"].get("funding_network_fee_eth"),
            "main_wallet_fee_eth": preview["execution"].get("main_wallet_network_fee_eth"),
            "local_execution_gas_fee_eth": preview["execution"].get("local_execution_gas_fee_eth"),
            "contract_sync_fee_eth": preview["execution"].get("contract_sync_network_fee_eth"),
            "gas_units": preview["execution"].get("estimated_gas_units"),
            "funding_transaction_count": preview["execution"].get("funding_transaction_count"),
            "execute_transaction_count": preview["execution"].get("execute_transaction_count"),
            "wrap_transaction_count": preview["execution"].get("wrap_transaction_count"),
            "approval_transaction_count": preview["execution"].get("approval_transaction_count"),
            "swap_transaction_count": preview["execution"].get("swap_transaction_count"),
            "deployment_transaction_count": preview["execution"].get("deployment_transaction_count"),
            "contract_funding_transaction_count": preview["execution"].get("contract_funding_transaction_count"),
            "contract_sync_transaction_count": preview["execution"].get("contract_sync_transaction_count"),
            "total_transaction_count": preview["execution"].get("total_transaction_count"),
        },
        "wrap_transaction": None,
        "contract_execution": contract_execution,
        "deployed_contracts": [],
        "run_logs": [queued_log],
        "sub_wallets": [],
    }
    return db.upsert_wallet_run(run_record)


def run_wallet_run_job(initial_run_record: dict, main_id: str, template_id: str, count: int = 1):
    try:
        execute_wallet_run(
            main_id,
            template_id,
            count,
            run_id=initial_run_record["id"],
            created_at=initial_run_record.get("created_at"),
        )
    except Exception as exc:
        current_record = next(
            (
                run
                for run in db.list_wallet_runs(main_wallet_id=initial_run_record.get("main_wallet_id"))
                if run.get("id") == initial_run_record["id"]
            ),
            None,
        )
        base_record = current_record or initial_run_record
        failure_log = {
            "timestamp": utcnow_iso(),
            "stage": "run",
            "event": "run_failed",
            "status": "failed",
            "message": f"Automation failed before completion: {exc}",
        }
        failed_record = {
            **base_record,
            "status": "failed",
            "error": str(exc),
            "run_logs": [*(base_record.get("run_logs") or []), failure_log],
        }
        db.upsert_wallet_run(failed_record)


def execute_wallet_run(
    main_id: str,
    template_id: str,
    count: int = 1,
    *,
    run_id: str | None = None,
    created_at: str | None = None,
):
    if count < 1 or count > 100:
        raise ValueError("Count must be between 1 and 100")

    from src.services.template_service import build_template_stablecoin_routes, get_template, preview_template
    from src.services.contract_service import build_contract_execution_snapshot
    from src.services.solidity_service import get_batch_treasury_distributor_interface

    main_wallet = get_wallet(main_id)
    if not main_wallet or main_wallet["type"] not in {"main", "imported_private_key"}:
        raise ValueError("Invalid main wallet ID")

    template = get_template(template_id)
    if not template:
        raise ValueError("Template not found")
    ensure_supported_template_chain(template)
    template_chain = normalize_template_chain(template.get("chain"))
    chain_config = get_template_chain_config(template_chain)
    native_symbol = chain_config["native_symbol"]
    wrapped_native_symbol = chain_config["wrapped_native_symbol"]
    wrapped_native_address = Web3.to_checksum_address(chain_config["wrapped_native_address"])

    preview = preview_template(main_id, template_id, count)
    if not preview.get("can_proceed"):
        raise ValueError(preview.get("shortfall_reason") or "This main wallet cannot support the selected template right now.")
    swap_route_count = int(preview["execution"].get("route_count") or 0)
    swap_runtimes = get_swap_runtime_configs(template_chain) if swap_route_count > 0 else []

    per_wallet_eth = parse_decimal_amount(preview["per_contract"]["required_eth"], "required_eth")
    per_wallet_wrap_weth = parse_decimal_amount(preview["per_contract"]["required_weth"], "required_weth")
    main_wallet_weth_wrapped = parse_decimal_amount(
        preview["funding"].get("main_wallet_weth_wrapped", "0"),
        "main_wallet_weth_wrapped",
    )
    total_eth_deducted = parse_decimal_amount(preview["funding"]["total_eth_deducted"], "total_eth_deducted")
    main_wallet_network_fee_eth = parse_decimal_amount(
        preview["execution"].get("main_wallet_network_fee_eth", preview["execution"]["funding_network_fee_eth"]),
        "main_wallet_network_fee_eth",
    )
    local_execution_gas_fee_eth = parse_decimal_amount(
        preview["execution"].get("local_execution_gas_fee_eth", "0"),
        "local_execution_gas_fee_eth",
    )
    local_execution_gas_fee_per_wallet_eth = parse_decimal_amount(
        preview["execution"].get("local_execution_gas_fee_per_wallet_eth", "0"),
        "local_execution_gas_fee_per_wallet_eth",
    )
    total_eth_required_with_fees = parse_decimal_amount(
        preview["execution"].get("total_eth_required_with_fees", "0"),
        "total_eth_required_with_fees",
    )
    gas_reserve_per_wallet = parse_decimal_amount(
        template.get("gas_reserve_eth_per_contract", "0"),
        "gas_reserve_eth_per_contract",
    )
    direct_contract_native_eth_per_wallet = parse_decimal_amount(
        template.get("direct_contract_native_eth_per_contract", "0"),
        "direct_contract_native_eth_per_contract",
    )
    swap_budget_per_wallet = parse_decimal_amount(
        template.get("swap_budget_eth_per_contract", "0"),
        "swap_budget_eth_per_contract",
    )
    distributor_amount = parse_decimal_amount(
        template.get("direct_contract_weth_per_contract", "0"),
        "direct_contract_weth_per_contract",
    )
    return_wallet_address = template.get("return_wallet_address")
    test_auto_execute_after_funding = bool(
        template.get(
            "test_auto_batch_send_after_funding",
            template.get("test_auto_execute_after_funding", False),
        )
    )
    auto_top_up_enabled = bool(template.get("auto_top_up_enabled", False))
    auto_top_up_threshold_eth = parse_decimal_amount(
        template.get("auto_top_up_threshold_eth", "0"),
        "auto_top_up_threshold_eth",
    )
    auto_top_up_target_eth = parse_decimal_amount(
        template.get("auto_top_up_target_eth", "0"),
        "auto_top_up_target_eth",
    )
    projected_auto_top_up_eth_total = parse_decimal_amount(
        preview["funding"].get("auto_top_up_eth_reserved", "0"),
        "auto_top_up_eth_reserved",
    )
    top_up_network_fee_eth = parse_decimal_amount(
        preview["execution"].get("top_up_network_fee_eth", "0"),
        "top_up_network_fee_eth",
    )
    return_sweep_gas_units_per_wallet = int(preview["execution"].get("return_sweep_gas_units_per_wallet") or 0)
    stablecoin_routes = [
        route
        for route in build_template_stablecoin_routes(template, contract_count=1)
        if parse_decimal_amount(route.get("per_contract_weth_amount") or "0", "per_contract_weth_amount") > 0
    ]
    recipient_address = template.get("testing_recipient_address") or template.get("recipient_address")
    has_route_distributors = bool(stablecoin_routes)
    has_direct_weth_distributor = distributor_amount > 0
    has_direct_native_eth_distributor = direct_contract_native_eth_per_wallet > 0
    requires_recipient = has_route_distributors or has_direct_weth_distributor or has_direct_native_eth_distributor
    if requires_recipient and not recipient_address:
        raise ValueError(
            f"testing_recipient_address is required when token swaps or direct contract "
            f"{native_symbol}/{wrapped_native_symbol} funding are enabled"
        )
    if test_auto_execute_after_funding and not recipient_address:
        raise ValueError("testing_recipient_address is required when test_auto_batch_send_after_funding is enabled")
    if requires_recipient and not test_auto_execute_after_funding:
        raise ValueError(
            "Testing only currently requires test_auto_batch_send_after_funding when BatchTreasuryDistributor "
            "will be funded, because the app does not yet expose a later release path for those assets."
        )

    should_execute_deployment_flow = requires_recipient and bool(recipient_address)
    if not requires_recipient:
        deployment_disabled_message = (
            "BatchTreasuryDistributor testing deployment is skipped because this template only funds the sub-wallet "
            f"in {native_symbol}. Add a positive token swap budget with allocations or set direct contract "
            f"{native_symbol}/{wrapped_native_symbol} above 0 to produce a batch treasury funding target."
        )
    else:
        deployment_disabled_message = (
            "BatchTreasuryDistributor testing deployment will run after each sub-wallet finishes any local wrap and configured swaps, then apply any direct native/wrapped funding from the main wallet."
        )

    def build_deployment_record(*, item: dict):
        return {
            "contract_name": "BatchTreasuryDistributor",
            "wallet_id": item["wallet_id"],
            "wallet_address": item["address"],
            "token_address": None,
            "token_symbol": None,
            "amount": None,
            "funding_asset_kind": "mixed",
            "recipient_address": recipient_address,
            "testing_recipient_address": recipient_address,
            "owner_address": item["address"],
            "return_wallet_address": return_wallet_address or item["address"],
            "test_auto_execute_after_funding": test_auto_execute_after_funding,
            "test_auto_batch_send_after_funding": test_auto_execute_after_funding,
            "status": "pending",
            "artifact_path": distributor_interface.get("artifact_path") if distributor_interface else None,
            "source_path": distributor_interface.get("source_path") if distributor_interface else None,
            "compiler_version": distributor_interface.get("compiler_version") if distributor_interface else None,
            "tx_hash": None,
            "contract_address": None,
            "funding_tx_hash": None,
            "funding_status": None,
            "funding_tx_hashes": [],
            "funded_assets": [],
            "initialization_required": False,
            "initialization_status": "skipped",
            "initialization_message": "BatchTreasuryDistributor is configured through the constructor.",
            "initialization_tx_hash": None,
            "execution_status": "pending" if test_auto_execute_after_funding else "skipped",
            "execution_message": (
                "Testing mode will call batchSend() immediately after the treasury contract is funded."
                if test_auto_execute_after_funding
                else "The treasury contract remains funded until batchSend() is called later."
            ),
            "execution_tx_hash": None,
            "source": "mixed_batch_treasury",
            "source_tx_hash": None,
            "funding_wallet_kind": "mixed",
            "error": None,
        }

    def build_planned_wallet_deployment_stage_gas_units(
        *,
        local_funding_target_count: int,
        total_funding_target_count: int,
    ) -> dict[str, int]:
        if total_funding_target_count <= 0:
            return {}
        return {
            LEGACY_GAS_STAGE_DEPLOY_TREASURY: BATCH_TREASURY_DISTRIBUTOR_DEPLOY_GAS_LIMIT,
            LEGACY_GAS_STAGE_FUND_TREASURY: ERC20_TRANSFER_GAS_LIMIT * max(local_funding_target_count, 0),
            LEGACY_GAS_STAGE_BATCH_SEND: (
                BATCH_TREASURY_DISTRIBUTOR_BATCH_SEND_BASE_GAS_LIMIT
                + (BATCH_TREASURY_DISTRIBUTOR_BATCH_SEND_PER_ENTRY_GAS_LIMIT * total_funding_target_count)
                if test_auto_execute_after_funding and total_funding_target_count > 0
                else 0
            ),
        }

    def build_planned_wallet_deployment_gas_units(*, local_funding_target_count: int, total_funding_target_count: int) -> int:
        return sum(
            int(value or 0)
            for value in build_planned_wallet_deployment_stage_gas_units(
                local_funding_target_count=local_funding_target_count,
                total_funding_target_count=total_funding_target_count,
            ).values()
        )

    direct_main_wallet_funding_target_count = (
        (1 if distributor_amount > 0 and recipient_address else 0)
        + (1 if direct_contract_native_eth_per_wallet > 0 and recipient_address else 0)
    )

    def build_planned_remaining_deployment_stage_gas_units(*, remaining_local_funding_target_count: int) -> dict[str, int]:
        if not should_execute_deployment_flow:
            return {}
        return build_planned_wallet_deployment_stage_gas_units(
            local_funding_target_count=remaining_local_funding_target_count,
            total_funding_target_count=remaining_local_funding_target_count + direct_main_wallet_funding_target_count,
        )

    def build_planned_remaining_deployment_gas_units(*, remaining_local_funding_target_count: int) -> int:
        return sum(
            int(value or 0)
            for value in build_planned_remaining_deployment_stage_gas_units(
                remaining_local_funding_target_count=remaining_local_funding_target_count,
            ).values()
        )

    needs_onchain_funding = per_wallet_eth > 0
    run_id = run_id or f"run_{int(datetime.utcnow().timestamp())}_{uuid4().hex[:8]}"
    created_at = created_at or utcnow_iso()
    run_logs: list[dict] = []
    created_sub_wallets: list[dict] = []
    run_sub_wallets: list[dict] = []
    deployed_contracts: list[dict] = []
    wrap_transaction = None
    error_message = None
    funding_submitted_transaction_count = 0
    status = "running"
    deployment_failures: list[str] = []
    swap_failure_count = 0
    approval_failure_count = 0
    approval_success_count = 0
    swap_success_count = 0
    top_up_success_count = 0
    top_up_failure_count = 0
    execution_failure_count = 0
    contract_execute_success_count = 0
    contract_execute_failure_count = 0
    return_sweep_success_count = 0
    return_sweep_failure_count = 0
    deployment_success_count = 0
    contract_funding_success_count = 0
    contract_funding_failure_count = 0
    subwallet_wrap_count = 0
    contract_execution = build_contract_execution_snapshot(
        main_wallet={
            "id": main_id,
            "address": main_wallet["address"],
            "type": main_wallet["type"],
        },
        template=template,
        sub_wallets=created_sub_wallets,
    )

    web3_client = get_web3(template_chain)
    sender = None
    sender_private_key = None
    main_wallet_nonce = None
    main_wallet_direct_weth_source_tx_hash = None
    if needs_onchain_funding or auto_top_up_enabled or should_execute_deployment_flow:
        sender = Web3.to_checksum_address(main_wallet["address"])
        sender_private_key = main_wallet["private_key"]
    funding_fee_estimate = {
        "fee_eth": preview["execution"].get("total_network_fee_eth"),
        "funding_fee_eth": preview["execution"].get("funding_network_fee_eth"),
        "top_up_fee_eth": preview["execution"].get("top_up_network_fee_eth"),
        "main_wallet_fee_eth": preview["execution"].get("main_wallet_network_fee_eth"),
        "main_wallet_wrap_transaction_count": preview["execution"].get("main_wallet_wrap_transaction_count"),
        "local_execution_gas_fee_eth": preview["execution"].get("local_execution_gas_fee_eth"),
        "contract_sync_fee_eth": preview["execution"].get("contract_sync_network_fee_eth"),
        "projected_auto_top_up_eth": preview["funding"].get("auto_top_up_eth_reserved"),
        "gas_units": preview["execution"].get("estimated_gas_units"),
        "funding_transaction_count": preview["execution"].get("funding_transaction_count"),
        "top_up_transaction_count": preview["execution"].get("top_up_transaction_count"),
        "execute_transaction_count": preview["execution"].get("execute_transaction_count"),
        "return_sweep_transaction_count": preview["execution"].get("return_sweep_transaction_count"),
        "wrap_transaction_count": preview["execution"].get("wrap_transaction_count"),
        "approval_transaction_count": preview["execution"].get("approval_transaction_count"),
        "swap_transaction_count": preview["execution"].get("swap_transaction_count"),
        "deployment_transaction_count": preview["execution"].get("deployment_transaction_count"),
        "contract_funding_transaction_count": preview["execution"].get("contract_funding_transaction_count"),
        "contract_sync_transaction_count": preview["execution"].get("contract_sync_transaction_count"),
        "total_transaction_count": preview["execution"].get("total_transaction_count"),
    }

    def build_run_record():
        return {
            "id": run_id,
            "main_wallet_id": main_id,
            "main_wallet_address": main_wallet["address"],
            "main_wallet_type": main_wallet["type"],
            "chain": template_chain,
            "template_id": template["id"],
            "template_name": template["name"],
            "contract_count": count,
            "status": status,
            "created_at": created_at,
            "error": error_message,
            "preview": preview,
            "funding_fee_estimate": funding_fee_estimate,
            "wrap_transaction": wrap_transaction,
            "contract_execution": contract_execution,
            "deployed_contracts": deployed_contracts,
            "run_logs": run_logs,
            "sub_wallets": run_sub_wallets,
        }

    def persist_run_state():
        return db.upsert_wallet_run(build_run_record())

    def record_run_log(**kwargs):
        entry = append_run_log(run_logs, **kwargs)
        persist_run_state()
        return entry

    def get_address_native_balance_decimal(address: str) -> Decimal:
        return wei_to_decimal(web3_client.eth.get_balance(Web3.to_checksum_address(address)))

    def get_token_balance_units(token_address: str, owner_address: str) -> int:
        token_contract = web3_client.eth.contract(
            address=Web3.to_checksum_address(token_address),
            abi=ERC20_ABI,
        )
        return int(token_contract.functions.balanceOf(Web3.to_checksum_address(owner_address)).call())

    def estimate_gas_fee_eth(
        gas_units: int,
        *,
        tx_stage: str = LEGACY_GAS_STAGE_FUND_TREASURY,
        gas_price_wei: int | None = None,
    ) -> Decimal:
        return estimate_legacy_aggressive_stage_fee_eth(
            web3_client,
            int(gas_units),
            chain=template_chain,
            tx_stage=tx_stage,
            gas_price_wei=gas_price_wei,
        )

    def estimate_multi_stage_gas_fee_eth(stage_gas_units: dict[str, int]) -> Decimal:
        return estimate_legacy_aggressive_multi_stage_fee_eth(
            web3_client,
            stage_gas_units,
            chain=template_chain,
        )

    def maybe_auto_top_up_subwallet(
        item: dict,
        *,
        reason: str,
        minimum_balance_eth: Decimal = Decimal("0"),
        current_eth_balance: Decimal | None = None,
    ) -> Decimal:
        nonlocal top_up_success_count

        current_balance = current_eth_balance if current_eth_balance is not None else get_address_native_balance_decimal(item["address"])
        needs_threshold_refill = auto_top_up_enabled and current_balance <= auto_top_up_threshold_eth
        needs_minimum_refill = auto_top_up_enabled and minimum_balance_eth > 0 and current_balance < minimum_balance_eth
        if not needs_threshold_refill and not needs_minimum_refill:
            return current_balance

        if sender is None or not sender_private_key:
            raise RuntimeError("Main wallet signer is unavailable for auto top-up")

        desired_target_eth = max(auto_top_up_target_eth, minimum_balance_eth)
        if desired_target_eth <= current_balance:
            return current_balance

        top_up_amount = desired_target_eth - current_balance
        top_up_gas_pricing = resolve_legacy_aggressive_gas_pricing(
            web3_client,
            chain=template_chain,
            tx_stage=LEGACY_GAS_STAGE_TOP_UP,
        )
        gas_price_wei = int(top_up_gas_pricing["submitted_gas_price_wei"])
        top_up_fee_eth = estimate_gas_fee_eth(
            ETH_TRANSFER_GAS_LIMIT,
            tx_stage=LEGACY_GAS_STAGE_TOP_UP,
            gas_price_wei=gas_price_wei,
        )
        current_main_balance = get_address_native_balance_decimal(sender)
        required_main_balance = top_up_amount + top_up_fee_eth
        if current_main_balance < required_main_balance:
            raise RuntimeError(
                f"Auto top-up could not continue because the main wallet no longer has enough {native_symbol}. "
                f"Need {format_decimal(required_main_balance - current_main_balance)} more {native_symbol}."
            )

        tx_nonce = web3_client.eth.get_transaction_count(sender, "pending")
        top_up_record = {
            "tx_hash": None,
            "status": "pending",
            "amount": format_decimal(top_up_amount),
            "balance_before_eth": format_decimal(current_balance),
            "balance_after_eth": None,
            "threshold_eth": format_decimal(auto_top_up_threshold_eth),
            "target_eth": format_decimal(desired_target_eth),
            "minimum_balance_eth": format_decimal(minimum_balance_eth),
            "reason": reason,
            "triggered_by_threshold": needs_threshold_refill,
            "triggered_by_minimum_balance": needs_minimum_refill,
        }
        item.setdefault("top_up_transactions", []).append(top_up_record)

        try:
            top_up_tx = {
                **build_transaction_envelope(
                    web3_client,
                    sender,
                    tx_nonce,
                    gas=ETH_TRANSFER_GAS_LIMIT,
                    value=decimal_to_wei(top_up_amount),
                    gas_price_wei=gas_price_wei,
                ),
                "to": Web3.to_checksum_address(item["address"]),
            }
            top_up_hash = send_signed_transaction(web3_client, top_up_tx, sender_private_key)
            top_up_record["tx_hash"] = top_up_hash
            top_up_record["status"] = "submitted"
            record_run_log(
                stage="top_up",
                event="subwallet_auto_top_up_submitted",
                status="submitted",
                message=f"Submitted auto top-up for subwallet {item['address']}.",
                tx_hash=top_up_hash,
                wallet_id=item["wallet_id"],
                wallet_address=item["address"],
                movement={
                    "action": "transfer",
                    "asset": native_symbol,
                    "amount": format_decimal(top_up_amount),
                    "from_address": main_wallet["address"],
                    "to_address": item["address"],
                },
                details={
                    "reason": reason,
                    "balance_before_eth": format_decimal(current_balance),
                    "target_eth": format_decimal(desired_target_eth),
                    "threshold_eth": format_decimal(auto_top_up_threshold_eth),
                    "minimum_balance_eth": format_decimal(minimum_balance_eth),
                    "triggered_by_threshold": needs_threshold_refill,
                    "triggered_by_minimum_balance": needs_minimum_refill,
                    **build_legacy_gas_log_details(top_up_gas_pricing),
                },
            )
            wait_for_transaction_success(
                web3_client,
                top_up_hash,
                timeout=DEFAULT_TRANSACTION_RECEIPT_TIMEOUT_SECONDS,
            )
            balance_after = get_address_native_balance_decimal(item["address"])
            top_up_record["status"] = "confirmed"
            top_up_record["balance_after_eth"] = format_decimal(balance_after)
            item["status"] = "topped_up"
            top_up_success_count += 1
            record_run_log(
                stage="top_up",
                event="subwallet_auto_top_up_confirmed",
                status="confirmed",
                message=f"Confirmed auto top-up for subwallet {item['address']}.",
                tx_hash=top_up_hash,
                wallet_id=item["wallet_id"],
                wallet_address=item["address"],
                movement={
                    "action": "transfer",
                    "asset": native_symbol,
                    "amount": format_decimal(top_up_amount),
                    "from_address": main_wallet["address"],
                    "to_address": item["address"],
                },
                details={
                    "reason": reason,
                    "balance_before_eth": format_decimal(current_balance),
                    "balance_after_eth": format_decimal(balance_after),
                    "target_eth": format_decimal(desired_target_eth),
                    "threshold_eth": format_decimal(auto_top_up_threshold_eth),
                    "minimum_balance_eth": format_decimal(minimum_balance_eth),
                    **build_legacy_gas_log_details(top_up_gas_pricing),
                },
            )
            return balance_after
        except Exception as exc:
            top_up_record["status"] = "failed"
            top_up_record["error"] = str(exc)
            record_run_log(
                stage="top_up",
                event="subwallet_auto_top_up_failed",
                status="failed",
                message=f"Auto top-up failed for subwallet {item['address']}: {exc}",
                tx_hash=top_up_record.get("tx_hash"),
                wallet_id=item["wallet_id"],
                wallet_address=item["address"],
                details={
                    "reason": reason,
                    "balance_before_eth": format_decimal(current_balance),
                    "target_eth": format_decimal(desired_target_eth),
                    "threshold_eth": format_decimal(auto_top_up_threshold_eth),
                    "minimum_balance_eth": format_decimal(minimum_balance_eth),
                },
            )
            raise

    def ensure_subwallet_eth_headroom(
        item: dict,
        *,
        reason: str,
        minimum_balance_eth: Decimal = Decimal("0"),
    ) -> tuple[bool, str | None]:
        nonlocal top_up_failure_count

        current_balance = get_address_native_balance_decimal(item["address"])

        if auto_top_up_enabled:
            try:
                current_balance = maybe_auto_top_up_subwallet(
                    item,
                    reason=reason,
                    minimum_balance_eth=minimum_balance_eth,
                    current_eth_balance=current_balance,
                )
            except Exception as exc:
                top_up_failure_count += 1
                return False, str(exc)

        if minimum_balance_eth > 0 and current_balance < minimum_balance_eth:
            return (
                False,
                f"Subwallet {item['address']} has {format_decimal(current_balance)} {native_symbol} but needs at least "
                f"{format_decimal(minimum_balance_eth)} {native_symbol} to {reason}.",
            )

        return True, None

    def sweep_subwallet_leftovers(
        item: dict,
        *,
        sub_wallet: dict,
    ):
        nonlocal return_sweep_success_count, return_sweep_failure_count, execution_failure_count

        if not return_wallet_address:
            return

        if Web3.to_checksum_address(return_wallet_address) == Web3.to_checksum_address(item["address"]):
            return

        checksum_subwallet_address = Web3.to_checksum_address(sub_wallet["address"])
        checksum_return_wallet_address = Web3.to_checksum_address(return_wallet_address)
        return_sweep_transactions = item.setdefault("return_sweep_transactions", [])

        def format_balance_entry(
            *,
            asset: str,
            amount_decimal: Decimal,
            token_address: str | None = None,
            kind: str,
        ) -> dict:
            return {
                "asset": asset,
                "amount": format_decimal(amount_decimal),
                "token_address": token_address,
                "kind": kind,
            }

        return_sweep_summary = {
            "status": "running",
            "return_wallet_address": return_wallet_address,
            "candidate_asset_count": 0,
            "detected_asset_count": 0,
            "successful_asset_count": 0,
            "failed_asset_count": 0,
            "remaining_asset_count": 0,
            "zero_balance_candidate_count": 0,
            "fully_returned": False,
            "detected_assets": [],
            "remaining_assets": [],
            "started_at": datetime.now(timezone.utc).isoformat(),
            "finished_at": None,
            "error": None,
        }
        item["return_sweep_summary"] = return_sweep_summary

        candidate_tokens: list[dict] = []
        seen_tokens: set[str] = set()
        for token in [
            resolve_token(wrapped_native_address, template_chain),
            *(resolve_token(route["token_address"], template_chain) for route in stablecoin_routes),
        ]:
            normalized_address = token["address"].lower()
            if normalized_address in seen_tokens:
                continue
            seen_tokens.add(normalized_address)
            candidate_tokens.append(token)

        return_sweep_summary["candidate_asset_count"] = len(candidate_tokens) + 1

        token_balances_to_sweep: list[tuple[dict, int]] = []
        for token in candidate_tokens:
            balance_units = get_token_balance_units(token["address"], sub_wallet["address"])
            if balance_units > 0:
                token_balances_to_sweep.append((token, balance_units))
                return_sweep_summary["detected_assets"].append(
                    format_balance_entry(
                        asset=token["symbol"],
                        amount_decimal=token_units_to_decimal(balance_units, int(token["decimals"])),
                        token_address=token["address"],
                        kind="token",
                    )
                )

        native_balance_before_wei = int(web3_client.eth.get_balance(checksum_subwallet_address))
        return_sweep_summary["native_balance_before"] = format_decimal(wei_to_decimal(native_balance_before_wei))
        if native_balance_before_wei > 0:
            return_sweep_summary["detected_assets"].append(
                format_balance_entry(
                    asset=native_symbol,
                    amount_decimal=wei_to_decimal(native_balance_before_wei),
                    kind="native",
                )
            )

        detected_asset_count = len(return_sweep_summary["detected_assets"])
        return_sweep_summary["detected_asset_count"] = detected_asset_count
        return_sweep_summary["zero_balance_candidate_count"] = max(
            int(return_sweep_summary["candidate_asset_count"]) - detected_asset_count,
            0,
        )

        record_run_log(
            stage="cleanup",
            event="subwallet_leftover_scan_completed",
            status="completed",
            message=(
                f"Detected {detected_asset_count} leftover asset(s) on subwallet {item['address']} before return cleanup."
                if detected_asset_count > 0
                else f"No leftover assets were detected on subwallet {item['address']}."
            ),
            wallet_id=item["wallet_id"],
            wallet_address=item["address"],
            details={
                "return_wallet_address": return_wallet_address,
                "candidate_asset_count": return_sweep_summary["candidate_asset_count"],
                "detected_asset_count": detected_asset_count,
                "zero_balance_candidate_count": return_sweep_summary["zero_balance_candidate_count"],
                "native_balance_before": return_sweep_summary["native_balance_before"],
            },
        )

        for token, balance_units in token_balances_to_sweep:
            amount_decimal = token_units_to_decimal(balance_units, int(token["decimals"]))
            try:
                sweep_receipt = None
                sweep_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                    web3_client,
                    chain=template_chain,
                    tx_stage=LEGACY_GAS_STAGE_RETURN_SWEEP,
                )
                sweep_gas_price_wei = int(sweep_gas_pricing["submitted_gas_price_wei"])
                required_headroom_eth = estimate_gas_fee_eth(
                    ERC20_TRANSFER_GAS_LIMIT + ETH_TRANSFER_GAS_LIMIT,
                    tx_stage=LEGACY_GAS_STAGE_RETURN_SWEEP,
                    gas_price_wei=sweep_gas_price_wei,
                )
                balance_ready, balance_error = ensure_subwallet_eth_headroom(
                    item,
                    reason=f"return leftover {token['symbol']} and still keep enough gas for the final {native_symbol} sweep",
                    minimum_balance_eth=required_headroom_eth,
                )
                if not balance_ready:
                    raise RuntimeError(
                        balance_error
                        or f"Return sweep {native_symbol} headroom check failed before returning {token['symbol']}"
                    )
                sweep_nonce = web3_client.eth.get_transaction_count(checksum_subwallet_address, "pending")
                last_sweep_error: WalletTransactionError | None = None
                attempts_used = 0

                for sweep_attempt in range(1, TOKEN_TRANSFER_MAX_ATTEMPTS + 1):
                    attempts_used = sweep_attempt
                    try:
                        sweep_receipt = transfer_token_from_wallet(
                            web3_client,
                            token_address=token["address"],
                            chain=template_chain,
                            wallet_address=sub_wallet["address"],
                            private_key=sub_wallet["private_key"],
                            recipient_address=return_wallet_address,
                            amount_units=balance_units,
                            nonce=sweep_nonce,
                            gas_price_wei=sweep_gas_price_wei,
                            tx_stage=LEGACY_GAS_STAGE_RETURN_SWEEP,
                            wait_timeout=get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_RETURN_SWEEP),
                        )
                        break
                    except WalletTransactionError as exc:
                        last_sweep_error = exc
                        if exc.retryable:
                            sweep_receipt = recover_token_transfer_after_timeout(
                                web3_client,
                                token_address=token["address"],
                                recipient_address=return_wallet_address,
                                amount_units=balance_units,
                                token_decimals=int(exc.details.get("token_decimals") or token["decimals"]),
                                recipient_balance_before=int(exc.details.get("recipient_balance_before") or 0),
                                tx_hash=exc.tx_hash,
                                nonce=sweep_nonce,
                                gas_price_wei=exc.gas_price_wei,
                            )
                            if sweep_receipt:
                                break
                            if sweep_attempt < TOKEN_TRANSFER_MAX_ATTEMPTS:
                                sweep_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                                    web3_client,
                                    chain=template_chain,
                                    tx_stage=LEGACY_GAS_STAGE_RETURN_SWEEP,
                                    attempt=sweep_attempt + 1,
                                    previous_gas_price_wei=exc.gas_price_wei,
                                )
                                sweep_gas_price_wei = int(sweep_gas_pricing["submitted_gas_price_wei"])
                                continue
                        raise

                if not sweep_receipt:
                    raise last_sweep_error or RuntimeError("Return sweep token transfer did not produce a confirmation")

                balance_after_units = get_token_balance_units(token["address"], sub_wallet["address"])
                return_sweep_transactions.append(
                    {
                        "asset": token["symbol"],
                        "token_address": token["address"],
                        "amount": format_decimal(amount_decimal),
                        "balance_before": format_decimal(amount_decimal),
                        "balance_after": format_decimal(token_units_to_decimal(balance_after_units, int(token["decimals"]))),
                        "kind": "token",
                        "recipient_address": return_wallet_address,
                        "destination_address": return_wallet_address,
                        "tx_hash": sweep_receipt["tx_hash"],
                        "status": sweep_receipt["status"],
                        "attempts": attempts_used,
                    }
                )
                return_sweep_summary["successful_asset_count"] = int(return_sweep_summary["successful_asset_count"]) + 1
                return_sweep_success_count += 1
                record_run_log(
                    stage="cleanup",
                    event="subwallet_leftover_token_returned",
                    status="confirmed",
                    message=f"Returned leftover {token['symbol']} from subwallet {item['address']} to the return wallet.",
                    tx_hash=sweep_receipt["tx_hash"],
                    wallet_id=item["wallet_id"],
                    wallet_address=item["address"],
                    movement={
                        "action": "transfer",
                        "asset": token["symbol"],
                        "amount": format_decimal(amount_decimal),
                        "from_address": item["address"],
                        "to_address": return_wallet_address,
                    },
                    details={
                        "attempts": attempts_used,
                        "balance_before": format_decimal(amount_decimal),
                        "balance_after": format_decimal(token_units_to_decimal(balance_after_units, int(token["decimals"]))),
                    },
                )
            except Exception as exc:
                balance_after_units = get_token_balance_units(token["address"], sub_wallet["address"])
                return_sweep_failure_count += 1
                return_sweep_summary["failed_asset_count"] = int(return_sweep_summary["failed_asset_count"]) + 1
                return_sweep_transactions.append(
                    {
                        "asset": token["symbol"],
                        "token_address": token["address"],
                        "amount": format_decimal(amount_decimal),
                        "balance_before": format_decimal(amount_decimal),
                        "balance_after": format_decimal(token_units_to_decimal(balance_after_units, int(token["decimals"]))),
                        "kind": "token",
                        "recipient_address": return_wallet_address,
                        "destination_address": return_wallet_address,
                        "tx_hash": None,
                        "status": "failed",
                        "error": str(exc),
                    }
                )
                record_run_log(
                    stage="cleanup",
                    event="subwallet_leftover_token_return_failed",
                    status="failed",
                    message=f"Failed to return leftover {token['symbol']} from subwallet {item['address']}: {exc}",
                    wallet_id=item["wallet_id"],
                    wallet_address=item["address"],
                    details={
                        "asset": token["symbol"],
                        "return_wallet_address": return_wallet_address,
                        "balance_before": format_decimal(amount_decimal),
                        "balance_after": format_decimal(token_units_to_decimal(balance_after_units, int(token["decimals"]))),
                    },
                )
        eth_balance_wei = int(web3_client.eth.get_balance(checksum_subwallet_address))
        eth_sweep_gas_pricing = resolve_legacy_aggressive_gas_pricing(
            web3_client,
            chain=template_chain,
            tx_stage=LEGACY_GAS_STAGE_RETURN_SWEEP,
        )
        gas_price_wei = int(eth_sweep_gas_pricing["submitted_gas_price_wei"])
        eth_transfer_fee_wei = gas_price_wei * ETH_TRANSFER_GAS_LIMIT
        transferable_eth_wei = int(eth_balance_wei) - int(eth_transfer_fee_wei)
        if eth_balance_wei > 0 and transferable_eth_wei <= 0:
            return_sweep_failure_count += 1
            return_sweep_summary["failed_asset_count"] = int(return_sweep_summary["failed_asset_count"]) + 1
            return_sweep_transactions.append(
                {
                    "asset": native_symbol,
                    "token_address": None,
                    "amount": format_decimal(wei_to_decimal(eth_balance_wei)),
                    "balance_before": format_decimal(wei_to_decimal(eth_balance_wei)),
                    "balance_after": format_decimal(wei_to_decimal(eth_balance_wei)),
                    "kind": "native",
                    "recipient_address": return_wallet_address,
                    "destination_address": return_wallet_address,
                    "tx_hash": None,
                    "status": "failed",
                    "error": (
                        f"Not enough {native_symbol} remained to cover the final return transfer gas. "
                        f"Need {format_decimal(wei_to_decimal(eth_transfer_fee_wei))} {native_symbol} in gas."
                    ),
                }
            )
            record_run_log(
                stage="cleanup",
                event="subwallet_leftover_eth_return_failed",
                status="failed",
                message=(
                    f"Leftover {native_symbol} remained on subwallet {item['address']} but could not be returned "
                    f"because the final transfer gas could not be covered."
                ),
                wallet_id=item["wallet_id"],
                wallet_address=item["address"],
                details={
                    "return_wallet_address": return_wallet_address,
                    "balance_before": format_decimal(wei_to_decimal(eth_balance_wei)),
                    "required_gas_fee": format_decimal(wei_to_decimal(eth_transfer_fee_wei)),
                },
            )
        elif transferable_eth_wei > 0:
            try:
                eth_amount = wei_to_decimal(transferable_eth_wei)
                sweep_tx = {
                    **build_transaction_envelope(
                        web3_client,
                        checksum_subwallet_address,
                        web3_client.eth.get_transaction_count(checksum_subwallet_address, "pending"),
                        gas=ETH_TRANSFER_GAS_LIMIT,
                        value=transferable_eth_wei,
                        gas_price_wei=gas_price_wei,
                    ),
                    "to": checksum_return_wallet_address,
                }
                sweep_hash = send_signed_transaction(web3_client, sweep_tx, sub_wallet["private_key"])
                wait_for_transaction_success(
                    web3_client,
                    sweep_hash,
                    timeout=get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_RETURN_SWEEP),
                )
                balance_after_wei = int(web3_client.eth.get_balance(checksum_subwallet_address))
                return_sweep_transactions.append(
                    {
                        "asset": native_symbol,
                        "token_address": None,
                        "amount": format_decimal(eth_amount),
                        "balance_before": format_decimal(wei_to_decimal(eth_balance_wei)),
                        "balance_after": format_decimal(wei_to_decimal(balance_after_wei)),
                        "kind": "native",
                        "recipient_address": return_wallet_address,
                        "destination_address": return_wallet_address,
                        "tx_hash": sweep_hash,
                        "status": "confirmed",
                    }
                )
                return_sweep_summary["successful_asset_count"] = int(return_sweep_summary["successful_asset_count"]) + 1
                item["status"] = "returned"
                return_sweep_success_count += 1
                record_run_log(
                    stage="cleanup",
                    event="subwallet_leftover_eth_returned",
                    status="confirmed",
                    message=f"Returned leftover {native_symbol} from subwallet {item['address']} to the return wallet.",
                    tx_hash=sweep_hash,
                    wallet_id=item["wallet_id"],
                    wallet_address=item["address"],
                    movement={
                        "action": "transfer",
                        "asset": native_symbol,
                        "amount": format_decimal(eth_amount),
                        "from_address": item["address"],
                        "to_address": return_wallet_address,
                    },
                    details={
                        "balance_before": format_decimal(wei_to_decimal(eth_balance_wei)),
                        "balance_after": format_decimal(wei_to_decimal(balance_after_wei)),
                    },
                )
            except Exception as exc:
                balance_after_wei = int(web3_client.eth.get_balance(checksum_subwallet_address))
                return_sweep_failure_count += 1
                return_sweep_summary["failed_asset_count"] = int(return_sweep_summary["failed_asset_count"]) + 1
                return_sweep_transactions.append(
                    {
                        "asset": native_symbol,
                        "token_address": None,
                        "amount": format_decimal(wei_to_decimal(transferable_eth_wei)),
                        "balance_before": format_decimal(wei_to_decimal(eth_balance_wei)),
                        "balance_after": format_decimal(wei_to_decimal(balance_after_wei)),
                        "kind": "native",
                        "recipient_address": return_wallet_address,
                        "destination_address": return_wallet_address,
                        "tx_hash": None,
                        "status": "failed",
                        "error": str(exc),
                    }
                )
                record_run_log(
                    stage="cleanup",
                    event="subwallet_leftover_eth_return_failed",
                    status="failed",
                    message=f"Failed to return leftover {native_symbol} from subwallet {item['address']}: {exc}",
                    wallet_id=item["wallet_id"],
                    wallet_address=item["address"],
                    details={
                        "return_wallet_address": return_wallet_address,
                        "balance_before": format_decimal(wei_to_decimal(eth_balance_wei)),
                        "balance_after": format_decimal(wei_to_decimal(balance_after_wei)),
                    },
                )

        remaining_assets: list[dict] = []
        for token in candidate_tokens:
            remaining_units = get_token_balance_units(token["address"], sub_wallet["address"])
            if remaining_units <= 0:
                continue
            remaining_assets.append(
                format_balance_entry(
                    asset=token["symbol"],
                    amount_decimal=token_units_to_decimal(remaining_units, int(token["decimals"])),
                    token_address=token["address"],
                    kind="token",
                )
            )

        native_balance_after_wei = int(web3_client.eth.get_balance(checksum_subwallet_address))
        return_sweep_summary["native_balance_after"] = format_decimal(wei_to_decimal(native_balance_after_wei))
        if native_balance_after_wei > 0:
            remaining_assets.append(
                format_balance_entry(
                    asset=native_symbol,
                    amount_decimal=wei_to_decimal(native_balance_after_wei),
                    kind="native",
                )
            )

        return_sweep_summary["remaining_assets"] = remaining_assets
        return_sweep_summary["remaining_asset_count"] = len(remaining_assets)
        return_sweep_summary["detected_asset_count"] = max(
            int(return_sweep_summary["detected_asset_count"]),
            int(return_sweep_summary["successful_asset_count"]) + int(return_sweep_summary["failed_asset_count"]),
            len(remaining_assets),
        )
        return_sweep_summary["zero_balance_candidate_count"] = max(
            int(return_sweep_summary["candidate_asset_count"]) - int(return_sweep_summary["detected_asset_count"]),
            0,
        )
        return_sweep_summary["fully_returned"] = return_sweep_summary["remaining_asset_count"] == 0
        return_sweep_summary["status"] = (
            "completed"
            if return_sweep_summary["fully_returned"]
            else "partial" if int(return_sweep_summary["successful_asset_count"]) > 0 else "failed"
        )
        return_sweep_summary["finished_at"] = datetime.now(timezone.utc).isoformat()

        if remaining_assets:
            remaining_text = ", ".join(
                f"{asset['asset']} {asset['amount']}"
                for asset in remaining_assets[:5]
            )
            return_sweep_summary["error"] = (
                f"Leftover cleanup could not fully drain subwallet {item['address']}. Remaining assets: {remaining_text}."
            )
            record_run_log(
                stage="cleanup",
                event="subwallet_leftover_cleanup_incomplete",
                status="failed",
                message=return_sweep_summary["error"],
                wallet_id=item["wallet_id"],
                wallet_address=item["address"],
                details={
                    "return_wallet_address": return_wallet_address,
                    "remaining_asset_count": return_sweep_summary["remaining_asset_count"],
                    "successful_asset_count": return_sweep_summary["successful_asset_count"],
                    "failed_asset_count": return_sweep_summary["failed_asset_count"],
                    "native_balance_after": return_sweep_summary["native_balance_after"],
                },
            )
            execution_failure_count += 1
            raise RuntimeError(return_sweep_summary["error"])

        record_run_log(
            stage="cleanup",
            event="subwallet_leftover_cleanup_completed",
            status="completed",
            message=(
                f"Return cleanup finished for subwallet {item['address']} with "
                f"{return_sweep_summary['successful_asset_count']} asset(s) returned."
            ),
            wallet_id=item["wallet_id"],
            wallet_address=item["address"],
            details={
                "return_wallet_address": return_wallet_address,
                "detected_asset_count": return_sweep_summary["detected_asset_count"],
                "successful_asset_count": return_sweep_summary["successful_asset_count"],
                "failed_asset_count": return_sweep_summary["failed_asset_count"],
                "native_balance_after": return_sweep_summary["native_balance_after"],
            },
        )

    def has_successful_return_sweep(item: dict) -> bool:
        return any(
            (entry.get("status") or "").lower() in {"confirmed", "completed"}
            for entry in (item.get("return_sweep_transactions") or [])
        )

    record_run_log(
        stage="run",
        event="run_started",
        status="started",
        message=f"Started run for template {template['name']} with {count} new subwallet{'s' if count != 1 else ''}.",
        details={
            "main_wallet_id": main_id,
            "main_wallet_address": main_wallet["address"],
            "template_id": template["id"],
            "template_name": template["name"],
            "subwallet_count": count,
            "return_wallet_address": return_wallet_address,
            "gas_reserve_eth_per_wallet": format_decimal(gas_reserve_per_wallet),
            "direct_contract_native_eth_per_wallet": format_decimal(direct_contract_native_eth_per_wallet),
            "per_wallet_eth": format_decimal(per_wallet_eth),
            "per_wallet_local_wrap_weth": format_decimal(per_wallet_wrap_weth),
            "main_wallet_weth_wrapped": format_decimal(main_wallet_weth_wrapped),
            "swap_budget_weth_per_wallet": format_decimal(swap_budget_per_wallet),
            "direct_contract_weth_per_wallet": format_decimal(distributor_amount),
            "test_auto_execute_after_funding": test_auto_execute_after_funding,
            "total_eth_deducted": format_decimal(total_eth_deducted),
            "total_eth_required_with_fees": format_decimal(total_eth_required_with_fees),
            "main_wallet_network_fee_eth": format_decimal(main_wallet_network_fee_eth),
            "top_up_network_fee_eth": format_decimal(top_up_network_fee_eth),
            "local_execution_gas_fee_eth": format_decimal(local_execution_gas_fee_eth),
            "local_execution_gas_fee_per_wallet_eth": format_decimal(local_execution_gas_fee_per_wallet_eth),
            "auto_top_up_enabled": auto_top_up_enabled,
            "auto_top_up_threshold_eth": format_decimal(auto_top_up_threshold_eth),
            "auto_top_up_target_eth": format_decimal(auto_top_up_target_eth),
            "projected_auto_top_up_eth_total": format_decimal(projected_auto_top_up_eth_total),
            "stablecoin_route_count": len(stablecoin_routes),
        },
    )

    if needs_onchain_funding:
        if not web3_client or not web3_client.is_connected():
            raise RuntimeError(f"{chain_config['label']} RPC is unavailable")

        current_main_eth_wei = web3_client.eth.get_balance(Web3.to_checksum_address(main_wallet["address"]))
        required_total_wei = decimal_to_wei(total_eth_required_with_fees)
        if current_main_eth_wei < required_total_wei:
            shortfall = wei_to_decimal(required_total_wei - current_main_eth_wei)
            raise ValueError(
                f"Not enough {native_symbol} to fund the new wallets, reserve the projected auto top-ups, "
                f"and pay network fees. Need {format_decimal(shortfall)} more {native_symbol}."
            )

        record_run_log(
            stage="funding",
            event="funding_prepared",
            status="ready",
            message=(
                "Funding transfers are ready to submit."
                if not auto_top_up_enabled
                else "Funding transfers and projected auto top-up reserve are ready to submit."
            ),
            details={
                "required_total_eth": format_decimal(total_eth_required_with_fees),
                "initial_funding_eth": format_decimal(total_eth_deducted),
                "projected_auto_top_up_eth": format_decimal(projected_auto_top_up_eth_total),
                "local_wrap_weth_total": format_decimal(per_wallet_wrap_weth * Decimal(count)),
                "main_wallet_weth_wrapped": format_decimal(main_wallet_weth_wrapped),
                "local_execution_gas_fee_eth": format_decimal(local_execution_gas_fee_eth),
                "funding_transaction_count": preview["execution"].get("funding_transaction_count"),
                "main_wallet_wrap_transaction_count": preview["execution"].get("main_wallet_wrap_transaction_count"),
                "top_up_transaction_count": preview["execution"].get("top_up_transaction_count"),
            },
        )
    else:
        record_run_log(
            stage="funding",
            event="funding_skipped",
            status="skipped",
            message="This template does not require any on-chain funding transfers.",
        )

    created_sub_wallets = generate_sub_wallets(main_id, count)
    run_sub_wallets = [
        {
            "wallet_id": sub_wallet["id"],
            "address": sub_wallet["address"],
            "index": sub_wallet.get("index"),
            "status": "created",
            "expected_funding": {
                "eth": format_decimal(per_wallet_eth),
                "weth": "0",
            },
            "expected_local_wrap_weth": format_decimal(per_wallet_wrap_weth),
            "funding_transactions": {},
            "wrap_transaction": None,
            "top_up_transactions": [],
            "contract_execution_transactions": [],
            "return_sweep_transactions": [],
            "return_sweep_summary": None,
            "approval_transactions": [],
            "swap_transactions": [],
            "deployed_contract": None,
            "deployed_contracts": [],
            "private_key_access": {
                "wallet_id": sub_wallet["id"],
                "export_supported": True,
            },
        }
        for sub_wallet in created_sub_wallets
    ]

    record_run_log(
        stage="wallet_creation",
        event="subwallet_batch_created",
        status="completed",
        message=f"Created {len(created_sub_wallets)} new subwallet{'s' if len(created_sub_wallets) != 1 else ''}.",
        details={"subwallet_count": len(created_sub_wallets)},
    )
    for sub_wallet in created_sub_wallets:
        record_run_log(
            stage="wallet_creation",
            event="subwallet_created",
            status="completed",
            message=(
                f"Created subwallet #{sub_wallet.get('index')} at {sub_wallet['address']}."
                if sub_wallet.get("index") is not None
                else f"Created subwallet at {sub_wallet['address']}."
            ),
            wallet_id=sub_wallet["id"],
            wallet_address=sub_wallet["address"],
            details={"index": sub_wallet.get("index")},
        )

    status = "running"

    if needs_onchain_funding:
        sender = Web3.to_checksum_address(main_wallet["address"])
        sender_private_key = main_wallet["private_key"]
        main_wallet_nonce = web3_client.eth.get_transaction_count(sender, "pending")

        record_run_log(
            stage="funding",
            event="funding_submission_started",
            status="started",
            message=f"Submitting {native_symbol} funding transfers from the main wallet.",
            details={"starting_nonce": main_wallet_nonce},
        )

        try:
            for item in run_sub_wallets:
                recipient = Web3.to_checksum_address(item["address"])
                if per_wallet_eth <= 0:
                    item["status"] = "created"
                    continue

                funding_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                    web3_client,
                    chain=template_chain,
                    tx_stage=LEGACY_GAS_STAGE_FUND_SUBWALLET,
                )
                eth_tx = {
                    **build_transaction_envelope(
                        web3_client,
                        sender,
                        main_wallet_nonce,
                        gas=ETH_TRANSFER_GAS_LIMIT,
                        value=decimal_to_wei(per_wallet_eth),
                        gas_price_wei=int(funding_gas_pricing["submitted_gas_price_wei"]),
                    ),
                    "to": recipient,
                }
                eth_tx_hash = send_signed_transaction(web3_client, eth_tx, sender_private_key)
                item["funding_transactions"]["eth"] = {
                    "tx_hash": eth_tx_hash,
                    "status": "submitted",
                    "amount": format_decimal(per_wallet_eth),
                }
                item["status"] = "funding_submitted"
                record_run_log(
                    stage="funding",
                    event="eth_transfer_submitted",
                    status="submitted",
                    message=f"Submitted {native_symbol} transfer to subwallet {item['address']}.",
                    tx_hash=eth_tx_hash,
                    wallet_id=item["wallet_id"],
                    wallet_address=item["address"],
                    movement={
                        "action": "transfer",
                        "asset": native_symbol,
                        "amount": format_decimal(per_wallet_eth),
                        "from_address": main_wallet["address"],
                        "to_address": item["address"],
                    },
                    details=build_legacy_gas_log_details(funding_gas_pricing),
                )
                funding_submitted_transaction_count += 1
                main_wallet_nonce += 1
        except Exception as exc:
            error_message = str(exc)
            record_run_log(
                stage="funding",
                event="funding_submission_failed",
                status="failed",
                message=f"Funding flow failed: {error_message}",
                details={"submitted_transaction_count": funding_submitted_transaction_count},
            )

        if error_message:
            status = "partial" if funding_submitted_transaction_count > 0 else "failed"
        else:
            status = "submitted" if funding_submitted_transaction_count > 0 else "created"

    if not error_message and should_execute_deployment_flow and main_wallet_weth_wrapped > 0:
        if sender is None or sender_private_key is None:
            sender = Web3.to_checksum_address(main_wallet["address"])
            sender_private_key = main_wallet["private_key"]
        if main_wallet_nonce is None:
            main_wallet_nonce = web3_client.eth.get_transaction_count(sender, "pending")

        wrap_amount_wei = decimal_to_wei(main_wallet_weth_wrapped)
        wrap_receipt = None
        wrap_gas_pricing = resolve_legacy_aggressive_gas_pricing(
            web3_client,
            chain=template_chain,
            tx_stage=LEGACY_GAS_STAGE_WRAP,
        )
        wrap_gas_price_wei = int(wrap_gas_pricing["submitted_gas_price_wei"])
        main_wallet_weth_contract = web3_client.eth.contract(
            address=wrapped_native_address,
            abi=WETH_ABI,
        )
        balance_before_wrap_units = int(main_wallet_weth_contract.functions.balanceOf(sender).call())
        last_wrap_error: WalletTransactionError | None = None
        wrap_attempt_used = 0

        try:
            for wrap_attempt in range(1, WETH_WRAP_MAX_ATTEMPTS + 1):
                wrap_attempt_used = wrap_attempt
                if wrap_attempt == 1:
                    record_run_log(
                        stage="wrapping",
                        event="main_wallet_eth_wrap_started",
                        status="started",
                        message=f"Starting main-wallet {native_symbol} wrap for direct {wrapped_native_symbol} distributor funding.",
                        details={
                            "amount": format_decimal(main_wallet_weth_wrapped),
                            "attempt": wrap_attempt,
                            "max_attempts": WETH_WRAP_MAX_ATTEMPTS,
                            **build_legacy_gas_log_details(wrap_gas_pricing),
                        },
                    )
                else:
                    record_run_log(
                        stage="wrapping",
                        event="main_wallet_eth_wrap_retry_started",
                        status="started",
                        message=(
                            f"Retrying main-wallet {native_symbol} wrap for direct {wrapped_native_symbol} distributor funding "
                            f"(attempt {wrap_attempt}/{WETH_WRAP_MAX_ATTEMPTS})."
                        ),
                        tx_hash=last_wrap_error.tx_hash if last_wrap_error else None,
                        details={
                            "amount": format_decimal(main_wallet_weth_wrapped),
                            "attempt": wrap_attempt,
                            "max_attempts": WETH_WRAP_MAX_ATTEMPTS,
                            "previous_error": str(last_wrap_error) if last_wrap_error else None,
                            **build_legacy_gas_log_details(wrap_gas_pricing),
                        },
                    )

                try:
                    wrap_receipt = wrap_eth_to_weth_from_wallet(
                        web3_client,
                        wallet_address=main_wallet["address"],
                        private_key=main_wallet["private_key"],
                        wrapped_native_address=wrapped_native_address,
                        amount_wei=wrap_amount_wei,
                        nonce=main_wallet_nonce,
                        gas_price_wei=wrap_gas_price_wei,
                        chain=template_chain,
                        wait_timeout=get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_WRAP),
                    )
                    record_run_log(
                        stage="wrapping",
                        event="main_wallet_eth_wrap_submitted",
                        status="submitted",
                        message=f"Submitted main-wallet {native_symbol} wrap for direct {wrapped_native_symbol} distributor funding.",
                        tx_hash=wrap_receipt["tx_hash"],
                        movement={
                            "action": "wrap",
                            "asset": native_symbol,
                            "amount": format_decimal(main_wallet_weth_wrapped),
                            "from_address": main_wallet["address"],
                            "to_address": wrapped_native_address,
                        },
                        details=build_legacy_gas_log_details(wrap_gas_pricing),
                    )
                    break
                except WalletTransactionError as exc:
                    last_wrap_error = exc
                    if exc.tx_hash:
                        record_run_log(
                            stage="wrapping",
                            event="main_wallet_eth_wrap_submitted",
                            status="submitted",
                            message=f"Submitted main-wallet {native_symbol} wrap for direct {wrapped_native_symbol} distributor funding.",
                            tx_hash=exc.tx_hash,
                            movement={
                                "action": "wrap",
                                "asset": native_symbol,
                                "amount": format_decimal(main_wallet_weth_wrapped),
                                "from_address": main_wallet["address"],
                                "to_address": wrapped_native_address,
                            },
                            details=build_legacy_gas_log_details(wrap_gas_pricing),
                        )
                    if exc.retryable:
                        wrap_receipt = recover_weth_wrap_after_timeout(
                            web3_client,
                            wallet_address=main_wallet["address"],
                            wrapped_native_address=wrapped_native_address,
                            amount_wei=wrap_amount_wei,
                            balance_before_units=balance_before_wrap_units,
                            tx_hash=exc.tx_hash,
                            nonce=main_wallet_nonce,
                            gas_price_wei=exc.gas_price_wei,
                        )
                        if wrap_receipt:
                            record_run_log(
                                stage="wrapping",
                                event="main_wallet_eth_wrap_recovered_after_timeout",
                                status="confirmed",
                                message=(
                                    f"Main-wallet {native_symbol} wrap for direct {wrapped_native_symbol} distributor funding "
                                    "was recovered after the receipt timeout."
                                ),
                                tx_hash=exc.tx_hash,
                                details={
                                    "attempt": wrap_attempt,
                                    "max_attempts": WETH_WRAP_MAX_ATTEMPTS,
                                    "confirmation_source": wrap_receipt.get("confirmation_source") or "receipt",
                                    **build_legacy_gas_log_details(wrap_gas_pricing),
                                },
                            )
                            break

                        if wrap_attempt < WETH_WRAP_MAX_ATTEMPTS:
                            wrap_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                                web3_client,
                                chain=template_chain,
                                tx_stage=LEGACY_GAS_STAGE_WRAP,
                                attempt=wrap_attempt + 1,
                                previous_gas_price_wei=exc.gas_price_wei,
                            )
                            wrap_gas_price_wei = int(wrap_gas_pricing["submitted_gas_price_wei"])
                            record_run_log(
                                stage="wrapping",
                                event="main_wallet_eth_wrap_retry_scheduled",
                                status="started",
                                message=(
                                    f"Main-wallet wrap attempt {wrap_attempt}/{WETH_WRAP_MAX_ATTEMPTS} timed out. "
                                    "Retrying with a higher gas price."
                                ),
                                tx_hash=exc.tx_hash,
                                details={
                                    "attempt": wrap_attempt,
                                    "max_attempts": WETH_WRAP_MAX_ATTEMPTS,
                                    "replacement_nonce": main_wallet_nonce,
                                    **build_legacy_gas_log_details(wrap_gas_pricing),
                                },
                            )
                            continue
                    raise

            if not wrap_receipt:
                raise last_wrap_error or RuntimeError("Main-wallet WETH wrap did not produce a confirmation")

            main_wallet_direct_weth_source_tx_hash = wrap_receipt["tx_hash"]
            main_wallet_nonce += 1
            record_run_log(
                stage="wrapping",
                event="main_wallet_eth_wrap_confirmed",
                status="confirmed",
                message=f"Confirmed main-wallet {native_symbol} wrap for direct {wrapped_native_symbol} distributor funding.",
                tx_hash=wrap_receipt["tx_hash"],
                movement={
                    "action": "wrap",
                    "asset": native_symbol,
                    "amount": format_decimal(main_wallet_weth_wrapped),
                    "from_address": main_wallet["address"],
                    "to_address": wrapped_native_address,
                },
                details={
                    "attempts": wrap_attempt_used,
                    "confirmation_source": wrap_receipt.get("confirmation_source") or "receipt",
                    **build_legacy_gas_log_details(wrap_gas_pricing),
                },
            )
        except Exception as exc:
            error_message = str(exc)
            status = "partial" if funding_submitted_transaction_count > 0 else "failed"
            record_run_log(
                stage="wrapping",
                event="main_wallet_eth_wrap_failed",
                status="failed",
                message=f"Main-wallet {wrapped_native_symbol} funding wrap failed: {error_message}",
                tx_hash=last_wrap_error.tx_hash if last_wrap_error else None,
                details={
                    "amount": format_decimal(main_wallet_weth_wrapped),
                    **build_legacy_gas_log_details(wrap_gas_pricing),
                },
            )

    distributor_interface = get_batch_treasury_distributor_interface() if should_execute_deployment_flow else None

    if not error_message:
        if should_execute_deployment_flow:
            record_run_log(
                stage="deployment",
                event="managed_token_distributor_prepared",
                status="ready",
                message="Preparing the local wrap, approve, swap, single BatchTreasuryDistributor deployment, and unified contract funding flow.",
                details={
                    "recipient_address": recipient_address,
                    "testing_recipient_address": recipient_address,
                    "return_wallet_address": return_wallet_address or "subwallet_self",
                    "test_auto_execute_after_funding": test_auto_execute_after_funding,
                    "test_auto_batch_send_after_funding": test_auto_execute_after_funding,
                    "stablecoin_route_count": len(stablecoin_routes),
                    "direct_contract_native_eth_per_contract": format_decimal(direct_contract_native_eth_per_wallet),
                    "direct_weth_per_contract": format_decimal(distributor_amount),
                    "main_wallet_weth_wrapped": format_decimal(main_wallet_weth_wrapped),
                },
            )
        else:
            record_run_log(
                stage="deployment",
                event="managed_token_distributor_skipped",
                status="skipped",
                message=deployment_disabled_message,
                details={
                    "recipient_address_present": bool(recipient_address),
                    "stablecoin_route_count": len(stablecoin_routes),
                    "direct_contract_native_eth_per_contract": format_decimal(direct_contract_native_eth_per_wallet),
                    "direct_contract_weth_per_contract": format_decimal(distributor_amount),
                },
            )

        planned_route_count = len(stablecoin_routes)
        planned_route_deployment_stage_gas_units = build_planned_remaining_deployment_stage_gas_units(
            remaining_local_funding_target_count=planned_route_count,
        )

        for item in run_sub_wallets:
            subwallet_errors: list[str] = []
            completed_deployments_for_wallet = 0
            successful_swaps_for_wallet = 0
            abort_wallet_execution = False
            sub_wallet = None

            try:
                sub_wallet = get_wallet(item["wallet_id"])
                if not sub_wallet:
                    raise ValueError("Subwallet not found")

                eth_transfer = item["funding_transactions"].get("eth")
                if eth_transfer and eth_transfer.get("tx_hash"):
                    wait_for_transaction_success(
                        web3_client,
                        eth_transfer["tx_hash"],
                        timeout=DEFAULT_TRANSACTION_RECEIPT_TIMEOUT_SECONDS,
                    )
                    eth_transfer["status"] = "confirmed"
                    item["status"] = "funded"
                    record_run_log(
                        stage="funding",
                        event="eth_transfer_confirmed",
                        status="confirmed",
                        message=f"Confirmed {native_symbol} funding for subwallet {item['address']}.",
                        tx_hash=eth_transfer["tx_hash"],
                        wallet_id=item["wallet_id"],
                        wallet_address=item["address"],
                        movement={
                            "action": "transfer",
                            "asset": native_symbol,
                            "amount": eth_transfer.get("amount"),
                            "from_address": main_wallet["address"],
                            "to_address": item["address"],
                        },
                    )

                subwallet_address = Web3.to_checksum_address(sub_wallet["address"])
                weth_contract = web3_client.eth.contract(
                    address=wrapped_native_address,
                    abi=WETH_ABI,
                )
                subwallet_nonce = web3_client.eth.get_transaction_count(subwallet_address, "pending")

                if per_wallet_wrap_weth > 0:
                    wrap_amount_wei = decimal_to_wei(per_wallet_wrap_weth)
                    wrap_receipt = None
                    wrap_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                        web3_client,
                        chain=template_chain,
                        tx_stage=LEGACY_GAS_STAGE_WRAP,
                    )
                    wrap_gas_price_wei = int(wrap_gas_pricing["submitted_gas_price_wei"])
                    balance_before_wrap_units = int(weth_contract.functions.balanceOf(subwallet_address).call())
                    last_wrap_error: WalletTransactionError | None = None
                    max_wrap_attempts = WETH_WRAP_MAX_ATTEMPTS
                    wrap_attempt_used = 0

                    for wrap_attempt in range(1, max_wrap_attempts + 1):
                        wrap_attempt_used = wrap_attempt
                        if wrap_attempt == 1:
                            record_run_log(
                                stage="wrapping",
                                event="subwallet_eth_wrap_started",
                                status="started",
                                message=f"Starting local {native_symbol} wrap for subwallet {item['address']}.",
                                wallet_id=item["wallet_id"],
                                wallet_address=item["address"],
                                details={
                                    "amount": format_decimal(per_wallet_wrap_weth),
                                    "attempt": wrap_attempt,
                                    "max_attempts": max_wrap_attempts,
                                    **build_legacy_gas_log_details(wrap_gas_pricing),
                                },
                            )
                        else:
                            record_run_log(
                                stage="wrapping",
                                event="subwallet_eth_wrap_retry_started",
                                status="started",
                                message=(
                                    f"Retrying local {native_symbol} wrap for subwallet {item['address']} "
                                    f"(attempt {wrap_attempt}/{max_wrap_attempts})."
                                ),
                                tx_hash=last_wrap_error.tx_hash if last_wrap_error else None,
                                wallet_id=item["wallet_id"],
                                wallet_address=item["address"],
                                details={
                                    "amount": format_decimal(per_wallet_wrap_weth),
                                    "attempt": wrap_attempt,
                                    "max_attempts": max_wrap_attempts,
                                    "previous_error": str(last_wrap_error) if last_wrap_error else None,
                                    **build_legacy_gas_log_details(wrap_gas_pricing),
                                },
                            )

                        try:
                            wrap_receipt = wrap_eth_to_weth_from_wallet(
                                web3_client,
                                wallet_address=sub_wallet["address"],
                                private_key=sub_wallet["private_key"],
                                wrapped_native_address=wrapped_native_address,
                                amount_wei=wrap_amount_wei,
                                nonce=subwallet_nonce,
                                gas_price_wei=wrap_gas_price_wei,
                                chain=template_chain,
                                wait_timeout=get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_WRAP),
                            )
                            record_run_log(
                                stage="wrapping",
                                event="subwallet_eth_wrap_submitted",
                                status="submitted",
                                message=f"Submitted local {native_symbol} wrap for subwallet {item['address']}.",
                                tx_hash=wrap_receipt["tx_hash"],
                                wallet_id=item["wallet_id"],
                                wallet_address=item["address"],
                                movement={
                                    "action": "wrap",
                                    "asset": native_symbol,
                                    "amount": format_decimal(per_wallet_wrap_weth),
                                    "from_address": item["address"],
                                    "to_address": wrapped_native_address,
                                },
                                details=build_legacy_gas_log_details(wrap_gas_pricing),
                            )
                            break
                        except WalletTransactionError as exc:
                            last_wrap_error = exc
                            if exc.tx_hash:
                                record_run_log(
                                    stage="wrapping",
                                    event="subwallet_eth_wrap_submitted",
                                    status="submitted",
                                    message=f"Submitted local {native_symbol} wrap for subwallet {item['address']}.",
                                    tx_hash=exc.tx_hash,
                                    wallet_id=item["wallet_id"],
                                    wallet_address=item["address"],
                                    movement={
                                        "action": "wrap",
                                        "asset": native_symbol,
                                        "amount": format_decimal(per_wallet_wrap_weth),
                                        "from_address": item["address"],
                                        "to_address": wrapped_native_address,
                                    },
                                    details=build_legacy_gas_log_details(wrap_gas_pricing),
                                )
                            if exc.retryable:
                                wrap_receipt = recover_weth_wrap_after_timeout(
                                    web3_client,
                                    wallet_address=sub_wallet["address"],
                                    wrapped_native_address=wrapped_native_address,
                                    amount_wei=wrap_amount_wei,
                                    balance_before_units=balance_before_wrap_units,
                                    tx_hash=exc.tx_hash,
                                    nonce=subwallet_nonce,
                                    gas_price_wei=exc.gas_price_wei,
                                )
                                if wrap_receipt:
                                    record_run_log(
                                        stage="wrapping",
                                        event="subwallet_eth_wrap_recovered_after_timeout",
                                        status="confirmed",
                                        message=(
                                            f"Local {native_symbol} wrap for subwallet {item['address']} "
                                            f"was recovered after the receipt timeout."
                                        ),
                                        tx_hash=exc.tx_hash,
                                        wallet_id=item["wallet_id"],
                                        wallet_address=item["address"],
                                        details={
                                            "attempt": wrap_attempt,
                                            "max_attempts": max_wrap_attempts,
                                            "confirmation_source": wrap_receipt.get("confirmation_source") or "receipt",
                                            **build_legacy_gas_log_details(wrap_gas_pricing),
                                        },
                                    )
                                    break

                                if wrap_attempt < max_wrap_attempts:
                                    wrap_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                                        web3_client,
                                        chain=template_chain,
                                        tx_stage=LEGACY_GAS_STAGE_WRAP,
                                        attempt=wrap_attempt + 1,
                                        previous_gas_price_wei=exc.gas_price_wei,
                                    )
                                    wrap_gas_price_wei = int(wrap_gas_pricing["submitted_gas_price_wei"])
                                    record_run_log(
                                        stage="wrapping",
                                        event="subwallet_eth_wrap_retry_scheduled",
                                        status="started",
                                        message=(
                                            f"Wrap attempt {wrap_attempt}/{max_wrap_attempts} for subwallet {item['address']} "
                                            f"timed out. Retrying with a higher gas price."
                                        ),
                                        tx_hash=exc.tx_hash,
                                        wallet_id=item["wallet_id"],
                                        wallet_address=item["address"],
                                        details={
                                            "attempt": wrap_attempt,
                                            "max_attempts": max_wrap_attempts,
                                            "replacement_nonce": subwallet_nonce,
                                            **build_legacy_gas_log_details(wrap_gas_pricing),
                                        },
                                    )
                                    continue
                            raise

                    if not wrap_receipt:
                        raise last_wrap_error or RuntimeError(f"Local {native_symbol} wrap did not produce a confirmation")

                    item["wrap_transaction"] = {
                        "tx_hash": wrap_receipt["tx_hash"],
                        "status": wrap_receipt["status"],
                        "eth_wrapped": wrap_receipt["eth_wrapped"],
                        "attempts": wrap_attempt_used,
                        "confirmation_source": wrap_receipt.get("confirmation_source"),
                    }
                    item["status"] = "wrapped"
                    wrap_transaction = wrap_transaction or item["wrap_transaction"]
                    subwallet_wrap_count += 1
                    record_run_log(
                        stage="wrapping",
                        event="subwallet_eth_wrap_confirmed",
                        status="confirmed",
                        message=f"Confirmed local {native_symbol} wrap for subwallet {item['address']}.",
                        tx_hash=wrap_receipt["tx_hash"],
                        wallet_id=item["wallet_id"],
                        wallet_address=item["address"],
                        movement={
                            "action": "wrap",
                            "asset": native_symbol,
                            "amount": format_decimal(per_wallet_wrap_weth),
                            "from_address": item["address"],
                            "to_address": wrapped_native_address,
                        },
                        details={
                            "attempts": wrap_attempt_used,
                            "confirmation_source": wrap_receipt.get("confirmation_source") or "receipt",
                            **build_legacy_gas_log_details(wrap_gas_pricing),
                        },
                    )
                    subwallet_nonce += 1

                planned_remaining_execution_stage_gas_units = {
                    LEGACY_GAS_STAGE_APPROVAL: ERC20_APPROVE_GAS_LIMIT if stablecoin_routes else 0,
                    LEGACY_GAS_STAGE_SWAP: planned_route_count * UNISWAP_V3_SWAP_GAS_LIMIT,
                    LEGACY_GAS_STAGE_RETURN_SWEEP: return_sweep_gas_units_per_wallet,
                    **planned_route_deployment_stage_gas_units,
                }
                if sum(int(value or 0) for value in planned_remaining_execution_stage_gas_units.values()) > 0:
                    minimum_post_wrap_balance_eth = estimate_multi_stage_gas_fee_eth(planned_remaining_execution_stage_gas_units)
                    balance_ready, balance_error = ensure_subwallet_eth_headroom(
                        item,
                        reason="continue through approvals, swaps, and distributor deployment",
                        minimum_balance_eth=minimum_post_wrap_balance_eth,
                    )
                    if not balance_ready:
                        abort_wallet_execution = True
                        execution_failure_count += 1
                        subwallet_errors.append(balance_error or f"Subwallet {native_symbol} headroom check failed")
                        record_run_log(
                            stage="top_up" if auto_top_up_enabled else "run",
                            event="subwallet_eth_headroom_failed",
                            status="failed",
                            message=(
                                f"Subwallet {item['address']} does not have enough {native_symbol} to continue through approvals, "
                                f"swaps, and distributor deployment: {balance_error}"
                            ),
                            wallet_id=item["wallet_id"],
                            wallet_address=item["address"],
                            details={
                                "required_minimum_eth": format_decimal(minimum_post_wrap_balance_eth),
                                "auto_top_up_enabled": auto_top_up_enabled,
                            },
                        )

                approval_ready = not abort_wallet_execution
                approved_swap_backends: set[str] = set()

                successful_swap_outputs: list[dict] = []
                if approval_ready and not abort_wallet_execution:
                    for route_index, route in enumerate(stablecoin_routes):
                        amount_in = parse_decimal_amount(
                            route.get("per_contract_weth_amount") or "0",
                            "per_contract_weth_amount",
                        )
                        if amount_in <= 0:
                            continue

                        token_out = resolve_token(route["token_address"], template_chain)
                        remaining_route_count = planned_route_count - route_index

                        prepared_quote = None
                        quote_backend = None
                        if not abort_wallet_execution:
                            try:
                                prepared_quote = quote_uniswap_swap(
                                    wrapped_native_symbol,
                                    token_out["address"],
                                    format_decimal(amount_in),
                                    fee_tier=template.get("fee_tier"),
                                    slippage_percent=template.get("slippage_percent"),
                                    chain=template_chain,
                                )
                                quote_backend = prepared_quote.get("backend")
                            except Exception as exc:
                                swap_failure_count += 1
                                subwallet_errors.append(str(exc))
                                item["swap_transactions"].append(
                                    {
                                        "backend": None,
                                        "route_type": None,
                                        "path_symbols": None,
                                        "path_addresses": None,
                                        "path_fee_tiers": None,
                                        "token_symbol": token_out["symbol"],
                                        "token_address": token_out["address"],
                                        "amount_in": format_decimal(amount_in),
                                        "amount_out": None,
                                        "min_amount_out": None,
                                        "fee_tier": template.get("fee_tier"),
                                        "tx_hash": None,
                                        "status": "failed",
                                        "error": str(exc),
                                    }
                                )
                                record_run_log(
                                    stage="swap",
                                    event="stablecoin_swap_failed",
                                    status="failed",
                                    message=f"Stablecoin swap into {token_out['symbol']} failed for subwallet {item['address']}: {exc}",
                                    wallet_id=item["wallet_id"],
                                    wallet_address=item["address"],
                                    details={
                                        "token_in": wrapped_native_symbol,
                                        "token_out": token_out["symbol"],
                                        "amount_in_wrapped_native": format_decimal(amount_in),
                                    },
                                )
                                continue

                        remaining_route_deployment_stage_gas_units = build_planned_remaining_deployment_stage_gas_units(
                            remaining_local_funding_target_count=remaining_route_count,
                        )
                        remaining_approval_gas_units = (
                            ERC20_APPROVE_GAS_LIMIT
                            if quote_backend and quote_backend not in approved_swap_backends
                            else 0
                        )
                        minimum_swap_stage_balance_eth = estimate_multi_stage_gas_fee_eth(
                            {
                                LEGACY_GAS_STAGE_APPROVAL: remaining_approval_gas_units,
                                LEGACY_GAS_STAGE_SWAP: remaining_route_count * UNISWAP_V3_SWAP_GAS_LIMIT,
                                LEGACY_GAS_STAGE_RETURN_SWEEP: return_sweep_gas_units_per_wallet,
                                **remaining_route_deployment_stage_gas_units,
                            }
                        )
                        balance_ready, balance_error = ensure_subwallet_eth_headroom(
                            item,
                            reason=f"swap into {token_out['symbol']} and finish the remaining automation",
                            minimum_balance_eth=minimum_swap_stage_balance_eth,
                        )
                        if not balance_ready:
                            abort_wallet_execution = True
                            execution_failure_count += 1
                            subwallet_errors.append(balance_error or f"Subwallet {native_symbol} headroom check failed")
                            record_run_log(
                                stage="top_up" if auto_top_up_enabled else "run",
                                event="subwallet_eth_headroom_failed",
                                status="failed",
                                message=(
                                    f"Subwallet {item['address']} does not have enough {native_symbol} to swap into "
                                    f"{token_out['symbol']} and finish the remaining automation: {balance_error}"
                                ),
                                wallet_id=item["wallet_id"],
                                wallet_address=item["address"],
                                details={
                                    "required_minimum_eth": format_decimal(minimum_swap_stage_balance_eth),
                                    "token_symbol": token_out["symbol"],
                                    "auto_top_up_enabled": auto_top_up_enabled,
                                },
                            )
                            break

                        if quote_backend and quote_backend not in approved_swap_backends and not abort_wallet_execution:
                            swap_runtime = get_swap_runtime_config(template_chain, backend=quote_backend)
                            spender_address = swap_runtime["router_address"]
                            approval_receipt = None
                            approval_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                                web3_client,
                                chain=template_chain,
                                tx_stage=LEGACY_GAS_STAGE_APPROVAL,
                            )
                            approval_gas_price_wei = int(approval_gas_pricing["submitted_gas_price_wei"])
                            last_approval_error: WalletTransactionError | None = None
                            max_approval_attempts = TOKEN_APPROVAL_MAX_ATTEMPTS
                            approval_attempt_used = 0
                            approval_amount_units = decimal_to_wei(swap_budget_per_wallet)

                            try:
                                for approval_attempt in range(1, max_approval_attempts + 1):
                                    approval_attempt_used = approval_attempt
                                    if approval_attempt > 1:
                                        record_run_log(
                                            stage="approval",
                                            event="weth_router_approval_retry_started",
                                            status="started",
                                            message=(
                                                f"Retrying {wrapped_native_symbol} router approval for subwallet {item['address']} "
                                                f"on {quote_backend} (attempt {approval_attempt}/{max_approval_attempts})."
                                            ),
                                            tx_hash=last_approval_error.tx_hash if last_approval_error else None,
                                            wallet_id=item["wallet_id"],
                                            wallet_address=item["address"],
                                            details={
                                                "backend": quote_backend,
                                                "spender": spender_address,
                                                "amount_wrapped_native": format_decimal(swap_budget_per_wallet),
                                                "attempt": approval_attempt,
                                                "max_attempts": max_approval_attempts,
                                                "previous_error": str(last_approval_error) if last_approval_error else None,
                                                **build_legacy_gas_log_details(approval_gas_pricing),
                                            },
                                        )

                                    try:
                                        approval_receipt = approve_token_from_wallet(
                                            web3_client,
                                            token_address=wrapped_native_address,
                                            wallet_address=sub_wallet["address"],
                                            private_key=sub_wallet["private_key"],
                                            spender_address=spender_address,
                                            amount_units=approval_amount_units,
                                            nonce=subwallet_nonce,
                                            gas_price_wei=approval_gas_price_wei,
                                            chain=template_chain,
                                            wait_timeout=get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_APPROVAL),
                                        )
                                        break
                                    except WalletTransactionError as exc:
                                        last_approval_error = exc
                                        if exc.retryable:
                                            approval_receipt = recover_approval_after_timeout(
                                                web3_client,
                                                token_address=wrapped_native_address,
                                                owner_address=sub_wallet["address"],
                                                spender_address=spender_address,
                                                amount_units=approval_amount_units,
                                                tx_hash=exc.tx_hash,
                                                nonce=subwallet_nonce,
                                                gas_price_wei=exc.gas_price_wei,
                                            )
                                            if approval_receipt:
                                                record_run_log(
                                                    stage="approval",
                                                    event="weth_router_approval_recovered_after_timeout",
                                                    status="confirmed",
                                                    message=(
                                                        f"{wrapped_native_symbol} router approval for subwallet {item['address']} "
                                                        f"on {quote_backend} was recovered after the receipt timeout."
                                                    ),
                                                    tx_hash=exc.tx_hash,
                                                    wallet_id=item["wallet_id"],
                                                    wallet_address=item["address"],
                                                    details={
                                                        "backend": quote_backend,
                                                        "spender": spender_address,
                                                        "amount_wrapped_native": format_decimal(swap_budget_per_wallet),
                                                        "attempt": approval_attempt,
                                                        "max_attempts": max_approval_attempts,
                                                        "confirmation_source": approval_receipt.get("confirmation_source") or "receipt",
                                                        **build_legacy_gas_log_details(approval_gas_pricing),
                                                    },
                                                )
                                                break

                                            if approval_attempt < max_approval_attempts:
                                                approval_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                                                    web3_client,
                                                    chain=template_chain,
                                                    tx_stage=LEGACY_GAS_STAGE_APPROVAL,
                                                    attempt=approval_attempt + 1,
                                                    previous_gas_price_wei=exc.gas_price_wei,
                                                )
                                                approval_gas_price_wei = int(approval_gas_pricing["submitted_gas_price_wei"])
                                                record_run_log(
                                                    stage="approval",
                                                    event="weth_router_approval_retry_scheduled",
                                                    status="started",
                                                    message=(
                                                        f"Approval attempt {approval_attempt}/{max_approval_attempts} for subwallet {item['address']} "
                                                        f"on {quote_backend} timed out. Retrying with a higher gas price."
                                                    ),
                                                    tx_hash=exc.tx_hash,
                                                    wallet_id=item["wallet_id"],
                                                    wallet_address=item["address"],
                                                    details={
                                                        "backend": quote_backend,
                                                        "spender": spender_address,
                                                        "amount_wrapped_native": format_decimal(swap_budget_per_wallet),
                                                        "attempt": approval_attempt,
                                                        "max_attempts": max_approval_attempts,
                                                        "replacement_nonce": subwallet_nonce,
                                                        **build_legacy_gas_log_details(approval_gas_pricing),
                                                    },
                                                )
                                                continue
                                        raise

                                if not approval_receipt:
                                    raise last_approval_error or RuntimeError(
                                        f"{wrapped_native_symbol} router approval did not produce a confirmation"
                                    )

                                item["approval_transactions"].append(
                                    {
                                        "backend": quote_backend,
                                        "token_symbol": wrapped_native_symbol,
                                        "token_address": wrapped_native_address,
                                        "spender_address": spender_address,
                                        "amount": format_decimal(swap_budget_per_wallet),
                                        "attempts": approval_attempt_used,
                                        **approval_receipt,
                                    }
                                )
                                approval_success_count += 1
                                approved_swap_backends.add(quote_backend)
                                record_run_log(
                                    stage="approval",
                                    event="weth_router_approval_confirmed",
                                    status="confirmed",
                                    message=(
                                        f"Approved {wrapped_native_symbol} router allowance for subwallet {item['address']} "
                                        f"on {quote_backend}."
                                    ),
                                    tx_hash=approval_receipt["tx_hash"],
                                    wallet_id=item["wallet_id"],
                                    wallet_address=item["address"],
                                    details={
                                        "backend": quote_backend,
                                        "spender": spender_address,
                                        "amount_wrapped_native": format_decimal(swap_budget_per_wallet),
                                        "attempt": approval_attempt_used,
                                        "max_attempts": max_approval_attempts,
                                        "confirmation_source": approval_receipt.get("confirmation_source") or "receipt",
                                        **build_legacy_gas_log_details(approval_gas_pricing),
                                    },
                                )
                                subwallet_nonce += 1
                                item["status"] = "approved"
                            except Exception as exc:
                                approval_failure_count += 1
                                subwallet_errors.append(str(exc))
                                failed_tx_hash = exc.tx_hash if isinstance(exc, WalletTransactionError) else None
                                item["approval_transactions"].append(
                                    {
                                        "backend": quote_backend,
                                        "token_symbol": wrapped_native_symbol,
                                        "token_address": wrapped_native_address,
                                        "spender_address": spender_address,
                                        "amount": format_decimal(swap_budget_per_wallet),
                                        "tx_hash": failed_tx_hash,
                                        "status": "failed",
                                        "error": str(exc),
                                    }
                                )
                                record_run_log(
                                    stage="approval",
                                    event="weth_router_approval_failed",
                                    status="failed",
                                    message=f"{wrapped_native_symbol} router approval failed for subwallet {item['address']}: {exc}",
                                    wallet_id=item["wallet_id"],
                                    wallet_address=item["address"],
                                    tx_hash=failed_tx_hash,
                                    details={
                                        "backend": quote_backend,
                                        "spender": spender_address,
                                        "amount_wrapped_native": format_decimal(swap_budget_per_wallet),
                                        **build_legacy_gas_log_details(approval_gas_pricing),
                                    },
                                )
                                abort_wallet_execution = True
                                approval_ready = False
                                break

                        try:
                            swap_receipt = None
                            swap_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                                web3_client,
                                chain=template_chain,
                                tx_stage=LEGACY_GAS_STAGE_SWAP,
                            )
                            swap_gas_price_wei = int(swap_gas_pricing["submitted_gas_price_wei"])
                            last_swap_error: WalletTransactionError | None = None
                            max_swap_attempts = TOKEN_SWAP_MAX_ATTEMPTS
                            swap_attempt_used = 0

                            for swap_attempt in range(1, max_swap_attempts + 1):
                                swap_attempt_used = swap_attempt
                                if swap_attempt > 1:
                                    record_run_log(
                                        stage="swap",
                                        event="stablecoin_swap_retry_started",
                                        status="started",
                                        message=(
                                            f"Retrying {wrapped_native_symbol} to {token_out['symbol']} swap for subwallet {item['address']} "
                                            f"(attempt {swap_attempt}/{max_swap_attempts})."
                                        ),
                                        tx_hash=last_swap_error.tx_hash if last_swap_error else None,
                                        wallet_id=item["wallet_id"],
                                        wallet_address=item["address"],
                                        details={
                                            "token_in": wrapped_native_symbol,
                                            "token_out": token_out["symbol"],
                                            "amount_in_wrapped_native": format_decimal(amount_in),
                                            "attempt": swap_attempt,
                                            "max_attempts": max_swap_attempts,
                                            "previous_error": str(last_swap_error) if last_swap_error else None,
                                            **build_legacy_gas_log_details(swap_gas_pricing),
                                        },
                                    )

                                try:
                                    swap_receipt = swap_weth_to_token_from_wallet(
                                        web3_client,
                                        chain=template_chain,
                                        wallet_address=sub_wallet["address"],
                                        private_key=sub_wallet["private_key"],
                                        token_out=token_out,
                                        amount_in=amount_in,
                                        fee_tier=template.get("fee_tier"),
                                        slippage_percent=template.get("slippage_percent"),
                                        prepared_quote=prepared_quote,
                                        nonce=subwallet_nonce,
                                        gas_price_wei=swap_gas_price_wei,
                                        wait_timeout=get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_SWAP),
                                    )
                                    break
                                except WalletTransactionError as exc:
                                    last_swap_error = exc
                                    if exc.retryable:
                                        swap_receipt = recover_swap_after_timeout(
                                            web3_client,
                                            wallet_address=sub_wallet["address"],
                                            token_out=token_out,
                                            tx_hash=exc.tx_hash,
                                            nonce=subwallet_nonce,
                                            gas_price_wei=exc.gas_price_wei,
                                            swap_details=exc.details,
                                        )
                                        if swap_receipt:
                                            record_run_log(
                                                stage="swap",
                                                event="stablecoin_swap_recovered_after_timeout",
                                                status="confirmed",
                                                message=(
                                                    f"{wrapped_native_symbol} to {token_out['symbol']} swap for subwallet {item['address']} "
                                                    f"was recovered after the receipt timeout."
                                                ),
                                                tx_hash=exc.tx_hash,
                                                wallet_id=item["wallet_id"],
                                                wallet_address=item["address"],
                                                details={
                                                    "token_in": wrapped_native_symbol,
                                                    "token_out": token_out["symbol"],
                                                    "amount_in_wrapped_native": format_decimal(amount_in),
                                                    "attempt": swap_attempt,
                                                    "max_attempts": max_swap_attempts,
                                                    "confirmation_source": swap_receipt.get("confirmation_source") or "receipt",
                                                    **build_legacy_gas_log_details(swap_gas_pricing),
                                                },
                                            )
                                            break

                                        if swap_attempt < max_swap_attempts:
                                            swap_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                                                web3_client,
                                                chain=template_chain,
                                                tx_stage=LEGACY_GAS_STAGE_SWAP,
                                                attempt=swap_attempt + 1,
                                                previous_gas_price_wei=exc.gas_price_wei,
                                            )
                                            swap_gas_price_wei = int(swap_gas_pricing["submitted_gas_price_wei"])
                                            record_run_log(
                                                stage="swap",
                                                event="stablecoin_swap_retry_scheduled",
                                                status="started",
                                                message=(
                                                    f"Swap attempt {swap_attempt}/{max_swap_attempts} for {token_out['symbol']} "
                                                    f"timed out on subwallet {item['address']}. Retrying with a higher gas price."
                                                ),
                                                tx_hash=exc.tx_hash,
                                                wallet_id=item["wallet_id"],
                                                wallet_address=item["address"],
                                                details={
                                                    "token_in": wrapped_native_symbol,
                                                    "token_out": token_out["symbol"],
                                                    "amount_in_wrapped_native": format_decimal(amount_in),
                                                    "attempt": swap_attempt,
                                                    "max_attempts": max_swap_attempts,
                                                    "replacement_nonce": subwallet_nonce,
                                                    **build_legacy_gas_log_details(swap_gas_pricing),
                                                },
                                            )
                                            continue
                                    raise

                            if not swap_receipt:
                                raise last_swap_error or RuntimeError(f"{wrapped_native_symbol} to {token_out['symbol']} swap did not produce a confirmation")

                            subwallet_nonce += 1
                            amount_out = parse_decimal_amount(swap_receipt["amount_out"] or "0", "amount_out")
                            item["swap_transactions"].append(
                                {
                                    "backend": swap_receipt.get("backend"),
                                    "route_type": swap_receipt.get("route_type"),
                                    "path_symbols": swap_receipt.get("path_symbols"),
                                    "path_addresses": swap_receipt.get("path_addresses"),
                                    "path_fee_tiers": swap_receipt.get("path_fee_tiers"),
                                    "token_symbol": token_out["symbol"],
                                    "token_address": token_out["address"],
                                    "amount_in": format_decimal(amount_in),
                                    "amount_out": swap_receipt["amount_out"],
                                    "min_amount_out": swap_receipt["min_amount_out"],
                                    "fee_tier": swap_receipt["fee_tier"],
                                    "tx_hash": swap_receipt["tx_hash"],
                                    "status": swap_receipt["status"],
                                    "source": swap_receipt["source"],
                                    "attempts": swap_attempt_used,
                                    "confirmation_source": swap_receipt.get("confirmation_source"),
                                }
                            )
                            item["status"] = "swapped"
                            successful_swaps_for_wallet += 1
                            swap_success_count += 1
                            record_run_log(
                                stage="swap",
                                event="stablecoin_swap_confirmed",
                                status="confirmed",
                                message=f"Swapped {wrapped_native_symbol} into {token_out['symbol']} for subwallet {item['address']}.",
                                tx_hash=swap_receipt["tx_hash"],
                                wallet_id=item["wallet_id"],
                                wallet_address=item["address"],
                                movement={
                                    "action": "swap",
                                    "asset": token_out["symbol"],
                                    "amount": swap_receipt["amount_out"],
                                    "from_address": item["address"],
                                    "to_address": item["address"],
                                },
                                details={
                                    "backend": swap_receipt.get("backend"),
                                    "route_type": swap_receipt.get("route_type"),
                                    "path_symbols": swap_receipt.get("path_symbols"),
                                    "path_fee_tiers": swap_receipt.get("path_fee_tiers"),
                                    "token_in": wrapped_native_symbol,
                                    "token_out": token_out["symbol"],
                                    "amount_in_wrapped_native": format_decimal(amount_in),
                                    "amount_out": swap_receipt["amount_out"],
                                    "min_amount_out": swap_receipt["min_amount_out"],
                                    "fee_tier": swap_receipt["fee_tier"],
                                    "attempt": swap_attempt_used,
                                    "max_attempts": max_swap_attempts,
                                    "confirmation_source": swap_receipt.get("confirmation_source") or "receipt",
                                    **build_legacy_gas_log_details(swap_gas_pricing),
                                },
                            )
                            if amount_out > 0 and int(swap_receipt["amount_out_units"]) > 0:
                                successful_swap_outputs.append(
                                    {
                                        "source": "stablecoin_swap",
                                        "source_tx_hash": swap_receipt["tx_hash"],
                                        "amount_in": format_decimal(amount_in),
                                        "token": token_out,
                                        "amount": amount_out,
                                        "amount_units": int(swap_receipt["amount_out_units"]),
                                    }
                                )
                            else:
                                record_run_log(
                                    stage="distribution",
                                    event="managed_token_distributor_target_skipped",
                                    status="skipped",
                                    message=f"Skipped distributor deployment for {token_out['symbol']} on subwallet {item['address']} because the swap returned no transferable output.",
                                    wallet_id=item["wallet_id"],
                                    wallet_address=item["address"],
                                    tx_hash=swap_receipt["tx_hash"],
                                )
                        except Exception as exc:
                            swap_failure_count += 1
                            subwallet_errors.append(str(exc))
                            failed_tx_hash = exc.tx_hash if isinstance(exc, WalletTransactionError) else None
                            item["swap_transactions"].append(
                                {
                                    "backend": None,
                                    "route_type": None,
                                    "path_symbols": None,
                                    "path_addresses": None,
                                    "path_fee_tiers": None,
                                    "token_symbol": token_out["symbol"],
                                    "token_address": token_out["address"],
                                    "amount_in": format_decimal(amount_in),
                                    "amount_out": None,
                                    "min_amount_out": None,
                                    "fee_tier": template.get("fee_tier"),
                                    "tx_hash": failed_tx_hash,
                                    "status": "failed",
                                    "error": str(exc),
                                }
                            )
                            record_run_log(
                                stage="swap",
                                event="stablecoin_swap_failed",
                                status="failed",
                                message=f"Stablecoin swap into {token_out['symbol']} failed for subwallet {item['address']}: {exc}",
                                wallet_id=item["wallet_id"],
                                wallet_address=item["address"],
                                tx_hash=failed_tx_hash,
                                details={
                                    "token_in": wrapped_native_symbol,
                                    "token_out": token_out["symbol"],
                                    "amount_in_wrapped_native": format_decimal(amount_in),
                                },
                            )

                deployment_targets = successful_swap_outputs[:] if not abort_wallet_execution else []
                if distributor_amount > 0 and recipient_address and not abort_wallet_execution:
                    deployment_targets.append(
                        {
                            "source": "direct_weth",
                            "source_tx_hash": main_wallet_direct_weth_source_tx_hash,
                            "amount_in": format_decimal(distributor_amount),
                            "token": resolve_token(wrapped_native_address, template_chain),
                            "amount": distributor_amount,
                            "amount_units": decimal_to_wei(distributor_amount),
                            "funding_asset_kind": "erc20",
                            "funding_wallet_kind": "main_wallet",
                        }
                    )
                if direct_contract_native_eth_per_wallet > 0 and recipient_address and not abort_wallet_execution:
                    deployment_targets.append(
                        {
                            "source": "direct_native_eth",
                            "source_tx_hash": None,
                            "amount_in": format_decimal(direct_contract_native_eth_per_wallet),
                            "token": {
                                "symbol": native_symbol,
                                "name": chain_config["label"],
                                "address": NATIVE_ETH_SENTINEL_ADDRESS,
                                "decimals": 18,
                            },
                            "amount": direct_contract_native_eth_per_wallet,
                            "amount_units": decimal_to_wei(direct_contract_native_eth_per_wallet),
                            "funding_asset_kind": "native_eth",
                            "funding_wallet_kind": "main_wallet",
                        }
                    )

                if should_execute_deployment_flow and not deployment_targets:
                    record_run_log(
                        stage="deployment",
                        event="managed_token_distributor_skipped",
                        status="skipped",
                        message=f"No BatchTreasuryDistributor funding target was produced for subwallet {item['address']}.",
                        wallet_id=item["wallet_id"],
                        wallet_address=item["address"],
                    )
                elif should_execute_deployment_flow:
                    deployment_info = build_deployment_record(item=item)
                    local_funding_target_count = sum(
                        1
                        for target in deployment_targets
                        if (target.get("funding_wallet_kind") or "subwallet") != "main_wallet"
                    )
                    total_funding_target_count = len(deployment_targets)
                    deploy_attempt_used = 0
                    try:
                        planned_wallet_deployment_stage_gas_units = build_planned_wallet_deployment_stage_gas_units(
                            local_funding_target_count=local_funding_target_count,
                            total_funding_target_count=total_funding_target_count,
                        )
                        minimum_deployment_balance_eth = estimate_multi_stage_gas_fee_eth(
                            {
                                LEGACY_GAS_STAGE_RETURN_SWEEP: return_sweep_gas_units_per_wallet,
                                **planned_wallet_deployment_stage_gas_units,
                            }
                        )
                        balance_ready, balance_error = ensure_subwallet_eth_headroom(
                            item,
                            reason="deploy and fund BatchTreasuryDistributor",
                            minimum_balance_eth=minimum_deployment_balance_eth,
                        )
                        if not balance_ready:
                            raise RuntimeError(balance_error or f"Subwallet {native_symbol} headroom check failed")

                        deployment_nonce = web3_client.eth.get_transaction_count(subwallet_address, "pending")
                        deployment_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                            web3_client,
                            chain=template_chain,
                            tx_stage=LEGACY_GAS_STAGE_DEPLOY_TREASURY,
                        )
                        deployment_gas_price_wei = int(deployment_gas_pricing["submitted_gas_price_wei"])
                        deployed = None
                        last_retry_error: WalletTransactionError | None = None
                        max_deploy_attempts = BATCH_TREASURY_DISTRIBUTOR_DEPLOY_MAX_ATTEMPTS
                        deploy_attempt_used = 0

                        for deploy_attempt in range(1, max_deploy_attempts + 1):
                            deploy_attempt_used = deploy_attempt
                            if deploy_attempt == 1:
                                record_run_log(
                                    stage="deployment",
                                    event="managed_token_distributor_deployment_started",
                                    status="started",
                                    message=f"Deploying BatchTreasuryDistributor from subwallet {item['address']}.",
                                    wallet_id=item["wallet_id"],
                                    wallet_address=item["address"],
                                    details={
                                        "funding_target_count": total_funding_target_count,
                                        "attempt": deploy_attempt,
                                        "max_attempts": max_deploy_attempts,
                                        **build_legacy_gas_log_details(deployment_gas_pricing),
                                    },
                                )
                            else:
                                record_run_log(
                                    stage="deployment",
                                    event="managed_token_distributor_deployment_retry_started",
                                    status="started",
                                    message=(
                                        f"Retrying BatchTreasuryDistributor deployment from subwallet {item['address']} "
                                        f"(attempt {deploy_attempt}/{max_deploy_attempts})."
                                    ),
                                    tx_hash=last_retry_error.tx_hash if last_retry_error else None,
                                    wallet_id=item["wallet_id"],
                                    wallet_address=item["address"],
                                    details={
                                        "funding_target_count": total_funding_target_count,
                                        "attempt": deploy_attempt,
                                        "max_attempts": max_deploy_attempts,
                                        "previous_error": str(last_retry_error) if last_retry_error else None,
                                        **build_legacy_gas_log_details(deployment_gas_pricing),
                                    },
                                )

                            try:
                                deployed = deploy_contract_from_wallet(
                                    web3_client,
                                    chain=template_chain,
                                    wallet_address=sub_wallet["address"],
                                    private_key=sub_wallet["private_key"],
                                    abi=distributor_interface["abi"],
                                    bytecode=distributor_interface["bytecode"],
                                    constructor_args=[],
                                    nonce=deployment_nonce,
                                    gas_price_wei=deployment_gas_price_wei,
                                    wait_timeout=get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_DEPLOY_TREASURY),
                                    gas_limit=BATCH_TREASURY_DISTRIBUTOR_DEPLOY_GAS_LIMIT,
                                )
                                break
                            except WalletTransactionError as exc:
                                last_retry_error = exc
                                if exc.retryable:
                                    deployed = recover_deployment_after_timeout(
                                        web3_client,
                                        deployer_address=sub_wallet["address"],
                                        nonce=deployment_nonce,
                                        tx_hash=exc.tx_hash,
                                        gas_price_wei=exc.gas_price_wei,
                                        grace_seconds=BATCH_TREASURY_DISTRIBUTOR_DEPLOY_POST_TIMEOUT_GRACE_SECONDS,
                                        poll_interval_seconds=BATCH_TREASURY_DISTRIBUTOR_DEPLOY_POST_TIMEOUT_POLL_INTERVAL_SECONDS,
                                    )
                                    if deployed:
                                        record_run_log(
                                            stage="deployment",
                                            event="managed_token_distributor_deployment_recovered_after_timeout",
                                            status="completed",
                                            message=(
                                                f"BatchTreasuryDistributor deployment was recovered after the receipt timeout "
                                                f"on subwallet {item['address']}."
                                            ),
                                            tx_hash=exc.tx_hash,
                                            wallet_id=item["wallet_id"],
                                            wallet_address=item["address"],
                                            details={
                                                "contract_address": deployed["contract_address"],
                                                "attempt": deploy_attempt,
                                                "max_attempts": max_deploy_attempts,
                                                "confirmation_source": deployed.get("confirmation_source") or "receipt",
                                                **build_legacy_gas_log_details(deployment_gas_pricing),
                                            },
                                        )
                                        break

                                    if deploy_attempt < max_deploy_attempts:
                                        deployment_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                                            web3_client,
                                            chain=template_chain,
                                            tx_stage=LEGACY_GAS_STAGE_DEPLOY_TREASURY,
                                            attempt=deploy_attempt + 1,
                                            previous_gas_price_wei=exc.gas_price_wei,
                                        )
                                        deployment_gas_price_wei = int(deployment_gas_pricing["submitted_gas_price_wei"])
                                        record_run_log(
                                            stage="deployment",
                                            event="managed_token_distributor_deployment_retry_scheduled",
                                            status="started",
                                            message=(
                                                f"BatchTreasuryDistributor deployment attempt {deploy_attempt}/{max_deploy_attempts} "
                                                f"timed out on subwallet {item['address']}. Retrying with a higher gas price."
                                            ),
                                            tx_hash=exc.tx_hash,
                                            wallet_id=item["wallet_id"],
                                            wallet_address=item["address"],
                                            details={
                                                "attempt": deploy_attempt,
                                                "max_attempts": max_deploy_attempts,
                                                "replacement_nonce": deployment_nonce,
                                                **build_legacy_gas_log_details(deployment_gas_pricing),
                                            },
                                        )
                                        continue
                                raise

                        if not deployed:
                            raise last_retry_error or RuntimeError("BatchTreasuryDistributor deployment did not produce a receipt")

                        deployment_info.update(deployed)
                        deployment_info["deployment_attempts"] = deploy_attempt_used
                        record_run_log(
                            stage="deployment",
                            event="managed_token_distributor_deployed",
                            status="completed",
                            message=f"Deployed BatchTreasuryDistributor from subwallet {item['address']}.",
                            tx_hash=deployed["tx_hash"],
                            wallet_id=item["wallet_id"],
                            wallet_address=item["address"],
                            details={
                                "contract_address": deployed["contract_address"],
                                "funding_target_count": total_funding_target_count,
                                "attempt": deploy_attempt_used,
                                "max_attempts": max_deploy_attempts,
                                "confirmation_source": deployed.get("confirmation_source") or "receipt",
                                **build_legacy_gas_log_details(deployment_gas_pricing),
                            },
                        )

                        for target in deployment_targets:
                            funding_from_main_wallet = (target.get("funding_wallet_kind") or "subwallet") == "main_wallet"
                            funding_wallet_address = main_wallet["address"] if funding_from_main_wallet else sub_wallet["address"]
                            funding_private_key = main_wallet["private_key"] if funding_from_main_wallet else sub_wallet["private_key"]
                            funding_receipt = None
                            funding_attempt_used = 0
                            last_funding_error: WalletTransactionError | None = None
                            if funding_from_main_wallet:
                                if sender is None:
                                    sender = Web3.to_checksum_address(main_wallet["address"])
                                if main_wallet_nonce is None:
                                    main_wallet_nonce = web3_client.eth.get_transaction_count(sender, "pending")
                                funding_nonce = main_wallet_nonce
                            else:
                                funding_nonce = web3_client.eth.get_transaction_count(subwallet_address, "pending")
                            funding_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                                web3_client,
                                chain=template_chain,
                                tx_stage=LEGACY_GAS_STAGE_FUND_TREASURY,
                            )
                            funding_gas_price_wei = int(funding_gas_pricing["submitted_gas_price_wei"])

                            try:
                                for funding_attempt in range(1, TOKEN_TRANSFER_MAX_ATTEMPTS + 1):
                                    funding_attempt_used = funding_attempt
                                    try:
                                        if (target.get("funding_asset_kind") or "erc20") == "native_eth":
                                            funding_receipt = transfer_native_eth_from_wallet(
                                                web3_client,
                                                chain=template_chain,
                                                wallet_address=funding_wallet_address,
                                                private_key=funding_private_key,
                                                recipient_address=deployed["contract_address"],
                                                amount_wei=int(target["amount_units"]),
                                                nonce=funding_nonce,
                                                gas_price_wei=funding_gas_price_wei,
                                                tx_stage=LEGACY_GAS_STAGE_FUND_TREASURY,
                                                wait_timeout=get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_FUND_TREASURY),
                                            )
                                        else:
                                            funding_receipt = transfer_token_from_wallet(
                                                web3_client,
                                                token_address=target["token"]["address"],
                                                chain=template_chain,
                                                wallet_address=funding_wallet_address,
                                                private_key=funding_private_key,
                                                recipient_address=deployed["contract_address"],
                                                amount_units=int(target["amount_units"]),
                                                nonce=funding_nonce,
                                                gas_price_wei=funding_gas_price_wei,
                                                tx_stage=LEGACY_GAS_STAGE_FUND_TREASURY,
                                                wait_timeout=get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_FUND_TREASURY),
                                            )
                                        break
                                    except WalletTransactionError as exc:
                                        last_funding_error = exc
                                        if exc.retryable:
                                            if (target.get("funding_asset_kind") or "erc20") == "native_eth":
                                                funding_receipt = recover_native_eth_transfer_after_timeout(
                                                    web3_client,
                                                    recipient_address=deployed["contract_address"],
                                                    amount_wei=int(target["amount_units"]),
                                                    recipient_balance_before_wei=int(exc.details.get("recipient_balance_before_wei") or 0),
                                                    tx_hash=exc.tx_hash,
                                                    nonce=funding_nonce,
                                                    gas_price_wei=exc.gas_price_wei,
                                                )
                                            else:
                                                funding_receipt = recover_token_transfer_after_timeout(
                                                    web3_client,
                                                    token_address=target["token"]["address"],
                                                    recipient_address=deployed["contract_address"],
                                                    amount_units=int(target["amount_units"]),
                                                    token_decimals=int(exc.details.get("token_decimals") or target["token"]["decimals"]),
                                                    recipient_balance_before=int(exc.details.get("recipient_balance_before") or 0),
                                                    tx_hash=exc.tx_hash,
                                                    nonce=funding_nonce,
                                                    gas_price_wei=exc.gas_price_wei,
                                                )
                                            if funding_receipt:
                                                break
                                            if funding_attempt < TOKEN_TRANSFER_MAX_ATTEMPTS:
                                                funding_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                                                    web3_client,
                                                    chain=template_chain,
                                                    tx_stage=LEGACY_GAS_STAGE_FUND_TREASURY,
                                                    attempt=funding_attempt + 1,
                                                    previous_gas_price_wei=exc.gas_price_wei,
                                                )
                                                funding_gas_price_wei = int(funding_gas_pricing["submitted_gas_price_wei"])
                                                continue
                                        raise

                                if not funding_receipt:
                                    raise last_funding_error or RuntimeError("BatchTreasuryDistributor funding transfer did not produce a confirmation")
                                if funding_from_main_wallet:
                                    main_wallet_nonce = funding_nonce + 1

                                asset_record = {
                                    "token_symbol": target["token"]["symbol"],
                                    "token_address": target["token"]["address"],
                                    "amount": format_decimal(target["amount"]),
                                    "amount_units": int(target["amount_units"]),
                                    "funding_asset_kind": target.get("funding_asset_kind") or "erc20",
                                    "funding_wallet_kind": target.get("funding_wallet_kind") or "subwallet",
                                    "funding_tx_hash": funding_receipt["tx_hash"],
                                    "source": target["source"],
                                    "source_tx_hash": target["source_tx_hash"],
                                }
                                deployment_info["funded_assets"].append(asset_record)
                                deployment_info["funding_tx_hashes"].append(funding_receipt["tx_hash"])
                                deployment_info["funding_tx_hash"] = funding_receipt["tx_hash"]
                                deployment_info["funding_status"] = "completed"
                                deployment_info["funding_attempts"] = max(
                                    int(deployment_info.get("funding_attempts") or 0),
                                    funding_attempt_used,
                                )
                                if deployment_info["token_symbol"] is None:
                                    deployment_info["token_symbol"] = target["token"]["symbol"]
                                    deployment_info["token_address"] = target["token"]["address"]
                                    deployment_info["amount"] = format_decimal(target["amount"])

                                contract_funding_success_count += 1
                                record_run_log(
                                    stage="distribution",
                                    event="managed_token_distributor_funded",
                                    status="confirmed",
                                    message=f"Transferred {target['token']['symbol']} into BatchTreasuryDistributor for subwallet {item['address']}.",
                                    tx_hash=funding_receipt["tx_hash"],
                                    wallet_id=item["wallet_id"],
                                    wallet_address=item["address"],
                                    movement={
                                        "action": "transfer",
                                        "asset": target["token"]["symbol"],
                                        "amount": format_decimal(target["amount"]),
                                        "from_address": funding_wallet_address,
                                        "to_address": deployed["contract_address"],
                                    },
                                    details={
                                        "contract_address": deployed["contract_address"],
                                        "source": target["source"],
                                        "funding_asset_kind": target.get("funding_asset_kind") or "erc20",
                                        "funding_wallet_kind": target.get("funding_wallet_kind") or "subwallet",
                                        **build_legacy_gas_log_details(funding_gas_pricing),
                                    },
                                )
                            except Exception as exc:
                                contract_funding_failure_count += 1
                                subwallet_errors.append(str(exc))
                                deployment_info["status"] = "partial"
                                deployment_info["funding_status"] = "failed"
                                deployment_info["funding_attempts"] = max(
                                    int(deployment_info.get("funding_attempts") or 0),
                                    int(funding_attempt_used or 0),
                                    1,
                                )
                                if isinstance(exc, WalletTransactionError):
                                    deployment_info["funding_tx_hash"] = exc.tx_hash or deployment_info.get("funding_tx_hash")
                                record_run_log(
                                    stage="distribution",
                                    event="managed_token_distributor_funding_failed",
                                    status="failed",
                                    message=(
                                        f"BatchTreasuryDistributor funding failed for {target['token']['symbol']} "
                                        f"on subwallet {item['address']}: {exc}"
                                    ),
                                    wallet_id=item["wallet_id"],
                                    wallet_address=item["address"],
                                    tx_hash=deployment_info.get("funding_tx_hash"),
                                    details={
                                        "token_symbol": target["token"]["symbol"],
                                        "contract_address": deployment_info.get("contract_address"),
                                        "attempts": deployment_info.get("funding_attempts"),
                                        **build_legacy_gas_log_details(funding_gas_pricing),
                                    },
                                )

                        record_run_log(
                            stage="distribution",
                            event="managed_token_distributor_initialized",
                            status="skipped",
                            message=(
                                f"No separate initialize call is required for BatchTreasuryDistributor "
                                f"on subwallet {item['address']}."
                            ),
                            wallet_id=item["wallet_id"],
                            wallet_address=item["address"],
                            details={
                                "contract_address": deployed["contract_address"],
                                "funded_asset_count": len(deployment_info["funded_assets"]),
                            },
                        )

                        deployment_info["status"] = (
                            "completed" if deployment_info["funded_assets"] and deployment_info.get("funding_status") != "failed" else
                            "partial" if deployment_info["funded_assets"] else
                            "failed"
                        )
                        item["deployed_contracts"].append(deployment_info)
                        item["deployed_contract"] = item["deployed_contract"] or deployment_info
                        deployed_contracts.append(deployment_info)
                        if deployment_info["funded_assets"]:
                            completed_deployments_for_wallet += 1
                            deployment_success_count += 1

                        if test_auto_execute_after_funding and deployment_info["funded_assets"]:
                            execute_attempt_used = 0
                            try:
                                minimum_execute_balance_eth = estimate_multi_stage_gas_fee_eth(
                                    {
                                        LEGACY_GAS_STAGE_BATCH_SEND: (
                                            BATCH_TREASURY_DISTRIBUTOR_BATCH_SEND_BASE_GAS_LIMIT
                                            + (BATCH_TREASURY_DISTRIBUTOR_BATCH_SEND_PER_ENTRY_GAS_LIMIT * len(deployment_info["funded_assets"]))
                                        ),
                                        LEGACY_GAS_STAGE_RETURN_SWEEP: return_sweep_gas_units_per_wallet,
                                    }
                                )
                                balance_ready, balance_error = ensure_subwallet_eth_headroom(
                                    item,
                                    reason="batchSend the funded treasury assets",
                                    minimum_balance_eth=minimum_execute_balance_eth,
                                )
                                if not balance_ready:
                                    raise RuntimeError(balance_error or f"Subwallet {native_symbol} headroom check failed")

                                recipients = [recipient_address] * len(deployment_info["funded_assets"])
                                eth_amounts = [
                                    int(asset["amount_units"]) if asset["funding_asset_kind"] == "native_eth" else 0
                                    for asset in deployment_info["funded_assets"]
                                ]
                                tokens = [asset["token_address"] for asset in deployment_info["funded_assets"]]
                                token_amounts = [
                                    int(asset["amount_units"]) if asset["funding_asset_kind"] != "native_eth" else 0
                                    for asset in deployment_info["funded_assets"]
                                ]
                                execution_nonce = web3_client.eth.get_transaction_count(subwallet_address, "pending")
                                execution_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                                    web3_client,
                                    chain=template_chain,
                                    tx_stage=LEGACY_GAS_STAGE_BATCH_SEND,
                                )
                                execution_gas_price_wei = int(execution_gas_pricing["submitted_gas_price_wei"])
                                execution_receipt = None
                                last_execute_error: WalletTransactionError | None = None
                                max_execute_attempts = BATCH_TREASURY_DISTRIBUTOR_BATCH_SEND_MAX_ATTEMPTS

                                for execute_attempt in range(1, max_execute_attempts + 1):
                                    execute_attempt_used = execute_attempt
                                    try:
                                        execution_receipt = execute_batch_treasury_distributor_batch_send_from_wallet(
                                            web3_client,
                                            chain=template_chain,
                                            contract_address=deployed["contract_address"],
                                            wallet_address=sub_wallet["address"],
                                            private_key=sub_wallet["private_key"],
                                            abi=distributor_interface["abi"],
                                            recipients=recipients,
                                            eth_amounts=eth_amounts,
                                            tokens=tokens,
                                            token_amounts=token_amounts,
                                            nonce=execution_nonce,
                                            gas_price_wei=execution_gas_price_wei,
                                            wait_timeout=get_legacy_gas_stage_pending_timeout_seconds(LEGACY_GAS_STAGE_BATCH_SEND),
                                        )
                                        break
                                    except WalletTransactionError as exc:
                                        last_execute_error = exc
                                        if exc.retryable:
                                            execution_receipt = recover_batch_treasury_distributor_batch_send_after_timeout(
                                                web3_client,
                                                tx_hash=exc.tx_hash,
                                                nonce=execution_nonce,
                                                gas_price_wei=exc.gas_price_wei,
                                            )
                                            if execution_receipt:
                                                break
                                            if execute_attempt < max_execute_attempts:
                                                execution_gas_pricing = resolve_legacy_aggressive_gas_pricing(
                                                    web3_client,
                                                    chain=template_chain,
                                                    tx_stage=LEGACY_GAS_STAGE_BATCH_SEND,
                                                    attempt=execute_attempt + 1,
                                                    previous_gas_price_wei=exc.gas_price_wei,
                                                )
                                                execution_gas_price_wei = int(execution_gas_pricing["submitted_gas_price_wei"])
                                                continue
                                        raise

                                if not execution_receipt:
                                    raise last_execute_error or RuntimeError("BatchTreasuryDistributor batchSend() did not produce a confirmation")

                                deployment_info["execution_tx_hash"] = execution_receipt["tx_hash"]
                                deployment_info["execution_status"] = "completed"
                                deployment_info["execution_attempts"] = execute_attempt_used
                                item["contract_execution_transactions"].append(
                                    {
                                        "contract_address": deployed["contract_address"],
                                        "token_symbol": "BATCH",
                                        "recipient_address": recipient_address,
                                        "tx_hash": execution_receipt["tx_hash"],
                                        "status": execution_receipt["status"],
                                        "attempts": execute_attempt_used,
                                        "confirmation_source": execution_receipt.get("confirmation_source"),
                                    }
                                )
                                contract_execute_success_count += 1
                                record_run_log(
                                    stage="distribution",
                                    event="managed_token_distributor_execute_confirmed",
                                    status="confirmed",
                                    message=(
                                        f"Testing mode: executed BatchTreasuryDistributor batchSend() "
                                        f"from subwallet {item['address']}."
                                    ),
                                    tx_hash=execution_receipt["tx_hash"],
                                    wallet_id=item["wallet_id"],
                                    wallet_address=item["address"],
                                    details={
                                        "contract_address": deployed["contract_address"],
                                        "recipient_address": recipient_address,
                                        "funded_asset_count": len(deployment_info["funded_assets"]),
                                        "attempt": execute_attempt_used,
                                        "max_attempts": max_execute_attempts,
                                        "confirmation_source": execution_receipt.get("confirmation_source") or "receipt",
                                        **build_legacy_gas_log_details(execution_gas_pricing),
                                    },
                                )
                            except Exception as exc:
                                deployment_info["execution_status"] = "failed"
                                deployment_info["execution_error"] = str(exc)
                                deployment_info["execution_attempts"] = max(
                                    int(deployment_info.get("execution_attempts") or 0),
                                    int(execute_attempt_used or 0),
                                    1,
                                )
                                deployment_info["execution_tx_hash"] = (
                                    exc.tx_hash if isinstance(exc, WalletTransactionError) else deployment_info.get("execution_tx_hash")
                                )
                                item["contract_execution_transactions"].append(
                                    {
                                        "contract_address": deployed["contract_address"],
                                        "token_symbol": "BATCH",
                                        "recipient_address": recipient_address,
                                        "tx_hash": deployment_info.get("execution_tx_hash"),
                                        "status": "failed",
                                        "error": str(exc),
                                    }
                                )
                                contract_execute_failure_count += 1
                                execution_failure_count += 1
                                subwallet_errors.append(str(exc))
                                record_run_log(
                                    stage="distribution",
                                    event="managed_token_distributor_execute_failed",
                                    status="failed",
                                    message=(
                                        f"Testing mode batchSend() failed on subwallet {item['address']}: {exc}"
                                    ),
                                    tx_hash=deployment_info.get("execution_tx_hash"),
                                    wallet_id=item["wallet_id"],
                                    wallet_address=item["address"],
                                    details={
                                        "contract_address": deployed["contract_address"],
                                        "recipient_address": recipient_address,
                                        "return_wallet_address": return_wallet_address,
                                        "attempts": deployment_info.get("execution_attempts"),
                                    },
                                )
                    except Exception as exc:
                        if isinstance(exc, WalletTransactionError):
                            deployment_info["tx_hash"] = exc.tx_hash
                        deployment_info["error"] = str(exc)
                        deployment_info["deployment_attempts"] = max(
                            int(deployment_info.get("deployment_attempts") or 0),
                            int(deploy_attempt_used or 0),
                            1,
                        )
                        deployment_info["status"] = "failed"
                        item["deployed_contracts"].append(deployment_info)
                        item["deployed_contract"] = item["deployed_contract"] or deployment_info
                        deployed_contracts.append(deployment_info)
                        subwallet_errors.append(str(exc))
                        deployment_failures.append(str(exc))
                        record_run_log(
                            stage="deployment",
                            event="managed_token_distributor_deployment_failed",
                            status="failed",
                            message=f"BatchTreasuryDistributor deployment failed on subwallet {item['address']}: {exc}",
                            wallet_id=item["wallet_id"],
                            wallet_address=item["address"],
                            tx_hash=deployment_info.get("tx_hash"),
                            details={
                                "attempts": deployment_info.get("deployment_attempts"),
                            },
                        )

                if return_wallet_address:
                    try:
                        sweep_subwallet_leftovers(item, sub_wallet=sub_wallet)
                    except Exception as exc:
                        subwallet_errors.append(str(exc))

                if subwallet_errors:
                    item["status"] = "partial" if (
                        item["funding_transactions"].get("eth")
                        or item["wrap_transaction"]
                        or successful_swaps_for_wallet
                        or completed_deployments_for_wallet
                        or has_successful_return_sweep(item)
                    ) else "failed"
                elif has_successful_return_sweep(item):
                    item["status"] = "returned"
                elif completed_deployments_for_wallet or successful_swaps_for_wallet:
                    item["status"] = "completed"
                elif item["top_up_transactions"]:
                    item["status"] = "topped_up"
                elif item["wrap_transaction"]:
                    item["status"] = "wrapped"
                elif item["funding_transactions"].get("eth"):
                    item["status"] = "funded"
                else:
                    item["status"] = item.get("status") or "created"
            except Exception as exc:
                recovery_sweep_attempted = False
                recovery_sweep_error = None
                if return_wallet_address and sub_wallet:
                    recovery_sweep_attempted = True
                    try:
                        sweep_subwallet_leftovers(item, sub_wallet=sub_wallet)
                    except Exception as sweep_exc:
                        recovery_sweep_error = sweep_exc

                item["status"] = "partial" if has_successful_return_sweep(item) else "failed"
                execution_failure_count += 1
                record_run_log(
                    stage="run",
                    event="subwallet_execution_failed",
                    status="failed",
                    message=f"Subwallet automation failed for {item['address']}: {exc}",
                    wallet_id=item["wallet_id"],
                    wallet_address=item["address"],
                    details={
                        "return_wallet_address": return_wallet_address,
                        "auto_return_sweep_attempted": recovery_sweep_attempted,
                        "auto_return_sweep_error": str(recovery_sweep_error) if recovery_sweep_error else None,
                    },
                )

        if (
            deployment_failures
            or swap_failure_count
            or approval_failure_count
            or contract_funding_failure_count
            or top_up_failure_count
            or contract_execute_failure_count
            or return_sweep_failure_count
            or execution_failure_count
        ):
            error_message = error_message or (
                "Automation finished with "
                f"{approval_failure_count} approval failure(s), "
                f"{swap_failure_count} swap failure(s), and "
                f"{len(deployment_failures)} deployment failure(s), "
                f"{contract_funding_failure_count} contract funding failure(s), "
                f"{contract_execute_failure_count} test batch send failure(s), "
                f"{top_up_failure_count} auto top-up failure(s), and "
                f"{return_sweep_failure_count} return sweep failure(s), and "
                f"{execution_failure_count} execution failure(s)."
            )
            successful_activity = (
                funding_submitted_transaction_count
                + subwallet_wrap_count
                + top_up_success_count
                + contract_execute_success_count
                + return_sweep_success_count
                + approval_success_count
                + swap_success_count
                + deployment_success_count
                + contract_funding_success_count
            )
            status = "partial" if successful_activity > 0 else "failed"
        else:
            status = "completed"
    elif should_execute_deployment_flow:
        record_run_log(
            stage="deployment",
            event="managed_token_distributor_skipped",
            status="skipped",
            message="Skipped BatchTreasuryDistributor deployment because funding did not complete cleanly.",
        )
    else:
        record_run_log(
            stage="deployment",
            event="managed_token_distributor_skipped",
            status="skipped",
            message=deployment_disabled_message,
            details={
                "recipient_address_present": bool(recipient_address),
                "stablecoin_route_count": len(stablecoin_routes),
                "direct_contract_native_eth_per_contract": format_decimal(direct_contract_native_eth_per_wallet),
                "direct_contract_weth_per_contract": format_decimal(distributor_amount),
            },
        )

    if not error_message and not needs_onchain_funding and not should_execute_deployment_flow and not stablecoin_routes:
        status = "completed"

    contract_execution = build_contract_execution_snapshot(
        main_wallet={
            "id": main_id,
            "address": main_wallet["address"],
            "type": main_wallet["type"],
        },
        template=template,
        sub_wallets=created_sub_wallets,
    )
    record_run_log(
        stage="run",
        event="run_snapshot_recorded",
        status="completed",
        message="Saved the run snapshot and wallet batch details.",
        details={
            "run_status": status,
            "subwallet_count": len(created_sub_wallets),
            "funding_submitted_transaction_count": funding_submitted_transaction_count,
            "subwallet_wrap_count": subwallet_wrap_count,
            "top_up_success_count": top_up_success_count,
            "top_up_failure_count": top_up_failure_count,
            "contract_execute_success_count": contract_execute_success_count,
            "contract_execute_failure_count": contract_execute_failure_count,
            "return_sweep_success_count": return_sweep_success_count,
            "return_sweep_failure_count": return_sweep_failure_count,
            "execution_failure_count": execution_failure_count,
            "approval_success_count": approval_success_count,
            "approval_failure_count": approval_failure_count,
            "swap_success_count": swap_success_count,
            "swap_failure_count": swap_failure_count,
            "deployed_contract_count": deployment_success_count,
            "contract_funding_success_count": contract_funding_success_count,
            "contract_funding_failure_count": contract_funding_failure_count,
        },
    )
    record_run_log(
        stage="run",
        event="run_finished",
        status=status,
        message=(
            f"Run finished with status {status}."
            if not error_message
            else f"Run finished with status {status}: {error_message}"
        ),
        details={
            "error": error_message,
            "funding_submitted_transaction_count": funding_submitted_transaction_count,
            "subwallet_wrap_count": subwallet_wrap_count,
            "top_up_success_count": top_up_success_count,
            "top_up_failure_count": top_up_failure_count,
            "contract_execute_success_count": contract_execute_success_count,
            "contract_execute_failure_count": contract_execute_failure_count,
            "return_sweep_success_count": return_sweep_success_count,
            "return_sweep_failure_count": return_sweep_failure_count,
            "execution_failure_count": execution_failure_count,
            "approval_success_count": approval_success_count,
            "approval_failure_count": approval_failure_count,
            "swap_success_count": swap_success_count,
            "swap_failure_count": swap_failure_count,
            "deployed_contract_count": deployment_success_count,
            "deployment_failure_count": len(deployment_failures),
            "contract_funding_success_count": contract_funding_success_count,
            "contract_funding_failure_count": contract_funding_failure_count,
        },
    )

    run_record = {
        "id": run_id,
        "main_wallet_id": main_id,
        "main_wallet_address": main_wallet["address"],
        "main_wallet_type": main_wallet["type"],
        "template_id": template["id"],
        "template_name": template["name"],
        "contract_count": count,
        "status": status,
        "created_at": created_at,
        "error": error_message,
        "preview": preview,
        "funding_fee_estimate": funding_fee_estimate,
        "wrap_transaction": wrap_transaction,
        "contract_execution": contract_execution,
        "deployed_contracts": deployed_contracts,
        "run_logs": run_logs,
        "sub_wallets": run_sub_wallets,
    }
    return db.upsert_wallet_run(run_record)

def store_wallet(wallet_id: str, data: dict, wallet_type: str = 'sub', parent_id: str = None):
    encrypted_key = data['encrypted_seed'] if wallet_type == 'main' else data['encrypted_key']
    derivation_index = _parse_derivation_index(data.get("derivation_index", data.get("index")))
    _persist_wallet_record(
        {
            "id": wallet_id,
            "type": wallet_type,
            "address": data["address"],
            "encrypted_key": encrypted_key,
            "parent_id": parent_id,
            "created_at": datetime.now(),
            "derivation_index": derivation_index,
        }
    )
    print(f"Stored {wallet_type} wallet: {wallet_id}, parent: {parent_id}")

def get_wallet_record(wallet_id: str):
    db.connect_keyspace()
    query = "SELECT * FROM wallets WHERE id = %s"
    rows = db.session.execute(query, (wallet_id,))
    row = rows.one()
    return dict(row._asdict()) if row else None

def list_wallet_records(parent_id: str):
    db.connect_keyspace()
    query = "SELECT * FROM wallets WHERE parent_id = %s ALLOW FILTERING"
    rows = db.session.execute(query, (parent_id,))
    return [dict(row._asdict()) for row in rows.all()]


def list_saved_wallets(chain: str | None = None):
    db.connect_keyspace()
    rows = db.session.execute("SELECT * FROM wallets")
    wallet_records = [dict(row._asdict()) for row in rows.all()]
    root_wallets = [
        record
        for record in wallet_records
        if record.get("parent_id") in (None, "") and record.get("type") in {"main", "imported_private_key"}
    ]
    root_wallets.sort(key=lambda record: str(record.get("created_at") or ""), reverse=True)
    return [
        serialize_wallet_record(
            record,
            chain=chain or record.get("chain"),
            include_token_holdings=False,
        )
        for record in root_wallets
    ]


def list_wallet_runs(main_wallet_id: str | None = None):
    return db.list_wallet_runs(main_wallet_id=main_wallet_id)


def delete_wallet_run(run_id: str):
    deleted_run = db.delete_wallet_run(run_id)
    if not deleted_run:
        raise ValueError("Run not found")

    return {
        "id": run_id,
        "deleted": True,
        "main_wallet_id": deleted_run.get("main_wallet_id"),
    }


def export_wallet_keystore(wallet_id: str, access_passphrase: str, export_passphrase: str):
    verify_wallet_access_passphrase(access_passphrase)

    normalized_export_passphrase = (export_passphrase or "").strip()
    if len(normalized_export_passphrase) < 12:
        raise ValueError("Export password must be at least 12 characters.")

    wallet = get_wallet(wallet_id)
    if not wallet:
        raise ValueError("Wallet not found")
    if wallet.get("type") != "sub":
        raise ValueError("Only run-created subwallets can be exported as keystores")

    keystore = Account.encrypt(wallet["private_key"], normalized_export_passphrase)
    return {
        "id": wallet["id"],
        "address": wallet["address"],
        "type": wallet["type"],
        "keystore": keystore,
    }


def delete_wallet(wallet_id: str):
    wallet = get_wallet_record(wallet_id)
    if not wallet:
        raise ValueError("Wallet not found")

    child_records = list_wallet_records(wallet_id)
    for child_record in child_records:
        db.session.execute("DELETE FROM wallets WHERE id = %s", (child_record["id"],))

    db.session.execute("DELETE FROM wallets WHERE id = %s", (wallet_id,))
    deleted_run_count = db.delete_wallet_runs_for_main(wallet_id)
    return {
        "id": wallet_id,
        "deleted": True,
        "deleted_subwallet_count": len(child_records),
        "deleted_run_count": deleted_run_count,
    }

def serialize_wallet_record(
    record: dict,
    index: int | None = None,
    *,
    chain: str | None = None,
    live_balances: bool = True,
    include_token_holdings: bool = False,
    token_holdings_chain: str | None = None,
):
    payload = {
        'id': record['id'],
        'type': record['type'],
        'address': record['address'],
        'parent_id': record.get('parent_id'),
        'created_at': record.get('created_at'),
        **get_wallet_balances(record['address'], chain=chain, live_balances=live_balances),
    }
    if include_token_holdings:
        payload['token_holdings'] = get_wallet_summary_token_holdings(record['address'], chain=token_holdings_chain)
    resolved_index = index if index is not None else _parse_derivation_index(record.get("derivation_index"))
    if resolved_index is not None:
        payload['index'] = resolved_index
    return payload

def get_wallet_details(
    wallet_id: str,
    chain: str | None = None,
    *,
    live_balances: bool = True,
    include_token_holdings: bool = True,
    include_subwallets: bool = True,
):
    wallet = get_wallet_record(wallet_id)
    if not wallet:
        return None

    normalized_chain = normalize_template_chain(chain)
    sub_wallets = []
    if include_subwallets:
        sub_wallet_records = _backfill_child_wallet_derivation_indices(wallet, list_wallet_records(wallet_id))
        sub_wallets = [
            serialize_wallet_record(record, chain=normalized_chain, live_balances=live_balances)
            for record in sub_wallet_records
        ]

    details = serialize_wallet_record(
        wallet,
        chain=normalized_chain,
        live_balances=live_balances,
        include_token_holdings=False,
    )
    details['token_holdings'] = (
        get_wallet_summary_token_holdings(wallet['address'], chain=chain)
        if include_token_holdings
        else []
    )
    details['sub_wallets'] = sub_wallets
    return details


def get_wallet_summary(wallet_id: str, chain: str | None = None):
    """Lightweight wallet fetch: main wallet record + balances only.

    Skips sub-wallet enumeration and token holdings to avoid dozens of
    RPC calls that are unnecessary for operations like template preview.
    """
    wallet = get_wallet_record(wallet_id)
    if not wallet:
        return None
    normalized_chain = normalize_template_chain(chain)
    return serialize_wallet_record(wallet, chain=normalized_chain, include_token_holdings=False)

def get_wallet(wallet_id: str):
    row_dict = get_wallet_record(wallet_id)
    if not row_dict:
        return None
    try:
        if row_dict['type'] == 'main':
            decrypted_mnemonic = decrypt_secret(row_dict['encrypted_key'])
            root_account = Account.from_mnemonic(decrypted_mnemonic, account_path="m/44'/60'/0'/0/0")
            private_key = root_account._key_obj.to_hex()
            row_dict['private_key'] = private_key
        else:
            decrypted_key = decrypt_secret(row_dict['encrypted_key'])
            child_account = Account.from_key(decrypted_key)
            private_key = child_account._key_obj.to_hex()
            row_dict['private_key'] = private_key
    except (InvalidToken, ValueError) as exc:
        raise ValueError(
            "This wallet was encrypted with a different MASTER_PASSPHRASE. Delete it and import it again."
        ) from exc
    return row_dict
