import json
import tempfile
import unittest
from pathlib import Path

from sofascore.hyperparameter_profile import (
    build_hyperparameter_profile,
    load_hyperparameter_profile,
    write_hyperparameter_profile,
)


class HyperparameterProfileTests(unittest.TestCase):
    def test_build_write_and_load_round_trip(self):
        training_stats = {
            "result": {
                "hyperparameters": {
                    "policy": "optuna_pre_holdout",
                    "optuna_trials": 10,
                    "optuna_seed": 42,
                    "xgboost": {"max_depth": 6, "learning_rate": 0.03},
                    "lightgbm": {"max_depth": 10, "reg_alpha": 0.2},
                },
            },
            "total_goals": {"selection": {"metric": "mae"}},
        }
        profile = build_hyperparameter_profile(
            training_stats,
            source={"variant": "without_odds"},
        )

        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "hyperparameters.json"
            write_hyperparameter_profile(profile, path)
            loaded = load_hyperparameter_profile(path)

        self.assertEqual(loaded["schema_version"], 1)
        self.assertEqual(loaded["source"]["variant"], "without_odds")
        self.assertEqual(loaded["targets"]["result"]["xgboost"]["max_depth"], 6)
        self.assertNotIn("total_goals", loaded["targets"])

    def test_empty_parameter_maps_preserve_default_tree_profile(self):
        profile = build_hyperparameter_profile(
            {
                "btts": {
                    "hyperparameters": {
                        "xgboost": {},
                        "lightgbm": {},
                    },
                },
            },
            source={"variant": "without_odds"},
        )

        self.assertEqual(profile["targets"]["btts"]["xgboost"], {})
        self.assertEqual(profile["targets"]["btts"]["lightgbm"], {})

    def test_rejects_unknown_estimator_parameter(self):
        payload = {
            "schema_version": 1,
            "targets": {
                "result": {
                    "xgboost": {"future_only_parameter": 1},
                    "lightgbm": {},
                },
            },
        }
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "invalid.json"
            path.write_text(json.dumps(payload), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "unsupported hyperparameters"):
                load_hyperparameter_profile(path)


if __name__ == "__main__":
    unittest.main()
