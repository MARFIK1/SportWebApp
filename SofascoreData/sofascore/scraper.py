"""
Sofascore API Scraper using Selenium.
"""

import json
import os
import time
import random
from pathlib import Path

from selenium import webdriver


USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Brave/120',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
]

VIEWPORTS = [
    (1920, 1080),
    (1366, 768),
    (1536, 864),
    (1440, 900),
    (1680, 1050),
]


def _truthy_env(name):
    return os.environ.get(name, '').strip().lower() in ('1', 'true', 'yes', 'on')


def create_stealth_driver(headless=False):
    """Creates Chrome WebDriver with anti-detection measures. Returns (driver, user_agent)."""
    env_headless = _truthy_env('SOFASCORE_HEADLESS')
    ci_without_display = os.environ.get('CI', '').lower() == 'true' and not os.environ.get('DISPLAY')
    headless = headless or env_headless or ci_without_display

    options = webdriver.ChromeOptions()

    profile_dir = os.environ.get('SOFASCORE_CHROME_USER_DATA_DIR')
    if profile_dir is None:
        profile_dir = str(Path(__file__).resolve().parents[1] / '.chrome-profile')
    if profile_dir.strip().lower() not in ('', '0', 'false', 'off', 'none'):
        Path(profile_dir).mkdir(parents=True, exist_ok=True)
        options.add_argument(f'--user-data-dir={profile_dir}')

    profile_name = os.environ.get('SOFASCORE_CHROME_PROFILE_DIRECTORY')
    if profile_name:
        options.add_argument(f'--profile-directory={profile_name}')

    user_agent = os.environ.get('SOFASCORE_USER_AGENT')
    if user_agent:
        options.add_argument(f'--user-agent={user_agent}')
    elif _truthy_env('SOFASCORE_RANDOM_USER_AGENT'):
        user_agent = random.choice(USER_AGENTS)
        options.add_argument(f'--user-agent={user_agent}')
    else:
        user_agent = 'browser-default'

    width, height = random.choice(VIEWPORTS)
    options.add_argument(f'--window-size={width},{height}')

    options.add_argument('--no-first-run')
    options.add_argument('--no-default-browser-check')
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_argument('--disable-infobars')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-gpu')
    options.add_argument('--lang=en-US,en')
    options.add_argument('--disable-extensions')
    options.add_argument('--log-level=3')
    options.add_argument('--silent')

    if headless:
        options.add_argument('--headless=new')

    options.add_experimental_option('excludeSwitches', ['enable-automation', 'enable-logging'])
    options.add_experimental_option('useAutomationExtension', False)
    
    options.set_capability("goog:loggingPrefs", {"performance": "ALL"})
    
    driver = webdriver.Chrome(options=options)
    
    driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
        'source': '''
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
            window.chrome = { runtime: {} };
        '''
    })
    
    driver.set_script_timeout(30)
    driver.set_page_load_timeout(30)
    return driver, user_agent


