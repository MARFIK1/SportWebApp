from dataclasses import dataclass
import math
from typing import Dict, Iterable, List, Optional, Sequence


DATASET_BUILDER_VERSION = 3
PENDING_STATUSES = frozenset({"upcoming", "notstarted", "postponed", "canceled"})


@dataclass(frozen=True)
class DatasetBuildResult:
    samples: List[Dict]
    finished_samples: int
    pending_samples: int
    duplicates_removed: int
    invalid_scores_removed: int


def match_sort_key(match: Dict):
    return (
        match.get("date") or "",
        match.get("time") or match.get("start_time") or "",
        str(match.get("event_id") or ""),
    )


def is_finished_match(match: Dict) -> bool:
    status = str(match.get("status") or "").lower()
    if status in PENDING_STATUSES:
        return False
    return status == "finished" or match.get("home_score") is not None


def _score_int(value) -> Optional[int]:
    if value in (None, "") or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or not number.is_integer():
        return None
    return int(number)


def _first_score_stat(match: Dict, side: str) -> Optional[int]:
    for key in (f"{side}_shotsongoal", f"{side}_shots_on_goal"):
        value = _score_int(match.get(key))
        if value is not None:
            return value
    return None


def _looks_like_embedded_shootout(match: Dict, home_score: int, away_score: int) -> bool:
    total = home_score + away_score
    if total < 8 or min(home_score, away_score) < 4:
        return False

    home_ht = _score_int(match.get("home_score_ht"))
    away_ht = _score_int(match.get("away_score_ht"))
    if (
        total >= 10
        and home_ht is not None
        and away_ht is not None
        and home_score - home_ht >= 3
        and away_score - away_ht >= 3
    ):
        return True

    if total >= 14:
        return True

    home_shots = _first_score_stat(match, "home")
    away_shots = _first_score_stat(match, "away")
    if home_shots is not None and away_shots is not None:
        return home_score > home_shots + 1 or away_score > away_shots + 1
    return False


def normalize_match_scores(match: Dict) -> Optional[Dict]:
    if not is_finished_match(match):
        return dict(match)

    home_score = _score_int(match.get("home_score"))
    away_score = _score_int(match.get("away_score"))
    if home_score is None or away_score is None:
        return None

    home_pen = _score_int(match.get("home_score_pen"))
    away_pen = _score_int(match.get("away_score_pen"))
    has_penalty_score = home_pen is not None or away_pen is not None

    if has_penalty_score:
        if home_pen is None or away_pen is None or home_pen == away_pen:
            return None
        if home_score != away_score:
            if home_score < 0 or away_score < 0:
                candidate = (home_score + home_pen, away_score + away_pen)
            else:
                candidate = (home_score - home_pen, away_score - away_pen)
            resolved = (
                candidate
                if min(candidate) >= 0 and candidate[0] == candidate[1]
                else None
            )
            if resolved is None:
                return None
            home_score, away_score = resolved
    elif _looks_like_embedded_shootout(match, home_score, away_score):
        return None

    if home_score < 0 or away_score < 0:
        return None

    normalized = dict(match)
    normalized["home_score"] = home_score
    normalized["away_score"] = away_score
    return normalized


def _normalize_training_matches(matches: Sequence[Dict]) -> tuple[List[Dict], int]:
    normalized = []
    removed = 0
    for match in matches:
        prepared = normalize_match_scores(match)
        if prepared is None:
            removed += 1
            continue
        normalized.append(prepared)
    return normalized, removed


def _record_quality(record: Dict) -> tuple:
    finished = int(is_finished_match(record))
    populated = sum(value not in (None, "") for value in record.values())
    return finished, populated


def _deduplicate_records(records: Iterable[Dict]) -> tuple[List[Dict], int]:
    selected: Dict[str, Dict] = {}
    anonymous: List[Dict] = []
    seen = 0

    for record in records:
        seen += 1
        event_id = record.get("event_id")
        if event_id in (None, ""):
            anonymous.append(record)
            continue
        event_key = str(event_id)
        current = selected.get(event_key)
        if current is None or _record_quality(record) >= _record_quality(current):
            selected[event_key] = record

    deduplicated = list(selected.values()) + anonymous
    deduplicated.sort(key=match_sort_key)
    return deduplicated, seen - len(deduplicated)


def deduplicate_matches(matches: Iterable[Dict]) -> tuple[List[Dict], int]:
    return _deduplicate_records(matches)


def deduplicate_samples(samples: Iterable[Dict]) -> tuple[List[Dict], int]:
    return _deduplicate_records(samples)


