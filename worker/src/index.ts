import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { checkRate, RATE_MAX, RATE_WINDOW_SECS, type RateLimitBinding } from "./ratelimit.ts";
import bs58 from "bs58";
import { ASSETS, type Asset } from "./assets.ts";
import { checkSinkSecret, readJsonBody, SINK_SECRET_HEADER, verifyQuickNodeSignature } from "./auth.ts";
import { encodePostQuotes, toHex } from "./encode.ts";
import { fetchEvents, fetchSpotE6 } from "./gemini.ts";
import { cacheFor, HEALTH_TTL_SECS, READ_TTL_SECS } from "./cache.ts";
import { parseLimit, parseSinceStrict, toActionRecord, toHistoryRecord } from "./history.ts";
import { onchainPostedAt } from "./onchain.ts";
import {
  uniqueSigs,
  applySignatureStatuses,
  PENDING_EXPIRE_SECS,
  PENDING_STALE_SECS,
  type PendingSig,
  type SignatureStatusLike,
} from "./confirm.ts";
import { parseRpcUrls, rotateUrls, rpcAwareFetch, withRpcFallback } from "./rpc.ts";
import { selectLadder } from "./select.ts";
import { buildHealthReport, D1Store, type BraceStore, type RelayerAssetState, type RelayerRunState } from "./store.ts";
import { ingestPayload } from "./streams.ts";
import { packPostBatches, type PackedPost } from "./tx.ts";

/** getSignatureStatuses accepts at most 256 signatures per request. */
const SIG_STATUS_CHUNK = 256;

export type Env = {
  PROGRAM_ID: string;
  RPC_URL?: string;
  RPC_URLS?: string;
  RELAYER_SECRET?: string;
  STREAMS_SINK_SECRET?: string;
  QN_SECURITY_TOKEN?: string;
  DB?: D1Database;
  /** Workers Rate Limiting binding; optional so tests and local runs work without it. */
  RATE_LIMITER?: RateLimitBinding;
  /** Test-only in-memory store. */
  __store?: BraceStore;
  /** Test-only fetch for the /health onchain fallback. */
  __fetch?: typeof fetch;
};

type RunResult = { asset: string; ticker?: string; sig?: string; skipped?: string; error?: string };

const state: {
  lastRun: string | null;
  lastSigs: Record<string, string>;
  /** Last run as this isolate saw it, used by /health when D1 is unavailable. */
  run: RelayerRunState;
  /** Pending signatures D1 could not hold; confirmed on later ticks like the D1 ones. */
  pending: PendingSig[];
  lastStoreError: string | null;
} = {
  lastRun: null,
  lastSigs: {},
  run: { lastRun: null, lastError: null, assets: [] },
  pending: [],
  lastStoreError: null,
};

