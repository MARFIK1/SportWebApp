import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from selenium.common.exceptions import SessionNotCreatedException

from sofascore.scraper import create_stealth_driver


class ScraperDriverTests(unittest.TestCase):
    @patch('sofascore.scraper.time.sleep')
    @patch('sofascore.scraper.webdriver.Chrome')
    def test_retries_session_start_without_the_configured_profile(self, chrome, sleep):
        driver = MagicMock()
        chrome.side_effect = [SessionNotCreatedException('Chrome crashed'), driver]

        with tempfile.TemporaryDirectory() as profile_dir:
            with patch.dict(os.environ, {
                'SOFASCORE_DRIVER_START_ATTEMPTS': '2',
                'SOFASCORE_DRIVER_RETRY_DELAY': '0',
                'SOFASCORE_HEADLESS': '1',
                'SOFASCORE_CHROME_USER_DATA_DIR': profile_dir,
            }):
                result, user_agent = create_stealth_driver()

            first_options = chrome.call_args_list[0].kwargs['options']
            self.assertIn(f'--user-data-dir={profile_dir}', first_options.arguments)

        self.assertIs(result, driver)
        self.assertEqual(user_agent, 'browser-default')
        self.assertEqual(chrome.call_count, 2)
        retry_options = chrome.call_args_list[1].kwargs['options']
        self.assertFalse(any(arg.startswith('--user-data-dir=') for arg in retry_options.arguments))
        sleep.assert_called_once_with(0.0)

    @patch('sofascore.scraper.time.sleep')
    @patch('sofascore.scraper.webdriver.Chrome')
    def test_raises_after_all_session_start_attempts_fail(self, chrome, sleep):
        chrome.side_effect = SessionNotCreatedException('Chrome crashed')

        with patch.dict(os.environ, {
            'SOFASCORE_DRIVER_START_ATTEMPTS': '2',
            'SOFASCORE_DRIVER_RETRY_DELAY': '0',
        }):
            with self.assertRaises(SessionNotCreatedException):
                create_stealth_driver()

        self.assertEqual(chrome.call_count, 2)
        sleep.assert_called_once_with(0.0)


if __name__ == '__main__':
    unittest.main()
