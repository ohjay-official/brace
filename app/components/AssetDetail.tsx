"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { SYMBOLS, explorerAddress, feedPda, fromE6, relTime, untilTime, type Symbol } from "@/lib/brace";
import { horizonLabel, pct1 } from "@/lib/chart";
import { BoardNotice, useBoard } from "./BoardProvider";
import { ASSET_NAMES } from "./Instruments";
import { CopyField } from "./ui/CopyField";
import { LadderRungs, Worksheet, expiryLabel } from "./v2/Ladder";
import { useFeedModel } from "./v2/model";
import { Stage } from "./v2/Stage";

export function AssetDetail({ symbol }: { symbol: Symbol }) {
  const { state } = useBoard();
  const m = useFeedModel(symbol);
  const f = m.feed;
  const p = m.params;
  const pda = feedPda(symbol).toBase58();

  const rows: [string, string][] =
    f && p
      ? [
          ["Spot price", `$${fromE6(f.spotE6)}`],
          ["Implied median at expiry", `$${fromE6(f.medianE6)}`],
          ["Gemini market", f.ticker || "none"],
          ["Expires", `${expiryLabel(Number(f.expiryTs), m.now)}, ${untilTime(Number(f.expiryTs) - m.now)}`],
          ["Implied volatility, annual", pct1(Number(f.sigmaBps))],
          [`${horizonLabel(p.horizonSecs)} move, 1σ`, `${(Number(f.horizonMoveE6) / 1e4).toFixed(1)}%`],
          ["Quotes used in the fit", `${f.points}`],
          ["Last confident update", f.hasValid ? relTime(m.now - Number(f.lastValidAt)) : "never"],
          ["Max limit, last confident", pct1(f.maxLtvBps)],
          ["Governance cap", pct1(m.cap)],
          ["Liquidation threshold", pct1(m.liq)],
        ]
      : [];

  return (
    <div className="asset-page">
      <Stage symbol={symbol} id="asset-title" art="ladder">
        <nav className="aswitch" aria-label="Assets">
          {SYMBOLS.map((s) => (
            <Link key={s} href={`/asset/${s}`} aria-current={s === symbol ? "page" : undefined}>
              {s}
            </Link>
          ))}
        </nav>
        <h1 id="asset-title" className="display">
          {ASSET_NAMES[symbol]}
        </h1>
        <p className="lede">
          The {symbol} feed on Solana devnet. The limit below is what the program allows against {symbol} collateral right now.
        </p>
        <div className="actions">
          {symbol === "SOL" ? (
            <Link href="/borrow" className="btn btn-primary btn-lg">
              Try a borrow against SOL <ArrowRight size={18} aria-hidden />
            </Link>
          ) : (
            <Link href="/asset/SOL" className="btn btn-secondary btn-lg">
              The demo pool takes SOL <ArrowRight size={18} aria-hidden />
            </Link>
          )}
        </div>
      </Stage>

      {(state?.kind !== "ok" || !f) && (
        <div className="wrap asset-notices">
          <BoardNotice state={state} />
          {state?.kind === "ok" && !f && (
            <div className="notice" role="status">
              <strong>No data</strong>
              <span className="muted">The {symbol} feed account does not exist on devnet yet.</span>
            </div>
          )}
        </div>
      )}

      <section className="band ink" aria-labelledby="a-ladder" data-scene>
        <div className="wrap">
          <header className="shead">
            <p className="shead-k">{symbol} ladder</p>
            <h2 id="a-ladder">The strikes behind the number</h2>
          </header>
          <div className="ladder-grid">
            <LadderRungs symbol={symbol} max={16} />
            <Worksheet symbol={symbol} />
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="a-facts" data-scene>
        <div className="wrap">
          <header className="shead">
            <p className="shead-k">Feed account</p>
            <h2 id="a-facts">Everything the program stores for {symbol}</h2>
          </header>
          <div className="facts-grid">
            {rows.length > 0 ? (
              <dl className="spec">
                {rows.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">{m.down ? "Solana devnet is not answering." : "Reading the feed account"}</p>
            )}
            <div className="facts-side">
              <CopyField label="Feed account" value={pda} display={`${pda.slice(0, 6)}…${pda.slice(-6)}`} />
              <a href={explorerAddress(pda)} target="_blank" rel="noopener noreferrer" className="pl-link">
                Feed account on Solana Explorer <ArrowUpRight size={16} aria-hidden />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
