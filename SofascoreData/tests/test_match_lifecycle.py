import json
import os
import tempfile
import unittest

from sofascore.utils import get_existing_event_ids, merge_and_sort_matches


def match(status, home_score=None, away_score=None, **extra):
    return {
        "event_id": 123,
        "date": "2026-08-24",
        "round": 1,
        "home_team": "A",
        "away_team": "B",
        "status": status,
        "home_score": home_score,
        "away_score": away_score,
        **extra,
    }


class MatchLifecycleTests(unittest.TestCase):
    def test_live_snapshot_cannot_replace_finished_result(self):
        finished = match("finished", 2, 1)
        live = match("inprogress", 3, 1)

        merged = merge_and_sort_matches([finished], [live])

        self.assertEqual(merged[0]["status"], "finished")
        self.assertEqual((merged[0]["home_score"], merged[0]["away_score"]), (2, 1))

    def test_finished_result_replaces_live_snapshot(self):
        live = match("inprogress", 1, 0)
        finished = match("finished", 1, 2)

        merged = merge_and_sort_matches([live], [finished])

        self.assertEqual(merged[0]["status"], "finished")
        self.assertEqual((merged[0]["home_score"], merged[0]["away_score"]), (1, 2))

    def test_incomplete_finished_snapshot_does_not_inherit_live_score(self):
        finished = match("finished")
        live = match("inprogress", 1, 0)

        merged = merge_and_sort_matches([finished], [live])

        self.assertEqual(merged[0]["status"], "finished")
        self.assertIsNone(merged[0]["home_score"])
        self.assertIsNone(merged[0]["away_score"])

    def test_scored_live_event_is_not_cached_as_finished(self):
        with tempfile.TemporaryDirectory() as raw_dir:
            filepath = os.path.join(raw_dir, "26_27.json")
            with open(filepath, "w", encoding="utf-8") as handle:
                json.dump({"matches": [match("inprogress", 1, 0)]}, handle)

            class DataManager:
                paths = {"raw": raw_dir}

                @staticmethod
                def _season_slug(_season_name):
                    return "26_27"

            finished_ids, postponed_ids = get_existing_event_ids(DataManager(), "26/27")

        self.assertEqual(finished_ids, set())
        self.assertEqual(postponed_ids, set())


if __name__ == "__main__":
    unittest.main()
