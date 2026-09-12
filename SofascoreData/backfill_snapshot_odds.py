import argparse
import hashlib
import json
import os
import shutil
import time
from datetime import date, datetime, timezone
from pathlib import Path

from sofascore.scraper import SofascoreSeleniumScraper, create_stealth_driver
from sofascore.utils import extract_odds, extract_statistics


TARGET_RAW_ODDS = {
    "result": ("odds_home_win", "odds_draw", "odds_away_win"),
    "btts": ("odds_btts_yes", "odds_btts_no"),
    "over_1_5": ("odds_over_1_5", "odds_under_1_5"),
    "over_2_5": ("odds_over_2_5", "odds_under_2_5"),
    "cards_over_3_5": (
        "odds_cards_over_3_5",
        "odds_cards_under_3_5",
    ),
}
RAW_ODDS_FIELDS = tuple(dict.fromkeys(
    field
    for fields in TARGET_RAW_ODDS.values()
    for field in fields
))


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_date(value: str, label: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"invalid {label}: {value}") from exc


def _sample_date(sample: dict) -> date | None:
    value = str(sample.get("date") or "")[:10]
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _is_positive_number(value) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and value > 0
    )


def _non_negative_integer(value) -> int | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not number.is_integer() or number < 0:
        return None
    return int(number)


def _normalized_card_outcome(payload: dict | None) -> dict:
    if not isinstance(payload, dict):
        return {}
    from sofascore.card_settlement import CARD_PROFILE_FIELD, card_profile
    profile_fields = (
        {CARD_PROFILE_FIELD: card_profile(payload[CARD_PROFILE_FIELD])}
        if CARD_PROFILE_FIELD in payload else {}
    )
    total = _non_negative_integer(payload.get("label_total_cards"))
    if total is not None:
        return {
            **profile_fields,
            "label_total_cards": total,
            "label_cards_over_3_5": int(total > 3),
            "label_cards_over_4_5": int(total > 4),
        }
    result = {}
    for field in ("label_cards_over_3_5", "label_cards_over_4_5"):
        value = _non_negative_integer(payload.get(field))
        if value in (0, 1):
            result[field] = value
    return {**profile_fields, **result} if result else {}


def extract_card_outcome(statistics: list[dict] | None, *, match=None, profile=None) -> dict:
    from sofascore.card_settlement import LEGACY_CARD_PROFILE, card_labels, card_profile, settle_match_cards
    if card_profile(profile) != LEGACY_CARD_PROFILE:
        settlement = settle_match_cards(match or {}, profile)
        return card_labels(settlement) if settlement['status'] == 'complete' else {}
    full_match_statistics = [
        period
        for period in statistics or []
        if isinstance(period, dict) and period.get("period") == "ALL"
    ]
    if not full_match_statistics:
        return {}
    extracted = extract_statistics(full_match_statistics)
    home = next(
        (
            _non_negative_integer(extracted.get(field))
            for field in ("home_yellowcards", "home_yellow_cards")
            if _non_negative_integer(extracted.get(field)) is not None
        ),
        None,
    )
    away = next(
        (
            _non_negative_integer(extracted.get(field))
            for field in ("away_yellowcards", "away_yellow_cards")
            if _non_negative_integer(extracted.get(field)) is not None
        ),
        None,
    )
    if home is None or away is None:
        return {}
    return _normalized_card_outcome({"label_total_cards": home + away})


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_json_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    temporary.replace(path)