/** Test hook: forget in-memory relayer state. */
export function resetMemoryState(): void {
  state.lastRun = null;
  state.lastSigs = {};
  state.run = { lastRun: null, lastError: null, assets: [] };
  state.pending = [];
  state.lastStoreError = null;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function noteStoreError(where: string, err: unknown): string {
  const message = errMessage(err);
  state.lastStoreError = message;
  // Never log secrets; D1 errors carry only the limit or SQL error text.
  console.log(`brace store error (${where}): ${message.slice(0, 200)}`);
  return message;
}

function dedupePending(rows: PendingSig[]): PendingSig[] {
  const seen = new Set<string>();
  const out: PendingSig[] = [];
  for (const r of rows) {
    const k = `${r.sig}::${r.asset}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function unknownAssetMessage(symbol: string): string {
  return `unknown asset ${symbol.slice(0, 16)}; use one of ${ASSETS.map((a) => a.symbol).join(", ")}`;
}

function assetBySymbol(symbol: string): Asset | undefined {
  return ASSETS.find((a) => a.symbol === symbol.toUpperCase());
}

function loadRelayer(secret: string | undefined): Keypair {
  if (!secret) throw new Error("RELAYER_SECRET is not set");
  const bytes = bs58.decode(secret.trim());
  if (bytes.length !== 64) throw new Error("RELAYER_SECRET must be a base58 64-byte secret key");
  return Keypair.fromSecretKey(bytes);
}

export async function previewAsset(
  symbol: string,
  nowSeconds: number,
  fetchFn: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const asset = assetBySymbol(symbol);
  if (!asset) return { error: `unknown asset ${symbol}` };
  const events = await fetchEvents(fetchFn);
  const ladder = selectLadder(events, asset, nowSeconds);
  if (!ladder) return { asset: asset.symbol, selected: null };
  const spotE6 = await fetchSpotE6(asset, fetchFn);
  const data = encodePostQuotes({
    symbol: asset.symbol,
    expiryTs: ladder.expiryTs,
    ticker: ladder.ticker,
    spotE6,
    quotes: ladder.quotes,
  });
  return {
    asset: asset.symbol,
    ticker: ladder.ticker,
    expiryTs: ladder.expiryTs,
    spotE6: spotE6.toString(),
    quotes: ladder.quotes.map((q) => ({
      strikeE6: q.strikeE6.toString(),
      bidBps: q.bidBps,
      askBps: q.askBps,
    })),
    tightCount: ladder.tightCount,
    dataHex: toHex(data),
  };
}

function rpcConnection(url: string, rpcFetch: typeof fetch): Connection {
  return new Connection(url, {
    commitment: "confirmed",
    fetch: rpcFetch,
    disableRetryOnRateLimit: true,
  });
}

/** Lean retry: one retry then fall over, so a 429 does not multiply calls. */
const LEAN_RPC = { retries: 1 };

export async function confirmPendingSigs(
  store: BraceStore | null,
  urls: string[],
  rpcFetch: typeof fetch,
  nowSeconds: number,
): Promise<{ failed: (PendingSig & { error: string })[]; stillPending: Set<string> }> {
  const stillPending = new Set<string>();
  if (!store && !state.pending.length) return { failed: [], stillPending };
  const staleBefore = nowSeconds - PENDING_STALE_SECS;
  // Old pending rows can never block a post: drop them from memory and from D1, and only read recent ones.
  state.pending = state.pending.filter((p) => p.submittedAt >= staleBefore);
  let stored: PendingSig[] = [];
  if (store) {
    try {
      await store.purgePendingSigs(staleBefore);
    } catch (err) {
      noteStoreError("purgePendingSigs", err);
    }
    try {
      stored = await store.listPendingSigs(staleBefore);
    } catch (err) {
      // D1 down: keep posting; only signatures held in memory are confirmed this tick.
      noteStoreError("listPendingSigs", err);
    }
  }
  const pending = dedupePending([...stored, ...state.pending]).filter((p) => p.submittedAt >= staleBefore);
  if (!pending.length) return { failed: [], stillPending };
  const sigs = uniqueSigs(pending);
  try {
    const statuses: (SignatureStatusLike | undefined)[] = [];
    // getSignatureStatuses takes at most 256 signatures per call.
    for (let i = 0; i < sigs.length; i += SIG_STATUS_CHUNK) {
      const chunk = sigs.slice(i, i + SIG_STATUS_CHUNK);
      const { result } = await withRpcFallback(
        urls,
        async (url) => {
          const res = await rpcConnection(url, rpcFetch).getSignatureStatuses(chunk, {
            searchTransactionHistory: true,
          });
          return res.value;
        },
        LEAN_RPC,
      );
      statuses.push(...result);
    }
    const statusBySig = new Map<string, { err?: unknown; confirmationStatus?: string | null } | null>();
    sigs.forEach((sig, i) => statusBySig.set(sig, statuses[i] ?? null));
    const outcome = applySignatureStatuses(pending, statusBySig, nowSeconds);
    const done = [...outcome.confirmed, ...outcome.failed].map((p) => ({ sig: p.sig, asset: p.asset }));
    if (done.length) {
      const drop = new Set(done.map((d) => `${d.sig}::${d.asset}`));
      state.pending = state.pending.filter((p) => !drop.has(`${p.sig}::${p.asset}`));
      const inStore = done.filter((d) => stored.some((p) => p.sig === d.sig && p.asset === d.asset));
      if (store && inStore.length) {
        try {
          await store.removePendingSigs(inStore);
        } catch (err) {
          noteStoreError("removePendingSigs", err);
        }
      }
    }
    for (const p of outcome.pending) stillPending.add(p.asset);
    return { failed: outcome.failed, stillPending };
  } catch (err) {
    // Don't abort the tick if confirm fails; keep pending and still try to post.
    const message = err instanceof Error ? err.message : String(err);
    console.log(`brace confirm error: ${message}`);
    // Status unknown. Only a recent signature holds its asset back; an older one has expired either
    // way, so it must not stop the feed from posting (a stuck queue used to block every asset).
    for (const p of pending) if (nowSeconds - p.submittedAt < PENDING_EXPIRE_SECS) stillPending.add(p.asset);
    return { failed: [], stillPending };
  }
}

export async function runOnce(env: Env, nowSeconds: number, fetchFn: typeof fetch = fetch): Promise<RunResult[]> {
  const results: RunResult[] = [];
  const store = storeFromEnv(env);
  const relayer = loadRelayer(env.RELAYER_SECRET);
  const programId = new PublicKey(env.PROGRAM_ID);
  const urls = rotateUrls(parseRpcUrls(env), nowSeconds);
  const rpcFetch = rpcAwareFetch(fetchFn);

  const { failed: confirmFailed, stillPending } = await confirmPendingSigs(store, urls, rpcFetch, nowSeconds);
  for (const f of confirmFailed) {
    results.push({ asset: f.asset, error: `confirm: ${f.error}` });
    console.log(`brace post ${f.asset} error`);
  }

  const events = await fetchEvents(fetchFn);
  const posts: PackedPost[] = [];
  for (const asset of ASSETS) {
    try {
      if (stillPending.has(asset.symbol)) {
        results.push({ asset: asset.symbol, skipped: "pending confirmation" });
        continue;
      }
      const ladder = selectLadder(events, asset, nowSeconds);
      if (!ladder) {
        results.push({ asset: asset.symbol, skipped: "no valid ladder" });
        continue;
      }
      const spotE6 = await fetchSpotE6(asset, fetchFn);
      posts.push({
        symbol: asset.symbol,
        expiryTs: ladder.expiryTs,
        ticker: ladder.ticker,
        spotE6,
        quotes: ladder.quotes,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ asset: asset.symbol, error: message });
      console.log(`brace post ${asset.symbol} error`);
    }
  }

  if (!posts.length) return results;

  const { result: latest } = await withRpcFallback(
    urls,
    async (url) => rpcConnection(url, rpcFetch).getLatestBlockhash(),
    LEAN_RPC,
  );

  const batches = packPostBatches({
    programId,
    relayer,
    recentBlockhash: latest.blockhash,
    posts,
  });

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchUrls = rotateUrls(urls, i);
    const raw = batch.tx.serialize();
    try {
      const { result: sig } = await withRpcFallback(
        batchUrls,
        async (url) =>
          rpcConnection(url, rpcFetch).sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }),
        LEAN_RPC,
      );
      const pendingRows: PendingSig[] = batch.posts.map((post) => ({
        sig,
        asset: post.symbol,
        submittedAt: nowSeconds,
      }));
      let held = false;
      if (store) {
        try {
          await store.addPendingSigs(pendingRows);
          held = true;
        } catch (err) {
          noteStoreError("addPendingSigs", err);
        }
        if (!held) state.pending = dedupePending([...state.pending, ...pendingRows]);
      }
      for (const post of batch.posts) {
        results.push({ asset: post.symbol, ticker: post.ticker, sig });
        // Log only signatures and tickers.
        console.log(`brace post ${post.symbol} ${post.ticker} ${sig}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const post of batch.posts) {
        results.push({ asset: post.symbol, error: message });
        console.log(`brace post ${post.symbol} error`);
      }
    }
  }
  return results;
}

