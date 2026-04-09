import { RateLimiter } from "./rateLimiter.js";

const BASE_URL = "https://api.1inch.dev/swap/v6.0/1"; // chainId 1 = Ethereum

/**
 * 1inch Aggregation API client.
 * All public methods respect the shared rate limiter.
 */
export class OneInchClient {
  /**
   * @param {string} apiKey — 1inch Developer Portal API key
   * @param {number} ratePerSecond — requests/sec (1 = free tier, 10 = paid)
   */
  constructor(apiKey, ratePerSecond = 1) {
    if (!apiKey) throw new Error("ONEINCH_API_KEY is required");
    this.apiKey = apiKey;
    this.limiter = new RateLimiter(ratePerSecond);
  }

  /**
   * Low-level fetch with rate limiting + retries.
   */
  async _fetch(path, params = {}) {
    await this.limiter.acquire();

    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (res.status === 429) {
      // Rate limited — wait and retry once
      const retryAfter = parseInt(res.headers.get("retry-after") || "2", 10);
      console.warn(`[1inch] 429 — retrying in ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      await this.limiter.acquire();
      const retry = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!retry.ok) throw new Error(`1inch API ${retry.status}: ${await retry.text()}`);
      return retry.json();
    }

    if (!res.ok) throw new Error(`1inch API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  /**
   * Get an aggregated quote (best route across all DEXes).
   * @returns {{ toAmount: string, gas: number, protocols: Array }}
   */
  async getQuote({ src, dst, amount, includeProtocols = true, includeGas = true }) {
    return this._fetch("/quote", {
      src,
      dst,
      amount,
      includeProtocols,
      includeGas,
    });
  }

  /**
   * Get a quote restricted to a single protocol (DEX).
   * @param {string} protocol — e.g. "UNISWAP_V3", "SUSHI", "CURVE"
   */
  async getQuoteForProtocol({ src, dst, amount, protocol }) {
    return this._fetch("/quote", {
      src,
      dst,
      amount,
      protocols: protocol,
      includeGas: true,
    });
  }

  /**
   * Get swap calldata for execution.
   * @returns {{ tx: { to, data, value, gas }, toAmount: string }}
   */
  async getSwap({ src, dst, amount, from, slippage = 1, protocols }) {
    const params = { src, dst, amount, from, slippage };
    if (protocols) params.protocols = protocols;
    return this._fetch("/swap", params);
  }

  /**
   * List available liquidity sources.
   */
  async getLiquiditySources() {
    return this._fetch("/liquidity-sources");
  }

  destroy() {
    this.limiter.destroy();
  }
}
