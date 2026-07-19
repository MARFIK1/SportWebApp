import unittest

from predict_today import (
    _agreement_strength,
    _dedupe_source_matches,
    _get_missing_odds_features,
    _get_missing_runtime_inputs,
    _has_confirmed_lineup_features,
    _matches_with_source_season,
    _model_release_summary,
    _prediction_quality_summary,
    _raw_match_to_match_data,
    _serialize_result_prediction_data,
    _split_target_predictions,
    compute_features_for_upcoming,
)
from sofascore.utils import extract_match_data


def artifact(artifact_id, variant="without_odds"):
    return {
        "schema_version": 1,
        "artifact_id": artifact_id,
        "variant": variant,
    }


def match_with_artifact(artifact_id):
    return {
        "prediction_variants": {
            "without_odds": {
                "artifact": artifact(artifact_id),
            }
        }
    }


class PredictionContractTests(unittest.TestCase):
    def test_consistent_snapshot_uses_one_artifact_per_variant(self):
        summary = _model_release_summary([
            match_with_artifact("model-a"),
            match_with_artifact("model-a"),
        ])

        self.assertEqual(summary["status"], "consistent")
        self.assertTrue(summary["snapshot_id"].startswith("snapshot-"))
        self.assertEqual(
            summary["variants"]["without_odds"]["artifact_ids"],
            ["model-a"],
        )

    def test_mixed_snapshot_detects_multiple_artifacts(self):
        summary = _model_release_summary([
            match_with_artifact("model-a"),
            match_with_artifact("model-b"),
        ])

        self.assertEqual(summary["status"], "mixed")
        self.assertEqual(
            summary["variants"]["without_odds"]["artifact_ids"],
            ["model-a", "model-b"],
        )

    def test_legacy_snapshot_detects_missing_contract(self):
        summary = _model_release_summary([
            {"prediction_variants": {"without_odds": {}}},
        ])

        self.assertEqual(summary["status"], "legacy")
        self.assertEqual(
            summary["variants"]["without_odds"]["missing_contracts"],
            1,
        )

    def test_partial_legacy_snapshot_is_mixed(self):
        summary = _model_release_summary([{
            "prediction_variants": {
                "without_odds": {"artifact": artifact("model-a")},
                "with_odds": {},
            }
        }])

        self.assertEqual(summary["status"], "mixed")
        self.assertEqual(summary["variants"]["with_odds"]["status"], "legacy")

    def test_contract_assigned_to_wrong_variant_is_mixed(self):
        summary = _model_release_summary([{
            "prediction_variants": {
                "with_odds": {
                    "artifact": artifact("model-a", variant="without_odds"),
                }
            }
        }])

        self.assertEqual(summary["status"], "mixed")
        self.assertEqual(summary["variants"]["with_odds"]["invalid_contracts"], 1)

    def test_serialization_preserves_compact_artifact_contract(self):
        payload = _serialize_result_prediction_data({
            "default_prediction_variant": "without_odds",
            "predictions": {},
            "market_predictions": {},
            "prediction_variants": {
                "without_odds": {
                    "predictions": {},
                    "market_predictions": {},
                    "odds_used": False,
                    "artifact": {
                        **artifact("model-a"),
                        "artifact": "C:/private/model.pkl",
                    },
                }
            },
        }, None)

        serialized = payload["prediction_variants"]["without_odds"]["artifact"]
        self.assertEqual(serialized["artifact_id"], "model-a")
        self.assertNotIn("artifact", serialized)


class MarketConsistencyTests(unittest.TestCase):
    def test_agreement_strength_parses_fraction_as_percentage(self):
        self.assertEqual(_agreement_strength({"agreement": "9/20"}), 45.0)
        self.assertEqual(_agreement_strength({"agreement_pct": 72.5}), 72.5)

    def test_threshold_consistency_uses_numeric_agreement(self):
        split = _split_target_predictions({
            "result": {},
            "over_1_5": {
                "consensus": {
                    "prediction": "UNDER",
                    "agreement": "9/20",
                    "avg_probabilities": {"OVER": 40, "UNDER": 60},
                }
            },
            "over_2_5": {
                "consensus": {
                    "prediction": "OVER",
                    "agreement": "10/20",
                    "avg_probabilities": {"OVER": 55, "UNDER": 45},
                }
            },
        })

        lower = split["market_predictions"]["over_1_5"]["consensus"]
        higher = split["market_predictions"]["over_2_5"]["consensus"]
        self.assertEqual(lower["prediction"], "OVER")
        self.assertTrue(lower["consistency_adjusted"])
        self.assertLessEqual(higher["avg_probabilities"]["OVER"], lower["avg_probabilities"]["OVER"])


class PredictionQualitySummaryTests(unittest.TestCase):
    def test_summarizes_quality_separately_for_each_variant(self):
        complete = {
            "status": "complete",
            "feature_count": 4,
            "usable_feature_count": 4,
            "defaulted_feature_count": 0,
            "coverage_pct": 100.0,
            "missing_features": [],
            "invalid_features": [],
        }
        degraded = {
            "status": "degraded",
            "feature_count": 4,
            "usable_feature_count": 3,
            "defaulted_feature_count": 1,
            "coverage_pct": 75.0,
            "missing_features": ["home_form_points"],
            "invalid_features": [],
        }
        summary = _prediction_quality_summary([{
            "id": "match-1",
            "prediction_variants": {
                "without_odds": {
                    "consensus": {"input_quality": complete},
                    "market_predictions": {
                        "btts": {"consensus": {"input_quality": degraded}},
                    },
                },
                "with_odds": {
                    "consensus": {},
                    "market_predictions": {},
                },
            },
        }])

        without_odds = summary["variants"]["without_odds"]
        with_odds = summary["variants"]["with_odds"]
        self.assertEqual(summary["status"], "degraded")
        self.assertEqual(without_odds["status"], "degraded")
        self.assertEqual(without_odds["coverage_pct"], 87.5)
        self.assertEqual(without_odds["missing_feature_counts"], {"home_form_points": 1})
        self.assertEqual(with_odds["status"], "legacy")
        self.assertEqual(with_odds["missing_quality_targets"], 1)