def _append_jsonl(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def _requested_fields(targets: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(
        field
        for target in targets
        for field in TARGET_RAW_ODDS[target]
    ))


def _positive_odds(payload: dict) -> dict:
    return {
        field: payload[field]
        for field in RAW_ODDS_FIELDS
        if _is_positive_number(payload.get(field))
    }


def enrich_sample_odds(sample: dict, odds: dict, overwrite: bool = False) -> set[str]:
    changed = set()
    for field, value in _positive_odds(odds).items():
        if overwrite or not _is_positive_number(sample.get(field)):
            if sample.get(field) != value:
                sample[field] = value
                changed.add(field)

    result_fields = TARGET_RAW_ODDS["result"]
    if all(_is_positive_number(sample.get(field)) for field in result_fields):
        home, draw, away = (float(sample[field]) for field in result_fields)
        derived = {
            "odds_home_prob": round(1 / home, 4),
            "odds_draw_prob": round(1 / draw, 4),
            "odds_away_prob": round(1 / away, 4),
            "odds_overround": round(1 / home + 1 / draw + 1 / away, 4),
        }
        for field, value in derived.items():
            if sample.get(field) != value:
                sample[field] = value
                changed.add(field)

    btts_fields = TARGET_RAW_ODDS["btts"]
    if all(_is_positive_number(sample.get(field)) for field in btts_fields):
        value = round(1 / float(sample["odds_btts_yes"]), 4)
        if sample.get("odds_btts_prob") != value:
            sample["odds_btts_prob"] = value
            changed.add("odds_btts_prob")

    binary_markets = (
        ("over_1_5", "odds_over_1_5", "odds_over_1_5_prob"),
        ("over_2_5", "odds_over_2_5", "odds_over_2_5_prob"),
        (
            "cards_over_3_5",
            "odds_cards_over_3_5",
            "odds_cards_over_3_5_prob",
        ),
    )
    for target, positive_field, probability_field in binary_markets:
        raw_fields = TARGET_RAW_ODDS[target]
        if not all(_is_positive_number(sample.get(field)) for field in raw_fields):
            continue
        value = round(1 / float(sample[positive_field]), 4)
        if sample.get(probability_field) != value:
            sample[probability_field] = value
            changed.add(probability_field)

    return changed


def enrich_sample_card_outcome(
    sample: dict,
    outcome: dict,
    overwrite: bool = False,
) -> set[str]:
    from sofascore.card_settlement import CARD_PROFILE_FIELD, card_profile
    normalized = _normalized_card_outcome(outcome)
    if not normalized:
        return set()
    if card_profile(sample.get(CARD_PROFILE_FIELD)) != card_profile(normalized.get(CARD_PROFILE_FIELD)):
        raise ValueError('Cannot backfill card labels across settlement profiles; regenerate features explicitly')
    changed = set()
    for field, value in normalized.items():
        if overwrite or sample.get(field) is None:
            if sample.get(field) != value:
                sample[field] = value
                changed.add(field)
    return changed


def collect_event_odds(
    feature_paths: list[Path],
    start_date: date,
    end_date: date,
) -> tuple[dict[str, dict], dict[str, dict], int]:
    event_metadata: dict[str, dict] = {}
    existing_odds: dict[str, dict] = {}
    rows = 0
    for path in feature_paths:
        payload = json.loads(path.read_text(encoding="utf-8"))
        for sample in payload.get("samples", []):
            sample_date = _sample_date(sample)
            if sample_date is None or not start_date <= sample_date <= end_date:
                continue
            event_id = sample.get("event_id")
            if event_id is None:
                continue
            rows += 1
            key = str(event_id)
            event_metadata.setdefault(key, {
                "event_id": event_id,
                "date": sample_date.isoformat(),
                "home_team": sample.get("home_team"),
                "away_team": sample.get("away_team"),
            })
            existing_odds.setdefault(key, {}).update(_positive_odds(sample))
    return event_metadata, existing_odds, rows


def collect_event_card_outcomes(
    feature_paths: list[Path],
    start_date: date,
    end_date: date,
) -> dict[str, dict]:
    outcomes = {}
    for path in feature_paths:
        payload = json.loads(path.read_text(encoding="utf-8"))
        for sample in payload.get("samples", []):
            sample_date = _sample_date(sample)
            if sample_date is None or not start_date <= sample_date <= end_date:
                continue
            event_id = sample.get("event_id")
            if event_id is None:
                continue
            outcome = _normalized_card_outcome(sample)
            if outcome:
                outcomes.setdefault(str(event_id), {}).update(outcome)
    return outcomes


def load_ledger(path: Path) -> tuple[dict[str, dict], dict[str, int]]:
    cached_odds: dict[str, dict] = {}
    attempts: dict[str, int] = {}
    if not path.exists():
        return cached_odds, attempts
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    f"invalid odds ledger line {line_number}: {path}"
                ) from exc
            key = str(record.get("event_id"))
            odds_requested = record.get("odds_requested")
            if odds_requested is False:
                continue
            attempts[key] = attempts.get(key, 0) + 1
            stored_odds = record.get("odds")
            odds = dict(stored_odds) if isinstance(stored_odds, dict) else {}
            markets = record.get("markets") or []
            if isinstance(markets, list):
                odds.update(extract_odds(markets))
            cached_odds.setdefault(key, {}).update(
                _positive_odds(odds)
            )
    return cached_odds, attempts


