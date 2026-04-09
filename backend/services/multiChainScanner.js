/**
 * Multi-Chain Scanner — parallel per-chain scanning + cross-chain opportunity detection.
 * Uses on-chain Multicall3 reads (1 RPC call per chain) instead of Paraswap API.
 * Paraswap is kept only for execution calldata (in executor.js).
 */

import { EventEmitter } from "events";
import { ethers } from "ethers";
import { ParaswapClient } from "./paraswapClient.js";
import { OnChainPriceReader } from "./onChainPriceReader.js";
import { getProviderForChain, getWalletForChain } from "./multiProvider.js";
import { CHAINS, CHAIN_TOKENS, CHAIN_SCAN_PAIRS } from "./chainConfig.js";

const ERC20_BALANCE_ABI = ["function balanceOf(address) view returns (uint256)"];

// Minimum gas balance to consider a chain "funded" (in native token)
const MIN_GAS_BALANCE = {
  1: 0.0005,    // 0.0005 ETH — plenty at <1 gwei gas
  8453: 0.001,  // 0.001 ETH on Base (~$2.50)
  137: 1.0,     // 1 POL (~$0.50)
  42161: 0.001, // 0.001 ETH on Arb (~$2.50)
  10: 0.001,    // 0.001 ETH on OP (~$2.50)
};

const FLASH_LOAN_GAS_ESTIMATE = 250_000; // conservative gas estimate for flash loan arb tx
const CROSS_CHAIN_SPREAD_THRESHOLD = 0.05; // 0.05% minimum spread
const BRIDGE_COST_USDC = 5; // ~$5 CCTP gas cost estimate
const BRIDGE_TIME_MINUTES = 15;
const ETH_PRICE_USD = 2500;

export class MultiChainScanner extends EventEmitter {
  constructor() {
    super();
    this.activeChains = new Set([1]); // default: Ethereum only
    this.clients = new Map(); // ParaswapClients — kept for execution path
    this.priceReader = new OnChainPriceReader();
    this.latest = [];
    this.balances = {}; // { chainId: { native: "0.05", usdc: "1500.00" } }
    this._interval = null;
    this._polling = false;
    this._initialized = new Set(); // chains with initialized pool registries
  }

  /**
   * Set active chains — called from WS message handler.
   * Initializes pool registries for newly activated chains.
   * @param {number[]} chainIds
   */
  async setActiveChains(chainIds) {
    const newSet = new Set(chainIds.filter((id) => CHAINS[id]));

    // Destroy clients for deactivated chains
    for (const id of this.activeChains) {
      if (!newSet.has(id) && this.clients.has(id)) {
        this.clients.get(id).destroy();
        this.clients.delete(id);
      }
    }

    this.activeChains = newSet;

    // Initialize pool registries for newly active chains
    for (const id of newSet) {
      if (!this._initialized.has(id)) {
        try {
          const count = await this.priceReader.initChain(id);
          this._initialized.add(id);
          console.log(`[multichain] Initialized ${count} pools for chain ${id}`);
        } catch (err) {
          console.warn(`[multichain] Failed to init pools for chain ${id}: ${err.message}`);
        }
      }
    }

    console.log(`[multichain] Active chains: ${[...this.activeChains].join(", ")}`);
  }

  /**
   * Get or create a ParaswapClient for the given chain (used for execution only).
   * @param {number} chainId
   * @returns {ParaswapClient}
   */
  _getClient(chainId) {
    if (!this.clients.has(chainId)) {
      const chain = CHAINS[chainId];
      if (!chain) throw new Error(`Unknown chain: ${chainId}`);
      this.clients.set(chainId, new ParaswapClient(1, chain.paraswapNetwork));
    }
    return this.clients.get(chainId);
  }

  /**
   * Start scanning. Initializes pool registries for active chains first.
   * @param {number} intervalMs — scan interval in ms (default 5s)
   */
  async start(intervalMs = 5_000) {
    console.log(`[multichain] Starting scanner (interval: ${intervalMs}ms)`);

    // Initialize pool registries for all currently active chains
    for (const chainId of this.activeChains) {
      if (!this._initialized.has(chainId)) {
        try {
          const count = await this.priceReader.initChain(chainId);
          this._initialized.add(chainId);
          console.log(`[multichain] Initialized ${count} pools for chain ${chainId}`);
        } catch (err) {
          console.warn(`[multichain] Failed to init pools for chain ${chainId}: ${err.message}`);
        }
      }
    }

    this._poll();
    this._interval = setInterval(() => this._poll(), intervalMs);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    for (const client of this.clients.values()) {
      client.destroy();
    }
    this.clients.clear();
  }

