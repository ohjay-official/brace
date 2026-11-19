import { describe, expect, test } from "vitest";
import { latestOkSig } from "./relayer-sig";

describe("latest relayer post from devnet", () => {
  test("picks the newest signature that did not fail", () => {
    const res = { result: [
      { signature: "failed1", err: { InstructionError: [0, "x"] }, blockTime: 30 },
      { signature: "good2", err: null, blockTime: 20 },
      { signature: "good3", err: null, blockTime: 10 },
    ] };
    expect(latestOkSig(res)).toEqual({ sig: "good2", blockTime: 20 });
  });
  test("nothing usable gives null", () => {
    expect(latestOkSig({ result: [] })).toBeNull();
    expect(latestOkSig({ error: { message: "rate limited" } })).toBeNull();
    expect(latestOkSig(null)).toBeNull();
    expect(latestOkSig({ result: [{ signature: 5, err: null }] })).toBeNull();
  });
});
