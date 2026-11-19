import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BoardProvider } from "@/components/BoardProvider";
import { Footer, Header } from "@/components/Chrome";
import { SITE_URL } from "@/lib/site";
import { Analytics } from "@vercel/analytics/next";

const sans = Geist({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-geist-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono", display: "swap" });

const TITLE = "Brace: lending limits from live prediction-market odds";
const DESCRIPTION =
  "Brace reads Gemini's regulated prediction markets every minute, computes implied volatility onchain on Solana, and sets how much you can borrow.";

// opengraph-image.jpg, twitter-image.jpg, icon.svg, apple-icon.png, favicon.ico and manifest.ts in this folder
// are picked up by Next and added to the head automatically.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | Brace" },
  description: DESCRIPTION,
  applicationName: "Brace",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Brace",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a22" },
  ],
};

// Applies the saved theme before first paint so there is no flash.
const themeScript = `try{var t=localStorage.getItem("brace-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}try{var d=document.documentElement;if(!matchMedia("(prefers-reduced-motion: reduce)").matches&&!navigator.webdriver){d.classList.add("motion");setTimeout(function(){if(!window.__scenes)d.classList.remove("motion")},4000)}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <BoardProvider>
          <Header />
          <main id="main">{children}</main>
          <Footer />
        </BoardProvider>
        <Analytics />
      </body>
    </html>
  );
}
