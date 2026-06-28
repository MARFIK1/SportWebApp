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
import re
import sys
import warnings
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

warnings.filterwarnings('ignore', message='X does not have valid feature names')
warnings.filterwarnings('ignore', message='X has feature names')
warnings.filterwarnings('ignore', category=FutureWarning)
warnings.filterwarnings('ignore', message='Trying to unpickle estimator')

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, 'reconfigure'):
        stream.reconfigure(encoding='utf-8', errors='replace')

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = Path(os.environ.get('SOFASCORE_DATA_DIR', SCRIPT_DIR / 'data')).resolve()
REPORTS_DIR = Path(os.environ.get('SOFASCORE_REPORTS_DIR', SCRIPT_DIR / 'reports')).resolve()

sys.path.insert(0, str(SCRIPT_DIR))

from sofascore.features import MLFeatureGenerator

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
MODEL_VARIANT_CONFIG = {
    'without_odds': {
        'filename': 'universal_predictor.pkl',
        'odds_used': False,
    },
    'with_odds': {
        'filename': 'universal_predictor_with_odds.pkl',
        'odds_used': True,
    },
}
DEFAULT_PREDICTION_VARIANT = 'without_odds'
BASE_ODDS_KEYS = ['odds_home_win', 'odds_draw', 'odds_away_win']
OPTIONAL_ODDS_KEYS = [
    'odds_over_2_5', 'odds_under_2_5',
    'odds_btts_yes', 'odds_btts_no',
]
ODDS_KEYS = BASE_ODDS_KEYS + OPTIONAL_ODDS_KEYS
ODDS_REQUIREMENTS_BY_TARGET = {
    '__all__': BASE_ODDS_KEYS,
}
TEAM_HISTORY_DIR = DATA_DIR / 'team_history'
TEAM_HISTORY_FORCE_REFRESH = (
    str(os.environ.get('SOFASCORE_TEAM_HISTORY_FORCE_REFRESH', '')).strip().lower()
    in {'1', 'true', 'yes', 'on'}
)
try:
    TEAM_HISTORY_MAX_PAGES = max(1, int(os.environ.get('SOFASCORE_TEAM_HISTORY_PAGES', '6')))
except ValueError:
    TEAM_HISTORY_MAX_PAGES = 6
TEAM_HISTORY_ENRICH_STATS = (
    str(os.environ.get('SOFASCORE_TEAM_HISTORY_ENRICH_STATS', '')).strip().lower()
    in {'1', 'true', 'yes', 'on'}
)
try:
    TEAM_HISTORY_ENRICH_LIMIT = max(1, int(os.environ.get('SOFASCORE_TEAM_HISTORY_ENRICH_LIMIT', '8')))
except ValueError:
    TEAM_HISTORY_ENRICH_LIMIT = 8
try:
    TEAM_HISTORY_ENRICH_DELAY = max(0.0, float(os.environ.get('SOFASCORE_TEAM_HISTORY_ENRICH_DELAY', '0.3')))
except ValueError:
    TEAM_HISTORY_ENRICH_DELAY = 0.3
TEAM_HISTORY_MODEL_STAT_KEYS = (
    'home_xg', 'away_xg',
    'home_expectedgoals', 'away_expectedgoals',
    'home_expected_goals', 'away_expected_goals',
    'home_cornerkicks', 'away_cornerkicks',
    'home_totalshotsongoal', 'away_totalshotsongoal',
    'home_shotsongoal', 'away_shotsongoal',
    'home_bigchancecreated', 'away_bigchancecreated',
    'home_ballpossession', 'away_ballpossession',
)
TEAM_HISTORY_DETAIL_KEYS = TEAM_HISTORY_MODEL_STAT_KEYS + (
    'home_yellow_cards_calc', 'away_yellow_cards_calc',
    'home_yellowcards', 'away_yellowcards',
)


def validate_target_date(target_date: str) -> str:
    if not isinstance(target_date, str) or not DATE_RE.fullmatch(target_date):
        raise ValueError(f"Invalid date '{target_date}'. Expected YYYY-MM-DD.")
    parsed = datetime.strptime(target_date, '%Y-%m-%d')
    normalized = parsed.strftime('%Y-%m-%d')
    if normalized != target_date:
        raise ValueError(f"Invalid date '{target_date}'. Expected a real calendar date.")
    return normalized


def _is_positive_odds(value) -> bool:
    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return False


def _copy_positive_odds(target: Dict, source: Dict, overwrite: bool = False):
    for ok in ODDS_KEYS:
        if _is_positive_odds(source.get(ok)) and (overwrite or not _is_positive_odds(target.get(ok))):
            target[ok] = source[ok]


def _upcoming_file_sort_key(path: Path, target_date: str):
    exact_daily_file = path.name == f"upcoming_scheduled_{target_date}.json"
    return (1 if exact_daily_file else 0, path.name)


def safe_print(text):
    try:
        print(text)
    except UnicodeEncodeError:
        import unicodedata
        normalized = unicodedata.normalize('NFKD', text)
        ascii_text = normalized.encode('ascii', 'ignore').decode('ascii')
        print(ascii_text)


def _load_predictor_module():
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "predictor",
        str(SCRIPT_DIR / "sofascore" / "predictor.py")
    )
    predictor_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(predictor_module)
    return predictor_module


def _create_predictor(predictor_class, data_dir: Path):
    return predictor_class(str(data_dir))


def _load_predictor_artifact(predictor_class, data_dir: Path, models_path: Path):
    predictor = _create_predictor(predictor_class, data_dir)
    predictor.load_models(str(models_path))
    return predictor


def load_models(variant_names: Optional[List[str]] = None):
    predictor_module = _load_predictor_module()
    UniversalPredictor = predictor_module.UniversalPredictor

    data_dir = DATA_DIR
    predictors = {}
    selected_variants = set(variant_names) if variant_names else None

    for variant_name, variant_config in MODEL_VARIANT_CONFIG.items():
        if selected_variants is not None and variant_name not in selected_variants:
            continue

        models_path = data_dir / 'models' / variant_config['filename']

        if models_path.exists():
            print(f"Loading {variant_name} models from {models_path}...")
            predictors[variant_name] = _load_predictor_artifact(UniversalPredictor, data_dir, models_path)
            continue

        if variant_name != DEFAULT_PREDICTION_VARIANT:
            print(f"[WARN] No saved models found for variant '{variant_name}' at {models_path}")
            continue

        print("No saved default models found. Training from scratch...")
        predictor = _create_predictor(UniversalPredictor, data_dir)
        df = predictor.load_all_leagues()
        predictor.train_all_models(df)

        models_path.parent.mkdir(exist_ok=True)
        predictor.save_models(str(models_path))
        predictors[variant_name] = predictor

    return predictors


COMP_TYPES = ['league', 'cups', 'european', 'international']


def iter_competition_dirs(base_dir=None):
    if base_dir is None:
        base_dir = DATA_DIR
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
    if season_name.lower().startswith('scheduled '):
        return True

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


def _configured_current_season(comp_data: Dict) -> Optional[Dict]:
    seasons = comp_data.get('seasons') or {}
    if not isinstance(seasons, dict) or not seasons:
        return None

    season_name, season_id = next(iter(seasons.items()))
    return {
        'id': season_id,
        'name': str(season_name),
        '_configured': True,
    }


def _resolve_current_season(scraper, comp_data: Dict, tournament_id, comp_name: str) -> Optional[Dict]:
    configured_season = _configured_current_season(comp_data)
    if getattr(scraper, 'api_blocked', False):
        return None

    seasons = scraper.get_seasons(tournament_id)
    if getattr(scraper, 'api_blocked', False):
        return None

    if seasons:
        current_season = seasons[0]
        season_id = current_season.get('id')
        season_name = current_season.get('name', f"Season {season_id}")
        if _validate_season_name(comp_name, season_name):
            return current_season

        if configured_season:
            print(f"[CONFIG] API returned '{season_name}', using configured season {configured_season['name']}")
            return configured_season

        print(f"[SKIP] API returned wrong season: '{season_name}' (expected: {comp_name})")
        return None

    if configured_season:
        print(f"[CONFIG] Using configured season {configured_season['name']} (ID: {configured_season['id']})")
        return configured_season

    return None


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


def _raw_has_score(match: Dict) -> bool:
    return match.get('home_score') is not None and match.get('away_score') is not None


def _result_from_scores(home_score, away_score) -> Optional[str]:
    if home_score is None or away_score is None:
        return None
    try:
        home_val = float(home_score)
        away_val = float(away_score)
    except (TypeError, ValueError):
        return None
    if home_val > away_val:
        return 'H'
    if home_val < away_val:
        return 'A'
    return 'D'


def _score_number(value) -> Optional[float]:
    if value is None or value == '':
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _format_score_part(value) -> str:
    score = _score_number(value)
    if score is None:
        return ''
    if score.is_integer():
        return str(int(score))
    return f"{score:g}"


def _score_text(home_score, away_score) -> Optional[str]:
    home_val = _score_number(home_score)
    away_val = _score_number(away_score)
    if home_val is None or away_val is None:
        return None
    return f"{_format_score_part(home_val)}-{_format_score_part(away_val)}"


def _raw_score_pair(match: Dict):
    return _score_number(match.get('home_score')), _score_number(match.get('away_score'))


def _penalty_score_pair(match: Dict):
    return _score_number(match.get('home_score_pen')), _score_number(match.get('away_score_pen'))


def _base_score_pair(match: Dict):
    home_score, away_score = _raw_score_pair(match)
    home_pen, away_pen = _penalty_score_pair(match)

    if (
        home_score is not None and away_score is not None and
        home_pen is not None and away_pen is not None and
        (home_pen != 0 or away_pen != 0) and
        home_score >= home_pen and away_score >= away_pen
    ):
        return home_score - home_pen, away_score - away_pen

    return home_score, away_score


def _match_decided_by_penalties(match: Dict) -> bool:
    home_pen, away_pen = _penalty_score_pair(match)
    return home_pen is not None and away_pen is not None and home_pen != away_pen


def _result_from_match_scores(match: Dict) -> Optional[str]:
    home_pen, away_pen = _penalty_score_pair(match)
    if home_pen is not None and away_pen is not None and home_pen != away_pen:
        return _result_from_scores(home_pen, away_pen)

    home_score, away_score = _base_score_pair(match)
    return _result_from_scores(home_score, away_score)


def _score_text_from_match(match: Dict) -> Optional[str]:
    home_score, away_score = _base_score_pair(match)
    return _score_text(home_score, away_score)


def _penalty_score_text_from_match(match: Dict) -> Optional[str]:
    home_pen, away_pen = _penalty_score_pair(match)
    return _score_text(home_pen, away_pen)


def _looks_like_unverified_shootout_score(match: Dict, status: Optional[str] = None) -> bool:
    if (status or match.get('status')) != 'finished':
        return False
    if match.get('home_score_pen') is not None or match.get('away_score_pen') is not None:
        return False

    home_score, away_score = _raw_score_pair(match)
    if home_score is None or away_score is None:
        return False

    return (home_score + away_score) >= 5 and abs(home_score - away_score) <= 2


def _first_score_value(score_obj: Dict, keys: List[str]):
    if not isinstance(score_obj, dict):
        return None
    for key in keys:
        value = score_obj.get(key)
        if value is not None:
            return value
    normalized = {str(key).lower(): value for key, value in score_obj.items()}
    for key in keys:
        value = normalized.get(str(key).lower())
        if value is not None:
            return value
    return None


def _apply_api_score_fields(match: Dict, api_match: Dict) -> bool:
    home_score_obj = api_match.get('homeScore') or {}
    away_score_obj = api_match.get('awayScore') or {}

    home_score = _first_score_value(home_score_obj, ['display', 'normaltime', 'normalTime', 'regularTime', 'current'])
    away_score = _first_score_value(away_score_obj, ['display', 'normaltime', 'normalTime', 'regularTime', 'current'])
    if home_score is not None:
        match['home_score'] = home_score
    if away_score is not None:
        match['away_score'] = away_score

    home_ht = _first_score_value(home_score_obj, ['period1'])
    away_ht = _first_score_value(away_score_obj, ['period1'])
    if home_ht is not None:
        match['home_score_ht'] = home_ht
    if away_ht is not None:
        match['away_score_ht'] = away_ht

    home_et = _first_score_value(home_score_obj, ['overtime', 'extraTime', 'afterExtraTime'])
    away_et = _first_score_value(away_score_obj, ['overtime', 'extraTime', 'afterExtraTime'])
    if home_et is not None:
        match['home_score_et'] = home_et
    if away_et is not None:
        match['away_score_et'] = away_et

    home_pen = _first_score_value(home_score_obj, ['penalties', 'penalty', 'penaltyScore', 'shootout', 'penaltyShootout'])
    away_pen = _first_score_value(away_score_obj, ['penalties', 'penalty', 'penaltyScore', 'shootout', 'penaltyShootout'])
    if home_pen is not None or away_pen is not None:
        match['home_score_pen'] = home_pen
        match['away_score_pen'] = away_pen

    return home_score is not None and away_score is not None


