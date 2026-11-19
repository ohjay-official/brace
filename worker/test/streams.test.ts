import { Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { encodeEvent, eventsFromLogs, programDataLog, type QuotesPostedEvent } from "../src/events.ts";
import { actionsResponse, historyResponse, toHistoryRecord } from "../src/history.ts";
import { MemoryStore } from "../src/store.ts";
import { classifyFailure, extractStreamTxs, ingestPayload } from "../src/streams.ts";
import type { HistoryRecord } from "../src/history.ts";
import worker from "../src/index.ts";
import type { Env } from "../src/index.ts";

const root = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(join(root, "../../docs/sample-history.json"), "utf8")) as HistoryRecord[];
const solSample = sample.find((r) => r.asset === "SOL")!;

const owner = Keypair.generate().publicKey.toBase58();
const TX_POST = "POST_SIG_1111111111111111111111111111111111111111111";
const TX_BORROW = "BORROW_SIG_11111111111111111111111111111111111111111";
const TX_BLOCKED = "BLOCKED_SIG_1111111111111111111111111111111111111111";
const TX_STALE = "STALE_SIG_111111111111111111111111111111111111111111";

function quotesFromSample(row: HistoryRecord): QuotesPostedEvent {
  return {
    name: "QuotesPosted",
    symbol: row.asset,
    confident: row.confident,
    sigmaBps: Math.round(row.sigma_annual * 10_000),
    maxLtvBps: Math.round(row.max_ltv * 10_000),
    effectiveLtvBps: Math.round(row.effective_ltv * 10_000),
    spotE6: BigInt(Math.round(row.spot * 1_000_000)),
    medianE6: BigInt(Math.round(row.median * 1_000_000)),
    points: row.points,
    expiryTs: BigInt(row.expiry_ts),
    ticker: row.ticker,
    postedAt: BigInt(row.ts),
  };
}

function envelope(txs: unknown[], metadata: Record<string, unknown> = { network: "solana-devnet" }) {
  return { data: txs, metadata };
}

function filteredTx(sig: string, logs: string[], err: unknown, blockTime: number, signer?: string) {
  return { signature: sig, err, logMessages: logs, blockTime, signer: signer ?? null };
}

describe("event encode/decode", () => {
  test("QuotesPosted round-trips and matches the sample-history SOL numbers", () => {
    const ev = quotesFromSample(solSample);
    const decoded = eventsFromLogs([programDataLog(ev)]);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]).toMatchObject({
      name: "QuotesPosted",
      symbol: "SOL",
      confident: true,
      sigmaBps: 6842,
      maxLtvBps: 7140,
      effectiveLtvBps: 7140,
      points: 8,
      ticker: "SOL2611172200",
    });
    const q = decoded[0] as QuotesPostedEvent;
    expect(q.spotE6).toBe(71_965_000n);
    expect(q.medianE6).toBe(71_750_668n);
    expect(Number(q.postedAt)).toBe(solSample.ts);
    expect(encodeEvent(ev).length).toBeGreaterThan(8);
  });
});

describe("payload extraction", () => {
  test("reads the official {data, metadata} Streams envelope from a filter result", () => {
    const payload = envelope([
      filteredTx(TX_POST, ["Program log: hi"], null, 1794866304, owner),
    ]);
    const txs = extractStreamTxs(payload);
    expect(txs).toHaveLength(1);
    expect(txs[0].signature).toBe(TX_POST);
    expect(txs[0].blockTime).toBe(1794866304);
    expect(txs[0].err).toBeNull();
  });

  test("walks a raw Solana Block dataset payload", () => {
    const payload = {
      data: [
        {
          blockTime: 111,
          transactions: [
            {
              transaction: { signatures: ["BLK_SIG"], message: { accountKeys: [owner] } },
              meta: { err: null, logMessages: ["Program log: x"] },
            },
          ],
        },
      ],
      metadata: {},
    };
    const txs = extractStreamTxs(payload);
    expect(txs[0].signature).toBe("BLK_SIG");
    expect(txs[0].blockTime).toBe(111);
    expect(txs[0].signer).toBe(owner);
  });
});

