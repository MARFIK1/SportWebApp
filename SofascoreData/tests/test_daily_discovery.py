import os
import unittest
from unittest.mock import patch

from predict_today import _configured_daily_discovery_comp_keys


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
    def test_domestic_leagues_are_discovered_by_default(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SOFASCORE_DAILY_DISCOVERY_TYPES", None)
            selected = _configured_daily_discovery_comp_keys(COMPETITIONS)

        self.assertEqual(selected, {("league", "poland", "ekstraklasa")})

    def test_discovery_types_can_be_extended(self):
        with patch.dict(
            os.environ,
            {"SOFASCORE_DAILY_DISCOVERY_TYPES": "league,european"},
        ):
            selected = _configured_daily_discovery_comp_keys(COMPETITIONS)

        self.assertEqual(
            selected,
            {
                ("league", "poland", "ekstraklasa"),
                ("european", "uefa", "champions_league"),
            },
        )

    def test_discovery_can_be_disabled(self):
        with patch.dict(
            os.environ,
            {"SOFASCORE_DAILY_DISCOVERY_TYPES": "off"},
        ):
            selected = _configured_daily_discovery_comp_keys(COMPETITIONS)

        self.assertEqual(selected, set())
