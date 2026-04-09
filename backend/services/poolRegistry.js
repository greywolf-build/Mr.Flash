/**
 * Pool Registry — precomputes pool addresses via CREATE2 for V3/V2 DEXes,
 * stores hardcoded Curve pool configs, pre-encodes calldata, and validates
 * pool existence at startup via a single Multicall3 probe.
 */

import { ethers } from "ethers";
import { getProviderForChain } from "./multiProvider.js";
import {
  CHAIN_TOKENS,
  CHAIN_SCAN_PAIRS,
  DEX_FACTORIES,
  INIT_CODE_HASHES,
  V3_FEE_TIERS,
  CURVE_POOLS,
  MULTICALL3_ADDRESS,
} from "./chainConfig.js";

// ── ABI fragments for calldata encoding ──────────────────────────────

const SLOT0_SELECTOR = "0x3850c7bd"; // slot0()
const GET_RESERVES_SELECTOR = "0x0902f1ac"; // getReserves()

// Curve get_dy — StableSwap uses int128 indices, CryptoSwap uses uint256
const GET_DY_INT128 = new ethers.Interface([
  "function get_dy(int128 i, int128 j, uint256 dx) view returns (uint256)",
]);
const GET_DY_UINT256 = new ethers.Interface([
  "function get_dy(uint256 i, uint256 j, uint256 dx) view returns (uint256)",
]);

// Multicall3 aggregate3
const MULTICALL3_IFACE = new ethers.Interface([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])",
]);

// ── CREATE2 address computation ──────────────────────────────────────

function sortTokens(tokenA, tokenB) {
  return tokenA.toLowerCase() < tokenB.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];
}

function computeV3PoolAddress(factory, tokenA, tokenB, fee, initCodeHash) {
  const [token0, token1] = sortTokens(tokenA, tokenB);
  const salt = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint24"],
      [token0, token1, fee]
    )
  );
  return ethers.getCreate2Address(factory, salt, initCodeHash);
}

function computeV2PoolAddress(factory, tokenA, tokenB, initCodeHash) {
  const [token0, token1] = sortTokens(tokenA, tokenB);
  const salt = ethers.keccak256(
    ethers.solidityPacked(["address", "address"], [token0, token1])
  );
  return ethers.getCreate2Address(factory, salt, initCodeHash);
}

// ── Pool Registry ────────────────────────────────────────────────────

export class PoolRegistry {
  constructor(chainId) {
    this.chainId = chainId;
    this.pools = []; // validated pool entries
  }

  /**
   * Build candidate pools, then validate via Multicall3.
   * @returns {number} count of valid pools
   */
  async initialize() {
    const candidates = this._buildCandidates();
    if (candidates.length === 0) {
      console.log(`[poolRegistry] Chain ${this.chainId}: no candidate pools`);
      return 0;
    }

    this.pools = await this._validatePools(candidates);
    console.log(
      `[poolRegistry] Chain ${this.chainId}: ${this.pools.length}/${candidates.length} pools valid`
    );
    return this.pools.length;
  }

