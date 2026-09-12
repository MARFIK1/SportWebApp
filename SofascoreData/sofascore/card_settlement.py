"""Versioned card targets. Aggregate yellow/red statistics are not interchangeable."""
import math


LEGACY_CARD_PROFILE = 'yellow_only_v1'
PL_CARD_PROFILE = 'pl_total_cards_1_2_3_v1'
CARD_PROFILES = (LEGACY_CARD_PROFILE, PL_CARD_PROFILE)
CARD_PROFILE_FIELD = 'card_settlement_profile'
CARD_TARGETS = frozenset(('total_cards', 'cards_over_3_5', 'cards_over_4_5'))


def card_profile(value=None):
    profile = LEGACY_CARD_PROFILE if value is None else value
    if profile not in CARD_PROFILES:
        raise ValueError(f'Unsupported card settlement profile: {profile!r}')
    return profile


def _count(value):
    if value in (None, '') or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (ValueError, TypeError):
        return None
    if not math.isfinite(number) or not number.is_integer() or number < 0:
        return None
    return int(number)


def _first_count(match, *keys):
    for key in keys:
        if match.get(key) not in (None, ''):
            return _count(match[key])
    return None


def _key(value):
    return ''.join(c for c in str(value or '').lower() if c.isalnum())


def _result(profile, home=None, away=None, reason=None):
    complete = home is not None and away is not None
    return {'profile': profile, 'status': 'complete' if complete else 'unresolved',
            'home': home, 'away': away, 'total': home + away if complete else None,
            'reason': reason}


def _event_time(event):
    minute = _count(event.get('minute'))
    added = _count(event.get('added_time') if event.get('added_time') is not None else 0)
    return (minute, added) if minute is not None and added is not None else None


def _regulation_scope(event):
    if event.get('rescinded') is True or event.get('is_post_match') is True:
        return False
    period = _key(event.get('period'))
    if period in {'3', '4', 'et', 'aet', 'extratime', '1et', '2et', 'shootout', 'penalties', 'postmatch', 'ft'}:
        return False
    time = _event_time(event)
    if time is None:
        return None
    if period in {'1', '2', '1st', '2nd', '1h', '2h', 'firsthalf', 'secondhalf', 'regulation'}:
        return True if time[0] <= 90 else None
    if period:
        return None
    # At the final-whistle boundary an explicit period is required.
    return True if 0 < time[0] < 90 else None


def _on_pitch(event, events, lineups):
    if event.get('is_coach') is True or event.get('is_bench') is True:
        return False
    if isinstance(event.get('on_pitch'), bool):
        return event['on_pitch']
    side = 'home' if event.get('is_home') is True else 'away'
    lineup = lineups.get(side, {}) if isinstance(lineups, dict) else {}
    if not isinstance(lineup, dict):
        return None
    starters, substitutes = lineup.get('starters', []), lineup.get('substitutes', [])
    if not isinstance(starters, list) or not isinstance(substitutes, list):
        return None
    if any(not isinstance(p, dict) for p in starters + substitutes):
        return None
    starter_ids = [str(p['id']) for p in starters if p.get('id') is not None]
    if len(starter_ids) != 11 or len(set(starter_ids)) != 11:
        return None
    player_id = str(event['player']['id'])
    roster = set(starter_ids) | {str(p['id']) for p in substitutes if p.get('id') is not None}
    if player_id not in roster:
        return None
    playing = player_id in starter_ids
    for substitution in events:
        if substitution.get('type') != 'substitution' or substitution.get('is_home') is not event['is_home']:
            continue
        incoming = str((substitution.get('player_in') or {}).get('id')) == player_id
        outgoing = str((substitution.get('player_out') or {}).get('id')) == player_id
        if not (incoming or outgoing):
            continue
        when = _event_time(substitution)
        if when is None or when == _event_time(event):
            return None
        if when < _event_time(event):
            playing = incoming
    return playing


