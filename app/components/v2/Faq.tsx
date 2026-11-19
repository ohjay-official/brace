"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { REPO_URL } from "@/lib/brace";

/** Every answer comes from the README and the program. No numbers that are not in the code. */
export const FAQ: { q: string; a: string }[] = [
  {
    q: "What is Brace?",
    a: 'An onchain volatility oracle for Solana lending, built from Gemini prediction markets. It reads Gemini\'s live "price X or above" ladders, computes implied volatility onchain on Solana, and tightens borrowing limits before the move. It runs on Solana devnet.',
  },
  {
    q: "Where does the data come from?",
    a: "Gemini's public prediction market API. For each asset the relayer picks the earliest expiring \"above\" ladder between 15 minutes and 72 hours out with at least 4 two sided quotes, and posts up to 16 strikes with their bid and ask, plus Gemini's spot price. The board covers SOL, BTC, ETH, XRP and ZEC, and the relayer posts every minute.",
  },
  {
    q: "How is implied volatility computed onchain?",
    a: 'Each contract "price at or above K at expiry" trades at a probability. Under a lognormal model, the probit of that probability falls on a straight line in ln(K), with a slope of minus 1 over σ√T. The program fits that line by least squares from the raw quotes, which gives σ√T and the implied median. The relayer never posts a volatility number: the program computes it from the quotes. The quotes themselves come from a trusted relayer (see Known Limitations in the README).',
  },
  {
    q: "How is the borrow limit set?",
    a: "The fit is scaled to the move it implies over 24 hours, s. The limit is 80% × (1 − 3s), clamped between 30% and the 75% governance cap. The market moves a limit inside that band and never above the cap governance set. Liquidation uses the 80% threshold set in the config, never the odds.",
  },
  {
    q: "What happens when the feed goes stale?",
    a: "Thin, stale or inconsistent data never loosens a limit. The program holds the last limit for 5 minutes, then steps it down 2.5 points every 5 minutes, to a 50% floor or the last limit if that is lower. After an hour without a confident post, borrowing, withdrawing with debt and liquidation pause.",
  },
  {
    q: "What does error 6005, RiskTightened, mean?",
    a: "The program refused a borrow that would take your loan to value past the live limit. The check runs onchain in the borrow instruction, so it holds even if someone skips this app. Phantom may warn that the transaction fails to simulate; that is expected, and confirming past it lands the rejection onchain.",
  },
  {
    q: "Is this real money?",
    a: "No. Brace runs on Solana devnet only. You deposit devnet SOL and borrow a test USD token minted by the pool, at 0% interest. It shows the risk limit working, not a full lending market, and nothing here is financial advice.",
  },
  {
    q: "Who built it?",
    a: "Brace was built during UBC 2026 by Oh-Jay, Alchin Daryabari and Omar Dosuyev. Oh-Jay led development, Alchin built the forecast validation and analytics tracker, and Omar led the presentation. The code is open source under the MIT licence.",
  },
];

export function Faq() {
  const base = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [open, setOpen] = useState<number | null>(0);
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return (
    <div className="faq">
      <ul className="faq-list">
        {FAQ.map((f, i) => {
          const on = open === i;
          return (
            <li key={f.q} className={`faq-item${on ? " is-open" : ""}`} style={{ "--i": i } as React.CSSProperties}>
              <h3>
                <button
                  type="button"
                  id={`${base}q${i}`}
                  aria-expanded={on}
                  aria-controls={`${base}a${i}`}
                  onClick={() => setOpen(on ? null : i)}
                  className="faq-q"
                >
                  <span>{f.q}</span>
                  <Plus size={18} strokeWidth={1.75} aria-hidden className="faq-icon" />
                </button>
              </h3>
              <div id={`${base}a${i}`} role="region" aria-labelledby={`${base}q${i}`} className="faq-a" hidden={!on}>
                <p>{f.a}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="faq-more">
        More detail, with the code behind each answer, is in the{" "}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          README on GitHub
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        .
      </p>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </div>
  );
}