def _penalty_score_from_incidents(incidents) -> tuple:
    if not incidents:
        return None, None

    home_score = None
    away_score = None
    home_scored = 0
    away_scored = 0
    saw_shootout = False

    for incident in incidents:
        if not isinstance(incident, dict):
            continue

        incident_type = str(incident.get('incidentType') or incident.get('type') or '').lower()
        incident_class = str(incident.get('incidentClass') or incident.get('class') or '').lower()
        period = str(incident.get('period') or incident.get('incidentPeriod') or '').lower()
        is_shootout = (
            'shootout' in incident_type or
            'shootout' in period or
            'penalt' in period or
            bool(incident.get('isPenaltyShootout'))
        )

        if not is_shootout:
            continue

        saw_shootout = True
        incident_home_score = _score_number(_first_score_value(incident, ['homeScore', 'home_score']))
        incident_away_score = _score_number(_first_score_value(incident, ['awayScore', 'away_score']))
        if incident_home_score is not None and incident_away_score is not None:
            home_score = max(home_score or 0, incident_home_score)
            away_score = max(away_score or 0, incident_away_score)
            continue

        if any(token in incident_class for token in ('scored', 'goal', 'converted')):
            if incident.get('isHome'):
                home_scored += 1
            else:
                away_scored += 1

    if home_score is not None and away_score is not None:
        return home_score, away_score
    if saw_shootout and (home_scored or away_scored):
        return home_scored, away_scored
    return None, None


def _apply_penalty_score_from_incidents(match: Dict, incidents) -> bool:
    home_pen, away_pen = _penalty_score_from_incidents(incidents)
    if home_pen is None or away_pen is None:
        return False

    match['home_score_pen'] = home_pen
    match['away_score_pen'] = away_pen
    return True


def _refresh_score_details_if_needed(scraper, match: Dict, api_match: Dict, api_status: str) -> bool:
    if not _looks_like_unverified_shootout_score(match, api_status):
        return False

    event_id = api_match.get('id') or match.get('event_id')
    if not event_id:
        return False

    changed = False
    event_details = scraper.get_event_details(event_id)
    if event_details:
        before = (
            match.get('home_score'),
            match.get('away_score'),
            match.get('home_score_pen'),
            match.get('away_score_pen'),
        )
        _apply_api_score_fields(match, event_details)
        after = (
            match.get('home_score'),
            match.get('away_score'),
            match.get('home_score_pen'),
            match.get('away_score_pen'),
        )
        changed = changed or before != after

    if _looks_like_unverified_shootout_score(match, api_status):
        incidents = scraper.get_match_incidents(event_id)
        if incidents:
            changed = _apply_penalty_score_from_incidents(match, incidents) or changed

    return changed


def _source_status_rank(match: Dict) -> int:
    if match.get('result') is not None or _raw_has_score(match):
        return 50
    status = match.get('status')
    if status == 'finished':
        return 45
    if status == 'inprogress':
        return 40
    if status in ('upcoming', 'notstarted'):
        return 30
    if status in ('postponed', 'canceled'):
        return 20
    return 10


def _merge_source_match(existing: Optional[Dict], candidate: Dict) -> Dict:
    if existing is None:
        return candidate

    existing_rank = (_source_status_rank(existing), existing.get('_source_rank', 0))
    candidate_rank = (_source_status_rank(candidate), candidate.get('_source_rank', 0))
    if candidate_rank >= existing_rank:
        winner, loser = dict(candidate), existing
    else:
        winner, loser = dict(existing), candidate

    if winner.get('features') is None and loser.get('features') is not None:
        winner['features'] = loser['features']
    for key in ('total_cards', 'total_corners', 'referee_name', 'start_time', 'date'):
        if winner.get(key) in (None, '') and loser.get(key) not in (None, ''):
            winner[key] = loser[key]
    _copy_positive_odds(winner, loser, overwrite=False)
    return winner


def _raw_match_to_match_data(match: Dict, comp_type: str, country: str, comp_name: str,
                             source_rank: int = 0, source_path: Optional[Path] = None) -> Dict:
    result = _result_from_match_scores(match)
    score = _score_text_from_match(match)
    raw_status = match.get('status', '')

    if result is not None:
        status = 'finished'
    elif raw_status in ('postponed', 'canceled'):
        status = raw_status
    elif raw_status == 'inprogress':
        status = 'inprogress'
    else:
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
        'event_id': match.get('event_id'),
        'comp_type': comp_type,
        'country': country,
        'league': comp_name,
        'home': match.get('home_team'),
        'away': match.get('away_team'),
        'home_team_id': match.get('home_team_id'),
        'away_team_id': match.get('away_team_id'),
        'result': result,
        'score': score if result is not None else None,
        'penalty_score': _penalty_score_text_from_match(match),
        'decided_by_penalties': _match_decided_by_penalties(match),
        'status': status,
        'date': match.get('date', ''),
        'start_time': match.get('time', ''),
        'features': None,
        'total_cards': total_cards,
        'total_corners': total_corners,
        'referee_name': match.get('referee_name'),
        '_source_rank': source_rank,
    }
    if source_path is not None:
        match_data['_source_path'] = str(source_path)
    _copy_positive_odds(match_data, match, overwrite=True)
    return match_data


def _source_event_key(event_id) -> Optional[str]:
    if event_id is None or event_id == '':
        return None
    return f"event:{event_id}"


