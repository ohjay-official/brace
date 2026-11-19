import type { Metadata } from "next";
import { PageHead } from "@/components/ui/PageHead";
import { REPO_URL } from "@/lib/brace";
import { pageMeta } from "@/lib/site";

const DESCRIPTION =
  "What Brace touches: your public devnet wallet address and the transactions you sign, a theme setting in your browser, and cookieless page counts from Vercel Web Analytics. No accounts, no tracking cookies.";

export const metadata: Metadata = pageMeta("Privacy", DESCRIPTION, "/privacy");

export default function PrivacyPage() {
  return (
    <div className="page wrap privacy">
      <PageHead
        kicker="Privacy"
        title="What Brace sees, and what it keeps"
        lede="Short version: no accounts, no tracking cookies, nothing sold. Brace is a Solana devnet demo, so the little it touches is public test data."
      />
      <div className="prose privacy-body">
        <p className="mono privacy-note">Devnet only. Test funds only. Nothing on this site is financial advice.</p>

        <section aria-labelledby="pv-account">
          <h2 id="pv-account">No accounts</h2>
          <p>There is no sign up, no email and no password. You can read every page without connecting anything.</p>
        </section>

        <section aria-labelledby="pv-wallet">
          <h2 id="pv-wallet">Your wallet, if you connect one</h2>
          <p>
            On the Borrow page you can connect a wallet such as Phantom. Brace then reads your public wallet address and your devnet balances from a Solana
            devnet RPC node. Brace never sees your keys; your wallet signs.
          </p>
          <p>
            Any transaction you sign lands on Solana devnet, which is public and permanent. The relayer records every Brace program transaction, including
            rejected borrows, and the History page lists them with a link to Solana Explorer, where the sending wallet address is visible.
          </p>
        </section>

        <section aria-labelledby="pv-browser">
          <h2 id="pv-browser">In your browser</h2>
          <p>
            Up to two settings are saved in your browser&apos;s local storage: your light or dark theme choice, under <span className="mono">brace-theme</span>, and, once you connect a wallet, which wallet you picked, under <span className="mono">walletName</span>, so it can reconnect. Brace sets no
            cookies.
          </p>
        </section>

        <section aria-labelledby="pv-analytics">
          <h2 id="pv-analytics">Analytics</h2>
          <p>
            Brace uses Vercel Web Analytics to count page views. It sets no cookies and does not follow you to other sites. Vercel tells visitors apart with a
            hash of the request that it discards after 24 hours, and records the page, the referring site, country, browser, operating system and device
            type.
          </p>
        </section>

        <section aria-labelledby="pv-services">
          <h2 id="pv-services">Services your browser talks to</h2>
          <ul>
            <li>Vercel hosts this site and keeps standard request logs.</li>
            <li>The Brace relayer on Cloudflare Workers serves the live feed health your browser reads, and the History data this site fetches for you. To rate limit requests, the relayer and this site&apos;s own API routes keep your IP address in server memory, never in a database, until that server process recycles.</li>
            <li>A Solana devnet RPC node answers the reads for the live board and your wallet.</li>
            <li>Gemini prediction market quotes are fetched by our server, so your browser never calls Gemini.</li>
          </ul>
          <p>Each of these operators has its own privacy policy, and so does your wallet.</p>
        </section>

        <section aria-labelledby="pv-contact">
          <h2 id="pv-contact">Contact</h2>
          <p>
            Questions or a request about your data: open an issue on{" "}
            <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer">
              the Brace GitHub repo
            </a>
            . Onchain records cannot be deleted by anyone, us included.
          </p>
          <p className="privacy-date">Last updated Nov 19, 2026.</p>
        </section>
      </div>
    </div>
  );
}
