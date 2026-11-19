// Limits and cache policy for /api/ladder. Kept out of route.ts because Next only allows route exports there.

/** Calls per IP per minute, per function instance. A page polls once every 30 seconds, so 60 leaves wide room. */
export const LADDER_RATE_MAX = 60;
export const LADDER_RATE_WINDOW_MS = 60_000;

/** Only the five Brace assets' Gemini tickers, e.g. SOL2611192200 or BTC05M2611182325. */
export const TICKER_RE = /^(SOL|BTC|ETH|XRP|ZEC)[A-Z0-9]{6,24}$/;

/** Browsers keep it 15s; the Vercel CDN keeps it 15s and may serve it up to 45s more while it refetches. */
export const LADDER_CACHE = "public, max-age=15, s-maxage=15, stale-while-revalidate=45";