def settle_match_cards(match, profile=PL_CARD_PROFILE):
    """Return unknown, never a fabricated zero, when settlement evidence is missing."""
    profile = card_profile(profile)
    if profile == LEGACY_CARD_PROFILE:
        return _result(profile, *(_first_count(match, f'{side}_yellow_cards_calc', f'{side}_yellowcards')
                                  for side in ('home', 'away')))
    events = match.get('match_events')
    if not isinstance(events, list) or match.get('match_events_collected') is not True:
        return _result(profile, reason='missing_complete_incidents')
    if any(not isinstance(e, dict) for e in events):
        return _result(profile, reason='invalid_incident')
    status = match.get('status')
    if isinstance(status, dict):
        status = status.get('type')
    if status not in ('finished', 'afterextra', 'afterpenalties', 'aet', 'ap'):
        return _result(profile, reason='match_not_finished')
    cards = [e for e in events if e.get('type') == 'card']
    if not cards and any((_count(match.get(f'{side}_{field}')) or 0) > 0
                         for side in ('home', 'away')
                         for field in ('yellowcards', 'redcards', 'yellow_cards_calc', 'red_cards_calc')):
        return _result(profile, reason='empty_incidents_conflict_with_statistics')
    unique, groups = {}, {}
    for event in cards:
        if event.get('is_coach') is True or event.get('is_bench') is True or event.get('on_pitch') is False:
            continue
        scope = _regulation_scope(event)
        if scope is False:
            continue
        if scope is None:
            return _result(profile, reason='unknown_regulation_period')
        player = event.get('player') or {}
        if not isinstance(player, dict) or not isinstance(event.get('is_home'), bool) or player.get('id') in (None, ''):
            return _result(profile, reason='unknown_player_or_team')
        eligible = _on_pitch(event, sorted(events, key=lambda e: _event_time(e) or (10000, 0)), match.get('match_lineups'))
        if eligible is None:
            return _result(profile, reason='unknown_on_pitch_eligibility')
        if not eligible:
            continue
        identity = event.get('id')
        if identity in (None, '') or event.get('id_is_generated') is True:
            return _result(profile, reason='missing_incident_id')
        identity = str(identity)
        if identity in unique:
            if unique[identity] != event:
                return _result(profile, reason='conflicting_duplicate_incident')
            continue
        unique[identity] = event
        kind = _key(event.get('source_class'))
        if kind not in ('yellow', 'red', 'yellowred', 'secondyellow'):
            return _result(profile, reason='unknown_card_class')
        group = (event['is_home'], str(player['id']), _event_time(event))
        groups.setdefault(group, []).append(kind)
    players = {}
    for (home, player, when), kinds in sorted(groups.items(), key=lambda row: row[0][2]):
        previous = players.get((home, player), 0)
        if previous >= 2:
            return _result(profile, reason='card_after_dismissal_or_ambiguous_sequence')
        if any(k in kinds for k in ('yellowred', 'secondyellow')):
            if previous != 1:
                return _result(profile, reason='second_yellow_without_first')
            # Some feeds emit yellow, yellow-red and red for the same dismissal.
            players[(home, player)] = 3
        elif kinds == ['yellow']:
            if previous:
                return _result(profile, reason='second_yellow_without_dismissal_class')
            players[(home, player)] = 1
        elif kinds == ['red']:
            players[(home, player)] = previous + 2
        else:
            return _result(profile, reason='ambiguous_simultaneous_cards')
    return _result(profile, sum(n for (h, _), n in players.items() if h),
                   sum(n for (h, _), n in players.items() if not h))


def card_labels(settlement):
    total = settlement['total']
    return {CARD_PROFILE_FIELD: settlement['profile'],
            'label_total_cards': total,
            'label_cards_over_3_5': int(total > 3) if total is not None else None,
            'label_cards_over_4_5': int(total > 4) if total is not None else None}
