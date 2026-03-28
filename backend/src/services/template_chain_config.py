from copy import deepcopy


TEMPLATE_CHAIN_ETHEREUM = "ethereum_mainnet"
TEMPLATE_CHAIN_BNB = "bnb"
TEMPLATE_CHAIN_ARBITRUM = "arbitrum"
TEMPLATE_CHAIN_AVALANCHE = "avalanche"
TEMPLATE_CHAIN_BASE = "base"
TEMPLATE_CHAIN_OPTIMISM = "optimism"
TEMPLATE_CHAIN_POLYGON = "polygon"
TEMPLATE_CHAIN_XLAYER = "xlayer"
DEFAULT_TEMPLATE_CHAIN = TEMPLATE_CHAIN_ETHEREUM

SWAP_BACKEND_UNISWAP_V3 = "uniswap_v3"
SWAP_BACKEND_PANCAKESWAP_V2 = "pancakeswap_v2"
SWAP_BACKEND_LABELS = {
    SWAP_BACKEND_UNISWAP_V3: "Uniswap V3",
    SWAP_BACKEND_PANCAKESWAP_V2: "PancakeSwap V2",
}

ETHEREUM_WRAPPED_NATIVE_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
BNB_WRAPPED_NATIVE_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
ARBITRUM_WRAPPED_NATIVE_ADDRESS = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"
AVALANCHE_WRAPPED_NATIVE_ADDRESS = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7"
BASE_WRAPPED_NATIVE_ADDRESS = "0x4200000000000000000000000000000000000006"
OPTIMISM_WRAPPED_NATIVE_ADDRESS = "0x4200000000000000000000000000000000000006"
POLYGON_WRAPPED_NATIVE_ADDRESS = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"
XLAYER_WRAPPED_NATIVE_ADDRESS = "0xe538905cf8410324e03a5a23c1c177a474d59b2b"


def _token(symbol: str, address: str, decimals: int | None = None, name: str | None = None) -> dict:
    return {
        "symbol": symbol,
        "name": name or symbol,
        "address": address,
        "decimals": decimals,
    }

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
    _token("ADA", "0x3ee2200efb3400fabb9aacf31297cbdd1d435d47", 18, "Binance-Peg ADA"),
    _token("anyBTC", "0x54261774905f3e6e9718f2abb10ed6555cae308a", 8, "Anyswap BTC"),
    _token("anyDAI", "0x1dc56f2705ff2983f31fb5964cc3e19749a7cba7", 18, "Anyswap DAI"),
    _token("anyETH", "0x6f817a0ce8f7640add3bc0c1c2298635043c2423", 18, "Anyswap ETH"),
    _token("anyLINK", "0x3af577f9d8c86ae8dbcbf51fe9836c9df825759d", 18, "Anyswap LINK"),
    _token("anyLTC", "0x2cd598b0513abdb52bdd92a1ab4670fc4578570f", 8, "Anyswap LTC"),
    _token("anyUSDC", "0x8965349fb649a33a30cbfda057d8ec2c48abe2a2", 18, "Anyswap USDC"),
    _token("anyUSDT", "0xb46d67fb63770052a07d5b7c14ed858a8c90f825", 6, "Anyswap USDT"),
    _token("AVAX", "0x1ce0c2827e2ef14d5c4f29a091d735a204794041", 18, "Binance-Peg AVAX"),
    _token("BCH", "0x8ff795a6f4d97e7887c79bea79aba5cc76444adf", 18, "Binance-Peg BCH"),
    _token("BNB", "0x3e14602186dd9de538f729547b3918d24c823546", 18, "Binance-Peg BNB"),
    _token("BSC-USD", "0x55d398326f99059ff775485246999027b3197955", 18, "BSC-USD"),
    _token("BTCB", "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", 18, "BTCB Token"),
    _token("DAI", "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3", 18, "Binance-Peg DAI"),
    _token("DOGE", "0xba2ae424d960c26247dd6c32edc70b295c744c43", 8, "Binance-Peg DOGE"),
    _token("FET", "0x031b41e504677879370e9dbcf937283a8691fa7f", 18, "Artificial Superintelligence Alliance"),
    _token("LINK", "0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd", 18, "Binance-Peg LINK"),
    _token("LTC", "0x4338665cbb7b2485a8855a139b75d5e34ab0db94", 18, "Binance-Peg LTC"),
    _token("SHIB", "0x2859e4544c4bb03966803b044a93563bd2d0dd4d", 18, "Binance-Peg SHIB"),
    _token("sUSDe", "0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2", 18, "sUSDe"),
    _token("TONCOIN", "0x76a797a59ba2c17726896976b7b3747bfd1d220f", 9, "Toncoin"),
    _token("TRX", "0xce7de646e7208a4ef112cb6ed5038fa6cc6b12e3", 6, "Binance-Peg TRX"),
    _token("USDC", "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", 18, "Binance-Peg USD Coin"),
    _token("USDe", "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34", 18, "USDe"),
    _token("WBNB", "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", 18, "Wrapped BNB"),
    _token("WBTC", "0x0555e30da8f98308edb960aa94c0db47230d2b9c", 8, "Wrapped BTC"),
    _token("WETH", "0x2170ed0880ac9a755fd29b2688956bd959f933f8", 18, "Binance-Peg Ethereum Token"),
    _token("XLM", "0x43c934a845205f0b514417d757d7235b8f53f1b9", 18, "Binance-Peg XLM"),
    _token("XRP", "0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe", 18, "Binance-Peg XRP"),
    _token("ZEC", "0x1ba42e5193dfa8b03d15dd1b86a3113bbbef8eeb", 18, "Binance-Peg ZEC"),
]

