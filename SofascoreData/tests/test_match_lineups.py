import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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

    def test_prefers_official_player_marker_over_highest_rating(self):
        payload = {
            "confirmed": True,
            "home": {
                "players": [
                    {
                        "player": {"id": 1, "name": "Official Player"},
                        "statistics": {"rating": 7.4, "isPlayerOfTheMatch": True},
                    }
                ],
            },
            "away": {
                "players": [
                    {
                        "player": {"id": 2, "name": "Higher Rated Player"},
                        "statistics": {"rating": 8.8},
                    }
                ],
            },
        }

        result = normalize_match_lineups(payload)

        self.assertEqual(result["player_of_the_match"]["name"], "Official Player")
        self.assertEqual(result["player_of_the_match"]["team_side"], "home")
        self.assertEqual(result["player_of_the_match"]["selection_method"], "official")
        self.assertEqual(result["top_rated_player"]["name"], "Higher Rated Player")

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

    def test_provisional_lineups_remain_retryable_until_confirmed(self):
        match = {}
        payload = {
            "confirmed": False,
            "home": {"players": [{"player": {"id": 1, "name": "Home Player"}}]},
            "away": {"players": [{"player": {"id": 2, "name": "Away Player"}}]},
        }

        self.assertTrue(predict_today._apply_match_lineups(match, payload, final=False))
        self.assertTrue(match["match_lineups_collected"])
        self.assertNotIn("match_lineups_checked", match)

    def test_finished_match_prioritizes_lineups_before_other_details(self):
        class FakeScraper:
            def __init__(self):
                self.calls = []

            def get_match_lineups(self, _event_id):
                self.calls.append("lineups")
                return {
                    "confirmed": True,
                    "home": {"players": [{"player": {"id": 1, "name": "Home Player"}}]},
                    "away": {"players": [{"player": {"id": 2, "name": "Away Player"}}]},
                }

            def get_match_statistics(self, _event_id):
                self.calls.append("statistics")
                return []

            def get_match_incidents(self, _event_id):
                self.calls.append("incidents")
                return []

        scraper = FakeScraper()
        with patch("predict_today.time.sleep"):
            predict_today._refresh_match_details(scraper, {}, 99, final=True)

        self.assertEqual(scraper.calls, ["lineups", "statistics", "incidents"])

    def test_finished_match_only_fetches_missing_lineups(self):
        class FakeScraper:
            def __init__(self):
                self.calls = []

            def get_match_statistics(self, _event_id):
                self.calls.append("statistics")
                return []

            def get_match_incidents(self, _event_id):
                self.calls.append("incidents")
                return []

            def get_match_lineups(self, _event_id):
                self.calls.append("lineups")
                return {
                    "confirmed": True,
                    "home": {"players": [{"player": {"id": 1, "name": "Home Player"}}]},
                    "away": {"players": [{"player": {"id": 2, "name": "Away Player"}}]},
                }

        scraper = FakeScraper()
        match = {
            "match_statistics_checked": True,
            "match_events_collected": True,
        }

        with patch("predict_today.time.sleep"):
            changed = predict_today._refresh_match_details(
                scraper,
                match,
                99,
                final=True,
            )

        self.assertTrue(changed)
        self.assertEqual(scraper.calls, ["lineups"])
        self.assertTrue(match["match_lineups_checked"])


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
                        "player_of_the_match": {
                            "id": 1,
                            "name": "Home Player",
                            "team_side": "home",
                            "selection_method": "official",
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
                self.assertEqual(
                    loaded["matches"][0]["match_lineups"]["player_of_the_match"]["name"],
                    "Home Player",
                )
        finally:
            predict_today.REPORTS_DIR = original_reports_dir


if __name__ == "__main__":
    unittest.main()
