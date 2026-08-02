import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from .utils import load_existing_data, merge_and_sort_matches


def _real_season_name(value):
    if isinstance(value, dict):
        value = value.get("name")
    if value in (None, ""):
        return None

    season = str(value).strip()
    if not season or season.lower().startswith("scheduled "):
        return None
    return season


def _write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def _season_metadata(dm, season_name, existing_metadata, matches):
    metadata = dict(existing_metadata or {})
    metadata.update({
        "competition_type": dm.comp_type,
        "country": dm.country,
        "league": dm.league,
        "season": season_name,
        "total_matches": len(matches),
        "last_update": datetime.now().isoformat(),
    })
    return metadata


def sync_scheduled_matches_to_season_archives(dm):
    raw_dir = Path(dm.paths["raw"])
    upcoming_dir = raw_dir / "upcoming"
    matches_by_season = defaultdict(list)

    if upcoming_dir.exists():
        for scheduled_path in sorted(upcoming_dir.glob("upcoming_scheduled_*.json")):
            data = load_existing_data(str(scheduled_path)) or {}
            for match in data.get("matches", []):
                if not isinstance(match, dict):
                    continue
                season_name = _real_season_name(match.get("season"))
                if not season_name:
                    continue
                archived_match = dict(match)
                archived_match["season"] = season_name
                matches_by_season[season_name].append(archived_match)

    if not matches_by_season:
        return {"seasons": 0, "scheduled_matches": 0, "all_matches": 0}

    scheduled_matches = []
    for season_name, season_matches in sorted(matches_by_season.items()):
        season_path = raw_dir / f"{dm._season_slug(season_name)}.json"
        existing = load_existing_data(str(season_path)) or {}
        merged = merge_and_sort_matches(existing.get("matches", []), season_matches)
        _write_json(season_path, {
            "metadata": _season_metadata(dm, season_name, existing.get("metadata"), merged),
            "matches": merged,
        })
        scheduled_matches.extend(season_matches)

    all_seasons_path = raw_dir / "all_seasons.json"
    all_seasons = load_existing_data(str(all_seasons_path)) or {}
    merged_all = merge_and_sort_matches(all_seasons.get("matches", []), scheduled_matches)
    metadata = dict(all_seasons.get("metadata") or {})
    known_seasons = list(metadata.get("seasons") or [])
    for season_name in sorted(matches_by_season):
        if season_name not in known_seasons:
            known_seasons.append(season_name)
    metadata.update({
        "total_matches": len(merged_all),
        "seasons": known_seasons,
        "last_update": datetime.now().isoformat(),
    })
    _write_json(all_seasons_path, {"metadata": metadata, "matches": merged_all})

    return {
        "seasons": len(matches_by_season),
        "scheduled_matches": len(merge_and_sort_matches([], scheduled_matches)),
        "all_matches": len(merged_all),
    }
