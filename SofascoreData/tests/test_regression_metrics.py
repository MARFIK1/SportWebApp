import unittest

import numpy as np
import pandas as pd
from sklearn.dummy import DummyRegressor
from sklearn.preprocessing import StandardScaler

from sofascore.predictor import (
    _nonnegative_count_predictions,
    _regression_baseline_metrics,
    UniversalPredictor,
)


class FixedRegressor:
    def __init__(self, prediction):
        self.prediction = prediction

    def predict(self, values):
        return np.full(len(values), self.prediction)


class RegressionMetricTests(unittest.TestCase):
    def test_clips_negative_count_predictions(self):
        predictions = _nonnegative_count_predictions([-1.25, 0.0, 2.5])

        np.testing.assert_allclose(predictions, [0.0, 0.0, 2.5])

    def test_regression_baseline_uses_training_median(self):
        baseline = _regression_baseline_metrics(
            np.array([0.0, 2.0, 4.0]),
            np.array([0.0, 4.0]),
        )

        self.assertEqual(baseline["prediction"], 2.0)
        self.assertEqual(baseline["metrics"]["mae"], 2.0)
        self.assertEqual(baseline["metrics"]["rmse"], 2.0)

    def test_regression_consensus_uses_selected_temporal_mae_model(self):
        predictor = UniversalPredictor(".")
        predictor.trained = True
        predictor.models = {
            "total_cards": {
                "Best": {
                    "model": FixedRegressor(3.0),
                    "scaled": False,
                    "task": "regression",
                },
                "Other": {
                    "model": FixedRegressor(9.0),
                    "scaled": False,
                    "task": "regression",
                },
            }
        }
        predictor.scalers = {"total_cards": StandardScaler()}
        predictor.feature_columns_by_target = {"total_cards": ["feature"]}
        predictor.training_stats = {
            "total_cards": {"selection": {"best_model": "Best"}}
        }

        predictions = predictor.predict_match_all_models(
            {"feature": 1.0},
            "total_cards",
        )

        self.assertEqual(predictions["consensus"]["prediction"], 3.0)
        self.assertEqual(predictions["consensus"]["model"], "Best")
        self.assertEqual(predictions["consensus"]["strategy"], "best_temporal_mae")
        self.assertEqual(predictions["consensus"]["input_quality"]["status"], "complete")

    def test_regression_training_stores_model_without_prediction_input_metadata(self):
        predictor = UniversalPredictor(".")
        predictor._build_regression_configs = lambda: {
            "Dummy": {
                "model": DummyRegressor(strategy="median"),
                "scaled": False,
            }
        }
        predictor.feature_sets_by_target = {"total_goals": "lineup_available"}

        X_train = pd.DataFrame({"feature": [0.0, 1.0, 2.0, 3.0]})
        X_test = pd.DataFrame({"feature": [4.0, 5.0]}, index=[4, 5])
        X = pd.concat([X_train, X_test])

        results = predictor._train_regression_models(
            "total_goals",
            {},
            X_train,
            X_test,
            X_train,
            X_test,
            np.array([0.0, 1.0, 2.0, 3.0]),
            np.array([4.0, 5.0]),
            ["feature"],
            StandardScaler(),
            X,
            None,
            pd.DataFrame(),
            "global_temporal",
            None,
        )

        self.assertIn("Dummy", results)
        self.assertEqual(
            predictor.models["total_goals"]["Dummy"]["task"],
            "regression",
        )


if __name__ == "__main__":
    unittest.main()
