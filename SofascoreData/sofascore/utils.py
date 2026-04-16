"""
Utility functions for Sofascore scraper.
"""

import os
import re
import json
import time
import random
from datetime import datetime


def extract_match_data(match):
    status_type = match.get('status', {}).get('type', '')
    home_score_obj = match.get('homeScore', {})
    away_score_obj = match.get('awayScore', {})

    # Use 'display' if available (excludes penalties), fallback to 'normaltime', then 'current'
    home_score = home_score_obj.get('display') or home_score_obj.get('normaltime') or home_score_obj.get('current')
    away_score = away_score_obj.get('display') or away_score_obj.get('normaltime') or away_score_obj.get('current')

    data = {
        'event_id': match.get('id'),
        'status': status_type if status_type else None,
        'date': datetime.fromtimestamp(match.get('startTimestamp', 0)).strftime('%Y-%m-%d'),
        'time': datetime.fromtimestamp(match.get('startTimestamp', 0)).strftime('%H:%M'),
        'round': match.get('roundInfo', {}).get('round'),
        'home_team_id': match.get('homeTeam', {}).get('id'),
        'home_team': match.get('homeTeam', {}).get('name'),
        'away_team_id': match.get('awayTeam', {}).get('id'),
        'away_team': match.get('awayTeam', {}).get('name'),
        'home_score': home_score,
        'away_score': away_score,
        'home_score_ht': home_score_obj.get('period1'),
        'away_score_ht': away_score_obj.get('period1'),
    }

    # Extra time and penalties (only present for knockout matches)
    home_ot = home_score_obj.get('overtime')
    away_ot = away_score_obj.get('overtime')
    home_pen = home_score_obj.get('penalties')
    away_pen = away_score_obj.get('penalties')

    if home_ot is not None or away_ot is not None:
        data['home_score_et'] = home_ot
        data['away_score_et'] = away_ot
    if home_pen is not None or away_pen is not None:
        data['home_score_pen'] = home_pen
        data['away_score_pen'] = away_pen

    return data


def extract_referee_data(event_details):
    if not event_details:
        return {}

    referee = event_details.get('referee')
    if not referee:
        return {}

    result = {
        'referee_name': referee.get('name'),
        'referee_id': referee.get('id'),
    }

    yellow = referee.get('yellowCards')
    if yellow is not None:
        result['referee_avg_yellow_cards'] = round(float(yellow), 2)

    red = referee.get('redCards')
    if red is not None:
        result['referee_avg_red_cards'] = round(float(red), 2)

    # Yellow-red (second yellow) cards
    yellow_red = referee.get('yellowRedCards')
    if yellow_red is not None:
        result['referee_avg_yellow_red_cards'] = round(float(yellow_red), 2)

    games = referee.get('games')
    if games is not None:
        result['referee_games'] = games

    return result


def extract_statistics(stats_data, period='ALL'):
    result = {}
    if not stats_data:
        return result
    
    target_stats = None
    for period_data in stats_data:
        if period_data.get('period') == period:
            target_stats = period_data
            break
    
    if target_stats is None and stats_data:
        target_stats = stats_data[0]
    
    if target_stats is None:
        return result
    
    for group in target_stats.get('groups', []):
        for item in group.get('statisticsItems', []):
            key = item.get('key', '').lower()
            key = re.sub(r'([A-Z])', r'_\1', key).lower().lstrip('_').replace(' ', '_')
            result[f"home_{key}"] = item.get('homeValue')
            result[f"away_{key}"] = item.get('awayValue')
    
    return result


def _fractional_to_decimal(frac_str):
    """Convert fractional odds '11/10' to decimal 2.10"""
    try:
        if '/' in str(frac_str):
            num, den = frac_str.split('/')
            return round(int(num) / int(den) + 1, 3)
        return round(float(frac_str), 3)
    except:
        return None