export async function persistRun(
  store: BraceStore | null,
  results: RunResult[],
  nowSeconds: number,
  runError: string | null,
): Promise<void> {
  const lastRun = new Date(nowSeconds * 1000).toISOString();
  const assetErrors = results.filter((r) => r.error).map((r) => `${r.asset}: ${r.error}`);
  const lastError = runError ?? (assetErrors.length ? assetErrors.join("; ") : null);
  state.lastRun = lastRun;
  for (const r of results) {
    if (r.sig) state.lastSigs[r.asset] = r.sig;
  }
  state.run = mergeRun(state.run, results, lastRun, lastError, nowSeconds);
  if (!store) return;
  // A D1 failure must not break the cron: memory already has this run for /health.
  try {
    const prev = await store.loadRelayerRun();
    const next = mergeRun(prev, results, lastRun, lastError, nowSeconds);
    await store.saveRelayerRun(next, prev);
    cacheFor(store).health = null;
  } catch (err) {
    noteStoreError("persistRun", err);
  }
}

function mergeRun(
  prev: RelayerRunState,
  results: RunResult[],
  lastRun: string,
  lastError: string | null,
  nowSeconds: number,
): RelayerRunState {
  const byAsset = new Map(prev.assets.map((a) => [a.asset, { ...a }]));
  for (const r of results) {
    const prevA: RelayerAssetState = byAsset.get(r.asset) ?? {
      asset: r.asset,
      lastSig: null,
      lastAt: null,
      lastError: null,
    };
    if (r.sig) {
      byAsset.set(r.asset, { asset: r.asset, lastSig: r.sig, lastAt: nowSeconds, lastError: null });
    } else if (r.error) {
      byAsset.set(r.asset, { ...prevA, lastError: r.error });
    }
  }
  return { lastRun, lastError, assets: [...byAsset.values()] };
}

