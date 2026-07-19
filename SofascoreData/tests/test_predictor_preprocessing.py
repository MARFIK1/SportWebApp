import unittest

import numpy as np
import pandas as pd

from sofascore.predictor import (
    _build_calibration_partition,
    _build_feature_profile,
    _fit_preprocessing_scaler,
    _prepare_prediction_frame,
)


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


if __name__ == "__main__":
    unittest.main()