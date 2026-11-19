
import urllib.request
import json
import time
from pathlib import Path
from datetime import datetime, timezone

BASE_URL = "https://brace-relayer.ohjaye0.workers.dev"
ASSETS = ["SOL", "BTC", "ETH", "XRP", "ZEC"]
INTERVAL = 60

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)


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


def main():
    print("=== BRACE TRACKER ===")

    while True:
        print("\n", datetime.now(timezone.utc).isoformat())

        for asset in ASSETS:
            try:
                records = fetch_history(asset)
                total = save_history(asset, records)

                print(f"[OK] {asset}: {total} records saved")

            except Exception as error:
                print(f"[ERROR] {asset}: {error}")

        print("Next update in 60 seconds...")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
