import unittest

import pandas as pd

from sofascore.temporal_validation import (
    build_temporal_holdout,
    build_temporal_holdout_from_cutoff,
)


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

    def test_builds_fixed_holdout_from_requested_date(self):
        dates = pd.Series(
            [
                "2026-03-30",
                "2026-03-31",
                "2026-04-01",
                "2026-04-01",
                "2026-07-19",
            ],
            index=[10, 11, 12, 13, 14],
        )

        split = build_temporal_holdout_from_cutoff(
            dates,
            cutoff="2026-04-01",
            min_train_rows=2,
            min_holdout_rows=3,
        )

        self.assertEqual(split.train_index, [10, 11])
        self.assertEqual(split.holdout_index, [12, 13, 14])
        self.assertEqual(split.cutoff.date().isoformat(), "2026-04-01")

    def test_fixed_holdout_rejects_insufficient_test_window(self):
        dates = pd.Series(["2026-03-30", "2026-03-31", "2026-04-01"])

        with self.assertRaisesRegex(ValueError, "does not contain enough rows"):
            build_temporal_holdout_from_cutoff(
                dates,
                cutoff="2026-04-01",
                min_train_rows=2,
                min_holdout_rows=2,
            )


if __name__ == "__main__":
    unittest.main()
