from typing import Dict, List, Optional


INCIDENT_TYPE_MAP = {
    "card": "card",
    "goal": "goal",
    "injurytime": "injury_time",
    "penaltyshootout": "shootout",
    "period": "period",
    "substitution": "substitution",
    "vardecision": "var",
}


def _integer(value) -> Optional[int]:
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _text(value) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _player_ref(value) -> Optional[Dict]:
    if not isinstance(value, dict):
        return None

    player = value.get("player") if isinstance(value.get("player"), dict) else value
    name = _text(player.get("name") or player.get("shortName") or player.get("slug"))
    if not name:
        return None

    result = {"name": name}
    player_id = _integer(player.get("id"))
    short_name = _text(player.get("shortName"))
    if player_id is not None:
        result["id"] = player_id
    if short_name and short_name != name:
        result["short_name"] = short_name
    return result


def _normalized_source_type(incident: Dict) -> str:
    source_type = _text(incident.get("incidentType") or incident.get("type")) or "unknown"
    normalized = "".join(character for character in source_type.lower() if character.isalnum())
    return INCIDENT_TYPE_MAP.get(normalized, "unknown")


def _optional_field(target: Dict, key: str, value):
    if value is not None:
        target[key] = value


def normalize_match_incidents(incidents) -> List[Dict]:
    if not isinstance(incidents, list):
        return []

    normalized = []
    for index, incident in enumerate(incidents):
        if not isinstance(incident, dict):
            continue

        source_type = _text(incident.get("incidentType") or incident.get("type")) or "unknown"
        source_class = _text(incident.get("incidentClass") or incident.get("class"))
        minute = _integer(incident.get("time") if incident.get("time") is not None else incident.get("minute"))
        added_time = _integer(
            incident.get("addedTime")
            if incident.get("addedTime") is not None
            else incident.get("added_time")
        )
        raw_is_home = incident.get("isHome")
        is_home = raw_is_home if isinstance(raw_is_home, bool) else None
        event_id = incident.get("id")
        if event_id in (None, ""):
            event_id = f"{source_type}:{minute if minute is not None else 'x'}:{is_home}:{index}"

        event = {
            "id": str(event_id),
            "type": _normalized_source_type(incident),
            "source_type": source_type,
        }
        _optional_field(event, "source_class", source_class)
        _optional_field(event, "minute", minute)
        _optional_field(event, "added_time", added_time)
        _optional_field(event, "period", _text(incident.get("period") or incident.get("incidentPeriod")))
        _optional_field(event, "is_home", is_home)
        _optional_field(event, "player", _player_ref(incident.get("player")))
        _optional_field(event, "assist", _player_ref(incident.get("assist1") or incident.get("assist")))
        _optional_field(event, "player_in", _player_ref(incident.get("playerIn")))
        _optional_field(event, "player_out", _player_ref(incident.get("playerOut")))
        _optional_field(event, "reason", _text(incident.get("reason")))
        _optional_field(event, "text", _text(incident.get("text") or incident.get("description")))
        _optional_field(event, "home_score", _integer(incident.get("homeScore")))
        _optional_field(event, "away_score", _integer(incident.get("awayScore")))
        _optional_field(event, "length", _integer(incident.get("length")))
        event["_source_index"] = index
        normalized.append(event)

    normalized.sort(
        key=lambda event: (
            event.get("minute") if event.get("minute") is not None else 10_000,
            event.get("added_time") or 0,
            event["_source_index"],
        )
    )
    for event in normalized:
        event.pop("_source_index", None)
    return normalized
