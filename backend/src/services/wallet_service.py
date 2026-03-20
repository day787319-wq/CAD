import base64
import hmac
import json
import os
import re
import zipfile
from uuid import uuid4
from functools import lru_cache
from datetime import datetime
from pathlib import Path
from decimal import Decimal, InvalidOperation, ROUND_DOWN
import xml.etree.ElementTree as ET

from mnemonic import Mnemonic
from eth_account import Account
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from web3 import Web3
from dotenv import load_dotenv

from src.config.database import db

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_PATH)
Account.enable_unaudited_hdwallet_features()

WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'  # Mainnet WETH
UNISWAP_V3_QUOTER_ADDRESS = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6'
UNISWAP_FEE_TIERS = [500, 3000, 10000]
TOKEN_SHEET_NAMESPACE = {'a': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
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
            {"internalType": "address", "name": "tokenIn", "type": "address"},
            {"internalType": "address", "name": "tokenOut", "type": "address"},
            {"internalType": "uint24", "name": "fee", "type": "uint24"},
            {"internalType": "uint256", "name": "amountIn", "type": "uint256"},
            {"internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160"}
        ],
        "name": "quoteExactInputSingle",
        "outputs": [{"internalType": "uint256", "name": "amountOut", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function"
    }
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
ETH_DECIMALS = Decimal("1000000000000000000")
ETH_TRANSFER_GAS_LIMIT = 21_000
WETH_TRANSFER_GAS_LIMIT = 90_000
WETH_DEPOSIT_GAS_LIMIT = 120_000

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

@lru_cache(maxsize=256)
def get_onchain_token_metadata(address: str) -> dict:
    web3_client = get_web3()
    if not web3_client or not web3_client.is_connected():
        raise RuntimeError("Ethereum RPC is unavailable")

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

def resolve_token(identifier: str) -> dict:
    normalized = (identifier or '').strip()
    if not normalized:
        raise ValueError("Token is required")

    token_by_symbol = TOKEN_CONFIG.get(normalized.upper())
    if token_by_symbol:
        return token_by_symbol

    if Web3.is_address(normalized):
        checksum_identifier = Web3.to_checksum_address(normalized)

        for token in TOKEN_CONFIG.values():
            if token['address'].lower() == checksum_identifier.lower():
                return token

        for token in load_external_tokens():
            if token['address'].lower() == checksum_identifier.lower():
                metadata = get_onchain_token_metadata(token['address'])
                return {
                    'symbol': token.get('symbol') or metadata['symbol'],
                    'name': token.get('name') or metadata['name'],
                    'address': metadata['address'],
                    'decimals': metadata['decimals'],
                    'logo_url': token.get('logo_url'),
                }

        metadata = get_onchain_token_metadata(checksum_identifier)
        metadata['logo_url'] = build_logo_url(metadata['address'])
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

def get_web3() -> Web3 | None:
    rpc_url = os.getenv('ETHEREUM_RPC_URL')
    if not rpc_url:
        return None
    return Web3(Web3.HTTPProvider(rpc_url))

def get_weth_balance(address: str, web3_client: Web3 | None = None) -> float | None:
    client = web3_client or get_web3()
    if not client or not client.is_connected():
        return None

    try:
        weth_contract = client.eth.contract(address=WETH_ADDRESS, abi=WETH_ABI)
        balance_wei = weth_contract.functions.balanceOf(address).call()
        balance_eth = client.from_wei(balance_wei, 'ether')
        return float(balance_eth)
    except Exception:
        return None

def get_eth_balance(address: str, web3_client: Web3 | None = None) -> float | None:
    client = web3_client or get_web3()
    if not client or not client.is_connected():
        return None

    try:
        balance_wei = client.eth.get_balance(address)
        balance_eth = client.from_wei(balance_wei, 'ether')
        return float(balance_eth)
    except Exception:
        return None

def get_wallet_balances(address: str) -> dict:
    web3_client = get_web3()
    refreshed_at = datetime.utcnow().isoformat()
    gas_price_gwei = None
    payload = {
        'eth_balance': None,
        'weth_balance': None,
        'weth_address': WETH_ADDRESS,
        'balances_live': False,
        'balance_error': None,
        'balance_refreshed_at': refreshed_at,
        'funding_gas_price_gwei': None,
    }

    if not web3_client:
        payload['balance_error'] = "ETHEREUM_RPC_URL is not configured"
        return payload

    if not web3_client.is_connected():
        payload['balance_error'] = "Ethereum RPC is unavailable"
        return payload

    eth_balance = get_eth_balance(address, web3_client)
    weth_balance = get_weth_balance(address, web3_client)
    try:
        gas_price_gwei = float(web3_client.from_wei(web3_client.eth.gas_price, 'gwei'))
    except Exception:
        gas_price_gwei = None

    payload['eth_balance'] = eth_balance
    payload['weth_balance'] = weth_balance
    payload['funding_gas_price_gwei'] = gas_price_gwei
    payload['balances_live'] = eth_balance is not None and weth_balance is not None
    if not payload['balances_live']:
        payload['balance_error'] = "Failed to fetch live ETH and WETH balances"

    return {
        **payload,
    }


def format_decimal(value: Decimal | None):
    if value is None:
        return None
    if value == 0:
        return "0"
    return format(value.normalize(), "f")


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


def build_transaction_envelope(web3_client: Web3, sender: str, nonce: int, *, gas: int, value: int = 0) -> dict:
    return {
        "chainId": web3_client.eth.chain_id,
        "from": sender,
        "nonce": nonce,
        "gas": gas,
        "gasPrice": web3_client.eth.gas_price,
        "value": value,
    }


def send_signed_transaction(web3_client: Web3, tx: dict, private_key: str) -> str:
    signed = Account.sign_transaction(tx, private_key)
    raw_transaction = getattr(signed, "raw_transaction", None)
    if raw_transaction is None:
        raw_transaction = getattr(signed, "rawTransaction")
    tx_hash = web3_client.eth.send_raw_transaction(raw_transaction)
    return tx_hash.hex()


def wait_for_transaction_success(web3_client: Web3, tx_hash: str, *, timeout: int = 180):
    receipt = web3_client.eth.wait_for_transaction_receipt(tx_hash, timeout=timeout)
    if not receipt or int(receipt.status) != 1:
        raise RuntimeError(f"Transaction failed: {tx_hash}")
    return receipt

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
):
    token_in = resolve_token(token_in_identifier)
    token_out = resolve_token(token_out_identifier)
    token_in_key = token_in['symbol'].upper().strip()
    token_out_key = token_out['symbol'].upper().strip()

    try:
        amount_decimal = Decimal(str(amount_in))
    except (InvalidOperation, TypeError):
        raise ValueError("Invalid amount")

    if amount_decimal <= 0:
        raise ValueError("Amount must be greater than 0")

    web3_client = get_web3()
    if not web3_client or not web3_client.is_connected():
        raise RuntimeError("Ethereum RPC is unavailable")

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
            'token_in': token_in['symbol'],
            'token_out': token_out['symbol'],
            'amount_in': str(amount_decimal),
            'amount_out': str(amount_decimal),
            'min_amount_out': str(amount_decimal),
            'fee_tier': None,
            'source': 'same-token',
            'slippage_percent': format(slippage_decimal.normalize(), 'f'),
        }

    if token_in['address'].lower() == token_out['address'].lower():
        return {
            'token_in': token_in['symbol'],
            'token_out': token_out['symbol'],
            'amount_in': str(amount_decimal),
            'amount_out': str(amount_decimal),
            'min_amount_out': str(amount_decimal),
            'fee_tier': None,
            'source': 'wrapped-native',
            'slippage_percent': format(slippage_decimal.normalize(), 'f'),
        }

    quoter = web3_client.eth.contract(
        address=Web3.to_checksum_address(UNISWAP_V3_QUOTER_ADDRESS),
        abi=UNISWAP_QUOTER_ABI,
    )

    if fee_tier is not None and fee_tier not in UNISWAP_FEE_TIERS:
        raise ValueError("Unsupported fee tier")

    fee_tiers = [fee_tier] if fee_tier is not None else UNISWAP_FEE_TIERS
    best_quote = None
    for current_fee_tier in fee_tiers:
        try:
            amount_out_units = quoter.functions.quoteExactInputSingle(
                Web3.to_checksum_address(token_in['address']),
                Web3.to_checksum_address(token_out['address']),
                current_fee_tier,
                amount_in_units,
                0,
            ).call()
        except Exception:
            continue

        if best_quote is None or amount_out_units > best_quote['amount_out_units']:
            amount_out_decimal = Decimal(amount_out_units) / (Decimal(10) ** token_out['decimals'])
            min_amount_out_decimal = amount_out_decimal * (Decimal('1') - (slippage_decimal / Decimal('100')))
            best_quote = {
                'token_in': token_in['symbol'],
                'token_out': token_out['symbol'],
                'amount_in': str(amount_decimal.normalize()),
                'amount_out': format(amount_out_decimal.normalize(), 'f'),
                'min_amount_out': format(min_amount_out_decimal.normalize(), 'f'),
                'amount_out_units': amount_out_units,
                'fee_tier': current_fee_tier,
                'source': 'uniswap-v3-quoter',
                'slippage_percent': format(slippage_decimal.normalize(), 'f'),
            }

    if not best_quote:
        raise ValueError("No Uniswap route found for this token pair")

    del best_quote['amount_out_units']
    return best_quote

