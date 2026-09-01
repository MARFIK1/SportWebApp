import unittest

from sofascore.predictor import _create_optuna_study


class OptunaReproducibilityTests(unittest.TestCase):
    @staticmethod
    def _run_study(seed):
        study = _create_optuna_study(seed)

        def objective(trial):
            depth = trial.suggest_int("depth", 2, 8)
            learning_rate = trial.suggest_float(
                "learning_rate",
                0.01,
                0.1,
                log=True,
            )
            return depth * learning_rate

        study.optimize(objective, n_trials=12)
        return [trial.params for trial in study.trials]

    def test_same_seed_repeats_optuna_trial_sequence(self):
        self.assertEqual(self._run_study(42), self._run_study(42))


if __name__ == "__main__":
    unittest.main()
