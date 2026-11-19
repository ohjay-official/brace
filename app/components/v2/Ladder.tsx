"use client";

import { untilTime, type Symbol } from "@/lib/brace";
import { chartDomain, fmtPrice, horizonLabel, niceTicks, pct1, probAbove } from "@/lib/chart";
import { useLadder } from "./live";
import { useFeedModel } from "./model";

/** "5:00 PM ET", or "Nov 20, 5:00 PM ET" when the expiry is not today in New York. */
export function expiryLabel(expiryTs: number, nowSecs: number): string {
  const d = new Date(expiryTs * 1000);
  const tz = "America/New_York";
  const time = d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const day = (x: Date) => x.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
  const today = nowSecs > 0 ? day(new Date(nowSecs * 1000)) : day(d);
  return day(d) === today ? `${time} ET` : `${day(d)}, ${time} ET`;
}

type Rung = { strike: number; bid: number | null; ask: number | null; fit: number | null };

/**
 * The ladder itself: one rung per strike, highest strike on top. The ink bar is
 * the live Gemini bid to ask for "ends at or above this price"; the pen tick is
 * where the program's onchain fit puts the same chance.
 */
export function LadderRungs({ symbol, max = 12 }: { symbol: Symbol; max?: number }) {
  const m = useFeedModel(symbol);
  const ladder = useLadder(m.feed?.ticker || null);
  const fitOk = m.median !== null && m.median > 0 && m.sT > 0;
  const fit = (k: number) => (fitOk ? probAbove(k, m.median!, m.sT) : null);

  let rungs: Rung[] = [];
  let source: "quotes" | "fit" | "none" = "none";
  if (ladder.quotes.length > 0) {
    rungs = ladder.quotes.map((q) => ({ strike: q.strike, bid: q.bid, ask: q.ask, fit: fit(q.strike) }));
    source = "quotes";
  } else if (fitOk && m.spot !== null) {
    const dom = chartDomain({ median: m.median!, sT: m.sT, spot: m.spot, band: m.band, strikes: [] });
    rungs = niceTicks(dom.min, dom.max, 9).filter((k) => k > 0).map((k) => ({ strike: k, bid: null, ask: null, fit: fit(k) }));
    source = "fit";
  }
  if (rungs.length > max) {
    const step = rungs.length / max;
    rungs = Array.from({ length: max }, (_, i) => rungs[Math.floor(i * step)]);
  }
  rungs = [...rungs].sort((a, b) => b.strike - a.strike);
  const spotAt = m.spot === null ? -1 : rungs.findIndex((r) => r.strike <= m.spot!);

  return (
    <figure className="rungs" aria-label={`${symbol} ladder: chance of ending at or above each strike`}>
      <figcaption className="rungs-head">
        <span>Strike</span>
        <span>Chance it ends at or above</span>
        <span>Mid</span>
      </figcaption>
      {source === "none" ? (
        <p className="rungs-empty">{m.down ? "Solana devnet is not answering." : m.loading ? "Reading the ladder" : "No confident fit to draw yet."}</p>
      ) : (
        <ol className="rungs-list">
          {rungs.map((r, i) => {
            const mid = r.bid !== null && r.ask !== null ? (r.bid + r.ask) / 2 : null;
            return (
              <li key={r.strike} className={i === spotAt ? "is-spot" : undefined} style={{ "--i": i } as React.CSSProperties}>
                {i === spotAt && m.spot !== null && (
                  <span className="rung-spot" aria-label={`spot ${fmtPrice(m.spot)}`}>
                    spot {fmtPrice(m.spot)}
                  </span>
                )}
                <span className="rung-k">{fmtPrice(r.strike)}</span>
                <span className="rung-track" aria-hidden>
                  {(mid ?? r.fit) !== null && <span className="rung-bar" style={{ width: `${(mid ?? r.fit ?? 0) * 100}%` }} />}
                  {r.bid !== null && r.ask !== null && (
                    <span className="rung-q" style={{ left: `${r.bid * 100}%`, width: `${Math.max(0.6, (r.ask - r.bid) * 100)}%` }} />
                  )}
                  {r.fit !== null && <span className="rung-fit" style={{ left: `${r.fit * 100}%` }} />}
                </span>
                <span className="rung-v">{mid !== null ? `${(mid * 100).toFixed(1)}%` : r.fit !== null ? `${(r.fit * 100).toFixed(1)}%` : "--"}</span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="rungs-foot">
        {source === "quotes" ? (
          <>
            <span className="key-item"><span className="key key-m" aria-hidden /> mid chance</span> <span className="key-item"><span className="key key-q" aria-hidden /> Gemini bid to ask</span> <span className="key-item"><span className="key key-f" aria-hidden /> onchain fit</span>
          </>
        ) : source === "fit" ? (
          "Gemini quotes are not loading right now, so every rung shows the onchain fit only."
        ) : null}
      </p>
    </figure>
  );
}

/** The limit, worked out line by line from the live feed, the way the program does it. */
export function Worksheet({ symbol }: { symbol: Symbol }) {
  const m = useFeedModel(symbol);
  const f = m.feed;
  const p = m.params;
  if (!f || !p) {
    return (
      <ol className="wsheet">
        {["Read the ladder", "Fit implied volatility onchain", "Size the move", "Haircut the liquidation line", "Clamp, then age"].map((t, i) => (
          <li key={t}>
            <span className="sh-n">0{i + 1}</span>
            <span className="sh-t">{t}</span>
            <span className="sh-v is-wait">{m.down ? "devnet down" : "reading"}</span>
          </li>
        ))}
      </ol>
    );
  }
  const term = (p.kX100 * Number(f.horizonMoveE6)) / 1e8;
  const kLabel = Number.isInteger(m.k) ? `${m.k}` : m.k.toFixed(2);
  const lp = m.path;
  const clampNote = !lp
    ? "No confident fit yet, the limit is held"
    : lp.rawBps > p.govMaxLtvBps
      ? `Capped at the governance max ${pct1(p.govMaxLtvBps)}`
      : lp.rawBps < p.absFloorLtvBps
        ? `Floored at ${pct1(p.absFloorLtvBps)}`
        : `Inside the cap of ${pct1(p.govMaxLtvBps)}`;
  const ageNote = m.limit !== null && m.limit < f.maxLtvBps ? `, then stepped down because the data is stale` : "";
  const rows: { t: string; d: string; v: string; key?: boolean }[] = [
    {
      t: "Read the ladder",
      d: f.ticker ? `${f.ticker}, expires ${expiryLabel(Number(f.expiryTs), m.now)} (${untilTime(Number(f.expiryTs) - m.now)})` : "No Gemini market on this feed",
      v: `${f.points} quotes`,
    },
    { t: "Fit implied volatility onchain", d: "Least squares on the quote midpoints, inside the Solana program", v: f.hasValid ? pct1(Number(f.sigmaBps)) : "--" },
    { t: "Size the move", d: `${kLabel}σ over ${horizonLabel(p.horizonSecs)}`, v: `±${(term * 100).toFixed(1)}%` },
    { t: "Haircut the liquidation line", d: `${pct1(p.liqThresholdBps)} × (1 − ${term.toFixed(3)})`, v: lp ? pct1(lp.rawBps) : "--" },
    { t: "Clamp, then age", d: clampNote + ageNote, v: m.limit !== null ? pct1(m.limit) : "--", key: true },
  ];
  return (
    <ol className="wsheet" aria-label={`How the ${symbol} limit is set right now`}>
      {rows.map((r, i) => (
        <li key={r.t} className={r.key ? "is-key" : undefined}>
          <span className="sh-n">0{i + 1}</span>
          <span className="sh-t">
            {r.t}
            <span className="sh-d">{r.d}</span>
          </span>
          <span className="sh-v">{r.v}</span>
        </li>
      ))}
    </ol>
  );
}