ARBITRUM_SWAP_TOKENS = [
    _token("ARB", "0x912ce59144191c1204e64559fe8253a0e49e6548", 18),
    _token("BUIDL", "0xa6525ae43edcd03dc08e775774dcabd3bb925872", 6),
    _token("cbBTC", "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", 8),
    _token("DAI", "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", 18),
    _token("DOT", "0x8d010bf9c26881788b4e6bf5fd1bdc358c8f90b8", 18),
    _token("ENA", "0x58538e6a46e07434d7e7375bc268d3cb839c0133", 18),
    _token("EUTBL", "0xcbeb19549054cc0a6257a77736fc78c367216ce7", 5),
    _token("LINK", "0xf97f4df75117a78c1a5a0dbb814af92458539fb4", 18),
    _token("MORPHO", "0x40bd670a58238e6e230c430bbb5ce6ec0d40df48", 18),
    _token("PEPE", "0x25d887ce7a35172c62febfd67a1856f20faebb00", 18),
    _token("PYUSD", "0x46850ad61c2b7d64d08c9c754f45254596696984", 6),
    _token("RAIN", "0x25118290e6a5f4139381d072181157035864099d", 18),
    _token("SolvBTC", "0x3647c54c4c2c65bc7a2d63c0da2809b399dbbdc0", 18),
    _token("sUSDe", "0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2", 18),
    _token("sUSDS", "0xddb46999f8891663a8f2828d25298f70416d7610", 18),
    _token("syrupUSDC", "0x41ca7586cc1311807b4605fbb748a3b8862b42b5", 6),
    _token("UNI", "0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0", 18),
    _token("USDC", "0xaf88d065e77c8cc2239327c5edb3a432268e5831", 6),
    _token("USDC.e", "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", 6),
    _token("USDD", "0x680447595e8b7b3aa1b43beb9f6098c79ac2ab3f", 18),
    _token("USDe", "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34", 18),
    _token("USDS", "0x6491c05a82219b8d1479057361ff1654749b876b", 18),
    _token("USDT0", "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", 6),
    _token("USDY", "0x35e050d3c0ec2d29d269a8ecea763a183bdf9a9d", 18),
    _token("WBTC", "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", 8),
    _token("WETH", "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", 18),
    _token("wM", "0x437cc33344a0b27a429f795ff6b469c72698b291", 6),
    _token("wstETH", "0x5979D7b546E38E414F7E9822514be443A4800529", 18),
]

