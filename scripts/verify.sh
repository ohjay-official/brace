#!/usr/bin/env bash
# One-command check of Brace's main claims: program builds and its tests pass,
# worker and app tests pass, the app builds, and the live relayer is posting.
#
#   scripts/verify.sh          everything (needs Rust 1.89, Solana CLI with cargo build-sbf, Node 20+)
#   scripts/verify.sh --live   only the live checks (needs curl and python3)
#
# Uses `cargo build-sbf`, not `anchor build`: in a fresh clone `anchor build` makes a new
# program keypair and rewrites declare_id, and then the program-id test fails.
set -euo pipefail
cd "$(dirname "$0")/.."

RELAYER="${RELAYER:-https://brace-relayer.ohjaye0.workers.dev}"
APP="${APP:-https://braced.vercel.app}"
MAX_AGE="${MAX_AGE:-120}"

step() { printf '\n== %s\n' "$*"; }

if [[ "${1:-}" != "--live" ]]; then
  step "program: cargo build-sbf"
  cargo build-sbf --manifest-path programs/brace/Cargo.toml
  step "program: cargo test -p brace"
  cargo test -p brace
  step "worker: tests and typecheck"
  (cd worker && npm ci --no-audit --no-fund && npx vitest run && npx tsc --noEmit)
  step "app: tests, typecheck and build"
  (cd app && npm ci --no-audit --no-fund && npx vitest run && npx tsc --noEmit && npm run build)
fi

step "live: app responds"
code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$APP")
[[ "$code" == "200" ]] || { echo "app returned $code"; exit 1; }
echo "app 200"

step "live: relayer health, every feed posted in the last ${MAX_AGE}s"
curl -sf -m 20 "$RELAYER/health" | MAX_AGE="$MAX_AGE" python3 -c '
import json, os, sys
h = json.load(sys.stdin)
max_age = int(os.environ["MAX_AGE"])
bad = []
if not h.get("ok"): bad.append("ok is false")
if h.get("lastError"): bad.append("lastError: " + str(h["lastError"])[:200])
for a in ["SOL", "BTC", "ETH", "XRP", "ZEC"]:
    f = h.get("feeds", {}).get(a)
    age = f.get("ageSecs") if f else None
    print(f"{a}: age {age}s")
    if age is None or age > max_age: bad.append(f"{a} stale ({age}s)")
if h.get("lastRun"): print("lastRun", h.get("lastRun"))
else: print("lastRun: not known to this relayer instance (onchain feed ages above are what count)")
if h.get("storeError"):
    print("WARN: history store is paused: " + str(h["storeError"])[:120] + " (Cloudflare D1 free daily read limit, resets 00:00 UTC). Onchain limits are unaffected; /history and /actions answer 503 until then.")
if bad:
    print("FAIL: " + "; ".join(bad)); sys.exit(1)
print("relayer healthy")
if h.get("storeError"): sys.exit(3)
' && HIST=ok || { rc=$?; [[ $rc == 3 ]] && HIST=paused || exit $rc; }
echo
if [[ "${HIST:-ok}" == "paused" ]]; then
  echo "verify: onchain and app checks passed; history store paused for today (see WARN above)"
else
  echo "verify: all checks passed"
fi
