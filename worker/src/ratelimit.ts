// Per-IP limits for the public GET endpoints. Two layers:
// 1. The Workers Rate Limiting binding (RATE_LIMITER in wrangler.toml), counted per Cloudflare location.
// 2. An in-memory fixed window in this isolate, used when the binding is missing or errors.
// Both are approximate and meant to stop a script draining the free tier, not to meter users.
// The minute cron runs in scheduled(), never through fetch(), so posting is never limited.

export const RATE_MAX = 60;
export const RATE_WINDOW_SECS = 60;

export type RateLimitBinding = { limit(opts: { key: string }): Promise<{ success: boolean }> };
export type RateDecision = { ok: true } | { ok: false; retryAfter: number };

const hits = new Map<string, { n: number; reset: number }>();
const MAX_KEYS = 10_000;

export function takeLocal(key: string, nowMs = Date.now(), max = RATE_MAX, windowMs = RATE_WINDOW_SECS * 1000): RateDecision {
  let e = hits.get(key);
  if (!e || nowMs >= e.reset) {
    if (hits.size >= MAX_KEYS) {
      for (const [k, v] of hits) if (nowMs >= v.reset) hits.delete(k);
      if (hits.size >= MAX_KEYS) hits.clear();
    }
    e = { n: 0, reset: nowMs + windowMs };
    hits.set(key, e);
  }
  e.n += 1;
  if (e.n > max) return { ok: false, retryAfter: Math.max(1, Math.ceil((e.reset - nowMs) / 1000)) };
  return { ok: true };
}

export function resetLocalLimits(): void {
  hits.clear();
}

/** IPv4 as is; IPv6 by its /64, since one host can rotate through a whole /64. */
export function ipBucket(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return `${full.slice(0, 4).map((x) => x || "0").join(":")}::/64`;
}

/** Group key: one bucket per IP per endpoint, so a busy History tab cannot starve /health. */
export async function checkRate(request: Request, path: string, binding?: RateLimitBinding, nowMs = Date.now()): Promise<RateDecision> {
  // Cloudflare always sets this on real traffic and a client cannot remove it. Local tests have none.
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) return { ok: true };
  const key = `${ipBucket(ip)}|${path}`;
  const local = takeLocal(key, nowMs);
  if (!local.ok) return local;
  if (binding) {
    try {
      const { success } = await binding.limit({ key });
      if (!success) return { ok: false, retryAfter: RATE_WINDOW_SECS };
    } catch {
      // Binding unavailable: the local window above still applies.
    }
  }
  return { ok: true };
}