export type HealthResponse = ReturnType<typeof buildHealthReport> & {
  storeError: string | null;
  source?: "d1" | "memory+onchain";
};

/**
 * /health. Normally from D1. If D1 throws (for example the free daily limit), it still answers 200:
 * feed ages come from the program's Feed accounts on devnet (posted_at), last signatures from this
 * isolate's memory, and storeError says what failed.
 */
export async function healthReport(
  store: BraceStore | null,
  nowSeconds: number,
  onchain?: () => Promise<Record<string, number>>,
): Promise<HealthResponse> {
  if (store) {
    const cache = cacheFor(store);
    if (cache.health && nowSeconds - cache.health.at < HEALTH_TTL_SECS) return cache.health.report;
    try {
      const run = await store.loadRelayerRun();
      const latestPosts = await store.latestPostTsByAsset();
      const report = { ...buildHealthReport(run, latestPosts, nowSeconds), storeError: null };
      cache.health = { at: nowSeconds, report };
      return report;
    } catch (err) {
      const storeError = noteStoreError("health", err);
      let posted: Record<string, number> = {};
      let lastError = state.run.lastError;
      if (onchain) {
        try {
          posted = await onchain();
        } catch (e) {
          lastError = lastError ?? `onchain read failed: ${errMessage(e)}`;
        }
      }
      const base = buildHealthReport(state.run, posted, nowSeconds);
      const report: HealthResponse = { ...base, lastError, storeError, source: "memory+onchain" };
      cache.health = { at: nowSeconds, report };
      return report;
    }
  }
  return {
    ok: true,
    lastRun: state.lastRun,
    lastError: null as string | null,
    lastSigs: state.lastSigs,
    feeds: {} as Record<string, never>,
    storeError: null,
  };
}

const STORE_DOWN_MESSAGE =
  "history store is temporarily unavailable (Cloudflare D1 error, usually the free daily limit). Onchain limits are unaffected; try again later.";

function readHeaders(source: string, storeError?: string): Record<string, string> {
  const h: Record<string, string> = {
    "cache-control": `public, max-age=${READ_TTL_SECS}`,
    "x-brace-cache": source,
  };
  if (storeError) h["x-brace-store-error"] = storeError.slice(0, 120).replace(/[^\x20-\x7e]/g, " ");
  return h;
}

function storeDown(err: unknown): Response {
  const storeError = noteStoreError("read", err);
  return Response.json(
    { error: STORE_DOWN_MESSAGE, storeError },
    { status: 503, headers: { ...corsHeaders(), "cache-control": "no-store", "retry-after": "60" } },
  );
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function corsJson(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...corsHeaders(), ...extra } });
}

/** GET endpoints anyone can call. /streams is guarded by its sink secret instead. */
const LIMITED_PATHS = new Set(["/health", "/preview", "/history", "/actions"]);

/** /preview calls Gemini twice per miss, so one answer per asset is reused for this long per isolate. */
export const PREVIEW_TTL_SECS = 15;
const previewMemo = new Map<string, { at: number; body: Record<string, unknown> }>();
export function clearPreviewMemo(): void {
  previewMemo.clear();
}

const d1Stores = new WeakMap<D1Database, D1Store>();

