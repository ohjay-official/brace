import argparse
import urllib.request
import json
import time
from pathlib import Path
from datetime import datetime, timezone

BASE_URL = "https://brace-relayer.ohjaye0.workers.dev"
ASSETS = ["SOL", "BTC", "ETH", "XRP", "ZEC"]
# Every 5 minutes, and only new rows after the first pull: the relayer's history store
# (Cloudflare D1, free plan) has a daily read limit that full pulls every minute used up.
INTERVAL = 300
# Re-read the last 10 minutes each time, so rows that reached the relayer late are not missed.
OVERLAP_SECS = 600

# Same folder analytics.py reads, whatever folder you run from.
DATA_DIR = Path(__file__).resolve().parent / "data"


def fetch_history(asset, since=None):
    url = f"{BASE_URL}/history?asset={asset}"
    if since is not None:
        url += f"&since={int(since)}"

    headers = {
        "User-Agent": "BraceTracker/1.0",
        "Accept": "application/json"
    }

    request = urllib.request.Request(url, headers=headers)

    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())


def save_history(asset, records):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"{asset}.json"

    existing = []

    if path.exists():
        existing = json.loads(path.read_text())

    combined = {
        record["ts"]: record
        for record in existing + records
    }

    history = sorted(
        combined.values(),
        key=lambda record: record["ts"]
    )

    path.write_text(json.dumps(history, indent=2))

    return len(history)


def last_saved_ts(asset):
    """Newest ts already saved for this asset, or None before the first pull."""
    path = DATA_DIR / f"{asset}.json"
    if not path.exists():
        return None
    try:
        rows = json.loads(path.read_text())
        return max(int(r["ts"]) for r in rows) if rows else None
    except (ValueError, KeyError, TypeError):
        return None


def run_once():
    """One pass over every asset. Returns the number of assets that failed."""
    print("\n", datetime.now(timezone.utc).isoformat())

    failed = 0

    for asset in ASSETS:
        try:
            last = last_saved_ts(asset)
            records = fetch_history(asset) if last is None else fetch_history(asset, last - OVERLAP_SECS)
            total = save_history(asset, records)

            print(f"[OK] {asset}: {total} records saved")

        except Exception as error:
            failed += 1
            print(f"[ERROR] {asset}: {error}")

    return failed


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Collect Brace forecast history into tracker/data/."
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="fetch every asset one time, then exit "
             "(exit code 1 if any asset failed)",
    )
    args = parser.parse_args(argv)

    print("=== BRACE TRACKER ===")
    print(f"Saving to: {DATA_DIR}")

    if args.once:
        return 1 if run_once() else 0

    while True:
        run_once()
        print(f"Next update in {INTERVAL} seconds...")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    raise SystemExit(main())
