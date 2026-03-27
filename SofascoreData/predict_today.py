"""
Daily match prediction script.

Usage:
    python predict_today.py                    # Today's matches
    python predict_today.py 2026-02-08         # Specific date
    python predict_today.py --scrape           # Fetch upcoming matches from API
    python predict_today.py --update           # Update report with finished match results

Requires Chrome/Brave browser for scraping.
"""

import argparse
import json
import os
import sys
import warnings
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

warnings.filterwarnings('ignore', message='X does not have valid feature names')
warnings.filterwarnings('ignore', message='X has feature names')
warnings.filterwarnings('ignore', category=FutureWarning)
warnings.filterwarnings('ignore', message='Trying to unpickle estimator')

sys.path.insert(0, str(Path(__file__).parent))

from sofascore.features import MLFeatureGenerator

REPORTS_DIR = Path(__file__).parent / 'reports'


def safe_print(text):
    try:
        print(text)
    except UnicodeEncodeError:
        import unicodedata
        normalized = unicodedata.normalize('NFKD', text)
        ascii_text = normalized.encode('ascii', 'ignore').decode('ascii')
        print(ascii_text)


def load_models():
    import importlib.util
    
    spec = importlib.util.spec_from_file_location(
        "predictor", 
        str(Path(__file__).parent / "sofascore" / "predictor.py")
    )
    predictor_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(predictor_module)
    
    UniversalPredictor = predictor_module.UniversalPredictor
    
    data_dir = str(Path(__file__).parent / "data")
    predictor = UniversalPredictor(data_dir)
    
    models_path = Path(data_dir) / 'models' / 'universal_predictor.pkl'
    if models_path.exists():
        print(f"Loading models from {models_path}...")
        predictor.load_models(str(models_path))
    else:
        print("No saved models found. Training from scratch...")
        df = predictor.load_all_leagues()
        predictor.train_all_models(df)

        models_path.parent.mkdir(exist_ok=True)
        predictor.save_models(str(models_path))
    
    return predictor


COMP_TYPES = ['league', 'cups', 'european', 'international']


def iter_competition_dirs(base_dir=None):
    if base_dir is None:
        base_dir = Path(__file__).parent / 'data'
    else:
        base_dir = Path(base_dir)
    
    for comp_type in COMP_TYPES:
        type_dir = base_dir / comp_type
        if not type_dir.exists():
            continue
        
        for entry1 in sorted(type_dir.iterdir()):
            if not entry1.is_dir():
                continue
            
            if (entry1 / 'raw').exists():
                yield comp_type, entry1.name, entry1.name, entry1
            else:
                for entry2 in sorted(entry1.iterdir()):
                    if entry2.is_dir() and (entry2 / 'raw').exists():
                        yield comp_type, entry1.name, entry2.name, entry2


def _validate_season_name(comp_name: str, season_name: str) -> bool:
    def _tokenize(s):
        return set(s.lower().replace('_', ' ').replace('-', ' ').replace('/', ' ').split())

    comp_tokens = _tokenize(comp_name)
    season_tokens = _tokenize(season_name)

    comp_significant = {t for t in comp_tokens if len(t) > 2 and not t.isdigit()}
    season_significant = {t for t in season_tokens if len(t) > 2 and not t.isdigit()}

    if not comp_significant:
        return True  # Nothing to validate against

    for ct in comp_significant:
        for st in season_significant:
            if ct in st or st in ct:
                return True

    return False


def _is_scraped_today(comp_dir: Path) -> bool:
    upcoming_dir = comp_dir / 'raw' / 'upcoming'
    if not upcoming_dir.exists():
        return False
    for uf in upcoming_dir.glob('upcoming_*.json'):
        try:
            mtime = datetime.fromtimestamp(uf.stat().st_mtime)
            if mtime.date() == datetime.now().date():
                return True
        except Exception:
            pass
    return False




