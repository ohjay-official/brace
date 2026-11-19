import { describe, expect, test } from "vitest";
import { parseSnapshot, snapshotUrl } from "./snapshot";

const row = { ts: 1_795_067_781, asset: "SOL", tx: "t", confident: true, sigma_annual: 0.7, max_ltv: 0.7, effective_ltv: 0.7, spot: 140, median: 140, horizon_secs: 86400, k: 3, points: 6, expiry_ts: 1_795_070_000, ticker: "SOL" };

describe("history snapshot fallback", () => {
  test("reads saved rows and when they were saved", () => {
    const got = parseSnapshot({ asset: "SOL", savedAt: 1_795_067_781, rows: [row] });
    expect(got?.savedAt).toBe(1_795_067_781);
    expect(got?.rows).toHaveLength(1);
  });
  test("anything malformed is no snapshot", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot({ savedAt: "x", rows: [] })).toBeNull();
    expect(parseSnapshot({ savedAt: 1, rows: "x" })).toBeNull();
  });
  test("one static file per asset", () => {
    expect(snapshotUrl("SOL")).toBe("/snapshots/history-SOL.json");
  });
});