class PredictionInputContractTests(unittest.TestCase):
    def test_penalty_shootout_keeps_draw_for_1x2_and_winner_metadata(self):
        match = {
            "event_id": 10,
            "home_team": "Home",
            "away_team": "Away",
            "home_score": 5,
            "away_score": 4,
            "home_score_pen": 4,
            "away_score_pen": 3,
            "status": "finished",
        }

        converted = _raw_match_to_match_data(
            match,
            "international",
            "fifa",
            "world_cup",
        )

        self.assertEqual(converted["result"], "D")
        self.assertEqual(converted["score"], "1-1")
        self.assertEqual(converted["penalty_score"], "4-3")
        self.assertTrue(converted["decided_by_penalties"])

    def test_file_metadata_fills_missing_match_season(self):
        rows = _matches_with_source_season({
            "metadata": {"season": "World Cup 2026"},
            "matches": [{"event_id": 20, "home_team": "A", "away_team": "B"}],
        })

        self.assertEqual(rows[0]["season"], "World Cup 2026")

    def test_synthetic_scheduled_label_is_not_used_as_season(self):
        rows = _matches_with_source_season({
            "metadata": {"season": "Scheduled 2026-07-18"},
            "matches": [{"event_id": 21, "home_team": "A", "away_team": "B"}],
        })

        self.assertNotIn("season", rows[0])

    def test_deduplication_enriches_existing_match_with_season(self):
        rows = _dedupe_source_matches([
            {"event_id": 30, "home_team": "A", "away_team": "B"},
            {
                "event_id": 30,
                "home_team": "A",
                "away_team": "B",
                "season": "World Cup 2026",
            },
        ])

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["season"], "World Cup 2026")

    def test_live_features_keep_table_inside_current_season(self):
        history = [
            {
                "event_id": 31,
                "date": "2022-06-01",
                "status": "finished",
                "season": "World Cup 2022",
                "home_team": "A",
                "away_team": "C",
                "home_score": 3,
                "away_score": 0,
            },
            {
                "event_id": 32,
                "date": "2026-06-01",
                "status": "finished",
                "season": "World Cup 2026",
                "home_team": "A",
                "away_team": "D",
                "home_score": 1,
                "away_score": 1,
            },
        ]
        features = compute_features_for_upcoming(
            {
                "event_id": 33,
                "date": "2026-07-01",
                "season": "World Cup 2026",
                "home": "A",
                "away": "B",
            },
            history,
            team_history_matches=history,
        )

        self.assertEqual(features["season"], "World Cup 2026")
        self.assertEqual(features["home_table_points"], 1)

    def test_odds_requirements_follow_target_artifact_features(self):
        class Predictor:
            feature_columns = []
            feature_columns_by_target = {
                "result": ["home_form_points", "odds_home_prob"],
                "over_2_5": ["home_form_goals", "odds_over_2_5_prob"],
                "btts": ["home_form_goals"],
            }

        base_odds = {
            "odds_home_win": 2.0,
            "odds_draw": 3.2,
            "odds_away_win": 4.1,
        }

        self.assertEqual(
            _get_missing_odds_features(base_odds, Predictor(), "result"),
            [],
        )
        self.assertEqual(
            _get_missing_odds_features(
                {**base_odds, "odds_over_2_5": 1.8},
                Predictor(),
                "over_2_5",
            ),
            ["odds_under_2_5"],
        )
        self.assertEqual(
            _get_missing_odds_features({}, Predictor(), "btts"),
            [],
        )

    def test_lineup_feature_set_requires_confirmed_lineups_at_runtime(self):
        class Predictor:
            feature_sets_by_target = {
                "result": "lineup_available",
                "btts": "pre_match_safe",
            }

        match = {"event_id": 50}
        lineups = {
            "50": {
                "home": {"starters": [{"id": 1}]},
                "away": {"starters": [{"id": 2}]},
            }
        }

        self.assertFalse(_has_confirmed_lineup_features(match, None, {"1": {}}))
        self.assertFalse(_has_confirmed_lineup_features(match, lineups, None))
        self.assertTrue(_has_confirmed_lineup_features(match, lineups, {"1": {}}))
        self.assertEqual(
            _get_missing_runtime_inputs(Predictor(), "result", False),
            ["confirmed_lineups"],
        )
        self.assertEqual(
            _get_missing_runtime_inputs(Predictor(), "result", True),
            [],
        )
        self.assertEqual(
            _get_missing_runtime_inputs(Predictor(), "btts", False),
            [],
        )

    def test_sofascore_event_exposes_real_season_name(self):
        event = {
            "id": 40,
            "startTimestamp": 1784332800,
            "status": {"type": "notstarted"},
            "season": {"name": "World Cup 2026"},
            "homeTeam": {"id": 1, "name": "A"},
            "awayTeam": {"id": 2, "name": "B"},
            "homeScore": {},
            "awayScore": {},
        }

        self.assertEqual(extract_match_data(event)["season"], "World Cup 2026")


if __name__ == "__main__":
    unittest.main()