def find_matches_for_date(target_date: str) -> list:
    base_dir = Path(__file__).parent / 'data'
    seen_matches = {}  # match_key -> match data
    
    for comp_type, country, comp_name, comp_dir in iter_competition_dirs(base_dir):
        
        raw_dir = comp_dir / 'raw'
        if raw_dir.exists():
            for raw_file in sorted(raw_dir.glob('*.json')):
                if 'upcoming' in raw_file.name:
                    continue
                try:
                    with open(raw_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    for match in data.get('matches', []):
                        match_date = match.get('date', '')
                        if not match_date.startswith(target_date):
                            continue
                        
                        home = match.get('home_team')
                        away = match.get('away_team')
                        match_key = f"{comp_type}_{country}_{comp_name}_{home}_{away}"
                        
                        home_score = match.get('home_score')
                        away_score = match.get('away_score')
                        raw_status = match.get('status', '')

                        if raw_status == 'notstarted' and home_score is None and away_score is None:
                            continue
                        
                        if home_score is not None and away_score is not None:
                            if home_score > away_score:
                                result = 'H'
                            elif home_score < away_score:
                                result = 'A'
                            else:
                                result = 'D'
                            status = 'finished'
                        elif raw_status == 'postponed':
                            result = None
                            status = 'postponed'
                        elif raw_status == 'inprogress':
                            result = None
                            status = 'inprogress'
                        else:
                            result = None
                            status = 'upcoming'
                        
                        total_cards = None
                        total_corners = None
                        hy = match.get('home_yellow_cards_calc')
                        ay = match.get('away_yellow_cards_calc')
                        if hy is not None and ay is not None:
                            total_cards = int(hy) + int(ay)
                        hc = match.get('home_cornerkicks')
                        ac = match.get('away_cornerkicks')
                        if hc is not None and ac is not None:
                            total_corners = int(hc) + int(ac)

                        match_data = {
                            'comp_type': comp_type,
                            'country': country,
                            'league': comp_name,
                            'home': home,
                            'away': away,
                            'home_team_id': match.get('home_team_id'),
                            'away_team_id': match.get('away_team_id'),
                            'result': result,
                            'score': f"{home_score}-{away_score}" if home_score is not None else None,
                            'status': status,
                            'start_time': match.get('time', ''),
                            'features': None,
                            'total_cards': total_cards,
                            'total_corners': total_corners,
                            'referee_name': match.get('referee_name'),
                        }
                        
                        if match_key not in seen_matches:
                            seen_matches[match_key] = match_data
                        elif status == 'finished' and seen_matches[match_key]['status'] != 'finished':
                            seen_matches[match_key] = match_data
                except Exception:
                    pass
        
        features_file = comp_dir / 'features' / 'features_all_seasons.json'
        if features_file.exists():
            try:
                with open(features_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                for match in data.get('samples', []):
                    if match.get('date', '').startswith(target_date):
                        home = match.get('home_team')
                        away = match.get('away_team')
                        match_key = f"{comp_type}_{country}_{comp_name}_{home}_{away}"
                        
                        if match_key in seen_matches:
                            seen_matches[match_key]['features'] = match
                        else:
                            home_goals = match.get('label_home_goals')
                            away_goals = match.get('label_away_goals')
                            score = f"{home_goals}-{away_goals}" if home_goals is not None and away_goals is not None else None
                            
                            seen_matches[match_key] = {
                                'comp_type': comp_type,
                                'country': country,
                                'league': comp_name,
                                'home': match.get('home_team'),
                                'away': match.get('away_team'),
                                'home_team_id': match.get('home_team_id'),
                                'away_team_id': match.get('away_team_id'),
                                'result': match.get('label_result'),
                                'score': score,
                                'status': 'upcoming' if match.get('status') in ('upcoming', 'postponed', 'canceled') else 'finished',
                                'start_time': match.get('time', ''),
                                'features': match
                            }
            except Exception:
                pass
        
        upcoming_dir = comp_dir / 'raw' / 'upcoming'
        if upcoming_dir.exists():
            for upcoming_file in upcoming_dir.glob('*.json'):
                try:
                    with open(upcoming_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    file_season = data.get('metadata', {}).get('season', '')
                    if file_season and not _validate_season_name(comp_name, file_season):
                        continue

                    for match in data.get('matches', []):
                        if match.get('date', '').startswith(target_date):
                            home = match.get('home_team')
                            away = match.get('away_team')
                            match_key = f"{comp_type}_{country}_{comp_name}_{home}_{away}"
                            
                            if match_key not in seen_matches:
                                match_entry = {
                                    'comp_type': comp_type,
                                    'country': country,
                                    'league': comp_name,
                                    'home': home,
                                    'away': away,
                                    'home_team_id': match.get('home_team_id'),
                                    'away_team_id': match.get('away_team_id'),
                                    'result': None,
                                    'score': None,
                                    'status': 'upcoming',
                                    'start_time': match.get('time', ''),
                                    'features': None,
                                    'total_cards': None,
                                    'total_corners': None,
                                    'referee_name': match.get('referee_name'),
                                }
                                for ok in ['odds_home_win', 'odds_draw', 'odds_away_win',
                                           'odds_over_2_5', 'odds_under_2_5',
                                           'odds_btts_yes', 'odds_btts_no']:
                                    if match.get(ok):
                                        match_entry[ok] = match[ok]
                                seen_matches[match_key] = match_entry
                            elif match.get('referee_name') and not seen_matches[match_key].get('referee_name'):
                                seen_matches[match_key]['referee_name'] = match['referee_name']
                except Exception:
                    pass
    
    return list(seen_matches.values())


def scrape_upcoming(target_date: str = None, force: bool = False):
    from sofascore import (
        create_stealth_driver,
        SofascoreSeleniumScraper,
        FootballDataManager,
        MLFeatureGenerator,
        COMPETITIONS,
        BASE_DIR,
    )
    from sofascore.pipeline import scrape_upcoming_matches
    
    print("\n" + "="*70)
    print("FETCHING UPCOMING MATCHES FROM SOFASCORE")
    print("="*70)
    
    driver, user_agent = create_stealth_driver(headless=False)
    scraper = SofascoreSeleniumScraper(driver)
    
    driver.get("https://www.sofascore.com")
    import time
    time.sleep(3)
    
    try:
        for comp_type in COMP_TYPES:
            type_config = COMPETITIONS.get(comp_type, {})
            if not type_config:
                continue
            
            print(f"\n{'='*50}")
            print(f"  [{comp_type.upper()}]")
            print(f"{'='*50}")
            
            for country, country_comps in type_config.items():
                for comp_name, comp_data in country_comps.items():
                    tournament_id = comp_data.get('tournament_id')
                    if not tournament_id:
                        continue
                    
                    print(f"\n[{country}/{comp_name}]")
                    
                    dm = FootballDataManager(BASE_DIR, comp_type, country, comp_name)
                    comp_dir = Path(dm.competition_dir)
                    
                    if not force and _is_scraped_today(comp_dir):
                        print(f"  [CACHE] Already fetched today - skipping")
                        if target_date:
                            upcoming_dir = comp_dir / 'raw' / 'upcoming'
                            for uf in upcoming_dir.glob('upcoming_*.json'):
                                try:
                                    with open(uf, 'r', encoding='utf-8') as f:
                                        udata = json.load(f)
                                    n = sum(1 for m in udata.get('matches', [])
                                            if m.get('date', '').startswith(target_date))
                                    if n > 0:
                                        print(f"  Matches on {target_date}: {n}")
                                except Exception:
                                    pass
                        continue
                    
                    fg = MLFeatureGenerator(dm)
                    
                    seasons = scraper.get_seasons(tournament_id)
                    if not seasons:
                        print("  Failed to fetch seasons")
                        continue

                    current_season = seasons[0]
                    season_id = current_season['id']
                    season_name = current_season.get('name', f"Season {season_id}")

                    if not _validate_season_name(comp_name, season_name):
                        print(f"  [SKIP] API returned wrong season: '{season_name}' (expected: {comp_name})")
                        continue

                    print(f"  Season: {season_name} (ID: {season_id})")
                    
                    upcoming = scrape_upcoming_matches(
                        scraper, dm, fg, tournament_id, season_id, season_name
                    )
                    
                    if target_date and upcoming:
                        matches_for_date = [m for m in upcoming
                                            if m.get('date', '').startswith(target_date)]
                        print(f"  Matches on {target_date}: {len(matches_for_date)}")
                    
                    time.sleep(2)
    finally:
        driver.quit()
    
    print("\n[OK] Fetching complete")


def update_match_results(target_date: str):
    from sofascore import (
        create_stealth_driver,
        SofascoreSeleniumScraper,
        COMPETITIONS,
        BASE_DIR,
    )
    from datetime import datetime
    
    print("\n" + "="*70)
    print(f"UPDATING RESULTS FOR {target_date}")
    print("="*70)
    
    base_dir = Path(__file__).parent / 'data'
    
    comps_to_check = set()
    
    for comp_type, country, comp_name, comp_dir in iter_competition_dirs(base_dir):
        raw_dir = comp_dir / 'raw'
        if not raw_dir.exists():
            continue
        
        needs_update = False
        all_raw_files = list(raw_dir.glob('*.json'))
        upcoming_dir = raw_dir / 'upcoming'
        if upcoming_dir.exists():
            all_raw_files.extend(upcoming_dir.glob('*.json'))
        for raw_file in all_raw_files:
            try:
                with open(raw_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                for match in data.get('matches', []):
                    if match.get('date', '').startswith(target_date):
                        status = match.get('status', '')
                        has_score = match.get('home_score') is not None
                        if status in ('inprogress', 'upcoming', 'notstarted') or not has_score:
                            needs_update = True
                            break
                if needs_update:
                    break
            except Exception:
                continue

        if needs_update:
            comps_to_check.add((comp_type, country, comp_name))
    
    if not comps_to_check:
        print("No matches requiring update found.")
        return
    
    print(f"Competitions to check: {len(comps_to_check)}")
    for ct, c, l in sorted(comps_to_check):
        print(f"  - [{ct}] {c}/{l}")
    
    driver, user_agent = create_stealth_driver(headless=False)
    scraper = SofascoreSeleniumScraper(driver)
    
    driver.get("https://www.sofascore.com")
    import time
    time.sleep(3)
    
    updated_count = 0
    
    try:
        for comp_type, country, comp_name in sorted(comps_to_check):
            comp_config = COMPETITIONS.get(comp_type, {}).get(country, {}).get(comp_name, {})
            tournament_id = comp_config.get('tournament_id')
            if not tournament_id:
                for cfg_country, cfg_comps in COMPETITIONS.get(comp_type, {}).items():
                    if comp_name in cfg_comps:
                        comp_config = cfg_comps[comp_name]
                        tournament_id = comp_config.get('tournament_id')
                        country = cfg_country  # overwrite with correct key
                        break
            if not tournament_id:
                print(f"\n[{country}/{comp_name}] Missing tournament_id config")
                continue
            
            print(f"\n[{comp_type}/{country}/{comp_name}]")
            
            seasons = scraper.get_seasons(tournament_id)
            if not seasons:
                print("  Failed to fetch seasons")
                continue
            
            current_season = seasons[0]
            season_id = current_season['id']
            season_name = current_season.get('name', f"Season {season_id}")

            if not _validate_season_name(comp_name, season_name):
                print(f"  [SKIP] API returned wrong season: '{season_name}' (expected: {comp_name})")
                continue

            print(f"  Season: {season_name}")

            all_api_matches = scraper.get_all_season_matches(tournament_id, season_id)
            
            date_matches = []
            for m in all_api_matches:
                match_ts = m.get('startTimestamp', 0)
                match_date = datetime.fromtimestamp(match_ts).strftime('%Y-%m-%d')
                if match_date == target_date:
                    date_matches.append(m)
            
            print(f"  Matches from API for {target_date}: {len(date_matches)}")
            
            if not date_matches:
                continue
            
            updated_matches = set()
            
            if comp_type == 'european':
                raw_dir = base_dir / comp_type / comp_name / 'raw'
            else:
                raw_dir = base_dir / comp_type / country / comp_name / 'raw'
            
            all_files = list(raw_dir.glob('*.json'))
            upcoming_sub = raw_dir / 'upcoming'
            if upcoming_sub.exists():
                all_files.extend(upcoming_sub.glob('*.json'))

            for raw_file in all_files:
                try:
                    with open(raw_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                except Exception:
                    continue

                matches = data.get('matches', [])
                modified = False

                for idx, match in enumerate(matches):
                    if not match.get('date', '').startswith(target_date):
                        continue

                    home_id = match.get('home_team_id')
                    away_id = match.get('away_team_id')
                    match_key = f"{home_id}_{away_id}"

                    if match_key in updated_matches:
                        continue

                    for api_m in date_matches:
                        api_home_id = api_m.get('homeTeam', {}).get('id')
                        api_away_id = api_m.get('awayTeam', {}).get('id')

                        if api_home_id == home_id and api_away_id == away_id:
                            api_status = api_m.get('status', {}).get('type', '')
                            home_score = api_m.get('homeScore', {}).get('current')
                            away_score = api_m.get('awayScore', {}).get('current')

                            if api_status == 'finished' and home_score is not None:
                                match['home_score'] = home_score
                                match['away_score'] = away_score
                                match['status'] = 'finished'

                                event_id = api_m.get('id') or match.get('event_id')
                                if event_id and match.get('home_yellow_cards_calc') is None:
                                    try:
                                        stats = scraper.get_match_statistics(event_id)
                                        if stats:
                                            from sofascore.utils import extract_statistics
                                            stat_data = extract_statistics(stats, period='ALL')
                                            match.update(stat_data)
                                        time.sleep(0.3)

                                        incidents = scraper.get_match_incidents(event_id)
                                        if incidents:
                                            match['home_yellow_cards_calc'] = sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'yellow' and i.get('isHome'))
                                            match['away_yellow_cards_calc'] = sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'yellow' and not i.get('isHome'))
                                            match['home_red_cards_calc'] = sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'red' and i.get('isHome'))
                                            match['away_red_cards_calc'] = sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'red' and not i.get('isHome'))
                                        time.sleep(0.3)
                                    except Exception as e:
                                        print(f"    [WARN] Failed to fetch statistics: {e}")

                                matches[idx] = match
                                modified = True
                                updated_count += 1
                                updated_matches.add(match_key)
                                print(f"    OK {match.get('home_team')} {home_score}-{away_score} {match.get('away_team')}")
                            elif api_status == 'postponed':
                                match['status'] = 'postponed'
                                matches[idx] = match
                                modified = True
                                updated_matches.add(match_key)
                                print(f"    PP {match.get('home_team')} vs {match.get('away_team')} - POSTPONED")
                            elif api_status == 'inprogress':
                                print(f"    .. {match.get('home_team')} vs {match.get('away_team')} - IN PROGRESS")
                            break

                if modified:
                    data['matches'] = matches
                    if data.get('metadata'):
                        data['metadata']['last_update'] = datetime.now().isoformat()
                    with open(raw_file, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
            
            time.sleep(1)
    
    finally:
        driver.quit()
    
    print(f"\n[OK] Updated {updated_count} matches")


def load_historical_matches(comp_type: str, country: str, league: str) -> list:
    base_dir = Path(__file__).parent / 'data'
    
    if comp_type == 'european':
        league_dir = base_dir / comp_type / league
    else:
        league_dir = base_dir / comp_type / country / league
    
    if not league_dir.exists():
        return []
    
    all_matches = []
    
    processed_dir = league_dir / 'processed'
    if processed_dir.exists():
        for pf in processed_dir.glob('*.json'):
            if 'h2h' in pf.name:
                continue
            try:
                with open(pf, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                matches = data.get('matches', [])
                all_matches.extend(matches)
            except:
                pass
    
    raw_dir = league_dir / 'raw'
    if raw_dir.exists():
        for rf in raw_dir.glob('*.json'):
            if 'upcoming' in rf.name:
                continue
            try:
                with open(rf, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                matches = data.get('matches', [])
                all_matches.extend(matches)
            except:
                pass
    
    seen_ids = set()
    unique_matches = []
    for m in all_matches:
        eid = m.get('event_id')
        if eid and eid not in seen_ids:
            seen_ids.add(eid)
            unique_matches.append(m)
    
    return unique_matches


def compute_features_for_upcoming(match: dict, historical_matches: list) -> dict:
    class DummyDM:
        pass
    
    fg = MLFeatureGenerator(DummyDM())
    
    home_id = match.get('home_team_id') or 0
    away_id = match.get('away_team_id') or 0
    upcoming_match = {
        'event_id': home_id * 1000 + away_id,
        'date': match.get('date', datetime.now().strftime('%Y-%m-%d')),
        'round': 0,
        'home_team': match['home'],
        'away_team': match['away'],
    }
    for odds_key in ['odds_home_win', 'odds_draw', 'odds_away_win',
                     'odds_over_2_5', 'odds_under_2_5',
                     'odds_btts_yes', 'odds_btts_no']:
        if match.get(odds_key):
            upcoming_match[odds_key] = match[odds_key]
    
    features = fg.generate_match_features(upcoming_match, historical_matches)
    return features


def _team_last_n_matches(historical: list, team: str, n: int = 8, before_date: str = None) -> list:
    team_matches = []
    for m in historical:
        if m.get('home_score') is None or m.get('away_score') is None:
            continue
        if m.get('home_team') == team or m.get('away_team') == team:
            if before_date and m.get('date', '') >= before_date:
                continue
            team_matches.append(m)
    team_matches.sort(key=lambda x: x.get('date', ''), reverse=True)
    return team_matches[:n]


def _safe_avg(values: list) -> float:
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else 0.0


def _safe_pct(count: int, total: int) -> float:
    return round(100 * count / total, 1) if total > 0 else 0.0


def _poisson_over(expected: float, threshold: float) -> float:
    """P(X > threshold) from Poisson distribution. Returns 0-100."""
    if expected <= 0:
        return 0.0
    import math
    k = int(threshold)  # e.g. 8.5 -> 8, 2.5 -> 2
    cdf = 0.0
    for i in range(k + 1):
        cdf += (expected ** i) * math.exp(-expected) / math.factorial(i)
    return round((1 - cdf) * 100, 1)


def compute_match_analysis(match: dict, historical: list) -> dict:
    home = match.get('home', '')
    away = match.get('away', '')
    match_date = match.get('date', datetime.now().strftime('%Y-%m-%d'))
    
    N = 8
    home_matches = _team_last_n_matches(historical, home, N, match_date)
    away_matches = _team_last_n_matches(historical, away, N, match_date)
    
    if not home_matches and not away_matches:
        return {}
    
    analysis = {}
    
    def _goals_stats(matches, team):
        scored = []
        conceded = []
        xg_for = []
        xg_against = []
        
        for m in matches:
            hs = m.get('home_score', 0) or 0
            as_ = m.get('away_score', 0) or 0
            is_home = m.get('home_team') == team
            
            gf = hs if is_home else as_
            ga = as_ if is_home else hs
            scored.append(gf)
            conceded.append(ga)
            
            xg_h = m.get('home_expectedgoals') or m.get('home_xg')
            xg_a = m.get('away_expectedgoals') or m.get('away_xg')
            if xg_h is not None and xg_a is not None:
                xg_for.append(float(xg_h) if is_home else float(xg_a))
                xg_against.append(float(xg_a) if is_home else float(xg_h))
        
        n = len(matches)
        n_scored = len(scored)
        return {
            'avg_scored': round(_safe_avg(scored), 2),
            'avg_conceded': round(_safe_avg(conceded), 2),
            'clean_sheets': sum(1 for g in conceded if g == 0),
            'failed_to_score': sum(1 for g in scored if g == 0),
            'score_pct': round(100 * sum(1 for g in scored if g > 0) / n_scored, 1) if n_scored > 0 else 0,
            'avg_xg_for': round(_safe_avg(xg_for), 2),
            'avg_xg_against': round(_safe_avg(xg_against), 2),
            'n': n,
        }
    
    home_goals = _goals_stats(home_matches, home)
    away_goals = _goals_stats(away_matches, away)
    
    expected_home = home_goals['avg_xg_for'] if home_goals['avg_xg_for'] > 0 else home_goals['avg_scored']
    expected_away = away_goals['avg_xg_for'] if away_goals['avg_xg_for'] > 0 else away_goals['avg_scored']
    expected_total = round(expected_home + expected_away, 2)
    
    home_scores_pct = home_goals['score_pct'] / 100.0
    away_scores_pct = away_goals['score_pct'] / 100.0
    btts_pct = round(home_scores_pct * away_scores_pct * 100, 1)
    
    analysis['goals'] = {
        'home': home_goals,
        'away': away_goals,
        'expected_goals_home': round(expected_home, 2),
        'expected_goals_away': round(expected_away, 2),
        'expected_total': expected_total,
        'btts_pct': btts_pct,
        'over_1_5_pct': _poisson_over(expected_total, 1.5),
        'over_2_5_pct': _poisson_over(expected_total, 2.5),
        'over_3_5_pct': _poisson_over(expected_total, 3.5),
    }
    
    def _corners_stats(matches, team):
        corners_for = []
        corners_against = []
        for m in matches:
            hc = m.get('home_cornerkicks')
            ac = m.get('away_cornerkicks')
            if hc is None or ac is None:
                continue
            is_home = m.get('home_team') == team
            corners_for.append(hc if is_home else ac)
            corners_against.append(ac if is_home else hc)
        return {
            'avg_for': round(_safe_avg(corners_for), 1),
            'avg_against': round(_safe_avg(corners_against), 1),
            'n': len(corners_for),
        }
    
    home_corners = _corners_stats(home_matches, home)
    away_corners = _corners_stats(away_matches, away)
    
    expected_corners = round(home_corners['avg_for'] + away_corners['avg_for'], 1)
    
    analysis['corners'] = {
        'home': home_corners,
        'away': away_corners,
        'expected_total': expected_corners,
        'over_8_5_pct': _poisson_over(expected_corners, 8.5),
        'over_10_5_pct': _poisson_over(expected_corners, 10.5),
    }
    
    def _cards_stats(matches, team):
        yellows = []
        for m in matches:
            hy = m.get('home_yellow_cards_calc') or m.get('home_yellowcards')
            ay = m.get('away_yellow_cards_calc') or m.get('away_yellowcards')
            if hy is None or ay is None:
                continue
            is_home = m.get('home_team') == team
            yellows.append(hy if is_home else ay)
        return {
            'avg_team': round(_safe_avg(yellows), 1),
            'n': len(yellows),
        }
    
    home_cards = _cards_stats(home_matches, home)
    away_cards = _cards_stats(away_matches, away)
    
    expected_cards = round(home_cards['avg_team'] + away_cards['avg_team'], 1)
    
    analysis['cards'] = {
        'home': home_cards,
        'away': away_cards,
        'expected_total': expected_cards,
        'over_3_5_pct': _poisson_over(expected_cards, 3.5),
        'over_4_5_pct': _poisson_over(expected_cards, 4.5),
    }
    
    def _shots_stats(matches, team):
        shots_for = []
        shots_on_target = []
        big_chances = []
        possession = []
        for m in matches:
            is_home = m.get('home_team') == team
            prefix = 'home_' if is_home else 'away_'
            
            st = m.get(f'{prefix}totalshotsongoal') or m.get(f'{prefix}shotsongoal')
            if st is not None:
                shots_for.append(st)
            sot = m.get(f'{prefix}shotsongoal')
            if sot is not None:
                shots_on_target.append(sot)
            bc = m.get(f'{prefix}bigchancecreated')
            if bc is not None:
                big_chances.append(bc)
            poss = m.get(f'{prefix}ballpossession')
            if poss is not None:
                possession.append(poss)
        
        return {
            'avg_shots': round(_safe_avg(shots_for), 1),
            'avg_shots_on_target': round(_safe_avg(shots_on_target), 1),
            'avg_big_chances': round(_safe_avg(big_chances), 1),
            'avg_possession': round(_safe_avg(possession), 1),
            'n': len(shots_for),
        }
    
    home_shots = _shots_stats(home_matches, home)
    away_shots = _shots_stats(away_matches, away)
    
    analysis['shots'] = {
        'home': home_shots,
        'away': away_shots,
    }
    
    def _form_string(matches, team, n=5):
        form = []
        for m in matches[:n]:
            hs = m.get('home_score', 0) or 0
            as_ = m.get('away_score', 0) or 0
            is_home = m.get('home_team') == team
            gf = hs if is_home else as_
            ga = as_ if is_home else hs
            if gf > ga:
                form.append('W')
            elif gf == ga:
                form.append('D')
            else:
                form.append('L')
        return ''.join(form)
    
    analysis['form'] = {
        'home': _form_string(home_matches, home),
        'away': _form_string(away_matches, away),
        'home_n': len(home_matches),
        'away_n': len(away_matches),
    }
    
    return analysis


def predict_matches(matches: list, predictor) -> list:
    results = []
    total = len(matches)
    
    historical_cache = {}
    
    for i, match in enumerate(matches, 1):
        safe_print(f"  [{i}/{total}] {match.get('home', '?')} vs {match.get('away', '?')}...")
        
        comp_type = match.get('comp_type', 'league')
        cache_key = f"{comp_type}/{match['country']}/{match['league']}"
        if cache_key not in historical_cache:
            historical_cache[cache_key] = load_historical_matches(
                comp_type, match['country'], match['league']
            )
        
        if match.get('status') == 'upcoming' or match.get('features') is None:
            features = compute_features_for_upcoming(match, historical_cache[cache_key])
        else:
            features = match['features']
        
        if features is None:
            print(f"    [SKIP] No features")
            continue
        
        all_target_preds = {}
        for target_name in predictor.models.keys():
            feat_cols = predictor.feature_columns_by_target.get(target_name, predictor.feature_columns)
            target_features = {col: features.get(col, 0) for col in feat_cols}
            all_target_preds[target_name] = predictor.predict_match_all_models(target_features, target_name)

        preds = all_target_preds.get('result', {})

        market_predictions = {}
        for t_name, t_preds in all_target_preds.items():
            if t_name != 'result':
                market_predictions[t_name] = t_preds

        _consistency_pairs = [
            ('over_1_5', 'over_2_5'),
            ('corners_over_8_5', 'corners_over_10_5'),
            ('cards_over_3_5', 'cards_over_4_5'),
        ]
        for lower_target, higher_target in _consistency_pairs:
            low_cons = market_predictions.get(lower_target, {}).get('consensus', {})
            high_cons = market_predictions.get(higher_target, {}).get('consensus', {})
            if not low_cons or not high_cons:
                continue

            low_pred = low_cons.get('prediction', '')
            high_pred = high_cons.get('prediction', '')

            if low_pred == 'UNDER' and high_pred == 'OVER':
                low_agree = low_cons.get('agreement', 0)
                high_agree = high_cons.get('agreement', 0)
                if low_agree >= high_agree:
                    high_cons['prediction'] = 'UNDER'
                else:
                    low_cons['prediction'] = 'OVER'

            if high_cons.get('prediction') == 'OVER' and low_cons.get('prediction') == 'UNDER':
                low_cons['prediction'] = 'OVER'

            low_avg = low_cons.get('avg_probabilities', {})
            high_avg = high_cons.get('avg_probabilities', {})
            if low_avg and high_avg:
                low_over = low_avg.get('OVER', 50)
                high_over = high_avg.get('OVER', 50)
                if high_over > low_over:
                    corrected = round((low_over + high_over) / 2, 1)
                    low_avg['OVER'] = round(max(corrected + 2, low_over), 1)
                    low_avg['UNDER'] = round(100 - low_avg['OVER'], 1)
                    high_avg['OVER'] = round(min(corrected - 2, high_over), 1)
                    high_avg['UNDER'] = round(100 - high_avg['OVER'], 1)

        hist = historical_cache.get(cache_key, [])
        match_analysis = compute_match_analysis(match, hist)

        results.append({
            'match': match,
            'predictions': preds,
            'market_predictions': market_predictions,
            'analysis': match_analysis,
        })
    
    print(f"  Done! Predictions for {len(results)} matches.")
    return results


def _compute_avg_probs(preds: dict) -> dict:
    cons = preds.get('consensus', {})
    avg = cons.get('avg_probabilities', {})
    if avg:
        return avg
    all_probs = [p.get('probabilities', {}) for k, p in preds.items()
                 if k != 'consensus' and p.get('probabilities')]
    if all_probs:
        return {
            'HOME': round(sum(p.get('HOME', 0) for p in all_probs) / len(all_probs), 1),
            'DRAW': round(sum(p.get('DRAW', 0) for p in all_probs) / len(all_probs), 1),
            'AWAY': round(sum(p.get('AWAY', 0) for p in all_probs) / len(all_probs), 1),
        }
    return {}


def _print_analysis(analysis: dict, home: str, away: str, indent: str = '     '):
    if not analysis:
        return
    
    goals = analysis.get('goals', {})
    hg = goals.get('home', {})
    ag = goals.get('away', {})
    
    if not hg and not ag:
        return
    
    print(f"{indent}")
    print(f"{indent}--- STATISTICAL ANALYSIS (last {hg.get('n', '?')}/{ag.get('n', '?')} matches) ---")
    
    form = analysis.get('form', {})
    if form.get('home') or form.get('away'):
        print(f"{indent}Form:           {home}: {form.get('home', '?')}   |   {away}: {form.get('away', '?')}")
    
    print(f"{indent}")
    print(f"{indent}GOALS:")
    print(f"{indent}  Avg. scored:       {home}: {hg.get('avg_scored', 0):.1f}   |   {away}: {ag.get('avg_scored', 0):.1f}")
    print(f"{indent}  Avg. conceded:     {home}: {hg.get('avg_conceded', 0):.1f}   |   {away}: {ag.get('avg_conceded', 0):.1f}")
    
    if hg.get('avg_xg_for', 0) > 0 or ag.get('avg_xg_for', 0) > 0:
        print(f"{indent}  Avg. xG:           {home}: {hg.get('avg_xg_for', 0):.2f}   |   {away}: {ag.get('avg_xg_for', 0):.2f}")
    
    print(f"{indent}  Expected goals:    {home}: {goals.get('expected_goals_home', '?')}  |  {away}: {goals.get('expected_goals_away', '?')}  |  TOTAL: {goals.get('expected_total', '?')}")
    print(f"{indent}  Clean sheets:      {home}: {hg.get('clean_sheets', 0)}/{hg.get('n', 0)}   |   {away}: {ag.get('clean_sheets', 0)}/{ag.get('n', 0)}")
    print(f"{indent}  Failed to score:   {home}: {hg.get('failed_to_score', 0)}/{hg.get('n', 0)}   |   {away}: {ag.get('failed_to_score', 0)}/{ag.get('n', 0)}")
    
    print(f"{indent}")
    print(f"{indent}GOAL MARKETS (Poisson, expected: {goals.get('expected_total', '?')} goals):")
    print(f"{indent}  BTTS (both score):      {goals.get('btts_pct', 0):.0f}%")
    print(f"{indent}  Over 1.5 goals:         {goals.get('over_1_5_pct', 0):.0f}%")
    print(f"{indent}  Over 2.5 goals:         {goals.get('over_2_5_pct', 0):.0f}%")
    print(f"{indent}  Over 3.5 goals:         {goals.get('over_3_5_pct', 0):.0f}%")
    
    shots = analysis.get('shots', {})
    hs = shots.get('home', {})
    as_ = shots.get('away', {})
    if hs.get('n', 0) > 0 or as_.get('n', 0) > 0:
        print(f"{indent}")
        print(f"{indent}SHOTS AND POSSESSION:")
        print(f"{indent}  Avg. shots:        {home}: {hs.get('avg_shots', 0):.1f}   |   {away}: {as_.get('avg_shots', 0):.1f}")
        print(f"{indent}  Avg. on target:    {home}: {hs.get('avg_shots_on_target', 0):.1f}   |   {away}: {as_.get('avg_shots_on_target', 0):.1f}")
        print(f"{indent}  Avg. big chances:  {home}: {hs.get('avg_big_chances', 0):.1f}   |   {away}: {as_.get('avg_big_chances', 0):.1f}")
        if hs.get('avg_possession', 0) > 0 or as_.get('avg_possession', 0) > 0:
            print(f"{indent}  Avg. possession:   {home}: {hs.get('avg_possession', 0):.0f}%   |   {away}: {as_.get('avg_possession', 0):.0f}%")
    
    corners = analysis.get('corners', {})
    hc = corners.get('home', {})
    ac = corners.get('away', {})
    if hc.get('n', 0) > 0 or ac.get('n', 0) > 0:
        print(f"{indent}")
        print(f"{indent}CORNERS (Poisson, expected: {corners.get('expected_total', '?')}):")
        print(f"{indent}  Avg. own:          {home}: {hc.get('avg_for', 0):.1f}   |   {away}: {ac.get('avg_for', 0):.1f}")
        print(f"{indent}  Avg. conceded:     {home}: {hc.get('avg_against', 0):.1f}   |   {away}: {ac.get('avg_against', 0):.1f}")
        print(f"{indent}  Over 8.5:          {corners.get('over_8_5_pct', 0):.0f}%")
        print(f"{indent}  Over 10.5:         {corners.get('over_10_5_pct', 0):.0f}%")
    
    cards = analysis.get('cards', {})
    hcard = cards.get('home', {})
    acard = cards.get('away', {})
    if hcard.get('n', 0) > 0 or acard.get('n', 0) > 0:
        print(f"{indent}")
        print(f"{indent}CARDS (Poisson, expected: {cards.get('expected_total', '?')}):")
        print(f"{indent}  Avg. own:          {home}: {hcard.get('avg_team', 0):.1f}   |   {away}: {acard.get('avg_team', 0):.1f}")
        print(f"{indent}  Over 3.5:          {cards.get('over_3_5_pct', 0):.0f}%")
        print(f"{indent}  Over 4.5:          {cards.get('over_4_5_pct', 0):.0f}%")


def print_predictions(results: list, target_date: str):
    print("\n" + "="*100)
    print(f"PREDICTIONS FOR {target_date}")
    print("="*100)
    
    if not results:
        print("\nNo matches to predict for this day.")
        print("Use --scrape to fetch upcoming matches from Sofascore API.")
        return
    
    by_league = {}
    for r in results:
        key = f"{r['match']['country']}/{r['match']['league']}"
        if key not in by_league:
            by_league[key] = []
        by_league[key].append(r)
    
    for league, league_results in sorted(by_league.items()):
        print(f"\n{'='*80}")
        print(f"  {league.upper()}")
        print(f"{'='*80}")
        
        for r in league_results:
            m = r['match']
            preds = r['predictions']
            cons = preds.get('consensus', {})
            
            match_status = m.get('status', '')
            if m['result']:
                status = "FINISHED"
            elif match_status == 'postponed':
                status = "POSTPONED"
            elif match_status == 'inprogress':
                status = "IN PROGRESS"
            else:
                status = "UPCOMING"
            actual = f" (Score: {m['result']})" if m['result'] else ""
            
            safe_print(f"\n  * {m['home']} vs {m['away']}{actual}")
            print(f"     Status: {status}")
            
            votes = cons.get('votes', {})
            if votes:
                print(f"     Model votes:   HOME: {votes.get('HOME', 0)}  |  DRAW: {votes.get('DRAW', 0)}  |  AWAY: {votes.get('AWAY', 0)}")

            pred = cons.get('prediction', '?')
            pct = cons.get('agreement_pct', 0)
            print(f"     Prediction: {pred} ({pct:.0f}% models agree)")

            probs = _compute_avg_probs(preds)
            if probs:
                max_key = max(probs, key=lambda k: probs.get(k, 0))
                parts = []
                for label in ['HOME', 'DRAW', 'AWAY']:
                    val = probs.get(label, 0)
                    marker = ' <<' if label == max_key else ''
                    parts.append(f"{label}: {val:.1f}%{marker}")
                print(f"     Avg. probs:    {' | '.join(parts)}")

            market_preds = r.get('market_predictions', {})
            if market_preds:
                mkt_parts = []
                mkt_labels = {
                    'btts': 'BTTS', 'over_2_5': 'Over 2.5', 'over_1_5': 'Over 1.5',
                    'corners_over_8_5': 'Corners >8.5', 'corners_over_10_5': 'Corners >10.5',
                    'cards_over_3_5': 'Cards >3.5', 'cards_over_4_5': 'Cards >4.5',
                }
                for mk, ml in mkt_labels.items():
                    mk_data = market_preds.get(mk, {})
                    mk_cons = mk_data.get('consensus', {})
                    mk_pred = mk_cons.get('prediction')
                    if mk_pred:
                        mk_probs = mk_cons.get('avg_probabilities', {})
                        prob_v = mk_probs.get(mk_pred, 0)
                        mkt_parts.append(f"{ml}: {mk_pred} ({prob_v:.0f}%)")
                if mkt_parts:
                    print(f"     Markets:       {' | '.join(mkt_parts)}")

                reg_labels = {
                    'total_goals': 'Goals (pred.)',
                    'total_corners': 'Corners (pred.)',
                    'total_cards': 'Cards (pred.)',
                }
                reg_parts = []
                for rk, rl in reg_labels.items():
                    rk_data = market_preds.get(rk, {})
                    rk_cons = rk_data.get('consensus', {})
                    rk_pred = rk_cons.get('prediction')
                    if rk_pred is not None:
                        try:
                            reg_parts.append(f"{rl}: {float(rk_pred):.1f}")
                        except (ValueError, TypeError):
                            pass
                if reg_parts:
                    print(f"     Regression:    {' | '.join(reg_parts)}")

            _print_analysis(r.get('analysis', {}), m['home'], m['away'])

    print("\n" + "="*100)
    print("SUMMARY")
    print("="*100)

    total = len(results)
    finished = sum(1 for r in results if r['match']['result'])
    postponed = sum(1 for r in results if r['match'].get('status') == 'postponed')
    inprogress = sum(1 for r in results if r['match'].get('status') == 'inprogress')
    upcoming = total - finished - postponed - inprogress
    
    print(f"Total matches: {total}")
    print(f"  - Finished: {finished}")
    if postponed > 0:
        print(f"  - Postponed: {postponed}")
    if inprogress > 0:
        print(f"  - In progress: {inprogress}")
    print(f"  - Upcoming: {upcoming}")
    
    if finished > 0:
        correct = 0
        for r in results:
            if r['match']['result']:
                actual = r['match']['result']
                pred = r['predictions']['consensus']['prediction']
                actual_mapped = {'H': 'HOME', 'D': 'DRAW', 'A': 'AWAY'}.get(actual, actual)
                if pred == actual_mapped:
                    correct += 1
        print(f"\nAccuracy (finished): {correct}/{finished} ({100*correct/finished:.1f}%)")


def _date_dir(target_date: str) -> Path:
    d = REPORTS_DIR / target_date
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_report_path(target_date: str, status: str = None) -> Path:
    date_dir = _date_dir(target_date)

    if status:
        return date_dir / f"predictions_{status}.json"

    for s in ['finished', 'unfinished']:
        new_path = date_dir / f"predictions_{s}.json"
        if new_path.exists():
            return new_path
        old_path = REPORTS_DIR / f"predictions_{target_date}_{s}.json"
        if old_path.exists():
            return old_path

    return date_dir / f"predictions_unfinished.json"


def load_existing_report(target_date: str) -> Optional[Dict]:
    date_dir = REPORTS_DIR / target_date
    for status in ['finished', 'unfinished']:
        path = date_dir / f"predictions_{status}.json"
        if path.exists():
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        old_path = REPORTS_DIR / f"predictions_{target_date}_{status}.json"
        if old_path.exists():
            with open(old_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    return None


def map_result_to_label(result: str) -> str:
    mapping = {'H': 'HOME', 'D': 'DRAW', 'A': 'AWAY'}
    return mapping.get(result, result)


def calculate_model_accuracy(matches: List[Dict]) -> Dict:
    accuracy = {}
    
    model_names = set()
    for m in matches:
        if m.get('predictions'):
            model_names.update(m['predictions'].keys())
    model_names.discard('consensus')
    model_names = sorted(model_names)
    model_names.append('consensus')  # Consensus at the end
    
    for model in model_names:
        correct = 0
        incorrect = 0
        total = 0
        
        for m in matches:
            if m.get('status') != 'finished' or not m.get('actual_result'):
                continue
            
            preds = m.get('predictions', {})
            if model not in preds:
                continue
            
            pred = preds[model].get('prediction')
            actual = m['actual_result']
            
            if pred and actual:
                total += 1
                if pred == actual:
                    correct += 1
                else:
                    incorrect += 1
        
        if total > 0:
            accuracy[model] = {
                'correct': correct,
                'incorrect': incorrect,
                'total': total,
                'accuracy_pct': round(100 * correct / total, 1)
            }
    
    return accuracy


def create_report_from_results(results: List[Dict], target_date: str) -> Dict:
    matches = []
    
    for r in results:
        m = r['match']
        preds = r['predictions']
        
        comp_type = m.get('comp_type', 'league')
        match_id = f"{comp_type}_{m['country']}_{m['league']}_{m['home']}_vs_{m['away']}".replace(' ', '_')
        
        is_finished = m.get('result') is not None
        actual_result = map_result_to_label(m['result']) if m.get('result') else None
        
        predictions_data = {}
        for model_name, pred_data in preds.items():
            if model_name == 'consensus':
                continue
            
            model_pred = pred_data.get('prediction')
            is_correct = None
            if is_finished and model_pred and actual_result:
                is_correct = (model_pred == actual_result)
            
            predictions_data[model_name] = {
                'prediction': model_pred,
                'confidence': pred_data.get('confidence'),
                'probabilities': pred_data.get('probabilities', {}),
                'correct': is_correct
            }
        
        cons = preds.get('consensus', {})
        cons_pred = cons.get('prediction')
        cons_correct = None
        if is_finished and cons_pred and actual_result:
            cons_correct = (cons_pred == actual_result)
        
        consensus_data = {
            'prediction': cons_pred,
            'agreement': cons.get('agreement'),
            'agreement_pct': cons.get('agreement_pct'),
            'votes': cons.get('votes', {}),
            'avg_probabilities': cons.get('avg_probabilities', {}),
            'correct': cons_correct
        }
        
        if is_finished:
            match_status = 'finished'
        elif m.get('status') in ['postponed', 'inprogress']:
            match_status = m.get('status')
        else:
            match_status = 'upcoming'
        
        market_data = {}
        for target_name, target_preds in r.get('market_predictions', {}).items():
            target_models = {}
            for model_name, pred_data in target_preds.items():
                if model_name == 'consensus':
                    continue
                target_models[model_name] = {
                    'prediction': pred_data.get('prediction'),
                    'confidence': pred_data.get('confidence'),
                    'probabilities': pred_data.get('probabilities', {}),
                }
            target_cons = target_preds.get('consensus', {})
            market_data[target_name] = {
                'models': target_models,
                'consensus': {
                    'prediction': target_cons.get('prediction'),
                    'agreement': target_cons.get('agreement'),
                    'agreement_pct': target_cons.get('agreement_pct'),
                    'avg_probabilities': target_cons.get('avg_probabilities', {}),
                },
            }

        match_entry = {
            'id': match_id,
            'league': f"{m['country']}/{m['league']}",
            'comp_type': comp_type,
            'home_team': m['home'],
            'away_team': m['away'],
            'start_time': m.get('start_time', ''),
            'status': match_status,
            'actual_result': actual_result,
            'actual_score': m.get('score'),
            'actual_cards': m.get('total_cards'),
            'actual_corners': m.get('total_corners'),
            'referee_name': m.get('referee_name'),
            'predictions': predictions_data,
            'consensus': consensus_data,
        }
        if market_data:
            match_entry['market_predictions'] = market_data

        matches.append(match_entry)

    today = datetime.now().strftime('%Y-%m-%d')
    if target_date < today:
        for m_entry in matches:
            if m_entry['status'] == 'upcoming':
                m_entry['status'] = 'unknown'
                print(f"  [WARN] Match {m_entry['home_team']} vs {m_entry['away_team']} - no result after match date, marked as 'unknown'")

    total = len(matches)
    finished = sum(1 for m in matches if m['status'] == 'finished')
    postponed = sum(1 for m in matches if m['status'] == 'postponed')
    inprogress = sum(1 for m in matches if m['status'] == 'inprogress')
    unknown = sum(1 for m in matches if m['status'] == 'unknown')
    pending = total - finished - postponed - unknown

    all_finished = (pending == 0 and inprogress == 0 and total > 0)
    model_accuracy = calculate_model_accuracy(matches)
    
    report = {
        'date': target_date,
        'status': 'finished' if all_finished else 'unfinished',
        'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'updated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'summary': {
            'total_matches': total,
            'finished_matches': finished,
            'postponed_matches': postponed,
            'inprogress_matches': inprogress,
            'unknown_matches': unknown,
            'pending_matches': pending,
            'model_accuracy': model_accuracy
        },
        'matches': matches
    }

    return report


def update_report_with_results(report: Dict, new_results: List[Dict]) -> Dict:
    def _match_key(home, away):
        """Normal key for deduplication - team names only."""
        return f"{home}_vs_{away}".replace(' ', '_').lower()
    
    new_by_key = {}
    for r in new_results:
        m = r['match']
        key = _match_key(m['home'], m['away'])
        new_by_key[key] = r
    
    existing_by_key = {}
    for match in report['matches']:
        key = _match_key(match['home_team'], match['away_team'])
        existing_by_key[key] = match
    
    for key, match in existing_by_key.items():
        if key not in new_by_key:
            continue
        r = new_by_key[key]
        m = r['match']
        
        if m.get('score') and not match.get('actual_score'):
            match['actual_score'] = m.get('score')
        if m.get('total_cards') is not None:
            match['actual_cards'] = m['total_cards']
        if m.get('total_corners') is not None:
            match['actual_corners'] = m['total_corners']
        if m.get('referee_name'):
            match['referee_name'] = m['referee_name']

        new_status = m.get('status', 'upcoming')

        if m.get('result') and match['status'] != 'finished':
            actual_result = map_result_to_label(m['result'])
            match['status'] = 'finished'
            match['actual_result'] = actual_result
            match['actual_score'] = m.get('score')
            if m.get('total_cards') is not None:
                match['actual_cards'] = m['total_cards']
            if m.get('total_corners') is not None:
                match['actual_corners'] = m['total_corners']
            
            for model_name, pred_data in match['predictions'].items():
                if pred_data.get('prediction'):
                    pred_data['correct'] = (pred_data['prediction'] == actual_result)
            
            if match['consensus'].get('prediction'):
                match['consensus']['correct'] = (match['consensus']['prediction'] == actual_result)
        elif new_status in ['postponed', 'inprogress'] and match['status'] == 'upcoming':
            match['status'] = new_status

        market_preds = r.get('market_predictions', {})
        if market_preds and match.get('market_predictions'):
            for t_name, t_data in market_preds.items():
                if not isinstance(t_data, dict):
                    continue
                t_cons = t_data.get('consensus', {})
                if t_name in match['market_predictions'] and t_cons:
                    existing_cons = match['market_predictions'][t_name].get('consensus', {})
                    existing_cons['prediction'] = t_cons.get('prediction', existing_cons.get('prediction'))
                    existing_cons['avg_probabilities'] = t_cons.get('avg_probabilities', existing_cons.get('avg_probabilities', {}))
                    existing_cons['agreement'] = t_cons.get('agreement', existing_cons.get('agreement'))
                    existing_cons['agreement_pct'] = t_cons.get('agreement_pct', existing_cons.get('agreement_pct'))

    for key, r in new_by_key.items():
        if key in existing_by_key:
            continue
        
        m = r['match']
        preds = r['predictions']
        
        is_finished = m.get('result') is not None
        actual_result = map_result_to_label(m['result']) if m.get('result') else None
        comp_type = m.get('comp_type', 'league')
        match_id = f"{comp_type}_{m['country']}_{m['league']}_{m['home']}_vs_{m['away']}".replace(' ', '_')
        
        predictions_data = {}
        for model_name, pred_data in preds.items():
            if model_name == 'consensus':
                continue
            model_pred = pred_data.get('prediction')
            is_correct = None
            if is_finished and model_pred and actual_result:
                is_correct = (model_pred == actual_result)
            predictions_data[model_name] = {
                'prediction': model_pred,
                'confidence': pred_data.get('confidence'),
                'probabilities': pred_data.get('probabilities', {}),
                'correct': is_correct
            }
        
        cons = preds.get('consensus', {})
        cons_pred = cons.get('prediction')
        cons_correct = None
        if is_finished and cons_pred and actual_result:
            cons_correct = (cons_pred == actual_result)
        
        new_entry = {
            'id': match_id,
            'league': f"{m['country']}/{m['league']}",
            'comp_type': comp_type,
            'home_team': m['home'],
            'away_team': m['away'],
            'status': m.get('status', 'finished' if is_finished else 'upcoming'),
            'actual_result': actual_result,
            'actual_score': m.get('score'),
            'actual_cards': m.get('total_cards'),
            'actual_corners': m.get('total_corners'),
            'referee_name': m.get('referee_name'),
            'predictions': predictions_data,
            'consensus': {
                'prediction': cons_pred,
                'agreement': cons.get('agreement'),
                'agreement_pct': cons.get('agreement_pct'),
                'votes': cons.get('votes', {}),
                'avg_probabilities': cons.get('avg_probabilities', {}),
                'correct': cons_correct
            },
        }
        market_preds = r.get('market_predictions', {})
        if market_preds:
            new_entry['market_predictions'] = {}
            for t_name, t_data in market_preds.items():
                if isinstance(t_data, dict):
                    t_cons = t_data.get('consensus', {})
                    t_models = {}
                    for mn, md in t_data.items():
                        if mn != 'consensus' and isinstance(md, dict):
                            t_models[mn] = {
                                'prediction': md.get('prediction'),
                                'confidence': md.get('confidence'),
                                'probabilities': md.get('probabilities', {}),
                            }
                    new_entry['market_predictions'][t_name] = {
                        'models': t_models,
                        'consensus': {
                            'prediction': t_cons.get('prediction'),
                            'agreement': t_cons.get('agreement'),
                            'agreement_pct': t_cons.get('agreement_pct'),
                            'avg_probabilities': t_cons.get('avg_probabilities', {}),
                        }
                    }
        report['matches'].append(new_entry)
    report_date = report.get('date', '')
    today = datetime.now().strftime('%Y-%m-%d')
    if report_date < today:
        for match in report['matches']:
            if match['status'] == 'upcoming':
                match['status'] = 'unknown'
                print(f"  [WARN] Match {match['home_team']} vs {match['away_team']} - no result after match date, marked as 'unknown'")

    total = len(report['matches'])
    finished = sum(1 for m in report['matches'] if m['status'] == 'finished')
    postponed = sum(1 for m in report['matches'] if m['status'] == 'postponed')
    inprogress = sum(1 for m in report['matches'] if m['status'] == 'inprogress')
    unknown = sum(1 for m in report['matches'] if m['status'] == 'unknown')
    pending = total - finished - postponed - unknown
    all_finished = (pending == 0 and inprogress == 0 and total > 0)

    report['status'] = 'finished' if all_finished else 'unfinished'
    report['updated_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    report['summary']['total_matches'] = total
    report['summary']['finished_matches'] = finished
    report['summary']['postponed_matches'] = postponed
    report['summary']['inprogress_matches'] = inprogress
    report['summary']['unknown_matches'] = unknown
    report['summary']['pending_matches'] = pending
    report['summary']['model_accuracy'] = calculate_model_accuracy(report['matches'])
    
    return report


def save_report(report: Dict, target_date: str):
    """Save report to file (remove old one if status changed)."""
    date_dir = _date_dir(target_date)

    status = report['status']
    new_path = date_dir / f"predictions_{status}.json"

    other_status = 'finished' if status == 'unfinished' else 'unfinished'
    for old in [date_dir / f"predictions_{other_status}.json",
                REPORTS_DIR / f"predictions_{target_date}_{other_status}.json"]:
        if old.exists():
            old.unlink()

    with open(new_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    return new_path


def save_analysis(analysis_map: Dict, target_date: str):
    date_dir = _date_dir(target_date)
    path = date_dir / f"analysis.json"

    data = {
        'date': target_date,
        'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'matches': analysis_map,
    }

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Statistical analysis saved: {path}")


def print_report_summary(report: Dict, analysis_map: Dict = None):
    """Display report summary. analysis_map: optional map {match_key: analysis_dict} for statistics display."""
    print("\n" + "="*100)
    print(f"PREDICTIONS FOR {report['date']}")
    print(f"Report status: {report['status'].upper()}")
    print("="*100)

    by_league = {}
    for m in report['matches']:
        league = m['league']
        if league not in by_league:
            by_league[league] = []
        by_league[league].append(m)
    
    for league, matches in sorted(by_league.items()):
        safe_print(f"\n{'='*80}")
        safe_print(f"  {league.upper()}")
        print(f"{'='*80}")
        
        for m in matches:
            if m['status'] == 'finished':
                actual = f" (Score: {m['actual_result']})"
                status = "FINISHED"
            elif m['status'] == 'postponed':
                actual = ""
                status = "POSTPONED"
            elif m['status'] == 'inprogress':
                actual = ""
                status = "IN PROGRESS"
            elif m['status'] == 'unknown':
                actual = ""
                status = "NO DATA"
            else:
                actual = ""
                status = "UPCOMING"
            
            safe_print(f"\n  * {m['home_team']} vs {m['away_team']}{actual}")
            print(f"     Status: {status}")
            
            cons = m['consensus']
            votes = cons.get('votes', {})
            if votes:
                print(f"     Model votes:   HOME: {votes.get('HOME', 0)}  |  DRAW: {votes.get('DRAW', 0)}  |  AWAY: {votes.get('AWAY', 0)}")

            pred_str = cons.get('prediction', '?')
            pct = cons.get('agreement_pct', 0)

            if m['status'] == 'finished' and cons.get('correct') is not None:
                icon = "HIT" if cons['correct'] else "MISS"
                pred_str = f"{pred_str} [{icon}]"

            print(f"     Prediction: {pred_str} ({pct:.0f}% models agree)")
            
            avg_probs = cons.get('avg_probabilities', {})
            if not avg_probs:
                all_probs = [p.get('probabilities', {}) for p in m['predictions'].values() if p.get('probabilities')]
                if all_probs:
                    avg_probs = {
                        'HOME': round(sum(p.get('HOME', 0) for p in all_probs) / len(all_probs), 1),
                        'DRAW': round(sum(p.get('DRAW', 0) for p in all_probs) / len(all_probs), 1),
                        'AWAY': round(sum(p.get('AWAY', 0) for p in all_probs) / len(all_probs), 1),
                    }
            if avg_probs:
                max_key = max(avg_probs, key=lambda k: avg_probs.get(k, 0))
                parts = []
                for label in ['HOME', 'DRAW', 'AWAY']:
                    val = avg_probs.get(label, 0)
                    marker = ' <<' if label == max_key else ''
                    parts.append(f"{label}: {val:.1f}%{marker}")
                print(f"     Avg. probs:    {' | '.join(parts)}")
            
            markets = m.get('market_predictions', {})
            if markets:
                market_parts = []
                market_labels = {
                    'btts': 'BTTS', 'over_2_5': 'Over 2.5', 'over_1_5': 'Over 1.5',
                    'corners_over_8_5': 'Corners >8.5', 'corners_over_10_5': 'Corners >10.5',
                    'cards_over_3_5': 'Cards >3.5', 'cards_over_4_5': 'Cards >4.5',
                }
                for mkt, mkt_label in market_labels.items():
                    mkt_data = markets.get(mkt, {})
                    mkt_cons = mkt_data.get('consensus', {})
                    mkt_pred = mkt_cons.get('prediction')
                    if mkt_pred:
                        mkt_probs = mkt_cons.get('avg_probabilities', {})
                        prob_val = mkt_probs.get(mkt_pred, 0)
                        market_parts.append(f"{mkt_label}: {mkt_pred} ({prob_val:.0f}%)")
                if market_parts:
                    print(f"     Markets:       {' | '.join(market_parts)}")

                regression_labels = {
                    'total_goals': 'Goals (pred.)',
                    'total_corners': 'Corners (pred.)',
                    'total_cards': 'Cards (pred.)',
                }
                reg_parts = []
                for reg_key, reg_label in regression_labels.items():
                    reg_data = markets.get(reg_key, {})
                    reg_cons = reg_data.get('consensus', {})
                    reg_pred = reg_cons.get('prediction')
                    if reg_pred is not None:
                        try:
                            reg_parts.append(f"{reg_label}: {float(reg_pred):.1f}")
                        except (ValueError, TypeError):
                            pass
                if reg_parts:
                    print(f"     Regression:    {' | '.join(reg_parts)}")

            if analysis_map:
                match_key = f"{m['home_team']}_vs_{m['away_team']}".replace(' ', '_').lower()
                _print_analysis(analysis_map.get(match_key, {}), m['home_team'], m['away_team'])
    
    summary = report['summary']
    print("\n" + "="*100)
    print("SUMMARY")
    print("="*100)
    print(f"Total matches: {summary['total_matches']}")
    print(f"  - Finished: {summary['finished_matches']}")
    if summary.get('postponed_matches', 0) > 0:
        print(f"  - Postponed: {summary['postponed_matches']}")

    if summary.get('inprogress_matches', 0) > 0:
        print(f"  - In progress: {summary['inprogress_matches']}")
    if summary.get('unknown_matches', 0) > 0:
        print(f"  - No data: {summary['unknown_matches']}")
    print(f"  - Upcoming: {summary.get('pending_matches', 0)}")
    
    if summary.get('model_accuracy'):
        print("\n" + "-"*80)
        print("MODEL ACCURACY (finished matches)")
        print("-"*80)
        print(f"{'Model':<25} {'Correct':<10} {'Wrong':<10} {'Total':<10} {'Accuracy':<10}")
        print("-"*80)
        
        for model, stats in summary['model_accuracy'].items():
            marker = "* " if model == 'consensus' else "  "
            print(f"{marker}{model:<23} {stats['correct']:<10} {stats['incorrect']:<10} {stats['total']:<10} {stats['accuracy_pct']:.1f}%")


def main():
    parser = argparse.ArgumentParser(description='Match prediction for a given day')
    parser.add_argument('date', nargs='?', default=datetime.now().strftime('%Y-%m-%d'),
                        help='Date in YYYY-MM-DD format (default: today)')
    parser.add_argument('--scrape', action='store_true',
                        help='Fetch upcoming matches from Sofascore API')
    parser.add_argument('--update', action='store_true',
                        help='Update report with finished match results')
    parser.add_argument('--update-results', action='store_true',
                        help='Fetch current match results from API (for inprogress/upcoming matches)')
    parser.add_argument('--force', action='store_true',
                        help='Force re-scraping (ignore cache)')
    parser.add_argument('--no-report', action='store_true',
                        help='Do not save report to file')
    
    args = parser.parse_args()
    target_date = args.date
    
    print("="*70)
    print("MATCH PREDICTION SYSTEM")
    print("="*70)
    print(f"Data: {target_date}")
    print()
    
    if args.update or args.update_results:
        update_match_results(target_date)

        existing_report = load_existing_report(target_date)
        if existing_report:
            matches = find_matches_for_date(target_date)
            _mk = lambda h, a: f"{h}_vs_{a}".replace(' ', '_').lower()
            for match_entry in existing_report.get('matches', []):
                if match_entry.get('status') == 'finished':
                    continue
                key = _mk(match_entry['home_team'], match_entry['away_team'])
                for m_data in matches:
                    m_key = _mk(m_data['home'], m_data['away'])
                    if m_key == key and m_data.get('result'):
                        actual_result = map_result_to_label(m_data['result'])
                        match_entry['status'] = 'finished'
                        match_entry['actual_result'] = actual_result
                        match_entry['actual_score'] = m_data.get('score')
                        for model_name, pred_data in match_entry.get('predictions', {}).items():
                            if pred_data.get('prediction'):
                                pred_data['correct'] = (pred_data['prediction'] == actual_result)
                        cons = match_entry.get('consensus', {})
                        if cons.get('prediction'):
                            cons['correct'] = (cons['prediction'] == actual_result)
                        break

            from datetime import datetime as _dt
            if _dt.strptime(target_date, '%Y-%m-%d').date() < _dt.now().date():
                for match_entry in existing_report.get('matches', []):
                    if match_entry.get('status') == 'upcoming':
                        match_entry['status'] = 'unknown'

            all_matches = existing_report['matches']
            existing_report['summary']['model_accuracy'] = calculate_model_accuracy(all_matches)
            existing_report['summary']['total_matches'] = len(all_matches)
            existing_report['summary']['finished_matches'] = sum(1 for m in all_matches if m.get('status') == 'finished')
            existing_report['summary']['postponed_matches'] = sum(1 for m in all_matches if m.get('status') == 'postponed')
            existing_report['summary']['inprogress_matches'] = sum(1 for m in all_matches if m.get('status') == 'inprogress')
            existing_report['summary']['unknown_matches'] = sum(1 for m in all_matches if m.get('status') == 'unknown')
            existing_report['summary']['pending_matches'] = sum(1 for m in all_matches if m.get('status') == 'upcoming')
            existing_report['updated_at'] = _dt.now().strftime('%Y-%m-%d %H:%M:%S')

            remaining = sum(1 for m in all_matches if m.get('status') in ('upcoming', 'inprogress'))
            if remaining == 0 and len(all_matches) > 0:
                existing_report['status'] = 'finished'

            report_path = save_report(existing_report, target_date)
            print(f"\nReport updated: {report_path}")
            print_report_summary(existing_report, {})
        else:
            print(f"\nNo existing report for {target_date}.")
            print("First run: python predict_today.py --scrape")
        return

    if args.scrape:
        scrape_upcoming(target_date, force=args.force)
    
    print("\nSearching for matches in saved data...")
    matches = find_matches_for_date(target_date)
    print(f"Found {len(matches)} matches")
    
    if not matches:
        print("\nNo matches for this day in the data.")
        print("Use --scrape to fetch from API.")
        return
    
    predictor = load_models()
    
    print("\nMaking predictions...")
    results = predict_matches(matches, predictor)
    
    if not args.no_report:
        print("\n" + "="*70)
        print("GENERATING REPORT")
        print("="*70)
        
        existing_report = load_existing_report(target_date)
        
        if existing_report and args.update:
            print(f"Updating existing report...")
            report = update_report_with_results(existing_report, results)
        elif existing_report:
            print(f"Found existing report - updating...")
            report = update_report_with_results(existing_report, results)
        else:
            print(f"Creating new report...")
            report = create_report_from_results(results, target_date)
        
        report_path = save_report(report, target_date)
        print(f"Report saved: {report_path}")
        
        analysis_map = {}
        for r in results:
            m = r['match']
            key = f"{m['home']}_vs_{m['away']}".replace(' ', '_').lower()
            analysis_map[key] = r.get('analysis', {})

        save_analysis(analysis_map, target_date)

        print_report_summary(report, analysis_map)
        
        if report['status'] == 'finished':
            print("\n" + "="*70)
            print("REPORT COMPLETE - All matches finished!")
            print("="*70)
    else:
        print_predictions(results, target_date)


if __name__ == '__main__':
    main()
