import json
import tempfile
import unittest
from pathlib import Path

from sofascore.managers import FootballDataManager
from sofascore.season_archive import sync_scheduled_matches_to_season_archives


class SeasonArchiveTests(unittest.TestCase):
    def _write_json(self, path: Path, payload) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")

    def test_syncs_real_scheduled_seasons_without_mixing_or_duplicates(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = FootballDataManager(temp_dir, "league", "poland", "ekstraklasa")
            raw_dir = Path(manager.paths["raw"])
            upcoming_dir = raw_dir / "upcoming"
            old_match = {
                "event_id": 1,
                "date": "2026-05-20",
                "season": "Ekstraklasa 25/26",
                "status": "finished",
                "home_score": 1,
                "away_score": 0,
            }
            self._write_json(raw_dir / "all_seasons.json", {
                "metadata": {"seasons": ["Ekstraklasa 25/26"]},
                "matches": [old_match],
            })
            self._write_json(upcoming_dir / "upcoming_scheduled_2026-07-24.json", {
                "metadata": {"season": "Scheduled 2026-07-24"},
                "matches": [{
                    "event_id": 2,
                    "date": "2026-07-24",
                    "season": "Ekstraklasa 26/27",
                    "status": "notstarted",
                    "home_score": None,
                    "away_score": None,
                    "match_events_collected": True,
                    "match_lineups_checked": True,
                }],
            })
            self._write_json(upcoming_dir / "upcoming_scheduled_2026-07-25.json", {
                "metadata": {"season": "Scheduled 2026-07-25"},
                "matches": [
                    {
                        "event_id": 2,
                        "date": "2026-07-24",
                        "season": "Ekstraklasa 26/27",
                        "status": "finished",
                        "home_score": 2,
                        "away_score": 1,
                        "match_events_collected": False,
                        "match_lineups_checked": False,
                    },
                    {
                        "event_id": 3,
                        "date": "2026-07-25",
                        "season": "Ekstraklasa 26/27",
                        "status": "notstarted",
                        "home_score": None,
                        "away_score": None,
                    },
                    {
                        "event_id": 4,
                        "date": "2026-07-25",
                        "season": "Scheduled 2026-07-25",
                        "status": "notstarted",
                    },
                ],
            })

            first = sync_scheduled_matches_to_season_archives(manager)
            second = sync_scheduled_matches_to_season_archives(manager)

            season_path = raw_dir / "ekstraklasa_26_27.json"
            season_data = json.loads(season_path.read_text(encoding="utf-8"))
            all_seasons = json.loads((raw_dir / "all_seasons.json").read_text(encoding="utf-8"))
            season_by_id = {match["event_id"]: match for match in season_data["matches"]}
            all_by_id = {match["event_id"]: match for match in all_seasons["matches"]}

            self.assertEqual(first["seasons"], 1)
            self.assertEqual(first["scheduled_matches"], 2)
            self.assertEqual(second["all_matches"], 3)
            self.assertEqual(set(season_by_id), {2, 3})
            self.assertEqual(set(all_by_id), {1, 2, 3})
            self.assertEqual(season_by_id[2]["status"], "finished")
            self.assertEqual(season_by_id[2]["home_score"], 2)
            self.assertTrue(season_by_id[2]["match_events_collected"])
            self.assertTrue(season_by_id[2]["match_lineups_checked"])
            self.assertTrue(all_by_id[2]["match_events_collected"])
            self.assertTrue(all_by_id[2]["match_lineups_checked"])
            self.assertEqual(
                all_seasons["metadata"]["seasons"],
                ["Ekstraklasa 25/26", "Ekstraklasa 26/27"],
            )


if __name__ == "__main__":
    unittest.main()
