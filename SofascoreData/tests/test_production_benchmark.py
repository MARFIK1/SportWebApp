import unittest

import pandas as pd

from sofascore.predictor import UniversalPredictor


class ReferencePredictor:
    def __init__(self):
        self.models = {"result": {}, "total_goals": {}}

    def get_artifact_contract(self):
        return {
            "artifact_id": "active-model",
            "variant": "without_odds",
        }

    def predict_match_all_models(self, features, target):
        if target == "total_goals":
            return {
                "consensus": {
                    "prediction": float(features["expected_total"]),
                }
            }

        home_win = features["home_team"] == "Alpha"
        return {
            "consensus": {
                "prediction": "HOME" if home_win else "AWAY",
                "avg_probabilities": {
                    "HOME": 80.0 if home_win else 10.0,
                    "DRAW": 10.0,
                    "AWAY": 10.0 if home_win else 80.0,
                },
            }
        }


class ProductionBenchmarkTests(unittest.TestCase):
    def setUp(self):
        self.predictor = UniversalPredictor(".")
        self.reference = ReferencePredictor()
        self.frame = pd.DataFrame([
            {
                "event_id": 1,
                "date": "2026-07-01",
                "home_team": "Alpha",
                "away_team": "Beta",
                "expected_total": 2.5,
            },
            {
                "event_id": 2,
                "date": "2026-07-02",
                "home_team": "Gamma",
                "away_team": "Delta",
                "expected_total": 3.5,
            },
        ], index=[10, 20])

    def test_classification_reference_uses_exact_candidate_holdout(self):
        labels = pd.Series([0, 2], index=self.frame.index)
        self.predictor.training_stats["result"] = {}

        self.predictor._attach_reference_benchmark(
            self.reference,
            "result",
            self.frame,
            self.frame.index,
            labels,
        )

        stats = self.predictor.training_stats["result"]
        benchmark = stats["production_benchmark"]
        self.assertEqual(stats["validation_fingerprint"], benchmark["holdout_fingerprint"])
        self.assertTrue(benchmark["comparable"])
        self.assertEqual(benchmark["coverage"], 1.0)
        self.assertEqual(benchmark["metrics"]["accuracy"], 1.0)
        self.assertEqual(benchmark["reference_artifact"]["artifact_id"], "active-model")

    def test_regression_reference_uses_deployed_selection_strategy(self):
        labels = pd.Series([2.5, 3.5], index=self.frame.index)
        self.predictor.training_stats["total_goals"] = {}

        self.predictor._attach_reference_benchmark(
            self.reference,
            "total_goals",
            self.frame,
            self.frame.index,
            labels,
        )

        benchmark = self.predictor.training_stats["total_goals"]["production_benchmark"]
        self.assertTrue(benchmark["comparable"])
        self.assertEqual(benchmark["metrics"]["mae"], 0.0)
        self.assertEqual(benchmark["rows_evaluated"], 2)


if __name__ == "__main__":
    unittest.main()