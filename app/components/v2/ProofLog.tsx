"use client";

import { ArrowUpRight } from "lucide-react";
import { PROGRAM_ID, REPO_URL, SYMBOLS, explorerAddress, relTime } from "@/lib/brace";
import { RELAYER_URL, explorerTx } from "@/lib/history";
import { useBoard } from "../BoardProvider";
import { CopyField } from "../ui/CopyField";
import { shortSig, useHealth, useLatestRelayerPost } from "./live";

/**
 * The relayer's own log, read from /health: the last transaction it landed for
 * each feed, and the last error it hit, word for word. Proof you can click.
 */
export function ProofLog() {
  const { health, failed } = useHealth();
  const { now, state } = useBoard();
  const latest = useLatestRelayerPost(state?.kind === "ok" ? state.config.relayer : null);
  /** /health only knows what its own Worker instance sent; devnet always has the newest post. */
  const sigFor = (s: (typeof SYMBOLS)[number]) => health?.feeds[s]?.lastSig ?? latest?.sig ?? null;
  const t = now || Math.floor(Date.now() / 1000);
  const id = PROGRAM_ID.toBase58();
  const tape = SYMBOLS.flatMap((s) => {
    const f = health?.feeds[s];
    const sig = sigFor(s);
    return sig
      ? [
          {
            s,
            sig,
            age: f?.lastPostTs ? relTime(t - f.lastPostTs) : "",
          },
        ]
      : [];
  });
  return (
    <>
      {tape.length > 0 && (
        <div className="pl-tape" aria-hidden>
          <div className="pl-tape-track">
            {[0, 1].map((k) => (
              <span key={k} className="pl-tape-set">
                {tape.map((x) => (
                  <span key={x.s} className="pl-tape-i">
                    <b>{x.s}</b>
                    <span>{x.sig}</span>
                    <i>{x.age}</i>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="prooflog">
        <div className="pl-main">
          <div className="pl-log" role="table" aria-label="Last relayer post per feed">
            <div className="pl-row pl-head" role="row">
              <span role="columnheader">Feed</span>
              <span role="columnheader">Last post</span>
              <span role="columnheader">Transaction</span>
            </div>
            {SYMBOLS.map((s) => {
              const f = health?.feeds[s];
              const sig = sigFor(s);
              return (
                <div key={s} className="pl-row" role="row">
                  <span role="cell" className="pl-sym">
                    {s}
                  </span>
                  <span role="cell">{f?.lastPostTs ? relTime(t - f.lastPostTs) : failed ? "relayer not answering" : health ? "no post yet" : "reading"}</span>
                  <span role="cell">
                    {sig ? (
                      <a href={explorerTx(sig)} target="_blank" rel="noopener noreferrer" className="pl-tx">
                        {shortSig(sig)} <ArrowUpRight size={14} aria-hidden />
                        <span className="sr-only"> on Solana Explorer</span>
                      </a>
                    ) : (
                      "--"
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="pl-err" role="status">
            {failed
              ? "The relayer is not answering right now. The limits above still come straight from devnet."
              : health?.lastError
                ? `Relayer's last error, as it logged it: ${health.lastError}. Limits hold or step down until it clears.`
                : health?.lastRun
                  ? "No relayer errors on the last run."
                  : health
                    ? "Transactions above come straight from devnet."
                  : "Reading the relayer log"}
          </p>
        </div>
        <div className="pl-side">
          <CopyField label="Program id" value={id} display={`${id.slice(0, 8)}…${id.slice(-8)}`} />
          <a className="pl-link" href={explorerAddress(id)} target="_blank" rel="noopener noreferrer">
            Program on Solana Explorer <ArrowUpRight size={16} aria-hidden />
          </a>
          <a className="pl-link" href={`${RELAYER_URL}/health`} target="_blank" rel="noopener noreferrer">
            Relayer health, raw <ArrowUpRight size={16} aria-hidden />
          </a>
          <a className="pl-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            Source on GitHub <ArrowUpRight size={16} aria-hidden />
          </a>
        </div>
      </div>
    </>
  );
}
