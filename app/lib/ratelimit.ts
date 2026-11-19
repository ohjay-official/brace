// A fixed-window per-IP limiter held in memory. On Vercel each function instance keeps its own
// counts, so this caps one caller per instance, not globally. It is a guard against a script
// hammering one route, not a billing cap; the CDN cache in front absorbs most repeat calls.

export type Limit = { ok: true } | { ok: false; retryAfter: number };

export function createLimiter(max: number, windowMs: number, maxKeys = 10_000) {
  const hits = new Map<string, { n: number; reset: number }>();
  return function take(key: string, now = Date.now()): Limit {
    let e = hits.get(key);
    if (!e || now >= e.reset) {
      if (hits.size >= maxKeys) {
        for (const [k, v] of hits) if (now >= v.reset) hits.delete(k);
        if (hits.size >= maxKeys) hits.clear();
      }
      e = { n: 0, reset: now + windowMs };
      hits.set(key, e);
    }
    e.n += 1;
    if (e.n > max) return { ok: false, retryAfter: Math.max(1, Math.ceil((e.reset - now) / 1000)) };
    return { ok: true };
  };
}

/** The caller's IP as Vercel reports it. Falls back to one shared bucket when no header is present. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
