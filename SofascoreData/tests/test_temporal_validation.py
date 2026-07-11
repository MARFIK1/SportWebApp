import unittest

import pandas as pd

from sofascore.temporal_validation import build_temporal_holdout


class TemporalValidationTests(unittest.TestCase):
    def test_keeps_identical_kickoff_dates_on_one_side(self):
        dates = pd.Series(
            [
                "2026-01-01",
                "2026-01-02",
                "2026-01-03",
                "2026-01-03",
                "2026-01-04",
                "2026-01-05",
            ],
            index=[10, 11, 12, 13, 14, 15],
        )

        split = build_temporal_holdout(
            dates,
            holdout_fraction=0.34,
            min_train_rows=2,
            min_holdout_rows=2,
        )

        train_dates = pd.to_datetime(dates.loc[split.train_index], utc=True)
        holdout_dates = pd.to_datetime(dates.loc[split.holdout_index], utc=True)
        self.assertLess(train_dates.max(), holdout_dates.min())
        self.assertTrue(set(split.train_index).isdisjoint(split.holdout_index))

    def test_rejects_invalid_dates(self):
        dates = pd.Series(["2026-01-01", "invalid", "2026-01-03", "2026-01-04"])

        with self.assertRaisesRegex(ValueError, "invalid rows: 1"):
            build_temporal_holdout(
                dates,
                holdout_fraction=0.25,
                min_train_rows=2,
                min_holdout_rows=1,
            )

    def test_rejects_split_without_enough_rows(self):
        dates = pd.Series(["2026-01-01", "2026-01-02", "2026-01-03"])

        with self.assertRaisesRegex(ValueError, "not enough rows"):
            build_temporal_holdout(
                dates,
                holdout_fraction=0.25,
                min_train_rows=3,
                min_holdout_rows=2,
            )


if __name__ == "__main__":
    unittest.main()
