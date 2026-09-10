import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from backfill_snapshot_odds import (
    collect_event_odds,
    enrich_sample_odds,
    load_ledger,
    write_derived_dataset,
)


class SnapshotOddsBackfillTests(unittest.TestCase):
    def test_enriches_raw_and_derived_odds_without_overwriting_existing(self):
        sample = {
            "odds_home_win": 2.0,
            "odds_draw": 0,
            "odds_away_win": 0,
            "odds_btts_yes": 0,
            "odds_btts_no": 0,
        }

        changed = enrich_sample_odds(sample, {
            "odds_home_win": 9.0,
            "odds_draw": 3.0,
            "odds_away_win": 4.0,
            "odds_btts_yes": 1.8,
            "odds_btts_no": 2.0,
        })

        self.assertEqual(sample["odds_home_win"], 2.0)
        self.assertEqual(sample["odds_draw"], 3.0)
        self.assertEqual(sample["odds_home_prob"], 0.5)
        self.assertEqual(sample["odds_overround"], 1.0833)
        self.assertEqual(sample["odds_btts_prob"], 0.5556)
        self.assertIn("odds_overround", changed)

    def test_collects_window_events_and_merges_duplicate_odds(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = root / "a" / "features_all_seasons.json"
            second = root / "b" / "features_all_seasons.json"
            first.parent.mkdir(parents=True)
            second.parent.mkdir(parents=True)
            first.write_text(json.dumps({"samples": [
                {"event_id": 1, "date": "2026-04-01", "odds_home_win": 2.0},
                {"event_id": 2, "date": "2026-03-31"},
            ]}), encoding="utf-8")
            second.write_text(json.dumps({"samples": [
                {"event_id": 1, "date": "2026-04-01", "odds_draw": 3.0},
                {"event_id": 3, "date": "2026-07-20"},
            ]}), encoding="utf-8")

            metadata, odds, rows = collect_event_odds(
                [first, second],
                date(2026, 4, 1),
                date(2026, 7, 19),
            )

            self.assertEqual(set(metadata), {"1"})
            self.assertEqual(odds["1"], {
                "odds_home_win": 2.0,
                "odds_draw": 3.0,
            })
            self.assertEqual(rows, 2)

    def test_ledger_merges_successive_partial_responses(self):
        with tempfile.TemporaryDirectory() as temporary:
            ledger = Path(temporary) / "ledger.jsonl"
            ledger.write_text(
                json.dumps({
                    "event_id": 7,
                    "odds": {"odds_home_win": 2.1},
                }) + "\n" + json.dumps({
                    "event_id": 7,
                    "odds": {"odds_draw": 3.2},
                }) + "\n",
                encoding="utf-8",
            )

            odds, attempts = load_ledger(ledger)

            self.assertEqual(odds["7"], {
                "odds_home_win": 2.1,
                "odds_draw": 3.2,
            })
            self.assertEqual(attempts["7"], 2)

    def test_writes_a_versioned_derived_dataset_and_checksums(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source_data = root / "source" / "data"
            feature_path = (
                source_data / "league" / "test" / "features"
                / "features_all_seasons.json"
            )
            feature_path.parent.mkdir(parents=True)
            feature_path.write_text(json.dumps({
                "metadata": {"dataset_builder_version": 5},
                "samples": [{
                    "event_id": 11,
                    "date": "2026-04-01",
                    "odds_home_win": 0,
                    "odds_draw": 0,
                    "odds_away_win": 0,
                    "odds_btts_yes": 0,
                    "odds_btts_no": 0,
                }],
            }), encoding="utf-8")
            output = root / "derived"
            ledger = output / "odds_fetch_ledger.jsonl"
            request = output / "backfill_request.json"
            output.mkdir()
            ledger.write_text("", encoding="utf-8")
            request.write_text("{}\n", encoding="utf-8")

            manifest = write_derived_dataset(
                source_data,
                output,
                [feature_path],
                {"11": {
                    "event_id": 11,
                    "date": "2026-04-01",
                    "home_team": "A",
                    "away_team": "B",
                }},
                {"11": {
                    "odds_home_win": 2.0,
                    "odds_draw": 3.0,
                    "odds_away_win": 4.0,
                    "odds_btts_yes": 1.8,
                    "odds_btts_no": 2.0,
                }},
                ("result", "btts"),
                date(2026, 4, 1),
                date(2026, 7, 19),
                {"snapshot_id": "source-v1"},
                "abc123",
                ledger,
                request,
            )

            written = json.loads(next(
                (output / "data").rglob("features_all_seasons.json")
            ).read_text(encoding="utf-8"))
            self.assertEqual(written["samples"][0]["odds_home_prob"], 0.5)
            self.assertEqual(manifest["events"]["unresolved"], 0)
            self.assertTrue((output / "checksums.sha256").exists())


if __name__ == "__main__":
    unittest.main()