  /**
   * Build candidate pool list from scan pairs × DEX factories × fee tiers.
   */
  _buildCandidates() {
    const tokens = CHAIN_TOKENS[this.chainId];
    const scanPairs = CHAIN_SCAN_PAIRS[this.chainId];
    const factories = DEX_FACTORIES[this.chainId] || {};

    if (!tokens || !scanPairs) return [];

    const candidates = [];

    for (const pair of scanPairs) {
      const tokenIn = tokens[pair.from];
      const tokenOut = tokens[pair.to];

      // V3 DEXes — one pool per fee tier
      for (const [dexName, factory] of Object.entries(factories)) {
        const hashKey = dexName.includes("PANCAKESWAP") ? "PANCAKESWAP_V3" : dexName;
        const initHash = INIT_CODE_HASHES[hashKey];
        if (!initHash) continue;

        if (dexName.includes("V3")) {
          // V3: compute one pool per fee tier
          for (const fee of V3_FEE_TIERS) {
            const poolAddr = computeV3PoolAddress(
              factory, tokenIn.address, tokenOut.address, fee, initHash
            );
            const [token0] = sortTokens(tokenIn.address, tokenOut.address);
            const invert = tokenIn.address.toLowerCase() !== token0.toLowerCase();

            candidates.push({
              type: "v3",
              dex: dexName,
              pair: pair.label,
              fee,
              address: poolAddr,
              tokenIn,
              tokenOut,
              invert, // true = tokenIn is token1 (need to invert sqrtPrice)
              calldata: SLOT0_SELECTOR, // slot0() has no args
              amount: pair.amount,
            });
          }
        } else if (dexName.includes("V2")) {
          // V2: single pool per pair
          const poolAddr = computeV2PoolAddress(
            factory, tokenIn.address, tokenOut.address, initHash
          );
          const [token0] = sortTokens(tokenIn.address, tokenOut.address);
          const invert = tokenIn.address.toLowerCase() !== token0.toLowerCase();

          candidates.push({
            type: "v2",
            dex: dexName,
            pair: pair.label,
            fee: 3000, // 0.3% standard V2 fee
            address: poolAddr,
            tokenIn,
            tokenOut,
            invert, // true = tokenIn is token1
            calldata: GET_RESERVES_SELECTOR,
            amount: pair.amount,
          });
        }
      }
    }

    // Curve pools — hardcoded, no CREATE2
    const curvePools = CURVE_POOLS[this.chainId] || [];
    for (const cp of curvePools) {
      // Match against scan pairs
      const matchingPair = scanPairs.find((p) => {
        const tIn = tokens[p.from];
        const tOut = tokens[p.to];
        return tIn.symbol === cp.tokenIn && tOut.symbol === cp.tokenOut;
      });
      if (!matchingPair) continue;

      const dx = ethers.parseUnits(matchingPair.amount, cp.decimalsIn);
      candidates.push({
        type: "curve",
        dex: "CURVE",
        pair: `${cp.tokenIn}/${cp.tokenOut}`,
        fee: 0,
        address: cp.address,
        tokenIn: { symbol: cp.tokenIn, decimals: cp.decimalsIn, address: tokens[matchingPair.from].address },
        tokenOut: { symbol: cp.tokenOut, decimals: cp.decimalsOut, address: tokens[matchingPair.to].address },
        invert: false,
        calldata: cp.useUint256
          ? GET_DY_UINT256.encodeFunctionData("get_dy", [cp.i, cp.j, dx])
          : GET_DY_INT128.encodeFunctionData("get_dy", [cp.i, cp.j, dx]),
        amount: matchingPair.amount,
        label: cp.label,
      });
    }

    return candidates;
  }

  /**
   * Validate pool existence by probing each address via Multicall3.
   * Uses a lightweight call (extcodesize equivalent: call to each pool).
   * Pools that revert or return empty are filtered out.
   */
  async _validatePools(candidates) {
    const provider = getProviderForChain(this.chainId);

    // Build Multicall3 calls — each pool gets its own read call
    const calls = candidates.map((c) => ({
      target: c.address,
      allowFailure: true,
      callData: c.calldata,
    }));

    const multicallData = MULTICALL3_IFACE.encodeFunctionData("aggregate3", [calls]);

    let resultData;
    try {
      resultData = await provider.call({
        to: MULTICALL3_ADDRESS,
        data: multicallData,
      });
    } catch (err) {
      console.warn(
        `[poolRegistry] Chain ${this.chainId}: Multicall3 validation failed, keeping all candidates: ${err.message}`
      );
      return candidates;
    }

    const [results] = MULTICALL3_IFACE.decodeFunctionResult("aggregate3", resultData);

    const valid = [];
    for (let i = 0; i < candidates.length; i++) {
      const { success, returnData } = results[i];
      // A pool exists if the call succeeded and returned data
      if (success && returnData && returnData.length > 2) {
        valid.push(candidates[i]);
      }
    }

    return valid;
  }

  /**
   * Get all validated pools for this chain.
   * @returns {Array} pool entries
   */
  getPools() {
    return this.pools;
  }

  /**
   * Get Multicall3 call tuples for all pools (for use in aggregate3).
   * @returns {Array<{target, allowFailure, callData}>}
   */
  getMulticallEntries() {
    return this.pools.map((p) => ({
      target: p.address,
      allowFailure: true,
      callData: p.calldata,
    }));
  }
}
