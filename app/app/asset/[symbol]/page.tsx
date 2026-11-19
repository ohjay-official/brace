import type { Metadata } from "next";
import { pageMeta } from "@/lib/site";
import { notFound } from "next/navigation";
import { AssetDetail } from "@/components/AssetDetail";
import { SYMBOLS, isSymbol } from "@/lib/brace";

export const dynamicParams = false;

export function generateStaticParams() {
  return SYMBOLS.map((symbol) => ({ symbol }));
}

type Props = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const s = symbol.toUpperCase();
  return pageMeta(
    `${s} feed`,
    `The live ${s} borrow limit on Brace, fitted onchain from Gemini prediction market odds, with the ladder behind it and its last 24 hours.`,
    `/asset/${s}`,
  );
}

export default async function AssetPage({ params }: Props) {
  const { symbol } = await params;
  const s = symbol.toUpperCase();
  if (!isSymbol(s)) notFound();
  return <AssetDetail symbol={s} />;
}