def detect_wallet_source_token(wallet_details: dict) -> str:
    total_eth = sum((sub_wallet.get('eth_balance') or 0) for sub_wallet in wallet_details.get('sub_wallets', []))
    total_weth = sum((sub_wallet.get('weth_balance') or 0) for sub_wallet in wallet_details.get('sub_wallets', []))
    if total_weth >= total_eth:
        return 'WETH'
    return 'ETH'

def quote_wallet_batch_swap(
    wallet_id: str,
    token_out_identifier: str,
    fee_tier: int | None = None,
    slippage_percent: str | float | Decimal | None = None,
):
    wallet_details = get_wallet_details(wallet_id)
    if not wallet_details:
        raise ValueError("Wallet not found")

    sub_wallets = wallet_details.get('sub_wallets', [])
    if not sub_wallets:
        raise ValueError("No subwallets available")
    if any(sub_wallet.get('eth_balance') is None or sub_wallet.get('weth_balance') is None for sub_wallet in sub_wallets):
        raise RuntimeError("Live subwallet balances are unavailable")

    source_token = detect_wallet_source_token(wallet_details)
    source_balance_field = 'weth_balance' if source_token == 'WETH' else 'eth_balance'

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
            'fee_tier': quote['fee_tier'],
        })

    if not quoted_wallets:
        raise ValueError(f"No {source_token} balance found in subwallets")

    quoted_count = len(quoted_wallets)
    average_input = total_input / quoted_count
    average_output = total_output / quoted_count
    average_min_output = total_min_output / quoted_count
    target_token = resolve_token(token_out_identifier)

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
        'source': 'uniswap-v3-batch-quoter',
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

