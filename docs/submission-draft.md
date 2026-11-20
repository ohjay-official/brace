# Submission draft (Devpost)

Paste-ready fields for https://ubc-hackathon-2026.devpost.com. Checked against the public Devpost overview and rules pages and the official hackathon guide (a public Google Doc linked from the overview) on Nov 17, 2026 (Africa/Lagos). The submission form itself needs a login, so field names come from Devpost's help center and the guide's What to Submit list. Character counts are exact for the text below.

**Deadline:** Friday Nov 20, 12:00 PM CST = **7:00 PM Lagos (WAT)**. Team target: submitted by **3:00 PM Lagos**. Devpost projects stay editable until the deadline, so submit early and keep editing.

## Only Oh-Jay (or the team) can fill these

| Item | Why | Where it goes |
|---|---|---|
| Video link (YouTube, unlisted, 2 to 3 min) | Done: https://youtu.be/zA3QOZgtJSI (2:23) | Video demo link field; README line 19 |
| Omar's Devpost account | Teammates are added by Devpost invite and must accept it | Team section |
| Alchin's Devpost account | Same | Team section |
| Alchin's hit rate | Done: 79.5% inside 1σ over 8,303 one-hour forecasts (preliminary) | Story Proof list, README Proof section, video shot 8 |
| Grok Bot bounty: yes or no | Needs a Grok Bot chat export only Oh-Jay can download, see below | Bounty choice |
| Who attends in person on Sat Nov 21 | Rules: participants must be present in person during final presentations to qualify for prizes. Oh-Jay is remote, so Alchin and Omar need to be there. Ask the organizers on Telegram if a remote member affects eligibility | Not a form field |
| reCAPTCHA, terms checkbox, Submit | Needs a person | Last step |

## Step 1: Project overview

| Field | Text | Chars | Limit |
|---|---|---|---|
| Project name | Brace | 5 | 60 |
| Tagline (elevator pitch) | Gemini prediction markets as an onchain volatility oracle that tightens Solana lending limits before the market moves. | 118 | 200 on the participant form; 140 in Devpost's host docs, so this stays under 140 |
| Thumbnail | `app/app/opengraph-image.jpg` (1200x630). Devpost suggests 3:2, 5 MB max; the image is 87 KB; check the crop in the preview | | |

## Step 2: Track, chain award, bounties, prize opt-ins

Names below are copied from the Devpost prize list.

- Main track (one only): **DeFi and Onchain Applications**
- Chain award: **Best use of Solana**
- Bounties: **Gemini Prediction Markets**, **QuickNode Streams**. Optional: **Grok Bot** (see below)
- Prize opt-ins to tick:
  - DeFi and Onchain Applications - Track Winner
  - DeFi and Onchain Applications - Best use of Solana
  - Gemini Bounty - Prediction Markets - 1st Place, 2nd Place, 3rd Place
  - Bounty - Best Use of QuickNode Streams
  - Participation
  - Official UBC 2026 Hackathon Winner (automatic for every submission; tick it if the form lists it)
  - Bounty - Best Use of Grok Bot (only if Oh-Jay says yes)
- Do not tick: Best use of Arc, any other track, ElevenLabs (no audio feature).

### Track requirements, checked against the guide

| Requirement (guide wording, shortened) | Status | Where |
|---|---|---|
| DeFi: interact with smart contracts on any chain, devnet fine | Met | Program on devnet; borrow.rs |
| DeFi: explain the economic design and risk assumptions in the README | Met (section added Nov 17) | README, Economic design and risk assumptions |
| DeFi and Solana: include program addresses and how Solana is used | Met | README Proof and How the Sponsor Tech Is Used |
| Gemini: use the Prediction Markets API (market data and/or trading) | Met, market data only. The guide's "and/or" answers the office-hours question: market data alone qualifies | worker/src/gemini.ts |
| QuickNode: Streams as a core data source; one Stream with a filter and destination; README explains network, dataset, filter, destination and why | Met (dataset and why added Nov 17) | README QuickNode Streams; worker/filters/brace-program.js |
| Repo public, created during the week (work before Nov 13 not allowed) | Met. First commit Nov 15, 23:14 Lagos | README Built During UBC 2026 |
| Working demo or deployed app | Met | https://braced.vercel.app |
| 2 to 3 minute video on YouTube or Google Drive, accessible to judges | Done: https://youtu.be/zA3QOZgtJSI (2:23, unlisted) | docs/demo-script.md |
| README with technical docs and architecture overview | Met | README How It Works (diagram) |
| All team members listed | Needs both teammates' Devpost accounts (Alchin Daryabarijavad, Omar Dosuyev) | Team section |

## Step 3: Written answers

The guide asks for five written answers. If the form has separate boxes, paste each one. If it only has the story field, the story below already contains them under headings.

**What did you build?** (497 chars)

