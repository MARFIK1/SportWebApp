import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from predict_today import (
    _collect_direct_event_fallback_ids,
    _configured_daily_discovery_comp_keys,
    _fetch_tournament_scheduled_events_by_comp,
    _filter_scheduled_events_for_date,
    _match_requires_result_refresh,
    _match_scheduled_event_for_update,
    _prune_misaligned_scheduled_cache,
    _scrape_scheduled_upcoming,
    _sync_match_schedule,
    _sync_nonfinal_report_status,
    _unreported_source_matches,
)
from sofascore.scraper import SofascoreSeleniumScraper


COMPETITIONS = {
    "league": {
        "poland": {
            "ekstraklasa": {
                "tournament_id": 202,
                "seasons": {},
            },
            "excluded_league": {
                "tournament_id": 999,
                "seasons": {},
                "include_in_daily": False,
            },
        },
    },
    "cups": {
        "poland": {
            "puchar_polski": {
                "tournament_id": 281,
                "seasons": {},
            },
        },
    },
    "european": {
        "uefa": {
            "champions_league": {
                "tournament_id": 7,
                "seasons": {},
            },
        },
    },
}


class DailyDiscoveryTests(unittest.TestCase):
    def test_upcoming_discovery_does_not_call_removed_global_endpoint(self):
        class ScopedOnlyScraper:
            def get_scheduled_events(self, _target_date):
                raise AssertionError("removed global scheduled-events endpoint was called")

        with tempfile.TemporaryDirectory() as temp_dir, patch(
            "predict_today._fetch_tournament_scheduled_events_by_comp",
            return_value=({}, 0),
        ):
            result = _scrape_scheduled_upcoming(
                ScopedOnlyScraper(),
                "2026-08-15",
                COMPETITIONS,
                Path(temp_dir),
            )

        self.assertTrue(result)

    def test_leagues_and_european_competitions_are_discovered_by_default(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SOFASCORE_DAILY_DISCOVERY_TYPES", None)
            selected = _configured_daily_discovery_comp_keys(COMPETITIONS)

        self.assertEqual(
            selected,
            {
                ("league", "poland", "ekstraklasa"),
                ("european", "uefa", "champions_league"),
            },
        )

    def test_discovery_types_can_be_narrowed(self):
        with patch.dict(
            os.environ,
            {"SOFASCORE_DAILY_DISCOVERY_TYPES": "league"},
        ):
            selected = _configured_daily_discovery_comp_keys(COMPETITIONS)

        self.assertEqual(selected, {("league", "poland", "ekstraklasa")})

    def test_discovery_can_be_disabled(self):
        with patch.dict(
            os.environ,
            {"SOFASCORE_DAILY_DISCOVERY_TYPES": "off"},
        ):
            selected = _configured_daily_discovery_comp_keys(COMPETITIONS)

        self.assertEqual(selected, set())

    def test_newly_discovered_matches_are_missing_from_existing_report(self):
        report = {
            "matches": [
                {
                    "event_id": 101,
                    "home_team": "Existing Home",
                    "away_team": "Existing Away",
                },
            ],
        }
        existing_source = {
            "event_id": 101,
            "home": "Existing Home",
            "away": "Existing Away",
        }
        new_source = {
            "event_id": 202,
            "home": "New Home",
            "away": "New Away",
        }

        missing = _unreported_source_matches(
            report,
            [existing_source, new_source],
        )

        self.assertEqual(missing, [new_source])

    def test_scheduled_events_outside_requested_local_date_are_ignored(self):
        target_timestamp = int(datetime(2026, 7, 31, 18, 0).timestamp())
        adjacent_timestamp = int(datetime(2026, 7, 30, 18, 0).timestamp())

        filtered, ignored = _filter_scheduled_events_for_date(
            [
                {"id": 1, "startTimestamp": target_timestamp},
                {"id": 2, "startTimestamp": adjacent_timestamp},
            ],
            "2026-07-31",
        )

        self.assertEqual([event["id"] for event in filtered], [1])
        self.assertEqual(ignored, 1)

    def test_tournament_discovery_filters_adjacent_date_events(self):
        target_timestamp = int(datetime(2026, 7, 31, 18, 0).timestamp())
        adjacent_timestamp = int(datetime(2026, 7, 30, 18, 0).timestamp())

        class FakeScraper:
            api_blocked = False

            def get_tournament_scheduled_events(self, tournament_id, target_date):
                self.request = (tournament_id, target_date)
                return [
                    {"id": 1, "startTimestamp": target_timestamp},
                    {"id": 2, "startTimestamp": adjacent_timestamp},
                ]

        scraper = FakeScraper()
        events_by_comp, total_events = _fetch_tournament_scheduled_events_by_comp(
            scraper,
            "2026-07-31",
            COMPETITIONS,
            only_comp_keys={("league", "poland", "ekstraklasa")},
        )

        self.assertEqual(scraper.request, (202, "2026-07-31"))
        self.assertEqual(total_events, 1)
        self.assertEqual(
            [event["id"] for event in events_by_comp[("league", "poland", "ekstraklasa")]],
            [1],
        )

    def test_tournament_schedule_404_is_an_empty_day_not_a_warning(self):
        scraper = SofascoreSeleniumScraper.__new__(SofascoreSeleniumScraper)
        scraper.last_api_error = None
        scraper.api_blocked = False
        scraper.get_api_data = lambda _endpoint: {
            "error": {"code": 404, "reason": "Not Found"},
        }

        output = StringIO()
        with redirect_stdout(output):
            events = scraper.get_tournament_scheduled_events(202, "2026-07-31")

        self.assertEqual(events, [])
        self.assertNotIn("[WARN]", output.getvalue())


    def test_request_budget_exhaustion_is_not_reported_as_api_block(self):
        scraper = SofascoreSeleniumScraper.__new__(SofascoreSeleniumScraper)
        scraper.last_api_error = None
        scraper.api_blocked = False
        scraper.api_budget_exhausted = False
        scraper.api_request_count = 1
        scraper.max_api_requests = 1

        self.assertFalse(scraper._can_make_api_request("/event/1/lineups"))
        self.assertTrue(scraper.api_budget_exhausted)
        self.assertFalse(scraper.api_blocked)
        self.assertEqual(scraper.last_api_error["code"], "request_limit")

    def test_postponed_and_canceled_matches_do_not_require_result_refresh(self):
        for status in ("postponed", "canceled"):
            match = {
                "event_id": 101,
                "status": status,
                "home_score": None,
                "away_score": None,
            }

            self.assertFalse(_match_requires_result_refresh(match, "league"))

    def test_misaligned_scheduled_cache_entries_are_removed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            upcoming_dir = Path(temp_dir) / "league" / "raw" / "upcoming"
            upcoming_dir.mkdir(parents=True)
            scheduled_path = upcoming_dir / "upcoming_scheduled_2026-07-31.json"
            scheduled_path.write_text(
                json.dumps(
                    {
                        "metadata": {"total_matches": 2},
                        "matches": [
                            {"event_id": 1, "date": "2026-07-31"},
                            {"event_id": 2, "date": "2026-07-30"},
                        ],
                        "features": [
                            {"event_id": 1, "date": "2026-07-31"},
                            {"event_id": 2, "date": "2026-07-30"},
                        ],
                    }
                ),
                encoding="utf-8",
            )

            changed_files, removed_matches = _prune_misaligned_scheduled_cache(
                Path(temp_dir)
            )
            cleaned = json.loads(scheduled_path.read_text(encoding="utf-8"))

        self.assertEqual((changed_files, removed_matches), (1, 1))
        self.assertEqual(cleaned["metadata"]["total_matches"], 1)
        self.assertEqual([match["event_id"] for match in cleaned["matches"]], [1])
        self.assertEqual([feature["event_id"] for feature in cleaned["features"]], [1])

    def test_unmatched_local_event_is_selected_for_direct_lookup(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            upcoming_dir = (
                Path(temp_dir)
                / "league"
                / "poland"
                / "ekstraklasa"
                / "raw"
                / "upcoming"
            )
            upcoming_dir.mkdir(parents=True)
            (upcoming_dir / "upcoming_scheduled_2026-08-13.json").write_text(
                json.dumps(
                    {
                        "matches": [
                            {
                                "event_id": 101,
                                "date": "2026-08-13",
                                "status": "notstarted",
                                "home_team_id": 1,
                                "away_team_id": 2,
                                "home_score": None,
                                "away_score": None,
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            event_ids = _collect_direct_event_fallback_ids(
                Path(temp_dir),
                "2026-08-13",
                [],
                {("league", "poland", "ekstraklasa")},
            )

        self.assertEqual(event_ids, ["101"])

    def test_scheduled_event_is_not_selected_for_direct_lookup(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            upcoming_dir = (
                Path(temp_dir)
                / "league"
                / "poland"
                / "ekstraklasa"
                / "raw"
                / "upcoming"
            )
            upcoming_dir.mkdir(parents=True)
            (upcoming_dir / "upcoming_scheduled_2026-08-13.json").write_text(
                json.dumps(
                    {
                        "matches": [
                            {
                                "event_id": 101,
                                "date": "2026-08-13",
                                "status": "notstarted",
                                "home_team_id": 1,
                                "away_team_id": 2,
                                "home_score": None,
                                "away_score": None,
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            event_ids = _collect_direct_event_fallback_ids(
                Path(temp_dir),
                "2026-08-13",
                [{"id": 101, "homeTeam": {"id": 1}, "awayTeam": {"id": 2}}],
                {("league", "poland", "ekstraklasa")},
            )

        self.assertEqual(event_ids, [])

    def test_match_schedule_tracks_rescheduled_event_date(self):
        new_timestamp = int(datetime(2026, 8, 14, 18, 0).timestamp())
        match = {"date": "2026-08-13", "start_timestamp": None}

        changed = _sync_match_schedule(
            match,
            {"startTimestamp": new_timestamp},
        )

        self.assertTrue(changed)
        self.assertEqual(match["date"], "2026-08-14")
        self.assertEqual(match["start_timestamp"], new_timestamp)

    def test_rescheduled_match_is_selected_by_event_id_on_new_date(self):
        new_timestamp = int(datetime(2026, 8, 14, 18, 0).timestamp())
        event = {"id": 101, "startTimestamp": new_timestamp}

        selected = _match_scheduled_event_for_update(
            {"event_id": 101, "date": "2026-08-13"},
            "2026-08-14",
            {"101": event},
            {},
        )

        self.assertIs(selected, event)

    def test_off_date_match_is_not_selected_by_team_pair(self):
        event = {
            "homeTeam": {"id": 1},
            "awayTeam": {"id": 2},
        }

        selected = _match_scheduled_event_for_update(
            {
                "date": "2026-08-13",
                "home_team_id": 1,
                "away_team_id": 2,
            },
            "2026-08-14",
            {},
            {(1, 2): event},
        )

        self.assertIsNone(selected)

    def test_nonfinal_source_status_is_copied_to_report(self):
        for status in ("postponed", "canceled", "inprogress"):
            with self.subTest(status=status):
                report_match = {"status": "unknown"}

                changed = _sync_nonfinal_report_status(
                    report_match,
                    {"status": status},
                )

                self.assertTrue(changed)
                self.assertEqual(report_match["status"], status)
