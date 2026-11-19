# Pitch (for Alchin and Omar)

Plain words, no slides needed for the short version. Every number here is checked against a source listed under "Numbers". If a number is marked TBD, say "we have not measured that yet", never a guess.

## 60-second pitch

> Lending apps let you borrow against crypto up to a limit, say 75% of what you deposit. That limit is set by a governance vote and rarely changes, so when the market gets wild, the limit is still the calm-week number.
>
> Brace fixes that with prediction markets. Gemini lists markets like "will SOL be above 80 dollars tonight", at many prices. Together those odds tell you how far traders expect the price to move. Every minute, Brace posts those odds to Solana, and our program turns them into a borrowing limit: more expected movement, lower limit.
>
> The math runs onchain from raw quotes, so anyone can check the number. Limits never go above the 75% governance cap, stale or thin data only ever lowers them, and odds never liquidate anyone.
>
> It is live on devnet right now for SOL, Bitcoin, Ether, XRP and Zcash. Try to borrow over the limit and Solana itself rejects the transaction. That is Brace.

About 150 words, 60 to 65 seconds at a calm pace.

## 3-minute pitch

**1. The problem (30 s).** Lending protocols like Kamino and Jupiter Lend set a loan-to-value limit per asset. Those limits are chosen by curators or governance and change slowly. Volatility does not wait for a vote. When a coin starts swinging, the limit is still last week's, so the protection shows up after the damage.

**2. The insight (30 s).** Forward-looking volatility usually comes from options markets. Most coins do not have one. But Gemini now runs prediction markets with price ladders: "SOL above 70", "above 72", "above 74", each with live odds. A ladder of odds is a picture of what traders expect. Zcash has no options on Deribit, the largest crypto options venue, but Gemini prices it.

**3. What we built (60 s, show the phone).**
- Open the board: five assets, each with a live borrowing limit computed onchain every minute. The demo pool takes SOL and enforces SOL's limit.
- Tap SOL: the curve of Gemini's odds, the implied volatility, and the limit it produces.
- A relayer on Cloudflare reads Gemini every minute and posts the raw quotes to our Anchor program on Solana devnet. The program fits the curve itself, with integer math, and sets the limit: 80% times one minus three times the expected 24-hour move, capped at 75%.
- Go to Borrow, ask for more than the limit, confirm past Phantom's warning, and the program rejects it onchain. Ask for less and it goes through.
- QuickNode Streams records every transaction, including the rejected ones, which powers the History page.

**4. Why it is safe (30 s).** It fails safe. If Gemini's data is thin, stale, or does not agree with the spot price, the limit holds, then steps down, and after an hour borrowing pauses. Odds never liquidate anyone; liquidation stays at the 80% threshold in the config. Stale or thin data can only make a limit stricter. A dishonest relayer could still post a fake ladder and spot price; that is our main known gap, and signed quotes are the fix.

**5. What is next (30 s).** A `check_borrow` call any Solana lending program can use, so one oracle protects many markets. Signed quotes, so the relayer no longer has to be trusted. And a longer track record: Alchin's tracker already scores every forecast against what prices did. Over the first two days, 79.5% landed inside the 1σ band, where 68% would be perfect, so limits run conservative.

Close: "Prediction markets as risk infrastructure, not another betting app. Brace is open source and live on devnet."

## If you are a finalist (5 min pitch, 2 min Q&A)

Use the 3-minute pitch, then add the live demo: let a judge hold the phone and try an over-limit borrow (about 90 seconds), and walk the History page showing their own rejected borrow arriving through Streams (about 30 seconds). Keep 30 seconds spare for devnet lag. If the network fails, play the video and show the README Proof links.

## Judge Q&A

**How accurate are the odds, and does Brace predict crashes?**
Over 8,303 one-hour forecasts (one per minute per asset, Nov 17 to 19), the price landed inside Brace's 1σ band 79.5% of the time, where a perfectly calibrated model gives 68%, so the limits run conservative. Counting only non-overlapping hours, 82.3% (135 of 164). Caveats: two days of data, and the hourly forecasts overlap. We have also checked that the onchain fit matches an independent floating-point reference on a captured real SOL ladder (82.7% implied volatility, 69.6% limit). Brace does not predict direction. It reads how much movement traders are pricing and sizes the limit to that. Thin markets make the estimate noisy, which is why there is a confidence check, why stale or unconfident data only ever lowers a limit, and why no limit can go above the 75% cap.

