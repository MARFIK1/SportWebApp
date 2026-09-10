import csv
import hashlib
import json
import math
import tempfile
import unittest
from pathlib import Path

from sofascore.paired_walk_forward_analysis import (
    export_paired_walk_forward_analysis,
)
from sofascore.paired_walk_forward_figures import (
    generate_paired_walk_forward_figures,
)


class PairedWalkForwardAnalysisTests(unittest.TestCase):
    @staticmethod
    def _sha256(path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()

    @staticmethod
    def _prediction_row(event_id: int, actual: int, predicted: int, variant: str) -> dict:
        actual_label = "YES" if actual else "NO"
        predicted_label = "YES" if predicted else "NO"
        probabilities = {
            "NO": 0.7 if predicted_label == "NO" else 0.3,
            "YES": 0.7 if predicted_label == "YES" else 0.3,
        }
        return {
            "variant": variant,
            "feature_set": "odds_available" if variant == "with_odds" else "pre_match_safe",
            "model_scope": "all",
            "schema_version": 1,
            "target": "btts",
            "task": "binary",
            "actual": actual,
            "actual_label": actual_label,
            "event_id": event_id,
            "date": "2026-04-01",
            "predictions": {
                "Consensus Policy": {
                    "available": True,
                    "prediction": predicted,
                    "prediction_label": predicted_label,
                    "probabilities": probabilities,
                },
            },
        }

    def _write_run(self, root: Path) -> Path:
        run_dir = root / "paired-run"
        run_dir.mkdir()
        plan_fingerprint = "a" * 64
        jobs = []
        index_files = []
        actual = [0, 1, 0, 1]
        predictions = {
            "without_odds": ([0, 0, 0, 1], [1, 1, 0, 0]),
            "with_odds": ([0, 1, 0, 1], [0, 1, 0, 1]),
        }
        for fold_index in (1, 2):
            fold = {
                "index": fold_index,
                "release_id": f"wf-{fold_index:02d}-2026-04-{fold_index:02d}",
                "train_end": "2026-03-31",
                "test_start": f"2026-04-{fold_index:02d}",
                "test_end": f"2026-04-{fold_index:02d}",
            }
            for variant in ("without_odds", "with_odds"):
                relative = (
                    Path("folds") / variant / f"fold-{fold_index}" / variant
                    / "holdout_predictions.jsonl"
                )
                path = run_dir / relative
                path.parent.mkdir(parents=True)
                rows = [
                    self._prediction_row(
                        fold_index * 100 + row_index,
                        actual_value,
                        predictions[variant][fold_index - 1][row_index],
                        variant,
                    )
                    for row_index, actual_value in enumerate(actual)
                ]
                path.write_text(
                    "\n".join(json.dumps(row) for row in rows) + "\n",
                    encoding="utf-8",
                )
                jobs.append({
                    "id": f"{variant}:{fold['release_id']}",
                    "variant": variant,
                    "fold": fold,
                    "targets": ["btts"],
                    "status": "completed",
                    "artifacts": {"predictions": str(relative)},
                })
                index_files.append({
                    "variant": variant,
                    "fold": fold,
                    "path": str(relative),
                    "rows": len(rows),
                    "sha256": self._sha256(path),
                })

        (run_dir / "walk_forward_run.json").write_text(json.dumps({
            "schema_version": 1,
            "plan_fingerprint": plan_fingerprint,
            "data_dir": str(root / "derived" / "data"),
            "protocol": {
                "start_date": "2026-04-01",
                "end_date": "2026-04-02",
                "paired_common_sample": True,
                "variants": ["without_odds", "with_odds"],
                "targets": ["btts"],
            },
            "jobs": jobs,
        }), encoding="utf-8")
        without_log_loss = (
            5 * -math.log(0.7) + 3 * -math.log(0.3)
        ) / 8
        model_metrics = {
            "without_odds": {
                "test_rows": 8,
                "accuracy": 0.625,
                "macro_f1": 0.619047619,
                "balanced_accuracy": 0.625,
                "brier_score": 0.48,
                "log_loss": without_log_loss,
            },
            "with_odds": {
                "test_rows": 8,
                "accuracy": 1.0,
                "macro_f1": 1.0,
                "balanced_accuracy": 1.0,
                "brier_score": 0.18,
                "log_loss": -math.log(0.7),
            },
        }
        (run_dir / "walk_forward_summary.json").write_text(json.dumps({
            "schema_version": 1,
            "complete": True,
            "plan_fingerprint": plan_fingerprint,
            "variants": {
                variant: {
                    "targets": {
                        "btts": {
                            "task": "binary",
                            "models": {"Consensus Policy": metrics},
                        },
                    },
                }
                for variant, metrics in model_metrics.items()
            },
        }), encoding="utf-8")
        (run_dir / "walk_forward_predictions.json").write_text(json.dumps({
            "schema_version": 1,
            "plan_fingerprint": plan_fingerprint,
            "files": index_files,
            "rows": sum(item["rows"] for item in index_files),
        }), encoding="utf-8")
        return run_dir

    def test_exports_reproducible_paired_statistics_and_figures(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            run_dir = self._write_run(root)
            analysis = root / "analysis"
            figures = root / "figures"

            manifest = export_paired_walk_forward_analysis(
                run_dir,
                analysis,
                bootstrap_iterations=200,
                bootstrap_seed=42,
            )
            with (analysis / "paired_model_comparison.csv").open(
                encoding="utf-8",
                newline="",
            ) as handle:
                rows = list(csv.DictReader(handle))

            self.assertEqual(len(rows), 1)
            self.assertEqual(float(rows[0]["delta_accuracy"]), 0.375)
            self.assertEqual(int(rows[0]["mcnemar_discordant"]), 3)
            self.assertAlmostEqual(float(rows[0]["mcnemar_exact_p"]), 0.25)
            self.assertEqual(manifest["validation"]["prediction_rows"], 16)
            self.assertEqual(manifest["validation"]["summary_metric_checks"], 10)
            self.assertNotIn(str(root), json.dumps(manifest))

            figure_manifest = generate_paired_walk_forward_figures(analysis, figures)
            self.assertEqual(len(figure_manifest["figures"]), 3)
            images = sorted([*figures.glob("*.png"), *figures.glob("*.svg")])
            self.assertEqual(len(images), 6)
            self.assertTrue(all(path.stat().st_size > 1000 for path in images))

            for directory in (analysis, figures):
                for line in (directory / "checksums.sha256").read_text(
                    encoding="utf-8"
                ).splitlines():
                    expected, filename = line.split("  ", 1)
                    self.assertEqual(self._sha256(directory / filename), expected)

    def test_rejects_nonpaired_run(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            run_dir = self._write_run(root)
            path = run_dir / "walk_forward_run.json"
            payload = json.loads(path.read_text(encoding="utf-8"))
            payload["protocol"]["paired_common_sample"] = False
            path.write_text(json.dumps(payload), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "not a paired"):
                export_paired_walk_forward_analysis(
                    run_dir,
                    root / "analysis",
                    bootstrap_iterations=100,
                )


if __name__ == "__main__":
    unittest.main()
