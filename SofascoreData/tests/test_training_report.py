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


if __name__ == "__main__":
    unittest.main()
