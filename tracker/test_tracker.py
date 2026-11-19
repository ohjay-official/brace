"""Tests for the tracker's data path and --once flag.

Run from anywhere:  python tracker/test_tracker.py
No network: fetch_history is replaced with a fake.
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import analytics  # noqa: E402
import report  # noqa: E402
import tracker  # noqa: E402


class DataPathTest(unittest.TestCase):
    def test_all_scripts_share_one_data_folder(self):
        self.assertEqual(tracker.DATA_DIR, HERE / "data")
        self.assertEqual(analytics.DATA_DIR, HERE / "data")

    def test_report_folder_is_next_to_the_scripts(self):
        self.assertEqual(report.REPORTS_DIR, HERE / "reports")

    def test_save_lands_in_data_dir_whatever_the_working_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp) / "data"
            elsewhere = Path(tmp) / "elsewhere"
            elsewhere.mkdir()
            old = os.getcwd()
            os.chdir(elsewhere)
            try:
                with mock.patch.object(tracker, "DATA_DIR", data):
                    tracker.save_history("SOL", [{"ts": 1, "spot": 1.0}])
            finally:
                os.chdir(old)
            self.assertTrue((data / "SOL.json").exists())
            self.assertFalse((elsewhere / "data").exists())


class OnceFlagTest(unittest.TestCase):
    def run_main(self, argv, fetch):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(tracker, "DATA_DIR", Path(tmp)), \
                 mock.patch.object(tracker, "fetch_history", fetch), \
                 mock.patch.object(tracker.time, "sleep",
                                   side_effect=AssertionError("slept")):
                return tracker.main(argv)

    def test_once_runs_one_pass_and_returns(self):
        calls = []

        def fetch(asset):
            calls.append(asset)
            return [{"ts": 1, "spot": 1.0}]

        code = self.run_main(["--once"], fetch)
        self.assertEqual(code, 0)
        self.assertEqual(calls, tracker.ASSETS)

    def test_once_returns_1_when_an_asset_fails(self):
        def fetch(asset):
            if asset == "BTC":
                raise OSError("down")
            return [{"ts": 1, "spot": 1.0}]

        self.assertEqual(self.run_main(["--once"], fetch), 1)

    def test_without_once_it_loops(self):
        with self.assertRaisesRegex(AssertionError, "slept"):
            self.run_main([], lambda asset: [])

    def test_help_mentions_once(self):
        out = subprocess.run(
            [sys.executable, str(HERE / "tracker.py"), "--help"],
            capture_output=True, text=True, check=True,
        ).stdout
        self.assertIn("--once", out)


class DedupeTest(unittest.TestCase):
    def test_same_timestamp_is_kept_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(tracker, "DATA_DIR", Path(tmp)):
                tracker.save_history("SOL", [{"ts": 2}, {"ts": 1}])
                total = tracker.save_history("SOL", [{"ts": 2}, {"ts": 3}])
                saved = json.loads((Path(tmp) / "SOL.json").read_text())
        self.assertEqual(total, 3)
        self.assertEqual([r["ts"] for r in saved], [1, 2, 3])


if __name__ == "__main__":
    unittest.main()