  async _poll() {
    if (this._polling) return; // prevent overlapping scans
    this._polling = true;

    try {
      const chainIds = [...this.activeChains];
      if (chainIds.length === 0) {
        this.latest = [];
        this.emit("opportunities", []);
        return;
      }

      const scanStart = Date.now();

      // Phase 1 — Per-chain scan (parallel) via Multicall3
      const chainResults = await Promise.allSettled(
        chainIds.map((chainId) => this._scanChain(chainId))
      );

      const allOpportunities = [];
      const priceDataByPair = {}; // { "WETH/USDC": [{ chainId, bestPrice, worstPrice, bestDex, worstDex }] }

      for (let i = 0; i < chainIds.length; i++) {
        const result = chainResults[i];
        if (result.status !== "fulfilled") {
          console.warn(`[multichain] Chain ${chainIds[i]} scan failed:`, result.reason?.message);
          continue;
        }
        const { opportunities, priceData } = result.value;
        allOpportunities.push(...opportunities);

        // Collect price data for cross-chain comparison
        for (const [pair, data] of Object.entries(priceData)) {
          if (!priceDataByPair[pair]) priceDataByPair[pair] = [];
          priceDataByPair[pair].push({ chainId: chainIds[i], ...data });
        }
      }

      // Phase 2 — Cross-chain comparison
      const crossChainOpps = this._findCrossChainOpportunities(priceDataByPair);
      allOpportunities.push(...crossChainOpps);

      // Phase 3 — Fetch wallet balances and annotate opportunities
      let balances = {};
      try {
        balances = await this._fetchBalances(chainIds);
      } catch (err) {
        console.warn(`[multichain] Balance fetch error: ${err.message}`);
      }
      this.balances = balances;

      for (const opp of allOpportunities) {
        const { walletFunded, fundingIssue } = this._checkFunding(opp, balances);
        opp.walletFunded = walletFunded;
        opp.fundingIssue = fundingIssue;
      }

      // Phase 4 — Sort by netProfitUsdc desc
      allOpportunities.sort((a, b) => (b.netProfitUsdc || 0) - (a.netProfitUsdc || 0));

      this.latest = allOpportunities;
      this.emit("opportunities", allOpportunities);

      const scanMs = Date.now() - scanStart;
      console.log(`[multichain] Scan complete: ${allOpportunities.length} opportunities in ${scanMs}ms`);

      // Emit per-chain gas data
      const gasData = {};
      for (const chainId of chainIds) {
        try {
          const provider = getProviderForChain(chainId);
          const feeData = await provider.getFeeData();
          const gwei = parseFloat(ethers.formatUnits(feeData.gasPrice || 0n, "gwei"));
          gasData[chainId] = gwei.toFixed(2);
        } catch {
          gasData[chainId] = "0";
        }
      }
      this.emit("gas", gasData);

      // Emit wallet balances
      this.emit("balances", balances);
    } catch (err) {
      console.error("[multichain] Scan error:", err.message);
    } finally {
      this._polling = false;
    }
  }

  /**
   * Fetch native gas token + USDC balance on each active chain.
   * @param {number[]} chainIds
   * @returns {Object} { chainId: { native, nativeFloat, usdc, usdcFloat } }
   */
  async _fetchBalances(chainIds) {
    const balances = {};

    await Promise.allSettled(chainIds.map(async (chainId) => {
      const chain = CHAINS[chainId];
      if (!chain) return;

      try {
        const wallet = getWalletForChain(chainId);
        const address = await wallet.getAddress();
        const provider = getProviderForChain(chainId);

        // Native gas balance
        const nativeWei = await provider.getBalance(address);
        const nativeFloat = parseFloat(ethers.formatEther(nativeWei));

        // USDC balance
        const usdc = new ethers.Contract(chain.usdc, ERC20_BALANCE_ABI, provider);
        const usdcRaw = await usdc.balanceOf(address);
        const usdcFloat = parseFloat(ethers.formatUnits(usdcRaw, 6));

        balances[chainId] = {
          native: nativeFloat.toFixed(6),
          nativeFloat,
          usdc: usdcFloat.toFixed(2),
          usdcFloat,
          hasGas: nativeFloat >= (MIN_GAS_BALANCE[chainId] || 0.001),
          hasUsdc: usdcFloat >= 1, // at least $1 USDC
        };
      } catch (err) {
        console.warn(`[multichain] Balance fetch failed for ${chain.shortName}: ${err.message}`);
        balances[chainId] = {
          native: "0", nativeFloat: 0,
          usdc: "0", usdcFloat: 0,
          hasGas: false, hasUsdc: false,
          error: err.message,
        };
      }
    }));

    return balances;
  }

