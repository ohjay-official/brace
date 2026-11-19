
import io
import contextlib
from pathlib import Path
from datetime import datetime, timezone

from analytics import analyze, ASSETS


def generate_report():
    output = io.StringIO()

    with contextlib.redirect_stdout(output):
        print("BRACE - FORECAST VALIDATION REPORT")
        print("=" * 45)
        print("Generated:", datetime.now(timezone.utc).isoformat())

        for asset in ASSETS:
            try:
                analyze(asset)
            except Exception as error:
                print(f"[ERROR] {asset}: {error}")

    report = output.getvalue()

    Path("reports").mkdir(exist_ok=True)
    Path("reports/hit_rate.txt").write_text(
        report, encoding="utf-8"
    )

    print(report)
    print("Report saved to reports/hit_rate.txt")


if __name__ == "__main__":
    generate_report()
