import unittest

from sofascore.dataset_builder import (
    build_competition_feature_samples,
    build_season_feature_samples,
    deduplicate_matches,
)
from sofascore.features import MLFeatureGenerator


def match(event_id, date, home, away, home_score=None, away_score=None, status="finished", **extra):
    return {
        "event_id": event_id,
        "date": date,
        "time": "18:00",
        "round": 1,
        "home_team": home,
        "away_team": away,
        "home_score": home_score,
        "away_score": away_score,
        "status": status,
        **extra,
    }


class DatasetBuilderTests(unittest.TestCase):
    def test_deduplication_prefers_finished_complete_record(self):
        upcoming = match(10, "2026-01-01", "A", "B", status="upcoming")
        finished = match(10, "2026-01-01", "A", "B", 2, 1, home_xg=1.4)

        rows, removed = deduplicate_matches([upcoming, finished])

        self.assertEqual(removed, 1)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["home_score"], 2)

    def test_deduplication_normalizes_event_id_and_prefers_latest_tie(self):
        old = match(10, "2026-01-01", "A", "B", 1, 0)
        updated = match("10", "2026-01-01", "A", "B", 2, 0)

        rows, removed = deduplicate_matches([old, updated])

        self.assertEqual(removed, 1)
        self.assertEqual(rows[0]["home_score"], 2)

    def test_mixed_event_id_types_generate_without_sort_errors(self):
        matches = [
            match(70, "2026-01-01", "A", "B", 1, 0),
            match("71", "2026-01-01", "C", "D", 0, 1),
        ]

        result = build_season_feature_samples(
            matches,
            MLFeatureGenerator(),
            season="2026",
        )

        self.assertEqual(result.finished_samples, 2)

    def test_uses_history_for_form_but_resets_table_for_new_season(self):
        history = [
            match(1, "2025-05-01", "A", "B", 3, 0, home_xg=2.0, away_xg=0.4),
            match(2, "2025-05-08", "B", "A", 1, 2, home_xg=0.8, away_xg=1.5),
        ]
        current = [match(3, "2026-08-01", "A", "B", 1, 1)]

        result = build_season_feature_samples(
            current,
            MLFeatureGenerator(),
            season="26_27",
            history_matches=history + current,
            elo_matches=history + current,
        )

        sample = result.samples[0]
        self.assertEqual(sample["home_table_points"], 0)
        self.assertEqual(sample["away_table_points"], 0)
        self.assertEqual(sample["home_form_matches"], 2)
        self.assertEqual(sample["home_form_xg_matches"], 2)

    def test_emits_one_sample_per_event(self):
        duplicate = match(20, "2026-02-01", "A", "B", 1, 0)

        result = build_season_feature_samples(
            [duplicate, dict(duplicate)],
            MLFeatureGenerator(),
            season="2026",
        )

        self.assertEqual(len(result.samples), 1)
        self.assertEqual(result.finished_samples, 1)

    def test_zero_xg_is_available_but_missing_xg_is_not(self):
        history = [
            match(40, "2026-01-01", "A", "B", 0, 0, home_xg=0, away_xg=0),
            match(41, "2026-01-08", "A", "B", 1, 0),
        ]

        form = MLFeatureGenerator().compute_form("A", history, "2026-02-01")

        self.assertEqual(form["form_matches"], 2)
        self.assertEqual(form["form_xg_matches"], 1)

    def test_direct_generator_ignores_previous_season_in_table(self):
        previous = match(50, "2025-05-01", "A", "B", 2, 0, season="24_25")
        current = match(51, "2026-08-01", "A", "B", 0, 0, season="26_27")

        sample = MLFeatureGenerator().generate_match_features(
            current,
            [previous, current],
            team_history_matches=[previous, current],
        )

        self.assertEqual(sample["home_table_points"], 0)
        self.assertEqual(sample["away_table_points"], 0)

    def test_pending_match_keeps_identity_without_result_labels(self):
        upcoming = match(
            60,
            "2026-09-01",
            "A",
            "B",
            status="notstarted",
            season="26_27",
        )

        result = build_season_feature_samples(
            [upcoming],
            MLFeatureGenerator(),
            season="26_27",
        )

        self.assertEqual(result.finished_samples, 0)
        self.assertEqual(result.pending_samples, 1)
        self.assertEqual(result.samples[0]["event_id"], 60)
        self.assertNotIn("label_result_int", result.samples[0])

    def test_competition_builder_resets_table_between_seasons(self):
        previous = match(30, "2025-05-01", "A", "B", 2, 0, season="24_25")
        current = match(31, "2026-08-01", "A", "B", 0, 0, season="26_27")

        result = build_competition_feature_samples(
            [previous, current],
            MLFeatureGenerator(),
        )

        current_sample = next(sample for sample in result.samples if sample["event_id"] == 31)
        self.assertEqual(current_sample["home_table_points"], 0)
        self.assertEqual(current_sample["home_form_matches"], 1)


if __name__ == "__main__":
    unittest.main()
