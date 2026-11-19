"use client";

import { useEffect, useState } from "react";
import type { LadderQuote } from "@/app/api/ladder/route";
import { SYMBOLS, type Symbol } from "@/lib/brace";
import { RELAYER_URL, parseHistory } from "@/lib/history";
import { appHistoryUrl } from "@/lib/relay-config";
import { fetchWithTimeout } from "@/lib/net";

/** Live Gemini quotes for one ladder, from /api/ladder, every 30 seconds. Same contract as before the redesign. */
export type Ladder = { state: "loading" | "ok" | "unavailable"; quotes: LadderQuote[] };

export function useLadder(ticker: string | null): Ladder {
  const [ladder, setLadder] = useState<Ladder>({ state: "loading", quotes: [] });
  useEffect(() => {
    if (!ticker) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetchWithTimeout(`/api/ladder?ticker=${encodeURIComponent(ticker)}`);
        const body = (await res.json()) as { quotes?: LadderQuote[] };
        const quotes = Array.isArray(body.quotes) ? body.quotes : [];
        if (alive) setLadder({ state: quotes.length > 0 ? "ok" : "unavailable", quotes });
      } catch {
        if (alive) setLadder({ state: "unavailable", quotes: [] });
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [ticker]);
  return ticker ? ladder : { state: "unavailable", quotes: [] };
}

/** One reading of an asset's effective limit from the relayer's /history. Real rows only. */
export type TracePoint = { ts: number; v: number; sigma: number };
export type Traces = { state: "loading" | "ok" | "error"; since: number; data: Partial<Record<Symbol, TracePoint[]>> };

/** History for several assets over a window, thinned to at most `maxPoints` per asset, refreshed every 2 minutes. */
export function useTraces(windowSecs: number, symbols: readonly Symbol[] = SYMBOLS, maxPoints = 240): Traces {
  const key = symbols.join(",");
  const [t, setT] = useState<Traces>({ state: "loading", since: 0, data: {} });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const since = Math.floor(Date.now() / 1000) - windowSecs;
      const out: Partial<Record<Symbol, TracePoint[]>> = {};
      await Promise.all(
        key.split(",").map(async (sym) => {
          try {
            const res = await fetchWithTimeout(appHistoryUrl(sym, since));
            if (!res.ok) return;
            const rows = parseHistory(await res.json())
              .filter((r) => r.ts >= since)
              .sort((a, b) => a.ts - b.ts);
            const step = Math.max(1, Math.ceil(rows.length / maxPoints));
            out[sym as Symbol] = rows
              .filter((_, i) => i % step === 0 || i === rows.length - 1)
              .map((r) => ({ ts: r.ts, v: r.effective_ltv, sigma: r.sigma_annual }));
          } catch {
            // This asset gets no trace; the row says so.
          }
        }),
      );
      if (!alive) return;
      setT({ state: Object.keys(out).length ? "ok" : "error", since, data: out });
    };
    load();
    const id = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [key, windowSecs, maxPoints]);
  return t;
}

/** Relayer /health: last run, last error and the last post per feed. */
export type Health = {
  ok: boolean;
  lastRun: string | null;
  lastError: string | null;
  feeds: Partial<Record<Symbol, { lastSig: string | null; lastPostTs: number | null }>>;
};

export function useHealth(): { health: Health | null; failed: boolean } {
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetchWithTimeout(`${RELAYER_URL}/health`);
        const body = (await res.json()) as {
          ok?: boolean;
          lastRun?: string;
          lastError?: string | null;
          feeds?: Record<string, { lastSig?: string; lastPostTs?: number }>;
        };
        const feeds: Health["feeds"] = {};
        for (const s of SYMBOLS) {
          const f = body.feeds?.[s];
          if (f) feeds[s] = { lastSig: typeof f.lastSig === "string" ? f.lastSig : null, lastPostTs: typeof f.lastPostTs === "number" ? f.lastPostTs : null };
        }
        if (!alive) return;
        setHealth({ ok: !!body.ok, lastRun: body.lastRun ?? null, lastError: typeof body.lastError === "string" && body.lastError ? body.lastError : null, feeds });
        setFailed(false);
      } catch {
        if (alive) setFailed(true);
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return { health, failed };
}

/** Element width from a ResizeObserver, for SVGs drawn in real pixels. */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const [el, setEl] = useState<T | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w] as const;
}

export const shortSig = (s: string, n = 6) => `${s.slice(0, n)}…${s.slice(-n)}`;
