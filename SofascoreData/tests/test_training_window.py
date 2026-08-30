import unittest
from datetime import date

import pandas as pd

from sofascore.training_window import (
    filter_dataframe_to_cutoff,
    parse_iso_date,
    validate_training_window,
)


class TrainingWindowTests(unittest.TestCase):
    def test_cutoff_is_inclusive_and_removes_future_rows(self):
        frame = pd.DataFrame({
            "date": [
                "2026-04-01",
                "2026-07-19",
                "2026-07-19T22:30:00Z",
                "2026-07-20",
            ],
            "event_id": [1, 2, 3, 4],
        })

        filtered, metadata = filter_dataframe_to_cutoff(frame, "2026-07-19")

        self.assertEqual(filtered["event_id"].tolist(), [1, 2, 3])
        self.assertEqual(metadata["rows_removed_after_cutoff"], 1)
        self.assertEqual(metadata["date_max"], "2026-07-19")

    def test_cutoff_rejects_invalid_sample_dates(self):
        frame = pd.DataFrame({"date": ["2026-04-01", "invalid"]})

        with self.assertRaisesRegex(ValueError, "invalid rows: 1"):
            filter_dataframe_to_cutoff(frame, "2026-07-19")

    def test_validates_window_order(self):
        with self.assertRaisesRegex(ValueError, "must not be later"):
            validate_training_window("2026-07-19", "2026-07-20")

    def test_parses_strict_iso_date(self):
        self.assertEqual(parse_iso_date("2026-07-19"), date(2026, 7, 19))
        with self.assertRaisesRegex(ValueError, "YYYY-MM-DD"):
            parse_iso_date("19.07.2026")


if __name__ == "__main__":
    unittest.main()
