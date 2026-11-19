import {
  DEFAULT_HORIZON_SECS,
  DEFAULT_K_X100,
  eventsFromLogs,
  type BraceEvent,
  type BorrowedEvent,
} from "./events.ts";
import type { ActionRow, BraceStore, PostRow } from "./store.ts";

export type StreamTx = {
  signature: string;
  err: unknown;
  logMessages: string[];
  blockTime: number | null;
  signer?: string | null;
};

const BLOCKED_RE = /brace blocked ltv=(\d+) limit=(\d+)/;
const STALE_RE = /brace stale price/;
const ERROR_CODE_RE = /Error Code: (RiskTightened|StalePrice)/;
const CUSTOM_ERR_RE = /custom program error: (0x[0-9a-fA-F]+|\d+)/;

export function extractStreamTxs(payload: unknown): StreamTx[] {
  if (payload == null) return [];
  const root = unwrapData(payload);
  const items = flattenItems(root);
  const out: StreamTx[] = [];
  for (const item of items) {
    const tx = asStreamTx(item);
    if (tx) out.push(tx);
  }
  return out;
}

function unwrapData(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "data" in (payload as object)) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}

function flattenItems(root: unknown): unknown[] {
  if (root == null) return [];
  if (!Array.isArray(root)) return [root];
  const out: unknown[] = [];
  for (const item of root) {
    if (Array.isArray(item)) {
      // Programs + Logs dataset wraps each block as an array of program-tx objects.
      out.push(...item);
    } else if (item && typeof item === "object" && Array.isArray((item as { transactions?: unknown[] }).transactions)) {
      const block = item as { blockTime?: number; transactions: unknown[] };
      for (const tx of block.transactions) {
        out.push(attachBlockTime(tx, block.blockTime ?? null));
      }
    } else {
      out.push(item);
    }
  }
  return out;
}

function attachBlockTime(tx: unknown, blockTime: number | null): unknown {
  if (!tx || typeof tx !== "object") return tx;
  return { ...(tx as object), blockTime: (tx as { blockTime?: number }).blockTime ?? blockTime };
}

function asStreamTx(item: unknown): StreamTx | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const signature =
    str(o.signature) ||
    firstSig((o.transaction as { signatures?: unknown } | undefined)?.signatures) ||
    null;
  if (!signature) return null;
  const meta = (o.meta as Record<string, unknown> | undefined) ?? undefined;
  const logMessages =
    strList(o.logMessages) ||
    strList(o.logs) ||
    strList(meta?.logMessages) ||
    [];
  const err = o.err !== undefined ? o.err : (meta?.err ?? null);
  const blockTime =
    num(o.blockTime) ??
    num((o as { block_time?: unknown }).block_time) ??
    null;
  const signer =
    str(o.signer) ||
    firstKey((o.transaction as { message?: { accountKeys?: unknown } } | undefined)?.message?.accountKeys) ||
    null;
  return { signature, err, logMessages, blockTime, signer };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function strList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.map((x) => String(x));
}
function firstSig(v: unknown): string | null {
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
}
function firstKey(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const k = v[0];
  if (typeof k === "string") return k;
  if (k && typeof k === "object" && typeof (k as { pubkey?: unknown }).pubkey === "string") {
    return (k as { pubkey: string }).pubkey;
  }
  return null;
}

export type IngestResult = { posts: number; actions: number; txs: number };

/** Rows dated further ahead than this are dropped (a future row would freeze the history cache). */
export const MAX_FUTURE_SECS = 300;

const INVOKE_RE = /^Program (\S+) invoke \[\d+\]$/;
const EXIT_RE = /^Program (\S+) (success|failed\b)/;

/**
 * The log lines a program emitted itself: only lines written while it is the innermost running
 * program, so another program that prints Brace's id or calls Brace cannot pass its lines off as Brace's.
 */
export function braceFrameLines(logs: string[], programId: string): string[] {
  const stack: string[] = [];
  const out: string[] = [];
  for (const line of logs) {
    const inv = INVOKE_RE.exec(line);
    if (inv) {
      stack.push(inv[1]);
      continue;
    }
    const exit = EXIT_RE.exec(line);
    if (exit && stack[stack.length - 1] === exit[1]) {
      stack.pop();
      continue;
    }
    if (stack[stack.length - 1] === programId && (line.startsWith("Program log: ") || line.startsWith("Program data: "))) out.push(line);
  }
  return out;
}

export type IngestOptions = {
  /** When set, only Brace's own log lines count, events from failed transactions are dropped, and future rows are refused. */
  programId?: string;
  now?: number;
};

export async function ingestPayload(store: BraceStore, payload: unknown, opts: IngestOptions = {}): Promise<IngestResult> {
  const txs = extractStreamTxs(payload);
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  let posts = 0;
  let actions = 0;
  for (const tx of txs) {
    const own = opts.programId ? braceFrameLines(tx.logMessages, opts.programId) : tx.logMessages;
    const failedTx = tx.err != null && tx.err !== false;
    // A failed transaction changed nothing onchain, so its events are not real (its rejection still is).
    const events = opts.programId && failedTx ? [] : eventsFromLogs(own);
    const ts = tx.blockTime ?? firstPostedAt(eventsFromLogs(own)) ?? 0;
    if (opts.programId && ts > now + MAX_FUTURE_SECS) continue;
    for (const ev of events) {
      if (ev.name === "QuotesPosted") {
        await store.upsertPost(postFromEvent(ev, tx.signature, ts));
        posts++;
      } else {
        const row = actionFromEvent(ev, tx.signature, ts);
        if (row) {
          await store.upsertAction(row);
          actions++;
        }
      }
    }
    const failed = opts.programId && !own.some((l) => BLOCKED_RE.test(l) || STALE_RE.test(l) || ERROR_CODE_RE.test(l)) ? null : failedActionFromLogs(tx, ts, events);
    if (failed) {
      await store.upsertAction(failed);
      actions++;
    }
  }
  return { posts, actions, txs: txs.length };
}