  /**
   * Check if an opportunity is executable given current wallet balances.
   * Same-chain: only needs gas on that chain (flash loan covers capital).
   * Cross-chain: needs gas on both chains + USDC on buy chain.
   */
  _checkFunding(opp, balances) {
    if (opp.type === "same-chain") {
      const bal = balances[opp.chainId];
      if (!bal) return { walletFunded: false, fundingIssue: "Balance unknown" };
      if (!bal.hasGas) {
        const chain = CHAINS[opp.chainId];
        const gasToken = opp.chainId === 137 ? "POL" : "ETH";
        return {
          walletFunded: false,
          fundingIssue: `Need ${gasToken} on ${chain.shortName} for gas`,
        };
      }
      return { walletFunded: true, fundingIssue: null };
    }

    // Cross-chain
    const buyBal = balances[opp.chainId];
    const sellBal = balances[opp.destChainId];
    const issues = [];

    if (!buyBal?.hasGas) {
      const gasToken = opp.chainId === 137 ? "POL" : "ETH";
      issues.push(`${gasToken} on ${CHAINS[opp.chainId]?.shortName || opp.chainId}`);
    }
    if (!sellBal?.hasGas) {
      const gasToken = opp.destChainId === 137 ? "POL" : "ETH";
      issues.push(`${gasToken} on ${CHAINS[opp.destChainId]?.shortName || opp.destChainId}`);
    }
    if (!buyBal?.hasUsdc) {
      issues.push(`USDC on ${CHAINS[opp.chainId]?.shortName || opp.chainId}`);
    }

    if (issues.length > 0) {
      return {
        walletFunded: false,
        fundingIssue: `Need ${issues.join(" + ")}`,
      };
    }
    return { walletFunded: true, fundingIssue: null };
  }