def _pending_sample(match: Dict, season: str) -> Dict:
    return {
        "event_id": match.get("event_id"),
        "date": match.get("date"),
        "time": match.get("time", ""),
        "round": match.get("round"),
        "season": season,
        "status": match.get("status"),
        "home_team": match.get("home_team"),
        "home_team_id": match.get("home_team_id"),
        "away_team": match.get("away_team"),
        "away_team_id": match.get("away_team_id"),
    }


def build_season_feature_samples(
    matches: Sequence[Dict],
    generator,
    season: str,
    player_stats: Optional[List[Dict]] = None,
    lineups: Optional[Dict] = None,
    club_stats_index: Optional[Dict] = None,
    history_matches: Optional[Sequence[Dict]] = None,
    elo_matches: Optional[Sequence[Dict]] = None,
    include_pending: bool = True,
) -> DatasetBuildResult:
    season_matches, season_duplicates = deduplicate_matches(matches)
    season_matches, invalid_scores_removed = _normalize_training_matches(season_matches)
    history_source, _ = deduplicate_matches(
        history_matches if history_matches is not None else season_matches
    )
    history_source, _ = _normalize_training_matches(history_source)
    elo_source, _ = deduplicate_matches(
        elo_matches if elo_matches is not None else history_source
    )
    elo_source, _ = _normalize_training_matches(elo_source)
    elo_table = generator._compute_elo_table(elo_source)

    samples: List[Dict] = []
    finished_samples = 0
    pending_samples = 0

    for match in season_matches:
        if not is_finished_match(match):
            if include_pending:
                samples.append(_pending_sample(match, season))
                pending_samples += 1
            continue

        features = generator.generate_match_features(
            match=match,
            all_matches=season_matches,
            player_stats=player_stats,
            elo_table=elo_table,
            lineups=lineups,
            club_stats_index=club_stats_index,
            team_history_matches=history_source,
        )
        features.update({
            "event_id": match.get("event_id"),
            "date": match.get("date"),
            "time": match.get("time", ""),
            "round": match.get("round"),
            "season": season,
            "status": "finished",
            "home_team": match.get("home_team"),
            "home_team_id": match.get("home_team_id"),
            "away_team": match.get("away_team"),
            "away_team_id": match.get("away_team_id"),
        })
        samples.append(features)
        finished_samples += 1

    samples, sample_duplicates = deduplicate_samples(samples)
    return DatasetBuildResult(
        samples=samples,
        finished_samples=finished_samples,
        pending_samples=pending_samples,
        duplicates_removed=season_duplicates + sample_duplicates,
        invalid_scores_removed=invalid_scores_removed,
    )


def _season_name(match: Dict) -> str:
    season = match.get("season")
    if season not in (None, ""):
        return str(season)
    date = str(match.get("date") or "")
    return date[:4] if len(date) >= 4 else "unknown"


def build_competition_feature_samples(
    matches: Sequence[Dict],
    generator,
    player_stats: Optional[List[Dict]] = None,
    lineups: Optional[Dict] = None,
    club_stats_index: Optional[Dict] = None,
    include_pending: bool = True,
) -> DatasetBuildResult:
    competition_matches, duplicates_removed = deduplicate_matches(matches)
    seasons: Dict[str, List[Dict]] = {}
    for match in competition_matches:
        seasons.setdefault(_season_name(match), []).append(match)

    samples: List[Dict] = []
    finished_samples = 0
    pending_samples = 0
    invalid_scores_removed = 0
    for season, season_matches in sorted(
        seasons.items(),
        key=lambda item: min((match_sort_key(match) for match in item[1]), default=("", "", 0)),
    ):
        result = build_season_feature_samples(
            matches=season_matches,
            generator=generator,
            season=season,
            player_stats=player_stats,
            lineups=lineups,
            club_stats_index=club_stats_index,
            history_matches=competition_matches,
            elo_matches=competition_matches,
            include_pending=include_pending,
        )
        samples.extend(result.samples)
        finished_samples += result.finished_samples
        pending_samples += result.pending_samples
        invalid_scores_removed += result.invalid_scores_removed
        duplicates_removed += result.duplicates_removed

    samples, sample_duplicates = deduplicate_samples(samples)
    return DatasetBuildResult(
        samples=samples,
        finished_samples=finished_samples,
        pending_samples=pending_samples,
        duplicates_removed=duplicates_removed + sample_duplicates,
        invalid_scores_removed=invalid_scores_removed,
    )
