import json
import os
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

import predict_today
from predict_today import _print_sofascore_api_blocked
from sofascore.scraper import SofascoreSeleniumScraper


FIXTURES_DIR = Path(__file__).parent / 'fixtures' / 'sofascore'


def load_fixture(name):
    return json.loads((FIXTURES_DIR / name).read_text(encoding='utf-8'))


class ReplayDriver:
    def __init__(self, responses):
        self.responses = list(responses)
        self.async_calls = []
        self.page_calls = []

    def execute_async_script(self, _script, url, headers):
        self.async_calls.append((url, headers))
        return self.responses.pop(0)

    def get(self, url):
        self.page_calls.append(url)


class SofascoreAccessTests(unittest.TestCase):
    def create_scraper(self, responses):
        driver = ReplayDriver(responses)
        with patch.dict(os.environ, {
            'SOFASCORE_MAX_API_REQUESTS': '80',
            'SOFASCORE_API_DELAY': '0',
            'SOFASCORE_API_JITTER': '0',
        }):
            scraper = SofascoreSeleniumScraper(driver)
        return scraper, driver

    def test_replays_saved_scheduled_events_without_network_access(self):
        response = load_fixture('scheduled_events_2026-08-16.json')
        scraper, driver = self.create_scraper([response])

        events = scraper.get_tournament_scheduled_events(202, '2026-08-16')

        self.assertEqual([event['id'] for event in events], [16316950])
        self.assertEqual(scraper.api_request_count, 1)
        self.assertEqual(len(driver.async_calls), 1)
        self.assertEqual(driver.page_calls, [])
        self.assertFalse(scraper.api_blocked)

    def test_lineup_403_blocks_the_session_and_stops_follow_up_requests(self):
        response = load_fixture('forbidden_lineups.json')
        scraper, driver = self.create_scraper([response])

        first = scraper.get_api_data('/event/16316950/lineups')
        second = scraper.get_api_data('/event/16316951/lineups')

        self.assertEqual(first, response)
        self.assertIsNone(second)
        self.assertTrue(scraper.api_blocked)
        self.assertEqual(scraper.api_request_count, 1)
        self.assertEqual(len(driver.async_calls), 1)

    def test_lineup_404_remains_an_optional_non_blocking_response(self):
        scraper, _driver = self.create_scraper([])

        scraper._record_api_error(
            '/event/16316950/lineups',
            {'error': {'code': 404, 'reason': 'Not Found'}},
        )

        self.assertFalse(scraper.api_blocked)
        self.assertEqual(scraper.last_api_error['code'], 404)

    def test_blocked_log_contains_a_machine_readable_access_marker(self):
        scraper, _driver = self.create_scraper([])
        scraper.api_blocked = True
        scraper.last_api_error = {
            'endpoint': '/event/16316950/lineups',
            'code': 403,
            'reason': 'Forbidden',
        }

        output = StringIO()
        with redirect_stdout(output):
            reported = _print_sofascore_api_blocked(scraper)

        marker = next(
            line for line in output.getvalue().splitlines()
            if line.startswith('[SOFASCORE_ACCESS] ')
        )
        payload = json.loads(marker.removeprefix('[SOFASCORE_ACCESS] '))
        self.assertTrue(reported)
        self.assertEqual(payload, {
            'status': 'blocked',
            'endpoint': '/event/16316950/lineups',
            'code': 403,
            'reason': 'Forbidden',
        })

    def test_refresh_lineups_stops_before_a_second_live_refresh(self):
        existing_report = {
            'date': '2026-08-16',
            'matches': [],
        }

        with (
            patch('sys.argv', [
                'predict_today.py',
                '2026-08-16',
                '--refresh-lineups',
            ]),
            patch.object(
                predict_today,
                'load_existing_report',
                return_value=existing_report,
            ),
            patch.object(
                predict_today,
                'update_match_results',
                return_value={'source_ok': False},
            ),
            patch.object(predict_today, 'find_matches_for_date') as find_matches,
            patch.object(predict_today, 'load_models') as load_models,
            patch.object(
                predict_today,
                'refresh_report_lineup_predictions',
            ) as refresh_predictions,
            redirect_stdout(StringIO()),
        ):
            with self.assertRaises(SystemExit) as raised:
                predict_today.main()

        self.assertEqual(raised.exception.code, 1)
        find_matches.assert_not_called()
        load_models.assert_not_called()
        refresh_predictions.assert_not_called()


if __name__ == '__main__':
    unittest.main()
