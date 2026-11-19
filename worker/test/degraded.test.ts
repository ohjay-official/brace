// D1 outage (e.g. the free daily limit): the Worker must answer, never throw a 1101,
// and reads must hit D1 as little as possible.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ASSETS } from "../src/assets.ts";
import { FULL_RELOAD_SECS, READ_TTL_SECS } from "../src/cache.ts";
import { historyResponse } from "../src/history.ts";
import worker, { persistRun, resetMemoryState, type Env } from "../src/index.ts";
import { decodePostedAt, FEED_DISCRIMINATOR, FEED_POSTED_AT_OFFSET, feedPda } from "../src/onchain.ts";
import { MemoryStore, type PostRow } from "../src/store.ts";
import { PublicKey } from "@solana/web3.js";
import { programDataLog } from "../src/events.ts";

const PROGRAM_ID = "Frv6CVJKADmkM2cnBSMKgBWPvtHsfYkfye5d4vB84WyC";
const D1_ERR = "D1_ERROR: Exceeded maximum daily rows read limit";
const NOW = 1_794_970_000;

const STORE_METHODS = [
  "upsertPost", "upsertAction", "listPosts", "listActions", "saveRelayerRun", "loadRelayerRun",
  "latestPostTsByAsset", "listPendingSigs", "purgePendingSigs", "addPendingSigs", "removePendingSigs",
] as const;

/** MemoryStore that throws the D1 limit error from every call while `down` is true. */
class FlakyStore extends MemoryStore {
  down = false;
  postRowsRead = 0;
  listPostsCalls = 0;
  constructor() {
    super();
    for (const m of STORE_METHODS) {
      const orig = (MemoryStore.prototype as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[m];
      (this as unknown as Record<string, unknown>)[m] = async (...args: unknown[]) => {
        if (this.down) throw new Error(D1_ERR);
        const out = await orig.apply(this, args);
        if (m === "listPosts") {
          this.listPostsCalls++;
          this.postRowsRead += (out as unknown[]).length;
        }
        return out;
      };
    }
  }
}

function post(ts: number, asset = "SOL"): PostRow {
  return {
    ts, asset, spot_e6: 72_000_000, median_e6: 72_000_000, sigma_bps: 8000, horizon_secs: 86_400, k_x100: 300,
    max_ltv_bps: 7000, effective_ltv_bps: 6900, confident: 1, points: 8, expiry_ts: ts + 3600,
    ticker: `${asset}2611182200`, tx: `TX_${asset}_${ts}`,
  } as PostRow;
}

function feedData(postedAt: number): string {
  const b = new Uint8Array(FEED_POSTED_AT_OFFSET + 9);
  b.set(FEED_DISCRIMINATOR, 0);
  new DataView(b.buffer).setBigInt64(FEED_POSTED_AT_OFFSET, BigInt(postedAt), true);
  return Buffer.from(b).toString("base64");
}

/** Fake devnet RPC that answers getMultipleAccounts with Feed accounts for SOL and BTC only. */
function chainFetch(posted: Record<string, number>, calls: string[]): typeof fetch {
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { id: number; method: string; params: [string[]] };
    calls.push(body.method);
    const pid = new PublicKey(PROGRAM_ID);
    const value = body.params[0].map((key) => {
      const asset = ASSETS.find((a) => feedPda(a.symbol, pid).toBase58() === key)?.symbol;
      if (!asset || posted[asset] == null) return null;
      return { data: [feedData(posted[asset]), "base64"], executable: false, lamports: 1, owner: PROGRAM_ID, rentEpoch: 0, space: 110 };
    });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { context: { slot: 1 }, value } }), { status: 200 });
  }) as typeof fetch;
}

function env(store: MemoryStore, extra: Partial<Env> = {}): Env {
  return { PROGRAM_ID, RPC_URLS: "https://rpc.example", STREAMS_SINK_SECRET: "s", __store: store, ...extra };
}

async function get(e: Env, path: string) {
  const res = await worker.fetch(new Request(`https://example.com${path}`), e);
  return { res, body: (await res.json()) as unknown };
}

beforeEach(() => {
  resetMemoryState();
  vi.useFakeTimers();
  vi.setSystemTime(NOW * 1000);
});
afterEach(() => vi.useRealTimers());

