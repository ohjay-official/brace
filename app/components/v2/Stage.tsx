"use client";

import { useId, useRef } from "react";
import { chartDomain, curvePoints, fmtPrice, niceTicks, pct1, probAbove } from "@/lib/chart";
import type { Symbol } from "@/lib/brace";
import { StatusCell } from "../Instruments";
import { BraceGauge } from "./BraceGauge";
import { useLadder, useWidth } from "./live";
import { figure, useFeedModel } from "./model";

function tick(v: number): string {
  if (v >= 10_000) return `$${Number((v / 1000).toFixed(1))}k`;
  if (v >= 100) return `$${Math.round(v)}`;
  if (v >= 1) return `$${Number(v.toFixed(2))}`;
  return `$${Number(v.toFixed(3))}`;
}

/**
 * The stage: a full-bleed colour scene with the headline over it, and one glass
 * instrument holding the live limit, the brace, and the fit the program stored
 * onchain with the live Gemini quotes standing on it. Every mark comes from
 * devnet or /api/ladder; when either is missing the card says so.
 */
export function Stage({ symbol, children, id, art = "scene" }: { symbol: Symbol; children?: React.ReactNode; id?: string; art?: "scene" | "ladder" }) {
  const m = useFeedModel(symbol);
  const ladder = useLadder(m.feed?.ticker || null);
  const [ref, W] = useWidth<HTMLDivElement>(520);
  const compact = W < 460;
  const H = compact ? 200 : 250;
  const top = 22;
  const bottom = 30;
  const ph = H - top - bottom;

  // The probe: what the onchain fit says about any strike under the pointer.
  const scale = useRef<{
    min: number;
    max: number;
    median: number;
    sT: number;
  } | null>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<SVGGElement>(null);
  const readRef = useRef<HTMLSpanElement>(null);
  const frame = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const probe = (clientX: number, clientY: number, paper: HTMLElement) => {
    const sc = scale.current;
    const box = paper.getBoundingClientRect();
    if (!sc || !probeRef.current || !dotRef.current || !readRef.current) return;
    if (clientY < box.top - 8 || clientY > box.bottom + 8) return hideProbe();
    const x = Math.max(0, Math.min(box.width, clientX - box.left));
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const k = sc.min + (x / box.width) * (sc.max - sc.min);
      const p = probAbove(k, sc.median, sc.sT);
      const y = top + (1 - p) * ph;
      probeRef.current!.style.transform = `translate3d(${x}px,0,0)`;
      probeRef.current!.classList.toggle("is-left", x > box.width / 2);
      dotRef.current!.style.transform = `translate3d(${x}px,${y}px,0)`;
      readRef.current!.textContent = `${fmtPrice(k)}: ${(p * 100).toFixed(1)}% chance above`;
      cardRef.current?.classList.add("is-probing");
    });
  };
  const hideProbe = () => {
    cancelAnimationFrame(frame.current);
    cardRef.current?.classList.remove("is-probing");
  };

  let chart: React.ReactNode = null;
  let note: string | null = null;

  if (m.feed && m.params && m.spot !== null && m.median !== null) {
    const quotes = ladder.quotes;
    const dom = chartDomain({
      median: m.median,
      sT: m.sT,
      spot: m.spot,
      band: m.band,
      strikes: quotes.map((q) => q.strike),
    });
    const xs = (v: number) => ((v - dom.min) / (dom.max - dom.min)) * W;
    const ys = (p: number) => top + (1 - p) * ph;
    const xt = niceTicks(dom.min, dom.max, compact ? 3 : 5).filter((v) => xs(v) > Math.max(36, W * 0.1) && xs(v) < W - Math.max(36, W * 0.1));
    const pts = m.median > 0 && m.sT > 0 ? curvePoints(m.median, m.sT, dom.min, dom.max, 140) : null;
    const curve = pts ? pts.map((p, i) => `${i ? "L" : "M"}${xs(p.x).toFixed(1)},${ys(p.y).toFixed(1)}`).join("") : null;
    const area = curve ? `${curve}L${W},${top + ph}L0,${top + ph}Z` : null;
    const penP = m.sT > 0 ? probAbove(m.spot, m.median, m.sT) : null;
    const sx = xs(m.spot);
    scale.current = pts ? { min: dom.min, max: dom.max, median: m.median, sT: m.sT } : null;
    chart = (
      <svg className="st-chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden focusable="false">
        <defs>
          <linearGradient id={`g${uid}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#9945FF" />
            <stop offset="0.55" stopColor="var(--c-cyan)" />
            <stop offset="1" stopColor="#14F195" />
          </linearGradient>
          <linearGradient id={`a${uid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--c-violet)" stopOpacity="0.34" />
            <stop offset="1" stopColor="var(--c-cyan)" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`c${uid}`}>
            <rect className="st-reveal" x={0} y={0} width={W} height={H} />
          </clipPath>
        </defs>
        <line x1={0} x2={W} y1={top + ph} y2={top + ph} className="st-base" />
        <text x={W - Math.max(24, W * 0.1)} y={top - 8} textAnchor="end" className="st-lbl">
          chance it ends above
        </text>
        {xt.map((v) => (
          <text key={v} x={xs(v)} y={top + ph + 20} textAnchor="middle" className="st-lbl">
            {tick(v)}
          </text>
        ))}
        <line x1={sx} x2={sx} y1={top} y2={top + ph} className="st-spot" />
        <g clipPath={`url(#c${uid})`}>
          {area && <path d={area} fill={`url(#a${uid})`} />}
          {curve && <path d={curve} className="st-glow" stroke={`url(#g${uid})`} />}
          {curve && <path d={curve} className="st-curve" stroke={`url(#g${uid})`} />}
        </g>
        {quotes.map((q, i) => {
          const x = xs(q.strike);
          return (
            <g key={q.strike} className="st-rung" style={{ "--i": i } as React.CSSProperties}>
              <line x1={x} x2={x} y1={ys(q.bid)} y2={ys(q.ask)} />
            </g>
          );
        })}
        <g ref={dotRef} className="st-probe-dot">
          <circle cx={0} cy={0} r={6} />
        </g>
        {penP !== null && (
          <g className="st-pen">
            <circle cx={sx} cy={ys(penP)} r={9} className="st-pen-halo" />
            <circle cx={sx} cy={ys(penP)} r={4.5} />
          </g>
        )}
      </svg>
    );
    note = !curve
      ? "No confident fit stored yet. The limit is held, not loosened."
      : ladder.state === "unavailable"
        ? `Gemini quotes are not loading right now. The curve is the last fit stored onchain, spot ${fmtPrice(m.spot)}.`
        : ladder.state === "ok"
          ? `${quotes.length} Gemini quotes on the fit stored onchain. Spot ${fmtPrice(m.spot)}.`
          : "Reading Gemini quotes.";
  }

  const stale = m.status === "stale";
  return (
    <section className={`stage${stale ? " is-stale" : ""}${m.limit === null ? " is-empty" : ""}`} aria-labelledby={id}>
      <div className={`scene${art === "ladder" ? " scene-ladder" : ""}`} aria-hidden>
        {art === "ladder" ? <LadderArt /> : <span className="scene-img" />}
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
      </div>
      <div className={`wrap stage-grid${children ? "" : " is-solo"}`}>
        {children && <div className="stage-copy">{children}</div>}
        <div className="stage-data">
          <div className="stage-read">
            <p className="sf-k">
              <span>{symbol} borrow limit, live</span>
              <StatusCell status={m.down ? null : m.status} />
            </p>
            <p className="numeral" aria-label={m.limit === null ? `${symbol} limit not read yet` : `${symbol} limit ${pct1(m.limit)}`}>
              <span className="n-v" aria-hidden>
                {(m.limit === null ? "--.-" : figure(m.limit)).split("").map((c, i) => (
                  <span key={`${i}${c}`} className="n-c" style={{ "--i": i } as React.CSSProperties}>
                    {c}
                  </span>
                ))}
              </span>
              <span className="n-p">%</span>
            </p>
            <BraceGauge limitBps={m.limit} capBps={m.cap} liqBps={m.liq} tone={stale ? "stale" : undefined} />
            <p className="sf-meta">
              {m.down
                ? "Solana devnet is not answering. Trying again every 15 seconds."
                : m.loading
                  ? "Reading the feed from Solana devnet"
                  : m.feed
                    ? [
                        m.ageText ? `fit ${m.ageText}` : null,
                        `implied vol ${pct1(Number(m.feed.sigmaBps))}`,
                        m.limit !== null ? `buffer ${((m.liq - m.limit) / 100).toFixed(1)} pts` : null,
                      ]
                        .filter(Boolean)
                        .join("  ·  ")
                    : `No ${symbol} feed on devnet yet`}
            </p>
          </div>
          <div
            className="stage-chart"
            ref={cardRef}
            onPointerMove={(e) => {
              const paper = e.currentTarget.querySelector<HTMLElement>(".stage-paper");
              if (e.pointerType === "mouse" && paper) probe(e.clientX, e.clientY, paper);
            }}
            onPointerDown={(e) => {
              const paper = e.currentTarget.querySelector<HTMLElement>(".stage-paper");
              if (e.pointerType !== "mouse" && paper) probe(e.clientX, e.clientY, paper);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") hideProbe();
            }}
          >
            <div className="stage-paper" ref={ref} aria-hidden style={{ height: chart ? H : 0 }}>
              {chart}
              <div ref={probeRef} className="st-probe" style={{ top, height: ph }}>
                <span ref={readRef} className="st-probe-read" />
              </div>
            </div>
            {chart && scale.current && <p className="st-hint">{compact ? "Tap the curve to read any strike" : "Point at the curve to read any strike"}</p>}
            {note && <p className="sf-note">{note}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Asset page signature: a stack of glass rungs shaped like an "ends above" curve. Decoration only, no data. */
const RUNG_W = [96, 92, 85, 74, 60, 45, 32, 21, 13];
function LadderArt() {
  return (
    <span className="lad-art">
      {RUNG_W.map((w, i) => (
        <span key={i} className="lad-rung" style={{ "--w": `${w}%`, "--i": i } as React.CSSProperties} />
      ))}
    </span>
  );
}
