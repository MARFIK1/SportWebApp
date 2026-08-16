import unittest

import regenerate_all_features
from sofascore.pipeline import resolve_seasons_to_scrape


class FakeSeasonScraper:
    def __init__(self, seasons=None, error=None):
        self.seasons = seasons or []
        self.error = error

    def get_seasons(self, tournament_id):
        if self.error:
            raise self.error
        return self.seasons


class SeasonRolloverTests(unittest.TestCase):
    def test_api_new_season_replaces_stale_configured_default(self):
        scraper = FakeSeasonScraper([
            {'name': '2030', 'id': 200},
            {'name': '2026', 'id': 100},
        ])

        seasons, api_available = resolve_seasons_to_scrape(
            scraper,
            tournament_id=16,
            configured_seasons={'2026': 100},
            num_seasons=1,
        )

        self.assertTrue(api_available)
        self.assertEqual(seasons, [('2030', 200)])

    def test_configured_season_remains_available_when_api_fails(self):
        scraper = FakeSeasonScraper(error=RuntimeError('blocked'))

        seasons, api_available = resolve_seasons_to_scrape(
            scraper,
            tournament_id=16,
            configured_seasons={'2026': 100},
            num_seasons=1,
        )

        self.assertFalse(api_available)
        self.assertEqual(seasons, [('2026', 100)])

    def test_current_season_uses_latest_match_date_during_july_rollover(self):
        season_files = [
            ('ekstraklasa_25_26.json', '25_26'),
            ('ekstraklasa_26_27.json', '26_27'),
        ]
        raw_matches = {
            'ekstraklasa_25_26.json': [{'date': '2026-05-24'}],
            'ekstraklasa_26_27.json': [{'date': '2026-07-18'}],
        }

        selected = regenerate_all_features.select_current_seasons(
            season_files,
            raw_matches,
        )

        self.assertEqual(selected, {'26_27'})

    def test_current_season_falls_back_to_latest_loaded_file_without_dates(self):
        season_files = [
            ('world_cup_2022.json', '2022'),
            ('world_cup_2026.json', '2026'),
        ]
        raw_matches = {
            'world_cup_2022.json': [],
            'world_cup_2026.json': [],
        }

        selected = regenerate_all_features.select_current_seasons(
            season_files,
            raw_matches,
        )

        self.assertEqual(selected, {'2026'})


if __name__ == '__main__':
    unittest.main()