describe("D1 down: endpoints degrade instead of throwing (no 1101)", () => {
  test("/health is 200 with storeError, feed ages from the onchain Feed accounts and sigs from memory", async () => {
    const store = new FlakyStore();
    await persistRun(store, [{ asset: "SOL", ticker: "SOL2611182200", sig: "SigMem" }], NOW - 20, null);
    store.down = true;
    const calls: string[] = [];
    const { res, body } = await get(env(store, { __fetch: chainFetch({ SOL: NOW - 30, BTC: NOW - 45 }, calls) }), "/health");
    expect(res.status).toBe(200);
    const h = body as { ok: boolean; storeError: string; source: string; lastSigs: Record<string, string>; feeds: Record<string, { ageSecs: number | null; lastSig: string | null }> };
    expect(h.ok).toBe(true);
    expect(h.storeError).toContain("daily rows read limit");
    expect(h.source).toBe("memory+onchain");
    expect(h.lastSigs).toEqual({ SOL: "SigMem" });
    expect(h.feeds.SOL).toMatchObject({ ageSecs: 30, lastSig: "SigMem" });
    expect(h.feeds.BTC?.ageSecs).toBe(45);
    expect(h.feeds.ETH).toBeUndefined();
    expect(calls).toEqual(["getMultipleAccounts"]);
  });

  test("/health still answers 200 when both D1 and the RPC fail, and says so", async () => {
    const store = new FlakyStore();
    store.down = true;
    const failing = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    const { res, body } = await get(env(store, { __fetch: failing }), "/health");
    expect(res.status).toBe(200);
    expect((body as { storeError: string }).storeError).toContain("daily");
    expect((body as { lastError: string }).lastError).toContain("onchain read failed");
  });

  test("/history and /actions with no cached copy are 503 JSON with a clear message and CORS", async () => {
    const store = new FlakyStore();
    store.down = true;
    for (const path of [`/history?asset=SOL&since=${NOW - 86_400}`, "/history?asset=SOL", `/actions?since=${NOW - 86_400}`]) {
      const { res, body } = await get(env(store), path);
      expect(res.status, path).toBe(503);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect((body as { error: string }).error).toMatch(/temporarily unavailable/);
      expect((body as { storeError: string }).storeError).toContain("daily");
    }
  });

  test("/history serves the last good rows, marked stale, when D1 fails after a good read", async () => {
    const store = new FlakyStore();
    store.posts.push(post(NOW - 600), post(NOW - 60));
    const path = `/history?asset=SOL&since=${NOW - 86_400}`;
    expect(((await get(env(store), path)).body as unknown[]).length).toBe(2);
    store.down = true;
    vi.setSystemTime((NOW + READ_TTL_SECS + 5) * 1000);
    const { res, body } = await get(env(store), `/history?asset=SOL&since=${NOW - 86_400 + 35}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-brace-cache")).toBe("stale");
    expect((body as { ts: number }[]).map((r) => r.ts)).toEqual([NOW - 600, NOW - 60]);
  });

  test("/streams answers 503 instead of throwing", async () => {
    const store = new FlakyStore();
    store.down = true;
    const ev = {
      name: "QuotesPosted", symbol: "SOL", confident: true, sigmaBps: 6842, maxLtvBps: 7140, effectiveLtvBps: 7140,
      spotE6: 71_965_000n, medianE6: 71_750_668n, points: 8, expiryTs: BigInt(NOW + 3600), ticker: "SOL2611182200",
      postedAt: BigInt(NOW),
    } as const;
    const payload = { data: [{ signature: "POST_SIG_1", err: null, logMessages: [`Program ${PROGRAM_ID} invoke [1]`, programDataLog(ev), `Program ${PROGRAM_ID} success`], blockTime: NOW, signer: null }], metadata: { network: "solana-devnet" } };
    const res = await worker.fetch(
      new Request("https://example.com/streams", { method: "POST", headers: { "content-type": "application/json", "x-brace-secret": "s" }, body: JSON.stringify(payload) }),
      env(store),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
  });

  test("persistRun never throws on a D1 error and keeps the run in memory", async () => {
    const store = new FlakyStore();
    store.down = true;
    await expect(persistRun(store, [{ asset: "BTC", sig: "SigB" }], NOW, null)).resolves.toBeUndefined();
    const calls: string[] = [];
    const { body } = await get(env(store, { __fetch: chainFetch({}, calls) }), "/health");
    expect((body as { lastSigs: Record<string, string> }).lastSigs).toEqual({ BTC: "SigB" });
  });
});

describe("read cache: same answers as D1, far fewer rows read", () => {
  test("24h SOL window: reads every row once, then only new rows; output equals the direct query", async () => {
    const store = new FlakyStore();
    for (let t = NOW - 86_400; t <= NOW; t += 60) store.posts.push(post(t), post(t, "BTC"));
    const e = env(store);
    const first = await get(e, `/history?asset=SOL&since=${NOW - 86_400}`);
    expect(first.res.headers.get("x-brace-cache")).toBe("d1");
    expect(first.res.headers.get("cache-control")).toBe(`public, max-age=${READ_TTL_SECS}`);
    const loaded = store.postRowsRead;
    expect(loaded).toBe(1441);

    // Polls inside the TTL: no D1 read at all.
    for (let i = 1; i <= 5; i++) {
      vi.setSystemTime((NOW + i) * 1000);
      const r = await get(e, `/history?asset=SOL&since=${NOW + i - 86_400}`);
      expect(r.res.headers.get("x-brace-cache")).toBe("cache");
    }
    expect(store.postRowsRead).toBe(loaded);

    // After the TTL, one new post: the delta read is the newest cached row plus the new one.
    store.posts.push(post(NOW + 60));
    vi.setSystemTime((NOW + 61) * 1000);
    const since = NOW + 61 - 86_400;
    const r = await get(e, `/history?asset=SOL&since=${since}`);
    expect(store.postRowsRead - loaded).toBe(2);
    const direct = await historyResponse(store, "SOL", since);
    expect(r.body).toEqual(JSON.parse(JSON.stringify(direct)));
  });

  test("/history?asset=X with no since: newest rows read once, then only deltas; output equals the direct query", async () => {
    const store = new FlakyStore();
    for (let t = NOW - 3 * 86_400; t <= NOW; t += 60) store.posts.push(post(t), post(t, "BTC"));
    const e = env(store);
    const first = await get(e, `/history?asset=SOL`);
    expect(first.res.status).toBe(200);
    expect(store.postRowsRead).toBe(3 * 1440 + 1);
    expect(first.body).toEqual(JSON.parse(JSON.stringify(await historyResponse(store, "SOL", undefined))));
    const loaded = store.postRowsRead; // includes the direct comparison read above

    for (let i = 1; i <= 5; i++) {
      vi.setSystemTime((NOW + i) * 1000);
      const r = await get(e, `/history?asset=SOL&limit=100`);
      expect(r.res.headers.get("x-brace-cache")).toBe("cache");
      expect((r.body as unknown[]).length).toBe(100);
    }
    expect(store.postRowsRead).toBe(loaded);

    store.posts.push(post(NOW + 60));
    vi.setSystemTime((NOW + 61) * 1000);
    const r = await get(e, `/history?asset=SOL&limit=500`);
    expect(store.postRowsRead - loaded).toBe(2);
    expect(r.res.headers.get("x-brace-cache")).toBe("d1");
    expect(r.body).toEqual(JSON.parse(JSON.stringify(await historyResponse(store, "SOL", undefined, 500))));

    // D1 goes down: the deep copy is served, marked stale.
    store.down = true;
    vi.setSystemTime((NOW + 200) * 1000);
    const stale = await get(e, `/history?asset=SOL&limit=10`);
    expect(stale.res.status).toBe(200);
    expect(stale.res.headers.get("x-brace-cache")).toBe("stale");
  });

  test("limit and since paging match the direct query from the cached window", async () => {
    const store = new FlakyStore();
    for (let t = NOW - 3600; t <= NOW; t += 60) store.posts.push(post(t));
    const e = env(store);
    await get(e, `/history?asset=SOL&since=${NOW - 86_400}`);
    const since = NOW - 1800;
    const r = await get(e, `/history?asset=SOL&since=${since}&limit=3`);
    expect(r.res.headers.get("x-brace-cache")).toBe("cache");
    expect(r.body).toEqual(JSON.parse(JSON.stringify(await historyResponse(store, "SOL", since, 3))));
  });

  test("a full reload every FULL_RELOAD_SECS picks up rows that arrived out of order", async () => {
    const store = new FlakyStore();
    store.posts.push(post(NOW - 120));
    const e = env(store);
    await get(e, `/history?asset=SOL&since=${NOW - 86_400}`);
    store.posts.push(post(NOW - 600)); // older than the newest cached row
    vi.setSystemTime((NOW + FULL_RELOAD_SECS) * 1000);
    const r = await get(e, `/history?asset=SOL&since=${NOW - 86_400}`);
    expect((r.body as { ts: number }[]).map((x) => x.ts)).toEqual([NOW - 600, NOW - 120]);
  });

  test("/actions rounds since to the minute for the cache but filters exactly", async () => {
    const store = new FlakyStore();
    for (const ts of [NOW - 100, NOW - 30, NOW - 10])
      store.actions.push({ ts, kind: "borrow", owner: null, amount: 1, ltv: 1, limit: 1, ok: 1, tx: `A${ts}`, error: null } as never);
    const e = env(store);
    const a = await get(e, `/actions?since=${NOW - 31}`);
    expect((a.body as { ts: number }[]).map((r) => r.ts)).toEqual([NOW - 30, NOW - 10]);
    vi.setSystemTime((NOW + 1) * 1000);
    const b = await get(e, `/actions?since=${NOW - 20}`);
    expect((b.body as { ts: number }[]).map((r) => r.ts)).toEqual([NOW - 10]);
  });

  test("/health is served from memory for a few seconds", async () => {
    const store = new FlakyStore();
    store.posts.push(post(NOW - 10));
    const e = env(store);
    let loads = 0;
    const orig = store.loadRelayerRun.bind(store);
    store.loadRelayerRun = async () => {
      loads++;
      return orig();
    };
    await get(e, "/health");
    vi.setSystemTime((NOW + 5) * 1000);
    const { body, res } = await get(e, "/health");
    expect(loads).toBe(1);
    expect(res.headers.get("cache-control")).toMatch(/max-age=/);
    expect((body as { storeError: null }).storeError).toBeNull();
  });
});

describe("onchain Feed decode", () => {
  test("posted_at is read at the IDL offset and wrong discriminators are ignored", () => {
    const ok = Buffer.from(feedData(1_794_900_000), "base64");
    expect(decodePostedAt(ok)).toBe(1_794_900_000);
    const bad = Uint8Array.from(ok);
    bad[0] = 0;
    expect(decodePostedAt(bad)).toBeNull();
    expect(decodePostedAt(new Uint8Array(20))).toBeNull();
  });
});
