import math
from typing import Dict, Optional


OFFICIAL_PLAYER_MARKERS = (
    'playerOfTheMatch',
    'isPlayerOfTheMatch',
    'manOfTheMatch',
    'isManOfTheMatch',
)
OFFICIAL_PLAYER_FIELDS = (
    'playerOfTheMatch',
    'manOfTheMatch',
    'playerOfMatch',
)


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


def _is_true_marker(value) -> bool:
    if value is True or value == 1:
        return True
    return isinstance(value, str) and value.strip().lower() in ('1', 'true', 'yes')


def _has_official_player_marker(entry: Dict) -> bool:
    if not isinstance(entry, dict):
        return False
    statistics = entry.get('statistics')
    containers = (entry, statistics if isinstance(statistics, dict) else {})
    return any(
        _is_true_marker(container.get(key))
        for container in containers
        for key in OFFICIAL_PLAYER_MARKERS
    )


def _official_player_from_entries(side_payload: Dict, team_side: str) -> Optional[Dict]:
    side = side_payload if isinstance(side_payload, dict) else {}
    for entry in side.get('players', []):
        if not _has_official_player_marker(entry):
            continue
        player = normalize_lineup_player(entry)
        if player:
            return {
                **player,
                'team_side': team_side,
                'selection_method': 'official',
            }
    return None


def _official_player_from_reference(payload: Dict, home: Dict, away: Dict) -> Optional[Dict]:
    reference = next(
        (payload.get(key) for key in OFFICIAL_PLAYER_FIELDS if isinstance(payload.get(key), dict)),
        None,
    )
    if not reference:
        return None

    source_player = reference.get('player')
    source_player = source_player if isinstance(source_player, dict) else reference
    reference_id = source_player.get('id')
    reference_name = _text(source_player.get('name')) or _text(source_player.get('shortName'))

    preferred_side = None
    if reference.get('isHome') is True:
        preferred_side = 'home'
    elif reference.get('isHome') is False:
        preferred_side = 'away'

    candidates = (('home', home), ('away', away))
    if preferred_side:
        candidates = tuple(sorted(candidates, key=lambda item: item[0] != preferred_side))

    for team_side, lineup in candidates:
        for player in lineup['starters'] + lineup['substitutes']:
            id_matches = reference_id is not None and player.get('id') == reference_id
            name_matches = reference_name and reference_name in (player.get('name'), player.get('short_name'))
            if id_matches or name_matches:
                return {
                    **player,
                    'team_side': team_side,
                    'selection_method': 'official',
                }
    return None


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
    official_player = (
        _official_player_from_reference(payload, home, away) or
        _official_player_from_entries(payload.get('home'), 'home') or
        _official_player_from_entries(payload.get('away'), 'away')
    )
    if official_player:
        normalized['player_of_the_match'] = official_player
    top_rated = _top_rated_player(home, away)
    if top_rated:
        normalized['top_rated_player'] = top_rated
    return normalized