  /**
   * Scan a single chain for same-chain arbitrage opportunities.
   * Uses on-chain Multicall3 reads — one RPC call gets all DEX prices.
   * @param {number} chainId
   * @returns {{ opportunities: Array, priceData: Object }}
   */
  async _scanChain(chainId) {
    const chain = CHAINS[chainId];
    const tokens = CHAIN_TOKENS[chainId];
    const scanPairs = CHAIN_SCAN_PAIRS[chainId];

    if (!tokens || !scanPairs) return { opportunities: [], priceData: {} };

    // Get gas price
    let gasPrice = 0n;
    try {
      const provider = getProviderForChain(chainId);
      const feeData = await provider.getFeeData();
      gasPrice = feeData.gasPrice || 0n;
    } catch {
      // Use 0 if we can't get gas price
    }

    // Single Multicall3 read for all pools on this chain
    let pricesByPair;
    try {
      pricesByPair = await this.priceReader.readAllPrices(chainId);
    } catch (err) {
      console.warn(`[multichain] Chain ${chainId} price read failed: ${err.message}`);
      return { opportunities: [], priceData: {} };
    }

    const opportunities = [];
    const priceData = {};

    // Process each scan pair
    for (const pair of scanPairs) {
      const tokenIn = tokens[pair.from];
      const tokenOut = tokens[pair.to];
      const dexPrices = pricesByPair.get(pair.label);

      if (!dexPrices || dexPrices.size === 0) continue;

      // Build dexQuotes in the same shape as before
      const dexQuotes = {};
      for (const [dexName, data] of dexPrices) {
        dexQuotes[dexName] = {
          toAmount: ethers.parseUnits(data.toAmountFloat.toFixed(tokenOut.decimals > 8 ? 18 : tokenOut.decimals), tokenOut.decimals).toString(),
          toAmountFloat: data.toAmountFloat,
          gas: FLASH_LOAN_GAS_ESTIMATE,
        };
      }

      const rawDexCount = Object.keys(dexQuotes).length;
      if (rawDexCount === 0) continue;

      // Filter outlier quotes BEFORE using any price: V2 reserves and V3
      // slot0 can return garbage from stale/illiquid pools. Discard any
      // quote >10% away from the median. This must run before priceInfo so
      // cross-chain comparison also sees cleaned prices.
      let dexEntries = Object.entries(dexQuotes);
      if (rawDexCount >= 2) {
        const amounts = dexEntries.map((e) => e[1].toAmountFloat).sort((a, b) => a - b);
        const median = amounts[Math.floor(amounts.length / 2)];
        dexEntries = dexEntries.filter((e) => {
          const deviation = Math.abs(e[1].toAmountFloat - median) / median;
          return deviation < 0.1; // within 10% of median
        });
      }

      const cleanedQuotes = Object.fromEntries(dexEntries);
      const dexCount = dexEntries.length;

      // Price info for cross-chain comparison — uses CLEANED quotes
      const priceInfo = dexCount > 0
        ? {
            bestPrice: Math.max(...dexEntries.map(([, q]) => q.toAmountFloat)),
            worstPrice: Math.min(...dexEntries.map(([, q]) => q.toAmountFloat)),
            bestDex: dexEntries.reduce((a, b) => (b[1].toAmountFloat > a[1].toAmountFloat ? b : a))[0],
            worstDex: dexEntries.reduce((a, b) => (b[1].toAmountFloat < a[1].toAmountFloat ? b : a))[0],
            tokenIn,
            tokenOut,
            amount: pair.amount,
          }
        : null;

      if (priceInfo) priceData[pair.label] = priceInfo;

      if (dexCount < 2) continue;

      // Find best and worst DEX
      let bestDex = dexEntries[0];
      let worstDex = dexEntries[0];

      for (const entry of dexEntries) {
        if (entry[1].toAmountFloat > bestDex[1].toAmountFloat) bestDex = entry;
        if (entry[1].toAmountFloat < worstDex[1].toAmountFloat) worstDex = entry;
      }

      const spread = bestDex[1].toAmountFloat - worstDex[1].toAmountFloat;
      const spreadPct = (spread / worstDex[1].toAmountFloat) * 100;

      // Minimum spread must cover round-trip costs:
      //   second-leg DEX fee (~0.3%) + Aave premium (0.05%) + sell buffer (0.1%)
      //   + Paraswap routing/slippage gap (~0.5%) ≈ 1.0%
      // On-chain reads overestimate spreads vs actual Paraswap execution.
      if (spreadPct < 1.0) continue;

      // Gas cost
      const totalGasUnits = BigInt(FLASH_LOAN_GAS_ESTIMATE);
      const gasCostWei = gasPrice * totalGasUnits;
      const gasCostEth = parseFloat(ethers.formatEther(gasCostWei));

      // Convert to USDC profit
      let profitEth = spread;
      let profitUsdc = 0;

      if (["USDC", "USDT", "DAI"].includes(tokenOut.symbol)) {
        profitUsdc = spread;
        profitEth = spread / ETH_PRICE_USD;
      } else {
        profitEth = spread;
        profitUsdc = spread * ETH_PRICE_USD;
      }

      const gasCostUsdc = gasCostEth * ETH_PRICE_USD;
      const netProfitEth = profitEth - gasCostEth;
      const netProfitUsdc = profitUsdc - gasCostUsdc;

      opportunities.push({
        id: `dex-${chain.shortName}-${pair.label}-${Date.now()}`,
        type: "same-chain",
        chainId,
        chainName: chain.name,
        chainShortName: chain.shortName,
        pair: pair.label,
        buyDex: worstDex[0],
        sellDex: bestDex[0],
        buyPrice: worstDex[1].toAmountFloat.toFixed(6),
        sellPrice: bestDex[1].toAmountFloat.toFixed(6),
        spread: spreadPct.toFixed(4),
        amountIn: pair.amount + " " + tokenIn.symbol,
        estimatedProfit: spread.toFixed(6) + " " + tokenOut.symbol,
        gasCostEth: gasCostEth.toFixed(6),
        gasCostUsdc: gasCostUsdc.toFixed(2),
        netProfitEth,
        netProfitEthDisplay: netProfitEth.toFixed(6),
        netProfitUsdc,
        netProfitUsdcDisplay: "$" + netProfitUsdc.toFixed(2),
        profitable: netProfitUsdc > 0,
        timestamp: Date.now(),
        dexQuotes: cleanedQuotes,
        dexCount: dexEntries.length,
      });
    }

    return { opportunities, priceData };
  }

