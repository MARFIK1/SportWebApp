import tempfile
import unittest
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from sofascore.predictor import (
    DeploymentCalibratedClassifier,
    UniversalPredictor,
    _resolve_classification_prediction_model,
)
from sofascore.lstm_model import HAS_TORCH, LSTMPredictor


class DeploymentRefitTests(unittest.TestCase):
    def setUp(self):
        self.X_train = pd.DataFrame(
            {
                "feature_a": [-3.0, -2.0, 2.0, 3.0, -4.0, 6.0, -5.0, 7.0],
                "feature_b": [0.0, 1.0, 0.0, 1.0, 2.0, 2.0, 3.0, 3.0],
            },
            index=range(100, 108),
        )
        self.y_train = pd.Series(
            [0, 0, 1, 1, 0, 1, 0, 1],
            index=self.X_train.index,
        )
        self.train_dates = pd.Series(
            pd.date_range("2025-01-01", periods=len(self.X_train), freq="D"),
            index=self.X_train.index,
        )
        self.X_test = pd.DataFrame(
            {
                "feature_a": [-100.0, 100.0],
                "feature_b": [50.0, 50.0],
            },
            index=[200, 201],
        )
        self.y_test = pd.Series([0, 1], index=self.X_test.index)

    def test_deployment_refit_uses_all_pretest_rows_and_survives_round_trip(self):
        benchmark_rows = self.X_train.iloc[:4]
        benchmark_targets = self.y_train.iloc[:4]
        benchmark_scaler = StandardScaler().fit(benchmark_rows)
        benchmark_model = LogisticRegression(random_state=42).fit(
            benchmark_scaler.transform(benchmark_rows),
            benchmark_targets,
        )
        benchmark_coefficients = benchmark_model.coef_.copy()

        predictor = UniversalPredictor(".")
        predictor.models = {
            "btts": {
                "Logistic Regression": {
                    "model": benchmark_model,
                    "scaled": True,
                    "supports_sample_weight": True,
                    "benchmark_train_rows": len(benchmark_rows),
                    "benchmark_train_date_range": {
                        "min": "2025-01-01",
                        "max": "2025-01-04",
                    },
                    "calibrated_model": benchmark_model,
                    "decision_policy": None,
                }
            }
        }

        summary = predictor._fit_deployment_classification_models(
            target="btts",
            X_train=self.X_train,
            y_train=self.y_train,
            train_dates=self.train_dates,
            sample_weights=np.ones(len(self.X_train)),
            X_probability_cal_raw=self.X_train.iloc[4:],
            y_probability_cal=self.y_train.iloc[4:],
            scaler=benchmark_scaler,
            X_test=self.X_test,
            y_test=self.y_test,
            class_labels=[0, 1],
            avg_method="binary",
        )

        model_data = predictor.models["btts"]["Logistic Regression"]
        deployment_model = model_data["deployment_model"]
        deployment_scaler = deployment_model.estimator.named_steps["scaler"]

        self.assertEqual(summary["status"], "completed")
        self.assertEqual(summary["rows"], len(self.X_train))
        self.assertTrue(summary["test_excluded"])
        self.assertEqual(summary["date_range"]["max"], "2025-01-08")
        self.assertEqual(model_data["deployment_metadata"]["status"], "refit")
        self.assertIn(
            "confusion_matrix",
            summary["models"]["Logistic Regression"]["test_metrics"],
        )
        self.assertIn("Consensus Argmax", summary["consensus"])
        self.assertEqual(
            model_data["deployment_metadata"]["benchmark"]["rows"],
            len(benchmark_rows),
        )
        self.assertEqual(int(deployment_scaler.n_samples_seen_), len(self.X_train))
        np.testing.assert_allclose(deployment_scaler.mean_, self.X_train.mean().values)
        self.assertFalse(np.allclose(deployment_scaler.mean_, self.X_test.mean().values))
        np.testing.assert_allclose(benchmark_model.coef_, benchmark_coefficients)
        self.assertTrue(deployment_model.calibrators)

        resolved_model, resolved_frame, is_deployment = (
            _resolve_classification_prediction_model(
                model_data,
                self.X_test,
                benchmark_scaler,
            )
        )
        self.assertIs(resolved_model, deployment_model)
        self.assertIs(resolved_frame, self.X_test)
        self.assertTrue(is_deployment)

        expected_probabilities = deployment_model.predict_proba(self.X_test)
        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_path = Path(temp_dir) / "deployment_model.joblib"
            joblib.dump(deployment_model, artifact_path)
            restored = joblib.load(artifact_path)
        self.assertIsInstance(restored, DeploymentCalibratedClassifier)
        np.testing.assert_allclose(
            restored.predict_proba(self.X_test),
            expected_probabilities,
        )

    def test_resolver_keeps_legacy_scaled_artifacts_compatible(self):
        scaler = StandardScaler().fit(self.X_train)
        model = LogisticRegression(random_state=42).fit(
            scaler.transform(self.X_train),
            self.y_train,
        )

        resolved_model, resolved_frame, is_deployment = (
            _resolve_classification_prediction_model(
                {
                    "model": model,
                    "scaled": True,
                    "calibrated_model": None,
                },
                self.X_test,
                scaler,
            )
        )

        self.assertIs(resolved_model, model)
        np.testing.assert_allclose(resolved_frame, scaler.transform(self.X_test))
        self.assertFalse(is_deployment)

    def test_new_training_fails_closed_when_a_deployment_refit_is_missing(self):
        predictor = UniversalPredictor(".")
        predictor.models = {
            "btts": {
                "Broken Model": {
                    "model": None,
                    "scaled": False,
                    "supports_sample_weight": False,
                }
            }
        }

        with self.assertRaisesRegex(
            RuntimeError,
            "deployment refit failed for: Broken Model",
        ):
            predictor._fit_deployment_classification_models(
                target="btts",
                X_train=self.X_train,
                y_train=self.y_train,
                train_dates=self.train_dates,
                sample_weights=np.ones(len(self.X_train)),
                X_probability_cal_raw=None,
                y_probability_cal=None,
                scaler=StandardScaler().fit(self.X_train),
                X_test=self.X_test,
                y_test=self.y_test,
                class_labels=[0, 1],
                avg_method="binary",
            )

    @unittest.skipUnless(HAS_TORCH, "PyTorch is not installed")
    def test_lstm_full_refit_and_deployment_state_survive_predictor_round_trip(self):
        row_count = 110
        index = pd.RangeIndex(row_count)
        frame = pd.DataFrame(
            {
                "home_form_avg_points": np.linspace(0.0, 2.0, row_count),
                "away_form_avg_points": np.linspace(2.0, 0.0, row_count),
            },
            index=index,
        )
        target = pd.Series(np.arange(row_count) % 2, index=index)
        metadata = {
            "date": pd.Series(
                pd.date_range("2025-01-01", periods=row_count, freq="D")
                .strftime("%Y-%m-%d"),
                index=index,
            ),
            "home_team": pd.Series("Home FC", index=index),
            "away_team": pd.Series("Away FC", index=index),
        }

        deployment_lstm = LSTMPredictor(
            num_classes=2,
            hidden_size=4,
            num_layers=1,
            dropout=0.0,
            epochs=1,
            batch_size=64,
        )
        deployment_lstm.fit_full(frame, target, meta=metadata, epochs=1)

        self.assertTrue(deployment_lstm._fitted)
        self.assertEqual(
            deployment_lstm._training_metadata["mode"],
            "deployment_refit",
        )
        self.assertEqual(deployment_lstm._training_metadata["rows"], row_count)
        self.assertEqual(deployment_lstm._training_metadata["selected_epochs"], 1)

        benchmark_lstm = LSTMPredictor()
        benchmark_lstm.load_state(deployment_lstm.get_state())
        benchmark_lstm._training_metadata = {
            **benchmark_lstm._training_metadata,
            "mode": "benchmark",
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            predictor = UniversalPredictor(temp_dir)
            predictor.models = {
                "btts": {
                    "LSTM": {
                        "model": benchmark_lstm,
                        "deployment_model": deployment_lstm,
                        "scaled": False,
                        "type": "lstm",
                        "accuracy": 0.5,
                        "deployment_metadata": {
                            "status": "refit",
                            "test_excluded": True,
                        },
                    }
                }
            }
            predictor.scalers = {"btts": StandardScaler()}
            predictor.feature_columns_by_target = {
                "btts": list(frame.columns),
            }
            predictor.feature_profiles_by_target = {}
            predictor.feature_sets_by_target = {"btts": "pre_match_safe"}
            predictor.training_stats = {}
            predictor.trained = True

            artifact_path = Path(temp_dir) / "predictor.pkl"
            predictor.save_models(str(artifact_path))

            restored = UniversalPredictor(temp_dir)
            restored.load_models(str(artifact_path))

        restored_data = restored.models["btts"]["LSTM"]
        self.assertTrue(restored_data["model"]._fitted)
        self.assertTrue(restored_data["deployment_model"]._fitted)
        self.assertEqual(
            restored_data["model"]._training_metadata["mode"],
            "benchmark",
        )
        self.assertEqual(
            restored_data["deployment_model"]._training_metadata["mode"],
            "deployment_refit",
        )
        self.assertEqual(
            restored_data["deployment_metadata"]["status"],
            "refit",
        )


if __name__ == "__main__":
    unittest.main()
