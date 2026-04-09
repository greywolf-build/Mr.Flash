import { RateLimiter } from "./rateLimiter.js";

const BASE_URL = "https://api.paraswap.io";
const MAX_RETRIES = 3;

// Map our internal protocol names to Paraswap DEX names
const PROTOCOL_MAP = {
  // Uniswap family
  UNISWAP_V3: "UniswapV3",
  UNISWAP_V2: "UniswapV2",
  // Sushiswap family
  SUSHI_V2: "SushiSwap",
  SUSHI_V3: "SushiSwapV3",
  // Pancakeswap family
  PANCAKESWAP_V2: "PancakeSwapV2",
  PANCAKESWAP_V3: "PancakeswapV3",
  // Curve family
  CURVE_V1: "CurveV1",
  CURVE_V2: "CurveV2",
  CURVE_V1_FACTORY: "CurveV1Factory",
  CURVE_V1_STABLE_NG: "CurveV1StableNg",
  // Balancer family
  BALANCER_V1: "BalancerV1",
  BALANCER_V2: "BalancerV2",
  // Other DEXes
  DEFI_SWAP: "DefiSwap",
  SHIBA_SWAP: "ShibaSwap",
  VERSE: "Verse",
  HASHFLOW: "Hashflow",
  SOLIDLY_V3: "SolidlyV3",
  SYNAPSE: "Synapse",
  AUGUSTUS_RFQ: "AugustusRFQ",
};

/**
 * Global shared rate limiter — Paraswap rate-limits by IP, not by network.
 * All ParaswapClient instances share this so multi-chain scanning
 * doesn't blow past the limit.
 */
let _sharedLimiter = null;
let _sharedLimiterRate = 0;
let _sharedLimiterRefCount = 0;

function acquireSharedLimiter(ratePerSecond) {
  if (!_sharedLimiter || ratePerSecond !== _sharedLimiterRate) {
    if (_sharedLimiter) _sharedLimiter.destroy();
    _sharedLimiter = new RateLimiter(ratePerSecond);
    _sharedLimiterRate = ratePerSecond;
  }
  _sharedLimiterRefCount++;
  return _sharedLimiter;
}

function releaseSharedLimiter() {
  _sharedLimiterRefCount--;
  if (_sharedLimiterRefCount <= 0 && _sharedLimiter) {
    _sharedLimiter.destroy();
    _sharedLimiter = null;
    _sharedLimiterRate = 0;
    _sharedLimiterRefCount = 0;
  }
}

/**
 * Paraswap Aggregation API client.
 * No API key required — all instances share a global rate limiter
 * since Paraswap rate-limits per IP.
 */
export class ParaswapClient {
  /**
   * @param {number} ratePerSecond — requests/sec (1 recommended for free tier)
   * @param {number} network — chain ID (default 1 = Ethereum)
   */
  constructor(ratePerSecond = 1, network = 1) {
    this.limiter = acquireSharedLimiter(ratePerSecond);
    this.network = network;
  }

  /**
   * Low-level GET with rate limiting + exponential backoff retries.
   */
  async _get(path, params = {}) {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await this.limiter.acquire();
      const res = await fetch(url.toString());

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") || "2", 10);
        console.warn(`[paraswap] 429 on GET ${path} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
        this.limiter.penalize(retryAfter);
        if (attempt === MAX_RETRIES) {
          throw new Error(`Paraswap API 429: rate limited after ${MAX_RETRIES + 1} attempts`);
        }
        continue;
      }

      if (!res.ok) {
        throw new Error(`Paraswap API ${res.status}: ${await res.text()}`);
      }

      this.limiter.success();
      return res.json();
    }
  }

  /**
   * Low-level POST with rate limiting + exponential backoff retries.
   */
  async _post(path, body) {
    const url = `${BASE_URL}${path}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await this.limiter.acquire();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") || "2", 10);
        console.warn(`[paraswap] 429 on POST ${path} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
        this.limiter.penalize(retryAfter);
        if (attempt === MAX_RETRIES) {
          throw new Error(`Paraswap API 429: rate limited after ${MAX_RETRIES + 1} attempts`);
        }
        continue;
      }

      if (!res.ok) {
        throw new Error(`Paraswap API ${res.status}: ${await res.text()}`);
      }

      this.limiter.success();
      return res.json();
    }
  }

  /**
   * Get an aggregated quote (best route across all DEXes).
   * @returns {{ destAmount: string, gasCost: string, bestRoute: Array, contractAddress: string, hmac: string }}
   */
  async getQuote({ src, dst, amount, srcDecimals = 18, destDecimals = 18 }) {
    const data = await this._get("/prices", {
      srcToken: src,
      destToken: dst,
      amount,
      srcDecimals,
      destDecimals,
      side: "SELL",
      network: this.network,
    });
    return data.priceRoute;
  }

  /**
   * Get a quote restricted to a single protocol (DEX).
   * @param {string} protocol — internal name e.g. "UNISWAP_V3"
   */
  async getQuoteForProtocol({ src, dst, amount, protocol, srcDecimals = 18, destDecimals = 18 }) {
    const paraswapName = PROTOCOL_MAP[protocol] || protocol;
    const data = await this._get("/prices", {
      srcToken: src,
      destToken: dst,
      amount,
      srcDecimals,
      destDecimals,
      side: "SELL",
      network: this.network,
      includeDEXS: paraswapName,
    });
    return data.priceRoute;
  }

  /**
   * Build swap calldata via Paraswap's 2-step flow.
   * Step 1: get priceRoute from /prices
   * Step 2: POST to /transactions with priceRoute + userAddress + slippage
   * @returns {{ to: string, data: string, value: string, gas: string, priceRoute: object }}
   */
  async getSwap({ src, dst, amount, from, slippage = 250, protocol, srcDecimals = 18, destDecimals = 18 }) {
    // Step 1: get price route
    const params = {
      srcToken: src,
      destToken: dst,
      amount,
      srcDecimals,
      destDecimals,
      side: "SELL",
      network: this.network,
      maxImpact: 100,
    };
    if (protocol) {
      params.includeDEXS = PROTOCOL_MAP[protocol] || protocol;
    }
    const priceData = await this._get("/prices", params);
    const priceRoute = priceData.priceRoute;

    // Step 2: build transaction
    // ignoreChecks: skip balance/allowance validation — flash loan contract
    // won't hold tokens until mid-transaction
    const txData = await this._post(`/transactions/${this.network}?ignoreChecks=true`, {
      priceRoute,
      srcToken: src,
      destToken: dst,
      srcAmount: amount,
      userAddress: from,
      slippage,
    });

    return {
      to: txData.to,
      data: txData.data,
      value: txData.value,
      gas: txData.gas,
      priceRoute,
    };
  }

  /**
   * List available DEX adapters.
   */
  async getAdapters() {
    return this._get(`/adapters/list/${this.network}`);
  }

  destroy() {
    releaseSharedLimiter();
  }
}

export { PROTOCOL_MAP };
