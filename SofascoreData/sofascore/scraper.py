"""
Sofascore API Scraper using Selenium.
"""

import json
import os
import time
import random
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import SessionNotCreatedException


USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Brave/120',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
]

DEFAULT_API_BASE_URL = 'https://www.sofascore.com/api/v1'
DEFAULT_X_REQUESTED_WITH = 'fa4944'

VIEWPORTS = [
    (1920, 1080),
    (1366, 768),
    (1536, 864),
    (1440, 900),
    (1680, 1050),
]


def _truthy_env(name):
    return os.environ.get(name, '').strip().lower() in ('1', 'true', 'yes', 'on')


def _float_env(name, default):
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == '':
        return default
    try:
        return max(0.0, float(raw))
    except ValueError:
        return default


def _int_env(name, default, minimum=1):
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == '':
        return default
    try:
        return max(minimum, int(raw))
    except ValueError:
        return default


def _api_base_url():
    return os.environ.get('SOFASCORE_API_BASE_URL', DEFAULT_API_BASE_URL).rstrip('/')


def _api_request_headers():
    requested_with = os.environ.get('SOFASCORE_X_REQUESTED_WITH', DEFAULT_X_REQUESTED_WITH).strip()
    headers = {}
    if requested_with.lower() not in ('', '0', 'false', 'off', 'none'):
        headers['x-requested-with'] = requested_with
    return headers


def _build_chrome_options(headless, user_agent, profile_dir=None, profile_name=None):
    options = webdriver.ChromeOptions()

    chrome_binary = os.environ.get('SOFASCORE_CHROME_BINARY', '').strip()
    if chrome_binary:
        options.binary_location = chrome_binary

    if profile_dir:
        Path(profile_dir).mkdir(parents=True, exist_ok=True)
        options.add_argument(f'--user-data-dir={profile_dir}')

    if profile_name:
        options.add_argument(f'--profile-directory={profile_name}')

    if user_agent != 'browser-default':
        options.add_argument(f'--user-agent={user_agent}')

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

    return options