class SofascoreSeleniumScraper:
    def __init__(self, driver):
        self.driver = driver
        self.last_api_error = None
        self.api_blocked = False

    def _record_api_error(self, endpoint, data):
        if not isinstance(data, dict) or not isinstance(data.get('error'), dict):
            return

        error = data.get('error') or {}
        code = error.get('code')
        reason = error.get('reason')
        self.last_api_error = {
            'endpoint': endpoint,
            'code': code,
            'reason': reason,
        }
        if code == 403 or str(reason).lower() in ('challenge', 'forbidden'):
            self.api_blocked = True

    def _has_api_error(self, endpoint, data):
        self._record_api_error(endpoint, data)
        return isinstance(data, dict) and isinstance(data.get('error'), dict)

    def _read_json_from_page(self):
        try:
            raw = self.driver.execute_script("""
                const pre = document.querySelector('pre');
                return pre ? pre.innerText : document.body.innerText;
            """)
        except Exception:
            return None

        if not raw:
            return None

        raw = raw.strip()
        if not raw.startswith(('{', '[')):
            return None

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None
    
    def get_api_data(self, endpoint):
        url = f"https://api.sofascore.com/api/v1{endpoint}"
        script = """
        var callback = arguments[arguments.length - 1];
        var url = arguments[0];
        fetch(url)
            .then(async r => {
                const text = await r.text();
                let data = null;
                try {
                    data = text ? JSON.parse(text) : null;
                } catch (e) {
                    data = null;
                }
                if (!r.ok) {
                    callback(data && data.error ? data : {
                        error: {
                            code: r.status,
                            reason: r.statusText || (text || '').slice(0, 120) || 'http_error'
                        }
                    });
                    return;
                }
                callback(data);
            })
            .catch(() => callback(null));
        """
        try:
            data = self.driver.execute_async_script(script, url)
            if data:
                self._record_api_error(endpoint, data)
                return data
        except Exception:
            pass

        try:
            self.driver.get(url)
            data = self._read_json_from_page()
            self._record_api_error(endpoint, data)
            return data
        except Exception:
            return None
    
    def get_seasons(self, tournament_id):
        endpoint = f"/unique-tournament/{tournament_id}/seasons"
        data = self.get_api_data(endpoint)
        if self._has_api_error(endpoint, data):
            return []
        return data.get('seasons', []) if data else []
    
    def get_season_matches(self, tournament_id, season_id, page=0):
        endpoint = f"/unique-tournament/{tournament_id}/season/{season_id}/events/last/{page}"
        data = self.get_api_data(endpoint)
        if self._has_api_error(endpoint, data):
            return []
        return data.get('events', []) if data else []
    
    def get_all_season_matches(self, tournament_id, season_id, max_pages=100):
        all_matches = []
        for page in range(max_pages):
            matches = self.get_season_matches(tournament_id, season_id, page)
            if not matches:
                break
            all_matches.extend(matches)
            time.sleep(0.3 + random.random() * 0.4)  # FAST MODE: 0.3-0.7s
        return all_matches
    
    def get_match_statistics(self, event_id):
        data = self.get_api_data(f"/event/{event_id}/statistics")
        return data.get('statistics', []) if data else None
    
    def get_match_shotmap(self, event_id):
        """Get shotmap (xG data) for a match"""
        data = self.get_api_data(f"/event/{event_id}/shotmap")
        return data.get('shotmap', []) if data else None
    
    def get_match_incidents(self, event_id):
        """Get incidents (goals, cards) for a match"""
        data = self.get_api_data(f"/event/{event_id}/incidents")
        return data.get('incidents', []) if data else None
    
    def get_upcoming_matches(self, tournament_id, season_id, page=0):
        endpoint = f"/unique-tournament/{tournament_id}/season/{season_id}/events/next/{page}"
        data = self.get_api_data(endpoint)
        if self._has_api_error(endpoint, data):
            return []
        return data.get('events', []) if data else []
    
    def get_all_upcoming_matches(self, tournament_id, season_id, max_pages=10):
        all_matches = []
        for page in range(max_pages):
            matches = self.get_upcoming_matches(tournament_id, season_id, page)
            if not matches:
                break
            all_matches.extend(matches)
            time.sleep(0.3 + random.random() * 0.4)
        return all_matches

    def get_team_previous_events(self, team_id, page=0):
        endpoint = f"/team/{team_id}/events/last/{page}"
        data = self.get_api_data(endpoint)
        if self._has_api_error(endpoint, data):
            return []
        return data.get('events', []) if data else []

    def get_all_team_previous_events(self, team_id, max_pages=4):
        all_matches = []
        for page in range(max_pages):
            matches = self.get_team_previous_events(team_id, page)
            if not matches:
                break
            all_matches.extend(matches)
            time.sleep(0.3 + random.random() * 0.4)
        return all_matches
    
    def get_match_odds(self, event_id):
        """Get pre-match odds for a match (1X2, Over/Under, BTTS)"""
        data = self.get_api_data(f"/event/{event_id}/odds/1/all")
        return data.get('markets', []) if data and isinstance(data, dict) else None

    def get_event_details(self, event_id):
        endpoint = f"/event/{event_id}"
        data = self.get_api_data(endpoint)
        if self._has_api_error(endpoint, data):
            return None
        return data.get('event', data) if data and isinstance(data, dict) else None

    def get_scheduled_events(self, date_ymd):
        endpoint = f"/sport/football/scheduled-events/{date_ymd}"
        data = self.get_api_data(endpoint)
        if self._has_api_error(endpoint, data):
            error = data.get('error') or {}
            print(f"[WARN] scheduled-events {date_ymd}: Sofascore API error {error.get('code')} {error.get('reason')}")
            return None
        if not data or not isinstance(data, dict):
            return None
        events = data.get('events', [])
        if not events:
            print(f"[DEBUG] scheduled-events {date_ymd}: keys={list(data.keys())}")
        return events
