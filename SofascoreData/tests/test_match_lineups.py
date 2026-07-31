import json
import tempfile
import unittest
from pathlib import Path

import predict_today
from sofascore.lineups import normalize_match_lineups


class MatchLineupNormalizationTests(unittest.TestCase):
    def test_normalizes_teams_and_selects_top_rated_player(self):
        payload = {
            "confirmed": True,
            "home": {
                "formation": "4-2-3-1",
                "players": [
                    {
                        "player": {"id": 1, "name": "Home Captain", "shortName": "H. Captain"},
                        "position": "G",
                        "jerseyNumber": "1",
                        "captain": True,
                        "statistics": {"rating": 7.2},
                    },
                    {
                        "player": {"id": 2, "name": "Home Substitute"},
                        "position": "M",
                        "jerseyNumber": "18",
                        "substitute": True,
                        "statistics": {"rating": 6.4},
                    },
                ],
            },
            "away": {
                "formation": "4-3-3",
                "players": [
                    {
                        "player": {"id": 3, "name": "Away Star", "shortName": "A. Star"},
                        "position": "F",
                        "jerseyNumber": "9",
                        "statistics": {"rating": "8.6"},
                    }
                ],
            },
        }

        result = normalize_match_lineups(payload)

        self.assertTrue(result["confirmed"])
        self.assertEqual(result["home"]["formation"], "4-2-3-1")
        self.assertEqual(result["home"]["starters"][0]["jersey_number"], "1")
        self.assertTrue(result["home"]["starters"][0]["captain"])
        self.assertEqual(result["home"]["substitutes"][0]["name"], "Home Substitute")
        self.assertEqual(result["top_rated_player"]["name"], "Away Star")
        self.assertEqual(result["top_rated_player"]["team_side"], "away")
        self.assertEqual(result["top_rated_player"]["rating"], 8.6)

    def test_rejects_payload_without_starters(self):
        self.assertIsNone(normalize_match_lineups({"confirmed": False, "home": {}, "away": {}}))

    def test_empty_final_response_marks_lineups_as_checked(self):
        match = {}
        self.assertTrue(predict_today._apply_match_lineups(match, {}, final=True))
        self.assertTrue(match["match_lineups_checked"])
        self.assertNotIn("match_lineups", match)

    def test_empty_live_response_remains_retryable(self):
        match = {}
        self.assertFalse(predict_today._apply_match_lineups(match, {}, final=False))
        self.assertNotIn("match_lineups_checked", match)


class MatchLineupSidecarTests(unittest.TestCase):
    def test_save_report_separates_lineups_and_load_restores_them(self):
        report = {
            "date": "2026-07-27",
            "status": "finished",
            "updated_at": "2026-07-28 00:10:00",
            "matches": [
                {
                    "event_id": 16316950,
                    "home_team": "Zaglebie Lubin",
                    "away_team": "Piast Gliwice",
                    "status": "finished",
                    "match_lineups": {
                        "confirmed": True,
                        "home": {
                            "formation": "4-2-3-1",
                            "starters": [{"id": 1, "name": "Home Player"}],
                            "substitutes": [],
                        },
                        "away": {
                            "formation": "4-3-3",
                            "starters": [{"id": 2, "name": "Away Player"}],
                            "substitutes": [],
                        },
                    },
                    "match_lineups_collected": True,
                    "match_lineups_checked": True,
                }
            ],
        }

        original_reports_dir = predict_today.REPORTS_DIR
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                predict_today.REPORTS_DIR = Path(temp_dir)
                report_path = predict_today.save_report(report, report["date"])
                stored_report = json.loads(report_path.read_text(encoding="utf-8"))
                sidecar_path = report_path.parent / predict_today.MATCH_LINEUPS_FILENAME
                sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))

                self.assertNotIn("match_lineups", stored_report["matches"][0])
                self.assertEqual(sidecar["schema_version"], 1)
                self.assertEqual(
                    sidecar["matches"]["16316950"]["home"]["formation"],
                    "4-2-3-1",
                )

                loaded = predict_today.load_existing_report(report["date"])
                self.assertEqual(
                    loaded["matches"][0]["match_lineups"]["away"]["starters"][0]["name"],
                    "Away Player",
                )
        finally:
            predict_today.REPORTS_DIR = original_reports_dir


if __name__ == "__main__":
    unittest.main()