def _build_canonical_raw_event_index(base_dir: Path) -> Dict[str, Dict]:
    canonical = {}
    for comp_type, country, comp_name, comp_dir in iter_competition_dirs(base_dir):
        raw_dir = comp_dir / 'raw'
        if not raw_dir.exists():
            continue

        raw_files = [(p, 1 if p.name == 'all_seasons.json' else 2) for p in sorted(raw_dir.glob('*.json'))]
        upcoming_dir = raw_dir / 'upcoming'
        if upcoming_dir.exists():
            raw_files.extend((p, 1) for p in sorted(upcoming_dir.glob('*.json')))

        for raw_file, source_rank in raw_files:
            try:
                with open(raw_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except Exception:
                continue

            for match in data.get('matches', []):
                key = _source_event_key(match.get('event_id'))
                if not key:
                    continue
                candidate = _raw_match_to_match_data(
                    match, comp_type, country, comp_name,
                    source_rank=source_rank,
                    source_path=raw_file,
                )
                canonical[key] = _merge_source_match(canonical.get(key), candidate)

    return canonical


def _is_stale_rescheduled_entry(match: Dict, canonical_events: Dict[str, Dict]) -> bool:
    key = _source_event_key(match.get('event_id'))
    if not key:
        return False
    canonical = canonical_events.get(key)
    if not canonical:
        return False
    match_date = (match.get('date') or '')[:10]
    canonical_date = (canonical.get('date') or '')[:10]
    return bool(match_date and canonical_date and match_date != canonical_date)


def _strip_internal_match_fields(match: Dict) -> Dict:
    return {k: v for k, v in match.items() if not k.startswith('_')}




def find_matches_for_date(target_date: str) -> list:
    base_dir = DATA_DIR
    seen_matches = {}  # match_key -> match data
    canonical_events = _build_canonical_raw_event_index(base_dir)
    
    for comp_type, country, comp_name, comp_dir in iter_competition_dirs(base_dir):
        if not _include_competition_path_in_daily(comp_type, country, comp_name):
            continue
        
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

                        if _is_stale_rescheduled_entry(match, canonical_events):
                            continue

                        raw_status = match.get('status', '')
                        home_score = match.get('home_score')
                        away_score = match.get('away_score')

                        if raw_status == 'notstarted' and home_score is None and away_score is None:
                            continue

                        match_data = _raw_match_to_match_data(
                            match, comp_type, country, comp_name,
                            source_rank=1 if raw_file.name == 'all_seasons.json' else 2,
                            source_path=raw_file,
                        )
                        event_id = match_data.get('event_id')
                        match_key = str(event_id) if event_id else f"{comp_type}_{country}_{comp_name}_{match_data['home']}_{match_data['away']}"
                        
                        seen_matches[match_key] = _merge_source_match(
                            seen_matches.get(match_key),
                            match_data,
                        )
                except Exception:
                    pass
        
        features_file = comp_dir / 'features' / 'features_all_seasons.json'
        if features_file.exists():
            try:
                with open(features_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                for match in data.get('samples', []):
                    if match.get('date', '').startswith(target_date):
                        if _is_stale_rescheduled_entry(match, canonical_events):
                            continue

                        home = match.get('home_team')
                        away = match.get('away_team')
                        event_id = match.get('event_id')
                        match_key = str(event_id) if event_id else f"{comp_type}_{country}_{comp_name}_{home}_{away}"
                        
                        if match_key in seen_matches:
                            if event_id and not seen_matches[match_key].get('event_id'):
                                seen_matches[match_key]['event_id'] = event_id
                            seen_matches[match_key]['features'] = match
                        else:
                            home_goals = match.get('label_home_goals')
                            away_goals = match.get('label_away_goals')
                            score = f"{home_goals}-{away_goals}" if home_goals is not None and away_goals is not None else None
                            result = match.get('label_result')
                            status = 'finished' if result else ('upcoming' if match.get('status') in ('upcoming', 'notstarted', 'postponed', 'canceled') else 'finished')
                            
                            candidate = {
                                'event_id': event_id,
                                'comp_type': comp_type,
                                'country': country,
                                'league': comp_name,
                                'home': match.get('home_team'),
                                'away': match.get('away_team'),
                                'home_team_id': match.get('home_team_id'),
                                'away_team_id': match.get('away_team_id'),
                                'result': result,
                                'score': score,
                                'status': status,
                                'date': match.get('date', ''),
                                'start_time': match.get('time', ''),
                                'features': match,
                                '_source_rank': 0,
                            }
                            seen_matches[match_key] = _merge_source_match(
                                seen_matches.get(match_key),
                                candidate,
                            )
            except Exception:
                pass
        
        upcoming_dir = comp_dir / 'raw' / 'upcoming'
        if upcoming_dir.exists():
            for upcoming_file in sorted(upcoming_dir.glob('*.json'), key=lambda p: _upcoming_file_sort_key(p, target_date)):
                try:
                    with open(upcoming_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    file_season = data.get('metadata', {}).get('season', '')
                    if file_season and not _validate_season_name(comp_name, file_season):
                        continue

                    for match in data.get('matches', []):
                        if match.get('date', '').startswith(target_date):
                            if _is_stale_rescheduled_entry(match, canonical_events):
                                continue

                            source_rank = 1
                            if upcoming_file.name == f"upcoming_scheduled_{target_date}.json":
                                source_rank = 2
                            match_entry = _raw_match_to_match_data(
                                match, comp_type, country, comp_name,
                                source_rank=source_rank,
                                source_path=upcoming_file,
                            )
                            event_id = match_entry.get('event_id')
                            match_key = str(event_id) if event_id else f"{comp_type}_{country}_{comp_name}_{match_entry['home']}_{match_entry['away']}"
                            seen_matches[match_key] = _merge_source_match(
                                seen_matches.get(match_key),
                                match_entry,
                            )
                except Exception:
                    pass
    
    return [_strip_internal_match_fields(m) for m in seen_matches.values()]


def _event_unique_tournament_id(event: dict):
    tournament = event.get('tournament') or {}
    unique_tournament = tournament.get('uniqueTournament') or event.get('uniqueTournament') or {}
    return unique_tournament.get('id')


def _competition_lookup_by_tournament_id(competitions: dict) -> dict:
    lookup = {}
    for comp_type, countries in competitions.items():
        for country, comps in countries.items():
            for comp_name, comp_data in comps.items():
                if not _include_competition_in_daily(comp_data):
                    continue
                tournament_id = comp_data.get('tournament_id')
                if tournament_id:
                    lookup[tournament_id] = (comp_type, country, comp_name)
    return lookup


def _include_competition_in_daily(comp_data: Optional[Dict]) -> bool:
    return not isinstance(comp_data, dict) or comp_data.get('include_in_daily', True) is not False


def _competition_config(comp_type: str, country: str, comp_name: str) -> Dict:
    try:
        from sofascore.config import COMPETITIONS
    except Exception:
        return {}

    countries = COMPETITIONS.get(comp_type, {})
    exact = countries.get(country, {}).get(comp_name)
    if isinstance(exact, dict):
        return exact

    for comps in countries.values():
        candidate = comps.get(comp_name)
        if isinstance(candidate, dict):
            return candidate

    return {}


def _include_competition_path_in_daily(comp_type: str, country: str, comp_name: str) -> bool:
    return _include_competition_in_daily(_competition_config(comp_type, country, comp_name))


def _iter_competition_configs(competitions: dict):
    for comp_type, countries in competitions.items():
        for country, comps in countries.items():
            for comp_name, comp_data in comps.items():
                if not _include_competition_in_daily(comp_data):
                    continue
                tournament_id = comp_data.get('tournament_id')
                if tournament_id:
                    yield comp_type, country, comp_name, comp_data, tournament_id


def _format_comp_key(comp_key):
    return "/".join(str(part) for part in comp_key)


def _competition_key_index(competitions: dict):
    known_keys = set()
    keys_by_name = {}
    for comp_type, country, comp_name, _comp_data, _tournament_id in _iter_competition_configs(competitions):
        comp_key = (comp_type, country, comp_name)
        known_keys.add(comp_key)
        keys_by_name.setdefault(comp_name, set()).add(comp_key)
    return known_keys, keys_by_name


def _resolve_comp_key_refs(comp_refs, competitions: dict) -> set:
    known_keys, keys_by_name = _competition_key_index(competitions)
    selected = set()
    for comp_type, country, comp_name in comp_refs:
        comp_key = (comp_type, country, comp_name)
        if comp_key in known_keys:
            selected.add(comp_key)
            continue

        matches = {key for key in keys_by_name.get(comp_name, set()) if key[0] == comp_type}
        if len(matches) == 1:
            selected.update(matches)
    return selected


def _daily_fallback_comp_keys_from_env(competitions: dict) -> set:
    raw = os.environ.get("SOFASCORE_DAILY_COMP_KEYS", "").strip()
    if not raw:
        return set()

    known_keys, keys_by_name = _competition_key_index(competitions)
    selected = set()
    for entry in re.split(r"[,;]+", raw):
        entry = entry.strip()
        if not entry:
            continue

        parts = [part.strip() for part in re.split(r"[:/]+", entry) if part.strip()]
        if len(parts) == 3:
            comp_key = tuple(parts)
            if comp_key in known_keys:
                selected.add(comp_key)
            else:
                print(f"[WARN] SOFASCORE_DAILY_COMP_KEYS entry not found: {entry}")
            continue

        if len(parts) == 2:
            matches = {key for key in keys_by_name.get(parts[1], set()) if key[0] == parts[0]}
            if len(matches) == 1:
                selected.update(matches)
            elif not matches:
                print(f"[WARN] SOFASCORE_DAILY_COMP_KEYS entry not found: {entry}")
            else:
                options = ", ".join(_format_comp_key(key) for key in sorted(matches))
                print(f"[WARN] SOFASCORE_DAILY_COMP_KEYS entry is ambiguous: {entry} ({options})")
            continue

        if len(parts) == 1:
            matches = keys_by_name.get(parts[0], set())
            if len(matches) == 1:
                selected.update(matches)
            elif not matches:
                print(f"[WARN] SOFASCORE_DAILY_COMP_KEYS entry not found: {entry}")
            else:
                options = ", ".join(_format_comp_key(key) for key in sorted(matches))
                print(f"[WARN] SOFASCORE_DAILY_COMP_KEYS entry is ambiguous: {entry} ({options})")
            continue

        print(f"[WARN] Invalid SOFASCORE_DAILY_COMP_KEYS entry: {entry}")

    return selected


def _truthy_env(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _match_belongs_to_date(match: dict, target_date: str) -> bool:
    for key in ("date", "start_time", "datetime"):
        value = match.get(key)
        if isinstance(value, str) and value.startswith(target_date):
            return True
    return False


def _local_scheduled_comp_keys_for_date(base_dir: Path, target_date: str, competitions: dict) -> set:
    comp_refs = set()
    for comp_type, country, comp_name, comp_dir in iter_competition_dirs(base_dir):
        if not _include_competition_path_in_daily(comp_type, country, comp_name):
            continue

        raw_dir = comp_dir / "raw"
        if not raw_dir.exists():
            continue

        raw_files = []
        upcoming_dir = raw_dir / "upcoming"
        if upcoming_dir.exists():
            raw_files.extend(sorted(upcoming_dir.glob("*.json"), key=lambda path: _upcoming_file_sort_key(path, target_date), reverse=True))
        raw_files.extend(sorted(raw_dir.glob("*.json")))

        for raw_file in raw_files:
            try:
                with open(raw_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                continue

            matches = data.get("matches", []) if isinstance(data, dict) else []
            if any(isinstance(match, dict) and _match_belongs_to_date(match, target_date) for match in matches):
                comp_refs.add((comp_type, country, comp_name))
                break

    return _resolve_comp_key_refs(comp_refs, competitions)

def _fetch_tournament_scheduled_events_by_comp(
    scraper,
    target_date: str,
    competitions: dict,
    only_comp_keys=None,
    fallback_comp_keys=None,
    allow_broad_scan: bool = True,
):
    events_by_comp = {}
    total_events = 0

    scope_keys = set(only_comp_keys or [])
    if not scope_keys:
        scope_keys = set(fallback_comp_keys or [])
    if scope_keys:
        resolved_scope_keys = _resolve_comp_key_refs(scope_keys, competitions)
        if resolved_scope_keys:
            scope_keys = resolved_scope_keys

    if not scope_keys and not allow_broad_scan:
        print("Tournament scheduled-events fallback skipped: no scoped competition candidates.")
        return events_by_comp, total_events

    if scope_keys:
        keys_text = ", ".join(_format_comp_key(key) for key in sorted(scope_keys))
        print(f"Tournament scheduled-events fallback restricted to: {keys_text}")

    for comp_type, country, comp_name, _comp_data, tournament_id in _iter_competition_configs(competitions):
        comp_key = (comp_type, country, comp_name)
        if scope_keys and comp_key not in scope_keys:
            continue

        events = scraper.get_tournament_scheduled_events(tournament_id, target_date)
        if events is None:
            if _print_sofascore_api_blocked(scraper):
                return None, total_events
            continue
        if not events:
            continue

        events_by_comp[comp_key] = events
        total_events += len(events)

    return events_by_comp, total_events

def _load_finished_matches_for_features(raw_dir: Path) -> list:
    all_seasons_path = raw_dir / 'all_seasons.json'
    if all_seasons_path.exists():
        try:
            with open(all_seasons_path, 'r', encoding='utf-8') as f:
                return json.load(f).get('matches', [])
        except Exception:
            return []
    return []


def _print_sofascore_api_blocked(scraper) -> bool:
    if not getattr(scraper, 'api_blocked', False):
        return False

    error = getattr(scraper, 'last_api_error', None) or {}
    endpoint = error.get('endpoint') or 'unknown endpoint'
    code = error.get('code') or 'unknown code'
    reason = error.get('reason') or 'unknown reason'
    print("\n[ERROR] Sofascore API is blocked for this session.")
    print(f"Endpoint: {endpoint}")
    print(f"Response: {code} {reason}")
    print("Live Sofascore fetch/update cannot continue until Sofascore stops returning the anti-bot challenge.")
    return True


def _sofascore_bootstrap_url(target_date: Optional[str]) -> str:
    if target_date:
        return f"https://www.sofascore.com/api/v1/sport/football/scheduled-events/{target_date}"
    return "https://www.sofascore.com/api/v1/sport/football/categories"


def _warm_up_sofascore_session(driver, target_date: Optional[str] = None):
    import time

    full_page = str(os.environ.get('SOFASCORE_FULL_PAGE_BOOTSTRAP', '')).strip().lower()
    if full_page in {'1', 'true', 'yes', 'on'}:
        url = f"https://www.sofascore.com/football/{target_date}" if target_date else "https://www.sofascore.com"
        wait_seconds = 3.0
        mode = "full page"
    else:
        url = _sofascore_bootstrap_url(target_date)
        wait_seconds = 0.75
        mode = "api"

    try:
        wait_seconds = max(0.0, float(os.environ.get('SOFASCORE_BOOTSTRAP_WAIT', wait_seconds)))
    except ValueError:
        pass

    print(f"[SOFASCORE] Session bootstrap ({mode}): {url}")
    driver.get(url)
    if wait_seconds:
        time.sleep(wait_seconds)


def _print_sofascore_request_summary(scraper):
    if scraper is None:
        return
    limit = getattr(scraper, 'max_api_requests', None) or 'unlimited'
    count = getattr(scraper, 'api_request_count', 0)
    print(f"[SOFASCORE] API requests used: {count}/{limit}")


def _scrape_scheduled_upcoming(scraper, target_date: str, competitions: dict, base_dir: Path) -> bool:
    from sofascore import FootballDataManager
    from sofascore.utils import extract_match_data, extract_referee_data, extract_odds

    scheduled_events = scraper.get_scheduled_events(target_date)
    events_by_comp = {}
    total_events = 0

    if scheduled_events:
        competition_lookup = _competition_lookup_by_tournament_id(competitions)
        for event in scheduled_events:
            comp_key = competition_lookup.get(_event_unique_tournament_id(event))
            if comp_key:
                events_by_comp.setdefault(comp_key, []).append(event)
        total_events = len(scheduled_events)
    else:
        if scheduled_events is None:
            print("Scheduled events endpoint unavailable; trying tournament scheduled-events.")
        else:
            print("Scheduled events endpoint returned 0 events; trying tournament scheduled-events.")

        fallback_comp_keys = _daily_fallback_comp_keys_from_env(competitions)
        if fallback_comp_keys:
            print("Using SOFASCORE_DAILY_COMP_KEYS for tournament scheduled-events fallback.")
        else:
            fallback_comp_keys = _local_scheduled_comp_keys_for_date(base_dir, target_date, competitions)
            if fallback_comp_keys:
                print("Using local upcoming data to scope tournament scheduled-events fallback.")

        allow_broad_scan = _truthy_env("SOFASCORE_ALLOW_BROAD_DAILY_SCAN")
        events_by_comp, total_events = _fetch_tournament_scheduled_events_by_comp(
            scraper,
            target_date,
            competitions,
            fallback_comp_keys=fallback_comp_keys,
            allow_broad_scan=allow_broad_scan,
        )
        if events_by_comp is None:
            return False
        if not events_by_comp:
            if allow_broad_scan:
                print("Tournament scheduled-events returned 0 tracked events; falling back to season lookup.")
                return False
            print("No scoped tournament scheduled-events found; skipping broad season lookup to avoid API block.")
            return True

    tracked_count = sum(len(v) for v in events_by_comp.values())
    print(f"Scheduled events for {target_date}: {total_events} total, {tracked_count} tracked")

    for comp_type, country, comp_name in sorted(events_by_comp):
        events = events_by_comp[(comp_type, country, comp_name)]
        print(f"\n[{country}/{comp_name}]")

        dm = FootballDataManager(base_dir, comp_type, country, comp_name)
        raw_dir = Path(dm.paths['raw'])
        raw_dir.mkdir(parents=True, exist_ok=True)

        finished_matches = _load_finished_matches_for_features(raw_dir)
        fg = MLFeatureGenerator(dm)

        processed = []
        features = []
        team_history_cache = {}
        for event in events:
            match_data = extract_match_data(event)
            event_id = event.get('id')

            if event_id:
                odds_markets = scraper.get_match_odds(event_id)
                if odds_markets:
                    odds = extract_odds(odds_markets)
                    if odds:
                        match_data.update(odds)

                event_details = scraper.get_event_details(event_id)
                referee_data = extract_referee_data(event_details)
                if referee_data:
                    match_data.update(referee_data)

            processed.append(match_data)
            history_context = finished_matches + [match_data]
            feature_history = _team_history_for_match(
                {
                    'comp_type': comp_type,
                    'home': match_data.get('home_team'),
                    'away': match_data.get('away_team'),
                    'home_team_id': match_data.get('home_team_id'),
                    'away_team_id': match_data.get('away_team_id'),
                },
                history_context,
                team_history_cache,
                scraper=scraper,
                force_fetch=TEAM_HISTORY_FORCE_REFRESH,
            )
            feature_source_history = _history_for_feature_generation(
                {
                    'comp_type': comp_type,
                    'home': match_data.get('home_team'),
                    'away': match_data.get('away_team'),
                },
                history_context,
                feature_history,
            )
            elo_table = None
            if match_data.get('event_id'):
                elo_table = fg._compute_elo_table([*(feature_source_history or []), match_data])
            feature_data = fg.generate_match_features(
                match_data,
                history_context,
                elo_table=elo_table,
                team_history_matches=feature_source_history,
            )
            feature_data['result'] = None
            feature_data['label_result'] = None
            feature_data['label_result_int'] = None
            feature_data['label_home_goals'] = None
            feature_data['label_away_goals'] = None
            feature_data['label_total_goals'] = None
            feature_data['status'] = match_data.get('status')
            features.append(feature_data)

        upcoming_dir = raw_dir / 'upcoming'
        upcoming_dir.mkdir(parents=True, exist_ok=True)
        upcoming_path = upcoming_dir / f'upcoming_scheduled_{target_date}.json'
        with open(upcoming_path, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': {
                    'competition_type': comp_type,
                    'country': country,
                    'league': comp_name,
                    'season': f'Scheduled {target_date}',
                    'scraped_at': datetime.now().isoformat(),
                    'total_matches': len(processed),
                },
                'matches': processed,
                'features': features,
            }, f, ensure_ascii=False, indent=2)

        print(f"  Saved {len(processed)} scheduled matches")

    return True


def _update_results_from_scheduled_events(
    scraper,
    target_date: str,
    base_dir: Path,
    competitions: Optional[dict] = None,
) -> Optional[Dict]:
    comps_to_check = _collect_competitions_requiring_update(base_dir, target_date)
    scheduled_events = []
    used_scoped_tournament_first = bool(
        competitions and comps_to_check and not _truthy_env("SOFASCORE_ALLOW_BROAD_DAILY_SCAN")
    )

    if used_scoped_tournament_first:
        print("Skipping global scheduled-events endpoint; using scoped tournament scheduled-events.")
        events_by_comp, _total_events = _fetch_tournament_scheduled_events_by_comp(
            scraper,
            target_date,
            competitions,
            only_comp_keys=comps_to_check,
        )
        if events_by_comp is None:
            return None
        scheduled_events = [
            event
            for events in events_by_comp.values()
            for event in events
        ]
    else:
        scheduled_events = scraper.get_scheduled_events(target_date)
    if not scheduled_events and not used_scoped_tournament_first:
        if scheduled_events is None:
            print("Scheduled events endpoint unavailable; trying tournament scheduled-events.")
        else:
            print("Scheduled events endpoint returned 0 events; trying tournament scheduled-events.")

        if competitions and comps_to_check:
            events_by_comp, _total_events = _fetch_tournament_scheduled_events_by_comp(
                scraper,
                target_date,
                competitions,
                only_comp_keys=comps_to_check,
            )
            if events_by_comp is None:
                return None
            scheduled_events = [
                event
                for events in events_by_comp.values()
                for event in events
            ]

    if not scheduled_events:
        if not _truthy_env("SOFASCORE_ALLOW_BROAD_DAILY_SCAN"):
            print("Tournament scheduled-events returned 0 update candidates; skipping season lookup to avoid API block.")
            return {
                'source_ok': False,
                'api_blocked': False,
                'matched_count': 0,
                'updated_count': 0,
                'skip_season_lookup': True,
            }
        print("Tournament scheduled-events returned 0 update candidates; falling back to season lookup.")
        return None

    events_by_id = {event.get('id'): event for event in scheduled_events if event.get('id')}
    events_by_teams = {}
    for event in scheduled_events:
        home_id = event.get('homeTeam', {}).get('id')
        away_id = event.get('awayTeam', {}).get('id')
        if home_id and away_id:
            events_by_teams[(home_id, away_id)] = event

    updated_count = 0
    matched_count = 0
    for _comp_type, _country, _comp_name, comp_dir in iter_competition_dirs(base_dir):
        raw_dir = comp_dir / 'raw'
        if not raw_dir.exists():
            continue

        raw_files = list(raw_dir.glob('*.json'))
        upcoming_dir = raw_dir / 'upcoming'
        if upcoming_dir.exists():
            raw_files.extend(upcoming_dir.glob('*.json'))

        for raw_file in raw_files:
            try:
                with open(raw_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except Exception:
                continue

            modified = False
            for match in data.get('matches', []):
                if not match.get('date', '').startswith(target_date):
                    continue

                api_match = events_by_id.get(match.get('event_id'))
                if not api_match:
                    api_match = events_by_teams.get((match.get('home_team_id'), match.get('away_team_id')))
                if not api_match:
                    continue

                matched_count += 1
                api_status = api_match.get('status', {}).get('type', '')
                has_score = _apply_api_score_fields(match, api_match)
                _refresh_score_details_if_needed(scraper, match, api_match, api_status)

                if api_status == 'finished' and has_score:
                    match['status'] = 'finished'
                    if api_match.get('id') and not match.get('event_id'):
                        match['event_id'] = api_match.get('id')
                    modified = True
                    updated_count += 1
                elif api_status == 'postponed':
                    match['status'] = 'postponed'
                    if api_match.get('id') and not match.get('event_id'):
                        match['event_id'] = api_match.get('id')
                    modified = True
                elif api_status == 'inprogress':
                    match['status'] = 'inprogress'
                    if api_match.get('id') and not match.get('event_id'):
                        match['event_id'] = api_match.get('id')
                    modified = True

            if modified:
                if data.get('metadata'):
                    data['metadata']['last_update'] = datetime.now().isoformat()
                with open(raw_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"[OK] Matched {matched_count}, updated {updated_count} matches from scheduled events")
    return {
        'source_ok': matched_count > 0,
        'matched_count': matched_count,
        'updated_count': updated_count,
    }


def _collect_competitions_requiring_update(base_dir: Path, target_date: str):
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
                        has_score = match.get('home_score') is not None and match.get('away_score') is not None
                        needs_score_refresh = comp_type != 'league' and _looks_like_unverified_shootout_score(match)
                        if status in ('inprogress', 'upcoming', 'notstarted') or not has_score or needs_score_refresh:
                            needs_update = True
                            break
                if needs_update:
                    break
            except Exception:
                continue

        if needs_update:
            comps_to_check.add((comp_type, country, comp_name))

    return comps_to_check


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
    
    _warm_up_sofascore_session(driver, target_date)
    
    try:
        if target_date:
            if _scrape_scheduled_upcoming(scraper, target_date, COMPETITIONS, Path(BASE_DIR)):
                print("\n[OK] Fetching complete")
                return True
            if getattr(scraper, 'api_blocked', False):
                _print_sofascore_api_blocked(scraper)
                return False

        for comp_type in COMP_TYPES:
            type_config = COMPETITIONS.get(comp_type, {})
            if not type_config:
                continue
            
            print(f"\n{'='*50}")
            print(f"  [{comp_type.upper()}]")
            print(f"{'='*50}")
            
            for country, country_comps in type_config.items():
                for comp_name, comp_data in country_comps.items():
                    if not _include_competition_in_daily(comp_data):
                        continue

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

                    if getattr(scraper, 'api_blocked', False) and not comp_data.get('seasons'):
                        print("[SKIP] API blocked and no configured season")
                        continue

                    current_season = _resolve_current_season(scraper, comp_data, tournament_id, comp_name)
                    if not current_season:
                        if _print_sofascore_api_blocked(scraper):
                            return False
                        print("  Failed to fetch seasons")
                        continue

                    season_id = current_season['id']
                    season_name = current_season.get('name', f"Season {season_id}")

                    print(f"  Season: {season_name} (ID: {season_id})")
                    
                    upcoming = scrape_upcoming_matches(
                        scraper, dm, fg, tournament_id, season_id, season_name
                    )
                    if _print_sofascore_api_blocked(scraper):
                        return False
                    
                    if target_date and upcoming:
                        matches_for_date = [m for m in upcoming
                                            if m.get('date', '').startswith(target_date)]
                        print(f"  Matches on {target_date}: {len(matches_for_date)}")
                    
                    time.sleep(2)
    finally:
        _print_sofascore_request_summary(scraper)
        driver.quit()
    
    print("\n[OK] Fetching complete")
    return True


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
    
    base_dir = DATA_DIR
    
    comps_to_check = _collect_competitions_requiring_update(base_dir, target_date)
    
    if not comps_to_check:
        print("No matches requiring update found.")
        return {
            'source_ok': True,
            'api_blocked': False,
            'matched_count': 0,
            'updated_count': 0,
        }
    
    print(f"Competitions to check: {len(comps_to_check)}")
    for ct, c, l in sorted(comps_to_check):
        print(f"  - [{ct}] {c}/{l}")
    
    driver, user_agent = create_stealth_driver(headless=False)
    scraper = SofascoreSeleniumScraper(driver)
    
    _warm_up_sofascore_session(driver, target_date)
    import time
    
    updated_count = 0
    matched_count = 0
    
    try:
        scheduled_update = _update_results_from_scheduled_events(scraper, target_date, base_dir, COMPETITIONS)
        if scheduled_update is None and _print_sofascore_api_blocked(scraper):
            return {
                'source_ok': False,
                'api_blocked': True,
                'matched_count': matched_count,
                'updated_count': updated_count,
            }
        if scheduled_update is not None:
            if scheduled_update.get('skip_season_lookup'):
                return scheduled_update
            matched_count += scheduled_update.get('matched_count', 0)
            updated_count += scheduled_update.get('updated_count', 0)
            remaining = _collect_competitions_requiring_update(base_dir, target_date)
            if not remaining:
                return {
                    'source_ok': matched_count > 0,
                    'api_blocked': False,
                    'matched_count': matched_count,
                    'updated_count': updated_count,
                }
            comps_to_check = remaining
            print(f"Remaining competitions after scheduled update: {len(comps_to_check)}")
            for ct, c, l in sorted(comps_to_check):
                print(f"  - [{ct}] {c}/{l}")

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
            
            current_season = _resolve_current_season(scraper, comp_config, tournament_id, comp_name)
            if not current_season:
                if _print_sofascore_api_blocked(scraper):
                    return {
                        'source_ok': False,
                        'api_blocked': True,
                        'matched_count': matched_count,
                        'updated_count': updated_count,
                    }
                print("  Failed to fetch seasons")
                continue

            season_id = current_season['id']
            season_name = current_season.get('name', f"Season {season_id}")

            print(f"  Season: {season_name}")

            all_api_matches = scraper.get_all_season_matches(tournament_id, season_id)
            if _print_sofascore_api_blocked(scraper):
                return {
                    'source_ok': False,
                    'api_blocked': True,
                    'matched_count': matched_count,
                    'updated_count': updated_count,
                }
            
            date_matches = []
            for m in all_api_matches:
                match_ts = m.get('startTimestamp', 0)
                match_date = datetime.fromtimestamp(match_ts).strftime('%Y-%m-%d')
                if match_date == target_date:
                    date_matches.append(m)
            
            print(f"  Matches from API for {target_date}: {len(date_matches)}")
            
            if not date_matches:
                continue
            
            if comp_type in ('european', 'international'):
                raw_dir = base_dir / comp_type / comp_name / 'raw'
            else:
                raw_dir = base_dir / comp_type / country / comp_name / 'raw'
            
            reported_matches = set()
            all_files = list(raw_dir.glob('*.json'))
            upcoming_sub = raw_dir / 'upcoming'
            if upcoming_sub.exists():
                all_files.extend(upcoming_sub.glob('*.json'))

            for raw_file in all_files:
                updated_matches = set()

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
                            first_report_for_match = match_key not in reported_matches
                            if first_report_for_match:
                                matched_count += 1
                            api_status = api_m.get('status', {}).get('type', '')
                            has_score = _apply_api_score_fields(match, api_m)
                            _refresh_score_details_if_needed(scraper, match, api_m, api_status)

                            if api_status == 'finished' and has_score:
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
                                            _apply_penalty_score_from_incidents(match, incidents)
                                            match['home_yellow_cards_calc'] = sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'yellow' and i.get('isHome'))
                                            match['away_yellow_cards_calc'] = sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'yellow' and not i.get('isHome'))
                                            match['home_red_cards_calc'] = sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'red' and i.get('isHome'))
                                            match['away_red_cards_calc'] = sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'red' and not i.get('isHome'))
                                        time.sleep(0.3)
                                    except Exception as e:
                                        print(f"    [WARN] Failed to fetch statistics: {e}")

                                matches[idx] = match
                                modified = True
                                if first_report_for_match:
                                    updated_count += 1
                                    score_text = _score_text_from_match(match) or "?-?"
                                    penalty_score_text = _penalty_score_text_from_match(match)
                                    penalty_suffix = f" (pen {penalty_score_text})" if penalty_score_text else ""
                                    print(f"    OK {match.get('home_team')} {score_text}{penalty_suffix} {match.get('away_team')}")
                                updated_matches.add(match_key)
                                reported_matches.add(match_key)
                            elif api_status == 'postponed':
                                match['status'] = 'postponed'
                                matches[idx] = match
                                modified = True
                                updated_matches.add(match_key)
                                if first_report_for_match:
                                    print(f"    PP {match.get('home_team')} vs {match.get('away_team')} - POSTPONED")
                                reported_matches.add(match_key)
                            elif api_status == 'inprogress':
                                if first_report_for_match:
                                    print(f"    .. {match.get('home_team')} vs {match.get('away_team')} - IN PROGRESS")
                                reported_matches.add(match_key)
                            break

                if modified:
                    data['matches'] = matches
                    if data.get('metadata'):
                        data['metadata']['last_update'] = datetime.now().isoformat()
                    with open(raw_file, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
            
            time.sleep(1)
    
    finally:
        _print_sofascore_request_summary(scraper)
        driver.quit()
    
    print(f"\n[OK] Matched {matched_count}, updated {updated_count} matches")
    return {
        'source_ok': matched_count > 0,
        'api_blocked': False,
        'matched_count': matched_count,
        'updated_count': updated_count,
    }


def load_historical_matches(comp_type: str, country: str, league: str) -> list:
    base_dir = DATA_DIR
    
    if comp_type in ('european', 'international'):
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


def _historical_match_key(match: Dict) -> str:
    event_id = match.get('event_id')
    if event_id not in (None, ''):
        return f"event:{event_id}"
    return "|".join(str(match.get(key) or '') for key in (
        'date', 'home_team_id', 'away_team_id', 'home_team', 'away_team'
    ))


def _dedupe_historical_matches(matches: List[Dict]) -> List[Dict]:
    deduped = {}
    for match in matches:
        key = _historical_match_key(match)
        existing = deduped.get(key)
        if existing is None:
            deduped[key] = match
            continue

        existing_score = existing.get('home_score') is not None and existing.get('away_score') is not None
        candidate_score = match.get('home_score') is not None and match.get('away_score') is not None
        if candidate_score and not existing_score:
            deduped[key] = {**match, **{k: v for k, v in existing.items() if match.get(k) in (None, '')}}

    return list(deduped.values())


def _team_history_cache_path(team_id) -> Path:
    return TEAM_HISTORY_DIR / f"{team_id}.json"


def _load_cached_team_history(team_id) -> List[Dict]:
    if team_id in (None, ''):
        return []

    path = _team_history_cache_path(team_id)
    if not path.exists():
        return []

    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get('matches', []) if isinstance(data, dict) else []
    except Exception:
        return []


def _has_team_history_detail(match: Dict) -> bool:
    return any(match.get(key) not in (None, '') for key in TEAM_HISTORY_DETAIL_KEYS)


def _has_team_history_model_stats(match: Dict) -> bool:
    return any(match.get(key) not in (None, '') for key in TEAM_HISTORY_MODEL_STAT_KEYS)


def _team_history_detail_count(matches: List[Dict]) -> int:
    return sum(1 for match in matches or [] if _has_team_history_detail(match))


def _save_cached_team_history(team_id, team_name: str, matches: List[Dict]):
    if team_id in (None, ''):
        return

    TEAM_HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    path = _team_history_cache_path(team_id)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({
            'metadata': {
                'team_id': team_id,
                'team_name': team_name,
                'source': 'sofascore_team_events_last',
                'pages': TEAM_HISTORY_MAX_PAGES,
                'scraped_at': datetime.now().isoformat(),
                'total_matches': len(matches),
                'detailed_matches': _team_history_detail_count(matches),
            },
            'matches': matches,
        }, f, ensure_ascii=False, indent=2)


def _normalize_team_history_events(events: List[Dict]) -> List[Dict]:
    from sofascore.utils import extract_match_data

    matches = []
    for event in events or []:
        try:
            match_data = extract_match_data(event)
        except Exception:
            continue

        if match_data.get('home_score') is None or match_data.get('away_score') is None:
            continue

        tournament = event.get('tournament') or {}
        unique_tournament = tournament.get('uniqueTournament') or event.get('uniqueTournament') or {}
        if unique_tournament.get('name') or tournament.get('name'):
            match_data['source_competition'] = unique_tournament.get('name') or tournament.get('name')
        matches.append(match_data)

    return _dedupe_historical_matches(matches)


def _enrich_team_history_match(scraper, match: Dict) -> bool:
    event_id = match.get('event_id') or match.get('id')
    if not event_id:
        return False

    changed = False

    try:
        stats = scraper.get_match_statistics(event_id)
        if stats:
            from sofascore.utils import extract_statistics
            stat_data = extract_statistics(stats, period='ALL')
            for key, value in stat_data.items():
                if value not in (None, '') and match.get(key) in (None, ''):
                    match[key] = value
                    changed = True
    except Exception as exc:
        print(f"    [WARN] Team history statistics failed for event {event_id}: {exc}")
    if getattr(scraper, 'api_blocked', False):
        return changed

    if TEAM_HISTORY_ENRICH_DELAY:
        import time
        time.sleep(TEAM_HISTORY_ENRICH_DELAY)

    try:
        shotmap = scraper.get_match_shotmap(event_id)
        if shotmap:
            home_xg = round(sum(s.get('xg', 0) for s in shotmap if s.get('isHome')), 3)
            away_xg = round(sum(s.get('xg', 0) for s in shotmap if not s.get('isHome')), 3)
            if match.get('home_xg') in (None, ''):
                match['home_xg'] = home_xg
                changed = True
            if match.get('away_xg') in (None, ''):
                match['away_xg'] = away_xg
                changed = True
    except Exception as exc:
        print(f"    [WARN] Team history shotmap failed for event {event_id}: {exc}")
    if getattr(scraper, 'api_blocked', False):
        return changed

    if TEAM_HISTORY_ENRICH_DELAY:
        import time
        time.sleep(TEAM_HISTORY_ENRICH_DELAY)

    try:
        incidents = scraper.get_match_incidents(event_id)
        if incidents:
            card_values = {
                'home_yellow_cards_calc': sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'yellow' and i.get('isHome')),
                'away_yellow_cards_calc': sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'yellow' and not i.get('isHome')),
                'home_red_cards_calc': sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'red' and i.get('isHome')),
                'away_red_cards_calc': sum(1 for i in incidents if i.get('incidentType') == 'card' and i.get('incidentClass') == 'red' and not i.get('isHome')),
            }
            for key, value in card_values.items():
                if match.get(key) in (None, ''):
                    match[key] = value
                    changed = True
    except Exception as exc:
        print(f"    [WARN] Team history incidents failed for event {event_id}: {exc}")

    if TEAM_HISTORY_ENRICH_DELAY:
        import time
        time.sleep(TEAM_HISTORY_ENRICH_DELAY)

    return changed


