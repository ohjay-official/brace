# Reviews and security passes

Fix commit for passes 1 to 4: see 'fix: review findings' in git log. Retest: 47 tests pass (15 math, 11 adversarial, 1 fuzz with 3,000 actions, 11 oracle, 9 pool).

## Pass 1 (functional correctness) and Pass 2 (access control), fresh reviewer, Nov 17

Findings (no critical/high):
- F1 medium: one kept strike beyond ±15% of K_ref aborts the whole fit (math.rs:161), so high-vol or long-dated ladders (ZEC) never go confident. Fix: skip that quote instead.
- F2 medium: spot_e6 written on every post with no check; spot 0 would make every indebted position liquidatable (post_quotes.rs:129). Fix: require spot > 0 and only move the pricing spot on confident posts.
- F3 low: liquidation uses borrow-side rounding, liquidatable by dust at exactly 80%. Fix: floor LTV for the liquidation check.
- F4 low: mid snapped to grid before the 3-97% range check. Fix: check range before snapping.
- F5, F6 info: sub-bps rounding direction in spot gap and horizon move.
- F7 info: spec drift (check_borrow not built, init_pool split, set_relayer, 4-term ln). Fix: update spec.
- F8 info: invariant 6 should be supply <= sum of debts (holders can burn).
- A1 medium: anyone can pre-fund the usd_mint PDA and block init_pool forever (init_pool.rs:31-43). Fix: top-up/allocate/assign path.
- A2 medium: initialize can be front-run after deploy (initialize.rs). Fix: require the program upgrade authority, plus deploy and initialize in one script.
- A3 low: set_relayer accepts the default pubkey. Fix: reject it.
- A4, A5, A6 info: bump search cost, self-liquidation allowed, missing pre-fund tests.

## Pass 3 (financial logic) and Pass 4 (adversarial), fresh reviewer, Nov 17

8 extra LiteSVM tests run in /tmp. No critical/high. Financial math sound (probit table matches to 1e-6, no overflow, rounding favors the pool on borrow/withdraw).
- A1 medium: initialize front-run (same as Pass 2 A2).
- A2 medium: usd_mint PDA pre-fund bricks init_pool, proven by test.
- A3 medium: non-confident post still moves spot; spot x10 enabled over-borrowing, spot 0 let a liquidator take 10 SOL for 1 test USD. Proven by tests.
- A4 low: spot has no age limit; 30 days stale still allows 50% borrows.
- A5 low: degenerate 3-quote ladder gives sigma 0, confident, limit jumps to gov max.
- A6 low: far strike aborts the fit (same as Pass 1 F1).
- F1 low: dust rounding makes exactly-80% positions liquidatable.
- F2 info: invariant 6 should be supply <= total_debt.
- F3 info: code stricter than spec pseudo-code (code is right).
- F4 info: full-debt liquidation only.
- CU for post_quotes with 16 quotes: 61,610 first post, 59,317 update.

## Accepted risks (go in README Known limitations)
- Relayer is trusted for quotes and spot. Mitigations: spot moves only on confident posts, must be within 3% of the ladder-implied median, and goes stale after 1 hour.
- initialize can be front-run between deploy and setup. Mitigation: deploy, initialize and init_pool run back to back from one script, then admin is verified onchain.
- Liquidation repays the full debt only (no partial liquidation); test USD has no value.
- check_borrow CPI not built (cut for time).

## Pass 5 (independent final review), Grok, Nov 17

Scope: `programs/brace` (math.rs fixed-point correctness and overflow, PDA/account validation, signer/owner checks, `post_quotes` Feed creation, borrow/`check_limit`/liquidate, stale handling, `set_params` bounds, "odds only tighten"), cross-checked against `docs/spec.md` and passes 1-4. No code changes in this pass.

Baseline on `main` at c740ede (program last changed in 9b432ef): `anchor build --ignore-keys` exit 0 (one `cargo-build-sbf` warning: crate types `cdylib` + `lib` preclude LTO; no rustc warnings); `cargo test -p brace` 47 passed, 0 failed (15 math, 11 adversarial, 1 fuzz in 49.76s, 11 oracle, 9 pool). `post_quotes` with 16 quotes: 68,416 CU on first post (create), 66,122 CU on update, both confident (from `a11_post_quotes_16_compute_units`).

No critical or high findings. Prior accepted risks still stand. Fixes from passes 1-4 (spot only on confident posts, 1-hour price age, prefund-safe mint and feed PDAs, far strikes skipped, degenerate span rejected, dust liquidation rounding, `set_relayer` rejects default) still hold in the current code.

