import { ArrowUpRight, Check, Loader2, ShieldAlert, ShieldX, Wallet } from "lucide-react";
import { Logo } from "./Logo";
import { comparePcts } from "./display";

export type VerdictKind = "blocked" | "paused" | "failed" | "cancelled" | "success";

/**
 * Sort a finished action into a verdict from the plain-words message that
 * failureMessage() in lib/position already produced. Display only.
 */
export function verdictOf(ok: boolean, message: string): VerdictKind {
  if (ok) return "success";
  if (message.startsWith("Rejected onchain: this")) return "blocked";
  if (message.startsWith("Paused:")) return "paused";
  if (message.startsWith("You cancelled")) return "cancelled";
  return "failed";
}

const TITLES: Record<VerdictKind, string> = {
  blocked: "Blocked by the program",
  paused: "Borrowing paused by the program",
  failed: "Transaction failed",
  cancelled: "Cancelled in your wallet",
  success: "Confirmed on devnet",
};

/**
 * The result of a transaction as its own panel. "Blocked" is the product's
 * climax: the program refused an unsafe borrow (error 6005 RiskTightened).
 */
export function VerdictPanel({
  ok,
  label,
  message,
  sig,
  explorerHref,
  ltv,
  limit,
  blocked,
}: {
  ok: boolean;
  label: string;
  message: string;
  sig: string | null;
  explorerHref: string | null;
  ltv?: string | null;
  limit?: string | null;
  /** The program's own bps from its "brace blocked" log, when the app read it. */
  blocked?: { ltvBps: number; limitBps: number } | null;
}) {
  const kind = verdictOf(ok, message);
  // failureMessage() writes "...would put you at 72.1% against a live limit of 69.5%."
  const parsed = /at ([\d.]+%) against a live limit of ([\d.]+%)/.exec(message);
  const exact = blocked ? comparePcts(blocked.ltvBps, blocked.limitBps) : null;
  // Keep the sentence in step with the pair below when it needs the extra decimal.
  if (exact && parsed) message = message.replace(parsed[0], `at ${exact.ltv} against a live limit of ${exact.limit}`);
  ltv = ltv ?? exact?.ltv ?? parsed?.[1] ?? null;
  limit = limit ?? exact?.limit ?? parsed?.[2] ?? null;
  const Icon = kind === "success" ? Check : kind === "blocked" ? ShieldX : kind === "paused" ? ShieldAlert : kind === "cancelled" ? Wallet : ShieldAlert;
  return (
    <div className={`verdict v-${kind}`} role={kind === "success" || kind === "cancelled" ? "status" : "alert"}>
      <div className="verdict-top">
        <span className="verdict-icon">
          {kind === "blocked" ? <Logo size={26} /> : <Icon size={20} aria-hidden />}
        </span>
        <div className="verdict-title">
          <span className="verdict-k">{label}</span>
          <strong>{TITLES[kind]}</strong>
        </div>
        {kind === "blocked" && <span className="verdict-code">6005 RiskTightened</span>}
      </div>
      <p className="verdict-msg">{message}</p>
      {kind === "blocked" && (ltv || limit) && (
        <div className="verdict-compare">
          <div>
            <span>This borrow</span>
            <strong className="bad">{ltv ?? "--"}</strong>
          </div>
          <span className="vs" aria-hidden>
            over
          </span>
          <div>
            <span>Live limit</span>
            <strong>{limit ?? "--"}</strong>
          </div>
        </div>
      )}
      {sig && (
        <div className="verdict-log">
          <span className="mono">{kind === "blocked" ? `Rejected tx ${sig.slice(0, 6)}…${sig.slice(-6)} landed with its logs` : `Signature ${sig.slice(0, 8)}…${sig.slice(-8)}`}</span>
          {explorerHref && (
            <a className="verdict-link" href={explorerHref} target="_blank" rel="noopener noreferrer">
              View on Explorer <ArrowUpRight size={14} aria-hidden />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** Confirm, Sent, Result rail for the transaction that is in flight. */
export function TxRail({ phase, label, sig, explorerHref }: { phase: "wallet" | "sending"; label: string; sig: string | null; explorerHref: string | null }) {
  return (
    <div className="txrail" role="status" aria-live="polite">
      <div className="txrail-head">
        <Loader2 size={16} className="spin" aria-hidden />
        <strong>{label}</strong>
        <span>{phase === "wallet" ? "confirm in your wallet." : "sending to devnet."}</span>
      </div>
      <ol className="txrail-steps">
        <li className={phase === "wallet" ? "is-on" : "is-done"}>Confirm</li>
        <li className={phase === "sending" ? "is-on" : ""}>Sent</li>
        <li>Result</li>
      </ol>
      {sig && explorerHref && (
        <a className="verdict-link" href={explorerHref} target="_blank" rel="noopener noreferrer">
          View on Explorer <ArrowUpRight size={14} aria-hidden />
        </a>
      )}
    </div>
  );
}
