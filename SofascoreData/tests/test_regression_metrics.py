import unittest

import numpy as np

from sofascore.predictor import (
    _nonnegative_count_predictions,
    _regression_baseline_metrics,
)


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


if __name__ == "__main__":
    unittest.main()