def create_stealth_driver(headless=False):
    """Creates Chrome WebDriver with anti-detection measures. Returns (driver, user_agent)."""
    env_headless = _truthy_env('SOFASCORE_HEADLESS')
    ci_without_display = os.environ.get('CI', '').lower() == 'true' and not os.environ.get('DISPLAY')
    headless = headless or env_headless or ci_without_display

    profile_dir = os.environ.get('SOFASCORE_CHROME_USER_DATA_DIR')
    if profile_dir is None:
        profile_dir = str(Path(__file__).resolve().parents[1] / '.chrome-profile')
    if profile_dir.strip().lower() in ('', '0', 'false', 'off', 'none'):
        profile_dir = None
    profile_name = os.environ.get('SOFASCORE_CHROME_PROFILE_DIRECTORY')

    user_agent = os.environ.get('SOFASCORE_USER_AGENT')
    if not user_agent and _truthy_env('SOFASCORE_RANDOM_USER_AGENT'):
        user_agent = random.choice(USER_AGENTS)
    if not user_agent:
        user_agent = 'browser-default'

    attempts = _int_env('SOFASCORE_DRIVER_START_ATTEMPTS', 2)
    retry_delay = _float_env('SOFASCORE_DRIVER_RETRY_DELAY', 1.5)
    driver = None
    for attempt in range(attempts):
        use_configured_profile = attempt == 0
        options = _build_chrome_options(
            headless,
            user_agent,
            profile_dir=profile_dir if use_configured_profile else None,
            profile_name=profile_name if use_configured_profile else None,
        )
        try:
            driver = webdriver.Chrome(options=options)
            break
        except SessionNotCreatedException:
            if attempt + 1 >= attempts:
                raise
            print('[SOFASCORE] Chrome failed to start; retrying with an isolated temporary profile.')
            time.sleep(retry_delay)

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
        self.api_budget_exhausted = False
        self.api_request_count = 0
        self.max_api_requests = _int_env('SOFASCORE_MAX_API_REQUESTS', 90, minimum=0)
        self.api_delay = _float_env('SOFASCORE_API_DELAY', 0.75)
        self.api_jitter = _float_env('SOFASCORE_API_JITTER', 0.25)
        self._last_api_request_at = 0.0

    def _is_endpoint_optional_for_fallback(self, endpoint):
        endpoint = str(endpoint or '')
        return endpoint.endswith('/lineups')

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
        if str(code) == '403' or str(reason).strip().lower() in ('challenge', 'forbidden'):
            self.api_blocked = True
            return

        if self._is_endpoint_optional_for_fallback(endpoint):
            return

    def _has_api_error(self, endpoint, data):
        self._record_api_error(endpoint, data)
        return isinstance(data, dict) and isinstance(data.get('error'), dict)

    @staticmethod
    def _is_missing_optional_response(data):
        if not isinstance(data, dict):
            return False
        error = data.get('error')
        if not isinstance(error, dict):
            return False
        return str(error.get('code')) in {'404', '422'}

    def _can_make_api_request(self, endpoint):
        if self.api_blocked or self.api_budget_exhausted:
            return False

        if self.max_api_requests and self.api_request_count >= self.max_api_requests:
            self.api_budget_exhausted = True
            self.last_api_error = {
                'endpoint': endpoint,
                'code': 'request_limit',
                'reason': f'max_api_requests={self.max_api_requests}',
            }
            return False

        return True

    def _wait_before_api_request(self):
        if self.api_delay <= 0:
            return

        target_delay = self.api_delay
        if self.api_jitter > 0:
            target_delay += random.random() * self.api_jitter

        now = time.time()
        elapsed = now - self._last_api_request_at
        if elapsed < target_delay:
            time.sleep(target_delay - elapsed)
        self._last_api_request_at = time.time()

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
        if not self._can_make_api_request(endpoint):
            return None

        self._wait_before_api_request()
        self.api_request_count += 1

        url = f"{_api_base_url()}{endpoint}"
        headers = _api_request_headers()
        script = """
        var callback = arguments[arguments.length - 1];
        var url = arguments[0];
        var headers = arguments[1] || {};
        fetch(url, { headers, credentials: 'include' })
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
            data = self.driver.execute_async_script(script, url, headers)
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
            time.sleep(0.3 + random.random() * 0.4)
        return all_matches
    
    def get_match_statistics(self, event_id):
        endpoint = f"/event/{event_id}/statistics"
        data = self.get_api_data(endpoint)
        if self._has_api_error(endpoint, data):
            return [] if self._is_missing_optional_response(data) else None
        return data.get('statistics', []) if isinstance(data, dict) else None
    
    def get_match_shotmap(self, event_id):
        """Get shotmap (xG data) for a match"""
        endpoint = f"/event/{event_id}/shotmap"
        data = self.get_api_data(endpoint)
        if self._has_api_error(endpoint, data):
            return [] if self._is_missing_optional_response(data) else None
        return data.get('shotmap', []) if isinstance(data, dict) else None
    
    def get_match_incidents(self, event_id):
        """Get incidents (goals, cards) for a match"""
        endpoint = f"/event/{event_id}/incidents"
        data = self.get_api_data(endpoint)
        if self._has_api_error(endpoint, data):
            return [] if self._is_missing_optional_response(data) else None
        return data.get('incidents', []) if isinstance(data, dict) else None

    def get_match_lineups(self, event_id):
        """Get formations and player lineups for a match when available."""
        endpoint = f"/event/{event_id}/lineups"
        data = self.get_api_data(endpoint)
        if self._has_api_error(endpoint, data):
            return {} if self._is_missing_optional_response(data) else None
        return data if isinstance(data, dict) else None

    
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

    def get_tournament_scheduled_events(self, tournament_id, date_ymd):
        endpoint = f"/unique-tournament/{tournament_id}/scheduled-events/{date_ymd}"
        data = self.get_api_data(endpoint)
        if self._has_api_error(endpoint, data):
            error = data.get('error') or {}
            if str(error.get('code')) == '404':
                if _truthy_env('SOFASCORE_VERBOSE_API_ERRORS'):
                    print(f"[DEBUG] no tournament schedule for {tournament_id}/{date_ymd}")
                return []
            print(f"[WARN] tournament scheduled-events {tournament_id}/{date_ymd}: Sofascore API error {error.get('code')} {error.get('reason')}")
            return None
        if not data or not isinstance(data, dict):
            return None
        return data.get('events', [])
