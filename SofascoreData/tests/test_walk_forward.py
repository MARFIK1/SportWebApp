import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from run_walk_forward_backtest import (
    build_training_command,
    validate_fold_metrics,
    validate_paired_job,
)
from sofascore.walk_forward import (
    aggregate_walk_forward_metrics,
    build_weekly_folds,
)


class WalkForwardFoldTests(unittest.TestCase):
    def test_builds_partial_then_complete_calendar_weeks(self):
        folds = build_weekly_folds("2026-04-01", "2026-07-19")

        self.assertEqual(len(folds), 16)
        self.assertEqual(folds[0].train_end, date(2026, 3, 31))
        self.assertEqual(folds[0].test_start, date(2026, 4, 1))
        self.assertEqual(folds[0].test_end, date(2026, 4, 5))
        self.assertEqual(folds[1].test_start, date(2026, 4, 6))
        self.assertEqual(folds[-1].test_start, date(2026, 7, 13))
        self.assertEqual(folds[-1].test_end, date(2026, 7, 19))

        for previous, current in zip(folds, folds[1:]):
            self.assertEqual(current.train_end, previous.test_end)
            self.assertEqual(
                (current.test_start - previous.test_end).days,
                1,
            )

    def test_rejects_reversed_window(self):
        with self.assertRaisesRegex(ValueError, "must not be earlier"):
            build_weekly_folds("2026-07-19", "2026-04-01")

    def test_later_fold_command_reuses_profile_and_disables_tuning(self):
        fold = build_weekly_folds("2026-04-01", "2026-04-12")[1]
        command = build_training_command(
            Path("snapshot/data"),
            Path("output/fold-02"),
            "without_odds",
            ["result", "btts"],
            fold,
            "all",
            42,
            50,
            Path("output/fold-01/hyperparameters.json"),
            True,
            False,
        )

        self.assertEqual(command[command.index("--optuna-trials") + 1], "0")
        self.assertIn("--hyperparameters-from", command)
        self.assertEqual(
            command[command.index("--test-start-date") + 1],
            "2026-04-06",
        )
        self.assertEqual(
            command[command.index("--data-cutoff") + 1],
            "2026-04-12",
        )
        self.assertIn("--paired-common-sample", command)
        self.assertNotIn("--save-models", command)

    def test_quality_gate_rejects_missing_model_and_test_based_selection(self):
        fold = build_weekly_folds("2026-04-01", "2026-04-05")[0]
        payload = {
            "targets": {
                "result": {
                    "stats": {
                        "trained_models": [
                            "Logistic Regression",
                            "MLP",
                            "XGBoost",
                            "LightGBM",
                        ],
                        "selection": {"source": "test_fallback"},
                        "validation": {"strategy": "fixed_temporal_window"},
                        "date_ranges": {
                            "test": {"min": "2026-04-01", "max": "2026-04-05"},
                            "deployment_train": {
                                "min": "2015-01-01",
                                "max": "2026-03-31",
                            },
                        },
                        "deployment_refit": {
                            "status": "completed",
                            "test_excluded": True,
                            "models": {
                                name: {"test_metrics": {"macro_f1": 0.5}}
                                for name in (
                                    "Logistic Regression",
                                    "Random Forest",
                                    "MLP",
                                    "XGBoost",
                                    "LightGBM",
                                )
                            },
                            "consensus": {
                                "Consensus Argmax": {"macro_f1": 0.5},
                                "Consensus Policy": {"macro_f1": 0.5},
                            },
                        },
                        "hyperparameters": {"policy": "defaults"},
                    },
                },
            },
        }

        errors = validate_fold_metrics(
            payload,
            ["result"],
            "thesis_core",
            fold,
            "defaults",
        )

        self.assertTrue(any("Random Forest" in error for error in errors))
        self.assertTrue(any("temporal CV" in error for error in errors))

    def test_paired_gate_rejects_different_holdout_fingerprints(self):
        with tempfile.TemporaryDirectory() as temporary:
            output_dir = Path(temporary)
            first_path = output_dir / "without.json"
            second_path = output_dir / "with.json"
            first_path.write_text(
                json.dumps({
                    "targets": {
                        "result": {
                            "stats": {"validation_fingerprint": "sample-a"},
                        },
                    },
                }),
                encoding="utf-8",
            )
            second_path.write_text(
                json.dumps({
                    "targets": {
                        "result": {
                            "stats": {"validation_fingerprint": "sample-b"},
                        },
                    },
                }),
                encoding="utf-8",
            )
            current = {
                "variant": "with_odds",
                "fold": {"release_id": "wf-01-2026-04-01"},
                "artifacts": {"metrics": "with.json"},
                "status": "completed",
            }
            manifest = {
                "jobs": [
                    {
                        "variant": "without_odds",
                        "fold": {"release_id": "wf-01-2026-04-01"},
                        "artifacts": {"metrics": "without.json"},
                        "status": "completed",
                    },
                    current,
                ],
            }

            errors = validate_paired_job(
                manifest,
                output_dir,
                current,
                ["result"],
            )

        self.assertEqual(errors, ["result: paired variants use different holdout rows"])

    def test_quality_gate_accepts_complete_leakage_safe_fold(self):
        fold = build_weekly_folds("2026-04-01", "2026-04-05")[0]
        payload = {
            "targets": {
                "result": {
                    "stats": {
                        "trained_models": [
                            "Logistic Regression",
                            "Random Forest",
                            "MLP",
                            "XGBoost",
                            "LightGBM",
                        ],
                        "selection": {"source": "temporal_cross_validation"},
                        "validation": {"strategy": "fixed_temporal_window"},
                        "date_ranges": {
                            "test": {"min": "2026-04-01", "max": "2026-04-05"},
                            "deployment_train": {
                                "min": "2015-01-01",
                                "max": "2026-03-31",
                            },
                        },
                        "deployment_refit": {
                            "status": "completed",
                            "test_excluded": True,
                            "models": {
                                name: {"test_metrics": {"macro_f1": 0.5}}
                                for name in (
                                    "Logistic Regression",
                                    "Random Forest",
                                    "MLP",
                                    "XGBoost",
                                    "LightGBM",
                                )
                            },
                            "consensus": {
                                "Consensus Argmax": {"macro_f1": 0.5},
                                "Consensus Policy": {"macro_f1": 0.5},
                            },
                        },
                        "hyperparameters": {"policy": "defaults"},
                    },
                },
            },
        }

        self.assertEqual(
            validate_fold_metrics(
                payload,
                ["result"],
                "thesis_core",
                fold,
                "defaults",
            ),
            [],
        )


