/** The production address. brace-ivory.vercel.app stays attached as an alias. */
export const SITE_URL = "https://braced.vercel.app";

// Next drops the app/opengraph-image.jpg card when a page sets its own openGraph, so pages name it again here.
const OG_ALT = "Brace: lending limits that move before the market does. Gemini prediction market odds, turned into borrow limits onchain on Solana.";
const OG_IMAGE = { url: "/opengraph-image.jpg", width: 1200, height: 630, alt: OG_ALT, type: "image/jpeg" };
const TW_IMAGE = { url: "/twitter-image.jpg", width: 1200, height: 630, alt: OG_ALT, type: "image/jpeg" };

/** Title, description, canonical and matching share card for one page. */
export function pageMeta(title: string, description: string, path: string) {
  const full = `${title} | Brace`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website" as const, siteName: "Brace", url: path, title: full, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image" as const, title: full, description, images: [TW_IMAGE] },
  };
}
