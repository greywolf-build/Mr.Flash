/**
 * On-Chain Price Reader — reads all DEX prices for a chain in a single
 * Multicall3 aggregate3() call, then decodes results into price data.
 *
 * Replaces per-DEX Paraswap API calls for the detection layer.
 */

import { ethers } from "ethers";
import { getProviderForChain } from "./multiProvider.js";
import { MULTICALL3_ADDRESS } from "./chainConfig.js";
import { PoolRegistry } from "./poolRegistry.js";

// ── ABI for Multicall3 ──────────────────────────────────────────────

const MULTICALL3_IFACE = new ethers.Interface([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])",
]);

// ── Price math constants ────────────────────────────────────────────

const Q96 = 1n << 96n;
const Q192 = Q96 * Q96;
const V2_FEE_NUMERATOR = 997n;
const V2_FEE_DENOMINATOR = 1000n;

// ── Decoder helpers ─────────────────────────────────────────────────

/**
 * Decode V3 slot0 → sqrtPriceX96, then convert to output amount.
 * sqrtPriceX96 = sqrt(token1/token0) * 2^96
 */
function decodeV3Price(returnData, pool) {
  if (returnData.length < 66) return null; // slot0 returns at least sqrtPriceX96 + tick

  // slot0 returns (uint160 sqrtPriceX96, int24 tick, ...)
  // We only need sqrtPriceX96 (first 32 bytes of return data)
  const sqrtPriceX96 = BigInt("0x" + returnData.slice(2, 66));
  if (sqrtPriceX96 === 0n) return null;

  const amountIn = ethers.parseUnits(pool.amount, pool.tokenIn.decimals);

  // price = (sqrtPriceX96)^2 / 2^192 = token1 per token0
  // If !invert: tokenIn=token0, tokenOut=token1 → output = amountIn * price
  // If invert:  tokenIn=token1, tokenOut=token0 → output = amountIn / price
  let amountOut;
  if (!pool.invert) {
    // tokenIn is token0: output = amountIn * sqrtPriceX96^2 / 2^192
    amountOut = (amountIn * sqrtPriceX96 * sqrtPriceX96) / Q192;
  } else {
    // tokenIn is token1: output = amountIn * 2^192 / sqrtPriceX96^2
    amountOut = (amountIn * Q192) / (sqrtPriceX96 * sqrtPriceX96);
  }

  // Apply V3 fee (pool.fee is in hundredths of a bip, e.g. 3000 = 0.3%)
  const feeAmount = (amountOut * BigInt(pool.fee)) / 1000000n;
  amountOut -= feeAmount;

  return parseFloat(ethers.formatUnits(amountOut, pool.tokenOut.decimals));
}

/**
 * Decode V2 getReserves → (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)
 * Uses spot price (reserve ratio) with 0.3% fee — consistent with V3 spot price math.
 * Avoids massive slippage distortion when scan amounts exceed pool liquidity.
 */
function decodeV2Price(returnData, pool) {
  if (returnData.length < 194) return null; // 3 × 32 bytes + 0x prefix

  const reserve0 = BigInt("0x" + returnData.slice(2, 66));
  const reserve1 = BigInt("0x" + returnData.slice(66, 130));

  if (reserve0 === 0n || reserve1 === 0n) return null;

  const amountIn = ethers.parseUnits(pool.amount, pool.tokenIn.decimals);

  // Determine reserveIn/reserveOut based on token order
  let reserveIn, reserveOut;
  if (!pool.invert) {
    reserveIn = reserve0;
    reserveOut = reserve1;
  } else {
    reserveIn = reserve1;
    reserveOut = reserve0;
  }

  // Reject ghost/dead pools: require reserveIn >= 3× scan amount so the
  // pool can absorb our swap without ridiculous slippage. This also filters
  // out stale pools that haven't traded in weeks and carry distorted prices.
  if (reserveIn < amountIn * 3n) return null;

  // Spot price with fee: amountOut = amountIn * (reserveOut / reserveIn) * 0.997
  // This matches V3's spot price approach for fair cross-DEX comparison
  const amountOut = (amountIn * reserveOut * V2_FEE_NUMERATOR) / (reserveIn * V2_FEE_DENOMINATOR);

  return parseFloat(ethers.formatUnits(amountOut, pool.tokenOut.decimals));
}

/**
 * Decode Curve get_dy → uint256 (direct output amount).
 */
function decodeCurvePrice(returnData, pool) {
  if (returnData.length < 66) return null;

  const amountOut = BigInt("0x" + returnData.slice(2, 66));
  if (amountOut === 0n) return null;

  return parseFloat(ethers.formatUnits(amountOut, pool.tokenOut.decimals));
}

// ── Price Reader ────────────────────────────────────────────────────

export class OnChainPriceReader {
  constructor() {
    this.registries = new Map(); // chainId → PoolRegistry
  }

  /**
   * Initialize pool registry for a chain. Must be called before readAllPrices.
   * @param {number} chainId
   * @returns {number} valid pool count
   */
  async initChain(chainId) {
    const registry = new PoolRegistry(chainId);
    const count = await registry.initialize();
    this.registries.set(chainId, registry);
    return count;
  }

  /**
   * Read all DEX prices for a chain in a single Multicall3 call.
   * @param {number} chainId
   * @returns {Map<string, Map<string, {toAmountFloat, fee}>>}
   *   Map of pair → Map of dexName → { toAmountFloat, fee }
   *   For V3 DEXes with multiple fee tiers, only the best is kept.
   */
  async readAllPrices(chainId) {
    const registry = this.registries.get(chainId);
    if (!registry) throw new Error(`Chain ${chainId} not initialized`);

    const pools = registry.getPools();
    if (pools.length === 0) return new Map();

    const entries = registry.getMulticallEntries();

    // Single Multicall3 call
    const provider = getProviderForChain(chainId);
    const multicallData = MULTICALL3_IFACE.encodeFunctionData("aggregate3", [entries]);

    let resultData;
    try {
      resultData = await provider.call({
        to: MULTICALL3_ADDRESS,
        data: multicallData,
      });
    } catch (err) {
      console.warn(`[priceReader] Chain ${chainId} Multicall3 failed: ${err.message}`);
      return new Map();
    }

    const [results] = MULTICALL3_IFACE.decodeFunctionResult("aggregate3", resultData);

    // Decode results and group by pair → dex
    // For V3: keep best fee tier per dex per pair
    const prices = new Map(); // pair → Map<dex, { toAmountFloat, fee }>

    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      const { success, returnData } = results[i];

      if (!success) continue;

      let outputFloat;
      switch (pool.type) {
        case "v3":
          outputFloat = decodeV3Price(returnData, pool);
          break;
        case "v2":
          outputFloat = decodeV2Price(returnData, pool);
          break;
        case "curve":
          outputFloat = decodeCurvePrice(returnData, pool);
          break;
      }

      if (outputFloat === null || outputFloat <= 0 || !isFinite(outputFloat)) continue;

      if (!prices.has(pool.pair)) prices.set(pool.pair, new Map());
      const pairMap = prices.get(pool.pair);

      const existing = pairMap.get(pool.dex);
      if (!existing || outputFloat > existing.toAmountFloat) {
        pairMap.set(pool.dex, {
          toAmountFloat: outputFloat,
          fee: pool.fee,
          tokenIn: pool.tokenIn,
          tokenOut: pool.tokenOut,
          amount: pool.amount,
        });
      }
    }

    return prices;
  }
}
