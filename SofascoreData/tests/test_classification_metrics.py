import unittest

import numpy as np

from sofascore.predictor import (
    _align_predict_proba,
    _classification_baseline_metrics,
    _classification_eval_metrics,
    _select_best_classification_model,
    UniversalPredictor,
)


class ProbabilityModel:
    classes_ = np.array([0, 1, 2])

    def predict_proba(self, _features):
        return np.array([
            [0.6, 0.3, 0.099999],
            [0.0, 0.0, 0.0],
        ])


class ClassificationMetricTests(unittest.TestCase):
    def test_align_predict_proba_returns_normalized_rows(self):
        probabilities = _align_predict_proba(
            ProbabilityModel(),
            np.zeros((2, 1)),
            class_labels=[0, 1, 2],
        )

        np.testing.assert_allclose(probabilities.sum(axis=1), np.ones(2))
        np.testing.assert_allclose(probabilities[1], np.full(3, 1 / 3))

    def test_result_selection_prefers_macro_f1_over_accuracy(self):
        best, metric, score = _select_best_classification_model(
            "result",
            {
                "Accuracy Model": {"accuracy": 0.52, "macro_f1": 0.38},
                "Balanced Model": {"accuracy": 0.46, "macro_f1": 0.45},
            },
        )

        self.assertEqual(best, "Balanced Model")
        self.assertEqual(metric, "macro_f1")
        self.assertEqual(score, 0.45)

    def test_binary_selection_prefers_macro_f1_over_majority_accuracy(self):
        best, metric, score = _select_best_classification_model(
            "over_1_5",
            {
                "Majority Model": {"accuracy": 0.77, "macro_f1": 0.44},
                "Balanced Model": {"accuracy": 0.65, "macro_f1": 0.62},
            },
        )

        self.assertEqual(best, "Balanced Model")
        self.assertEqual(metric, "macro_f1")
        self.assertEqual(score, 0.62)

    def test_classification_baseline_uses_training_majority(self):
        baseline = _classification_baseline_metrics(
            np.array([1, 1, 1, 0]),
            np.array([0, 0, 1, 1]),
            [0, 1],
        )

        self.assertEqual(baseline["predicted_class"], 1)
        self.assertEqual(baseline["class_probabilities"], {"0": 0.25, "1": 0.75})
        self.assertEqual(baseline["metrics"]["accuracy"], 0.5)
        self.assertEqual(baseline["metrics"]["macro_f1"], 0.3333)

    def test_result_lightgbm_uses_balanced_sample_weights(self):
        configs = UniversalPredictor(".")._build_model_configs("result")
        lightgbm = configs["LightGBM"]

        self.assertTrue(lightgbm["sample_weight"])
        self.assertNotIn("is_unbalance", lightgbm["model"].get_params())

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