def extract_odds(markets_data):
    """Extract 1X2, Over/Under 2.5 and BTTS odds from Sofascore markets response."""
    result = {}
    if not markets_data:
        return result

    for market in markets_data:
        market_name = (market.get('marketName') or market.get('name') or '').lower()
        choices = market.get('choices', [])

        if 'full time' in market_name or market.get('marketId') == 1:
            for c in choices:
                name = str(c.get('name', '')).strip()
                frac = c.get('fractionalValue') or c.get('odds')
                if name == '1':
                    result['odds_home_win'] = _fractional_to_decimal(frac) if '/' in str(frac) else _safe_float(frac)
                elif name.upper() == 'X':
                    result['odds_draw'] = _fractional_to_decimal(frac) if '/' in str(frac) else _safe_float(frac)
                elif name == '2':
                    result['odds_away_win'] = _fractional_to_decimal(frac) if '/' in str(frac) else _safe_float(frac)

        elif ('over' in market_name and 'under' in market_name and '2.5' in market_name) or market.get('marketId') == 2:
            for c in choices:
                name = str(c.get('name', '')).lower()
                frac = c.get('fractionalValue') or c.get('odds')
                val = _fractional_to_decimal(frac) if '/' in str(frac) else _safe_float(frac)
                if 'over' in name:
                    result['odds_over_2_5'] = val
                elif 'under' in name:
                    result['odds_under_2_5'] = val

        elif 'both' in market_name and 'score' in market_name:
            for c in choices:
                name = str(c.get('name', '')).lower()
                frac = c.get('fractionalValue') or c.get('odds')
                val = _fractional_to_decimal(frac) if '/' in str(frac) else _safe_float(frac)
                if 'yes' in name:
                    result['odds_btts_yes'] = val
                elif 'no' in name:
                    result['odds_btts_no'] = val

    return result


def _safe_float(val):
    try:
        return round(float(val), 3)
    except:
        return None


def random_delay(base_delay, variance=0.5):
    """Random delay: base_delay +/- variance (e.g., 2.0 +/- 0.5 = 1.5-2.5s)"""
    return base_delay + random.uniform(-variance, variance)


def scrape_full_match_data(scraper, match, delay=0.5):
    event_id = match.get('id')
    data = extract_match_data(match)
    
    stats = scraper.get_match_statistics(event_id)
    if stats:
        data.update(extract_statistics(stats, period='ALL'))
    time.sleep(random_delay(delay))

    shotmap = scraper.get_match_shotmap(event_id)
    if shotmap:
        data['home_xg'] = round(sum(s.get('xg', 0) for s in shotmap if s.get('isHome')), 3)
        data['away_xg'] = round(sum(s.get('xg', 0) for s in shotmap if not s.get('isHome')), 3)
    time.sleep(random_delay(delay))

    incidents = scraper.get_match_incidents(event_id)
    if incidents:
        data['home_yellow_cards_calc'] = sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'yellow' and i.get('isHome'))
        data['away_yellow_cards_calc'] = sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'yellow' and not i.get('isHome'))
        data['home_red_cards_calc'] = sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'red' and i.get('isHome'))
        data['away_red_cards_calc'] = sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'red' and not i.get('isHome'))
    time.sleep(random_delay(delay))

    odds_markets = scraper.get_match_odds(event_id)
    if odds_markets:
        odds = extract_odds(odds_markets)
        data.update(odds)

    return data


def load_existing_data(filepath):
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return None


def get_existing_event_ids(dm, season_name):
    """Returns (finished_ids, postponed_ids) - sets of event IDs."""
    slug = dm._season_slug(season_name)
    filepath = os.path.join(dm.paths['raw'], f'{slug}.json')

    finished_ids = set()
    postponed_ids = set()
    existing = load_existing_data(filepath)
    if existing and 'matches' in existing:
        for m in existing['matches']:
            eid = m.get('event_id')
            if not eid:
                continue
            if m.get('status') in ('postponed', 'canceled'):
                postponed_ids.add(eid)
            elif m.get('home_score') is not None:
                finished_ids.add(eid)
    return finished_ids, postponed_ids


def _match_key(m):
    """Composite key: postponed/canceled entries use separate key so both versions coexist."""
    eid = m.get('event_id')
    if m.get('status') in ('postponed', 'canceled'):
        return f"{eid}__{m['status']}"
    return eid


def merge_and_sort_matches(existing_matches, new_matches):
    all_matches = {_match_key(m): m for m in existing_matches}

    for m in new_matches:
        key = _match_key(m)
        existing = all_matches.get(key)
        if existing and existing.get('home_score') is not None and m.get('home_score') is None:
            continue
        all_matches[key] = m

    sorted_matches = sorted(
        all_matches.values(),
        key=lambda x: (x.get('date') or '', x.get('round') or 0)
    )

    return sorted_matches
