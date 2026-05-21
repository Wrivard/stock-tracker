// Simple in-memory token bucket. One instance per upstream provider so that
// bursty requests are smoothed to fit the provider's free-tier rate limit.
//
// Capacity is the max burst; refillPerSec is the steady-state rate. Calls to
// take() resolve once enough tokens are available — never reject for rate
// reasons, so callers can `await` without manual retry. Network/HTTP errors
// are still thrown by the actual fetch.

export class TokenBucket {
  private tokens: number
  private lastRefill = Date.now()
  private waiters: Array<{ tokens: number; resolve: () => void }> = []

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {
    this.tokens = capacity
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec)
    this.lastRefill = now
  }

  private pump(): void {
    this.refill()
    while (this.waiters.length > 0 && this.tokens >= this.waiters[0].tokens) {
      const w = this.waiters.shift()!
      this.tokens -= w.tokens
      w.resolve()
    }
    if (this.waiters.length > 0) {
      const needed = this.waiters[0].tokens - this.tokens
      const ms = (needed / this.refillPerSec) * 1000
      setTimeout(() => this.pump(), Math.max(50, ms))
    }
  }

  take(tokens = 1): Promise<void> {
    this.refill()
    if (this.tokens >= tokens && this.waiters.length === 0) {
      this.tokens -= tokens
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.waiters.push({ tokens, resolve })
      this.pump()
    })
  }

  available(): number {
    this.refill()
    return this.tokens
  }
}

// Finnhub free tier: 60 calls/min => 1/sec. We allow short bursts of 20.
export const finnhubBucket = new TokenBucket(20, 1)

// Twelve Data free tier: 8 calls/min => 0.133/sec, 800/day. Daily cap is
// enforced by their server; we just shape the per-second rate here.
export const twelvedataBucket = new TokenBucket(8, 8 / 60)

// Frankfurter has no documented hard limit. Be polite.
export const frankfurterBucket = new TokenBucket(10, 5)
