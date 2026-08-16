import tempfile
import unittest

from sofascore.managers import FootballDataManager, PlayerDataManager


class SeasonSlugTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls.dm = FootballDataManager(cls._tmp.name, 'league', 'england', 'premier_league')
        cls.pdm = PlayerDataManager(cls.dm)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_two_digit_season_label(self):
        self.assertEqual(self.dm._season_slug('21/22'), 'premier_league_21_22')
        self.assertEqual(self.dm._season_slug('Premier League 21/22'), 'premier_league_21_22')

    def test_four_digit_season_label(self):
        self.assertEqual(self.dm._season_slug('2025/2026'), 'premier_league_25_26')
        self.assertEqual(self.dm._season_slug('Premier League 2025/2026'), 'premier_league_25_26')

    def test_mixed_digit_season_label(self):
        self.assertEqual(self.dm._season_slug('Premier League 2025/26'), 'premier_league_25_26')

    def test_single_year_label_falls_back_to_name(self):
        self.assertEqual(self.dm._season_slug('2026'), '2026')
        self.assertEqual(self.dm._season_slug('World Cup 2026'), 'world_cup_2026')

    def test_player_manager_matches_data_manager(self):
        for label in ('21/22', '2025/2026', 'Premier League 2025/26', 'World Cup 2026'):
            self.assertEqual(self.pdm._season_slug(label), self.dm._season_slug(label))


if __name__ == '__main__':
    unittest.main()
