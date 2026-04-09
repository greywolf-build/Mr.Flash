import { EventEmitter } from "events";
import { ethers } from "ethers";
import { getProviderForChain } from "./multiProvider.js";
import { ParaswapClient } from "./paraswapClient.js";

// Token definitions (Ethereum mainnet)
const TOKENS = [
  { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  { symbol: "DAI",  address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
  { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  { symbol: "stETH", address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", decimals: 18 },
  { symbol: "rETH",  address: "0xae78736Cd615f374D3085123A210448E74Fc6393", decimals: 18 },
  { symbol: "cbETH", address: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704", decimals: 18 },
];

// ~$500 probe amounts — sized to match actual execution budget
const SCAN_PAIRS = [
  // ETH-denominated (~$500 worth at ~$2500/ETH ≈ 0.2 ETH)
  { from: 0, to: 1, amount: "0.2", label: "WETH/USDC" },
  { from: 0, to: 2, amount: "0.2", label: "WETH/USDT" },
  { from: 0, to: 3, amount: "0.2", label: "WETH/DAI" },
  { from: 0, to: 4, amount: "0.2", label: "WETH/WBTC" },
  // Stablecoin-denominated ($500)
  { from: 1, to: 0, amount: "500", label: "USDC/WETH" },
  { from: 2, to: 0, amount: "500", label: "USDT/WETH" },
  { from: 3, to: 0, amount: "500", label: "DAI/WETH" },
  // Stablecoin cross-pairs ($500)
  { from: 1, to: 2, amount: "500", label: "USDC/USDT" },
  { from: 1, to: 3, amount: "500", label: "USDC/DAI" },
  { from: 2, to: 3, amount: "500", label: "USDT/DAI" },
  // BTC pairs (~$500 worth at ~$65k/BTC ≈ 0.007 WBTC)
  { from: 4, to: 0, amount: "0.007",   label: "WBTC/WETH" },
  { from: 4, to: 1, amount: "0.007",   label: "WBTC/USDC" },
  // LSD pairs (~$500 at ~0.2 ETH-equivalent)
  { from: 5, to: 0, amount: "0.2",     label: "stETH/WETH" },
  { from: 6, to: 0, amount: "0.2",     label: "rETH/WETH" },
  { from: 7, to: 0, amount: "0.2",     label: "cbETH/WETH" },
  { from: 0, to: 5, amount: "0.2",     label: "WETH/stETH" },
  { from: 0, to: 6, amount: "0.2",     label: "WETH/rETH" },
  { from: 0, to: 7, amount: "0.2",     label: "WETH/cbETH" },
  { from: 5, to: 1, amount: "0.2",     label: "stETH/USDC" },
  { from: 6, to: 1, amount: "0.2",     label: "rETH/USDC" },
];

// Individual DEXes to quote against
const TARGET_PROTOCOLS = [
  // Uniswap family
  "UNISWAP_V3",
  "UNISWAP_V2",
  // Sushiswap family
  "SUSHI_V2",
  "SUSHI_V3",
  // Pancakeswap family
  "PANCAKESWAP_V2",
  "PANCAKESWAP_V3",
  // Curve family
  "CURVE_V1",
  "CURVE_V2",
  "CURVE_V1_FACTORY",
  "CURVE_V1_STABLE_NG",
  // Balancer family
  "BALANCER_V1",
  "BALANCER_V2",
  // Other DEXes
  "DEFI_SWAP",
  "SHIBA_SWAP",
  "VERSE",
  "HASHFLOW",
  "SOLIDLY_V3",
  "SYNAPSE",
  "AUGUSTUS_RFQ",
];

// Extra gas overhead for flash loan wrapper
const FLASH_LOAN_GAS_OVERHEAD = 50_000;

export class DexScanner extends EventEmitter {
  /**
   * @param {ParaswapClient} client — shared Paraswap API client
   */
  constructor(client) {
    super();
    if (!client) throw new Error("DexScanner requires a ParaswapClient instance");
    this.client = client;
    this.latest = [];
    this._interval = null;
  }

  start(intervalMs = 30_000) {
    console.log(`[dex] Starting scanner (interval: ${intervalMs}ms)`);
    this._poll();
    this._interval = setInterval(() => this._poll(), intervalMs);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  async _poll() {
    try {
      // Get current gas price for cost estimation
      const provider = getProviderForChain(1);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || 0n;

      const opportunities = [];

      for (const pair of SCAN_PAIRS) {
        try {
          const opp = await this._scanPair(pair, gasPrice);
          if (opp) opportunities.push(opp);
        } catch (err) {
          console.warn(`[dex] Pair ${pair.label} error: ${err.message}`);
        }
      }

      // Sort by net profit (numeric, descending)
      opportunities.sort((a, b) => b.netProfitEth - a.netProfitEth);

      this.latest = opportunities;
      this.emit("opportunities", opportunities);
    } catch (err) {
      console.error("[dex] Scan error:", err.message);
    }
  }

  async _scanPair(pair, gasPrice) {
    const tokenIn = TOKENS[pair.from];
    const tokenOut = TOKENS[pair.to];
    const amountInWei = ethers.parseUnits(pair.amount, tokenIn.decimals).toString();

    // 1) Aggregated quote — best route across all DEXes
    const aggregated = await this.client.getQuote({
      src: tokenIn.address,
      dst: tokenOut.address,
      amount: amountInWei,
      srcDecimals: tokenIn.decimals,
      destDecimals: tokenOut.decimals,
    });

    const aggFloat = parseFloat(ethers.formatUnits(aggregated.destAmount, tokenOut.decimals));
    const aggGas = Number(aggregated.gasCost || 0);

    // 2) Per-DEX individual quotes
    const dexQuotes = {};
    let dexCount = 0;

    for (const protocol of TARGET_PROTOCOLS) {
      try {
        const quote = await this.client.getQuoteForProtocol({
          src: tokenIn.address,
          dst: tokenOut.address,
          amount: amountInWei,
          protocol,
          srcDecimals: tokenIn.decimals,
          destDecimals: tokenOut.decimals,
        });
        const toFloat = parseFloat(ethers.formatUnits(quote.destAmount, tokenOut.decimals));
        dexQuotes[protocol] = {
          toAmount: quote.destAmount,
          toAmountFloat: toFloat,
          gas: Number(quote.gasCost || 0),
        };
        dexCount++;
      } catch {
        // DEX has no liquidity for this pair — skip
      }
    }

    if (dexCount < 2) return null; // Need at least 2 DEXes to compare

    // 3) Find best and worst DEX quotes
    const dexEntries = Object.entries(dexQuotes);
    let bestDex = dexEntries[0];
    let worstDex = dexEntries[0];

    for (const entry of dexEntries) {
      if (entry[1].toAmountFloat > bestDex[1].toAmountFloat) bestDex = entry;
      if (entry[1].toAmountFloat < worstDex[1].toAmountFloat) worstDex = entry;
    }

    const spread = bestDex[1].toAmountFloat - worstDex[1].toAmountFloat;
    const spreadPct = (spread / worstDex[1].toAmountFloat) * 100;

    if (spreadPct < 0.01) return null; // Too small to matter

    // 4) Gas cost estimation
    const totalGasUnits = BigInt(Math.max(aggGas, bestDex[1].gas) + FLASH_LOAN_GAS_OVERHEAD);
    const gasCostWei = gasPrice * totalGasUnits;
    const gasCostEth = parseFloat(ethers.formatEther(gasCostWei));

    // Convert spread to ETH for profit calculation
    let profitEth = spread;
    if (tokenOut.symbol !== "WETH") {
      if (["stETH", "rETH", "cbETH"].includes(tokenOut.symbol)) {
        // LSD tokens are ~1:1 with ETH — spread is already in ETH-equivalent
        profitEth = spread;
      } else if (["USDC", "USDT", "DAI"].includes(tokenOut.symbol)) {
        // Use aggregated quote to derive ETH price: we know amountIn WETH = aggFloat stablecoins
        // For stablecoin-denominated output, 1 ETH ~ aggFloat (when input is 1 WETH)
        const ethPrice = pair.from === 0 ? aggFloat / parseFloat(pair.amount) : null;
        profitEth = ethPrice ? spread / ethPrice : spread / 2000;
      }
    }

    const netProfitEth = profitEth - gasCostEth;

    return {
      id: `dex-${pair.label}-${Date.now()}`,
      pair: pair.label,
      buyDex: worstDex[0],     // Buy where price is lowest (worst output = lower price)
      sellDex: bestDex[0],     // Sell where price is highest (best output)
      buyPrice: worstDex[1].toAmountFloat.toFixed(6),
      sellPrice: bestDex[1].toAmountFloat.toFixed(6),
      spread: spreadPct.toFixed(4),
      amountIn: pair.amount + " " + tokenIn.symbol,
      estimatedProfit: spread.toFixed(6) + " " + tokenOut.symbol,
      gasCostEth: gasCostEth.toFixed(6),
      netProfitEth,
      netProfitEthDisplay: netProfitEth.toFixed(6),
      profitable: netProfitEth > 0,
      timestamp: Date.now(),
      // Aggregated quote details
      aggregated: {
        toAmount: aggregated.destAmount,
        toAmountFloat: aggFloat,
        gas: aggGas,
        bestRoute: aggregated.bestRoute || [],
      },
      dexQuotes,
      dexCount,
    };
  }
}
