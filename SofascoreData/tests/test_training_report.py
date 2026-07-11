import tempfile
import unittest
from pathlib import Path

from sofascore.training_report import (
    build_training_comparison,
    compare_model_metrics,
    write_training_comparison,
)


class TrainingReportTests(unittest.TestCase):
    def test_reports_positive_improvement_for_higher_and_lower_metrics(self):
        rows = compare_model_metrics(
            {"Model": {"accuracy": 0.55, "brier_score": 0.58}},
            {"Model": {"accuracy": 0.50, "brier_score": 0.62}},
        )

        metrics = rows[0]["metrics"]
        self.assertAlmostEqual(metrics["accuracy"]["improvement"], 0.05)
        self.assertAlmostEqual(metrics["brier_score"]["improvement"], 0.04)

    def test_builds_and_writes_comparison_files(self):
        stats = {
            "result": {
                "validation": {"strategy": "global_temporal"},
                "date_ranges": {"test": {"min": "2025-01-01"}},
                "feature_set": "pre_match_safe",
                "features": 42,
                "detailed_metrics": {"Model": {"accuracy": 0.55}},
            }
        }
        baseline = {
            "created_at": "2026-01-01T00:00:00Z",
            "metrics_by_target": {"result": {"Model": {"accuracy": 0.50}}},
        }
        report = build_training_comparison(stats, baseline, "without_odds", {"rows": 100})

        with tempfile.TemporaryDirectory() as temporary:
            paths = write_training_comparison(report, Path(temporary))

            self.assertTrue(Path(paths["json"]).exists())
            self.assertTrue(Path(paths["csv"]).exists())
            self.assertIn("global_temporal", Path(paths["json"]).read_text(encoding="utf-8"))

    def test_converts_legacy_multiclass_brier_before_comparison(self):
        stats = {
            "result": {
                "class_labels": [0, 1, 2],
                "detailed_metrics": {"Model": {"brier_score": 0.60}},
            }
        }
        baseline = {
            "metrics_by_target": {"result": {"Model": {"brier_score": 0.20}}},
        }

        report = build_training_comparison(stats, baseline, "without_odds", {})
        target = report["targets"]["result"]
        brier = target["models"][0]["metrics"]["brier_score"]

        self.assertAlmostEqual(brier["baseline"], 0.60)
        self.assertAlmostEqual(brier["improvement"], 0.0)
        self.assertEqual(
            target["metric_contract"]["baseline_conversion_factor"],
            3,
        )


if __name__ == "__main__":
    unittest.main()
