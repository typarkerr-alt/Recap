// Simple in-memory token-bucket rate limiter per IP
const buckets = new Map<string, { tokens: number; lastRefill: number }>();

const MAX_TOKENS = 10;
const REFILL_RATE = 10 / 60000; // 10 tokens per minute
const COST = 1;

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  let bucket = buckets.get(ip);

  if (!bucket) {
    bucket = { tokens: MAX_TOKENS, lastRefill: now };
    buckets.set(ip, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + elapsed * REFILL_RATE);
  bucket.lastRefill = now;

  if (bucket.tokens < COST) {
    const retryAfter = Math.ceil((COST - bucket.tokens) / REFILL_RATE / 1000);
    return { allowed: false, retryAfter };
  }

  bucket.tokens -= COST;
  return { allowed: true };
}