def generate_sub_wallets(main_id: str, count: int = 1):
    main_wallet = get_wallet(main_id)
    if not main_wallet or main_wallet['type'] not in {'main', 'imported_private_key'}:
        raise ValueError("Invalid main wallet ID")

    sub_wallets = []
    decrypted_mnemonic = None
    existing_sub_wallets = list_wallet_records(main_id)
    next_index = len(existing_sub_wallets) + 1 if main_wallet['type'] == 'main' else len(existing_sub_wallets)

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
            'index': child_index
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


def execute_wallet_run(main_id: str, template_id: str, count: int = 1):
    if count < 1 or count > 100:
        raise ValueError("Count must be between 1 and 100")

    from src.services.template_service import get_template, preview_template

    main_wallet = get_wallet(main_id)
    if not main_wallet or main_wallet['type'] not in {'main', 'imported_private_key'}:
        raise ValueError("Invalid main wallet ID")

    template = get_template(template_id)
    if not template:
        raise ValueError("Template not found")

    preview = preview_template(main_id, template_id, count)
    if not preview.get("can_proceed"):
        raise ValueError(preview.get("shortfall_reason") or "This main wallet cannot support the selected template right now.")

    per_wallet_eth = parse_decimal_amount(preview["per_contract"]["required_eth"], "required_eth")
    per_wallet_weth = parse_decimal_amount(preview["per_contract"]["required_weth"], "required_weth")
    wrapped_eth_total = parse_decimal_amount(preview["funding"]["weth_from_wrapped_eth"], "weth_from_wrapped_eth")
    total_eth_deducted = parse_decimal_amount(preview["funding"]["total_eth_deducted"], "total_eth_deducted")
    needs_onchain_funding = per_wallet_eth > 0 or per_wallet_weth > 0 or wrapped_eth_total > 0

    web3_client = get_web3()
    funding_fee_estimate = None
    if needs_onchain_funding:
        if not web3_client or not web3_client.is_connected():
            raise RuntimeError("Ethereum RPC is unavailable")

        funding_fee_estimate = estimate_execution_network_fee_wei(
            count,
            eth_per_wallet=per_wallet_eth,
            weth_per_wallet=per_wallet_weth,
            wrap_eth_total=wrapped_eth_total,
        )
        current_main_eth_wei = web3_client.eth.get_balance(Web3.to_checksum_address(main_wallet["address"]))
        required_total_wei = decimal_to_wei(total_eth_deducted) + funding_fee_estimate["fee_wei"]
        if current_main_eth_wei < required_total_wei:
            shortfall = wei_to_decimal(required_total_wei - current_main_eth_wei)
            raise ValueError(
                f"Not enough ETH to fund the new wallets and pay network fees. Need {format_decimal(shortfall)} more ETH."
            )

    created_sub_wallets = generate_sub_wallets(main_id, count)
    run_id = f"run_{int(datetime.utcnow().timestamp())}_{uuid4().hex[:8]}"
    created_at = datetime.utcnow().isoformat()
    run_sub_wallets = [
        {
            "wallet_id": sub_wallet["id"],
            "address": sub_wallet["address"],
            "index": sub_wallet.get("index"),
            "status": "created",
            "expected_funding": {
                "eth": format_decimal(per_wallet_eth),
                "weth": format_decimal(per_wallet_weth),
            },
            "funding_transactions": {},
            "private_key_access": {
                "wallet_id": sub_wallet["id"],
                "export_supported": True,
            },
        }
        for sub_wallet in created_sub_wallets
    ]

    wrap_transaction = None
    error_message = None
    status = "created" if not needs_onchain_funding else "submitted"

    if needs_onchain_funding:
        sender = Web3.to_checksum_address(main_wallet["address"])
        sender_private_key = main_wallet["private_key"]
        weth_contract = web3_client.eth.contract(address=Web3.to_checksum_address(WETH_ADDRESS), abi=WETH_ABI)
        nonce = web3_client.eth.get_transaction_count(sender, "pending")
        submitted_transaction_count = 0

        try:
            if wrapped_eth_total > 0:
                wrapped_eth_wei = decimal_to_wei(wrapped_eth_total)
                try:
                    wrap_gas = weth_contract.functions.deposit().estimate_gas({
                        "from": sender,
                        "value": wrapped_eth_wei,
                    })
                except Exception:
                    wrap_gas = WETH_DEPOSIT_GAS_LIMIT

                wrap_tx = weth_contract.functions.deposit().build_transaction(
                    build_transaction_envelope(
                        web3_client,
                        sender,
                        nonce,
                        gas=max(int(wrap_gas), WETH_DEPOSIT_GAS_LIMIT),
                        value=wrapped_eth_wei,
                    )
                )
                wrap_hash = send_signed_transaction(web3_client, wrap_tx, sender_private_key)
                wait_for_transaction_success(web3_client, wrap_hash)
                wrap_transaction = {
                    "tx_hash": wrap_hash,
                    "status": "confirmed",
                    "eth_wrapped": format_decimal(wrapped_eth_total),
                }
                submitted_transaction_count += 1
                nonce += 1

            for item in run_sub_wallets:
                recipient = Web3.to_checksum_address(item["address"])

                if per_wallet_eth > 0:
                    eth_tx = {
                        **build_transaction_envelope(
                            web3_client,
                            sender,
                            nonce,
                            gas=ETH_TRANSFER_GAS_LIMIT,
                            value=decimal_to_wei(per_wallet_eth),
                        ),
                        "to": recipient,
                    }
                    eth_tx_hash = send_signed_transaction(web3_client, eth_tx, sender_private_key)
                    item["funding_transactions"]["eth"] = {
                        "tx_hash": eth_tx_hash,
                        "status": "submitted",
                        "amount": format_decimal(per_wallet_eth),
                    }
                    submitted_transaction_count += 1
                    nonce += 1

                if per_wallet_weth > 0:
                    weth_amount_wei = decimal_to_wei(per_wallet_weth)
                    try:
                        weth_transfer_gas = weth_contract.functions.transfer(recipient, weth_amount_wei).estimate_gas({
                            "from": sender,
                        })
                    except Exception:
                        weth_transfer_gas = WETH_TRANSFER_GAS_LIMIT

                    weth_tx = weth_contract.functions.transfer(recipient, weth_amount_wei).build_transaction(
                        build_transaction_envelope(
                            web3_client,
                            sender,
                            nonce,
                            gas=max(int(weth_transfer_gas), WETH_TRANSFER_GAS_LIMIT),
                        )
                    )
                    weth_tx_hash = send_signed_transaction(web3_client, weth_tx, sender_private_key)
                    item["funding_transactions"]["weth"] = {
                        "tx_hash": weth_tx_hash,
                        "status": "submitted",
                        "amount": format_decimal(per_wallet_weth),
                    }
                    submitted_transaction_count += 1
                    nonce += 1

                item["status"] = "funding_submitted" if item["funding_transactions"] else "created"

            status = "submitted" if submitted_transaction_count > 0 else "created"
        except Exception as exc:
            error_message = str(exc)
            status = "partial" if any(item["funding_transactions"] for item in run_sub_wallets) or wrap_transaction else "failed"

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
        "contract_execution": {
            "status": "not_configured",
            "message": "Template funding is executed, but no contract address or calldata is defined yet.",
        },
        "sub_wallets": run_sub_wallets,
    }
    return db.upsert_wallet_run(run_record)