def load_card_outcomes(path: Path) -> tuple[dict[str, dict], dict[str, int]]:
    outcomes: dict[str, dict] = {}
    attempts: dict[str, int] = {}
    if not path.exists():
        return outcomes, attempts
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    f"invalid odds ledger line {line_number}: {path}"
                ) from exc
            if record.get("statistics_requested") is not True:
                continue
            key = str(record.get("event_id"))
            attempts[key] = attempts.get(key, 0) + 1
            outcome = _normalized_card_outcome(record.get("card_outcome"))
            statistics = record.get("statistics") or []
            if isinstance(statistics, list):
                outcome.update(extract_card_outcome(statistics))
            if outcome:
                outcomes.setdefault(key, {}).update(outcome)
    return outcomes, attempts


def _combined_odds(
    existing_odds: dict[str, dict],
    cached_odds: dict[str, dict],
) -> dict[str, dict]:
    combined = {key: dict(value) for key, value in existing_odds.items()}
    for key, odds in cached_odds.items():
        combined.setdefault(key, {}).update(_positive_odds(odds))
    return combined


def _combined_card_outcomes(
    existing_outcomes: dict[str, dict],
    cached_outcomes: dict[str, dict],
) -> dict[str, dict]:
    combined = {key: dict(value) for key, value in existing_outcomes.items()}
    for key, outcome in cached_outcomes.items():
        combined.setdefault(key, {}).update(_normalized_card_outcome(outcome))
    return combined


def _has_fields(odds: dict, fields: tuple[str, ...]) -> bool:
    return all(_is_positive_number(odds.get(field)) for field in fields)


def _coverage_by_target(
    event_metadata: dict[str, dict],
    odds_by_event: dict[str, dict],
    targets: tuple[str, ...],
) -> dict[str, dict]:
    total = len(event_metadata)
    result = {}
    for target in targets:
        complete = sum(
            _has_fields(odds_by_event.get(key, {}), TARGET_RAW_ODDS[target])
            for key in event_metadata
        )
        result[target] = {
            "events": total,
            "complete": complete,
            "missing": total - complete,
            "coverage": round(complete / total, 6) if total else 0.0,
        }
    return result


def _card_outcome_coverage(
    event_metadata: dict[str, dict],
    odds_by_event: dict[str, dict],
    outcomes_by_event: dict[str, dict],
) -> dict:
    odds_fields = TARGET_RAW_ODDS["cards_over_3_5"]
    odds_events = {
        key
        for key in event_metadata
        if _has_fields(odds_by_event.get(key, {}), odds_fields)
    }
    labeled_events = {
        key
        for key in event_metadata
        if "label_cards_over_3_5" in outcomes_by_event.get(key, {})
    }
    paired_events = odds_events & labeled_events
    return {
        "events": len(event_metadata),
        "odds_complete": len(odds_events),
        "outcome_complete": len(labeled_events),
        "paired_complete": len(paired_events),
        "missing_outcome_for_odds": len(odds_events - labeled_events),
    }


