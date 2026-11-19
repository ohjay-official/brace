
import json
import math
from pathlib import Path
from bisect import bisect_left
from datetime import datetime, timezone

# BRACE TRACKER - FORECAST VALIDATION

ASSETS = ["SOL", "BTC", "ETH", "XRP", "ZEC"]

DATA_DIR = Path(__file__).resolve().parent / "data"

YEAR_SECONDS = 31536000
MAX_TOLERANCE = 600

HORIZONS = {
    "24H": 86400,
    "1H": 3600
}


def format_time(ts):
    return datetime.fromtimestamp(
        ts, timezone.utc
    ).isoformat()


def calculate_hit_rate(records, horizon):
    # Ensure records are ordered chronologically
    records = sorted(records, key=lambda r: r["ts"])
    timestamps = [r["ts"] for r in records]

    total = 0
    hits_1 = 0
    hits_2 = 0

    pending = 0
    skipped_gap = 0
    invalid = 0

    evaluated = []
    realised_times = []

    if not records:
        print("No records available.")
        return

    latest_ts = timestamps[-1]

    for record in records:

        try:
            ts = int(record["ts"])
            spot = float(record["spot"])
            sigma_annual = float(record["sigma_annual"])

            if not (
                math.isfinite(spot)
                and math.isfinite(sigma_annual)
                and spot > 0
                and sigma_annual >= 0
            ):
                invalid += 1
                continue

        except (KeyError, TypeError, ValueError):
            invalid += 1
            continue

        target = ts + horizon

        # Forecast has not reached its target time
        if target > latest_ts:
            pending += 1
            continue

        # Find the first observation at or after target
        index = bisect_left(timestamps, target)

        if index >= len(records):
            pending += 1
            continue

        realised_ts = timestamps[index]

        # Reject observations delayed more than 10 minutes
        if realised_ts - target > MAX_TOLERANCE:
            skipped_gap += 1
            continue

        try:
            actual = float(records[index]["spot"])

            if not math.isfinite(actual) or actual <= 0:
                invalid += 1
                continue

            # Convert annual volatility to horizon volatility
            sigma = sigma_annual * math.sqrt(
                horizon / YEAR_SECONDS
            )

            # Prediction bands centered on spot price
            lower_1 = spot * math.exp(-sigma)
            upper_1 = spot * math.exp(sigma)

            lower_2 = spot * math.exp(-2 * sigma)
            upper_2 = spot * math.exp(2 * sigma)

        except (KeyError, TypeError, ValueError, OverflowError):
            invalid += 1
            continue

        # Score the forecast
        total += 1

        evaluated.append(ts)
        realised_times.append(realised_ts)

        if lower_1 <= actual <= upper_1:
            hits_1 += 1

        if lower_2 <= actual <= upper_2:
            hits_2 += 1

    # Print results
    print(f"Evaluated forecasts: {total}")
    print(f"Pending forecasts: {pending}")
    print(f"Skipped forecasts (data gap): {skipped_gap}")
    print(f"Invalid records: {invalid}")

    accounted = total + pending + skipped_gap + invalid
    print(f"Total accounted for: {accounted}")

    if total == 0:
        print("Not enough valid mature forecasts yet.")
        return

    print(f"1 Sigma Hits: {hits_1}/{total}")
    print(f"2 Sigma Hits: {hits_2}/{total}")

    print(f"1 Sigma Hit Rate: {hits_1 / total:.2%}")
    print(f"2 Sigma Hit Rate: {hits_2 / total:.2%}")

    # Forecast observation window
    start_ts = min(evaluated)
    last_forecast_ts = max(evaluated)
    end_ts = max(realised_times)

    print(f"Start TS: {start_ts}")
    print(f"End TS: {end_ts}")

    print(f"Start UTC: {format_time(start_ts)}")
    print(f"End UTC: {format_time(end_ts)}")

    print(f"Last forecast TS: {last_forecast_ts}")


def analyze(asset):
    path = DATA_DIR / f"{asset}.json"

    print(f"\n========== {asset} ==========")

    if not path.exists():
        print(f"[ERROR] Missing file: {path}")
        return

    try:
        records = json.loads(
            path.read_text(encoding="utf-8")
        )
    except (OSError, json.JSONDecodeError) as error:
        print(f"[ERROR] Cannot read data: {error}")
        return

    if not isinstance(records, list):
        print("[ERROR] Expected a list of records.")
        return

    # Remove records without a usable timestamp
    clean_records = []

    for record in records:
        if not isinstance(record, dict):
            continue

        try:
            ts = int(record["ts"])
            clean_records.append({**record, "ts": ts})
        except (KeyError, ValueError, TypeError):
            continue

    clean_records.sort(key=lambda r: r["ts"])

    print(f"Total records: {len(records)}")
    print(f"Records with valid timestamps: {len(clean_records)}")

    for label, horizon in HORIZONS.items():
        print(f"\n--- {label} HIT RATE ---")
        calculate_hit_rate(clean_records, horizon)


def main():
    print("BRACE - FORECAST VALIDATION")
    print("=" * 45)

    print(
        "Generated:",
        datetime.now(timezone.utc).isoformat()
    )

    print("Annualization seconds:", YEAR_SECONDS)
    print("Maximum observation delay:", MAX_TOLERANCE)

    for asset in ASSETS:
        try:
            analyze(asset)
        except Exception as error:
            print(f"[ERROR] {asset}: {error}")


if __name__ == "__main__":
    main()
