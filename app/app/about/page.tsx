import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/site";
import { ArrowRight } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { ProofLog } from "@/components/v2/ProofLog";
import { AboutSpy } from "@/components/v2/AboutSpy";

export const metadata: Metadata = pageMeta(
  "About",
  "How Brace works: Gemini prediction market ladders posted every minute, implied volatility fitted onchain on Solana, and a borrow limit that tightens before the market moves.",
  "/about",
);

const SECTIONS = [
  { id: "problem", n: "01", t: "The problem" },
  { id: "signal", n: "02", t: "The signal" },
  { id: "system", n: "03", t: "The system" },
  { id: "limit", n: "04", t: "The limit" },
  { id: "limits", n: "05", t: "Known limitations" },
];

/** Gemini to relayer to program to pool, with Streams feeding History. Plain HTML so it reads on any screen. */
function SignalChain() {
  const nodes = [
    { t: "Gemini", s: "Prediction market ladders, strike by strike" },
    { t: "Relayer", s: "Posts the raw quotes, every minute" },
    { t: "Brace program", s: "Fits volatility, stores the limit", key: true },
    { t: "Demo pool", s: "Checks every borrow against it" },
  ];
  return (
    <figure className="chain" data-scene>
      <span className="chain-wire" aria-hidden>
        <span className="chain-pkt" />
      </span>
      <ol>
        {nodes.map((n, i) => (
          <li key={n.t} className={n.key ? "is-key" : undefined} style={{ "--i": i } as React.CSSProperties}>
            <span className="c-n">0{i + 1}</span>
            <strong>{n.t}</strong>
            <span>{n.s}</span>
          </li>
        ))}
      </ol>
      <figcaption>QuickNode Streams records every program transaction, rejects included, for the History page.</figcaption>
    </figure>
  );
}

export default function AboutPage() {
  return (
    <div className="page wrap about">
      <PageHead
        kicker="UBC 2026 hackathon entry"
        title="How Brace works"
        lede="An onchain volatility oracle for Solana lending, built from Gemini prediction markets."
      />

      <div className="about-grid">
        <AboutSpy ids={SECTIONS.map((s) => s.id)} />
        <nav className="about-index" aria-label="On this page">
          <ol>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>
                  <span>{s.n}</span>
                  {s.t}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="about-body prose">
          <section id="problem" data-reveal>
            <h2 className="ab-n"><span>01</span> The problem</h2>
            <p>
              Lending markets set loan to value limits by governance vote and change them rarely. When volatility jumps, the limits are
              still the calm-week numbers. Implied volatility feeds from options markets mostly cover majors, and collateral like ZEC has no
              options on Deribit, the largest crypto options venue.
            </p>
          </section>

          <section id="signal" data-reveal>
            <h2 className="ab-n"><span>02</span> The signal</h2>
            <p>
              Gemini lists regulated &quot;X or above&quot; price ladders for BTC, ETH, SOL, XRP, ZEC and more, from hourly to multiweek
              expiries. A ladder is a market-implied probability curve, and a probability curve gives you implied volatility.
            </p>
          </section>

          <section id="system" data-reveal>
            <h2 className="ab-n"><span>03</span> The system</h2>
            <SignalChain />
            <p>
              A relayer reads Gemini&apos;s live ladders every minute and posts the raw quotes (strike, bid, ask, expiry, event ticker) to
              Solana devnet.
            </p>
            <blockquote className="pull">It posts quotes, never conclusions.</blockquote>
            <p>
              The Brace program filters the quotes, converts each midpoint to a z-score with a fixed lookup table, fits the curve by least
              squares, and stores implied volatility, a confidence flag and a max LTV per asset. All of this math runs onchain, so anyone
              can check it.
            </p>
          </section>

          <section id="limit" data-reveal>
            <h2 className="ab-n"><span>04</span> The limit</h2>
            <p>
              Max LTV is the lower of the governance max and a volatility-adjusted limit. Stale or low confidence data never loosens
              anything: Brace keeps the last valid limit and steps it down toward a conservative floor until fresh data arrives. A demo
              pool checks borrows and withdrawals against that limit; liquidation uses the 80% threshold in the config only.
            </p>
            <ProofLog />
          </section>

          <section id="limits" data-reveal>
            <h2 className="ab-n"><span>05</span> Known limitations</h2>
            <ul className="limits-list">
              <li>
                The relayer is trusted for quotes and spot. Mitigations: spot only moves on confident posts, must be within 3% of the
                ladder implied median, and goes stale after 1 hour.
              </li>
              <li>
                <span className="mono">initialize</span> can be front run between deploy and setup. Mitigation: deploy, initialize and
                init_pool run back to back from one script, then admin is verified onchain.
              </li>
              <li>Liquidation repays the full debt only (no partial liquidation). Test USD has no value.</li>
              <li>The check_borrow CPI for other lending programs was cut for time.</li>
              <li>Devnet only. No mainnet, no real funds, and the demo pool charges 0% interest.</li>
            </ul>
          </section>
        </div>
      </div>

      <section className="closer is-inline ink" aria-labelledby="ab-close">
        <h2 id="ab-close">See it refuse a borrow</h2>
        <p>Borrow over the live limit and the program rejects it onchain with error 6005, RiskTightened.</p>
        <div className="actions">
          <Link href="/borrow" className="btn btn-primary btn-lg">
            Try a borrow <ArrowRight size={18} aria-hidden />
          </Link>
          <Link href="/" className="text-link arrow-link">
            Back to the board <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