```text
Brace is a live risk oracle and a small lending pool on Solana devnet. Every minute it reads Gemini's "price X or above" prediction market ladders for SOL, BTC, ETH, XRP and ZEC, works out the implied volatility onchain, and turns each into a loan-to-value limit. The demo pool takes SOL collateral and enforces SOL's limit on every borrow: over the limit, the program rejects the transaction; under it, the borrow goes through. A public risk board, a borrow page that works in Phantom on a phone, and a history page show it live.
```

**What problem does it solve?** (469 chars)

```text
Lending markets set loan-to-value limits by governance vote and rarely change them. When volatility arrives, limits are still the calm-week numbers, so the protection arrives after the move. Forward-looking volatility usually comes from options markets, which most long-tail assets do not have. Gemini's prediction markets already price where these assets will be at expiry, including ZEC, so Brace uses those odds to lower limits as soon as traders price a bigger move, instead of waiting for a vote.
```

**How does it work?** (658 chars)

```text
A Cloudflare Worker reads Gemini's public prediction market API once a minute and posts the raw bid and ask quotes to an Anchor program on Solana devnet. The program does the math with integers only: it turns each probability into a z-score, fits a line across the strikes, reads off implied volatility and the implied median, checks spot against that median, and sets limit = 80% x (1 - 3 x the 24-hour move), capped at 75%. Borrow and withdraw check that limit. A QuickNode Stream on the Block dataset, filtered to the program, sends every transaction, including rejected borrows, to the Worker, which stores it in D1 and serves the history the app charts.
```

**What makes it unique?** (451 chars)

```text
Prediction markets used as risk infrastructure, not another betting app. The volatility number is computed onchain from raw quotes, and every limit is clamped between 30% and a 75% cap. It is fail safe: thin, stale or inconsistent data never loosens a limit, it holds, steps down, and pauses borrowing after an hour without a confident post. Odds never liquidate anyone; liquidation stays at the 80% threshold in the config. And it covers assets with no options on Deribit, the largest crypto options venue, like ZEC, because Gemini lists them.
```

**What would you build next?** (356 chars)

```text
A check_borrow instruction other Solana lending programs can call by CPI, so any market can use the limit. Signed or multi-source quotes so the relayer is no longer trusted. A longer, non-overlapping track record from Alchin's tracker. Then more assets as Gemini lists them, and a mainnet pilot with a real lending market.
```

## Step 4: Project story (About the project, markdown) (3840 chars)

No hard limit is published for this field. Paste everything between the fences.

````markdown
## Inspiration
Lending markets set loan-to-value limits by governance vote and rarely change them. When volatility arrives, limits are still the calm-week numbers, so the protection arrives after the move. Forward-looking volatility usually comes from options markets, which most long-tail assets do not have. Gemini's prediction markets already price where these assets will be at expiry, including ZEC, so Brace uses those odds to lower limits as soon as traders price a bigger move, instead of waiting for a vote.

## What it does
Brace is a live risk oracle and a small lending pool on Solana devnet. Every minute it reads Gemini's "price X or above" prediction market ladders for SOL, BTC, ETH, XRP and ZEC, works out the implied volatility onchain, and turns each into a loan-to-value limit. The demo pool takes SOL collateral and enforces SOL's limit on every borrow: over the limit, the program rejects the transaction; under it, the borrow goes through. A public risk board, a borrow page that works in Phantom on a phone, and a history page show it live.

## How we built it
A Cloudflare Worker reads Gemini's public prediction market API once a minute and posts the raw bid and ask quotes to an Anchor program on Solana devnet. The program does the math with integers only: it turns each probability into a z-score, fits a line across the strikes, reads off implied volatility and the implied median, checks spot against that median, and sets limit = 80% x (1 - 3 x the 24-hour move), capped at 75%. Borrow and withdraw check that limit. A QuickNode Stream on the Block dataset, filtered to the program, sends every transaction, including rejected borrows, to the Worker, which stores it in D1 and serves the history the app charts.

## What makes it different
Prediction markets used as risk infrastructure, not another betting app. The volatility number is computed onchain from raw quotes, and every limit is clamped between 30% and a 75% cap. It is fail safe: thin, stale or inconsistent data never loosens a limit, it holds, steps down, and pauses borrowing after an hour without a confident post. Odds never liquidate anyone; liquidation stays at the 80% threshold in the config. And it covers assets with no options on Deribit, the largest crypto options venue, like ZEC, because Gemini lists them.