**Why prediction markets, not options or Chainlink?**
Options-implied volatility is great where options exist, but most coins have no options market. Gemini lists ladders on assets like Zcash. Chainlink's volatility feeds are realized volatility, which looks backward; its own docs say realized is not implied. Prediction-market odds are forward-looking, public, and need no API key.

**Why Solana?**
Posting quotes every minute and doing the fit onchain has to be cheap. A SOL post used 40,674 compute units, and our relayer spends about 0.01 devnet SOL a day for five assets every minute (measured on Nov 17). Lending on Solana can call the limit by CPI later, and the borrow flow works in Phantom on a phone.

**What if Gemini is down, or stops listing markets?**
The Worker gives Gemini 8 seconds. If it fails, nothing is posted and the program's staleness rule takes over: The program holds the last good limit for 5 minutes, then lowers it 2.5 points every 5 minutes, never below 50% (or the last limit if lower). After an hour without a confident post, borrowing and liquidation pause. A missing feed can never make borrowing easier.

**Can someone manipulate the odds to borrow more?**
A manipulated ladder can raise a limit at most to the 75% governance cap; today only BTC sits there. Because the relayer also posts the spot price, it is trusted. Pushing the market down only tightens limits. That can block new borrows and withdrawals, but it cannot liquidate anyone, because odds never liquidate. Each post also needs several two-sided quotes with tight spreads, an expiry between 15 minutes and 72 hours, and spot within 3% of the ladder's implied median. Known gap: the relayer is trusted to post real quotes. Signed or multi-source quotes are the fix, and we say so in the README.

**What is the business model?**
TBD, and we will not pretend otherwise. The obvious path is charging lending protocols or risk curators for the feed, per asset or per call, once it has a measured track record. Today it is an open-source devnet demo with no revenue and no users beyond our testing.

**Is this a real lending market?**
No. It is a risk limit with a minimal pool to prove enforcement: SOL collateral, a test USD token with no value, 0% interest, full-debt liquidation only. The limit is the product.

**Did you build this during the hackathon? How much was AI?**
Yes. The first commit is Nov 15, 23:14 Lagos time, after the Nov 12 kickoff. Code, tests and docs were written with AI coding assistants (Claude and Grok), directed by Oh-Jay, who made the product decisions. Every change had to pass its tests: 52 Rust tests including a 3,000-action fuzz run, 109 Worker tests, 105 app tests, and five security review passes.

**Why does ZEC get a lower limit?**
Because Gemini traders price bigger moves for it. Across Nov 17 its implied volatility ranged from 71% to 262% a year, against 27% to 66% for Bitcoin, so its limit moved between about 47% and 71% while Bitcoin stayed between about 72% and the 75% cap.

## One slide of numbers

| Number | Value | Source and time |
|---|---|---|
| Assets with a live limit | 5: SOL, BTC, ETH, XRP, ZEC | `/health`, Nov 17 |
| Update cadence | Every minute | Worker cron `* * * * *` (Cloudflare schedules API) |
| Feed records stored | 3,017 rows, 04:59 to 15:29 WAT | `/history`, Nov 17, 15:29 WAT |
| Posts counted as confident | 99.9% of those rows | Same pull |
| ZEC limit range | 47.1% to 71.1% | Same pull |
| BTC limit range | 71.8% to 75.0% (cap) | Same pull |
| Compute for one SOL post | 40,674 units | README Proof, Explorer |
| Relayer cost | About 0.01 devnet SOL a day | Balance change 12:24 to 15:37 WAT, Nov 17 |
| Tests | 52 Rust, 109 Worker, 105 app | `scripts/verify.sh` on main, Nov 19 |
| Borrow attempts recorded through Streams | 5 actions, 2 rejected onchain | `/actions`, Nov 17 |
| Borrows onchain | 10 borrows, 5 rejected onchain | Devnet RPC, Nov 19 |
| Accuracy (preliminary) | 79.5% inside 1σ, 97.2% inside 2σ, 8,303 one-hour forecasts | Alchin's tracker on `/history`, Nov 17 to 19 |
| Users | TBD. Team testing only | None measured |
| Market size, revenue | TBD | Not researched with sources |

Refresh the live rows the morning of judging: `https://brace-relayer.ohjaye0.workers.dev/history?asset=ZEC` and `/actions`.
