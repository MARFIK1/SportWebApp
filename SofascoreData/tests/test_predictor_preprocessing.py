import os
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from sofascore.predictor import (
    UniversalPredictor,
    _build_calibration_partition,
    _build_feature_profile,
    _fit_preprocessing_scaler,
    _prepare_prediction_frame,
)
from sofascore.paired_benchmark import ODDS_REQUIREMENTS_BY_TARGET


class PredictorPreprocessingTests(unittest.TestCase):
    def test_temporal_calibration_partition_precedes_holdout(self):
        index = pd.Index(range(600))
        y = pd.Series(np.tile([0, 1, 2], 200), index=index)
        dates = pd.Series(
            pd.date_range("2024-01-01", periods=len(index), freq="D"),
            index=index,
        )

        fit_index, calibration_index, cutoff, reason = _build_calibration_partition(
            y,
            dates=dates,
            num_classes=3,
        )

        self.assertIsNone(reason)
        self.assertIsNotNone(cutoff)
        self.assertTrue(set(fit_index).isdisjoint(calibration_index))
        self.assertEqual(len(fit_index) + len(calibration_index), len(index))
        self.assertLess(dates.loc[fit_index].max(), dates.loc[calibration_index].min())

    def test_scaler_excludes_calibration_rows(self):
        fit_index = list(range(400))
        calibration_index = list(range(400, 600))
        X_train = pd.DataFrame(
            {
                "stable": np.arange(600, dtype=float),
                "future_shift": [1.0] * 400 + [1000.0] * 200,
            }
        )

        scaler = _fit_preprocessing_scaler(X_train, fit_index)

        self.assertAlmostEqual(scaler.mean_[1], 1.0)
        self.assertNotAlmostEqual(scaler.mean_[1], X_train["future_shift"].mean())
        transformed_calibration = scaler.transform(X_train.loc[calibration_index])
        self.assertGreater(float(transformed_calibration[:, 1].mean()), 100.0)

    def test_skips_calibration_when_future_holdout_loses_a_class(self):
        index = pd.Index(range(600))
        y = pd.Series([0, 1] * 295 + [2] * 10, index=index)
        dates = pd.Series(
            pd.date_range("2024-01-01", periods=len(index), freq="D"),
            index=index,
        )

        fit_index, calibration_index, cutoff, reason = _build_calibration_partition(
            y,
            dates=dates,
            num_classes=3,
        )

        self.assertEqual(fit_index, list(index))
        self.assertEqual(calibration_index, [])
        self.assertIsNone(cutoff)
        self.assertEqual(reason, "not all classes exist on both sides")

    def test_prediction_frame_reports_defaulted_features(self):
        frame, quality = _prepare_prediction_frame(
            {
                "valid": "1.5",
                "nan_value": float("nan"),
                "infinite": float("inf"),
            },
            ["valid", "missing", "nan_value", "infinite"],
        )

        self.assertEqual(frame.iloc[0].to_dict(), {
            "valid": 1.5,
            "missing": 0.0,
            "nan_value": 0.0,
            "infinite": 0.0,
        })
        self.assertEqual(quality["status"], "degraded")
        self.assertEqual(quality["coverage_pct"], 25.0)
        self.assertEqual(quality["missing_features"], ["missing"])
        self.assertEqual(quality["invalid_features"], ["nan_value", "infinite"])

    def test_prediction_frame_flags_extreme_feature_drift(self):
        training = pd.DataFrame({"form_points": np.arange(100, dtype=float)})
        profile = _build_feature_profile(training)

        _, quality = _prepare_prediction_frame(
            {"form_points": 1000.0},
            ["form_points"],
            feature_profile=profile,
        )

        self.assertEqual(quality["status"], "complete")
        self.assertEqual(quality["drift_status"], "warning")
        self.assertEqual(quality["drifted_feature_count"], 1)
        self.assertEqual(quality["drifted_features"][0]["feature"], "form_points")
        self.assertGreater(quality["drifted_features"][0]["z_score"], 6.0)

    def test_odds_features_are_scoped_to_matching_target(self):
        frame = pd.DataFrame({
            "date": ["2026-01-01", "2026-01-02"],
            "home_rest_days": [5, 6],
            "label_result_int": [0, 1],
            "label_btts": [1, 0],
            "label_over_1_5": [1, 1],
            "odds_home_win": [2.0, 2.1],
            "odds_draw": [3.0, 3.1],
            "odds_away_win": [4.0, 4.1],
            "odds_home_prob": [0.5, 0.4762],
            "odds_draw_prob": [0.3333, 0.3226],
            "odds_away_prob": [0.25, 0.2439],
            "odds_overround": [1.0833, 1.0427],
            "odds_btts_yes": [1.8, 1.9],
            "odds_btts_no": [2.0, 1.9],
            "odds_btts_prob": [0.5556, 0.5263],
        })
        predictor = UniversalPredictor("data")
        requirements = {
            target: list(columns)
            for target, columns in ODDS_REQUIREMENTS_BY_TARGET.items()
        }

        with patch.dict(os.environ, {"SOFASCORE_FEATURE_SET": "odds_available"}):
            result_x, _, result_meta = predictor.prepare_data(
                frame,
                "result",
                requirements,
            )
            btts_x, _, btts_meta = predictor.prepare_data(
                frame,
                "btts",
                requirements,
            )
            over_x, _, over_meta = predictor.prepare_data(
                frame,
                "over_1_5",
                requirements,
            )

        self.assertIn("odds_home_win", result_x.columns)
        self.assertNotIn("odds_btts_yes", result_x.columns)
        self.assertIn("odds_btts_yes", btts_x.columns)
        self.assertNotIn("odds_home_win", btts_x.columns)
        self.assertFalse(any(column.startswith("odds_") for column in over_x.columns))
        self.assertEqual(result_meta["feature_set_name"], "odds_available")
        self.assertEqual(btts_meta["feature_set_name"], "odds_available")
        self.assertEqual(over_meta["feature_set_name"], "pre_match_safe")

    def test_thesis_core_scope_excludes_experimental_models(self):
        predictor = UniversalPredictor("data")
        configs = predictor._build_model_configs("result")

        scoped = predictor._apply_model_scope(configs, "thesis_core")

        self.assertEqual(set(scoped), {
            "Logistic Regression",
            "Random Forest",
            "MLP",
            "XGBoost",
            "LightGBM",
        })
        self.assertNotIn("KNN", scoped)

    def test_unknown_model_scope_is_rejected(self):
        predictor = UniversalPredictor("data")

        with self.assertRaisesRegex(ValueError, "Unknown model scope"):
            predictor._apply_model_scope({}, "unknown")


if __name__ == "__main__":
    unittest.main()
