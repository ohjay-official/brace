/** RPC URL lists, 429 backoff, and endpoint fallback for the relayer. */

/**
 * RPC_URL_BACKUP is an optional Worker secret (a keyed endpoint, e.g. QuickNode,
 * whose URL contains the key). It is always tried last and never rotated in.
 */
export type RpcEnv = { RPC_URLS?: string; RPC_URL?: string; RPC_URL_BACKUP?: string };

const DEFAULT_DEVNET = "https://solana-devnet.api.onfinality.io/public";

function publicRpcUrls(env: RpcEnv): string[] {
  const raw = (env.RPC_URLS && env.RPC_URLS.trim()) || env.RPC_URL || "";
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of parts) {
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out.length ? out : [DEFAULT_DEVNET];
}

function backupRpcUrl(env: RpcEnv, publicUrls: string[]): string | null {
  const url = (env.RPC_URL_BACKUP ?? "").trim();
  if (!url.startsWith("https://") || publicUrls.includes(url)) return null;
  return url;
}

/** Public URLs in order, then the keyed backup (if set). */
export function parseRpcUrls(env: RpcEnv): string[] {
  const pub = publicRpcUrls(env);
  const backup = backupRpcUrl(env, pub);
  return backup ? [...pub, backup] : pub;
}

/** Relayer order for one run: public URLs rotated by `offset` to spread load, backup always last. */
export function relayerRpcUrls(env: RpcEnv, offset: number): string[] {
  const pub = publicRpcUrls(env);
  const backup = backupRpcUrl(env, pub);
  const rotated = rotateUrls(pub, offset);
  return backup ? [...rotated, backup] : rotated;
}

/** Replace any of `urls` in an error message with "[rpc]" so keyed URLs never reach logs or /health. */
function redactRpcUrls(err: unknown, urls: string[]): Error {
  const e = err instanceof Error ? err : new Error(String(err));
  let msg = e.message;
  for (const url of urls) {
    if (!url) continue;
    msg = msg.split(url).join("[rpc]");
    const bare = url.replace(/\/+$/, "");
    if (bare) msg = msg.split(bare).join("[rpc]");
    try {
      const host = new URL(url).host;
      if (host) msg = msg.split(host).join("[rpc]");
    } catch {
      // not a URL: nothing more to redact
    }
  }
  if (msg === e.message) return e;
  const out = new Error(msg) as Error & { status?: number };
  const status = (e as { status?: number }).status;
  if (status !== undefined) out.status = status;
  return out;
}

export function retryAfterMs(err: unknown, attempt: number): number {
  const rec = err as { retryAfterMs?: number; status?: number };
  if (typeof rec.retryAfterMs === "number" && rec.retryAfterMs > 0) {
    return Math.min(5_000, rec.retryAfterMs);
  }
  return Math.min(2_000, 200 * 2 ** attempt);
}

export function isRetryableRpcError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const status = (err as { status?: number }).status;
    if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /\b429\b|Too Many Requests|rate ?limit|ECONNRESET|ETIMEDOUT|network|fetch failed|502|503|504|timeout/i.test(msg);
}

export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; sleep?: SleepFn } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const sleep = opts.sleep ?? defaultSleep;
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (attempt === retries || !isRetryableRpcError(err)) throw err;
      await sleep(retryAfterMs(err, attempt));
    }
  }
  throw last;
}

export async function withRpcFallback<T>(
  urls: string[],
  fn: (url: string) => Promise<T>,
  opts: { retries?: number; sleep?: SleepFn } = {},
): Promise<{ result: T; url: string }> {
  if (!urls.length) throw new Error("no rpc urls");
  let last: unknown;
  for (const url of urls) {
    try {
      const result = await retryWithBackoff(() => fn(url), opts);
      return { result, url };
    } catch (err) {
      last = err;
    }
  }
  throw redactRpcUrls(last, urls);
}

/** RPC calls give up after this long; the timeout error is retryable and fails over to the next URL. */
export const RPC_TIMEOUT_MS = 10_000;

/** Wrap fetch so HTTP 429/5xx become retryable errors before web3.js parses the body. */
export function rpcAwareFetch(base: typeof fetch = fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const withTimeout: RequestInit = init?.signal ? init : { ...init, signal: AbortSignal.timeout(RPC_TIMEOUT_MS) };
    const res = await base(input, withTimeout);
    if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
      const err = new Error(`rpc http ${res.status}`) as Error & { status: number; retryAfterMs?: number };
      err.status = res.status;
      const ra = res.headers.get("retry-after");
      if (ra) {
        const secs = Number(ra);
        if (Number.isFinite(secs) && secs >= 0) err.retryAfterMs = secs * 1000;
      }
      throw err;
    }
    return res;
  }) as typeof fetch;
}

/** Rotate the list so index `offset` becomes first, then wrap. Used to spread load across RPCs. */
export function rotateUrls(urls: string[], offset: number): string[] {
  if (urls.length <= 1) return [...urls];
  const i = ((offset % urls.length) + urls.length) % urls.length;
  return [...urls.slice(i), ...urls.slice(0, i)];
}
