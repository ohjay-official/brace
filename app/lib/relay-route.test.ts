import { afterEach, describe, expect, test, vi } from "vitest";
import { GET as getHistory } from "../app/api/history/route";
import { GET as getActions } from "../app/api/actions/route";
import { bucketSince, RELAY_BUCKET_SECS, RELAY_MAX_AGE_SECS, appHistoryUrl, appActionsUrl } from "./relay-config";
import { _resetRelayMemory } from "./relay";

const NOW = 1_795_000_000;
const ip = (n: number) => ({ headers: { "x-forwarded-for": `10.1.0.${n}` } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  _resetRelayMemory();
});

describe("since buckets", () => {
  test("rounds down to the bucket so every viewer in a window shares one cache key", () => {
    expect(bucketSince(NOW - 86_400 + 7, NOW)).toBe(Math.floor((NOW - 86_400 + 7) / RELAY_BUCKET_SECS) * RELAY_BUCKET_SECS);
    expect((bucketSince(NOW - 86_400 + 7, NOW) ?? 1) % RELAY_BUCKET_SECS).toBe(0);
  });
  test("rejects junk, the future, and anything older than the max age", () => {
    expect(bucketSince(Number.NaN, NOW)).toBeNull();
    expect(bucketSince(-1, NOW)).toBeNull();
    expect(bucketSince(NOW + 600, NOW)).toBeNull();
    expect(bucketSince(NOW - RELAY_MAX_AGE_SECS - RELAY_BUCKET_SECS, NOW)).toBeNull();
  });
  test("app urls are same origin and bucketed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
    expect(appHistoryUrl("SOL", NOW - 86_400 + 7)).toBe(`/api/history?asset=SOL&since=${bucketSince(NOW - 86_400 + 7, NOW)}`);
    expect(appActionsUrl(NOW - 86_400 + 7)).toBe(`/api/actions?since=${bucketSince(NOW - 86_400 + 7, NOW)}`);
  });
});

describe("/api/history", () => {
  const url = (q: string) => `http://x/api/history?${q}`;

  test("unknown asset or bad since is 400 and never reaches the relayer", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await getHistory(new Request(url("asset=DOGE&since=1"), ip(1)))).status).toBe(400);
    expect((await getHistory(new Request(url("asset=SOL&since=abc"), ip(1)))).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  test("passes the bucketed since to the relayer with a timeout, and the CDN may cache it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
    let called = "";
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
      called = String(u);
      signal = init?.signal ?? undefined;
      return Response.json([{ ts: NOW - 60 }]);
    });
    const since = NOW - 86_400 + 7;
    const res = await getHistory(new Request(url(`asset=sol&since=${since}`), ip(2)));
    expect(res.status).toBe(200);
    expect(called).toBe(`https://brace-relayer.ohjaye0.workers.dev/history?asset=SOL&since=${bucketSince(since, NOW)}`);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(res.headers.get("cache-control")).toMatch(/s-maxage=\d+/);
    expect(await res.json()).toEqual([{ ts: NOW - 60 }]);
  });

  test("relayer down after a good read serves the last good rows, marked stale", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
    vi.stubGlobal("fetch", async () => Response.json([{ ts: 1 }]));
    await getHistory(new Request(url(`asset=SOL&since=${NOW - 86_400}`), ip(3)));
    vi.stubGlobal("fetch", async () => new Response("d1 limit", { status: 503 }));
    const res = await getHistory(new Request(url(`asset=SOL&since=${NOW - 86_400}`), ip(3)));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-brace-stale")).toBe("1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual([{ ts: 1 }]);
  });

  test("relayer down with nothing cached is 503, never cached", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("timeout");
    });
    const res = await getHistory(new Request(url(`asset=SOL&since=${Math.floor(Date.now() / 1000) - 3600}`), ip(4)));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("one caller hammering gets 429", async () => {
    vi.stubGlobal("fetch", async () => Response.json([]));
    const since = Math.floor(Date.now() / 1000) - 3600;
    let last = 200;
    for (let i = 0; i < 130; i++) last = (await getHistory(new Request(url(`asset=SOL&since=${since}`), ip(5)))).status;
    expect(last).toBe(429);
  });
});

describe("/api/actions", () => {
  test("bad since is 400; good since is proxied bucketed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
    let called = "";
    vi.stubGlobal("fetch", async (u: string) => {
      called = String(u);
      return Response.json([]);
    });
    expect((await getActions(new Request("http://x/api/actions?since=zz", ip(6)))).status).toBe(400);
    const res = await getActions(new Request(`http://x/api/actions?since=${NOW - 86_400 + 7}`, ip(6)));
    expect(res.status).toBe(200);
    expect(called).toBe(`https://brace-relayer.ohjaye0.workers.dev/actions?since=${bucketSince(NOW - 86_400 + 7, NOW)}`);
  });
});
