import unittest

from sofascore.features import MLFeatureGenerator


class LineupFeatureTests(unittest.TestCase):
    def test_squad_features_use_only_player_records_before_match(self):
        generator = MLFeatureGenerator()
        starters = [{"id": 10, "position": "G"}]
        player_stats = {
            "10": [
                {
                    "date": "2026-08-10",
                    "rating": 10.0,
                    "expected_goals": 1.0,
                    "minutes_played": 90,
                    "_league": "la_liga",
                },
                {
                    "date": "2026-08-09",
                    "rating": 9.0,
                    "expected_goals": 0.9,
                    "minutes_played": 90,
                    "_league": "la_liga",
                },
                {
                    "date": "2026-08-08",
                    "rating": 7.0,
                    "expected_goals": 0.2,
                    "minutes_played": 90,
                    "_league": "premier_league",
                },
                {
                    "date": "2026-08-07",
                    "rating": 6.0,
                    "expected_goals": 0.0,
                    "minutes_played": 45,
                    "_league": "premier_league",
                },
            ]
        }

        features = generator.compute_squad_club_features(
            starters,
            [],
            player_stats,
            "2026-08-09",
        )

        self.assertEqual(features["squad_avg_rating"], 6.5)
        self.assertEqual(features["squad_avg_xg"], 0.1)
        self.assertEqual(features["squad_gk_rating"], 6.5)
        self.assertEqual(features["squad_minutes_pct"], 1.0)


if __name__ == "__main__":
    unittest.main()
