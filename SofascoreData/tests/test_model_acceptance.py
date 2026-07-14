import tempfile
import unittest
from pathlib import Path

from sofascore.model_acceptance import (
    build_acceptance_report,
    evaluate_classification_target,
    evaluate_regression_target,
    write_acceptance_report,
)


def classification_stats(minority_recall=0.30, macro_f1=0.55, brier=0.42):
    return {
        "baseline": {
            "metrics": {
                "macro_f1": 0.40,
                "brier_score": 0.45,
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
            }
        },
    }


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