Findings:
- F1 medium: `Withdraw` always requires a deserialized SOL Feed (`withdraw.rs:31-32`). A user who opens a position and deposits after `init_pool` but before the first `post_quotes` cannot withdraw, even with zero debt. The handler correctly skips `check_limit` when debt is 0 (`withdraw.rs:40-43`), but Anchor still demands the account and fails if the PDA does not exist. Funds are not stolen; they are locked until any SOL post creates the Feed (a non-confident post is enough). Fix: create a placeholder SOL Feed in `init_pool`, or make `sol_feed` optional and require it only when `position.debt > 0`. Until then, Task 7 should keep `init_pool` and the first SOL post back to back, and the app should not offer deposit before the SOL feed exists. **Fixed:** `sol_feed` is now an `UncheckedAccount` checked only when `debt > 0`; a zero-debt withdraw succeeds if the Feed does not exist. Test: `a12_zero_debt_withdraw_without_feed`.
- F2 low: `initialize` accepts `Pubkey::default()` as the relayer (`initialize.rs:20-27`), unlike `set_relayer` (`set_params.rs:24`). Quotes cannot be posted until admin calls `set_relayer`. Not a permanent brick. Fix: reject the default key in `handle_initialize` the same way. **Fixed:** `handle_initialize` rejects the default key with `InvalidParams`. Test: `t12_initialize_default_relayer_rejected`.
- F3 low: `Params::is_valid` allows `stale_step_bps == 0` (`state.rs:33`). `effective_limit_bps` then never steps down, so stale data keeps the last confident limit until the 1-hour `StalePrice` guard. Admin-only. Fix: require `stale_step_bps >= 1`.
- F4 low: `set_params` can lower `liq_threshold_bps` (and `gov_max_ltv_bps`) so a previously healthy position becomes immediately liquidatable with no price change (`set_params.rs:17-20`, `liquidate.rs:35`). Admin-only governance power, not an odds-driven liquidation. Fix: document it under Known limitations, or reject a new threshold that would liquidate any current position.
- F5 low: `post_quotes` only requires `spot_e6 > 0` (`post_quotes.rs:97`); strikes have no upper bound. A confident post with extreme values can make `collateral_value_e6` or `liq_ltv_bps` return `MathOverflow` and pause borrow, withdraw-with-debt, and liquidate until a later sensible confident post. The relayer is already a trusted party (accepted risk). Fix: cap `spot_e6` and strikes at a generous finite bound.
- F6 info: dead `if spot == 0` branch in `liquidate.rs:37-38`; `fresh_spot_e6` already fails on a zero spot.
- F7 info: remaining spec drift (same family as Pass 1 F7). `check_borrow` is not built; `initialize` does not create the Pool or mint; the ln series is 4-term in code vs 3-term in the spec; a never-valid or >1-hour-old feed fails `StalePrice` rather than lending at `stale_floor` (the code is stricter and fail-safe). A new *confident* post may raise `max_ltv_bps` up to `gov_max`; stale and non-confident posts cannot raise the effective limit. That is the "odds only tighten" rule as implemented, and it holds.

Checked and not issues: PDA seeds and stored bumps; admin `has_one` / relayer constraint; position `has_one = owner`; pool `has_one = usd_mint`; mint authority is the pool PDA; Feed create/update (system-owned prefund uses allocate+assign; program-owned accounts are deserialized); non-confident posts do not move spot, `max_ltv_bps`, `has_valid`, or `last_valid_at`; `vol_limit_bps` clamps to `[abs_floor, gov_max]`; stale decay is non-increasing and never above `min(max_ltv, gov_max)` or below `min(stale_floor, base)`; borrow/withdraw LTV rounds up, liquidation LTV floors and uses only `liq_threshold`; `pay_from_pool` keeps the pool rent-exempt. Math uses `checked_*` / `Option` and did not panic on the existing 5k-case property tests.

F1 and F2 were fixed after this pass (tests first). F3–F7 are still open. The program id was switched to `Frv6CVJKADmkM2cnBSMKgBWPvtHsfYkfye5d4vB84WyC`.

## Task 13 re-check prep (Grok, Nov 17, 05:47 Lagos)

Not the final Task 13 gate (that needs the live UI and a fresh-browser demo path). This is a recorded baseline of everything that can be checked before the app lands. No program or Worker code was changed.

Gates run on this prep (repo at 4c3b87d, program last changed in a7b7278 / 18ea875 deploy):

- `anchor build --ignore-keys` exit 0. One `cargo-build-sbf` warning: crate types `cdylib` + `lib` preclude LTO. No rustc warnings.
- `cargo test -p brace` 52 passed, 0 failed: 15 math, 12 adversarial, 1 fuzz (3,000 actions, 51.45s), 12 oracle, 9 pool, 3 worker_ix.
- Worker `vitest run` 55/55; `tsc --noEmit` exit 0.

Live devnet (Africa/Lagos, UTC+1):

