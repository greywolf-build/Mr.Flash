/**
 * Token-bucket rate limiter for API calls.
 * Supports exponential backoff on 429s via penalize().
 */
export class RateLimiter {
  /**
   * @param {number} ratePerSecond — max requests per second
   */
  constructor(ratePerSecond = 1) {
    this.rate = ratePerSecond;
    this.tokens = ratePerSecond;
    this.maxTokens = ratePerSecond;
    this.refillIntervalMs = 1000 / ratePerSecond;
    this._queue = [];
    this._timer = null;
    this._lastRefill = Date.now();
    this._penaltyUntil = 0; // timestamp — no requests before this
    this._backoffCount = 0;
  }

  /** Returns a promise that resolves when a slot is available. */
  acquire() {
    // If we're in a penalty window, wait it out first
    const now = Date.now();
    if (this._penaltyUntil > now) {
      const waitMs = this._penaltyUntil - now;
      return new Promise((resolve) => {
        setTimeout(() => {
          this._refill();
          if (this.tokens >= 1) {
            this.tokens -= 1;
            resolve();
          } else {
            this._queue.push(resolve);
            this._ensureTimer();
          }
        }, waitMs);
      });
    }

    this._refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this._queue.push(resolve);
      this._ensureTimer();
    });
  }

  /**
   * Call after a 429 response. Applies exponential backoff:
   * 1st: retryAfter or 2s, 2nd: 4s, 3rd: 8s, capped at 30s.
   * Drains tokens to 0 so queued requests also wait.
   * @param {number} retryAfterSec — Retry-After header value (seconds)
   */
  penalize(retryAfterSec = 2) {
    this._backoffCount++;
    const backoffMs = Math.min(
      retryAfterSec * 1000 * Math.pow(2, this._backoffCount - 1),
      30_000
    );
    this._penaltyUntil = Date.now() + backoffMs;
    this.tokens = 0;
    console.warn(`[rate-limiter] Penalized — backing off ${backoffMs}ms (attempt ${this._backoffCount})`);
  }

  /** Reset backoff counter after a successful request. */
  success() {
    if (this._backoffCount > 0) {
      this._backoffCount = 0;
    }
  }

  _refill() {
    const now = Date.now();
    const elapsed = now - this._lastRefill;
    const newTokens = elapsed / this.refillIntervalMs;
    if (newTokens >= 1) {
      this.tokens = Math.min(this.maxTokens, this.tokens + Math.floor(newTokens));
      this._lastRefill = now;
    }
  }

  _ensureTimer() {
    if (this._timer) return;
    this._timer = setInterval(() => {
      // Don't drain queue during penalty
      if (Date.now() < this._penaltyUntil) return;

      this._refill();
      while (this._queue.length > 0 && this.tokens >= 1) {
        this.tokens -= 1;
        this._queue.shift()();
      }
      if (this._queue.length === 0) {
        clearInterval(this._timer);
        this._timer = null;
      }
    }, this.refillIntervalMs);
  }

  destroy() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    // Reject remaining queue so promises don't leak
    const pending = this._queue.splice(0);
    for (const resolve of pending) {
      resolve(); // resolve (not reject) — callers handle missing data gracefully
    }
  }
}
