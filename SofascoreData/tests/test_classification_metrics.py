import unittest

import numpy as np

from sofascore.predictor import _classification_eval_metrics


class ClassificationMetricTests(unittest.TestCase):
    def test_reports_draw_aware_metrics_and_standard_multiclass_brier(self):
        y_true = np.array([0, 1, 2])
        y_pred = np.array([0, 0, 2])
        probabilities = np.array(
            [
                [0.8, 0.1, 0.1],
                [0.6, 0.3, 0.1],
                [0.1, 0.2, 0.7],
            ]
        )

        metrics = _classification_eval_metrics(
            y_true,
            y_pred,
            probabilities,
            class_labels=[0, 1, 2],
        )

        one_hot = np.eye(3)[y_true]
        expected_brier = float(np.mean(np.sum((probabilities - one_hot) ** 2, axis=1)))
        self.assertAlmostEqual(metrics["brier_score"], expected_brier, places=4)
        self.assertEqual(metrics["balanced_accuracy"], 0.6667)
        self.assertIn("macro_f1", metrics)
        self.assertEqual(metrics["per_class_recall"]["1"], 0.0)


if __name__ == "__main__":
    unittest.main()