describe("failed borrow classification", () => {
  test("RiskTightened from brace blocked log", () => {
    const got = classifyFailure(["Program log: brace blocked ltv=8000 limit=7500"], { InstructionError: [0, { Custom: 6005 }] });
    expect(got).toEqual({ error: "RiskTightened", ltv: 8000, limit: 7500 });
  });

  test("StalePrice from stale log and custom error 6009", () => {
    const got = classifyFailure(
      ["Program log: brace stale price age=4000 has_valid=1", "Error Code: StalePrice. Error Number: 6009."],
      { InstructionError: [2, { Custom: 6009 }] },
    );
    expect(got).toEqual({ error: "StalePrice", ltv: null, limit: null });
  });
});

describe("ingest + history contract", () => {
  test("/history?asset=SOL matches the spec/sample-history field set, oldest first", async () => {
    const store = new MemoryStore();
    const ev = quotesFromSample(solSample);
    const payload = envelope([
      filteredTx(TX_POST, [programDataLog(ev)], null, solSample.ts),
    ]);
    const ing = await ingestPayload(store, payload);
    expect(ing.posts).toBe(1);
    const rows = await historyResponse(store, "SOL", undefined);
    expect(rows).toHaveLength(1);
    const rec = rows[0];
    const expected = { ...solSample, tx: TX_POST };
    expect(rec).toEqual(expected);
    expect(Object.keys(rec).sort()).toEqual(Object.keys(solSample).sort());
  });

  test("since= filters history and actions", async () => {
    const store = new MemoryStore();
    const ev = quotesFromSample(solSample);
    await ingestPayload(
      store,
      envelope([
        filteredTx(TX_POST, [programDataLog(ev)], null, solSample.ts),
        filteredTx(
          TX_BORROW,
          [
            programDataLog({
              name: "Borrowed",
              owner,
              amount: 1_000_000n,
              ltvBps: 5000n,
              limitBps: 7140,
            }),
            "Program log: brace borrow owner=x amount=1000000 ltv=5000 limit=7140",
          ],
          null,
          solSample.ts + 10,
        ),
      ]),
    );
    expect(await historyResponse(store, "SOL", solSample.ts + 1)).toEqual([]);
    const actions = await actionsResponse(store, solSample.ts);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: "borrow", ok: true, owner, amount: 1_000_000, ltv: 5000, limit: 7140, tx: TX_BORROW, error: null });
  });

  test("failed RiskTightened and StalePrice borrows become blocked actions", async () => {
    const store = new MemoryStore();
    await ingestPayload(
      store,
      envelope([
        filteredTx(
          TX_BLOCKED,
          [
            "Program log: brace blocked ltv=8000 limit=7500",
            "Program log: AnchorError thrown in instructions/borrow.rs. Error Code: RiskTightened. Error Number: 6005. Error Message: Action would exceed the current risk limit.",
          ],
          { InstructionError: [0, { Custom: 6005 }] },
          solSample.ts,
          owner,
        ),
        filteredTx(
          TX_STALE,
          ["Program log: brace stale price age=4000 has_valid=1", "Error Code: StalePrice. Error Number: 6009."],
          { InstructionError: [0, { Custom: 6009 }] },
          solSample.ts + 1,
          owner,
        ),
      ]),
    );
    const actions = await actionsResponse(store, undefined);
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ kind: "blocked", ok: false, error: "RiskTightened", ltv: 8000, limit: 7500, tx: TX_BLOCKED, owner });
    expect(actions[1]).toMatchObject({ kind: "blocked", ok: false, error: "StalePrice", tx: TX_STALE, owner });
  });

  test("reingesting the same tx is idempotent", async () => {
    const store = new MemoryStore();
    const ev = quotesFromSample(solSample);
    const payload = envelope([filteredTx(TX_POST, [programDataLog(ev)], null, solSample.ts)]);
    await ingestPayload(store, payload);
    await ingestPayload(store, payload);
    expect(store.posts).toHaveLength(1);
    expect(toHistoryRecord(store.posts[0]).spot).toBe(solSample.spot);
  });
});

