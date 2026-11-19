"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { CopyField } from "@/components/ui/CopyField";
import { appActionsUrl, appHistoryUrl } from "@/lib/relay-config";
import { HistoryChart } from "@/components/HistoryChart";
import { fetchWithTimeout, friendlyNetError } from "@/lib/net";
import {
  HISTORY_WINDOW_SECS,
  RELAYER_URL,
  borrowActions,
  formatBorrowAction,
  parseActions,
  parseHistory,
  seriesForChart,
  type ActionRecord,
  type ChartPoint,
} from "@/lib/history";

type LoadState = "loading" | "ok" | "error";

class HttpError extends Error {}

const POLL_MS = 30_000;

export function HistoryView() {
  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [bounds, setBounds] = useState<{ t0: number; t1: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const now = Math.floor(Date.now() / 1000);
      const since = now - HISTORY_WINDOW_SECS;
      try {
        const [histRes, actRes] = await Promise.all([
          fetchWithTimeout(appHistoryUrl("SOL", since)),
          fetchWithTimeout(appActionsUrl(since)),
        ]);
        if (!histRes.ok || !actRes.ok) throw new HttpError();
        const [histBody, actBody] = await Promise.all([histRes.json(), actRes.json()]);
        const rows = parseHistory(histBody);
        const acts = parseActions(actBody);
        if (!alive) return;
        setPoints(seriesForChart(rows, now));
        setActions(borrowActions(acts));
        setBounds({ t0: since, t1: now });
        setError(null);
        setStatus("ok");
      } catch (e) {
        if (!alive) return;
        setError(e instanceof HttpError ? "The history service sent back an error." : friendlyNetError(e, "the history service"));
        setStatus((prev) => (prev === "ok" ? "ok" : "error"));
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const t0 = bounds?.t0 ?? Math.floor(Date.now() / 1000) - HISTORY_WINDOW_SECS;
  const t1 = bounds?.t1 ?? Math.floor(Date.now() / 1000);
  const chartStatus = status === "error" && !points.length ? "error" : status === "loading" && !points.length ? "loading" : "ok";
  const formatted = actions.map(formatBorrowAction);
  const [filter, setFilter] = useState<"all" | "ok" | "blocked">("all");
  const shown = formatted.filter((r) => (filter === "all" ? true : filter === "ok" ? r.ok : !r.ok));
  const nBlocked = formatted.filter((r) => !r.ok).length;
  const nOk = formatted.length - nBlocked;
  const rawUrl = `${RELAYER_URL}/history?asset=SOL`;

  return (
    <div className="history">
      <HistoryChart points={points} t0={t0} t1={t1} status={chartStatus} />

      <section className="history-actions" aria-labelledby="borrows-h">
        <div className="ha-head">
          <h2 id="borrows-h">Blocked and allowed borrows</h2>
          {formatted.length > 0 && (
            <div className="seg" role="radiogroup" aria-label="Filter borrows">
              {(
                [
                  ["all", `All ${formatted.length}`],
                  ["blocked", `Blocked ${nBlocked}`],
                  ["ok", `Accepted ${nOk}`],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={filter === k} className={filter === k ? "is-on" : ""} onClick={() => setFilter(k)}>
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
        {status === "loading" && !formatted.length ? (
          <div className="skel-list" role="status" aria-busy="true">
            <span className="sr-only">Reading QuickNode Streams.</span>
            <span className="skel skel-row" />
            <span className="skel skel-row" />
            <span className="skel skel-row" />
          </div>
        ) : status === "error" && !formatted.length ? (
          <div className="notice is-error" role="status">
            <strong>Could not load borrows</strong>
            <span className="muted">{error ?? ""} This page tries again every 30 seconds.</span>
          </div>
        ) : formatted.length === 0 ? (
          <div className="notice" role="status">
            <strong>No borrows recorded yet</strong>
            <span className="muted">Blocked and allowed borrows will appear here once someone uses the demo pool.</span>
          </div>
        ) : (
          <ul className="actions-list">
            {shown.map((row) => (
              <li key={`${row.href}-${row.ts}`} className={`arow2 ${row.ok ? "is-ok" : "is-blocked"}`}>
                <span className="ar-icon" aria-hidden>
                  {row.ok ? <Check size={16} /> : <Logo size={20} />}
                </span>
                <div className="ar-body">
                  <span className="ar-label">
                    {row.ok ? "Accepted" : "Blocked by the program"}
                  </span>
                  <span className="ar-detail">{row.detail}</span>
                  <span className="ar-when">{row.when}</span>
                </div>
                <a className="ar-link" href={row.href} target="_blank" rel="noopener noreferrer">
                  Explorer <ArrowUpRight size={14} aria-hidden />
                  <span className="sr-only"> for this {row.ok ? "accepted" : "blocked"} borrow</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="history-source card-lit" aria-label="Source">
        <div>
          <strong>Source</strong>
          <p>Recorded by QuickNode Streams from every Brace transaction on devnet, served by the Brace relayer.</p>
        </div>
        <CopyField label="Endpoint" value={rawUrl} display="/history?asset=SOL" />
        <a className="proof-link" href={rawUrl} target="_blank" rel="noopener noreferrer">
          Open raw data <ArrowUpRight size={14} aria-hidden />
        </a>
      </section>
    </div>
  );
}