function storeFromEnv(env: Env): BraceStore | null {
  if (env.__store) return env.__store;
  if (env.DB) {
    let s = d1Stores.get(env.DB);
    if (!s) {
      s = new D1Store(env.DB);
      d1Stores.set(env.DB, s);
    }
    return s;
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && (url.pathname === "/history" || url.pathname === "/actions" || url.pathname === "/health")) {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method === "GET" && LIMITED_PATHS.has(url.pathname)) {
      const rate = await checkRate(request, url.pathname, env.RATE_LIMITER);
      if (!rate.ok) {
        return corsJson({ error: "rate limited", retryAfter: rate.retryAfter, limit: `${RATE_MAX} per ${RATE_WINDOW_SECS}s per IP` }, 429, {
          "retry-after": String(rate.retryAfter),
          "cache-control": "no-store",
        });
      }
    }
    if (url.pathname === "/health") {
      try {
        const onchain = () =>
          onchainPostedAt(new PublicKey(env.PROGRAM_ID), parseRpcUrls(env), rpcAwareFetch(env.__fetch ?? fetch));
        const report = await healthReport(storeFromEnv(env), Math.floor(Date.now() / 1000), onchain);
        return corsJson(report, 200, { "cache-control": `public, max-age=${HEALTH_TTL_SECS}` });
      } catch (err) {
        return corsJson({ ok: false, error: `health failed: ${errMessage(err)}` }, 500, { "cache-control": "no-store" });
      }
    }
    if (url.pathname === "/preview") {
      const symbol = (url.searchParams.get("asset") || "SOL").toUpperCase();
      if (!assetBySymbol(symbol)) return corsJson({ error: unknownAssetMessage(symbol) }, 400);
      try {
        const now = Date.now();
        const hit = previewMemo.get(symbol);
        if (hit && now - hit.at < PREVIEW_TTL_SECS * 1000) {
          return corsJson(hit.body, 200, { "cache-control": `public, max-age=${PREVIEW_TTL_SECS}`, "x-brace-cache": "memo" });
        }
        const body = await previewAsset(symbol, Math.floor(now / 1000));
        previewMemo.set(symbol, { at: now, body });
        return corsJson(body, 200, { "cache-control": `public, max-age=${PREVIEW_TTL_SECS}`, "x-brace-cache": "gemini" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return corsJson({ error: message }, 502);
      }
    }
    if (url.pathname === "/history" && request.method === "GET") {
      const store = storeFromEnv(env);
      if (!store) return corsJson({ error: "history store is not configured" }, 503);
      const rawAsset = url.searchParams.get("asset");
      const asset = rawAsset ? rawAsset.toUpperCase() : undefined;
      if (asset && !assetBySymbol(asset)) return corsJson({ error: unknownAssetMessage(asset) }, 400);
      const since = parseSinceStrict(url.searchParams.get("since"));
      if (!since.ok) return corsJson({ error: since.error }, 400);
      const limit = parseLimit(url.searchParams.get("limit"));
      if (!limit.ok) return corsJson({ error: limit.error }, 400);
      try {
        const read = await cacheFor(store).posts(store, asset, since.value, limit.value, Math.floor(Date.now() / 1000));
        return corsJson(read.rows.map(toHistoryRecord), 200, readHeaders(read.source, read.storeError));
      } catch (err) {
        return storeDown(err);
      }
    }
    if (url.pathname === "/actions" && request.method === "GET") {
      const store = storeFromEnv(env);
      if (!store) return corsJson({ error: "history store is not configured" }, 503);
      const since = parseSinceStrict(url.searchParams.get("since"));
      if (!since.ok) return corsJson({ error: since.error }, 400);
      const limit = parseLimit(url.searchParams.get("limit"));
      if (!limit.ok) return corsJson({ error: limit.error }, 400);
      try {
        const read = await cacheFor(store).actions(store, since.value, limit.value, Math.floor(Date.now() / 1000));
        return corsJson(read.rows.map(toActionRecord), 200, readHeaders(read.source, read.storeError));
      } catch (err) {
        return storeDown(err);
      }
    }
    if (url.pathname === "/streams" && request.method === "POST") {
      if (!checkSinkSecret(request.headers.get(SINK_SECRET_HEADER), env.STREAMS_SINK_SECRET)) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      const bodyText = await readJsonBody(request);
      if (env.QN_SECURITY_TOKEN) {
        const ok = await verifyQuickNodeSignature({
          nonce: request.headers.get("x-qn-nonce") || "",
          timestamp: request.headers.get("x-qn-timestamp") || "",
          body: bodyText,
          signature: request.headers.get("x-qn-signature") || "",
          securityToken: env.QN_SECURITY_TOKEN,
        });
        if (!ok) return Response.json({ error: "invalid signature" }, { status: 401 });
      }
      const store = storeFromEnv(env);
      if (!store) return Response.json({ error: "history store is not configured" }, { status: 503 });
      let payload: unknown = {};
      if (bodyText.length) {
        try {
          payload = JSON.parse(bodyText);
        } catch {
          return Response.json({ error: "invalid json" }, { status: 400 });
        }
      }
      let result: Awaited<ReturnType<typeof ingestPayload>>;
      try {
        result = await ingestPayload(store, payload);
      } catch (err) {
        // 503 instead of the Worker throwing a 1101; QuickNode may redeliver the batch.
        const storeError = noteStoreError("streams", err);
        return Response.json({ error: STORE_DOWN_MESSAGE, storeError }, { status: 503, headers: { "retry-after": "60" } });
      }
      cacheFor(store).invalidate();
      return Response.json({ ok: true, ...result });
    }
    return new Response("not found", { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const now = Math.floor(Date.now() / 1000);
        const store = storeFromEnv(env);
        try {
          const results = await runOnce(env, now);
          await persistRun(store, results, now, null);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.log(`brace cron error: ${message}`);
          try {
            await persistRun(store, [], now, message);
          } catch {
            console.log("brace cron error: failed to persist run state");
          }
        }
      })(),
    );
  },
};
