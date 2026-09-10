import unittest

from sofascore.utils import extract_odds


class OddsExtractionTests(unittest.TestCase):
    def test_extracts_every_complete_benchmark_market(self):
        markets = [{
            "marketId": 1,
            "marketName": "Full time",
            "choices": [
                {"name": "1", "fractionalValue": "1/2"},
                {"name": "X", "fractionalValue": "3/1"},
                {"name": "2", "fractionalValue": "5/1"},
            ],
        }, {
            "marketId": 5,
            "marketName": "Both teams to score",
            "choices": [
                {"name": "Yes", "fractionalValue": "4/5"},
                {"name": "No", "fractionalValue": "1/1"},
            ],
        }, {
            "marketId": 9,
            "marketName": "Match goals",
            "choiceGroup": "1.5",
            "choices": [
                {"name": "Over", "fractionalValue": "1/4"},
                {"name": "Under", "fractionalValue": "11/4"},
            ],
        }, {
            "marketId": 9,
            "marketName": "Match goals",
            "choiceGroup": "2.5",
            "choices": [
                {"name": "Over", "fractionalValue": "10/11"},
                {"name": "Under", "fractionalValue": "4/5"},
            ],
        }, {
            "marketId": 20,
            "marketName": "Cards in match",
            "marketGroup": "Total Cards",
            "choiceGroup": "3.5",
            "choices": [
                {"name": "Over", "fractionalValue": "8/13"},
                {"name": "Under", "fractionalValue": "6/5"},
            ],
        }]

        odds = extract_odds(markets)

        self.assertEqual(odds, {
            "odds_home_win": 1.5,
            "odds_draw": 4.0,
            "odds_away_win": 6.0,
            "odds_btts_yes": 1.8,
            "odds_btts_no": 2.0,
            "odds_over_1_5": 1.25,
            "odds_under_1_5": 3.75,
            "odds_over_2_5": 1.909,
            "odds_under_2_5": 1.8,
            "odds_cards_over_3_5": 1.615,
            "odds_cards_under_3_5": 2.2,
        })

    def test_ignores_live_markets(self):
        odds = extract_odds([{
            "marketId": 9,
            "marketName": "Match goals",
            "choiceGroup": "2.5",
            "isLive": True,
            "choices": [
                {"name": "Over", "fractionalValue": "1/1"},
                {"name": "Under", "fractionalValue": "1/1"},
            ],
        }])

        self.assertEqual(odds, {})


if __name__ == "__main__":
    unittest.main()
