import tempfile
import unittest
from pathlib import Path

from sofascore.model_acceptance import (
    build_acceptance_report,
    evaluate_classification_target,
    evaluate_regression_target,
    write_acceptance_report,
)


def classification_stats(
    minority_recall=0.30,
    macro_f1=0.55,
    brier=0.42,
    ece=0.08,
):
    return {
        "feature_set": "pre_match_safe",
        "baseline": {
            "metrics": {
                "macro_f1": 0.40,
                "brier_score": 0.45,
                "ece": 0.10,
            }
        },
        "selection": {"best_model": "Model"},
        "detailed_metrics": {"Model": {"macro_f1": 0.52}},
        "decision_policy_test_evaluation": {
            "Consensus Policy": {
                "macro_f1": macro_f1,
                "balanced_accuracy": 0.56,
                "per_class_recall": {"0": 0.75, "1": minority_recall},
                "brier_score": brier,
                "ece": ece,
            }
        },
    }


def with_production_benchmark(
    stats,
    artifact_id="active-model",
    macro_f1=0.54,
    brier=0.425,
    ece=0.085,
):
    stats["validation_fingerprint"] = "holdout-1"
    stats["production_benchmark"] = {
        "reference_artifact": {"artifact_id": artifact_id},
        "holdout_fingerprint": "holdout-1",
        "coverage": 1.0,
        "comparable": True,
        "metrics": {
            "macro_f1": macro_f1,
            "brier_score": brier,
            "ece": ece,
            "mae": 1.80,
        },
    }
    return stats