def store_wallet(wallet_id: str, data: dict, wallet_type: str = 'sub', parent_id: str = None):
    db.connect_keyspace()
    encrypted_key = data['encrypted_seed'] if wallet_type == 'main' else data['encrypted_key']

    query = """
        INSERT INTO wallets (id, type, address, encrypted_key, parent_id, created_at) 
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    db.session.execute(query, (wallet_id, wallet_type, data['address'], encrypted_key, parent_id, datetime.now()))
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


def list_saved_wallets():
    db.connect_keyspace()
    rows = db.session.execute("SELECT * FROM wallets")
    wallet_records = [dict(row._asdict()) for row in rows.all()]
    root_wallets = [
        record
        for record in wallet_records
        if record.get("parent_id") in (None, "") and record.get("type") in {"main", "imported_private_key"}
    ]
    root_wallets.sort(key=lambda record: str(record.get("created_at") or ""), reverse=True)
    return [serialize_wallet_record(record) for record in root_wallets]


def list_wallet_runs(main_wallet_id: str | None = None):
    return db.list_wallet_runs(main_wallet_id=main_wallet_id)


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

def serialize_wallet_record(record: dict, index: int | None = None):
    payload = {
        'id': record['id'],
        'type': record['type'],
        'address': record['address'],
        'parent_id': record.get('parent_id'),
        'created_at': record.get('created_at'),
        **get_wallet_balances(record['address']),
    }
    if index is not None:
        payload['index'] = index
    return payload

def get_wallet_details(wallet_id: str):
    wallet = get_wallet_record(wallet_id)
    if not wallet:
        return None

    sub_wallet_records = sorted(
        list_wallet_records(wallet_id),
        key=lambda record: str(record.get('created_at') or ''),
    )
    sub_wallets = [
        serialize_wallet_record(record, index=index)
        for index, record in enumerate(sub_wallet_records)
    ]

    details = serialize_wallet_record(wallet)
    details['sub_wallets'] = sub_wallets
    return details

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
