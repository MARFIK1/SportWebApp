import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sofascore.pipeline import (
    scrape_player_data_incremental,
    scrape_season_matches_incremental,
    scrape_upcoming_matches,
)
from sofascore.utils import scrape_full_match_data


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding='utf-8')


class RawDataManager:
    def __init__(self, root):
        self.comp_type = 'league'
        self.country = 'poland'
        self.league = 'ekstraklasa'
        self.paths = {'raw': str(root / 'raw')}
        Path(self.paths['raw']).mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _season_slug(_season_name):
        return 'season'


class PlayerDataManagerStub:
    def __init__(self, root):
        self.paths = {
            'lineups': str(root / 'lineups'),
            'player_stats': str(root / 'player_stats'),
            'players': str(root / 'players'),
        }
        for path in self.paths.values():
            Path(path).mkdir(parents=True, exist_ok=True)
        self.saved = []

    @staticmethod
    def _season_slug(_season_name):
        return 'season'

    @staticmethod
    def process_match_lineups(_payload, match_info):
        lineup = {
            'event_id': match_info['event_id'],
            'date': match_info['date'],
            'home': {'starters': [], 'substitutes': []},
            'away': {'starters': [], 'substitutes': []},
            'version': 'refreshed',
        }
        player_stats = [{
            'event_id': match_info['event_id'],
            'date': match_info['date'],
            'version': 'refreshed',
        }]
        return lineup, player_stats

    def save_season_data(self, season_name, lineups, player_stats, registry):
        self.saved.append(copy.deepcopy({
            'season': season_name,
            'lineups': lineups,
            'player_stats': player_stats,
            'registry': registry,
        }))


