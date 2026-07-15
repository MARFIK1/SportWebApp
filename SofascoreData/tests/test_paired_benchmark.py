import unittest

import numpy as np
import pandas as pd

from sofascore.predictor import _classification_calibration_bins
from sofascore.paired_benchmark import build_common_odds_sample


class PairedBenchmarkTests(unittest.TestCase):
    def test_common_sample_keeps_only_complete_positive_base_odds(self):
        dataframe = pd.DataFrame({
            "event_id": [1, 2, 3],
            "date": ["2026-01-01", "2026-01-02", "2026-01-03"],
            "label_result_int": [0, 1, 2],
            "odds_home_win": [2.0, None, 1.8],
            "odds_draw": [3.0, 3.1, 0.0],
            "odds_away_win": [4.0, 2.4, 4.5],
        })

        filtered, metadata = build_common_odds_sample(dataframe)

        self.assertEqual(filtered["event_id"].tolist(), [1])
        self.assertEqual(metadata["rows_before"], 3)
        self.assertEqual(metadata["rows"], 1)
        self.assertEqual(metadata["rows_removed"], 2)
        self.assertEqual(len(metadata["sample_hash"]), 64)

    def test_common_sample_hash_is_stable_for_identical_rows(self):
        dataframe = pd.DataFrame({
            "event_id": [1, 2],
            "date": ["2026-01-01", "2026-01-02"],
            "label_result_int": [0, 2],
            "odds_home_win": [2.0, 1.8],
            "odds_draw": [3.0, 3.2],
            "odds_away_win": [4.0, 4.5],
        })

        _, first = build_common_odds_sample(dataframe)
        _, second = build_common_odds_sample(dataframe.copy())

        self.assertEqual(first["sample_hash"], second["sample_hash"])

    def test_calibration_bins_preserve_all_test_rows(self):
        y_true = np.array([0, 1, 2, 0])
        probabilities = np.array([
            [0.8, 0.1, 0.1],
            [0.2, 0.5, 0.3],
            [0.1, 0.2, 0.7],
            [0.4, 0.3, 0.3],
        ])

        bins = _classification_calibration_bins(
            y_true,
            probabilities,
            [0, 1, 2],
            n_bins=5,
        )

        self.assertEqual(sum(row["count"] for row in bins["top_label"]), 4)
        for rows in bins["per_class"].values():
            self.assertEqual(sum(row["count"] for row in rows), 4)


if __name__ == "__main__":
    unittest.main()