def write_derived_dataset(
    source_data_dir: Path,
    output_root: Path,
    feature_paths: list[Path],
    event_metadata: dict[str, dict],
    combined_odds: dict[str, dict],
    targets: tuple[str, ...],
    start_date: date,
    end_date: date,
    source_snapshot: dict,
    source_manifest_sha256: str | None,
    ledger_path: Path,
    request_path: Path,
    combined_card_outcomes: dict[str, dict] | None = None,
) -> dict:
    combined_card_outcomes = combined_card_outcomes or {}
    output_data_dir = output_root / "data"
    patched_rows = 0
    patched_events = set()
    changed_fields: dict[str, int] = {}
    output_files = []

    for source_path in feature_paths:
        payload = json.loads(source_path.read_text(encoding="utf-8"))
        file_patched_rows = 0
        for sample in payload.get("samples", []):
            sample_date = _sample_date(sample)
            if sample_date is None or not start_date <= sample_date <= end_date:
                continue
            event_id = sample.get("event_id")
            if event_id is None:
                continue
            key = str(event_id)
            fields = enrich_sample_odds(sample, combined_odds.get(key, {}))
            fields.update(enrich_sample_card_outcome(
                sample,
                combined_card_outcomes.get(key, {}),
            ))
            if not fields:
                continue
            patched_rows += 1
            file_patched_rows += 1
            patched_events.add(key)
            for field in fields:
                changed_fields[field] = changed_fields.get(field, 0) + 1

        metadata = dict(payload.get("metadata") or {})
        metadata["odds_backfill"] = {
            "schema_version": 2,
            "source": "Sofascore archived pre-match markets",
            "card_outcome_source": "Sofascore final match statistics",
            "retrieved_at": _utc_now(),
            "analysis_start": start_date.isoformat(),
            "analysis_end": end_date.isoformat(),
            "targets": list(targets),
            "patched_rows": file_patched_rows,
        }
        payload["metadata"] = metadata

        relative_path = source_path.relative_to(source_data_dir)
        output_path = output_data_dir / relative_path
        _write_json_atomic(output_path, payload)
        output_files.append({
            "path": (Path("data") / relative_path).as_posix(),
            "bytes": output_path.stat().st_size,
            "sha256": _sha256(output_path),
            "patched_rows": file_patched_rows,
        })
        print(f"[WRITE] {relative_path} patched_rows={file_patched_rows}", flush=True)

    requested_fields = _requested_fields(targets)
    unresolved = sorted(
        (
            event_metadata[key]
            for key in event_metadata
            if not _has_fields(combined_odds.get(key, {}), requested_fields)
        ),
        key=lambda item: (item["date"], str(item["event_id"])),
    )
    manifest = {
        "schema_version": 2,
        "created_at": _utc_now(),
        "source_snapshot_id": source_snapshot.get("snapshot_id"),
        "source_snapshot_created_at": source_snapshot.get("created_at"),
        "source_snapshot_manifest_sha256": source_manifest_sha256,
        "analysis_window": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        },
        "targets": list(targets),
        "retrieval": {
            "source": "Sofascore",
            "endpoint": "/api/v1/event/{event_id}/odds/1/all",
            "statistics_endpoint": "/api/v1/event/{event_id}/statistics",
            "method": "Selenium browser session",
            "ledger": ledger_path.name,
        },
        "events": {
            "total": len(event_metadata),
            "fully_resolved": len(event_metadata) - len(unresolved),
            "unresolved": len(unresolved),
            "unresolved_events": unresolved,
        },
        "coverage": _coverage_by_target(
            event_metadata,
            combined_odds,
            targets,
        ),
        "card_outcomes": _card_outcome_coverage(
            event_metadata,
            combined_odds,
            combined_card_outcomes,
        ),
        "patch": {
            "rows": patched_rows,
            "events": len(patched_events),
            "changed_fields": dict(sorted(changed_fields.items())),
        },
        "files": output_files,
    }
    manifest_path = output_root / "derived_snapshot_manifest.json"
    _write_json_atomic(manifest_path, manifest)

    checksum_paths = [
        *(output_root / item["path"] for item in output_files),
        ledger_path,
        request_path,
        manifest_path,
    ]
    checksums = output_root / "checksums.sha256"
    checksum_lines = [
        f"{_sha256(path)}  {path.relative_to(output_root).as_posix()}"
        for path in checksum_paths
        if path.exists()
    ]
    checksums.write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")
    return manifest


