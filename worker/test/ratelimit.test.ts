import { afterEach, describe, expect, test, vi } from "vitest";
import worker, { clearPreviewMemo } from "../src/index.ts";
import type { Env } from "../src/index.ts";
import { checkRate, ipBucket, RATE_MAX, resetLocalLimits, takeLocal } from "../src/ratelimit.ts";
import { MemoryStore } from "../src/store.ts";

afterEach(() => resetLocalLimits());

function env(extra: Partial<Env> = {}): Env {
  return { PROGRAM_ID: "Frv6CVJKADmkM2cnBSMKgBWPvtHsfYkfye5d4vB84WyC", STREAMS_SINK_SECRET: "s", __store: new MemoryStore(), ...extra };
}
const req = (path: string, ip?: string) => new Request(`https://example.com${path}`, { headers: ip ? { "cf-connecting-ip": ip } : {} });

describe("per-IP rate limit on public GET endpoints", () => {
  test("a burst past the limit from one IP gets 429 with Retry-After and CORS", async () => {
    const e = env();
    for (let i = 0; i < RATE_MAX; i++) expect((await worker.fetch(req("/actions", "203.0.113.9"), e)).status).toBe(200);
    const res = await worker.fetch(req("/actions", "203.0.113.9"), e);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("other IPs and other endpoints keep working while one is limited", async () => {
    const e = env();
    for (let i = 0; i <= RATE_MAX; i++) await worker.fetch(req("/history?asset=SOL", "203.0.113.10"), e);
    expect((await worker.fetch(req("/history?asset=SOL", "203.0.113.10"), e)).status).toBe(429);
    expect((await worker.fetch(req("/history?asset=SOL", "203.0.113.11"), e)).status).toBe(200);
    expect((await worker.fetch(req("/actions", "203.0.113.10"), e)).status).toBe(200);
  });

  test("IPv6 callers share one bucket per /64; IPv4 is per address", () => {
    expect(ipBucket("2a09:bac5:4dd1:4aa::77:8f")).toBe("2a09:bac5:4dd1:4aa::/64");
    expect(ipBucket("2a09:bac5:4dd1:4aa:1:2:3:4")).toBe("2a09:bac5:4dd1:4aa::/64");
    expect(ipBucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipBucket("203.0.113.9")).toBe("203.0.113.9");
  });

  test("a tracker polling every 10 seconds is never limited", () => {
    for (let t = 0; t < 10 * 60_000; t += 10_000) expect(takeLocal("tracker|/history", t).ok).toBe(true);
  });

  test("the window resets after a minute", () => {
    for (let i = 0; i < RATE_MAX; i++) takeLocal("k", 0);
    expect(takeLocal("k", 1000)).toEqual({ ok: false, retryAfter: 59 });
    expect(takeLocal("k", 60_000).ok).toBe(true);
  });

  test("the Rate Limiting binding can refuse, and a broken binding falls back to the local window", async () => {
    const no = { limit: async () => ({ success: false }) };
    expect((await checkRate(req("/health", "198.51.100.1"), "/health", no)).ok).toBe(false);
    const broken = { limit: async () => { throw new Error("binding down"); } };
    expect((await checkRate(req("/health", "198.51.100.2"), "/health", broken)).ok).toBe(true);
  });

  test("POST /streams is not rate limited by IP (it has its own secret)", async () => {
    const e = env();
    for (let i = 0; i <= RATE_MAX + 5; i++) await worker.fetch(req("/actions", "203.0.113.12"), e);
    const res = await worker.fetch(new Request("https://example.com/streams", { method: "POST", headers: { "cf-connecting-ip": "203.0.113.12" }, body: "{}" }), e);
    expect(res.status).not.toBe(429);
  });
});

describe("/preview reuses one Gemini answer per asset for a few seconds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearPreviewMemo();
  });
  test("two calls in a row reach Gemini once, with a browser cache header", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return Response.json({ data: [] });
    });
    const a = await worker.fetch(req("/preview?asset=SOL"), env());
    const before = calls;
    const b = await worker.fetch(req("/preview?asset=SOL"), env());
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(before).toBeGreaterThan(0);
    expect(calls).toBe(before);
    expect(b.headers.get("x-brace-cache")).toBe("memo");
    expect(b.headers.get("cache-control")).toMatch(/max-age=\d+/);
  });
});