def _enrich_team_history_matches(scraper, matches: List[Dict], team_name: str) -> int:
    if not TEAM_HISTORY_ENRICH_STATS or scraper is None or not matches:
        return 0

    indexed = list(enumerate(matches))
    indexed.sort(key=lambda item: (item[1].get('date') or '', item[1].get('event_id') or 0), reverse=True)

    enriched = 0
    considered = 0
    for idx, match in indexed:
        if considered >= TEAM_HISTORY_ENRICH_LIMIT:
            break
        if match.get('home_score') is None or match.get('away_score') is None:
            continue
        considered += 1
        if _has_team_history_model_stats(match):
            continue

        if _enrich_team_history_match(scraper, match):
            enriched += 1

        if getattr(scraper, 'api_blocked', False):
            print(f"  [WARN] Team history stat enrichment stopped for {team_name}: Sofascore API blocked.")
            break

    if enriched:
        print(f"  Team history stats enriched: {team_name or '?'} ({enriched}/{considered} recent matches)")
    return enriched


def _load_or_fetch_team_history(scraper, team_id, team_name: str, force: bool = False) -> List[Dict]:
    cached = _load_cached_team_history(team_id)
    if cached and not force:
        if _enrich_team_history_matches(scraper, cached, team_name):
            _save_cached_team_history(team_id, team_name, cached)
        return cached

    if scraper is None or team_id in (None, ''):
        return cached

    try:
        events = scraper.get_all_team_previous_events(team_id, max_pages=TEAM_HISTORY_MAX_PAGES)
    except Exception as exc:
        print(f"  [WARN] Team history fetch failed for {team_name or team_id}: {exc}")
        return cached

    matches = _normalize_team_history_events(events)
    if matches:
        _enrich_team_history_matches(scraper, matches, team_name)
        _save_cached_team_history(team_id, team_name, matches)
        print(f"  Team history cached: {team_name or team_id} ({len(matches)} matches)")
        return matches

    return cached


