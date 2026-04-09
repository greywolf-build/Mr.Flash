import { EventEmitter } from "events";
import { ethers } from "ethers";
import { executeDexArbViaParaswap } from "./executor.js";
import { CHAIN_TOKENS } from "./chainConfig.js";

// No size cap — flash loan supplies the capital. Pre-flight in
// executeDexArbViaParaswap will reject if real-quote slippage kills profit.

const DEDUP_COOLDOWN_MS = 2_000;  // 2s — just prevents double-fire from same scan cycle
const MAX_DAILY_ATTEMPTS = 10;

function resolveToken(chainId, symbol) {
  const tokens = CHAIN_TOKENS[chainId] || CHAIN_TOKENS[1];
  return tokens.find((t) => t.symbol === symbol) || null;
}

/** Fingerprint an opportunity so we don't re-execute the exact same trade */
function oppKey(opp) {
  return `${opp.chainId}:${opp.pair}:${opp.buyDex}:${opp.sellDex}`;
}

export class AutoExecutor extends EventEmitter {
  constructor(scanner) {
    super();
    this.scanner = scanner;
    this.enabled = false;
    this.executing = false;           // lock — one execution at a time
    this.lastAttemptTime = 0;
    this.lastOppKey = null;           // dedup: skip same trade back-to-back
    this.dailyAttempts = 0;
    this.dailyResetDate = this._today();

    this._onOpportunities = this._onOpportunities.bind(this);
    this.scanner.on("opportunities", this._onOpportunities);
  }

  _today() {
    return new Date().toISOString().slice(0, 10);
  }

  _resetDailyIfNeeded() {
    const today = this._today();
    if (today !== this.dailyResetDate) {
      this.dailyAttempts = 0;
      this.dailyResetDate = today;
    }
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    if (!this.enabled) {
      this.lastOppKey = null; // reset dedup on disable so re-enable is fresh
    }
    console.log(`[auto] ${this.enabled ? "Enabled" : "Disabled"}`);
  }

  getState() {
    this._resetDailyIfNeeded();
    return {
      enabled: this.enabled,
      dailyAttempts: this.dailyAttempts,
      maxDailyAttempts: MAX_DAILY_ATTEMPTS,
    };
  }

  async _onOpportunities(opps) {
    if (!this.enabled) return;
    if (this.executing) return; // already mid-execution, skip this scan cycle

    this._resetDailyIfNeeded();

    // Dedup cooldown — prevents double-fire from overlapping events
    const now = Date.now();
    if (now - this.lastAttemptTime < DEDUP_COOLDOWN_MS) return;

    // Daily cap check
    if (this.dailyAttempts >= MAX_DAILY_ATTEMPTS) {
      return;
    }

    // Filter: same-chain, profitable, wallet funded
    const candidates = (opps || []).filter(
      (o) =>
        o.type === "same-chain" &&
        o.profitable === true &&
        o.walletFunded !== false
    );
    if (candidates.length === 0) return;

    // Pick best by netProfitUsdc
    const best = candidates.reduce((a, b) =>
      (b.netProfitUsdc || 0) > (a.netProfitUsdc || 0) ? b : a
    );

    // Dedup: skip if this is the exact same trade as last attempt
    const key = oppKey(best);
    if (key === this.lastOppKey) return;

    // Resolve tokens
    const pair = best.pair; // e.g. "WETH/USDC"
    const [srcSym, dstSym] = pair.split("/");
    const chainId = best.chainId || 1;
    const srcToken = resolveToken(chainId, srcSym);
    const dstToken = resolveToken(chainId, dstSym);

    if (!srcToken || !dstToken) {
      console.warn(`[auto] Cannot resolve tokens for ${pair} on chain ${chainId}`);
      return;
    }

    // Parse amount — no cap, flash loan supplies the capital
    const amountStr = best.amountIn ? best.amountIn.split(" ")[0] : null;
    if (!amountStr) return;

    const swapAmount = ethers.parseUnits(amountStr, srcToken.decimals).toString();

    // Mark attempt — set lock + dedup
    this.executing = true;
    this.lastAttemptTime = now;
    this.lastOppKey = key;
    this.dailyAttempts++;

    const oppSummary = {
      pair,
      chainId,
      spread: best.spread,
      netProfitUsdc: best.netProfitUsdc,
      amountIn: best.amountIn,
      buyDex: best.buyDex,
      sellDex: best.sellDex,
    };

    this.emit("auto_execute", {
      status: "attempting",
      opportunity: oppSummary,
      dailyAttempts: this.dailyAttempts,
    });

    console.log(
      `[auto] Attempting #${this.dailyAttempts}: ${pair} ${best.spread}% spread, net $${(best.netProfitUsdc || 0).toFixed(2)}`
    );

    try {
      const result = await executeDexArbViaParaswap({
        contractAddress: process.env.CONTRACT_ADDRESS,
        asset: srcToken.address,
        amount: amountStr,
        src: srcToken.address,
        dst: dstToken.address,
        swapAmount,
        srcDecimals: srcToken.decimals,
        dstDecimals: dstToken.decimals,
        slippage: 250,
        buyProtocol: best.buyDex,
        sellProtocol: best.sellDex,
        chainId,
        useFlashbots: true,
      });

      console.log(`[auto] Success:`, result);
      this.emit("auto_execute", {
        status: "success",
        opportunity: oppSummary,
        result,
        dailyAttempts: this.dailyAttempts,
      });
    } catch (err) {
      console.warn(`[auto] Failed: ${err.message}`);
      this.emit("auto_execute", {
        status: "failed",
        opportunity: oppSummary,
        error: err.message,
        dailyAttempts: this.dailyAttempts,
      });
    } finally {
      this.executing = false; // release lock — ready for next scan cycle
    }

    if (this.dailyAttempts >= MAX_DAILY_ATTEMPTS) {
      console.log(`[auto] Daily cap reached (${MAX_DAILY_ATTEMPTS})`);
    }
  }
}
