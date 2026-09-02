import csv
import json
import tempfile
import unittest
from pathlib import Path

from sofascore.thesis_results import export_thesis_results


class ThesisResultsTests(unittest.TestCase):
    def _write_run(self, root: Path, name: str, target: str, cutoff="2026-07-19"):
        run = root / name
        variant = run / "without_odds"
        variant.mkdir(parents=True)
        (run / "run.json").write_text(json.dumps({
            "schema_version": 1,
            "created_at": "2026-09-01T00:00:00Z",
            "variants": ["without_odds"],
            "targets": [target],
            "data_cutoff": cutoff,
            "test_start_date": "2026-04-01",
            "optuna_trials": 50,
            "optuna_seed": 42,
            "model_scope": "thesis_core",
            "paired_common_sample": True,
            "dataset": {"rows": 100, "date_max": cutoff},
        }), encoding="utf-8")
        (variant / "training_metrics.json").write_text(json.dumps({
            "targets": {
                target: {
                    "task": "binary",
                    "stats": {
                        "total_matches": 100,
                        "train_matches": 80,
                        "test_matches": 20,
                        "features": 5,
                        "feature_set": "pre_match_safe",
                        "selection": {
                            "validation_metric": "macro_f1",
                            "validation_score": 0.55,
                            "best_model": "Random Forest",
                            "test_score": 0.56,
                            "baseline_score": 0.35,
                            "improvement_over_baseline": 0.21,
                        },
                        "detailed_metrics": {
                            "Random Forest": {
                                "accuracy": 0.6,
                                "macro_f1": 0.56,
                                "brier_score": 0.48,
                            },
                        },
                        "cv_results": {
                            "Random Forest": {"mean": 0.55, "std": 0.01},
                        },
                    },
                },
            },
        }), encoding="utf-8")
        (variant / "acceptance.json").write_text(json.dumps({
            "targets": {
                target: {
                    "task": "classification",
                    "accepted": True,
                    "candidate": "Consensus Policy",
                    "feature_set": "pre_match_safe",
                    "reasons": [],
                    "metrics": {
                        "baseline_macro_f1": 0.35,
                        "candidate_macro_f1": 0.56,
                        "macro_f1_improvement": 0.21,
                        "balanced_accuracy": 0.57,
                        "candidate_brier_score": 0.48,
                        "candidate_ece": 0.02,
                    },
                },
            },
        }), encoding="utf-8")
        return run

    def _write_promotions(self, root: Path, candidate: Path):
        root.mkdir()
        for variant in ("without_odds", "with_odds"):
            target = "result" if variant == "without_odds" else "btts"
            source = str(candidate / variant / "universal_predictor.pkl")
            model_name = (
                "universal_predictor_with_odds.pkl"
                if variant == "with_odds"
                else "universal_predictor.pkl"
            )
            (root / f"active_{variant}.json").write_text(json.dumps({
                "release_id": f"{variant}-release",
                "artifact_id": f"{variant}-artifact",
            }), encoding="utf-8")
            (root / f"{model_name}.manifest.json").write_text(json.dumps({
                "artifact_id": f"{variant}-artifact",
                "artifact_sha256": "0" * 64,
            }), encoding="utf-8")
            (root / f"{variant}.promotion.json").write_text(json.dumps({
                "accepted_targets": [target],
                "fallback_targets": [],
                "source_by_target": {target: source},
                "decisions": {
                    target: {
                        "candidate": "Consensus Policy",
                        "feature_set": "pre_match_safe",
                        "reasons": [],
                    },
                },
            }), encoding="utf-8")

    def _add_unevaluated_fallback(self, accepted: Path):
        path = accepted / "with_odds.promotion.json"
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload["fallback_targets"] = ["over_2_5"]
        payload["source_by_target"]["over_2_5"] = "baseline"
        path.write_text(json.dumps(payload), encoding="utf-8")

    def test_export_combines_primary_and_supplemental_runs_without_paths(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            primary = self._write_run(root, "primary-seed42", "result")
            supplemental = self._write_run(root, "supplemental", "over_2_5")
            accepted = root / "accepted"
            output = root / "results"
            self._write_promotions(accepted, primary)
            self._add_unevaluated_fallback(accepted)

            manifest = export_thesis_results(
                primary,
                accepted,
                output,
                supplemental_runs=[supplemental],
            )

            with (output / "evaluation_summary.csv").open(encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            with (output / "promotion_summary.csv").open(encoding="utf-8") as handle:
                promotion_rows = list(csv.DictReader(handle))
            exported_text = "\n".join(
                path.read_text(encoding="utf-8")
                for path in output.iterdir()
                if path.is_file()
            )

            self.assertEqual([row["target"] for row in rows], ["over_2_5", "result"])
            self.assertEqual(manifest["outputs"]["evaluation_rows"], 2)
            self.assertEqual(manifest["outputs"]["model_rows"], 2)
            self.assertEqual(len(promotion_rows), 3)
            fallback_row = next(
                row for row in promotion_rows
                if row["variant"] == "with_odds" and row["target"] == "over_2_5"
            )
            without_odds_row = next(
                row for row in promotion_rows
                if row["variant"] == "without_odds" and row["target"] == "result"
            )
            self.assertEqual(fallback_row["reasons"], "no candidate evaluation")
            self.assertEqual(without_odds_row["final_source"], "primary-seed42")
            self.assertEqual(without_odds_row["release_id"], "without_odds-release")
            input_sources = [item["source"] for item in manifest["inputs"]]
            self.assertIn("primary-seed42/run.json", input_sources)
            self.assertIn("supplemental/run.json", input_sources)
            self.assertEqual(len(input_sources), len(set(input_sources)))
            self.assertNotIn(str(root), exported_text)
            self.assertTrue((output / "checksums.sha256").exists())

    def test_export_rejects_inconsistent_evaluation_windows(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            primary = self._write_run(root, "primary", "result")
            supplemental = self._write_run(
                root,
                "supplemental",
                "over_2_5",
                cutoff="2026-07-20",
            )
            accepted = root / "accepted"
            self._write_promotions(accepted, primary)

            with self.assertRaisesRegex(ValueError, "uses window"):
                export_thesis_results(
                    primary,
                    accepted,
                    root / "results",
                    supplemental_runs=[supplemental],
                )


if __name__ == "__main__":
    unittest.main()
