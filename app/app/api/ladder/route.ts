// Live Gemini quotes for one ladder, for the chart dots. Server side so the browser
// never depends on Gemini's CORS policy. Returns only real two-sided "above" quotes;
// if the event is gone (expired) or the fetch fails, returns an empty list with a reason.

import { LADDER_TIMEOUT_MS } from "../../../lib/timeouts";
import { clientIp, createLimiter } from "../../../lib/ratelimit";
import { LADDER_CACHE, LADDER_RATE_MAX, LADDER_RATE_WINDOW_MS, TICKER_RE } from "../../../lib/ladder-config";

const EVENTS_URL = "https://api.gemini.com/v1/prediction-markets/events?status=active&limit=200&category=crypto";

type GeminiContract = {
  strike?: { type?: string; value?: string };
  prices?: { bestBid?: string | null; bestAsk?: string | null };
};
type GeminiEvent = { ticker?: string; contracts?: GeminiContract[] };

export type LadderQuote = { strike: number; bid: number; ask: number };
export type LadderResponse = { ticker: string; quotes: LadderQuote[]; reason?: "not-found" | "unavailable" };

const take = createLimiter(LADDER_RATE_MAX, LADDER_RATE_WINDOW_MS);

function json(body: LadderResponse, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": status === 200 ? LADDER_CACHE : "public, max-age=60, s-maxage=300" } });
}

export async function GET(req: Request) {
  const ticker = (new URL(req.url).searchParams.get("ticker") ?? "").slice(0, 40);
  if (!TICKER_RE.test(ticker)) return json({ ticker, quotes: [], reason: "not-found" }, 400);
  const lim = take(clientIp(req));
  if (!lim.ok) {
    return Response.json(
      { error: "rate_limited", retryAfter: lim.retryAfter },
      { status: 429, headers: { "Retry-After": String(lim.retryAfter), "Cache-Control": "no-store" } },
    );
  }

  let events: GeminiEvent[];
  try {
    const res = await fetch(EVENTS_URL, { next: { revalidate: 30 }, signal: AbortSignal.timeout(LADDER_TIMEOUT_MS) });
    if (!res.ok) return json({ ticker, quotes: [], reason: "unavailable" });
    const body = (await res.json()) as { data?: GeminiEvent[] };
    events = Array.isArray(body.data) ? body.data : [];
  } catch {
    return json({ ticker, quotes: [], reason: "unavailable" });
  }

  const ev = events.find((e) => e.ticker === ticker);
  if (!ev) return json({ ticker, quotes: [], reason: "not-found" });

  const quotes: LadderQuote[] = [];
  for (const c of ev.contracts ?? []) {
    if ((c.strike?.type ?? "").toLowerCase() !== "above") continue;
    const strike = Number(c.strike?.value);
    const bid = Number(c.prices?.bestBid);
    const ask = Number(c.prices?.bestAsk);
    if (!(strike > 0) || !(bid > 0) || !(ask > 0) || ask < bid || ask > 1) continue;
    quotes.push({ strike, bid, ask });
  }
  quotes.sort((a, b) => a.strike - b.strike);
  return json({ ticker, quotes });
}