AVALANCHE_SWAP_TOKENS = [
    _token("aAvaWETH", "0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8", 18),
    _token("ARENA", "0xB8d7710f7d8349A506b75dD184F05777c82dAd0C", 18),
    _token("avUSD", "0x24dE8771bC5DdB3362Db529Fc3358F2df3A0E346", 18),
    _token("BTC.b", "0x152b9d0FdC40C096757F570A51E494bd4b943E50", 8),
    _token("DAI", "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", 18),
    _token("JOE", "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd", 18),
    _token("NXPC", "0x5E0E90E268BC247Cc850c789A0DB0d5c7621fb59", 18),
    _token("PNIC", "0x4f3c5C53279536fFcfe8bCafb78E612E933D53c6", 18),
    _token("SAVAX", "0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be", 18),
    _token("stAVAX", "0xA25EaF2906FA1a3a13EdAc9B9657108Af7B703e3", 18),
    _token("USDC", "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", 6),
    _token("USDC.e", "0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664", 6),
    _token("USDT", "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", 6),
    _token("WAVAX", "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", 18),
    _token("WBTC", "0x50b7545627a5162F82A992c33b87aDc75187B218", 8),
    _token("WETH.e", "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", 18),
    _token("XAVA", "0xd1c3f94DE7e5B45fa4eDBBA472491a9f4B166FC4", 18),
]