- Program `Frv6CVJKADmkM2cnBSMKgBWPvtHsfYkfye5d4vB84WyC` is executable; upgrade authority `FncbMMNBCFVv76GsPP8FJhkNGHkmAZfw7gnkkBj7SvdM`; data length 353,632 bytes; program account 1.7973294 SOL; last deployed in slot 523137960.
- Relayer cron still on. `/health` `lastError` is null. All five Feeds were confident at 05:46:21 WAT (ages 15–16s): SOL implied vol 79.58% max LTV 70.00%; BTC 46.69% / 74.13%; ETH 80.64% / 69.86%; XRP 77.38% / 70.27%; ZEC 178.49% / 57.57%.
- `/history` is Stream-ingested and current (SOL latest row ts 1794890781, tx `3YpGc4zEkjUFymJSBMQHvz3f`, matches the on-chain post). `/actions` is still `[]`.
- CORS `access-control-allow-origin: *` is already on GET and OPTIONS for `/health`, `/preview`, `/history` and `/actions`. Claude's in-progress app reads Feed accounts from devnet RPC and does not call these endpoints yet; no response-shape change was made.

Durability and funds:

- No independent third public Solana devnet RPC accepted `getLatestBlockhash` from Cloudflare Worker IPs without a key. Official and `devnet.rpcpool.com` are 403; OnFinality often 429s; Tatum works (aliases share that provider); Uniblock 429s. `RPC_URLS` stays OnFinality + Tatum. A keyed QuickNode or Helius endpoint would be the real fallback and must not be committed.
- Balances at 05:45:13 WAT: deployer 2.180840884 SOL, relayer 0.99359543 SOL, Phantom demo wallet 1 SOL. Packed five-asset posts cost 5,410 lamports; a split tick cost 10,420. Even at the split rate (~0.015 SOL/day) the relayer lasts about 66 days, and through Sat Nov 21, 23:59 WAT uses under 0.08 SOL.

Pass 5 F3–F7 remain accepted risks (see above). They were not changed in this prep.


## Pass 6: independent audit, cold judge and claims audit (Claude, Nov 19, 10:10 to 12:30 Lagos)

Three fresh reviewer sessions that had not seen the build: a strict security audit of the program, Worker and app (findings reproduced with tests in a scratch clone), a cold judge that followed only the README, and a line-by-line claims audit of the README, Devpost draft, pitch, demo script and every live page.

Security findings:

| id | sev | finding | status |
|---|---|---|---|
| M1 | medium | Spot only updates on confident posts, so in a crash where the ladder lags spot by more than 3% (or spreads widen), liquidation runs on the pre-crash price for up to an hour, then fails with `StalePrice`. Bad debt can build. | Accepted for the hackathon (program unchanged two days before the deadline). Listed in Known Limitations. Fix: track spot freshness separately with a short age for borrow and liquidate. |
| M2 | medium | Same root cause: after a dip, a healthy position can be liquidated on the old dip price for up to an hour (+23% to the liquidator in the reproduction). | Accepted, same fix as M1. Listed in Known Limitations. |
| M3 | medium | The Streams sink decoded every `Program data:` line in any transaction whose logs mention the Brace id, so another program could plant fake rows in `/history`, `/actions` and `/health`. | Fixed in the Worker: only lines inside Brace's own frame count, events from failed transactions are dropped, rows more than 5 minutes in the future are refused. 8 tests; real devnet post and borrow logs give the same rows as before. Worker deploy pending. |
| L1 | low | One future-dated row froze the history cache refresh. | Fixed with M3 (future rows refused). |
| L2 | low | Midpoints snap to 50 bps steps before the fit; on steep or narrow ladders the limit can come out up to 1.5 points looser than a float fit (still capped at 75%). | Accepted, listed in Known Limitations. |
| L3 | low | `initialize` front run on a fresh deploy. | Already listed; the live program is initialized. |
| L4 | low | QuickNode signature check runs only if `QN_SECURITY_TOKEN` is set; no timestamp window. Replays are harmless (writes are idempotent). | Open. |
| I1 | info | No security headers on the app. | Fixed: `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, referrer policy. |
| I2 | info | `security.json` was Anchor's template, with placeholder auditors and contacts. | Deleted. |
| I3 | info | `/preview` could multiply Gemini calls across many IPs. | Open, low risk. |

Checked and sound: signer, `has_one` and seed checks on every instruction; account substitution blocked by seeds, stored bumps and typed token accounts; withdraw and liquidation can't pay out more than the collateral; rounding favours the pool on borrow and withdraw and the borrower on liquidation; math has no panic on extreme inputs and every limit stays inside 30% to 75%; only system and token CPIs; Worker SQL is parameterised, secret comparison is constant time; app instruction builders match the IDL. The deployed program's SHA-256 equals a fresh `cargo build-sbf` of main.

Claims audit: 38 claims corrected (see the commit "claims and judge audit fixes"), including the home headline, which now reads "Stale data can only lower it" (a confident post can raise a limit to the cap).
