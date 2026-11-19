// Same-origin proxy for the relayer's /history and /actions. The relayer's history store (Cloudflare D1,
// free plan) has a daily read limit; every viewer polling the relayer directly with a fresh since= used
// to exhaust it. The app now asks /api/history and /api/actions with since rounded down to a bucket,
// so viewers share one cache key and the Vercel CDN answers most calls without touching the relayer.

/** since is rounded down to this many seconds, so a 24h chart reuses one cache key for 5 minutes. */
export const RELAY_BUCKET_SECS = 300;
/** Oldest since accepted (8 days). Stops callers inventing endless cache keys. */
export const RELAY_MAX_AGE_SECS = 8 * 86_400;
/** Calls per IP per minute per function instance. Pages poll every 30 s to 2 min. */
export const RELAY_RATE_MAX = 120;
export const RELAY_RATE_WINDOW_MS = 60_000;
/** Browsers keep it a minute; the CDN keeps it 2 minutes and serves it stale up to 10 more while it refetches. */
export const RELAY_CACHE = "public, max-age=60, s-maxage=120, stale-while-revalidate=600";
export const RELAY_TIMEOUT_MS = 10_000;
export const RELAY_ASSETS = ["SOL", "BTC", "ETH", "XRP", "ZEC"] as const;

export function bucketSince(since: number, now = Math.floor(Date.now() / 1000)): number | null {
  if (!Number.isFinite(since) || since < 0 || since > now + 60) return null;
  const b = Math.floor(since / RELAY_BUCKET_SECS) * RELAY_BUCKET_SECS;
  if (b < now - RELAY_MAX_AGE_SECS) return null;
  return b;
}

export function appHistoryUrl(asset: string, since: number): string {
  const b = bucketSince(since) ?? since;
  return `/api/history?asset=${encodeURIComponent(asset)}&since=${b}`;
}

export function appActionsUrl(since: number): string {
  const b = bucketSince(since) ?? since;
  return `/api/actions?since=${b}`;
}
