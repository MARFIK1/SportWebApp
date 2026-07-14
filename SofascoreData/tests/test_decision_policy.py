import tempfile
import unittest
from pathlib import Path

import numpy as np
from sklearn.metrics import f1_score

from sofascore.decision_policy import (
    apply_decision_policy,
    fit_binary_decision_policy,
    fit_result_decision_policy,
    weighted_average_probabilities,
)
from sofascore.predictor import UniversalPredictor


class DecisionPolicyTests(unittest.TestCase):
    def test_policy_improves_draw_aware_decision_without_mutating_probabilities(self):
        probabilities = np.array(
            [
                [0.60, 0.25, 0.15],
                [0.58, 0.27, 0.15],
                [0.40, 0.35, 0.25],
                [0.39, 0.36, 0.25],
                [0.20, 0.25, 0.55],
                [0.18, 0.27, 0.55],
            ]
        )
        original = probabilities.copy()
        y_true = np.array([0, 0, 1, 1, 2, 2])
        baseline = apply_decision_policy(probabilities, None, [0, 1, 2])

        policy = fit_result_decision_policy(
            y_true,
            probabilities,
            max_accuracy_drop=0.50,
        )
        tuned = apply_decision_policy(probabilities, policy, [0, 1, 2])

        self.assertGreater(
            f1_score(y_true, tuned, average="macro"),
            f1_score(y_true, baseline, average="macro"),
        )
        self.assertGreater(policy["log_offsets"][1], 0)
        np.testing.assert_array_equal(probabilities, original)

    def test_policy_respects_accuracy_floor(self):
        probabilities = np.array(
            [
                [0.70, 0.20, 0.10],
                [0.60, 0.30, 0.10],
                [0.40, 0.35, 0.25],
                [0.20, 0.30, 0.50],
            ]
        )
        y_true = np.array([0, 0, 1, 2])

        policy = fit_result_decision_policy(
            y_true,
            probabilities,
            max_accuracy_drop=0.0,
        )

        self.assertGreaterEqual(
            policy["tuned_metrics"]["accuracy"],
            policy["baseline_metrics"]["accuracy"],
        )

    def test_binary_policy_recovers_both_classes_from_majority_argmax(self):
        probabilities = np.array(
            [
                [0.46, 0.54],
                [0.45, 0.55],
                [0.35, 0.65],
                [0.20, 0.80],
            ]
        )
        y_true = np.array([0, 0, 1, 1])
        baseline = apply_decision_policy(probabilities, None, [0, 1])

        policy = fit_binary_decision_policy(
            y_true,
            probabilities,
            max_accuracy_drop=0.50,
        )
        tuned = apply_decision_policy(probabilities, policy, [0, 1])

        self.assertGreater(
            f1_score(y_true, tuned, average="macro"),
            f1_score(y_true, baseline, average="macro"),
        )
        self.assertLess(policy["log_offsets"][1], 0)
        self.assertEqual(policy["type"], "binary_log_offset")

    def test_weighted_average_uses_only_configured_models(self):
        probabilities = {
            "A": np.array([[0.70, 0.20, 0.10]]),
            "B": np.array([[0.10, 0.20, 0.70]]),
            "Ignored": np.array([[0.00, 1.00, 0.00]]),
        }

        averaged = weighted_average_probabilities(
            probabilities,
            {"A": 3.0, "B": 1.0},
        )

        np.testing.assert_allclose(averaged, [[0.55, 0.20, 0.25]])

    def test_predictor_applies_policy_to_weighted_consensus(self):
        predictor = UniversalPredictor(".")
        model_names = [
            "LightGBM",
            "XGBoost",
            "Logistic Regression",
            "Random Forest",
        ]
        predictor.models = {
            "result": {name: {} for name in model_names}
        }
        predictor.feature_sets_by_target = {"result": "pre_match_safe"}
        predictor.decision_policies = {
            "result": {
                "class_labels": [0, 1, 2],
                "log_offsets": [0.0, 0.30, 0.0],
            }
        }
        predictor.trained = True
        model_prediction = {
            "prediction": "HOME",
            "prediction_int": 0,
            "probabilities": {"HOME": 40.0, "DRAW": 35.0, "AWAY": 25.0},
        }
        predictor.predict_match = lambda _features, _name, _target: dict(model_prediction)

        predictions = predictor.predict_match_all_models({}, "result")
        consensus = predictions["consensus"]

        self.assertEqual(consensus["prediction"], "DRAW")
        self.assertTrue(consensus["decision_policy_applied"])
        self.assertEqual(
            consensus["avg_probabilities"],
            model_prediction["probabilities"],
        )

    def test_predictor_persists_consensus_decision_policy(self):
        policy = {
            "class_labels": [0, 1, 2],
            "log_offsets": [0.0, 0.30, 0.0],
        }
        with tempfile.TemporaryDirectory() as temporary:
            artifact = Path(temporary) / "models.pkl"
            predictor = UniversalPredictor(temporary)
            predictor.models = {"result": {}}
            predictor.decision_policies = {"result": policy}
            predictor.trained = True
            predictor.save_models(str(artifact))

            loaded = UniversalPredictor(temporary)
            loaded.load_models(str(artifact))

        self.assertEqual(
            loaded.decision_policies["result"],
            policy,
        )


if __name__ == "__main__":
    unittest.main()