def _team_history_for_match(match: Dict, competition_history: List[Dict],
                            cache: Dict, scraper=None, force_fetch: bool = False) -> Optional[List[Dict]]:
    if match.get('comp_type') != 'international':
        return None

    combined = list(competition_history or [])
    found_team_history = False

    for side in ('home', 'away'):
        team_id = match.get(f'{side}_team_id')
        team_name = match.get(side) or match.get(f'{side}_team')
        if team_id in (None, ''):
            continue

        cache_key = str(team_id)
        if cache_key not in cache:
            cache[cache_key] = _load_or_fetch_team_history(
                scraper,
                team_id,
                team_name,
                force=force_fetch,
            )

        team_matches = cache.get(cache_key) or []
        if team_matches:
            found_team_history = True
            combined.extend(team_matches)

    if not found_team_history:
        return None

    return _dedupe_historical_matches(combined)


def _history_for_feature_generation(match: Dict, competition_history: List[Dict],
                                    team_history: Optional[List[Dict]]) -> List[Dict]:
    if match.get('comp_type') != 'international':
        return competition_history or []
    if team_history is not None:
        return team_history

    safe_print(
        f"[WARN] Missing team history cache for {match.get('home', '?')} vs {match.get('away', '?')}; "
        "skipping tournament-only international form."
    )
    return []


def compute_features_for_upcoming(match: dict, historical_matches: list,
                                  lineups=None, club_stats_index=None,
                                  team_history_matches=None) -> dict:
    fg = MLFeatureGenerator()

    upcoming_match = {
        'event_id': match.get('event_id'),
        'date': match.get('date', datetime.now().strftime('%Y-%m-%d')),
        'round': 0,
        'home_team': match['home'],
        'away_team': match['away'],
        'home_team_id': match.get('home_team_id'),
        'away_team_id': match.get('away_team_id'),
    }
    for odds_key in ['odds_home_win', 'odds_draw', 'odds_away_win',
                     'odds_over_2_5', 'odds_under_2_5',
                     'odds_btts_yes', 'odds_btts_no']:
        if _is_positive_odds(match.get(odds_key)):
            upcoming_match[odds_key] = match[odds_key]

    elo_table = None
    if upcoming_match.get('event_id'):
        elo_history = team_history_matches if team_history_matches is not None else historical_matches
        elo_table = fg._compute_elo_table([*(elo_history or []), upcoming_match])

    features = fg.generate_match_features(upcoming_match, historical_matches,
                                          elo_table=elo_table,
                                          lineups=lineups,
                                          club_stats_index=club_stats_index,
                                          team_history_matches=team_history_matches)
    return features


def _should_compute_fresh_features(match: Dict) -> bool:
    return (
        match.get('status') == 'upcoming' or
        match.get('features') is None or
        match.get('comp_type') == 'international'
    )


def _features_with_source_odds(features: Dict, match: Dict) -> Dict:
    enriched = dict(features)
    _copy_positive_odds(enriched, match, overwrite=True)
    return enriched


def _same_team_id(left, right) -> bool:
    return left is not None and right is not None and str(left) == str(right)


def _match_has_team(match: dict, team: str, team_id=None) -> bool:
    if team_id is not None:
        return _same_team_id(match.get('home_team_id'), team_id) or _same_team_id(match.get('away_team_id'), team_id)
    return match.get('home_team') == team or match.get('away_team') == team


def _is_team_home(match: dict, team: str, team_id=None) -> bool:
    if team_id is not None:
        return _same_team_id(match.get('home_team_id'), team_id)
    return match.get('home_team') == team


