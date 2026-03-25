from copy import deepcopy


TEMPLATE_CHAIN_ETHEREUM = "ethereum_mainnet"
TEMPLATE_CHAIN_BNB = "bnb"
DEFAULT_TEMPLATE_CHAIN = TEMPLATE_CHAIN_ETHEREUM

ETHEREUM_WRAPPED_NATIVE_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
BNB_WRAPPED_NATIVE_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"

ETHEREUM_SWAP_TOKENS = [
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
        "symbol": "WBTC",
        "name": "Wrapped BTC",
        "address": "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
        "decimals": 8,
    },
    {
        "symbol": "WETH",
        "name": "Wrapped Ether",
        "address": "0xc02aa39b223fe8d0a0e5c4f27ead9083c756cc2",
        "decimals": 18,
    },
    {
        "symbol": "LEO",
        "name": "UNUS SED LEO",
        "address": "0x2af5d2ad76741191d15dfe7bf6ac92d4bd912ca3",
        "decimals": None,
    },
    {
        "symbol": "PAXG",
        "name": "PAX Gold",
        "address": "0x45804880de22913dafe09f4980848ece6ecbaf78",
        "decimals": None,
    },
    {
        "symbol": "LINK",
        "name": "Chainlink",
        "address": "0x514910771af9ca656af840dff83e8264ecf986ca",
        "decimals": None,
    },
    {
        "symbol": "USDe",
        "name": "Ethena USDe",
        "address": "0x4c9edd5852cd905f086c759e8383e09bff1e68b3",
        "decimals": None,
    },
    {
        "symbol": "PYUSD",
        "name": "PayPal USD",
        "address": "0x6c3ea9036406852006290770bedfcaba0e23a0e8",
        "decimals": 6,
    },
    {
        "symbol": "AAVE",
        "name": "Aave",
        "address": "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
        "decimals": None,
    },
    {
        "symbol": "PEPE",
        "name": "Pepe",
        "address": "0x6982508145454ce325ddbe47a25d4ec3d2311933",
        "decimals": None,
    },
    {
        "symbol": "UNI",
        "name": "Uniswap",
        "address": "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
        "decimals": None,
    },
    {
        "symbol": "WLFI",
        "name": "WLFI",
        "address": "0xda5e1988097297dcdc1f90d4dfe7909e847cbef6",
        "decimals": None,
    },
    {
        "symbol": "ONDO",
        "name": "Ondo",
        "address": "0xfaba6f8e4a5e8ab82f62fe7c39859fa577269be3",
        "decimals": None,
    },
    {
        "symbol": "stETH",
        "name": "Lido Staked Ether",
        "address": "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
        "decimals": None,
    },
    {
        "symbol": "cbBTC",
        "name": "Coinbase Wrapped BTC",
        "address": "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
        "decimals": 8,
    },
    {
        "symbol": "SHIB",
        "name": "Shiba Inu",
        "address": "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce",
        "decimals": None,
    },
    {
        "symbol": "LPT",
        "name": "Livepeer",
        "address": "0x58b6a8a3302369daec383334672404ee733ab239",
        "decimals": None,
    },
    {
        "symbol": "GRT",
        "name": "The Graph",
        "address": "0xc944e90c64b2c07662a292be6244bdf05cda44a7",
        "decimals": None,
    },
    {
        "symbol": "QNT",
        "name": "Quant",
        "address": "0x4a220e6096b25eadb88358cb44068a3248254675",
        "decimals": None,
    },
    {
        "symbol": "SAND",
        "name": "The Sandbox",
        "address": "0x3845badade8e6dff049820680d1f14bd3903a5d0",
        "decimals": None,
    },
    {
        "symbol": "COMP",
        "name": "Compound",
        "address": "0xc00e94cb662c3520282e6f5717214004a7f26888",
        "decimals": None,
    },
    {
        "symbol": "APE",
        "name": "ApeCoin",
        "address": "0x4d224452801aced8b2f0aebe155379bb5d594381",
        "decimals": None,
    },
    {
        "symbol": "ENS",
        "name": "Ethereum Name Service",
        "address": "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72",
        "decimals": None,
    },
    {
        "symbol": "FET",
        "name": "Fetch.ai",
        "address": "0xaea46a60368a7bd060eec7df8cba43b7ef41ad85",
        "decimals": None,
    },
    {
        "symbol": "CRV",
        "name": "Curve DAO Token",
        "address": "0xd533a949740bb3306d119cc777fa900ba034cd52",
        "decimals": None,
    },
    {
        "symbol": "BAT",
        "name": "Basic Attention Token",
        "address": "0x0d8775f648430679a709e98d2b0cb6250d2887ef",
        "decimals": None,
    },
    {
        "symbol": "ZRX",
        "name": "0x Protocol Token",
        "address": "0xe41d2489571d322189246dafa5ebde1f4699f498",
        "decimals": None,
    },
    {
        "symbol": "SUSHI",
        "name": "Sushi",
        "address": "0x6b3595068778dd592e39a122f4f5a5cf09c90fe2",
        "decimals": None,
    },
]