describe("worker HTTP sink and history", () => {
  const secret = "test-sink-secret";

  function envWithStore(store: MemoryStore, extra: Partial<Env> = {}): Env {
    return {
      PROGRAM_ID: "Frv6CVJKADmkM2cnBSMKgBWPvtHsfYkfye5d4vB84WyC",
      STREAMS_SINK_SECRET: secret,
      __store: store,
      ...extra,
    };
  }

  test("POST /streams without x-brace-secret is 401", async () => {
    const res = await worker.fetch(
      new Request("https://example.com/streams", { method: "POST", body: "{}" }),
      envWithStore(new MemoryStore()),
    );
    expect(res.status).toBe(401);
  });

  test("POST /streams with secret writes rows that GET /history and /actions return, with CORS", async () => {
    const store = new MemoryStore();
    const ev = quotesFromSample(solSample);
    const payload = envelope([
      // Real logs, as Solana writes them: the worker only trusts lines inside Brace's own frame.
      filteredTx(TX_POST, ["Program Frv6CVJKADmkM2cnBSMKgBWPvtHsfYkfye5d4vB84WyC invoke [1]", programDataLog(ev), "Program Frv6CVJKADmkM2cnBSMKgBWPvtHsfYkfye5d4vB84WyC success"], null, solSample.ts),
      filteredTx(
        TX_BLOCKED,
        ["Program Frv6CVJKADmkM2cnBSMKgBWPvtHsfYkfye5d4vB84WyC invoke [1]", "Program log: brace blocked ltv=8000 limit=7500", "Program log: AnchorError occurred. Error Code: RiskTightened. Error Number: 6005.", "Program Frv6CVJKADmkM2cnBSMKgBWPvtHsfYkfye5d4vB84WyC failed: custom program error: 0x1775"],
        { InstructionError: [0, { Custom: 6005 }] },
        solSample.ts,
        owner,
      ),
    ]);
    const post = await worker.fetch(
      new Request("https://example.com/streams", {
        method: "POST",
        headers: { "content-type": "application/json", "x-brace-secret": secret },
        body: JSON.stringify(payload),
      }),
      envWithStore(store),
    );
    expect(post.status).toBe(200);
    const posted = (await post.json()) as { ok: boolean; posts: number; actions: number };
    expect(posted).toMatchObject({ ok: true, posts: 1, actions: 1 });

    const hist = await worker.fetch(new Request("https://example.com/history?asset=SOL"), envWithStore(store));
    expect(hist.status).toBe(200);
    expect(hist.headers.get("access-control-allow-origin")).toBe("*");
    const rows = (await hist.json()) as HistoryRecord[];
    expect(rows[0]).toEqual({ ...solSample, tx: TX_POST });

    const acts = await worker.fetch(new Request("https://example.com/actions"), envWithStore(store));
    expect(acts.status).toBe(200);
    expect(acts.headers.get("access-control-allow-origin")).toBe("*");
    const actionRows = (await acts.json()) as { kind: string; error: string }[];
    expect(actionRows[0]).toMatchObject({ kind: "blocked", error: "RiskTightened" });

    const preflight = await worker.fetch(
      new Request("https://example.com/history?asset=SOL", { method: "OPTIONS" }),
      envWithStore(store),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("when QN_SECURITY_TOKEN is set, a bad X-QN-Signature is rejected", async () => {
    const body = JSON.stringify(envelope([]));
    const res = await worker.fetch(
      new Request("https://example.com/streams", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-brace-secret": secret,
          "x-qn-nonce": "abc",
          "x-qn-timestamp": "1",
          "x-qn-signature": "deadbeef",
        },
        body,
      }),
      envWithStore(new MemoryStore(), { QN_SECURITY_TOKEN: "qn-token" }),
    );
    expect(res.status).toBe(401);
  });
});
