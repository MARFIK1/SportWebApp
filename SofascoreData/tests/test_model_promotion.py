import unittest
from types import SimpleNamespace

from sofascore.model_promotion import merge_accepted_candidates


def accepted_classification_stats():
    return {
        "baseline": {"metrics": {"macro_f1": 0.30, "brier_score": 0.60}},
        "selection": {"best_model": "Model"},
        "detailed_metrics": {"Model": {"macro_f1": 0.50}},
        "decision_policy_test_evaluation": {
            "Consensus Policy": {
                "macro_f1": 0.48,
                "balanced_accuracy": 0.52,
                "per_class_recall": {"0": 0.60, "1": 0.40, "2": 0.55},
                "brier_score": 0.58,
            }
        },
    }


def rejected_regression_stats():
    return {
        "selection": {
            "best_model": "Regressor",
            "best_score": 1.99,
            "baseline_score": 2.00,
        }
    }


def predictor(target, stats, model_value):
    return SimpleNamespace(
        models={target: {"Model": model_value}},
        scalers={target: f"scaler-{model_value}"},
        feature_columns_by_target={target: [f"feature-{model_value}"]},
        feature_sets_by_target={target: "pre_match_safe"},
        training_stats={target: stats},
        decision_policies={target: {"policy": model_value}},
        feature_columns=[],
        scaler=None,
        trained=True,
        artifact_metadata={},
    )


class ModelPromotionTests(unittest.TestCase):
    def test_promotes_accepted_target_and_keeps_rejected_fallback(self):
        baseline = SimpleNamespace(
            models={
                "result": {"Legacy": "legacy-result"},
                "total_goals": {"Legacy": "legacy-goals"},
            },
            scalers={"result": "old-result-scaler", "total_goals": "old-goals-scaler"},
            feature_columns_by_target={
                "result": ["old-result"],
                "total_goals": ["old-goals"],
            },
            feature_sets_by_target={"result": "legacy", "total_goals": "legacy"},
            training_stats={"result": {}, "total_goals": {}},
            decision_policies={},
            feature_columns=[],
            scaler=None,
            trained=True,
            artifact_metadata={},
        )
        result_candidate = predictor(
            "result",
            accepted_classification_stats(),
            "backend-v2-result",
        )
        goals_candidate = predictor(
            "total_goals",
            rejected_regression_stats(),
            "backend-v2-goals",
        )

        promoted, report = merge_accepted_candidates(
            baseline,
            [("result.pkl", result_candidate), ("goals.pkl", goals_candidate)],
            {"result": "multiclass", "total_goals": "regression"},
            "without_odds",
        )

        self.assertEqual(promoted.models["result"], result_candidate.models["result"])
        self.assertEqual(promoted.models["total_goals"], {"Legacy": "legacy-goals"})
        self.assertEqual(report["accepted_targets"], ["result"])
        self.assertEqual(report["rejected_targets"], ["total_goals"])
        self.assertIn("total_goals", report["fallback_targets"])
        self.assertIs(promoted.artifact_metadata["promotion"], report)

    def test_rejects_duplicate_candidate_target(self):
        baseline = predictor("result", {}, "legacy")
        first = predictor("result", accepted_classification_stats(), "first")
        second = predictor("result", accepted_classification_stats(), "second")

        with self.assertRaisesRegex(ValueError, "duplicate candidate target"):
            merge_accepted_candidates(
                baseline,
                [("first.pkl", first), ("second.pkl", second)],
                {"result": "multiclass"},
                "without_odds",
            )

    def test_rejects_candidate_from_another_variant(self):
        baseline = predictor("result", {}, "legacy")
        candidate = predictor(
            "result",
            accepted_classification_stats(),
            "with-odds",
        )
        candidate.artifact_metadata = {"training": {"variant": "with_odds"}}

        with self.assertRaisesRegex(ValueError, "candidate variant mismatch"):
            merge_accepted_candidates(
                baseline,
                [("candidate.pkl", candidate)],
                {"result": "multiclass"},
                "without_odds",
            )

    def test_rejects_baseline_from_another_variant(self):
        baseline = predictor("result", {}, "legacy")
        baseline.artifact_metadata = {"promotion": {"variant": "with_odds"}}

        with self.assertRaisesRegex(ValueError, "baseline variant mismatch"):
            merge_accepted_candidates(
                baseline,
                [],
                {"result": "multiclass"},
                "without_odds",
            )


if __name__ == "__main__":
    unittest.main()