  /**
   * Find cross-chain opportunities by comparing prices across chains.
   * @param {Object} priceDataByPair
   * @returns {Array}
   */
  _findCrossChainOpportunities(priceDataByPair) {
    const opportunities = [];

    for (const [pair, chainPricesRaw] of Object.entries(priceDataByPair)) {
      if (chainPricesRaw.length < 2) continue;

      // Cross-chain outlier filter: same token should have ~the same price
      // on every chain. Drop any chain whose bestPrice is >10% away from
      // the median across all chains — these are poisoned by ghost pools.
      const medianBest = (() => {
        const sorted = chainPricesRaw
          .map((c) => c.bestPrice)
          .sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
      })();

      const chainPrices = chainPricesRaw.filter((c) => {
        const deviation = Math.abs(c.bestPrice - medianBest) / medianBest;
        return deviation < 0.1;
      });

      if (chainPrices.length < 2) continue;

      // Compare every pair of chains
      for (let i = 0; i < chainPrices.length; i++) {
        for (let j = i + 1; j < chainPrices.length; j++) {
          const a = chainPrices[i];
          const b = chainPrices[j];

          // Determine which chain has better price (higher output = better to sell)
          let buyChain, sellChain;
          if (a.bestPrice > b.bestPrice) {
            sellChain = a;
            buyChain = b;
          } else {
            sellChain = b;
            buyChain = a;
          }

          const spread = sellChain.bestPrice - buyChain.worstPrice;
          if (spread <= 0) continue;

          const spreadPct = (spread / buyChain.worstPrice) * 100;
          if (spreadPct < CROSS_CHAIN_SPREAD_THRESHOLD) continue;

          const buyChainConfig = CHAINS[buyChain.chainId];
          const sellChainConfig = CHAINS[sellChain.chainId];

          // Estimate profit in USDC
          let profitUsdc;
          const tokenOut = buyChain.tokenOut || {};
          if (["USDC", "USDT", "DAI"].includes(tokenOut.symbol)) {
            profitUsdc = spread;
          } else {
            profitUsdc = spread * ETH_PRICE_USD;
          }

          // Estimate gas costs on both chains (rough: $2 each for L2s, $10 for mainnet)
          const buyGasUsdc = buyChain.chainId === 1 ? 10 : 2;
          const sellGasUsdc = sellChain.chainId === 1 ? 10 : 2;
          const totalGasUsdc = buyGasUsdc + sellGasUsdc;
          const totalCostUsdc = totalGasUsdc + BRIDGE_COST_USDC;
          const netProfitUsdc = profitUsdc - totalCostUsdc;
          const netProfitEth = netProfitUsdc / ETH_PRICE_USD;

          opportunities.push({
            id: `xchain-${buyChainConfig.shortName}-${sellChainConfig.shortName}-${pair}-${Date.now()}`,
            type: "cross-chain",
            chainId: buyChain.chainId,
            chainName: buyChainConfig.name,
            chainShortName: buyChainConfig.shortName,
            destChainId: sellChain.chainId,
            destChainName: sellChainConfig.name,
            destChainShortName: sellChainConfig.shortName,
            pair,
            buyDex: buyChain.worstDex,
            sellDex: sellChain.bestDex,
            buyPrice: buyChain.worstPrice.toFixed(6),
            sellPrice: sellChain.bestPrice.toFixed(6),
            spread: spreadPct.toFixed(4),
            amountIn: (buyChain.amount || "0") + " " + (buyChain.tokenIn?.symbol || ""),
            estimatedProfit: spread.toFixed(6) + " " + (tokenOut.symbol || ""),
            gasCostEth: (totalGasUsdc / ETH_PRICE_USD).toFixed(6),
            gasCostUsdc: totalGasUsdc.toFixed(2),
            netProfitEth,
            netProfitEthDisplay: netProfitEth.toFixed(6),
            netProfitUsdc,
            netProfitUsdcDisplay: "$" + netProfitUsdc.toFixed(2),
            profitable: netProfitUsdc > 0,
            timestamp: Date.now(),
            dexQuotes: {},
            dexCount: 2,
            route: `Buy on ${buyChainConfig.shortName}:${buyChain.worstDex} -> Bridge USDC via CCTP -> Sell on ${sellChainConfig.shortName}:${sellChain.bestDex}`,
            bridgeCostUsdc: BRIDGE_COST_USDC,
            bridgeTimeMinutes: BRIDGE_TIME_MINUTES,
          });
        }
      }
    }

    return opportunities;
  }
}
