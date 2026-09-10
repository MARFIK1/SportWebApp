import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from backfill_snapshot_odds import (
    collect_event_odds,
    enrich_sample_card_outcome,
    enrich_sample_odds,
    extract_card_outcome,
    load_card_outcomes,
    load_ledger,
    write_derived_dataset,
)


class SnapshotOddsBackfillTests(unittest.TestCase):
    def test_extracts_and_enriches_card_outcome_from_final_statistics(self):
        statistics = [{
            "period": "ALL",
            "groups": [{
                "statisticsItems": [{
                    "key": "yellowCards",
                    "homeValue": 2,
                    "awayValue": 3,
                }],
            }],
        }]

        outcome = extract_card_outcome(statistics)
        sample = {"label_cards_over_3_5": None}
        changed = enrich_sample_card_outcome(sample, outcome)

        self.assertEqual(outcome, {
            "label_total_cards": 5,
            "label_cards_over_3_5": 1,
            "label_cards_over_4_5": 1,
        })
        self.assertEqual(sample["label_total_cards"], 5)
        self.assertEqual(sample["label_cards_over_3_5"], 1)
        self.assertIn("label_cards_over_3_5", changed)

    def test_card_outcome_rejects_partial_period_statistics(self):
        outcome = extract_card_outcome([{
            "period": "1ST",
            "groups": [{
                "statisticsItems": [{
                    "key": "yellowCards",
                    "homeValue": 1,
                    "awayValue": 2,
                }],
            }],
        }])

        self.assertEqual(outcome, {})

    def test_enriches_raw_and_derived_odds_without_overwriting_existing(self):
        sample = {
            "odds_home_win": 2.0,
            "odds_draw": 0,
            "odds_away_win": 0,
            "odds_btts_yes": 0,
            "odds_btts_no": 0,
            "odds_over_1_5": 0,
            "odds_under_1_5": 0,
            "odds_over_2_5": 0,
            "odds_under_2_5": 0,
            "odds_cards_over_3_5": 0,
            "odds_cards_under_3_5": 0,
        }

        changed = enrich_sample_odds(sample, {
            "odds_home_win": 9.0,
            "odds_draw": 3.0,
            "odds_away_win": 4.0,
            "odds_btts_yes": 1.8,
            "odds_btts_no": 2.0,
            "odds_over_1_5": 1.25,
            "odds_under_1_5": 4.0,
            "odds_over_2_5": 1.8,
            "odds_under_2_5": 2.0,
            "odds_cards_over_3_5": 1.6,
            "odds_cards_under_3_5": 2.2,
        })

        self.assertEqual(sample["odds_home_win"], 2.0)
        self.assertEqual(sample["odds_draw"], 3.0)
        self.assertEqual(sample["odds_home_prob"], 0.5)
        self.assertEqual(sample["odds_overround"], 1.0833)
        self.assertEqual(sample["odds_btts_prob"], 0.5556)
        self.assertEqual(sample["odds_over_1_5_prob"], 0.8)
        self.assertEqual(sample["odds_over_2_5_prob"], 0.5556)
        self.assertEqual(sample["odds_cards_over_3_5_prob"], 0.625)
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

    def test_ledger_replays_new_markets_from_stored_raw_response(self):
        with tempfile.TemporaryDirectory() as temporary:
            ledger = Path(temporary) / "ledger.jsonl"
            ledger.write_text(
                json.dumps({
                    "event_id": 8,
                    "odds": {},
                    "markets": [{
                        "marketId": 9,
                        "marketName": "Match goals",
                        "choiceGroup": "1.5",
                        "choices": [
                            {"name": "Over", "fractionalValue": "1/2"},
                            {"name": "Under", "fractionalValue": "3/2"},
                        ],
                    }, {
                        "marketId": 20,
                        "marketName": "Cards in match",
                        "marketGroup": "Total Cards",
                        "choiceGroup": "3.5",
                        "choices": [
                            {"name": "Over", "fractionalValue": "4/5"},
                            {"name": "Under", "fractionalValue": "1/1"},
                        ],
                    }],
                }) + "\n",
                encoding="utf-8",
            )

            odds, attempts = load_ledger(ledger)

            self.assertEqual(odds["8"]["odds_over_1_5"], 1.5)
            self.assertEqual(odds["8"]["odds_under_1_5"], 2.5)
            self.assertEqual(odds["8"]["odds_cards_over_3_5"], 1.8)
            self.assertEqual(odds["8"]["odds_cards_under_3_5"], 2.0)
            self.assertEqual(attempts["8"], 1)

    def test_ledger_replays_card_outcome_from_stored_statistics(self):
        with tempfile.TemporaryDirectory() as temporary:
            ledger = Path(temporary) / "ledger.jsonl"
            ledger.write_text(json.dumps({
                "event_id": 9,
                "odds_requested": False,
                "statistics_requested": True,
                "card_outcome": {},
                "statistics": [{
                    "period": "ALL",
                    "groups": [{
                        "statisticsItems": [{
                            "key": "yellowCards",
                            "homeValue": 1,
                            "awayValue": 1,
                        }],
                    }],
                }],
            }) + "\n", encoding="utf-8")

            outcomes, attempts = load_card_outcomes(ledger)
            odds, odds_attempts = load_ledger(ledger)

            self.assertEqual(outcomes["9"]["label_total_cards"], 2)
            self.assertEqual(outcomes["9"]["label_cards_over_3_5"], 0)
            self.assertEqual(attempts["9"], 1)
            self.assertEqual(odds, {})
            self.assertEqual(odds_attempts, {})

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
                {"11": {
                    "label_total_cards": 5,
                    "label_cards_over_3_5": 1,
                    "label_cards_over_4_5": 1,
                }},
            )

            written = json.loads(next(
                (output / "data").rglob("features_all_seasons.json")
            ).read_text(encoding="utf-8"))
            self.assertEqual(written["samples"][0]["odds_home_prob"], 0.5)
            self.assertEqual(written["samples"][0]["label_total_cards"], 5)
            self.assertEqual(written["samples"][0]["label_cards_over_3_5"], 1)
            self.assertEqual(manifest["events"]["unresolved"], 0)
            self.assertTrue((output / "checksums.sha256").exists())


if __name__ == "__main__":
    unittest.main()
