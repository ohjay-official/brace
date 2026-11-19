// Audit M3 and L1: only events Brace itself emitted may reach history, and nothing dated in the future.
import { describe, expect, test } from "vitest";
import { programDataLog, type QuotesPostedEvent } from "../src/events.ts";
import { MemoryStore } from "../src/store.ts";
import { braceFrameLines, ingestPayload } from "../src/streams.ts";

const BRACE = "Frv6CVJKADmkM2cnBSMKgBWPvtHsfYkfye5d4vB84WyC";
const EVIL = "EviL1111111111111111111111111111111111111111";
const NOW = 1_795_100_000;

const ev = (postedAt: number, spot = 150): QuotesPostedEvent => ({
  name: "QuotesPosted", symbol: "SOL", confident: true, sigmaBps: 7000, maxLtvBps: 7000, effectiveLtvBps: 7000,
  spotE6: BigInt(spot * 1_000_000), medianE6: BigInt(spot * 1_000_000), points: 6, expiryTs: BigInt(postedAt + 3600),
  ticker: "SOL2611201700", postedAt: BigInt(postedAt),
});
const payload = (logs: string[], blockTime: number | null, err: unknown = null) => ({
  data: [{ signature: `SIG_${Math.random()}`, err, logMessages: logs, blockTime, signer: null }],
  metadata: { network: "solana-devnet" },
});
const opts = { programId: BRACE, now: NOW };

describe("only Brace's own frames count", () => {
  test("a real Brace post is ingested", async () => {
    const store = new MemoryStore();
    const logs = [`Program ${BRACE} invoke [1]`, "Program log: Instruction: PostQuotes", programDataLog(ev(NOW - 60)), `Program ${BRACE} consumed 38000 of 80000 compute units`, `Program ${BRACE} success`];
    expect((await ingestPayload(store, payload(logs, NOW - 60), opts)).posts).toBe(1);
  });

  test("another program logging Brace's id and a fake event is ignored", async () => {
    const store = new MemoryStore();
    const logs = [`Program ${EVIL} invoke [1]`, `Program log: ${BRACE}`, programDataLog(ev(NOW - 60, 999)), `Program ${EVIL} success`];
    const got = await ingestPayload(store, payload(logs, NOW - 60), opts);
    expect(got.posts).toBe(0);
    expect(got.actions).toBe(0);
  });

  test("a fake event logged by a program that Brace's frame never called is ignored, even in the same tx", async () => {
    const lines = braceFrameLines(
      [`Program ${BRACE} invoke [1]`, "Program log: a", `Program ${BRACE} success`, `Program ${EVIL} invoke [1]`, "Program data: fake", `Program ${EVIL} success`],
      BRACE,
    );
    expect(lines).toEqual(["Program log: a"]);
  });

  test("lines from a program Brace calls by CPI are not Brace's", () => {
    const lines = braceFrameLines(
      [`Program ${BRACE} invoke [1]`, "Program log: mine", `Program ${EVIL} invoke [2]`, "Program data: theirs", `Program ${EVIL} success`, "Program log: mine again", `Program ${BRACE} success`],
      BRACE,
    );
    expect(lines).toEqual(["Program log: mine", "Program log: mine again"]);
  });

  test("a blocked-borrow log from another program is not recorded as a Brace rejection", async () => {
    const store = new MemoryStore();
    const logs = [`Program ${EVIL} invoke [1]`, `Program log: ${BRACE} brace blocked ltv=9000 limit=1000`, `Program ${EVIL} failed: custom program error: 0x1775`];
    const got = await ingestPayload(store, payload(logs, NOW - 60, { InstructionError: [0, { Custom: 6005 }] }), opts);
    expect(got.actions).toBe(0);
  });

  test("a real Brace rejection is still recorded", async () => {
    const store = new MemoryStore();
    const logs = [`Program ${BRACE} invoke [1]`, "Program log: Instruction: Borrow", "Program log: brace blocked ltv=7208 limit=6954", "Program log: AnchorError occurred. Error Code: RiskTightened. Error Number: 6005.", `Program ${BRACE} failed: custom program error: 0x1775`];
    const got = await ingestPayload(store, payload(logs, NOW - 60, { InstructionError: [0, { Custom: 6005 }] }), opts);
    expect(got.actions).toBe(1);
  });

  test("events in a failed transaction are not stored as posts", async () => {
    const store = new MemoryStore();
    const logs = [`Program ${BRACE} invoke [1]`, programDataLog(ev(NOW - 60)), `Program ${BRACE} failed: custom program error: 0x1770`];
    expect((await ingestPayload(store, payload(logs, NOW - 60, { InstructionError: [0, { Custom: 6000 }] }), opts)).posts).toBe(0);
  });
});

describe("no rows from the future", () => {
  test("a transaction dated more than 5 minutes ahead is dropped", async () => {
    const store = new MemoryStore();
    const logs = [`Program ${BRACE} invoke [1]`, programDataLog(ev(NOW + 86_400 * 365)), `Program ${BRACE} success`];
    expect((await ingestPayload(store, payload(logs, null), opts)).posts).toBe(0);
    expect((await ingestPayload(store, payload(logs, NOW + 3600), opts)).posts).toBe(0);
  });
});