## Proof
- Program (devnet): `Frv6CVJKADmkM2cnBSMKgBWPvtHsfYkfye5d4vB84WyC` on [Solana Explorer](https://explorer.solana.com/address/Frv6CVJKADmkM2cnBSMKgBWPvtHsfYkfye5d4vB84WyC?cluster=devnet)
- [Rejected over-limit borrow](https://explorer.solana.com/tx/59uvMm48LV248sXSnvTV9wb8ZpVZmB8Q3ffiAsq3NU97wjU3wuSGD4EBSihWYpm1qZhrQNATA5rz5v1GWH6RVHnP?cluster=devnet), log `brace blocked ltv=7208 limit=6954`
- [Accepted borrow](https://explorer.solana.com/tx/42EzMtDmmcengifcyTXjLY2BT3K1s8XCdVMEG3usorpbGiYEL5KgFHyBpWm9PyVi3Tymjg34PKqqmeCSQeJgehSf?cluster=devnet), log `ltv=2303 limit=6952`
- 52 Rust tests (including a 3,000-action fuzz run), 117 Worker tests, 108 app tests; six review passes with no critical or high findings; every medium from passes 1 to 5 fixed with a test except the `initialize` front run, which the deploy script handles; the forged-history medium from pass 6 fixed in the Worker code; two pass 6 mediums (liquidation can use a spot price up to an hour old) accepted and listed in the README's Known Limitations
- Accuracy (preliminary): the price landed inside Brace's 1σ band 79.5% of the time and its 2σ band 97.2% over 8,303 one-hour forecasts (Nov 17 to 19); 68% and 95% would be perfect calibration, so limits run conservative

## Challenges
Gemini's ladders are thin: quotes exist but trades are rare. That is why every post gets a confidence check and stale data only ever lowers a limit. Fitting a probit curve with integer math inside Solana's compute budget took a lookup table and a careful least-squares fit; a verified SOL post used 40,674 compute units on Nov 17, and each asset's fit runs at about 33,000 to 42,000.

## What's next
A check_borrow instruction other Solana lending programs can call by CPI, so any market can use the limit. Signed or multi-source quotes so the relayer is no longer trusted. A longer, non-overlapping track record from Alchin's tracker. Then more assets as Gemini lists them, and a mainnet pilot with a real lending market.

## Built with AI
Code, tests and docs were written with AI coding assistants (Claude and Grok), directed by Faithful Adejoh (Oh-Jay), who made the product decisions and handled every wallet and account step. Each task was gated on its tests before it was committed.
````

The accuracy line is in the Proof list above.

## Step 5: Built with (15 tags, Devpost max 25)

```text
solana, anchor, rust, typescript, next.js, react, vercel, cloudflare-workers, cloudflare-d1, quicknode-streams, gemini-prediction-markets, phantom, spl-token, litesvm, vitest
```

## Step 6: Links

| Field | Value |
|---|---|
| Try it out | https://braced.vercel.app |
| Try it out (borrow) | https://braced.vercel.app/borrow |
| Try it out (history) | https://braced.vercel.app/history |
| Code repository | https://github.com/ohjay-official/brace |
| Video demo link | https://youtu.be/zA3QOZgtJSI |
| Program id (devnet), if asked | Frv6CVJKADmkM2cnBSMKgBWPvtHsfYkfye5d4vB84WyC |
| Relayer health | https://brace-relayer.ohjaye0.workers.dev/health |
| Streams history feed | https://brace-relayer.ohjaye0.workers.dev/history?asset=SOL |

## Step 7: Image gallery (optional, 3:2 suggested)

- `docs/images/board.jpg` (the README phone shot of the board)
- `app/app/opengraph-image.jpg`
- Fresh phone screenshots from the recording day: the asset page, the rejected-borrow message, the History page.

## Optional: Grok Bot bounty

The guide asks for: Grok Bot as a core part of the project, a Grok Bot chat export showing how you built or used it, and a 3 to 4 sentence README section on its role. The workshop schedule doc links Grok Bot to Cursor (cursor.com/docs/grok-bot), which is the assistant that did much of this build: the ship check, Worker deploys and the rollback drill through the Cloudflare connector, tests and docs. It is a build tool here, not part of the running product, so judges may weigh it lower than projects that ship Grok Bot to users. Opting in costs nothing and stacks with other prizes. Only Oh-Jay can export the chat. If he opts in, add this to the README:

```text
Grok Bot did real build work on Brace. It ran the pre-submission ship check end to end, wrote and ran the Worker and app tests, deployed the relayer Worker through the Cloudflare connector, and verified every live endpoint and onchain transaction before each change shipped, including a live rollback drill of the Worker. Oh-Jay directed the work and made the product decisions; each task was gated on its tests before it was committed. The chat export is linked here: [[LINK]].
```

## Check before pressing Submit

- [x] Video plays in a logged-out browser and is 2:00 to 3:00 long (2:23, oEmbed public check passed)
- [ ] Live board shows five fresh rows at the moment you submit
- [ ] All teammates accepted the Devpost invite
- [x] README line 19 has the video link (push to main)
- [ ] Track, chain award and every bounty selected, matching prizes ticked
- [ ] Preview the project page with View and check the markdown renders
