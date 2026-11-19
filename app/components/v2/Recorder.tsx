"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SYMBOLS, feedEffectiveLtvBps, feedStatus, relTime, type Symbol } from "@/lib/brace";
import { pct1 } from "@/lib/chart";
import { useBoard } from "../BoardProvider";
import { ASSET_NAMES, StatusCell } from "../Instruments";
import { useTraces, useWidth, type TracePoint } from "./live";

const WINDOW = 24 * 3600;

/** Splits a trace wherever the relayer went quiet, so outages show as gaps instead of straight lines. */
function segments(pts: TracePoint[]): TracePoint[][] {
  if (pts.length < 2) return [pts];
  const gaps = pts.slice(1).map((p, i) => p.ts - pts[i].ts).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)] || 120;
  const limit = Math.max(900, median * 4);
  const out: TracePoint[][] = [[pts[0]]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].ts - pts[i - 1].ts > limit) out.push([]);
    out[out.length - 1].push(pts[i]);
  }
  return out;
}

function Trace({ pts, loading, since, until, lo, hi, cap, sym }: { pts: TracePoint[] | undefined; loading: boolean; since: number; until: number; lo: number; hi: number; cap: number; sym: Symbol }) {
  const [ref, w] = useWidth<HTMLSpanElement>(600);
  const h = 56;
  const x = (ts: number) => ((ts - since) / Math.max(1, until - since)) * w;
  const y = (v: number) => 4 + (1 - (v - lo) / Math.max(1e-6, hi - lo)) * (h - 8);
  if (!pts || pts.length < 2) {
    return (
      <span ref={ref} className="ch-trace is-empty">
        <span>{loading ? "reading 24 hours of posts" : pts === undefined ? "history store paused for today; the limit above is live" : "not enough posts in 24h"}</span>
      </span>
    );
  }
  const segs = segments(pts);
  const last = pts[pts.length - 1];
  return (
    <span ref={ref} className="ch-trace">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${sym} limit over 24 hours, ${pct1(pts[0].v * 10000)} to ${pct1(last.v * 10000)}`}>
        <defs>
          <linearGradient id={`rf${sym}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--ch)" stopOpacity="0.32" />
            <stop offset="1" stopColor="var(--ch)" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`rc${sym}`}>
            <rect className="ch-reveal" x={0} y={0} width={w} height={h} />
          </clipPath>
        </defs>
        <line x1={0} x2={w} y1={y(cap)} y2={y(cap)} className="ch-cap" />
        <g clipPath={`url(#rc${sym})`}>
        {segs.map((s, i) =>
          s.length > 1 ? (
            <path
              key={`a${i}`}
              className="ch-area"
              fill={`url(#rf${sym})`}
              d={`${s.map((p, j) => `${j ? "L" : "M"}${x(p.ts).toFixed(1)},${y(p.v).toFixed(1)}`).join("")}L${x(s[s.length - 1].ts).toFixed(1)},${h}L${x(s[0].ts).toFixed(1)},${h}Z`}
            />
          ) : null,
        )}
        {segs.map((s, i) =>
          s.length > 1 ? (
            <path key={i} className="ch-line" d={s.map((p, j) => `${j ? "L" : "M"}${x(p.ts).toFixed(1)},${y(p.v).toFixed(1)}`).join("")} />
          ) : s.length === 1 ? (
            <circle key={i} className="ch-solo" cx={x(s[0].ts)} cy={y(s[0].v)} r="1.5" />
          ) : null,
        )}
        </g>
        <circle className="ch-pen" cx={x(last.ts)} cy={y(last.v)} r="3.5" />
      </svg>
    </span>
  );
}

/**
 * The recorder: five channels, one per asset, each tracing the effective limit
 * the relayer posted over the last 24 hours. Same vertical scale for all five,
 * so a channel that dips really dipped. Gaps are hours with no posts.
 */
export function Recorder() {
  const { state, now } = useBoard();
  const ok = state?.kind === "ok" ? state : null;
  const tr = useTraces(WINDOW);
  const cap = (ok?.config.params.govMaxLtvBps ?? 7500) / 10000;
  const all = Object.values(tr.data).flatMap((p) => (p ?? []).map((q) => q.v));
  const lo = all.length ? Math.min(...all) - 0.02 : 0.5;
  const hi = all.length ? Math.max(cap, ...all) + 0.01 : 0.8;
  const until = now || Math.floor(Date.now() / 1000);
  const since = until - WINDOW;
  return (
    <div className="recorder">
      <ul className="channels">
        {SYMBOLS.map((s, i) => {
          const f = ok?.feeds[s] ?? null;
          const status = ok ? feedStatus(f, ok.config.params, now) : null;
          const limit = ok && f ? feedEffectiveLtvBps(f, ok.config.params, now) : null;
          return (
            <li key={s} style={{ "--i": i, "--ch": `var(--a-${s.toLowerCase()})` } as React.CSSProperties}>
              <Link href={`/asset/${s}`} className="ch">
                <span className="ch-id">
                  <strong>{s}</strong>
                  <span>{ASSET_NAMES[s]}</span>
                </span>
                <Trace pts={tr.data[s]} loading={tr.state === "loading"} since={since} until={until} lo={lo} hi={hi} cap={cap} sym={s} />
                <span className="ch-read">
                  <strong>{limit === null ? "--" : pct1(limit)}</strong>
                  <span>
                    {f ? `vol ${pct1(Number(f.sigmaBps))}` : "no feed"}
                    {f && f.hasValid ? `, ${relTime(now - Number(f.lastValidAt))}` : ""}
                  </span>
                </span>
                <span className="ch-st">
                  <StatusCell status={status} compact />
                  <ArrowUpRight size={16} aria-hidden className="ch-go" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="ch-axis" aria-hidden>
        <span />
        <span className="ch-axis-t">
          <span>24h ago</span>
          <span>18h</span>
          <span>12h</span>
          <span>6h</span>
          <span>now</span>
        </span>
        <span />
        <span />
      </div>
    </div>
  );
}