def _team_last_n_matches(historical: list, team: str, n: int = 8, before_date: str = None, team_id=None) -> list:
    team_matches = []
    for m in historical:
        if m.get('home_score') is None or m.get('away_score') is None:
            continue
        if _match_has_team(m, team, team_id):
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
    home_id = match.get('home_team_id')
    away_id = match.get('away_team_id')
    match_date = match.get('date', datetime.now().strftime('%Y-%m-%d'))
    
    N = 8
    home_matches = _team_last_n_matches(historical, home, N, match_date, home_id)
    away_matches = _team_last_n_matches(historical, away, N, match_date, away_id)
    
    if not home_matches and not away_matches:
        return {}
    
    analysis = {}
    
    def _goals_stats(matches, team, team_id=None):
        scored = []
        conceded = []
        xg_for = []
        xg_against = []
        
        for m in matches:
            hs = m.get('home_score', 0) or 0
            as_ = m.get('away_score', 0) or 0
            is_home = _is_team_home(m, team, team_id)
            
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
            'xg_n': len(xg_for),
        }
    
    home_goals = _goals_stats(home_matches, home, home_id)
    away_goals = _goals_stats(away_matches, away, away_id)
    
    expected_home = home_goals['avg_xg_for'] if home_goals['avg_xg_for'] > 0 else home_goals['avg_scored']
    expected_away = away_goals['avg_xg_for'] if away_goals['avg_xg_for'] > 0 else away_goals['avg_scored']
    expected_total = round(expected_home + expected_away, 2)
    goals_source = 'xg' if home_goals.get('xg_n', 0) > 0 and away_goals.get('xg_n', 0) > 0 else 'scoreline'
    
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
    
    def _corners_stats(matches, team, team_id=None):
        corners_for = []
        corners_against = []
        for m in matches:
            hc = m.get('home_cornerkicks')
            ac = m.get('away_cornerkicks')
            if hc is None or ac is None:
                continue
            is_home = _is_team_home(m, team, team_id)
            corners_for.append(hc if is_home else ac)
            corners_against.append(ac if is_home else hc)
        return {
            'avg_for': round(_safe_avg(corners_for), 1),
            'avg_against': round(_safe_avg(corners_against), 1),
            'n': len(corners_for),
        }
    
    home_corners = _corners_stats(home_matches, home, home_id)
    away_corners = _corners_stats(away_matches, away, away_id)
    
    expected_corners = round(home_corners['avg_for'] + away_corners['avg_for'], 1)
    
    analysis['corners'] = {
        'home': home_corners,
        'away': away_corners,
        'expected_total': expected_corners,
        'over_8_5_pct': _poisson_over(expected_corners, 8.5),
        'over_10_5_pct': _poisson_over(expected_corners, 10.5),
    }
    
    def _cards_stats(matches, team, team_id=None):
        yellows = []
        for m in matches:
            hy = m.get('home_yellow_cards_calc') or m.get('home_yellowcards')
            ay = m.get('away_yellow_cards_calc') or m.get('away_yellowcards')
            if hy is None or ay is None:
                continue
            is_home = _is_team_home(m, team, team_id)
            yellows.append(hy if is_home else ay)
        return {
            'avg_team': round(_safe_avg(yellows), 1),
            'n': len(yellows),
        }
    
    home_cards = _cards_stats(home_matches, home, home_id)
    away_cards = _cards_stats(away_matches, away, away_id)
    
    expected_cards = round(home_cards['avg_team'] + away_cards['avg_team'], 1)
    
    analysis['cards'] = {
        'home': home_cards,
        'away': away_cards,
        'expected_total': expected_cards,
        'over_3_5_pct': _poisson_over(expected_cards, 3.5),
        'over_4_5_pct': _poisson_over(expected_cards, 4.5),
    }
    
    def _shots_stats(matches, team, team_id=None):
        shots_for = []
        shots_on_target = []
        big_chances = []
        possession = []
        for m in matches:
            is_home = _is_team_home(m, team, team_id)
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
    
    home_shots = _shots_stats(home_matches, home, home_id)
    away_shots = _shots_stats(away_matches, away, away_id)
    
    analysis['shots'] = {
        'home': home_shots,
        'away': away_shots,
    }
    
    def _form_string(matches, team, team_id=None, n=5):
        form = []
        for m in matches[:n]:
            hs = m.get('home_score', 0) or 0
            as_ = m.get('away_score', 0) or 0
            is_home = _is_team_home(m, team, team_id)
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
        'home': _form_string(home_matches, home, home_id),
        'away': _form_string(away_matches, away, away_id),
        'home_n': len(home_matches),
        'away_n': len(away_matches),
    }
    analysis['data_quality'] = {
        'goals_source': goals_source,
        'home_history_n': len(home_matches),
        'away_history_n': len(away_matches),
        'home_xg_n': home_goals.get('xg_n', 0),
        'away_xg_n': away_goals.get('xg_n', 0),
    }
    
    return analysis


def _get_missing_odds_features(features: Dict, predictor, target_name: str) -> List[str]:
    odds_cols = set()
    odds_cols.update(ODDS_REQUIREMENTS_BY_TARGET.get('__all__', []))
    odds_cols.update(ODDS_REQUIREMENTS_BY_TARGET.get(target_name, []))
    return sorted(col for col in odds_cols if not _is_positive_odds(features.get(col)))


def _split_target_predictions(all_target_preds: Dict) -> Dict:
    preds = all_target_preds.get('result', {})

    market_predictions = {}
    for t_name, t_preds in all_target_preds.items():
        if t_name != 'result':
            market_predictions[t_name] = t_preds

    consistency_pairs = [
        ('over_1_5', 'over_2_5'),
        ('corners_over_8_5', 'corners_over_10_5'),
        ('cards_over_3_5', 'cards_over_4_5'),
    ]
    for lower_target, higher_target in consistency_pairs:
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

    return {
        'predictions': preds,
        'market_predictions': market_predictions,
    }


def _serialize_prediction_bundle(preds: Dict, market_predictions: Dict, actual_result: Optional[str]) -> Dict:
    predictions_data = {}
    for model_name, pred_data in preds.items():
        if model_name == 'consensus':
            continue

        model_pred = pred_data.get('prediction')
        is_correct = None
        if actual_result and model_pred:
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
    if actual_result and cons_pred:
        cons_correct = (cons_pred == actual_result)

    consensus_data = {
        'prediction': cons_pred,
        'agreement': cons.get('agreement'),
        'agreement_pct': cons.get('agreement_pct'),
        'votes': cons.get('votes', {}),
        'avg_probabilities': cons.get('avg_probabilities', {}),
        'correct': cons_correct
    }

    market_data = {}
    for target_name, target_preds in market_predictions.items():
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

    payload = {
        'predictions': predictions_data,
        'consensus': consensus_data,
    }
    if market_data:
        payload['market_predictions'] = market_data
    return payload


def _serialize_result_prediction_data(result: Dict, actual_result: Optional[str]) -> Dict:
    default_variant = result.get('default_prediction_variant', DEFAULT_PREDICTION_VARIANT)
    payload = _serialize_prediction_bundle(
        result.get('predictions', {}),
        result.get('market_predictions', {}),
        actual_result,
    )
    payload['default_prediction_variant'] = default_variant

    variants = {}
    for variant_name, variant_data in result.get('prediction_variants', {}).items():
        serialized_variant = _serialize_prediction_bundle(
            variant_data.get('predictions', {}),
            variant_data.get('market_predictions', {}),
            actual_result,
        )
        serialized_variant['odds_used'] = bool(variant_data.get('odds_used'))
        if variant_data.get('source_odds'):
            serialized_variant['source_odds'] = dict(variant_data['source_odds'])
        if variant_data.get('missing_odds_by_target'):
            serialized_variant['missing_odds_by_target'] = {
                target_name: list(missing_cols)
                for target_name, missing_cols in variant_data['missing_odds_by_target'].items()
            }
        if variant_data.get('skipped_targets'):
            serialized_variant['skipped_targets'] = list(variant_data['skipped_targets'])
        variants[variant_name] = serialized_variant

    if variants:
        payload['prediction_variants'] = variants

    return payload


def _mark_match_prediction_correctness(match_entry: Dict, actual_result: str):
    for pred_data in match_entry.get('predictions', {}).values():
        if isinstance(pred_data, dict) and pred_data.get('prediction'):
            pred_data['correct'] = (pred_data['prediction'] == actual_result)

    consensus = match_entry.get('consensus', {})
    if consensus.get('prediction'):
        consensus['correct'] = (consensus['prediction'] == actual_result)

    for variant_data in match_entry.get('prediction_variants', {}).values():
        for pred_data in variant_data.get('predictions', {}).values():
            if isinstance(pred_data, dict) and pred_data.get('prediction'):
                pred_data['correct'] = (pred_data['prediction'] == actual_result)
        variant_consensus = variant_data.get('consensus', {})
        if variant_consensus.get('prediction'):
            variant_consensus['correct'] = (variant_consensus['prediction'] == actual_result)


def _source_match_has_base_odds(match: Dict) -> bool:
    return all(_is_positive_odds(match.get(ok)) for ok in BASE_ODDS_KEYS)


def _source_match_odds_snapshot(match: Dict) -> Dict[str, float]:
    return {
        ok: float(match[ok])
        for ok in ODDS_KEYS
        if _is_positive_odds(match.get(ok))
    }


def _source_match_odds_availability(match: Dict) -> Dict:
    missing_base_odds = [
        ok for ok in BASE_ODDS_KEYS
        if not _is_positive_odds(match.get(ok))
    ]
    availability = {
        'has_base_odds': len(missing_base_odds) == 0,
        'missing_base_odds': missing_base_odds,
    }
    source_odds = _source_match_odds_snapshot(match)
    if source_odds:
        availability['source_odds'] = source_odds
    return availability


def _predict_variant_for_matches(matches: List[Dict], variant_name: str, predictor) -> Dict[str, Dict]:
    variant_uses_odds = MODEL_VARIANT_CONFIG.get(variant_name, {}).get('odds_used', False)
    historical_cache = {}
    lineups_cache = {}
    team_history_cache = {}
    club_stats_index = None
    variant_by_key = {}

    has_intl = any(m.get('comp_type') in ('european', 'international') for m in matches)
    if has_intl:
        from regenerate_all_features import load_all_league_player_stats, load_lineups
        print("Loading club player stats for squad features...")
        club_stats_index = load_all_league_player_stats(str(DATA_DIR))
        print(f"Loaded stats for {len(club_stats_index)} players")

    total = len(matches)
    for i, match in enumerate(matches, 1):
        safe_print(f"[{i}/{total}] Refreshing {variant_name}: {match.get('home', '?')} vs {match.get('away', '?')}...")

        comp_type = match.get('comp_type', 'league')
        cache_key = f"{comp_type}/{match['country']}/{match['league']}"
        if cache_key not in historical_cache:
            historical_cache[cache_key] = load_historical_matches(
                comp_type, match['country'], match['league']
            )

        match_lineups = None
        if comp_type in ('european', 'international') and club_stats_index:
            if cache_key not in lineups_cache:
                from regenerate_all_features import load_lineups
                from sofascore.config import get_competition_path
                comp_path = get_competition_path(comp_type, match['country'], match['league'])
                lineups_cache[cache_key] = load_lineups(comp_path)
            match_lineups = lineups_cache[cache_key]

        if _should_compute_fresh_features(match):
            team_history = _team_history_for_match(
                match,
                historical_cache[cache_key],
                team_history_cache,
            )
            feature_history = _history_for_feature_generation(
                match,
                historical_cache[cache_key],
                team_history,
            )
            features = compute_features_for_upcoming(
                match,
                historical_cache[cache_key],
                lineups=match_lineups,
                club_stats_index=club_stats_index,
                team_history_matches=feature_history)
        else:
            features = _features_with_source_odds(match['features'], match)

        if features is None:
            print("[SKIP] No features")
            continue

        all_target_preds = {}
        missing_odds_by_target = {}
        skipped_targets = []

        for target_name in predictor.models.keys():
            if variant_uses_odds:
                missing_odds = _get_missing_odds_features(features, predictor, target_name)
                if missing_odds:
                    missing_odds_by_target[target_name] = missing_odds
                    skipped_targets.append(target_name)
                    continue

            feat_cols = predictor.feature_columns_by_target.get(target_name, predictor.feature_columns)
            target_features = {col: features.get(col, 0) for col in feat_cols}
            target_features['home_team'] = features.get('home_team', match.get('home', ''))
            target_features['away_team'] = features.get('away_team', match.get('away', ''))
            target_features['date'] = features.get('date', match.get('date', ''))

            try:
                all_target_preds[target_name] = predictor.predict_match_all_models(target_features, target_name)
            except Exception as exc:
                skipped_targets.append(target_name)
                safe_print(f"[WARN] {variant_name}/{target_name} prediction failed: {exc}")

        if 'result' not in all_target_preds:
            print("[SKIP] Result prediction unavailable")
            continue

        variant_payload = _split_target_predictions(all_target_preds)
        variant_payload['odds_used'] = variant_uses_odds
        if missing_odds_by_target:
            variant_payload['missing_odds_by_target'] = missing_odds_by_target
        if skipped_targets:
            variant_payload['skipped_targets'] = skipped_targets

        for key in _source_match_keys(match):
            variant_by_key.setdefault(key, variant_payload)

    return variant_by_key


