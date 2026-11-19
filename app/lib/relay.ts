// Shared handler for the /api/history and /api/actions proxies (see relay-config.ts for why).

import { RELAYER_URL } from "./history";
import { clientIp, createLimiter } from "./ratelimit";
import { RELAY_CACHE, RELAY_RATE_MAX, RELAY_RATE_WINDOW_MS, RELAY_TIMEOUT_MS } from "./relay-config";

const take = createLimiter(RELAY_RATE_MAX, RELAY_RATE_WINDOW_MS);
/** Last good body per relayer path, so a relayer outage keeps showing the most recent real rows. */
const lastGood = new Map<string, string>();
const LAST_GOOD_MAX = 200;

export function _resetRelayMemory() {
  lastGood.clear();
}

/** The last good answer per asset (or for /actions), whatever its since bucket, so a new bucket still has a fallback. */
function fallbackKey(path: string): string {
  return path.replace(/[?&]since=\d+/, "");
}

export function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400, headers: { "Cache-Control": "no-store" } });
}

export async function relay(req: Request, path: string): Promise<Response> {
  const lim = take(clientIp(req));
  if (!lim.ok) {
    return Response.json(
      { error: "rate_limited", retryAfter: lim.retryAfter },
      { status: 429, headers: { "Retry-After": String(lim.retryAfter), "Cache-Control": "no-store" } },
    );
  }
  const upstream = `${RELAYER_URL}${path}`;
  try {
    const res = await fetch(upstream, { cache: "no-store", signal: AbortSignal.timeout(RELAY_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`relayer ${res.status}`);
    const body = await res.text();
    JSON.parse(body);
    const key = fallbackKey(path);
    lastGood.delete(key);
    lastGood.set(key, body);
    while (lastGood.size > LAST_GOOD_MAX) lastGood.delete(lastGood.keys().next().value as string);
    return new Response(body, { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": RELAY_CACHE } });
  } catch {
    const stale = lastGood.get(fallbackKey(path));
    if (stale !== undefined) {
      return new Response(stale, {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "x-brace-stale": "1" },
      });
    }
    return Response.json(
      { error: "The history service is not answering right now. Onchain limits are unaffected." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