class ModelAcceptanceTests(unittest.TestCase):
    def test_accepts_balanced_classification_improvement(self):
        result = evaluate_classification_target("btts", classification_stats())

        self.assertTrue(result["accepted"])
        self.assertEqual(result["candidate"], "Consensus Policy")
        self.assertAlmostEqual(result["metrics"]["macro_f1_improvement"], 0.15)

    def test_multiclass_balanced_accuracy_uses_one_third_chance_level(self):
        stats = classification_stats()
        stats["decision_policy_test_evaluation"]["Consensus Policy"].update({
            "balanced_accuracy": 0.45,
            "per_class_recall": {"0": 0.55, "1": 0.30, "2": 0.50},
        })

        result = evaluate_classification_target("result", stats)

        self.assertTrue(result["accepted"])
        self.assertAlmostEqual(
            result["metrics"]["required_balanced_accuracy"],
            1 / 3,
        )

    def test_rejects_classification_that_ignores_one_class(self):
        result = evaluate_classification_target(
            "over_1_5",
            classification_stats(minority_recall=0.0),
        )

        self.assertFalse(result["accepted"])
        self.assertTrue(any("class recall" in reason for reason in result["reasons"]))

    def test_rejects_classification_with_worse_brier_score(self):
        result = evaluate_classification_target(
            "btts",
            classification_stats(brier=0.47),
        )

        self.assertFalse(result["accepted"])
        self.assertTrue(any("Brier" in reason for reason in result["reasons"]))

    def test_rejects_classification_without_brier_score(self):
        stats = classification_stats()
        del stats["decision_policy_test_evaluation"]["Consensus Policy"][
            "brier_score"
        ]

        result = evaluate_classification_target("btts", stats)

        self.assertFalse(result["accepted"])
        self.assertTrue(any("Brier" in reason for reason in result["reasons"]))

    def test_rejects_classification_with_worse_calibration(self):
        result = evaluate_classification_target(
            "btts",
            classification_stats(ece=0.13),
        )

        self.assertFalse(result["accepted"])
        self.assertTrue(any("ECE" in reason for reason in result["reasons"]))

    def test_rejects_classification_without_ece(self):
        stats = classification_stats()
        del stats["decision_policy_test_evaluation"]["Consensus Policy"]["ece"]

        result = evaluate_classification_target("btts", stats)

        self.assertFalse(result["accepted"])
        self.assertTrue(any("ECE" in reason for reason in result["reasons"]))

    def test_accepts_regression_with_meaningful_mae_improvement(self):
        result = evaluate_regression_target(
            "total_cards",
            {
                "selection": {
                    "best_model": "Gradient Boosting",
                    "best_score": 1.70,
                    "baseline_score": 1.74,
                }
            },
        )

        self.assertTrue(result["accepted"])
        self.assertGreater(result["metrics"]["relative_mae_improvement"], 0.01)

    def test_rejects_regression_with_negligible_mae_improvement(self):
        result = evaluate_regression_target(
            "total_goals",
            {
                "selection": {
                    "best_model": "Gradient Boosting",
                    "best_score": 1.3172,
                    "baseline_score": 1.3178,
                }
            },
        )

        self.assertFalse(result["accepted"])

    def test_requires_candidate_to_match_active_production_on_same_holdout(self):
        report = build_acceptance_report(
            {"btts": with_production_benchmark(classification_stats())},
            {"btts": "binary"},
            "without_odds",
            require_production_benchmark=True,
            expected_production_artifact_id="active-model",
        )

        self.assertEqual(report["schema_version"], 2)
        self.assertEqual(report["accepted_targets"], ["btts"])
        self.assertGreater(
            report["targets"]["btts"]["metrics"]["macro_f1_delta_vs_production"],
            0,
        )

    def test_rejects_candidate_worse_than_active_production(self):
        stats = with_production_benchmark(
            classification_stats(),
            macro_f1=0.60,
            brier=0.40,
        )
        result = evaluate_classification_target(
            "btts",
            stats,
            require_production_benchmark=True,
            expected_production_artifact_id="active-model",
        )

        self.assertFalse(result["accepted"])
        self.assertTrue(any("active-production" in reason for reason in result["reasons"]))

    def test_accepts_brier_delta_exactly_on_production_threshold(self):
        stats = with_production_benchmark(
            classification_stats(brier=0.42),
            macro_f1=0.54,
            brier=0.415,
        )
        result = evaluate_classification_target(
            "btts",
            stats,
            require_production_benchmark=True,
            expected_production_artifact_id="active-model",
        )

        self.assertTrue(result["accepted"])
        self.assertAlmostEqual(
            result["metrics"]["brier_delta_vs_production"],
            0.005,
        )

    def test_rejects_ece_regression_against_active_production(self):
        stats = with_production_benchmark(
            classification_stats(ece=0.10),
            ece=0.08,
        )
        result = evaluate_classification_target(
            "btts",
            stats,
            require_production_benchmark=True,
            expected_production_artifact_id="active-model",
        )

        self.assertFalse(result["accepted"])
        self.assertTrue(any("ECE" in reason for reason in result["reasons"]))

    def test_rejects_missing_or_mismatched_production_reference(self):
        missing = evaluate_classification_target(
            "btts",
            classification_stats(),
            require_production_benchmark=True,
            expected_production_artifact_id="active-model",
        )
        mismatch = evaluate_classification_target(
            "btts",
            with_production_benchmark(classification_stats(), artifact_id="another-model"),
            require_production_benchmark=True,
            expected_production_artifact_id="active-model",
        )

        self.assertFalse(missing["accepted"])
        self.assertFalse(mismatch["accepted"])
        self.assertTrue(any("artifact ID" in reason for reason in mismatch["reasons"]))

    def test_regression_candidate_must_not_worsen_active_production_mae(self):
        stats = with_production_benchmark({
            "selection": {
                "best_model": "Regressor",
                "best_score": 1.85,
                "baseline_score": 2.00,
            }
        })
        result = evaluate_regression_target(
            "total_goals",
            stats,
            require_production_benchmark=True,
            expected_production_artifact_id="active-model",
        )

        self.assertFalse(result["accepted"])
        self.assertTrue(any("active-production" in reason for reason in result["reasons"]))

    def test_rejects_live_unsafe_feature_set_for_deployment(self):
        stats = classification_stats()
        stats["feature_set"] = "lineup_available"

        report = build_acceptance_report(
            {"btts": stats},
            {"btts": "binary"},
            "without_odds",
        )

        self.assertEqual(report["accepted_targets"], [])
        self.assertTrue(any(
            "not deployable" in reason
            for reason in report["targets"]["btts"]["reasons"]
        ))

    def test_accepts_odds_feature_set_for_odds_variant(self):
        stats = classification_stats()
        stats["feature_set"] = "odds_available"

        report = build_acceptance_report(
            {"btts": stats},
            {"btts": "binary"},
            "with_odds",
        )

        self.assertEqual(report["accepted_targets"], ["btts"])


    def test_builds_and_writes_acceptance_report(self):
        report = build_acceptance_report(
            {"btts": classification_stats()},
            {"btts": "binary"},
            "without_odds",
        )

        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "acceptance.json"
            write_acceptance_report(report, output)

            self.assertTrue(output.exists())
            self.assertEqual(report["accepted_targets"], ["btts"])
            self.assertEqual(report["rejected_targets"], [])


if __name__ == "__main__":
    unittest.main()