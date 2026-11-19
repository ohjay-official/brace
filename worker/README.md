# Brace relayer Worker

Cloudflare Worker that posts Gemini "price X or above" ladders to the Brace program on Solana devnet every minute. The program, not this Worker, does the implied-vol fit.

Do not put keys, seeds or tokens in this folder. `RELAYER_SECRET` and `STREAMS_SINK_SECRET` are Worker secrets, never committed.

## Test (offline, uses captured Gemini fixtures)

```bash
cd worker
npm install
npm test
npx tsc --noEmit
```

Fixtures in `test/fixtures/` were fetched from the public Gemini API on 2026-11-17, 03:12 UTC.

## Deploy

Account ID (not secret) is in `wrangler.toml`. There is no Cloudflare API token in this environment, so deploys go through the Workers scripts API (see `scripts/cf-deploy-relayer.mjs`), not `wrangler deploy`.

1. `node ../scripts/cf-deploy-relayer.mjs`: local minify bundle only (dry-run).
2. Upload `dist/index.js` as Worker `brace-relayer` with vars `PROGRAM_ID` and `RPC_URL`, compatibility_date `2026-11-17`. Do not attach cron.
3. PUT secrets via the secrets API, never commit them: `RELAYER_SECRET` (base58 64-byte relayer key) and `STREAMS_SINK_SECRET` (shared header for `/streams`). Optional later: `QN_SECURITY_TOKEN` for QuickNode HMAC verification.
4. Bind D1 database `brace` as `DB` (id in wrangler.toml). Enable the workers.dev subdomain for the script.

Do not enable the minute cron until Task 7 (program on devnet and relayer funded). The exact later call is in `scripts/cf-deploy-relayer.mjs`.

RPC: `RPC_URL` plus optional comma-separated `RPC_URLS` (OnFinality first, then Tatum). The relayer retries 429s with backoff and fails over to the next URL. Official `api.devnet.solana.com` 403s Cloudflare IPs.

Backup RPC (optional): set a keyed devnet endpoint as the Worker **secret** `RPC_URL_BACKUP` (never a plain var, never in `wrangler.toml`: the key is in the URL). The relayer tries it only after every public URL fails, and errors have RPC URLs replaced with `[rpc]`, so the key never reaches logs or `/health`. Must start with `https://`; anything else is ignored. To add it from a phone: Cloudflare dashboard, Workers & Pages, `brace-relayer`, Settings, Variables and Secrets, Add, type **Secret**, name `RPC_URL_BACKUP`, value your QuickNode Solana Devnet HTTP URL, Deploy. To remove it, delete the secret: the relayer goes back to the public URLs only.

## Endpoints

- `GET /health` → `{ ok, lastRun, lastError, lastSigs, feeds }` persisted in D1 (survives isolate recycle). `feeds[asset].ageSecs` is age of the last Stream-ingested post (or last relayer signature if none).
- `GET /preview?asset=SOL` → selected ladder and encoded `post_quotes` bytes, no signing. Useful from a phone. Unknown asset → 400.
- `POST /streams` → QuickNode Streams webhook sink. Requires header `x-brace-secret` matching `STREAMS_SINK_SECRET`. If `QN_SECURITY_TOKEN` is set, also verifies `X-QN-Nonce` + `X-QN-Timestamp` + body against `X-QN-Signature` (HMAC-SHA256, decompressed JSON).
- `GET /history?asset=SOL&since=<unix>&limit=<n>` → accuracy-tracker contract from docs/spec.md (JSON array, oldest first). CORS `*`. `asset` is one of SOL, BTC, ETH, XRP, ZEC (any case) or omitted for all.
- `GET /actions?since=<unix>&limit=<n>` → blocked/allowed feed (kind, owner, amount, ltv, limit, ok, tx, error). CORS `*`.
- Both cap a response at 10,000 rows (`limit` 1 to 10000, default 10000). With `since`, you get the oldest rows from `since`; page forward by passing the last `ts` as the next `since` (dedupe on `tx` + `asset`). Without `since`, you get the newest rows. Unknown asset, bad `since` or bad `limit` → 400 with `{ "error": "..." }`.
- Gemini calls time out after 8 s and RPC calls after 10 s; an RPC timeout is retried on the next URL.

The Stream is not created in this repo (needs a QuickNode key). Filter to paste: `filters/brace-program.js`.

## Cron

`* * * * *`. One transaction per asset (SOL, BTC, ETH, XRP, ZEC). A failure on one asset does not stop the others. Logs only tickers and signatures.
