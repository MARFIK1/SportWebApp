"""
Sofascore API Scraper using Selenium.
"""

import time
import random

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


def create_stealth_driver(headless=False):
    """Creates Chrome WebDriver with anti-detection measures. Returns (driver, user_agent)."""
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
    
    def get_api_data(self, endpoint):
        url = f"https://api.sofascore.com/api/v1{endpoint}"
        script = """
        var callback = arguments[arguments.length - 1];
        fetch('%s')
            .then(r => r.json())
            .then(data => callback(data))
            .catch(() => callback(null));
        """ % url
        try:
            return self.driver.execute_async_script(script)
        except:
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

