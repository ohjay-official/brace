import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "../app/api/ladder/route";
import { LADDER_TIMEOUT_MS } from "./timeouts";
import { LADDER_RATE_MAX, TICKER_RE } from "./ladder-config";
import { createLimiter } from "./ratelimit";

const req = (ticker: string, ip: string) => new Request(`http://x/api/ladder?ticker=${ticker}`, { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });

afterEach(() => vi.unstubAllGlobals());

describe("/api/ladder", () => {
  test("bad ticker is 400 with reason not-found", async () => {
    const res = await GET(new Request("http://x/api/ladder?ticker=bad!"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ quotes: [], reason: "not-found" });
  });

  test("Gemini fetch carries a timeout signal", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", async (_u: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return Response.json({ data: [] });
    });
    const res = await GET(new Request("http://x/api/ladder?ticker=SOL2611172200"));
    expect(await res.json()).toMatchObject({ reason: "not-found" });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(LADDER_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });

  test("Gemini down or timing out returns unavailable, not a crash", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    const res = await GET(new Request("http://x/api/ladder?ticker=SOL2611172200"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ quotes: [], reason: "unavailable" });
  });

  test("only the five Brace asset tickers pass validation", () => {
    for (const t of ["SOL2611192200", "BTC05M2611182325", "ETH15M2611182330", "XRP2611190000", "ZEC2611192200"]) expect(TICKER_RE.test(t)).toBe(true);
    for (const t of ["DOGE2611192200", "SOL", "sol2611192200", "SOL2611192200;", "A".repeat(40), ""]) expect(TICKER_RE.test(t)).toBe(false);
  });

  test("a good answer carries a short CDN cache with stale-while-revalidate", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ data: [] }));
    const res = await GET(req("SOL2611172200", "203.0.113.5"));
    const cc = res.headers.get("cache-control") ?? "";
    expect(cc).toMatch(/s-maxage=\d+/);
    expect(cc).toMatch(/stale-while-revalidate=\d+/);
  });

  test("one IP past the per-minute limit gets 429 with Retry-After; another IP is unaffected", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ data: [] }));
    for (let i = 0; i < LADDER_RATE_MAX; i++) expect((await GET(req("SOL2611172200", "198.51.100.7"))).status).toBe(200);
    const over = await GET(req("SOL2611172200", "198.51.100.7"));
    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(over.headers.get("cache-control")).toBe("no-store");
    expect((await GET(req("SOL2611172200", "198.51.100.8"))).status).toBe(200);
  });

  test("the limiter window resets", () => {
    const take = createLimiter(2, 1000);
    expect(take("a", 0).ok).toBe(true);
    expect(take("a", 10).ok).toBe(true);
    expect(take("a", 20)).toEqual({ ok: false, retryAfter: 1 });
    expect(take("a", 1001).ok).toBe(true);
  });
});
