import type { Metadata } from "next";
import { pageMeta } from "@/lib/site";
import { WalletShell } from "@/components/borrow/WalletShell";
import { LineHead } from "@/components/v2/LineHead";

export const metadata: Metadata = pageMeta(
  "Try a borrow",
  "Borrow test USD against devnet SOL and watch the Brace program refuse a borrow over the live limit. Devnet only, test funds only.",
  "/borrow",
);

export default function BorrowPage() {
  return (
    <div className="page wrap borrow-page">
      <LineHead />
      <WalletShell />
    </div>
  );
}