def refresh_report_odds_variants(
    report: Dict,
    source_matches: List[Dict],
    predictor,
    refresh_existing: bool = False,
) -> int:
    variant_name = 'with_odds'
    source_by_key = {}
    for source_match in source_matches:
        for key in _source_match_keys(source_match):
            source_by_key.setdefault(key, source_match)

    pending = []
    for match_entry in report.get('matches', []):
        variants = match_entry.get('prediction_variants') or {}
        source_match = _find_by_keys(source_by_key, _report_match_keys(match_entry))
        if not source_match or not _source_match_has_base_odds(source_match):
            continue

        source_odds = _source_match_odds_snapshot(source_match)
        existing_variant = variants.get(variant_name)
        if existing_variant:
            if not refresh_existing:
                continue
            if existing_variant.get('source_odds') == source_odds:
                continue

        pending.append((match_entry, source_match))

    if not pending:
        print("No with-odds variants to refresh.")
        return 0

    print(f"Refreshing with-odds variants for {len(pending)} matches...")
    variant_by_key = _predict_variant_for_matches(
        [source_match for _match_entry, source_match in pending],
        variant_name,
        predictor,
    )

    updated = 0
    for match_entry, source_match in pending:
        variant_payload = _find_by_keys(variant_by_key, _source_match_keys(source_match))
        if not variant_payload:
            continue

        serialized_variant = _serialize_prediction_bundle(
            variant_payload.get('predictions', {}),
            variant_payload.get('market_predictions', {}),
            match_entry.get('actual_result'),
        )
        serialized_variant['odds_used'] = bool(variant_payload.get('odds_used'))
        serialized_variant['source_odds'] = _source_match_odds_snapshot(source_match)
        if variant_payload.get('missing_odds_by_target'):
            serialized_variant['missing_odds_by_target'] = {
                target_name: list(missing_cols)
                for target_name, missing_cols in variant_payload['missing_odds_by_target'].items()
            }
        if variant_payload.get('skipped_targets'):
            serialized_variant['skipped_targets'] = list(variant_payload['skipped_targets'])

        match_entry.setdefault('prediction_variants', {})[variant_name] = serialized_variant
        updated += 1

    if updated:
        report['updated_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    print(f"Refreshed with-odds variants: {updated}/{len(pending)}")
    return updated


def refresh_existing_report_odds(target_date: str, refresh_existing: bool = False) -> int:
    existing_report = load_existing_report(target_date)
    if not existing_report:
        print(f"No existing report for {target_date}.")
        return 0

    source_matches = find_matches_for_date(target_date)
    if not source_matches:
        print(f"No match data found for {target_date}.")
        return 0

    predictors = load_models(['with_odds'])
    predictor = predictors.get('with_odds')
    if not predictor:
        print("No with-odds predictor available.")
        return 0

    updated = refresh_report_odds_variants(
        existing_report,
        source_matches,
        predictor,
        refresh_existing=refresh_existing,
    )
    if updated:
        report_path = save_report(existing_report, target_date)
        print(f"Report updated with odds variants: {report_path}")
    return updated


def _report_has_refreshable_odds_variants(
    report: Dict,
    source_matches: List[Dict],
    refresh_existing: bool = False,
) -> bool:
    source_by_key = {}
    for source_match in source_matches:
        for key in _source_match_keys(source_match):
            source_by_key.setdefault(key, source_match)

    for match_entry in report.get('matches', []):
        source_match = _find_by_keys(source_by_key, _report_match_keys(match_entry))
        if not source_match or not _source_match_has_base_odds(source_match):
            continue

        existing_variant = (match_entry.get('prediction_variants') or {}).get('with_odds')
        if not existing_variant:
            return True

        if refresh_existing and existing_variant.get('source_odds') != _source_match_odds_snapshot(source_match):
            return True

    return False


def refresh_loaded_report_odds_variants(
    report: Dict,
    source_matches: List[Dict],
    refresh_existing: bool = False,
) -> int:
    if not _report_has_refreshable_odds_variants(report, source_matches, refresh_existing=refresh_existing):
        return 0

    predictors = load_models(['with_odds'])
    predictor = predictors.get('with_odds')
    if not predictor:
        print("No with-odds predictor available.")
        return 0

    return refresh_report_odds_variants(
        report,
        source_matches,
        predictor,
        refresh_existing=refresh_existing,
    )


def predict_matches(matches: list, predictors: Dict[str, object]) -> list:
    results = []
    total = len(matches)

    historical_cache = {}
    lineups_cache = {}
    team_history_cache = {}
    club_stats_index = None

    has_intl = any(m.get('comp_type') in ('european', 'international') for m in matches)
    if has_intl:
        from regenerate_all_features import load_all_league_player_stats, load_lineups
        print("  Loading club player stats for squad features...")
        club_stats_index = load_all_league_player_stats(str(DATA_DIR))
        print(f"  Loaded stats for {len(club_stats_index)} players")

    for i, match in enumerate(matches, 1):
        safe_print(f"  [{i}/{total}] {match.get('home', '?')} vs {match.get('away', '?')}...")

        comp_type = match.get('comp_type', 'league')
        cache_key = f"{comp_type}/{match['country']}/{match['league']}"
        if cache_key not in historical_cache:
            historical_cache[cache_key] = load_historical_matches(
                comp_type, match['country'], match['league']
            )

        match_lineups = None
        if comp_type in ('european', 'international') and club_stats_index:
            if cache_key not in lineups_cache:
                from regenerate_all_features import load_lineups
                from sofascore.config import get_competition_path
                comp_path = get_competition_path(comp_type, match['country'], match['league'])
                lineups_cache[cache_key] = load_lineups(comp_path)
            match_lineups = lineups_cache[cache_key]

        team_history = _team_history_for_match(
            match,
            historical_cache[cache_key],
            team_history_cache,
        )
        feature_history = _history_for_feature_generation(
            match,
            historical_cache[cache_key],
            team_history,
        )

        if _should_compute_fresh_features(match):
            features = compute_features_for_upcoming(
                match, historical_cache[cache_key],
                lineups=match_lineups, club_stats_index=club_stats_index,
                team_history_matches=feature_history)
        else:
            features = _features_with_source_odds(match['features'], match)
        
        if features is None:
            print(f"    [SKIP] No features")
            continue
        
        prediction_variants = {}
        for variant_name, predictor in predictors.items():
            variant_uses_odds = MODEL_VARIANT_CONFIG.get(variant_name, {}).get('odds_used', False)
            all_target_preds = {}
            missing_odds_by_target = {}
            skipped_targets = []

            for target_name in predictor.models.keys():
                if variant_uses_odds:
                    missing_odds = _get_missing_odds_features(features, predictor, target_name)
                    if missing_odds:
                        missing_odds_by_target[target_name] = missing_odds
                        skipped_targets.append(target_name)
                        continue

                feat_cols = predictor.feature_columns_by_target.get(target_name, predictor.feature_columns)
                target_features = {col: features.get(col, 0) for col in feat_cols}
                target_features['home_team'] = features.get('home_team', match.get('home', ''))
                target_features['away_team'] = features.get('away_team', match.get('away', ''))
                target_features['date'] = features.get('date', match.get('date', ''))
                try:
                    all_target_preds[target_name] = predictor.predict_match_all_models(target_features, target_name)
                except Exception as exc:
                    skipped_targets.append(target_name)
                    safe_print(f"    [WARN] {variant_name}/{target_name} prediction failed: {exc}")

            if 'result' not in all_target_preds:
                continue

            variant_payload = _split_target_predictions(all_target_preds)
            variant_payload['odds_used'] = variant_uses_odds
            if variant_uses_odds:
                variant_payload['source_odds'] = _source_match_odds_snapshot(match)
            if missing_odds_by_target:
                variant_payload['missing_odds_by_target'] = missing_odds_by_target
            if skipped_targets:
                variant_payload['skipped_targets'] = skipped_targets
            prediction_variants[variant_name] = variant_payload

        if not prediction_variants:
            print("    [SKIP] No prediction variants available")
            continue

        default_variant = DEFAULT_PREDICTION_VARIANT if DEFAULT_PREDICTION_VARIANT in prediction_variants else next(iter(prediction_variants))
        default_payload = prediction_variants[default_variant]

        hist = feature_history
        match_analysis = compute_match_analysis(match, hist)

        results.append({
            'match': match,
            'default_prediction_variant': default_variant,
            'prediction_variants': prediction_variants,
            'predictions': default_payload['predictions'],
            'market_predictions': default_payload['market_predictions'],
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
    target_date = validate_target_date(target_date)
    d = REPORTS_DIR / target_date
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_report_path(target_date: str, status: str = None) -> Path:
    target_date = validate_target_date(target_date)
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
    target_date = validate_target_date(target_date)
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


def _actual_fields_from_match(m: Dict) -> Dict:
    actual_result = map_result_to_label(m['result']) if m.get('result') else None
    return {
        'actual_result': actual_result,
        'actual_score': m.get('score'),
        'actual_penalty_score': m.get('penalty_score'),
        'decided_by_penalties': bool(m.get('decided_by_penalties')),
    }


def _apply_actual_fields_to_report_match(match_entry: Dict, m: Dict) -> Optional[str]:
    fields = _actual_fields_from_match(m)

    if fields.get('actual_score') is not None:
        match_entry['actual_score'] = fields['actual_score']
    if fields.get('actual_penalty_score') is not None or match_entry.get('actual_penalty_score') is not None:
        match_entry['actual_penalty_score'] = fields.get('actual_penalty_score')
    match_entry['decided_by_penalties'] = fields.get('decided_by_penalties', False)

    actual_result = fields.get('actual_result')
    if actual_result:
        match_entry['actual_result'] = actual_result
        return actual_result
    return None


def _legacy_match_id(m: Dict) -> str:
    comp_type = m.get('comp_type', 'league')
    return f"{comp_type}_{m['country']}_{m['league']}_{m['home']}_vs_{m['away']}".replace(' ', '_')


def _report_match_id(m: Dict) -> str:
    event_id = m.get('event_id')
    return str(event_id) if event_id is not None else _legacy_match_id(m)


def _name_match_key(home: str, away: str) -> str:
    return f"{home}_vs_{away}".replace(' ', '_').lower()


def _event_match_key(event_id) -> Optional[str]:
    if event_id is None or event_id == '':
        return None
    return f"event:{event_id}"


def _source_match_keys(m: Dict) -> List[str]:
    keys = []
    event_key = _event_match_key(m.get('event_id'))
    if event_key:
        keys.append(event_key)
    keys.append(_name_match_key(m['home'], m['away']))
    return keys


def _report_match_keys(m: Dict) -> List[str]:
    keys = []
    event_key = _event_match_key(m.get('event_id'))
    if event_key:
        keys.append(event_key)
    keys.append(_name_match_key(m['home_team'], m['away_team']))
    return keys


def _find_by_keys(index: Dict[str, Dict], keys: List[str]) -> Optional[Dict]:
    for key in keys:
        if key in index:
            return index[key]
    return None


def _drop_stale_rescheduled_report_entries(report: Dict, target_date: str) -> int:
    canonical_events = _build_canonical_raw_event_index(DATA_DIR)
    kept = []
    removed = 0

    for match in report.get('matches', []):
        if match.get('status') == 'finished':
            kept.append(match)
            continue

        key = _source_event_key(match.get('event_id'))
        canonical = canonical_events.get(key) if key else None
        canonical_date = (canonical.get('date') or '')[:10] if canonical else ''
        if canonical_date and canonical_date != target_date:
            removed += 1
            safe_print(
                f"[DEDUP] Removed stale {match.get('home_team')} vs {match.get('away_team')} "
                f"from {target_date}; canonical event date is {canonical_date}."
            )
            continue

        kept.append(match)

    if removed:
        report['matches'] = kept
    return removed


def _report_match_included_in_daily(match: Dict) -> bool:
    league_path = match.get('league') or ''
    if '/' not in league_path:
        return True
    country, comp_name = league_path.split('/', 1)
    return _include_competition_path_in_daily(
        match.get('comp_type', 'league'),
        country,
        comp_name,
    )


def _drop_excluded_daily_report_entries(report: Dict) -> int:
    kept = []
    removed = 0

    for match in report.get('matches', []):
        if _report_match_included_in_daily(match):
            kept.append(match)
            continue

        removed += 1
        safe_print(
            f"[FILTER] Removed {match.get('home_team')} vs {match.get('away_team')} "
            f"from disabled daily competition {match.get('league')}."
        )

    if removed:
        report['matches'] = kept
    return removed


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
            pred_data = (m.get('consensus') or preds.get('consensus', {})) if model == 'consensus' else preds.get(model)
            if not pred_data:
                continue
            
            pred = pred_data.get('prediction')
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


def _refresh_report_summary_counts(report: Dict):
    matches = report.get('matches', [])
    total = len(matches)
    finished = sum(1 for m in matches if m.get('status') == 'finished')
    postponed = sum(1 for m in matches if m.get('status') == 'postponed')
    inprogress = sum(1 for m in matches if m.get('status') == 'inprogress')
    unknown = sum(1 for m in matches if m.get('status') == 'unknown')
    pending = total - finished - postponed - unknown

    summary = report.setdefault('summary', {})
    summary['total_matches'] = total
    summary['finished_matches'] = finished
    summary['postponed_matches'] = postponed
    summary['inprogress_matches'] = inprogress
    summary['unknown_matches'] = unknown
    summary['pending_matches'] = pending
    summary['model_accuracy'] = calculate_model_accuracy(matches)
    report['status'] = 'finished' if pending == 0 and inprogress == 0 and total > 0 else 'unfinished'


def create_report_from_results(results: List[Dict], target_date: str) -> Dict:
    matches = []
    
    for r in results:
        m = r['match']
        
        comp_type = m.get('comp_type', 'league')
        match_id = _report_match_id(m)
        
        actual_fields = _actual_fields_from_match(m)
        actual_result = actual_fields['actual_result']
        is_finished = actual_result is not None
        
        if is_finished:
            match_status = 'finished'
        elif m.get('status') in ['postponed', 'inprogress']:
            match_status = m.get('status')
        else:
            match_status = 'upcoming'

        match_entry = {
            'id': match_id,
            'event_id': m.get('event_id'),
            'league': f"{m['country']}/{m['league']}",
            'comp_type': comp_type,
            'home_team': m['home'],
            'away_team': m['away'],
            'start_time': m.get('start_time', ''),
            'status': match_status,
            'actual_cards': m.get('total_cards'),
            'actual_corners': m.get('total_corners'),
            'referee_name': m.get('referee_name'),
            'odds_availability': _source_match_odds_availability(m),
        }
        match_entry.update(actual_fields)
        match_entry.update(_serialize_result_prediction_data(r, actual_result))

        matches.append(match_entry)

    tmp_report = {'matches': matches}
    _drop_excluded_daily_report_entries(tmp_report)
    _drop_stale_rescheduled_report_entries(tmp_report, target_date)
    matches = tmp_report['matches']

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
    new_by_key = {}
    for r in new_results:
        m = r['match']
        for key in _source_match_keys(m):
            new_by_key.setdefault(key, r)
    
    existing_by_key = {}
    for match in report['matches']:
        for key in _report_match_keys(match):
            existing_by_key.setdefault(key, match)
    
    updated_new_keys = set()
    for match in report['matches']:
        r = _find_by_keys(new_by_key, _report_match_keys(match))
        if not r:
            continue
        m = r['match']
        updated_new_keys.update(_source_match_keys(m))

        if m.get('event_id') and not match.get('event_id'):
            match['event_id'] = m.get('event_id')
        
        if m.get('total_cards') is not None:
            match['actual_cards'] = m['total_cards']
        if m.get('total_corners') is not None:
            match['actual_corners'] = m['total_corners']
        if m.get('referee_name'):
            match['referee_name'] = m['referee_name']
        match['odds_availability'] = _source_match_odds_availability(m)

        new_status = m.get('status', 'upcoming')

        actual_result = _apply_actual_fields_to_report_match(match, m)
        if actual_result:
            match['status'] = 'finished'
            if m.get('total_cards') is not None:
                match['actual_cards'] = m['total_cards']
            if m.get('total_corners') is not None:
                match['actual_corners'] = m['total_corners']
            _mark_match_prediction_correctness(match, actual_result)
        elif new_status in ['postponed', 'inprogress'] and match['status'] == 'upcoming':
            match['status'] = new_status

        serialized_predictions = _serialize_result_prediction_data(r, match.get('actual_result'))
        match['predictions'] = serialized_predictions['predictions']
        match['consensus'] = serialized_predictions['consensus']
        match['default_prediction_variant'] = serialized_predictions.get('default_prediction_variant', DEFAULT_PREDICTION_VARIANT)
        if 'market_predictions' in serialized_predictions:
            match['market_predictions'] = serialized_predictions['market_predictions']
        elif 'market_predictions' in match:
            del match['market_predictions']
        if 'prediction_variants' in serialized_predictions:
            match['prediction_variants'] = serialized_predictions['prediction_variants']
        elif 'prediction_variants' in match:
            del match['prediction_variants']

    for r in new_results:
        m = r['match']
        keys = _source_match_keys(m)
        if any(key in updated_new_keys for key in keys):
            continue
        if _find_by_keys(existing_by_key, keys):
            continue
        
        actual_fields = _actual_fields_from_match(m)
        actual_result = actual_fields['actual_result']
        is_finished = actual_result is not None
        comp_type = m.get('comp_type', 'league')
        match_id = _report_match_id(m)
        
        new_entry = {
            'id': match_id,
            'event_id': m.get('event_id'),
            'league': f"{m['country']}/{m['league']}",
            'comp_type': comp_type,
            'home_team': m['home'],
            'away_team': m['away'],
            'status': m.get('status', 'finished' if is_finished else 'upcoming'),
            'actual_cards': m.get('total_cards'),
            'actual_corners': m.get('total_corners'),
            'referee_name': m.get('referee_name'),
            'odds_availability': _source_match_odds_availability(m),
        }
        new_entry.update(actual_fields)
        new_entry.update(_serialize_result_prediction_data(r, actual_result))
        report['matches'].append(new_entry)
    report_date = report.get('date', '')
    _drop_excluded_daily_report_entries(report)
    if report_date:
        _drop_stale_rescheduled_report_entries(report, report_date)

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


def _atomic_write_json(path: Path, data: Dict):
    """Write JSON through a temporary file and atomically replace the target."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(
        f".{path.name}.tmp-{os.getpid()}-{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
    )

    try:
        with open(tmp_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        for attempt in range(10):
            try:
                os.replace(tmp_path, path)
                break
            except PermissionError:
                if attempt == 9:
                    raise
                import time
                time.sleep(min(0.1 * (attempt + 1), 1.0))
    finally:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass


def save_report(report: Dict, target_date: str):
    """Save report to file (remove old one if status changed)."""
    target_date = validate_target_date(target_date)
    date_dir = _date_dir(target_date)

    status = report['status']
    new_path = date_dir / f"predictions_{status}.json"

    _atomic_write_json(new_path, report)

    other_status = 'finished' if status == 'unfinished' else 'unfinished'
    for old in [date_dir / f"predictions_{other_status}.json",
                REPORTS_DIR / f"predictions_{target_date}_{other_status}.json"]:
        if old.exists():
            old.unlink()

    return new_path


def save_analysis(analysis_map: Dict, target_date: str):
    target_date = validate_target_date(target_date)
    date_dir = _date_dir(target_date)
    path = date_dir / f"analysis.json"

    data = {
        'date': target_date,
        'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'matches': analysis_map,
    }

    _atomic_write_json(path, data)

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
                        help='Update report with finished match results from API')
    parser.add_argument('--force', action='store_true',
                        help='Force re-scraping (ignore cache)')
    parser.add_argument('--repredict', action='store_true',
                        help='Re-run predictions on existing report (no scraping)')
    parser.add_argument('--refresh-odds', action='store_true',
                        help='Add or refresh with-odds prediction variants on an existing report')
    parser.add_argument('--enrich-team-history-stats', action='store_true',
                        help='Fetch detailed stats for recent national-team history matches')
    parser.add_argument('--team-history-stat-limit', type=int, default=None,
                        help='Max recent team-history matches per team to enrich with detailed stats')
    parser.add_argument('--no-report', action='store_true',
                        help='Do not save report to file')
    
    args = parser.parse_args()
    global TEAM_HISTORY_ENRICH_STATS, TEAM_HISTORY_ENRICH_LIMIT
    if args.enrich_team_history_stats:
        TEAM_HISTORY_ENRICH_STATS = True
    if args.team_history_stat_limit is not None:
        TEAM_HISTORY_ENRICH_LIMIT = max(1, args.team_history_stat_limit)

    try:
        target_date = validate_target_date(args.date)
    except ValueError as exc:
        print(exc)
        sys.exit(2)
    
    print("="*70)
    print("MATCH PREDICTION SYSTEM")
    print("="*70)
    print(f"Data: {target_date}")
    print()
    if TEAM_HISTORY_ENRICH_STATS:
        print(f"Team history stat enrichment enabled (limit: {TEAM_HISTORY_ENRICH_LIMIT} matches/team)")
        print()
    
    if args.repredict:
        existing_report = load_existing_report(target_date)
        if not existing_report:
            print(f"No existing report for {target_date}.")
            return

        matches = find_matches_for_date(target_date)
        if not matches:
            print(f"No match data found for {target_date}.")
            return

        predictors = load_models()
        print(f"\nRe-predicting {len(matches)} matches...")
        results = predict_matches(matches, predictors)
        if not results:
            print("\nNo predictions were produced; existing report was left unchanged.")
            sys.exit(1)

        results_by_key = {}
        for r in results:
            for key in _source_match_keys(r['match']):
                results_by_key.setdefault(key, r)

        for match_entry in existing_report.get('matches', []):
            r = _find_by_keys(results_by_key, _report_match_keys(match_entry))
            if not r:
                continue
            m = r['match']
            if m.get('event_id') and not match_entry.get('event_id'):
                match_entry['event_id'] = m.get('event_id')
            match_entry['odds_availability'] = _source_match_odds_availability(m)
            serialized_predictions = _serialize_result_prediction_data(r, match_entry.get('actual_result'))
            match_entry['predictions'] = serialized_predictions['predictions']
            match_entry['consensus'] = serialized_predictions['consensus']
            match_entry['default_prediction_variant'] = serialized_predictions.get('default_prediction_variant', DEFAULT_PREDICTION_VARIANT)
            if 'market_predictions' in serialized_predictions:
                match_entry['market_predictions'] = serialized_predictions['market_predictions']
            elif 'market_predictions' in match_entry:
                del match_entry['market_predictions']
            if 'prediction_variants' in serialized_predictions:
                match_entry['prediction_variants'] = serialized_predictions['prediction_variants']
            elif 'prediction_variants' in match_entry:
                del match_entry['prediction_variants']
            if match_entry.get('actual_result'):
                _mark_match_prediction_correctness(match_entry, match_entry['actual_result'])

        _drop_excluded_daily_report_entries(existing_report)
        _refresh_report_summary_counts(existing_report)
        report_path = save_report(existing_report, target_date)
        print(f"Report updated: {report_path}")
        return

    if args.update:
        update_state = update_match_results(target_date)
        if not update_state.get('source_ok'):
            print("\nUpdate did not confirm any saved matches from Sofascore; existing report was left unchanged.")
            sys.exit(1)

        existing_report = load_existing_report(target_date)
        if existing_report:
            matches = find_matches_for_date(target_date)
            matches_by_key = {}
            for m_data in matches:
                for key in _source_match_keys(m_data):
                    matches_by_key.setdefault(key, m_data)
            for match_entry in existing_report.get('matches', []):
                m_data = _find_by_keys(matches_by_key, _report_match_keys(match_entry))
                if not m_data:
                    continue
                if m_data.get('event_id') and not match_entry.get('event_id'):
                    match_entry['event_id'] = m_data.get('event_id')
                match_entry['odds_availability'] = _source_match_odds_availability(m_data)
                if not m_data.get('result'):
                    continue
                actual_result = _apply_actual_fields_to_report_match(match_entry, m_data)
                if not actual_result:
                    continue
                match_entry['status'] = 'finished'
                _mark_match_prediction_correctness(match_entry, actual_result)

            _drop_stale_rescheduled_report_entries(existing_report, target_date)
            _drop_excluded_daily_report_entries(existing_report)
            refresh_loaded_report_odds_variants(
                existing_report,
                matches,
                refresh_existing=args.force,
            )

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
        scrape_ok = scrape_upcoming(target_date, force=args.force)
        if scrape_ok is False:
            print("\nScrape did not complete; existing data and report were left unchanged.")
            sys.exit(1)

        existing_report = load_existing_report(target_date)
        if existing_report:
            refreshed = refresh_existing_report_odds(target_date, refresh_existing=True)
            if refreshed:
                return

    if args.refresh_odds:
        refresh_existing_report_odds(target_date, refresh_existing=args.force)
        return
    
    print("\nSearching for matches in saved data...")
    matches = find_matches_for_date(target_date)
    print(f"Found {len(matches)} matches")
    
    if not matches:
        print("\nNo matches for this day in the data.")
        print("Use --scrape to fetch from API.")
        return
    
    predictors = load_models()
    
    print("\nMaking predictions...")
    results = predict_matches(matches, predictors)
    if not results:
        print("\nNo predictions were produced; report was left unchanged.")
        sys.exit(1)
    
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