BASE_SWAP_TOKENS = [
    _token("AAVE", "0x63706e401c06ac8513145b7687a14804d17f814b", 18),
    _token("BDX", "0x6ad12e761b438bea3ea09f6c6266556bb24c2181", 9),
    _token("cbBTC", "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", 8),
    _token("clBTC", "0x8d2757ea27aabf172da4cca4e5474c76016e3dc5", 18),
    _token("DAI", "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", 18),
    _token("DOT", "0x8d010bf9c26881788b4e6bf5fd1bdc358c8f90b8", 18),
    _token("ENA", "0x58538e6a46e07434d7e7375bc268d3cb839c0133", 18),
    _token("LBTC", "0xecac9c5f704e954931349da37f60e39f515c11c1", 8),
    _token("LsETH", "0xb29749498954a3a821ec37bde86e386df3ce30b6", 18),
    _token("MORPHO", "0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842", 18),
    _token("rETH", "0xb6fe221fe9eef5aba221c348ba20a1bf5e73624c", 18),
    _token("SOL", "0x311935cd80b76769bf2ecc9d8ab7635b2139cf82", 9),
    _token("SolvBTC", "0x3b86ad95859b6ab773f55f8d94b4b9d443ee931f", 18),
    _token("sUSDe", "0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2", 18),
    _token("sUSDS", "0x5875eee11cf8398102fdad704c9e96607675467a", 18),
    _token("syrupUSDC", "0x660975730059246a68521a3e2fbd4740173100f5", 6),
    _token("USD0", "0x758a3e0b1f842c9306b783f8a4078c6c8c03a270", 18),
    _token("USDC", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", 6),
    _token("USDe", "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34", 18),
    _token("USDS", "0x820c137fa70c8691f0e44dc420a5e53c168921dc", 18),
    _token("WBTC", "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c", 8),
    _token("WETH", "0x4200000000000000000000000000000000000006", 18),
    _token("wstETH", "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452", 18),
]

OPTIMISM_SWAP_TOKENS = [
    _token("BUIDL", "0xa1cdab15bba75a80df4089cafba013e376957cf5", 6),
    _token("crvUSD", "0xc52d7f23a2e460248db6ee192cb23dd12bddcbf6", 18),
    _token("DAI", "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", 18),
    _token("EXTRA", "0x2dad3a13ef0c6366220f989157009e501e7938f8", 18),
    _token("ezETH", "0x2416092f143378750bb29b79ed961ab195cceea5", 18),
    _token("FRAX", "0x2e3d870790dc77a83dd1d18184acc7439a53f475", 18),
    _token("frxETH", "0x6806411765af15bddd26f8f544a34cc40cb9838b", 18),
    _token("IB", "0x00a35fd824c717879bf370e70ac6868b95870dfb", 18),
    _token("LINK", "0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6", 18),
    _token("MIM", "0xb153fb3d196a8eb25522705560ac152eeec57901", 18),
    _token("MONEY", "0x69420f9e38a4e60a62224c489be4bf7a94402496", 18),
    _token("mooBIFI", "0xc55e93c62874d8100dbd2dfe307edc1036ad5434", 18),
    _token("OP", "0x4200000000000000000000000000000000000042", 18),
    _token("OVER", "0xedf38688b27036816a50185caa430d5479e1c63e", 18),
    _token("PENDLE", "0xbc7b1ff1c6989f006a1185318ed4e7b5796e66e1", 18),
    _token("sfrxETH", "0x3ec3849c33291a9ef4c5db86de593eb4a37fde45", 18),
    _token("SNX", "0x8700daec35af8ff88c16bdf0418774cb3d7599b4", 18),
    _token("STG", "0x296f55f8fb28e498b858d0bcda06d955b2cb3f97", 18),
    _token("sUSD", "0x8c6f28f2f1a3c87f0f938b96d27520d9751ec8d9", 18),
    _token("TAROT", "0x1f514a61bcde34f94bc39731235690ab9da737f7", 18),
    _token("tBTC", "0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40", 18),
    _token("USDC", "0x0b2c639c533813f4aa9d7837caf62653d097ff85", 6),
    _token("USDC.e", "0x7f5c764cbc14f9669b88837ca1490cca17c31607", 6),
    _token("USDT", "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", 6),
    _token("VELO", "0x3c8b650257cfb5f272f799f5e2b4e65093a11a05", 18),
    _token("WBTC", "0x68f180fcce6836688e9084f035309e29bf0a2095", 8),
    _token("WETH", "0x4200000000000000000000000000000000000006", 18),
    _token("WLD", "0xdc6ff44d5d932cbd77b52e5612ba0529dc6226f1", 18),
    _token("wstETH", "0x1f32b1c2345538c0c6f582fcb022739c4a194ebb", 18),
    _token("ZRO", "0x6985884c4392d348587b19cb9eaaf157f13271cd", 18),
]

POLYGON_SWAP_TOKENS = [
    _token("AAVE", "0xd6df932a45c0f255f85145f286ea0b292b21c90b", 18),
    _token("aPolWETH", "0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8", 18),
    _token("AVAX", "0x2c89bbc92bd86f8075d1decc58c7f4e0107f286b", 18),
    _token("BNB", "0x3ba4c387f786bfee076a58914f5bd38d668b42c3", 18),
    _token("BUIDL", "0x2893Ef551B6dD69F661Ac00F11D93E5Dc5Dc0e99", 6),
    _token("DAI", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", 18),
    _token("EUTBL", "0xa0769f7a8fc65e47de93797b4e21c073c117fc80", 18),
    _token("LINK677", "0xb0897686c545045afc77cf20ec7a532e3120e0f1", 18, "Chainlink Service LINK"),
    _token("LINK", "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39", 18),
    _token("NEXO", "0x41b3966b4ff7b427969ddf5da3627d6aeae9a48e", 18),
    _token("rETH", "0x0266f4f08d82372cf0fcbccc0ff74309089c74d1", 18),
    _token("SHIB", "0x6f8a06447ff6fcf75d803135a7de15ce88c1d4ec", 18),
    _token("SOL", "0xd93f7e271cb87c23aaa73edc008a79646d1f9912", 9),
    _token("tBTC", "0x236aa50979d5f3de3bd1eeb40e81137f22ab794b", 18),
    _token("TUSD", "0x2e1ad108ff1d8c782fcbbb89aad783ac49586756", 18),
    _token("UNI", "0xb33eaad8d922b1083446dc23f610c2567fb5180f", 18),
    _token("USDC", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", 6),
    _token("USDC.e", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", 6),
    _token("USDD", "0xffa4d863c96e743a2e1513824ea006b8d0353c57", 18),
    _token("USDT", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", 6),
    _token("WBTC", "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", 8),
    _token("WETH", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", 18),
    _token("ZRO", "0x6985884c4392d348587b19cb9eaaf157f13271cd", 18),
]

XLAYER_SWAP_TOKENS = [
    _token("USDG", "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", 6, "Global Dollar"),
    _token("USDT0", "0x779ded0c9e1022225f8e0630b35a9b54be713736", 6),
    _token("USDC", "0x74b7f16337b8972027f6196a17a631ac6de26d22", 6),
    _token("USDT", "0x1e4a5963abfd975d8c9021ce480b42188849d41d", 6),
    _token("WOKB", "0xe538905cf8410324e03a5a23c1c177a474d59b2b", 18),
    _token("xBTC", "0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f", 8),
    _token("XSHIB", "0xe8e8a1df1e26277a2875a0bda912ab9f19843a53", 18),
    _token("WETH", "0x5a77f1443d16ee5761d310e38b62f77f726bc71c", 18),
    _token("xETH", "0xe7b000003a45145decf8a28fc755ad5ec5ea025a", 18),
    _token("xSOL", "0x505000008de8748dbd4422ff4687a4fc9beba15b", 9),
]

TEMPLATE_CHAIN_ALIASES = {
    "ethereum": TEMPLATE_CHAIN_ETHEREUM,
    "mainnet": TEMPLATE_CHAIN_ETHEREUM,
    "eth": TEMPLATE_CHAIN_ETHEREUM,
    "bsc": TEMPLATE_CHAIN_BNB,
    "arb": TEMPLATE_CHAIN_ARBITRUM,
    "avax": TEMPLATE_CHAIN_AVALANCHE,
    "op": TEMPLATE_CHAIN_OPTIMISM,
    "matic": TEMPLATE_CHAIN_POLYGON,
    "pol": TEMPLATE_CHAIN_POLYGON,
    "x_layer": TEMPLATE_CHAIN_XLAYER,
}

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
        "swap_protocol": SWAP_BACKEND_UNISWAP_V3,
        "swap_backends": [SWAP_BACKEND_UNISWAP_V3],
        "fee_tiers": [500, 3000, 10000],
        "route_intermediary_symbols": ["USDC", "USDT", "DAI"],
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
        "swap_protocol": SWAP_BACKEND_UNISWAP_V3,
        "swap_backends": [SWAP_BACKEND_UNISWAP_V3, SWAP_BACKEND_PANCAKESWAP_V2],
        "fee_tiers": [500, 3000, 10000],
        "route_intermediary_symbols": ["BSC-USD", "USDC", "DAI"],
        "tokens": BNB_SWAP_TOKENS,
    },
    TEMPLATE_CHAIN_ARBITRUM: {
        "value": TEMPLATE_CHAIN_ARBITRUM,
        "label": "Arbitrum",
        "native_symbol": "ETH",
        "wrapped_native_symbol": "WETH",
        "wrapped_native_address": ARBITRUM_WRAPPED_NATIVE_ADDRESS,
        "coingecko_asset_platform": "arbitrum-one",
        "coingecko_native_coin_id": "ethereum",
        "quote_supported": True,
        "swap_protocol": SWAP_BACKEND_UNISWAP_V3,
        "swap_backends": [SWAP_BACKEND_UNISWAP_V3],
        "fee_tiers": [500, 3000, 10000],
        "route_intermediary_symbols": ["USDC", "USDT0", "DAI"],
        "tokens": ARBITRUM_SWAP_TOKENS,
    },
    TEMPLATE_CHAIN_AVALANCHE: {
        "value": TEMPLATE_CHAIN_AVALANCHE,
        "label": "Avalanche",
        "native_symbol": "AVAX",
        "wrapped_native_symbol": "WAVAX",
        "wrapped_native_address": AVALANCHE_WRAPPED_NATIVE_ADDRESS,
        "coingecko_asset_platform": "avalanche",
        "coingecko_native_coin_id": "avalanche-2",
        "quote_supported": True,
        "swap_protocol": SWAP_BACKEND_UNISWAP_V3,
        "swap_backends": [SWAP_BACKEND_UNISWAP_V3],
        "fee_tiers": [500, 3000, 10000],
        "route_intermediary_symbols": ["USDC", "USDT", "DAI"],
        "tokens": AVALANCHE_SWAP_TOKENS,
    },
    TEMPLATE_CHAIN_BASE: {
        "value": TEMPLATE_CHAIN_BASE,
        "label": "Base",
        "native_symbol": "ETH",
        "wrapped_native_symbol": "WETH",
        "wrapped_native_address": BASE_WRAPPED_NATIVE_ADDRESS,
        "coingecko_asset_platform": "base",
        "coingecko_native_coin_id": "ethereum",
        "quote_supported": True,
        "swap_protocol": SWAP_BACKEND_UNISWAP_V3,
        "swap_backends": [SWAP_BACKEND_UNISWAP_V3],
        "fee_tiers": [500, 3000, 10000],
        "route_intermediary_symbols": ["USDC", "DAI"],
        "tokens": BASE_SWAP_TOKENS,
    },
    TEMPLATE_CHAIN_OPTIMISM: {
        "value": TEMPLATE_CHAIN_OPTIMISM,
        "label": "Optimism",
        "native_symbol": "ETH",
        "wrapped_native_symbol": "WETH",
        "wrapped_native_address": OPTIMISM_WRAPPED_NATIVE_ADDRESS,
        "coingecko_asset_platform": "optimistic-ethereum",
        "coingecko_native_coin_id": "ethereum",
        "quote_supported": True,
        "swap_protocol": SWAP_BACKEND_UNISWAP_V3,
        "swap_backends": [SWAP_BACKEND_UNISWAP_V3],
        "fee_tiers": [500, 3000, 10000],
        "route_intermediary_symbols": ["USDC", "USDT", "DAI"],
        "tokens": OPTIMISM_SWAP_TOKENS,
    },
    TEMPLATE_CHAIN_POLYGON: {
        "value": TEMPLATE_CHAIN_POLYGON,
        "label": "Polygon",
        "native_symbol": "POL",
        "wrapped_native_symbol": "WPOL",
        "wrapped_native_address": POLYGON_WRAPPED_NATIVE_ADDRESS,
        "coingecko_asset_platform": "polygon-pos",
        "coingecko_native_coin_id": "polygon-ecosystem-token",
        "quote_supported": True,
        "swap_protocol": SWAP_BACKEND_UNISWAP_V3,
        "swap_backends": [SWAP_BACKEND_UNISWAP_V3],
        "fee_tiers": [500, 3000, 10000],
        "route_intermediary_symbols": ["USDC", "USDT", "DAI"],
        "tokens": POLYGON_SWAP_TOKENS,
    },
    TEMPLATE_CHAIN_XLAYER: {
        "value": TEMPLATE_CHAIN_XLAYER,
        "label": "X Layer",
        "native_symbol": "OKB",
        "wrapped_native_symbol": "WOKB",
        "wrapped_native_address": XLAYER_WRAPPED_NATIVE_ADDRESS,
        "coingecko_asset_platform": "x-layer",
        "coingecko_native_coin_id": "okb",
        "quote_supported": True,
        "swap_protocol": SWAP_BACKEND_UNISWAP_V3,
        "swap_backends": [SWAP_BACKEND_UNISWAP_V3],
        "fee_tiers": [500, 3000, 10000],
        "route_intermediary_symbols": ["USDC", "USDT", "USDG"],
        "tokens": XLAYER_SWAP_TOKENS,
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
    normalized = (value or DEFAULT_TEMPLATE_CHAIN).strip().lower().replace("-", "_").replace(" ", "_")
    normalized = TEMPLATE_CHAIN_ALIASES.get(normalized, normalized)
    if normalized in TEMPLATE_CHAIN_CONFIG:
        return normalized
    raise ValueError("Unsupported template chain")


def get_template_chain_config(chain: str | None = None) -> dict:
    normalized = normalize_template_chain(chain)
    return TEMPLATE_CHAIN_CONFIG[normalized]


def get_template_chain_swap_backends(chain: str | None = None) -> list[str]:
    config = get_template_chain_config(chain)
    backends = config.get("swap_backends")
    if backends:
        return list(backends)
    protocol = config.get("swap_protocol")
    return [protocol] if protocol else []


def get_swap_backend_label(backend: str | None) -> str | None:
    if not backend:
        return None
    return SWAP_BACKEND_LABELS.get(backend, backend)


def get_template_chain_choices() -> list[dict]:
    return [
        {
            "value": key,
            "label": config["label"],
            "native_symbol": config["native_symbol"],
            "wrapped_native_symbol": config["wrapped_native_symbol"],
            "quote_supported": config["quote_supported"],
            "swap_protocol": config.get("swap_protocol"),
            "primary_swap_backend": get_template_chain_swap_backends(key)[0] if get_template_chain_swap_backends(key) else None,
            "primary_swap_backend_label": get_swap_backend_label(
                get_template_chain_swap_backends(key)[0] if get_template_chain_swap_backends(key) else None
            ),
            "fallback_swap_backends": get_template_chain_swap_backends(key)[1:],
            "fallback_swap_backend_labels": [
                get_swap_backend_label(backend)
                for backend in get_template_chain_swap_backends(key)[1:]
            ],
        }
        for key, config in TEMPLATE_CHAIN_CONFIG.items()
    ]


def is_wrapped_native_template_token(
    chain: str | None = None,
    *,
    address: str | None = None,
    symbol: str | None = None,
) -> bool:
    config = get_template_chain_config(chain)
    normalized_address = (address or "").strip().lower()
    normalized_symbol = (symbol or "").strip().upper()
    return (
        (normalized_address and normalized_address == config["wrapped_native_address"].lower())
        or (normalized_symbol and normalized_symbol == config["wrapped_native_symbol"].upper())
    )


def get_template_chain_tokens(chain: str | None = None, *, include_wrapped_native: bool = False) -> list[dict]:
    tokens = deepcopy(get_template_chain_config(chain)["tokens"])
    if include_wrapped_native:
        return tokens
    return [
        token
        for token in tokens
        if not is_wrapped_native_template_token(
            chain,
            address=token.get("address"),
            symbol=token.get("symbol"),
        )
    ]


def get_template_chain_token(
    chain: str | None = None,
    *,
    address: str | None = None,
    symbol: str | None = None,
    include_wrapped_native: bool = False,
) -> dict:
    normalized_chain = normalize_template_chain(chain)
    if address:
        token = TEMPLATE_CHAIN_TOKEN_BY_ADDRESS[normalized_chain].get(address.strip().lower())
        if token and (
            include_wrapped_native
            or not is_wrapped_native_template_token(
                normalized_chain,
                address=token.get("address"),
                symbol=token.get("symbol"),
            )
        ):
            return deepcopy(token)
    if symbol:
        token = TEMPLATE_CHAIN_TOKEN_BY_SYMBOL[normalized_chain].get(symbol.strip().upper())
        if token and (
            include_wrapped_native
            or not is_wrapped_native_template_token(
                normalized_chain,
                address=token.get("address"),
                symbol=token.get("symbol"),
            )
        ):
            return deepcopy(token)
    raise ValueError("Unsupported swap token")
