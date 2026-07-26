import os
import unittest
from unittest.mock import patch

from predict_today import (
    _configured_daily_discovery_comp_keys,
    _unreported_source_matches,
)


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