BNB_SWAP_TOKENS = [
    {"symbol": "anyBTC", "name": "Anyswap BTC", "address": "0x54261774905f3e6e9718f2abb10ed6555cae308a"},
    {"symbol": "ETH", "name": "Binance-Peg Ethereum Token", "address": "0x2170ed0880ac9a755fd29b2688956bd959f933f8"},
    {"symbol": "anyETH", "name": "Anyswap ETH", "address": "0x6f817a0ce8f7640add3bc0c1c2298635043c2423"},
    {"symbol": "BSC-USD", "name": "BSC-USD", "address": "0x55d398326f99059ff775485246999027b3197955"},
    {"symbol": "anyUSDT", "name": "Anyswap USDT", "address": "0xb46d67fb63770052a07d5b7c14ed858a8c90f825"},
    {"symbol": "BNB", "name": "Binance-Peg BNB", "address": "0x3e14602186dd9de538f729547b3918d24c823546"},
    {"symbol": "WBNB", "name": "Wrapped BNB", "address": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"},
    {"symbol": "XRP", "name": "Binance-Peg XRP", "address": "0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe"},
    {"symbol": "USDC", "name": "Binance-Peg USD Coin", "address": "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"},
    {"symbol": "anyUSDC", "name": "Anyswap USDC", "address": "0x8965349fb649a33a30cbfda057d8ec2c48abe2a2"},
    {"symbol": "TRX", "name": "Binance-Peg TRX", "address": "0xce7de646e7208a4ef112cb6ed5038fa6cc6b12e3"},
    {"symbol": "DOGE", "name": "Binance-Peg DOGE", "address": "0xba2ae424d960c26247dd6c32edc70b295c744c43"},
    {"symbol": "ADA", "name": "Binance-Peg ADA", "address": "0x3ee2200efb3400fabb9aacf31297cbdd1d435d47"},
    {"symbol": "BCH", "name": "Binance-Peg BCH", "address": "0x8ff795a6f4d97e7887c79bea79aba5cc76444adf"},
    {"symbol": "WBTC", "name": "Wrapped BTC", "address": "0x0555e30da8f98308edb960aa94c0db47230d2b9c"},
    {"symbol": "LINK", "name": "Binance-Peg LINK", "address": "0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd"},
    {"symbol": "anyLINK", "name": "Anyswap LINK", "address": "0x3af577f9d8c86ae8dbcbf51fe9836c9df825759d"},
    {"symbol": "USDe", "name": "USDe", "address": "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34"},
    {"symbol": "XLM", "name": "Binance-Peg XLM", "address": "0x43c934a845205f0b514417d757d7235b8f53f1b9"},
    {"symbol": "DAI", "name": "Binance-Peg DAI", "address": "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3"},
    {"symbol": "anyDAI", "name": "Anyswap DAI", "address": "0x1dc56f2705ff2983f31fb5964cc3e19749a7cba7"},
    {"symbol": "BTCB", "name": "BTCB Token", "address": "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c"},
    {"symbol": "AVAX", "name": "Binance-Peg AVAX", "address": "0x1ce0c2827e2ef14d5c4f29a091d735a204794041"},
    {"symbol": "anyLTC", "name": "Anyswap LTC", "address": "0x2cd598b0513abdb52bdd92a1ab4670fc4578570f"},
    {"symbol": "LTC", "name": "Binance-Peg LTC", "address": "0x4338665cbb7b2485a8855a139b75d5e34ab0db94"},
    {"symbol": "ZEC", "name": "Binance-Peg ZEC", "address": "0x1ba42e5193dfa8b03d15dd1b86a3113bbbef8eeb"},
    {"symbol": "sUSDe", "name": "sUSDe", "address": "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2"},
    {"symbol": "SHIB", "name": "Binance-Peg SHIB", "address": "0x2859e4544c4bb03966803b044a93563bd2d0dd4d"},
    {"symbol": "FET", "name": "Artificial Superintelligence Alliance", "address": "0x031b41e504677879370e9dbcf937283a8691fa7f"},
    {"symbol": "TONCOIN", "name": "Toncoin", "address": "0x76A797A59Ba2C17726896976B7B3747BfD1d220f"},
]

TEMPLATE_CHAIN_CONFIG = {
    TEMPLATE_CHAIN_ETHEREUM: {
        "value": TEMPLATE_CHAIN_ETHEREUM,
        "label": "Ethereum mainnet",
        "native_symbol": "ETH",
        "wrapped_native_symbol": "WETH",
        "wrapped_native_address": ETHEREUM_WRAPPED_NATIVE_ADDRESS,
        "coingecko_asset_platform": "ethereum",
        "coingecko_native_coin_id": "ethereum",
        "quote_supported": True,
        "swap_protocol": "uniswap_v3",
        "fee_tiers": [500, 3000, 10000],
        "route_intermediary_symbols": [],
        "tokens": ETHEREUM_SWAP_TOKENS,
    },
    TEMPLATE_CHAIN_BNB: {
        "value": TEMPLATE_CHAIN_BNB,
        "label": "BNB Chain",
        "native_symbol": "BNB",
        "wrapped_native_symbol": "WBNB",
        "wrapped_native_address": BNB_WRAPPED_NATIVE_ADDRESS,
        "coingecko_asset_platform": "binance-smart-chain",
        "coingecko_native_coin_id": "binancecoin",
        "quote_supported": True,
        "swap_protocol": "pancakeswap_v2",
        "fee_tiers": [],
        "route_intermediary_symbols": ["BSC-USD", "USDC", "DAI"],
        "tokens": BNB_SWAP_TOKENS,
    },
}

TEMPLATE_CHAIN_TOKEN_BY_ADDRESS = {
    chain: {token["address"].lower(): token for token in config["tokens"]}
    for chain, config in TEMPLATE_CHAIN_CONFIG.items()
}
TEMPLATE_CHAIN_TOKEN_BY_SYMBOL = {
    chain: {token["symbol"].upper(): token for token in config["tokens"]}
    for chain, config in TEMPLATE_CHAIN_CONFIG.items()
}


def normalize_template_chain(value: str | None) -> str:
    normalized = (value or DEFAULT_TEMPLATE_CHAIN).strip().lower()
    if normalized in TEMPLATE_CHAIN_CONFIG:
        return normalized
    raise ValueError("Unsupported template chain")


def get_template_chain_config(chain: str | None = None) -> dict:
    normalized = normalize_template_chain(chain)
    return TEMPLATE_CHAIN_CONFIG[normalized]


def get_template_chain_choices() -> list[dict]:
    return [
        {
            "value": key,
            "label": config["label"],
            "native_symbol": config["native_symbol"],
            "wrapped_native_symbol": config["wrapped_native_symbol"],
            "quote_supported": config["quote_supported"],
            "swap_protocol": config.get("swap_protocol"),
        }
        for key, config in TEMPLATE_CHAIN_CONFIG.items()
    ]


def get_template_chain_tokens(chain: str | None = None) -> list[dict]:
    return deepcopy(get_template_chain_config(chain)["tokens"])


def get_template_chain_token(chain: str | None = None, *, address: str | None = None, symbol: str | None = None) -> dict:
    normalized_chain = normalize_template_chain(chain)
    if address:
        token = TEMPLATE_CHAIN_TOKEN_BY_ADDRESS[normalized_chain].get(address.strip().lower())
        if token:
            return deepcopy(token)
    if symbol:
        token = TEMPLATE_CHAIN_TOKEN_BY_SYMBOL[normalized_chain].get(symbol.strip().upper())
        if token:
            return deepcopy(token)
    raise ValueError("Unsupported swap token")
