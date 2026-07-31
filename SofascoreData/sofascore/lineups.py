import math
from typing import Dict, Optional


def _text(value) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _rating(value) -> Optional[float]:
    try:
        normalized = float(value)
    except (TypeError, ValueError):
        return None
    return round(normalized, 2) if math.isfinite(normalized) else None


def normalize_lineup_player(entry: Dict) -> Optional[Dict]:
    if not isinstance(entry, dict):
        return None

    source_player = entry.get('player')
    player = source_player if isinstance(source_player, dict) else {}
    name = _text(player.get('name')) or _text(player.get('shortName'))
    if not name:
        return None

    statistics = entry.get('statistics')
    statistics = statistics if isinstance(statistics, dict) else {}
    normalized = {
        'id': player.get('id'),
        'name': name,
        'short_name': _text(player.get('shortName')),
        'position': _text(entry.get('position')) or _text(player.get('position')),
        'jersey_number': _text(entry.get('jerseyNumber')),
        'captain': bool(entry.get('captain')),
        'rating': _rating(statistics.get('rating')),
    }
    return {key: value for key, value in normalized.items() if value is not None}


def _normalize_side(payload: Dict) -> Dict:
    side = payload if isinstance(payload, dict) else {}
    starters = []
    substitutes = []

    for entry in side.get('players', []):
        player = normalize_lineup_player(entry)
        if not player:
            continue
        target = substitutes if entry.get('substitute') else starters
        target.append(player)

    return {
        'formation': _text(side.get('formation')),
        'starters': starters,
        'substitutes': substitutes,
    }


def _top_rated_player(home: Dict, away: Dict) -> Optional[Dict]:
    candidates = []
    for team_side, lineup in (('home', home), ('away', away)):
        for player in lineup['starters'] + lineup['substitutes']:
            if player.get('rating') is None:
                continue
            candidates.append((player['rating'], bool(player.get('captain')), team_side, player))

    if not candidates:
        return None

    _, _, team_side, player = max(candidates, key=lambda item: (item[0], item[1]))
    return {
        **player,
        'team_side': team_side,
        'selection_method': 'highest_rating',
    }


def normalize_match_lineups(payload) -> Optional[Dict]:
    if not isinstance(payload, dict):
        return None

    home = _normalize_side(payload.get('home'))
    away = _normalize_side(payload.get('away'))
    if not home['starters'] and not away['starters']:
        return None

    normalized = {
        'confirmed': bool(payload.get('confirmed')),
        'home': home,
        'away': away,
    }
    top_rated = _top_rated_player(home, away)
    if top_rated:
        normalized['top_rated_player'] = top_rated
    return normalized
