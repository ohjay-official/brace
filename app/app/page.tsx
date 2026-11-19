import { Faq } from "@/components/v2/Faq";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Closer } from "@/components/v2/Closer";
import { LadderRungs, Worksheet } from "@/components/v2/Ladder";
import { ProofLog } from "@/components/v2/ProofLog";
import { Recorder } from "@/components/v2/Recorder";
import { StepDown } from "@/components/v2/Rules";
import { Stage } from "@/components/v2/Stage";

export default function Home() {
  return (
    <>
      <Stage symbol="SOL" id="hero-title">
        <p className="kick">Solana devnet, UBC 2026</p>
        <h1 id="hero-title" className="display">
          <span className="hl-line">
            <span className="hl-in">Lending limits that move</span>
          </span>{" "}
          <span className="hl-line">
            <span className="hl-in">
              <span className="pen">before</span> the market does
            </span>
          </span>
        </h1>
        <p className="lede">
          Brace reads the strike ladders on Gemini&apos;s prediction markets, fits implied volatility onchain on Solana, and sets how much
          you can borrow.
        </p>
        <div className="actions">
          <Link href="/borrow" className="btn btn-primary btn-lg">
            Try a borrow <ArrowRight size={18} aria-hidden />
          </Link>
          <a href="#ladder" className="text-link arrow-link">
            Read the ladder <ArrowDown size={16} aria-hidden />
          </a>
        </div>
      </Stage>

      <section className="band" aria-labelledby="rec-title" id="board" data-scene>
        <div className="wrap">
          <header className="shead">
            <p className="shead-k">Recorder, 5 channels</p>
            <h2 id="rec-title">Five limits, traced for 24 hours</h2>
            <p className="shead-d">
              Each line is the limit the program held for that asset, posted by the relayer. One scale for all five, so a dip is a real dip.
              Gaps are hours with no posts.
            </p>
          </header>
          <Recorder />
        </div>
      </section>

      <section className="band ink" aria-labelledby="ladder-title" id="ladder" data-scene>
        <div className="wrap">
          <header className="shead">
            <p className="shead-k">SOL, right now</p>
            <h2 id="ladder-title">From a ladder of strikes to one number</h2>
            <p className="shead-d">
              Gemini traders price the chance SOL ends above each strike. The program fits a volatility to those prices and turns it into the
              limit, in five steps you can check.
            </p>
          </header>
          <div className="ladder-grid">
            <LadderRungs symbol="SOL" />
            <Worksheet symbol="SOL" />
          </div>
        </div>
      </section>

      <section className="band rules-band" aria-labelledby="rules-title" data-scene>
        <div className="wrap">
          <header className="shead">
            <p className="shead-k">Three rules in the program</p>
            <h2 id="rules-title" className="converge">
              <span className="cv-a">Stale data can</span> <span className="cv-b">only lower it</span>
            </h2>
          </header>
          <ol className="rules">
            <li>
              <span className="r-n">R1</span>
              <h3>The fit happens onchain</h3>
              <p>The relayer posts raw quotes, never a volatility number. The program does the fit itself and keeps every limit between 30% and 75%.</p>
            </li>
            <li className="r-wide">
              <span className="r-n">R2</span>
              <h3>Silence steps the limit down</h3>
              <p>Thin or stale data never loosens a limit. Here is the SOL limit if the relayer went quiet now, from the program&apos;s own rule.</p>
              <StepDown />
            </li>
            <li>
              <span className="r-n">R3</span>
              <h3>Odds never liquidate</h3>
              <p>The odds only set how much you can borrow. Liquidation uses the 80% threshold set in the config and nothing else.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="band" aria-labelledby="proof-title" id="proof" data-scene>
        <div className="wrap">
          <header className="shead">
            <p className="shead-k">Proof</p>
            <h2 id="proof-title">Every number has a transaction behind it</h2>
          </header>
          <ProofLog />
        </div>
      </section>

      <section className="band faq-band" aria-labelledby="faq-title" id="faq" data-scene>
        <div className="wrap">
          <header className="shead">
            <p className="shead-k">FAQ</p>
            <h2 id="faq-title">Questions people ask first</h2>
          </header>
          <Faq />
        </div>
      </section>

      <Closer />
    </>
  );
}
