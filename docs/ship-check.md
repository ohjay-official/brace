# Ship check: build-and-ship playbook, Nov 19, 2026

Run by Claude, 07:45 to 08:40 Lagos, on production (https://braced.vercel.app, relayer, devnet program) and on main at the commits named. Earlier full pass by Grok: [b6-recheck.md](b6-recheck.md) (Nov 17).

## Fixed during this check
| Finding | Fix | Commit |
|---|---|---|
| The relayer's D1 store hit its free daily read limit again (second day running), so `/history` and `/actions` returned 503 and the History page showed no data. Cause: every viewer polled the relayer directly with a fresh `since=`, so nothing could be cached, and each cold Worker isolate re-reads about 26 hours of rows. | The app reads through its own `/api/history` and `/api/actions` routes: `since` rounded down to 5 minutes, Vercel CDN cache (`s-maxage=120, stale-while-revalidate=600`), per-IP limit, 10 s timeout, and the last good rows served (marked `x-brace-stale`) when the relayer fails. 9 new tests. Checked on prod: SOL history served from the CDN (`HIT`, `STALE`) while the relayer was returning 503. | ad109e1 |
| The History page hid the chart if either request failed. | The chart and the borrow list now load independently. | f54e4d7 |
| The rules headline "It only ever tightens on its own" reads like the false claim "odds only tighten limits". R1 claimed nobody can hand the program a convenient answer, but the relayer chooses the quotes. | Headline "Bad data can only lower it". R1: the program does the fit itself and keeps every limit between 30% and 75%. | 2eb3c51 |
| Overclaims in the README ("the market can only tighten a limit"), docs/pitch.md ("nobody can fake the number", "it only ever tightens", the outdated "we have not proven accuracy yet") and the Devpost draft ("the relayer cannot post a made-up value"). | All reworded to what the code guarantees: the 30 to 75% clamp, bad data only lowers a limit, odds never liquidate. The pitch accuracy answer now uses the measured 79.5%. | this commit |
| README app test count 92 (actual 103). | Updated, and History limitation added to Known Limitations. | this commit |
| The phone ladder legend wrapped "onchain fit" away from its marker. | Each key stays with its label. | 2eb3c51 |

## Results by section
| # | Section | Result | Evidence |
|---|---|---|---|
| 1 | Planning | Pass | docs/event.md (rules to proof), spec, demo script, deadlines in CST and Lagos |
| 2 | UI and frontend | Pass | Playwright crawl of 12 routes × 6 widths (360, 390, 768, 1032, 1376, 1440) × light and dark = 144 loads: no sideways scroll, no broken images, every image has alt text, axe WCAG 2 A and AA 0 violations on 48 runs (390 and 1376). Unknown asset and unknown route give the custom 404. Keyboard: skip link first, visible focus ring, menu opens with Enter, focuses its first link and closes with Escape. Borrow buttons disabled while a transaction is pending and before a wallet connects. Lighthouse mobile: / perf 83, a11y 100, SEO 100; /borrow 80, 100, 100; /history 95, 100, 100. Best practices 96 only because of the D1 503s in the console |
| 3 | Backend and logic | Pass | `cargo test -p brace` 52/52 including the 3,000 action fuzz with 7 invariants (68 s), adversarial suite 12/12; two different wallets borrowed on devnet (Nov 17 CM7My7…, Nov 18 9i566p…) |
| 4 | APIs and third parties | Pass with accepted risk | Relayer: unknown asset, `since=abc`, `since=-5` → 400 with plain errors; unknown path 404; `/streams` POST without the secret 401; CORS `*` GET only. App `/api/ladder` rejects bad tickers (400, JSON). Gemini and RPC calls have timeouts (B6). Accepted risk: D1 free plan read limit, now behind the cache (see above) |
| 5 | AI and automation | Pass | Cron posts every minute (feeds 4 to 41 s old during this check); README facts re-checked against devnet: 5 README transactions fetched with getTransaction, logs match (`brace blocked ltv=7208 limit=6954`, `brace borrow … ltv=2303 limit=6952`, `brace SOL conf=1 sigma_bps=8438 max_ltv=6939`) |
| 6 | Security and privacy | Pass | gitleaks 8.30.1: 124 commits, no leaks. The build-output scan flags only Next's per-build preview and server-action keys in `app/.next` (generated locally, git-ignored, never served). No env, key or keypair files tracked. Privacy page live |
| 7 | Performance | Pass | Lighthouse mobile (simulated slow 4G): LCP 2.2 to 2.8 s, CLS ≤ 0.001. Relayer balance 0.976 devnet SOL (about 0.007 a day used) |
| 8 | Data | Pass | `INSERT OR REPLACE` keyed by tx (no duplicates on retried Streams deliveries); borrow buttons lock while busy |
| 9 | Cross-device | Partly run | Chromium at 6 widths; Oh-Jay's iPad opened Solana Explorer from the site. Not run here: iPhone Safari, Android Chrome on the latest deploy, in-app browsers (Telegram, X). Owner: Oh-Jay |
| 10 | Testing | Pass | `scripts/verify.sh` exit 0 on f54e4d7: cargo 52, worker 109 and tsc, app 103, tsc and build, live app 200, relayer healthy |
| 11 | Deployment | Pass | Every sitemap URL 200; `/dev-preview` 404 in production and disallowed in robots; canonical, og and twitter tags on all 6 main pages; share images 200. Rollback: Vercel instant rollback, Worker rollback id in docs/runbook.md. One transient "Loading chunk failed" seen on a page open during a deploy switch |
| 12 | Hackathon | Open | Video not recorded yet; Devpost video field empty; submission not made (Oh-Jay) |
| 13 | Docs | Pass | 23 README links: all 200 except Explorer (429 to cloud IPs; confirmed on Oh-Jay's iPad and by RPC) and the relayer's `/history` and `/actions` (503 until the D1 reset). All relative links exist |
| 14 | Completeness | Pass | No TODO, lorem or placeholder text on any page; the only TBD left is the film link in the README |
| 15 | Presentation | Open | Demo script updated (devnet reason, 2:37); recording tonight |
| 16 | Maintenance | Pass | Uptime watch every 3 h with phone alerts, pre-recording check at 18:00 Lagos, runbook, expiry list in progress.md (QuickNode free month from Nov 17) |

## Go/no-go
1. Rules read, every requirement has proof: **yes** (docs/event.md).
2. Core journey works for a new user on a real phone on production: **yes** for the Phantom borrow (Nov 17 and 18). The borrow code is unchanged since; re-run once on the phone before recording.
3. Every claim has working proof: **yes** after the fixes above.
4. No secrets in repo, history, build output or logs: **yes**.
5. Every third-party call has a timeout, message and fallback: **yes**. History now falls back to the last good rows.
6. Safe against double taps, retries, refreshes and two users: **yes**.
7. Full suite passes, manual core run after the last change: **suite yes**; manual phone run due before recording.
8. Clean-machine setup and verify command: **yes** (verify.sh; fresh clone by Grok in B6).
9. Production env, domain, routes, certificates: **yes**.
10. Automation fails safe on bad input: **yes** (bad data steps limits down; bad requests 400).
11. Previews, icons, links current: **yes**.
12. Alerts, rollback, expiry calendar: **yes**.
13. Irreversible actions rehearsed: **n/a** (devnet only; the Devpost submit is Oh-Jay's).
14. Submission made with everything required: **no, not yet**. It needs the video link. Submit by 3:00 PM Lagos Fri.

**Verdict: go for recording and submission once the video exists.** History data returns after the D1 reset at 01:00 Lagos; from then on the cache should stop the limit running out. Re-check `/history` on Friday morning before submitting.
