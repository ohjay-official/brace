// When the relayer's free history store is paused for the day, History shows the last 24 hours
// recorded before the pause (real rows, saved from the relayer), clearly labelled with when they were saved.

import { parseHistory, type HistoryRecord } from "./history";

export type HistorySnapshot = { savedAt: number; rows: HistoryRecord[] };

export function snapshotUrl(asset: string): string {
  return `/snapshots/history-${encodeURIComponent(asset)}.json`;
}

export function parseSnapshot(body: unknown): HistorySnapshot | null {
  const b = body as { savedAt?: unknown; rows?: unknown } | null;
  if (!b || typeof b.savedAt !== "number" || !Array.isArray(b.rows)) return null;
  return { savedAt: b.savedAt, rows: parseHistory(b.rows) };
}
