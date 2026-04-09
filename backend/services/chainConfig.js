/**
 * Central chain registry — addresses, CCTP domains, tokens per chain.
 * Single source of truth for all multi-chain metadata.
 */

export const CHAINS = {
  1: {
    chainId: 1,
    name: "Ethereum",
    shortName: "ETH",
    rpcEnvKey: "RPC_URL_ETHEREUM",
    fallbackRpc: "https://eth.llamarpc.com",
    paraswapNetwork: 1,
    cctpDomain: 0,
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    tokenMessenger: "0xBd3fa81B58Ba92a82136038B25aDec7066af3155",
    messageTransmitter: "0x0a992d191DEeC32aFe36203Ad87D7d289a738F81",
    color: "#627EEA",
  },
  8453: {
    chainId: 8453,
    name: "Base",
    shortName: "BASE",
    rpcEnvKey: "RPC_URL_BASE",
    fallbackRpc: "https://base.llamarpc.com",
    paraswapNetwork: 8453,
    cctpDomain: 6,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    weth: "0x4200000000000000000000000000000000000006",
    tokenMessenger: "0x1682Ae6375C4E4A97e4B583BC394c861A46D8962",
    messageTransmitter: "0xAD09780d193884d503182aD4F75D113B9B1a7c73",
    color: "#0052FF",
  },
  137: {
    chainId: 137,
    name: "Polygon",
    shortName: "MATIC",
    rpcEnvKey: "RPC_URL_POLYGON",
    fallbackRpc: "https://polygon.llamarpc.com",
    paraswapNetwork: 137,
    cctpDomain: 7,
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    weth: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    tokenMessenger: "0x9daF8c91AEFAE50b9c0E69629D3F6Ca40cA3B3FE",
    messageTransmitter: "0xF3be9355363857F3e001be68856A2f96b4C39bA9",
    color: "#8247E5",
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum",
    shortName: "ARB",
    rpcEnvKey: "RPC_URL_ARBITRUM",
    fallbackRpc: "https://arb1.arbitrum.io/rpc",
    paraswapNetwork: 42161,
    cctpDomain: 3,
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    tokenMessenger: "0x19330d10D9Cc8751218eaf51E8885D058642E08A",
    messageTransmitter: "0xC30362313FBBA5cf9163F0bb16a0e01f01A896ca",
    color: "#28A0F0",
  },
  10: {
    chainId: 10,
    name: "Optimism",
    shortName: "OP",
    rpcEnvKey: "RPC_URL_OPTIMISM",
    fallbackRpc: "https://optimism.llamarpc.com",
    paraswapNetwork: 10,
    cctpDomain: 2,
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    weth: "0x4200000000000000000000000000000000000006",
    tokenMessenger: "0x2B4069517957735bE00ceE0fadAE88a26365528f",
    messageTransmitter: "0x4D41f22c5a0e5c74090899E5a8Fb597a8842b3e8",
    color: "#FF0420",
  },
};

export const CHAIN_ORDER = [1, 8453, 137, 42161, 10];

/**
 * Per-chain token lists for scanning.
 */