class WalkForwardAggregationTests(unittest.TestCase):
    @staticmethod
    def _entry(fold, classification, regression):
        return {
            "variant": "without_odds",
            "fold": {"index": fold},
            "metrics": {
                "targets": {
                    "btts": {
                        "task": "binary",
                        "stats": {
                            "test_matches": sum(sum(row) for row in classification["cm"]),
                            "deployment_refit": {
                                "models": {
                                    "Model": {
                                        "test_metrics": {
                                            "confusion_matrix": classification["cm"],
                                            "brier_score": classification["brier"],
                                            "log_loss": classification["log_loss"],
                                            "ece": classification["ece"],
                                        },
                                    },
                                },
                            },
                        },
                    },
                    "total_goals": {
                        "task": "regression",
                        "stats": {
                            "test_matches": regression["rows"],
                            "detailed_metrics": {
                                "Regressor": {
                                    "mae": regression["mae"],
                                    "rmse": regression["rmse"],
                                    "r2": regression["r2"],
                                },
                            },
                        },
                    },
                },
            },
        }

    def test_pools_fold_metrics_without_averaging_macro_f1(self):
        summary = aggregate_walk_forward_metrics([
            self._entry(
                1,
                {"cm": [[8, 2], [1, 9]], "brier": 0.2, "log_loss": 0.5, "ece": 0.1},
                {"rows": 10, "mae": 1.0, "rmse": 1.0, "r2": 0.5},
            ),
            self._entry(
                2,
                {"cm": [[4, 1], [2, 3]], "brier": 0.3, "log_loss": 0.8, "ece": 0.2},
                {"rows": 20, "mae": 2.0, "rmse": 2.0, "r2": 0.2},
            ),
        ])

        models = summary["variants"]["without_odds"]["targets"]
        classification = models["btts"]["models"]["Model"]
        self.assertEqual(classification["confusion_matrix"], [[12, 3], [3, 12]])
        self.assertEqual(classification["test_rows"], 30)
        self.assertAlmostEqual(classification["accuracy"], 0.8)
        self.assertAlmostEqual(classification["macro_f1"], 0.8)
        self.assertAlmostEqual(classification["brier_score"], 0.233333)

        regression = models["total_goals"]["models"]["Regressor"]
        self.assertAlmostEqual(regression["mae"], 1.666667)
        self.assertAlmostEqual(regression["rmse"], 1.732051)
        self.assertAlmostEqual(regression["r2_fold_weighted"], 0.3)


if __name__ == "__main__":
    unittest.main()
