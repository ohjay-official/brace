import argparse
import urllib.request
import json
import time
from pathlib import Path
from datetime import datetime, timezone

BASE_URL = "https://brace-relayer.ohjaye0.workers.dev"
ASSETS = ["SOL", "BTC", "ETH", "XRP", "ZEC"]
INTERVAL = 60

# Same folder analytics.py reads, whatever folder you run from.
DATA_DIR = Path(__file__).resolve().parent / "data"


def fetch_history(asset):
    url = f"{BASE_URL}/history?asset={asset}"

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


def run_once():
    """One pass over every asset. Returns the number of assets that failed."""
    print("\n", datetime.now(timezone.utc).isoformat())

    failed = 0

    for asset in ASSETS:
        try:
            records = fetch_history(asset)
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