export const CHAIN_TOKENS = {
  1: [
    { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
    { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    { symbol: "DAI",  address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
    { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  ],
  8453: [
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    { symbol: "DAI",  address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
  ],
  137: [
    { symbol: "WETH", address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
    { symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
    { symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
    { symbol: "DAI",  address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18 },
    { symbol: "WBTC", address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 },
  ],
  42161: [
    { symbol: "WETH", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
    { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
    { symbol: "DAI",  address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18 },
    { symbol: "WBTC", address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", decimals: 8 },
  ],
  10: [
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    { symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
    { symbol: "USDT", address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6 },
    { symbol: "DAI",  address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18 },
  ],
};

/**
 * Per-chain scan pairs — sized for realistic flash loan execution.
 * Wallet only needs gas; Aave V3 flash loan supplies the trade capital.
 * Sizes target ~$12-15k notional which fits major V3/V2/Curve pools without
 * exhausting liquidity, while producing meaningful absolute profits.
 */
export const CHAIN_SCAN_PAIRS = {
  1: [
    { from: 0, to: 1, amount: "5",     label: "WETH/USDC" },
    { from: 1, to: 0, amount: "12500", label: "USDC/WETH" },
    { from: 0, to: 2, amount: "5",     label: "WETH/USDT" },
    { from: 0, to: 3, amount: "5",     label: "WETH/DAI"  },
    { from: 0, to: 4, amount: "5",     label: "WETH/WBTC" },
    { from: 1, to: 2, amount: "12500", label: "USDC/USDT" },
    { from: 1, to: 3, amount: "12500", label: "USDC/DAI"  },
    { from: 4, to: 1, amount: "0.18",  label: "WBTC/USDC" },
  ],
  8453: [
    { from: 0, to: 1, amount: "5",     label: "WETH/USDC" },
    { from: 1, to: 0, amount: "12500", label: "USDC/WETH" },
    { from: 0, to: 2, amount: "5",     label: "WETH/DAI"  },
  ],
  137: [
    { from: 0, to: 1, amount: "5",     label: "WETH/USDC" },
    { from: 1, to: 0, amount: "12500", label: "USDC/WETH" },
    { from: 0, to: 2, amount: "5",     label: "WETH/USDT" },
    { from: 0, to: 3, amount: "5",     label: "WETH/DAI"  },
    { from: 1, to: 2, amount: "12500", label: "USDC/USDT" },
  ],
  42161: [
    { from: 0, to: 1, amount: "5",     label: "WETH/USDC" },
    { from: 1, to: 0, amount: "12500", label: "USDC/WETH" },
    { from: 0, to: 2, amount: "5",     label: "WETH/USDT" },
    { from: 0, to: 3, amount: "5",     label: "WETH/DAI"  },
    { from: 1, to: 4, amount: "12500", label: "USDC/WBTC" },
  ],
  10: [
    { from: 0, to: 1, amount: "5",     label: "WETH/USDC" },
    { from: 1, to: 0, amount: "12500", label: "USDC/WETH" },
    { from: 0, to: 2, amount: "5",     label: "WETH/USDT" },
    { from: 0, to: 3, amount: "5",     label: "WETH/DAI"  },
  ],
};

/**
 * Per-chain DEX protocols for per-DEX quotes (legacy — used by Paraswap execution path).
 */
export const CHAIN_PROTOCOLS = {
  1: ["UNISWAP_V3", "UNISWAP_V2", "SUSHI_V2", "CURVE_V2", "BALANCER_V2"],
  8453: ["UNISWAP_V3", "SUSHI_V3", "PANCAKESWAP_V3", "CURVE_V2"],
  137: ["UNISWAP_V3", "SUSHI_V2", "CURVE_V2", "BALANCER_V2"],
  42161: ["UNISWAP_V3", "SUSHI_V2", "CURVE_V2", "PANCAKESWAP_V3"],
  10: ["UNISWAP_V3", "SUSHI_V2", "CURVE_V2"],
};

// ── On-chain DEX constants (for Multicall3 price reader) ──────────────

export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

export const V3_FEE_TIERS = [100, 500, 3000, 10000];

/**
 * DEX factory addresses per chain.
 * Keys: UNISWAP_V3, UNISWAP_V2, SUSHI_V2, PANCAKESWAP_V3
 */
export const DEX_FACTORIES = {
  1: {
    UNISWAP_V3:    "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    UNISWAP_V2:    "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    SUSHI_V2:      "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
  },
  8453: {
    UNISWAP_V3:    "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    PANCAKESWAP_V3:"0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
  },
  137: {
    UNISWAP_V3:    "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    SUSHI_V2:      "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
  },
  42161: {
    UNISWAP_V3:    "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    SUSHI_V2:      "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
    PANCAKESWAP_V3:"0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
  },
  10: {
    UNISWAP_V3:    "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    SUSHI_V2:      "0xFbc12984689e5f15626Bad03Ad60160Fe98B303C",
  },
};

/**
 * Init code hashes for CREATE2 pool address computation.
 */
export const INIT_CODE_HASHES = {
  UNISWAP_V3:     "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54",
  UNISWAP_V2:     "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f",
  SUSHI_V2:        "0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303",
  PANCAKESWAP_V3: "0x6ce8eb472fa82df5469c6ab6d485f17c3ad13c8cd7af59b3d4a8026c5ce0f7e2",
};

/**
 * Curve pools — hardcoded addresses + coin indices per chain.
 * Each entry: { address, i, j, tokenIn, tokenOut, label }
 * i/j are the Curve pool coin indices.
 */
export const CURVE_POOLS = {
  1: [
    // 3Pool: DAI=0, USDC=1, USDT=2 — uses int128 indices
    { address: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7", i: 1, j: 2, tokenIn: "USDC", tokenOut: "USDT", label: "Curve 3Pool USDC/USDT", decimalsIn: 6, decimalsOut: 6, useUint256: false },
    { address: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7", i: 1, j: 0, tokenIn: "USDC", tokenOut: "DAI",  label: "Curve 3Pool USDC/DAI",  decimalsIn: 6, decimalsOut: 18, useUint256: false },
    // tricrypto2: USDT=0, WBTC=1, WETH=2 — uses uint256 indices
    { address: "0xD51a44d3FaE010294C616388b506AcdA1bfAAE46", i: 0, j: 2, tokenIn: "USDT", tokenOut: "WETH", label: "Curve tricrypto2 USDT/WETH", decimalsIn: 6, decimalsOut: 18, useUint256: true },
    { address: "0xD51a44d3FaE010294C616388b506AcdA1bfAAE46", i: 0, j: 1, tokenIn: "USDT", tokenOut: "WBTC", label: "Curve tricrypto2 USDT/WBTC", decimalsIn: 6, decimalsOut: 8, useUint256: true },
  ],
};

/**
 * Get chain config by chainId.
 * @param {number} chainId
 * @returns {object|undefined}
 */
export function getChain(chainId) {
  return CHAINS[chainId];
}

/**
 * Get all supported chain IDs.
 * @returns {number[]}
 */
export function getAllChainIds() {
  return CHAIN_ORDER;
}