function firstPostedAt(events: BraceEvent[]): number | null {
  for (const ev of events) {
    if (ev.name === "QuotesPosted") return Number(ev.postedAt);
  }
  return null;
}

function postFromEvent(ev: Extract<BraceEvent, { name: "QuotesPosted" }>, tx: string, fallbackTs: number): PostRow {
  return {
    tx,
    asset: ev.symbol,
    ts: Number(ev.postedAt) || fallbackTs,
    spot_e6: Number(ev.spotE6),
    median_e6: Number(ev.medianE6),
    sigma_bps: ev.sigmaBps,
    horizon_secs: DEFAULT_HORIZON_SECS,
    k_x100: DEFAULT_K_X100,
    max_ltv_bps: ev.maxLtvBps,
    effective_ltv_bps: ev.effectiveLtvBps,
    confident: ev.confident ? 1 : 0,
    points: ev.points,
    expiry_ts: Number(ev.expiryTs),
    ticker: ev.ticker,
  };
}

function actionFromEvent(ev: BraceEvent, tx: string, ts: number): ActionRow | null {
  switch (ev.name) {
    case "Deposited":
      return { tx, kind: "deposit", ts, owner: ev.owner, amount: Number(ev.lamports), ltv: null, limit: null, ok: 1, error: null };
    case "Borrowed":
      return borrowedRow(ev, tx, ts);
    case "Repaid":
      return { tx, kind: "repay", ts, owner: ev.owner, amount: Number(ev.amount), ltv: null, limit: null, ok: 1, error: null };
    case "Withdrawn":
      return { tx, kind: "withdraw", ts, owner: ev.owner, amount: Number(ev.lamports), ltv: null, limit: null, ok: 1, error: null };
    case "Liquidated":
      return { tx, kind: "liquidate", ts, owner: ev.owner, amount: Number(ev.debt), ltv: null, limit: null, ok: 1, error: null };
    default:
      return null;
  }
}

function borrowedRow(ev: BorrowedEvent, tx: string, ts: number): ActionRow {
  return {
    tx,
    kind: "borrow",
    ts,
    owner: ev.owner,
    amount: Number(ev.amount),
    ltv: Number(ev.ltvBps),
    limit: ev.limitBps,
    ok: 1,
    error: null,
  };
}

export function classifyFailure(logs: string[], err: unknown): { error: "RiskTightened" | "StalePrice"; ltv: number | null; limit: number | null } | null {
  const joined = logs.join("\n");
  const blocked = joined.match(BLOCKED_RE);
  if (blocked) {
    return { error: "RiskTightened", ltv: Number(blocked[1]), limit: Number(blocked[2]) };
  }
  const named = joined.match(ERROR_CODE_RE);
  if (named) {
    return { error: named[1] as "RiskTightened" | "StalePrice", ltv: null, limit: null };
  }
  if (STALE_RE.test(joined) || hasCustomError(err, logs, 6009)) {
    return { error: "StalePrice", ltv: null, limit: null };
  }
  if (hasCustomError(err, logs, 6005)) {
    return { error: "RiskTightened", ltv: null, limit: null };
  }
  return null;
}

function hasCustomError(err: unknown, logs: string[], code: number): boolean {
  const blob = `${JSON.stringify(err ?? null)}\n${logs.join("\n")}`;
  if (blob.includes(`"Custom": ${code}`) || blob.includes(`"Custom":${code}`)) return true;
  if (blob.includes(`Error Number: ${code}`)) return true;
  const m = blob.match(CUSTOM_ERR_RE);
  if (!m) return false;
  const raw = m[1];
  const n = raw.startsWith("0x") ? parseInt(raw, 16) : parseInt(raw, 10);
  return n === code;
}

function failedActionFromLogs(tx: StreamTx, ts: number, events: BraceEvent[]): ActionRow | null {
  if (tx.err == null || tx.err === false) {
    // Still record blocked logs if present (should coincide with err, but be safe).
    const hasBlock = tx.logMessages.some((l) => BLOCKED_RE.test(l) || STALE_RE.test(l) || ERROR_CODE_RE.test(l));
    if (!hasBlock) return null;
  }
  const classified = classifyFailure(tx.logMessages, tx.err);
  if (!classified) return null;
  const owner =
    events.map((e) => ("owner" in e ? e.owner : null)).find((o) => o) || tx.signer || null;
  return {
    tx: tx.signature,
    kind: "blocked",
    ts,
    owner,
    amount: null,
    ltv: classified.ltv,
    limit: classified.limit,
    ok: 0,
    error: classified.error,
  };
}

export { postFromEvent };
