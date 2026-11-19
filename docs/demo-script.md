# Demo script (phone, 2:37)

**What the video must prove:** Gemini's prediction-market odds set a Solana lending limit live, and the chain enforces it.

- Recorded on a Galaxy S25 with the built-in screen recorder. No laptop needed.
- Length: exactly 2:37. The rules allow 2 to 3 minutes, on YouTube or Google Drive, viewable by judges.
- Narration runs at about 2.3 words per second. Every voiceover line below fits its slot at that pace.
- Numbers on screen are live. Read them off the screen, never from this script.

## 1. Night before (about 15 minutes)

**Phone setup**
- Do Not Disturb on. Notifications hidden. Battery above 50%.
- Phone in light mode, so the board matches the README screenshots.
- Close every other app and browser tab.
- Screen recorder settings (pull down Quick settings twice, long-press Screen recorder):
  - Sound: **Media sounds and mic** (you narrate live).
  - Video quality: 1080p.
  - Show taps and touches: on. Judges can see what you tap.

**Phantom on the phone (devnet only, never a wallet with real money)**
1. Install Phantom from the Play Store.
2. Pick one:
   - **Reuse the demo wallet** `CM7My7aNN9RKb6rTJvBE4cjTt3zaGS6f22FT1BVYwSJP` (import it in Phantom from your own backup; never paste the recovery phrase anywhere else). It already has a position with 0.5 SOL deposited, so the deposit step is optional.
   - **Or create a new wallet** in Phantom. Write the recovery phrase on paper, not in a chat or note app.
3. In Phantom, open Settings, then Developer settings. Turn **Testnet mode** on and choose **Solana Devnet**. These are the same words the borrow page shows under "Before you start".
4. Copy your wallet address (tap the account name at the top).

**Devnet SOL**
1. In Chrome on the phone, open `https://faucet.solana.com`.
2. Paste your address, pick **Devnet**, and request SOL. You need at least **0.6 SOL** (0.5 to deposit plus fees). The faucet may ask you to sign in with GitHub or wait between requests.
3. Back in Phantom, check that the SOL shows up while Testnet mode is on.

**Live check (5 minutes before recording)**
- Open `https://braced.vercel.app`. All five rows (SOL, BTC, ETH, XRP, ZEC) should show an age in seconds (for example "11s ago").
- If the board says "Live limits are not loading", tap **Try again**. If it is still down after 5 minutes, see docs/runbook.md before recording.

**Rehearse once** with the stopwatch, reading the lines out loud. Then record for real.

## 2. How to record

Record three clips, then join them. One mistake costs one clip, not the whole video.

| Clip | Shots | Length | Where |
|---|---|---|---|
| A | 1 to 3 | 0:42 | Chrome |
| B | 4 to 6 | 0:58 | Phantom's in-app browser |
| C | 7 to 9 | 0:57 | Phantom's in-app browser, then Chrome |

Join the clips in Samsung Gallery's built-in video editor (Studio). Trim dead air at the start and end of each clip so the total lands on 2:37. The menu names can differ between One UI versions; any phone video editor that joins clips works.

## 3. Shot list

Total: 2:37. Times are cumulative.

### Clip A (Chrome)

**Shot 1 · 0:00 to 0:12 (12 s) · the board**
- URL: `https://braced.vercel.app`
- On screen: the risk board, five assets, each showing an age in seconds.
- Tap: nothing. Let it sit.
- Voiceover: "lending apps set borrowing limits by vote, and those limits rarely change. brace sets them every minute, from gemini prediction markets, onchain on solana."

**Shot 2 · 0:12 to 0:32 (20 s) · one asset**
- Tap: the **SOL** row. URL becomes `https://braced.vercel.app/asset/SOL`.
- On screen: the Gemini ladder chart, implied volatility, max LTV.
- Tap: scroll slowly down to the ladder chart.
- Voiceover: "gemini traders bet on where sol will be at expiry. those odds form a curve. brace fits that curve onchain, gets the implied volatility, and turns it into a borrowing limit. more volatility, lower limit."

**Shot 3 · 0:32 to 0:42 (10 s) · ZEC vs BTC**
- Tap: back to the board (the Brace name at the top).
- On screen: ZEC's limit next to BTC's.
- Voiceover: "every asset gets its own limit from its own odds. zcash is wilder than bitcoin, so zec gets a tighter limit, right now."
- Check before saying it: ZEC's max LTV should be lower than BTC's on screen. It has been all week, but if it is not, say "every asset gets its own limit, right now" instead.

### Clip B (Phantom in-app browser)

**Shot 4 · 0:42 to 1:00 (18 s) · connect and deposit**
- Open Phantom, tap the browser tab, go to `https://braced.vercel.app/borrow`.
- Tap: **Connect**, choose Phantom, approve.
- New wallet: tap **Open position** and approve, then **Deposit** 0.5 SOL and approve. Reused wallet: skip deposit, the position is already there.
- Voiceover: "now a real borrow, on a phone, with phantom on devnet. i deposit half a sol as collateral. the program prices it with the same live feed."
- If the new-wallet steps run long, cut the waiting in the editor. Keep the total at 2:37.

**Shot 5 · 1:00 to 1:22 (22 s) · over the limit, rejected**
- Tap: drag the borrow amount up until the page says it is over the live limit.
- Tap: **Submit anyway**, read the panel **What Phantom shows next**, then tap **Continue in Phantom**.
- In Phantom: a red "Failed to simulate the results of this request" appears, because the program refuses the borrow. Tap **Confirm (unsafe)**, tick the box, then **Yes, confirm (unsafe)**. These are the same words as README Try It step 3.
- On screen: "Rejected onchain: this borrow would put you at X% against a live limit of Y%."
- Voiceover: "this is over the limit. phantom warns me, and i send it anyway. solana rejects it. not the website, the program itself, using the limit gemini's odds set a minute ago."
- Confirm within about 30 seconds of tapping Submit anyway. A slow confirm lets the transaction expire (see Fallbacks).

