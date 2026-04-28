"""
Sofascore API Scraper using Selenium.
"""

import json
import os
import time
import random

from selenium import webdriver

try:
    from curl_cffi import requests as curl_requests
except ImportError:
    curl_requests = None


USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Brave/120',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
]

API_BASE_URL = "https://api.sofascore.com/api/v1"

VIEWPORTS = [
    (1920, 1080),
    (1366, 768),
    (1536, 864),
    (1440, 900),
    (1680, 1050),
]


def create_stealth_driver(headless=False):
    """Creates Chrome WebDriver with anti-detection measures. Returns (driver, user_agent)."""
    env_headless = os.environ.get('SOFASCORE_HEADLESS', '').lower() in ('1', 'true', 'yes')
    ci_without_display = os.environ.get('CI', '').lower() == 'true' and not os.environ.get('DISPLAY')
    headless = headless or env_headless or ci_without_display

    options = webdriver.ChromeOptions()
    
    user_agent = random.choice(USER_AGENTS)
    options.add_argument(f'--user-agent={user_agent}')

    width, height = random.choice(VIEWPORTS)
    options.add_argument(f'--window-size={width},{height}')

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
    return driver, user_agent


class SofascoreSeleniumScraper:
    def __init__(self, driver):
        self.driver = driver
        self.http_session = None
        self.http_user_agent = random.choice(USER_AGENTS)
        self.http_warmed_up = False
        self._http_debug_logged = set()

    def _get_http_session(self):
        if os.environ.get('SOFASCORE_CURL_CFFI', '1').lower() in ('0', 'false', 'no'):
            return None
        if curl_requests is None:
            return None
        if self.http_session is None:
            impersonate = os.environ.get('SOFASCORE_CURL_IMPERSONATE', 'chrome124')
            self.http_session = curl_requests.Session(impersonate=impersonate)
            self.http_session.headers.update({
                'User-Agent': self.http_user_agent,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Origin': 'https://www.sofascore.com',
                'Referer': 'https://www.sofascore.com/',
                'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-site',
            })
        return self.http_session

    def _warm_up_http_session(self, session):
        if self.http_warmed_up:
            return
        self.http_warmed_up = True
        try:
            session.get('https://www.sofascore.com/', timeout=20)
        except Exception as exc:
            print(f"[DEBUG] curl_cffi warmup: {type(exc).__name__}")

    def _get_api_data_http(self, endpoint):
        session = self._get_http_session()
        if session is None:
            return None

        self._warm_up_http_session(session)
        url = f"{API_BASE_URL}{endpoint}"
        for attempt in range(3):
            try:
                response = session.get(url, timeout=20)
                if response.status_code == 200:
                    return response.json()

                debug_key = (endpoint, response.status_code)
                if debug_key not in self._http_debug_logged:
                    print(f"[DEBUG] curl_cffi {endpoint}: HTTP {response.status_code}")
                    self._http_debug_logged.add(debug_key)
            except Exception as exc:
                debug_key = (endpoint, type(exc).__name__)
                if debug_key not in self._http_debug_logged:
                    print(f"[DEBUG] curl_cffi {endpoint}: {type(exc).__name__}")
                    self._http_debug_logged.add(debug_key)

            time.sleep(0.5 * (attempt + 1))

        return None

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
        data = self._get_api_data_http(endpoint)
        if data:
            return data

        url = f"{API_BASE_URL}{endpoint}"
        script = """
        var callback = arguments[arguments.length - 1];
        fetch('%s')
            .then(r => r.json())
            .then(data => callback(data))
            .catch(() => callback(null));
        """ % url
        try:
            data = self.driver.execute_async_script(script)
            if data:
                return data
        except Exception:
            pass

        try:
            self.driver.get(url)
            return self._read_json_from_page()
        except Exception:
            return None
    
    def get_seasons(self, tournament_id):
        data = self.get_api_data(f"/unique-tournament/{tournament_id}/seasons")
        return data.get('seasons', []) if data else []
    
    def get_season_matches(self, tournament_id, season_id, page=0):
        data = self.get_api_data(f"/unique-tournament/{tournament_id}/season/{season_id}/events/last/{page}")
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
        data = self.get_api_data(f"/unique-tournament/{tournament_id}/season/{season_id}/events/next/{page}")
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
    
    def get_match_odds(self, event_id):
        """Get pre-match odds for a match (1X2, Over/Under, BTTS)"""
        data = self.get_api_data(f"/event/{event_id}/odds/1/all")
        return data.get('markets', []) if data and isinstance(data, dict) else None

    def get_event_details(self, event_id):
        data = self.get_api_data(f"/event/{event_id}")
        return data.get('event', data) if data and isinstance(data, dict) else None

    def get_scheduled_events(self, date_ymd):
        data = self.get_api_data(f"/sport/football/scheduled-events/{date_ymd}")
        if not data or not isinstance(data, dict):
            return None
        events = data.get('events', [])
        if not events:
            print(f"[DEBUG] scheduled-events {date_ymd}: keys={list(data.keys())}")
        return events