def parse_args():
    parser = argparse.ArgumentParser(
        description="Backfill archived odds into a derived feature-only snapshot.",
    )
    parser.add_argument("--source-data-dir", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--start-date", default="2026-04-01")
    parser.add_argument("--end-date", default="2026-07-19")
    parser.add_argument(
        "--targets",
        default="result,btts,over_1_5,over_2_5,cards_over_3_5",
        help=(
            "Comma-separated targets: result,btts,over_1_5,over_2_5,"
            "cards_over_3_5"
        ),
    )
    parser.add_argument(
        "--seed-ledger",
        type=Path,
        help="Optional prior raw odds ledger to replay before fetching missing markets.",
    )
    parser.add_argument("--request-delay", type=float, default=1.5)
    parser.add_argument("--request-jitter", type=float, default=0.4)
    parser.add_argument("--batch-size", type=int, default=25)
    parser.add_argument("--batch-pause", type=float, default=8.0)
    parser.add_argument("--max-attempts-per-event", type=int, default=2)
    parser.add_argument("--headed", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        start_date = _parse_date(args.start_date, "start date")
        end_date = _parse_date(args.end_date, "end date")
    except ValueError as exc:
        print(exc)
        return 2
    if start_date > end_date:
        print("start date must not be later than end date")
        return 2

    targets = tuple(dict.fromkeys(
        target.strip()
        for target in args.targets.split(",")
        if target.strip()
    ))
    unknown_targets = sorted(set(targets) - set(TARGET_RAW_ODDS))
    if not targets or unknown_targets:
        print(f"unsupported targets: {', '.join(unknown_targets) or '(none)'}")
        return 2
    if args.request_delay < 0 or args.request_jitter < 0:
        print("request delay and jitter must be non-negative")
        return 2
    if args.max_attempts_per_event < 1:
        print("max attempts per event must be at least 1")
        return 2

    source_data_dir = args.source_data_dir.resolve()
    output_root = args.output_root.resolve()
    output_data_dir = (output_root / "data").resolve()
    if output_data_dir == source_data_dir or source_data_dir in output_data_dir.parents:
        print("output root must be outside the immutable source data directory")
        return 2
    feature_paths = sorted(source_data_dir.rglob("features_all_seasons.json"))
    if not feature_paths:
        print(f"no feature datasets found under {source_data_dir}")
        return 2

    output_root.mkdir(parents=True, exist_ok=True)
    ledger_path = output_root / "odds_fetch_ledger.jsonl"
    status_path = output_root / "backfill_status.json"
    request_path = output_root / "backfill_request.json"
    seed_ledger = args.seed_ledger.resolve() if args.seed_ledger else None
    if seed_ledger is not None:
        if not seed_ledger.is_file():
            print(f"seed ledger does not exist: {seed_ledger}")
            return 2
        if seed_ledger == ledger_path.resolve():
            print("seed ledger must differ from the output ledger")
            return 2
        if not ledger_path.exists():
            shutil.copyfile(seed_ledger, ledger_path)
    source_manifest_path = source_data_dir.parent / "snapshot_manifest.json"
    source_snapshot = {}
    source_manifest_sha256 = None
    if source_manifest_path.exists():
        source_snapshot = json.loads(source_manifest_path.read_text(encoding="utf-8"))
        source_manifest_sha256 = _sha256(source_manifest_path)

    request = {
        "schema_version": 2,
        "source_snapshot_id": source_snapshot.get("snapshot_id"),
        "analysis_window": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        },
        "targets": list(targets),
    }
    if seed_ledger is not None:
        request["seed_ledger"] = {
            "path": str(seed_ledger),
            "sha256": _sha256(seed_ledger),
        }
    if request_path.exists():
        previous_request = json.loads(request_path.read_text(encoding="utf-8"))
        if previous_request != request:
            print("output root belongs to a different backfill request")
            return 2
    else:
        _write_json_atomic(request_path, request)

    print(f"[SCAN] {len(feature_paths)} feature datasets", flush=True)
    try:
        event_metadata, existing_odds, source_rows = collect_event_odds(
            feature_paths,
            start_date,
            end_date,
        )
        existing_card_outcomes = collect_event_card_outcomes(
            feature_paths,
            start_date,
            end_date,
        )
        cached_odds, odds_attempts = load_ledger(ledger_path)
        cached_card_outcomes, card_attempts = load_card_outcomes(ledger_path)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"cannot inspect source snapshot: {exc}")
        return 3

    combined = _combined_odds(existing_odds, cached_odds)
    combined_card_outcomes = _combined_card_outcomes(
        existing_card_outcomes,
        cached_card_outcomes,
    )
    requested_fields = _requested_fields(targets)
    odds_candidates = [
        key
        for key in event_metadata
        if not _has_fields(combined.get(key, {}), requested_fields)
    ]
    pending_odds = {
        key
        for key in odds_candidates
        if odds_attempts.get(key, 0) < args.max_attempts_per_event
    }
    cards_requested = "cards_over_3_5" in targets
    card_outcome_candidates = {
        key
        for key in event_metadata
        if cards_requested
        and _has_fields(
            combined.get(key, {}),
            TARGET_RAW_ODDS["cards_over_3_5"],
        )
        and "label_cards_over_3_5" not in combined_card_outcomes.get(key, {})
    }
    pending_cards = {
        key
        for key in card_outcome_candidates
        if card_attempts.get(key, 0) < args.max_attempts_per_event
    }
    pending = sorted(pending_odds | pending_cards, key=lambda key: (
        event_metadata[key]["date"],
        str(event_metadata[key]["event_id"]),
    ))
    print(
        f"[SCAN] rows={source_rows} events={len(event_metadata)} "
        f"missing_odds={len(odds_candidates)} "
        f"missing_card_outcomes={len(card_outcome_candidates)} "
        f"pending={len(pending)}",
        flush=True,
    )
    _write_json_atomic(status_path, {
        "status": "fetching" if pending else "writing",
        "updated_at": _utc_now(),
        "events": len(event_metadata),
        "missing_odds_before_fetch": len(odds_candidates),
        "missing_card_outcomes_before_fetch": len(card_outcome_candidates),
        "pending": len(pending),
        "pending_odds": len(pending_odds),
        "pending_card_outcomes": len(pending_cards),
        "coverage": _coverage_by_target(event_metadata, combined, targets),
        "card_outcomes": _card_outcome_coverage(
            event_metadata,
            combined,
            combined_card_outcomes,
        ),
    })

    driver = None
    if pending:
        try:
            os.environ.setdefault("SOFASCORE_CHROME_USER_DATA_DIR", "none")
            driver, _ = create_stealth_driver(headless=not args.headed)
            driver.get("https://www.sofascore.com")
            time.sleep(3)
            scraper = SofascoreSeleniumScraper(driver)
            scraper.max_api_requests = 2 * len(pending) + 10
            scraper.api_delay = args.request_delay
            scraper.api_jitter = args.request_jitter

            for index, key in enumerate(pending, start=1):
                metadata = event_metadata[key]
                fetch_odds = key in pending_odds
                markets = []
                odds = {}
                odds_api_error = None
                if fetch_odds:
                    scraper.last_api_error = None
                    markets = scraper.get_match_odds(metadata["event_id"])
                    odds_api_error = scraper.last_api_error
                    odds = extract_odds(markets) if markets else {}
                    odds_attempts[key] = odds_attempts.get(key, 0) + 1
                    cached_odds.setdefault(key, {}).update(_positive_odds(odds))
                    combined = _combined_odds(existing_odds, cached_odds)

                fetch_card_outcome = (
                    cards_requested
                    and _has_fields(
                        combined.get(key, {}),
                        TARGET_RAW_ODDS["cards_over_3_5"],
                    )
                    and "label_cards_over_3_5"
                    not in combined_card_outcomes.get(key, {})
                    and card_attempts.get(key, 0) < args.max_attempts_per_event
                )
                statistics = []
                card_outcome = {}
                statistics_api_error = None
                if fetch_card_outcome:
                    scraper.last_api_error = None
                    statistics = scraper.get_match_statistics(metadata["event_id"])
                    statistics_api_error = scraper.last_api_error
                    card_outcome = extract_card_outcome(statistics)
                    card_attempts[key] = card_attempts.get(key, 0) + 1
                    if card_outcome:
                        cached_card_outcomes.setdefault(key, {}).update(card_outcome)
                    combined_card_outcomes = _combined_card_outcomes(
                        existing_card_outcomes,
                        cached_card_outcomes,
                    )

                record = {
                    "schema_version": 2,
                    **metadata,
                    "fetched_at": _utc_now(),
                    "odds_requested": fetch_odds,
                    "odds_attempt": odds_attempts.get(key, 0) if fetch_odds else None,
                    "market_count": len(markets or []),
                    "odds": odds,
                    "markets": markets or [],
                    "odds_api_error": odds_api_error,
                    "statistics_requested": fetch_card_outcome,
                    "statistics_attempt": (
                        card_attempts.get(key, 0) if fetch_card_outcome else None
                    ),
                    "statistics_periods": len(statistics or []),
                    "card_outcome": card_outcome,
                    "statistics": statistics or [],
                    "statistics_api_error": statistics_api_error,
                }
                _append_jsonl(ledger_path, record)
                odds_complete = _has_fields(
                    combined.get(key, {}),
                    requested_fields,
                )
                card_pair_complete = (
                    not cards_requested
                    or not _has_fields(
                        combined.get(key, {}),
                        TARGET_RAW_ODDS["cards_over_3_5"],
                    )
                    or "label_cards_over_3_5"
                    in combined_card_outcomes.get(key, {})
                )
                print(
                    f"[FETCH {index}/{len(pending)}] event={key} "
                    f"date={metadata['date']} markets={len(markets or [])} "
                    f"odds_complete={str(odds_complete).lower()} "
                    f"card_pair_complete={str(card_pair_complete).lower()}",
                    flush=True,
                )
                remaining_odds = sum(
                    not _has_fields(combined.get(item, {}), requested_fields)
                    for item in event_metadata
                )
                _write_json_atomic(status_path, {
                    "status": "fetching",
                    "updated_at": _utc_now(),
                    "events": len(event_metadata),
                    "fetched_this_run": index,
                    "pending_this_run": len(pending) - index,
                    "unresolved_odds": remaining_odds,
                    "coverage": _coverage_by_target(
                        event_metadata,
                        combined,
                        targets,
                    ),
                    "card_outcomes": _card_outcome_coverage(
                        event_metadata,
                        combined,
                        combined_card_outcomes,
                    ),
                    "last_event": metadata,
                    "odds_api_error": odds_api_error,
                    "statistics_api_error": statistics_api_error,
                })
                if scraper.api_blocked or scraper.api_budget_exhausted:
                    print(f"[PAUSE] API unavailable: {scraper.last_api_error}", flush=True)
                    return 5
                if (
                    args.batch_size > 0
                    and args.batch_pause > 0
                    and index % args.batch_size == 0
                    and index < len(pending)
                ):
                    print(f"[PAUSE] sleeping {args.batch_pause:.1f}s", flush=True)
                    time.sleep(args.batch_pause)
        except Exception as exc:
            _write_json_atomic(status_path, {
                "status": "fetch_failed",
                "updated_at": _utc_now(),
                "error": f"{type(exc).__name__}: {exc}",
            })
            print(f"odds fetch failed: {type(exc).__name__}: {exc}", flush=True)
            return 5
        finally:
            if driver is not None:
                driver.quit()

    try:
        cached_odds, _ = load_ledger(ledger_path)
        cached_card_outcomes, _ = load_card_outcomes(ledger_path)
        combined = _combined_odds(existing_odds, cached_odds)
        combined_card_outcomes = _combined_card_outcomes(
            existing_card_outcomes,
            cached_card_outcomes,
        )
        _write_json_atomic(status_path, {
            "status": "writing",
            "updated_at": _utc_now(),
            "coverage": _coverage_by_target(event_metadata, combined, targets),
            "card_outcomes": _card_outcome_coverage(
                event_metadata,
                combined,
                combined_card_outcomes,
            ),
        })
        manifest = write_derived_dataset(
            source_data_dir,
            output_root,
            feature_paths,
            event_metadata,
            combined,
            targets,
            start_date,
            end_date,
            source_snapshot,
            source_manifest_sha256,
            ledger_path,
            request_path,
            combined_card_outcomes,
        )
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        _write_json_atomic(status_path, {
            "status": "write_failed",
            "updated_at": _utc_now(),
            "error": f"{type(exc).__name__}: {exc}",
        })
        print(f"cannot write derived snapshot: {exc}")
        return 4

    _write_json_atomic(status_path, {
        "status": "completed",
        "updated_at": _utc_now(),
        "events": manifest["events"],
        "coverage": manifest["coverage"],
        "card_outcomes": manifest["card_outcomes"],
        "patch": manifest["patch"],
    })
    print(json.dumps({
        "status": "completed",
        "events": manifest["events"],
        "coverage": manifest["coverage"],
        "card_outcomes": manifest["card_outcomes"],
        "patch": manifest["patch"],
    }, ensure_ascii=False, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