**Shot 6 · 1:22 to 1:40 (18 s) · under the limit, approved**
- Tap: lower the amount to something small (for example 2 test USD). Tap **Borrow**, approve in Phantom.
- On screen: the success message and the row in **Recent actions**.
- Voiceover: "a smaller borrow, under the limit. approved. same program, same feed, a different answer, because the risk is different."

### Clip C (Phantom browser, then Chrome)

**Shot 7 · 1:40 to 1:58 (18 s) · proof on Explorer**
- Tap: **Explorer** next to the rejected row in Recent actions. Solana Explorer opens on devnet.
- Tap: scroll down to **Program Logs**.
- On screen: `brace blocked ltv=… limit=…`.
- Voiceover: "here is the rejected transaction on solana explorer. the program log shows the ltv i asked for and the live limit. anyone can check this."

**Shot 8 · 1:58 to 2:18 (20 s) · history and accuracy**
- URL: `https://braced.vercel.app/history`
- On screen: the limit chart over time and the list of blocked and allowed borrows.
- Voiceover, part 1 (about 10 s): "quicknode streams records every limit update and every borrow, including the failed ones. that history is how we check the oracle."
- Voiceover, part 2 (about 10 s), pick one:
  - With the verified number (about 9 s): "prices stayed inside the one-sigma band 79.5 percent of the time, where 68 would be perfect. the limits run cautious."
  - Without a number: "next, we are scoring these limits against what prices actually did."
- Use these verified 1-hour 1σ figures, from an independent recompute of live `/history` at 04:22 Africa/Lagos on 19 Nov 2026: overall 79.47% of 8,303; per asset SOL 81.45%, BTC 71.38%, ETH 79.43%, XRP 84.91%, ZEC 81.16%. 2σ overall is 97.21%. Do not substitute placeholders or a later unreviewed range.
- Use the 1-hour numbers only. The 24-hour hit rates (many at 100%) come from overlapping windows over about two days, so they don't prove anything yet. Never quote them.
- If a later measured 1-hour rate for any asset drops below 68%, the "cautious" line is no longer true: use the "Without a number" line instead.
- Never say a number that has not been measured and written down.

**Shot 9 · 2:18 to 2:37 (19 s) · close**
- URL: `https://github.com/ohjay-official/brace` (open in Chrome).
- On screen: the README top, with the live app link.
- Voiceover (40 words, about 17 s): "limits never pass the cap, stale data only lowers them, and odds never liquidate anyone. it is open source and on devnet, because it is not audited yet: real loans wait for an audit and gemini's ok. this is brace."
- Do not say "odds can only tighten a limit": a calmer market lets a new confident post raise the limit, up to the 75% cap (`docs/reviews.md` Pass 5 F7).

## 4. Fallbacks

**Transaction expired** ("Failed: the transaction expired before it landed. Try again.")
1. Tap the same button again and confirm faster in Phantom.
2. If it fails twice, wait 1 minute (devnet can lag), then retry.
3. Still failing: stop the clip, re-record clip B later. Do not fake it. As a last resort, in shot 7 open the verified rejected borrow from the README instead: `https://explorer.solana.com/tx/59uvMm48LV248sXSnvTV9wb8ZpVZmB8Q3ffiAsq3NU97wjU3wuSGD4EBSihWYpm1qZhrQNATA5rz5v1GWH6RVHnP?cluster=devnet`, and say "this is one we sent earlier".

**Phantom shows no confirm-anyway option for the over-limit borrow:** the page cannot force it. Record shot 5 with the warning on screen, cancel, and say "phantom's simulation already sees the program would reject it". Then show the README rejected transaction in shot 7.

**"Not enough devnet SOL":** go back to faucet.solana.com, then re-record clip B.

**Board says devnet is not answering:** tap **Try again**. Public devnet RPC sometimes stalls for a minute. If it lasts more than 5 minutes, check the relayer at `https://brace-relayer.ohjaye0.workers.dev/health` and docs/runbook.md.

**Over 2:37 after joining:** trim pauses between taps first. Do not speed up the voice.

## 5. Upload to YouTube from the phone (unlisted)

1. Open the YouTube app, signed in to the account you want on the submission.
2. Tap **+** (Create), then **Upload a video**, then pick the joined 2:37 video.
3. Title: `Brace: prediction-market risk limits for Solana lending (UBC 2026)`.
4. Description: paste the live app link `https://braced.vercel.app` and the repo link `https://github.com/ohjay-official/brace`.
5. Visibility: **Unlisted**. Unlisted still lets anyone with the link watch it, which judges need. Do not pick Private.
6. Audience: **No, it's not made for kids**.
7. Upload. Wait until YouTube finishes processing HD (a few minutes).
8. Test the link logged out: copy the share link, open it in a Chrome incognito tab, and check it plays with sound.
9. Paste the link into Devpost's video field and into docs/submission-draft.md (or send it to whoever is updating the repo).

Due: video uploaded by **Thursday night, Lagos time**. Devpost submission: aim for **Friday Nov 20, 3:00 PM Lagos (WAT)**. The hard deadline is 12:00 PM CST, which is **7:00 PM Lagos (WAT)**.
