
import io
import contextlib
from pathlib import Path
from datetime import datetime, timezone

from analytics import analyze, ASSETS

# Next to the scripts, like data/, whatever folder you run from.
REPORTS_DIR = Path(__file__).resolve().parent / "reports"


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

    REPORTS_DIR.mkdir(exist_ok=True)
    report_path = REPORTS_DIR / "hit_rate.txt"
    report_path.write_text(report, encoding="utf-8")

    print(report)
    print(f"Report saved to {report_path}")


if __name__ == "__main__":
    generate_report()
