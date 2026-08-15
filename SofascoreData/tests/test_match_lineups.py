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

    def test_prematch_lineup_refresh_uses_bounded_kickoff_window(self):
        now_timestamp = 1_800_000_000
        window_seconds = predict_today.PREMATCH_LINEUP_WINDOW_MINUTES * 60
        match = {}

        cases = [
            ("window_start", now_timestamp + window_seconds, "notstarted", True),
            ("inside_window", now_timestamp + 30 * 60, "notstarted", True),
            ("kickoff", now_timestamp, "notstarted", True),
            ("too_early", now_timestamp + window_seconds + 1, "notstarted", False),
            ("after_kickoff", now_timestamp - 1, "notstarted", False),
            ("live", now_timestamp + 30 * 60, "inprogress", False),
            ("finished", now_timestamp + 30 * 60, "finished", False),
        ]

        for name, kickoff_timestamp, status, expected in cases:
            with self.subTest(name=name):
                self.assertEqual(
                    predict_today._should_refresh_prematch_lineups(
                        match,
                        {"startTimestamp": kickoff_timestamp},
                        status,
                        now_timestamp=now_timestamp,
                    ),
                    expected,
                )

    def test_prematch_lineup_refresh_skips_checked_or_invalid_matches(self):
        now_timestamp = 1_800_000_000
        api_match = {"startTimestamp": now_timestamp + 30 * 60}

        self.assertFalse(
            predict_today._should_refresh_prematch_lineups(
                {"match_lineups_checked": True},
                api_match,
                "notstarted",
                now_timestamp=now_timestamp,
            )
        )
        self.assertFalse(
            predict_today._should_refresh_prematch_lineups(
                {},
                {"startTimestamp": "invalid"},
                "notstarted",
                now_timestamp=now_timestamp,
            )
        )

    def test_prematch_detail_limit_fetches_only_lineups(self):
        class FakeScraper:
            api_budget_exhausted = False

            def __init__(self):
                self.calls = []

            def get_match_lineups(self, _event_id):
                self.calls.append("lineups")
                return {
                    "confirmed": True,
                    "home": {"players": [{"player": {"id": 1, "name": "Home Player"}}]},
                    "away": {"players": [{"player": {"id": 2, "name": "Away Player"}}]},
                }

            def get_match_incidents(self, _event_id):
                self.calls.append("incidents")
                return []

            def get_match_statistics(self, _event_id):
                self.calls.append("statistics")
                return []

        scraper = FakeScraper()
        match = {}

        with patch("predict_today.time.sleep"):
            changed = predict_today._refresh_match_details(
                scraper,
                match,
                99,
                final=False,
                max_requests=1,
            )

        self.assertTrue(changed)
        self.assertEqual(scraper.calls, ["lineups"])
        self.assertTrue(match["match_lineups_checked"])

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

        self.assertEqual(scraper.calls, ["lineups", "incidents", "statistics"])

    def test_finished_match_details_resume_across_limited_runs(self):
        class FakeScraper:
            api_budget_exhausted = False

            def __init__(self):
                self.calls = []

            def get_match_lineups(self, _event_id):
                self.calls.append("lineups")
                return {
                    "confirmed": True,
                    "home": {"players": [{"player": {"id": 1, "name": "Home Player"}}]},
                    "away": {"players": [{"player": {"id": 2, "name": "Away Player"}}]},
                }

            def get_match_incidents(self, _event_id):
                self.calls.append("incidents")
                return []

            def get_match_statistics(self, _event_id):
                self.calls.append("statistics")
                return []

        scraper = FakeScraper()
        match = {}

        with patch("predict_today.time.sleep"):
            predict_today._refresh_match_details(
                scraper,
                match,
                99,
                final=True,
                max_requests=1,
            )
            predict_today._refresh_match_details(
                scraper,
                match,
                99,
                final=True,
                max_requests=1,
            )
            predict_today._refresh_match_details(
                scraper,
                match,
                99,
                final=True,
                max_requests=1,
            )

        self.assertEqual(scraper.calls, ["lineups", "incidents", "statistics"])
        self.assertTrue(match["match_lineups_checked"])
        self.assertTrue(match["match_events_collected"])
        self.assertTrue(match["match_statistics_checked"])

    def test_budget_exhaustion_does_not_mark_missing_details_as_checked(self):
        class FakeScraper:
            api_budget_exhausted = False

            def __init__(self):
                self.calls = []

            def get_match_lineups(self, _event_id):
                self.calls.append("lineups")
                self.api_budget_exhausted = True
                return None

            def get_match_incidents(self, _event_id):
                self.calls.append("incidents")
                return []

            def get_match_statistics(self, _event_id):
                self.calls.append("statistics")
                return []

        scraper = FakeScraper()
        match = {}

        with patch("predict_today.time.sleep"):
            changed = predict_today._refresh_match_details(
                scraper,
                match,
                99,
                final=True,
                max_requests=1,
            )

        self.assertFalse(changed)
        self.assertEqual(scraper.calls, ["lineups"])
        self.assertNotIn("match_lineups_checked", match)
        self.assertNotIn("match_events_collected", match)
        self.assertNotIn("match_statistics_checked", match)

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
                self.assertEqual(
                    sidecar["summary"],
                    {
                        "matches_with_lineups": 1,
                        "official_player_of_the_match": 1,
                        "top_rated_player": 0,
                        "top_rated_fallback": 0,
                    },
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