class PipelineAccessTests(unittest.TestCase):
    def test_match_details_stop_after_the_first_blocked_endpoint(self):
        class BlockedStatisticsScraper:
            api_blocked = False
            api_budget_exhausted = False
            last_api_error = None

            def get_match_statistics(self, _event_id):
                self.api_blocked = True
                self.last_api_error = {
                    'endpoint': '/event/1/statistics',
                    'code': 403,
                    'reason': 'Forbidden',
                }
                return None

            def get_match_shotmap(self, _event_id):
                raise AssertionError('shotmap must not be requested after a block')

        match = {
            'id': 1,
            'startTimestamp': 1_786_816_800,
            'status': {'type': 'finished'},
            'homeTeam': {'id': 10, 'name': 'Home'},
            'awayTeam': {'id': 20, 'name': 'Away'},
            'homeScore': {'current': 1},
            'awayScore': {'current': 0},
        }

        with patch('sofascore.utils.time.sleep'):
            result = scrape_full_match_data(BlockedStatisticsScraper(), match, delay=0)

        self.assertIsNone(result)

    def test_blocked_season_discovery_preserves_the_existing_raw_file(self):
        class BlockedSeasonScraper:
            api_blocked = False
            api_budget_exhausted = False
            last_api_error = None

            def get_all_season_matches(self, _tournament_id, _season_id):
                self.api_blocked = True
                self.last_api_error = {
                    'endpoint': '/season/events/last/1',
                    'code': 403,
                    'reason': 'Forbidden',
                }
                return [{'id': 999, 'status': {'type': 'finished'}}]

            def get_all_upcoming_matches(self, _tournament_id, _season_id):
                raise AssertionError('upcoming discovery must stop after a block')

        with tempfile.TemporaryDirectory() as temp_dir:
            manager = RawDataManager(Path(temp_dir))
            raw_path = Path(manager.paths['raw']) / 'season.json'
            existing = {
                'metadata': {'season': '2026/27'},
                'matches': [{
                    'event_id': 123,
                    'date': '2026-08-15',
                    'status': 'finished',
                    'home_score': 2,
                    'away_score': 1,
                }],
            }
            write_json(raw_path, existing)
            original_text = raw_path.read_text(encoding='utf-8')

            matches, dataset = scrape_season_matches_incremental(
                BlockedSeasonScraper(),
                manager,
                fg=None,
                tournament_id=1,
                season_id=2,
                season_name='2026/27',
                delay=0,
            )

            self.assertEqual(matches, existing['matches'])
            self.assertIsNone(dataset)
            self.assertEqual(raw_path.read_text(encoding='utf-8'), original_text)

    def test_lineup_block_preserves_unreached_existing_records(self):
        class PartiallyBlockedLineupScraper:
            api_blocked = False
            api_budget_exhausted = False
            last_api_error = None

            def __init__(self):
                self.calls = []

            def get_match_lineups(self, event_id):
                self.calls.append(event_id)
                if event_id == 1:
                    return {'home': {}, 'away': {}}
                if event_id == 2:
                    self.api_blocked = True
                    self.last_api_error = {
                        'endpoint': '/event/2/lineups',
                        'code': 403,
                        'reason': 'Forbidden',
                    }
                    return None
                raise AssertionError('later lineups must not be requested after a block')

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            manager = PlayerDataManagerStub(root)
            existing_lineups = [
                {'event_id': event_id, 'date': f'2026-08-1{event_id}', 'version': 'old'}
                for event_id in (1, 2, 3)
            ]
            existing_stats = [
                {'event_id': event_id, 'date': f'2026-08-1{event_id}', 'version': 'old'}
                for event_id in (1, 2, 3)
            ]
            write_json(
                Path(manager.paths['lineups']) / 'lineups_season.json',
                {'lineups': existing_lineups},
            )
            write_json(
                Path(manager.paths['player_stats']) / 'player_stats_season.json',
                {'player_stats': existing_stats},
            )
            write_json(
                Path(manager.paths['players']) / 'players_season.json',
                {'teams': {}},
            )
            matches = [{
                'event_id': event_id,
                'date': f'2026-08-1{event_id}',
                'status': 'finished',
                'home_score': 1,
                'away_score': 0,
                'home_team': 'Home',
                'away_team': 'Away',
            } for event_id in (1, 2, 3)]
            scraper = PartiallyBlockedLineupScraper()

            with patch('sofascore.pipeline.time.sleep'):
                result = scrape_player_data_incremental(
                    scraper,
                    manager,
                    matches,
                    '2026/27',
                    delay=0,
                    update_recent_days=30,
                )

            self.assertEqual(scraper.calls, [1, 2])
            self.assertEqual(len(manager.saved), 1)
            saved = manager.saved[-1]
            lineups_by_event = {
                item['event_id']: item for item in saved['lineups']
            }
            stats_by_event = {
                item['event_id']: item for item in saved['player_stats']
            }
            self.assertEqual(lineups_by_event[1]['version'], 'refreshed')
            self.assertEqual(stats_by_event[1]['version'], 'refreshed')
            self.assertEqual(lineups_by_event[2]['version'], 'old')
            self.assertEqual(lineups_by_event[3]['version'], 'old')
            self.assertEqual(stats_by_event[2]['version'], 'old')
            self.assertEqual(stats_by_event[3]['version'], 'old')
            self.assertFalse(any(item.get('no_data') for item in saved['lineups']))
            self.assertEqual(result['lineups'], saved['lineups'])

    def test_blocked_upcoming_odds_preserve_the_previous_upcoming_file(self):
        class BlockedUpcomingScraper:
            api_blocked = False
            api_budget_exhausted = False
            last_api_error = None

            @staticmethod
            def get_all_upcoming_matches(_tournament_id, _season_id):
                return [{
                    'id': 55,
                    'startTimestamp': 1_786_816_800,
                    'status': {'type': 'notstarted'},
                    'homeTeam': {'id': 10, 'name': 'Home'},
                    'awayTeam': {'id': 20, 'name': 'Away'},
                }]

            def get_match_odds(self, _event_id):
                self.api_blocked = True
                self.last_api_error = {
                    'endpoint': '/event/55/odds/1/all',
                    'code': 403,
                    'reason': 'Forbidden',
                }
                return None

            @staticmethod
            def get_event_details(_event_id):
                raise AssertionError('details must not be requested after a block')

        with tempfile.TemporaryDirectory() as temp_dir:
            manager = RawDataManager(Path(temp_dir))
            upcoming_path = (
                Path(manager.paths['raw']) / 'upcoming' / 'upcoming_season.json'
            )
            previous = {
                'metadata': {'season': '2026/27'},
                'matches': [{'event_id': 44, 'home_team': 'Existing'}],
                'features': [{'event_id': 44}],
            }
            write_json(upcoming_path, previous)
            original_text = upcoming_path.read_text(encoding='utf-8')

            result = scrape_upcoming_matches(
                BlockedUpcomingScraper(),
                manager,
                fg=None,
                tournament_id=1,
                season_id=2,
                season_name='2026/27',
                delay=0,
            )

            self.assertEqual(result, [])
            self.assertEqual(upcoming_path.read_text(encoding='utf-8'), original_text)


if __name__ == '__main__':
    unittest.main()
