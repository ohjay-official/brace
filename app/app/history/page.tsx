import type { Metadata } from "next";
import { pageMeta } from "@/lib/site";
import { HistoryView } from "@/components/HistoryView";
import { PageHead } from "@/components/ui/PageHead";

export const metadata: Metadata = pageMeta(
  "History",
  "24 hours of Brace limits for SOL, BTC, ETH, XRP and ZEC, with every borrow and every refused borrow on Solana devnet.",
  "/history",
);

export default function HistoryPage() {
  return (
    <div className="page wrap history-page">
      <PageHead
        kicker="History"
        title="Every limit, every reject"
        lede={
          <>
            SOL&apos;s implied volatility and borrowing limit over the last 24 hours, plus every borrow the program accepted or rejected on
            devnet.
          </>
        }
      />
      <div className="tape" aria-hidden>
        <div className="tape-run">
          {Array.from({ length: 4 }, (_, k) => (
            <span key={k}>SOL · BTC · ETH · XRP · ZEC · every minute, onchain · </span>
          ))}
        </div>
      </div>
      <HistoryView />
    </div>
  );
}
