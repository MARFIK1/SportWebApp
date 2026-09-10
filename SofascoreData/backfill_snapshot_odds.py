import argparse
import hashlib
import json
import os
import time
from datetime import date, datetime, timezone
from pathlib import Path

from sofascore.scraper import SofascoreSeleniumScraper, create_stealth_driver
from sofascore.utils import extract_odds


TARGET_RAW_ODDS = {
    "result": ("odds_home_win", "odds_draw", "odds_away_win"),
    "btts": ("odds_btts_yes", "odds_btts_no"),
    "over_2_5": ("odds_over_2_5", "odds_under_2_5"),
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

    over_fields = TARGET_RAW_ODDS["over_2_5"]
    if all(_is_positive_number(sample.get(field)) for field in over_fields):
        value = round(1 / float(sample["odds_over_2_5"]), 4)
        if sample.get("odds_over_2_5_prob") != value:
            sample["odds_over_2_5_prob"] = value
            changed.add("odds_over_2_5_prob")

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
            attempts[key] = attempts.get(key, 0) + 1
            cached_odds.setdefault(key, {}).update(
                _positive_odds(record.get("odds") or {})
            )
    return cached_odds, attempts


def _combined_odds(
    existing_odds: dict[str, dict],
    cached_odds: dict[str, dict],
) -> dict[str, dict]:
    combined = {key: dict(value) for key, value in existing_odds.items()}
    for key, odds in cached_odds.items():
        combined.setdefault(key, {}).update(_positive_odds(odds))
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
) -> dict:
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
            if not fields:
                continue
            patched_rows += 1
            file_patched_rows += 1
            patched_events.add(key)
            for field in fields:
                changed_fields[field] = changed_fields.get(field, 0) + 1

        metadata = dict(payload.get("metadata") or {})
        metadata["odds_backfill"] = {
            "schema_version": 1,
            "source": "Sofascore archived pre-match markets",
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
        "schema_version": 1,
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
        default="result,btts",
        help="Comma-separated targets: result,btts,over_2_5",
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
    source_manifest_path = source_data_dir.parent / "snapshot_manifest.json"
    source_snapshot = {}
    source_manifest_sha256 = None
    if source_manifest_path.exists():
        source_snapshot = json.loads(source_manifest_path.read_text(encoding="utf-8"))
        source_manifest_sha256 = _sha256(source_manifest_path)

    request = {
        "schema_version": 1,
        "source_snapshot_id": source_snapshot.get("snapshot_id"),
        "analysis_window": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        },
        "targets": list(targets),
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
        cached_odds, attempts = load_ledger(ledger_path)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"cannot inspect source snapshot: {exc}")
        return 3

    combined = _combined_odds(existing_odds, cached_odds)
    requested_fields = _requested_fields(targets)
    candidates = [
        key
        for key in event_metadata
        if not _has_fields(combined.get(key, {}), requested_fields)
    ]
    pending = [
        key
        for key in candidates
        if attempts.get(key, 0) < args.max_attempts_per_event
    ]
    pending.sort(key=lambda key: (
        event_metadata[key]["date"],
        str(event_metadata[key]["event_id"]),
    ))
    print(
        f"[SCAN] rows={source_rows} events={len(event_metadata)} "
        f"missing={len(candidates)} pending={len(pending)}",
        flush=True,
    )
    _write_json_atomic(status_path, {
        "status": "fetching" if pending else "writing",
        "updated_at": _utc_now(),
        "events": len(event_metadata),
        "missing_before_fetch": len(candidates),
        "pending": len(pending),
        "coverage": _coverage_by_target(event_metadata, combined, targets),
    })

    driver = None
    if pending:
        try:
            os.environ.setdefault("SOFASCORE_CHROME_USER_DATA_DIR", "none")
            driver, _ = create_stealth_driver(headless=not args.headed)
            driver.get("https://www.sofascore.com")
            time.sleep(3)
            scraper = SofascoreSeleniumScraper(driver)
            scraper.max_api_requests = len(pending) + 10
            scraper.api_delay = args.request_delay
            scraper.api_jitter = args.request_jitter

            for index, key in enumerate(pending, start=1):
                metadata = event_metadata[key]
                scraper.last_api_error = None
                markets = scraper.get_match_odds(metadata["event_id"])
                odds = extract_odds(markets) if markets else {}
                record = {
                    **metadata,
                    "fetched_at": _utc_now(),
                    "attempt": attempts.get(key, 0) + 1,
                    "market_count": len(markets or []),
                    "odds": odds,
                    "markets": markets or [],
                    "api_error": scraper.last_api_error,
                }
                _append_jsonl(ledger_path, record)
                attempts[key] = attempts.get(key, 0) + 1
                cached_odds.setdefault(key, {}).update(_positive_odds(odds))
                combined = _combined_odds(existing_odds, cached_odds)
                complete = _has_fields(combined.get(key, {}), requested_fields)
                print(
                    f"[FETCH {index}/{len(pending)}] event={key} "
                    f"date={metadata['date']} markets={len(markets or [])} "
                    f"complete={str(complete).lower()}",
                    flush=True,
                )
                remaining = sum(
                    not _has_fields(combined.get(item, {}), requested_fields)
                    for item in event_metadata
                )
                _write_json_atomic(status_path, {
                    "status": "fetching",
                    "updated_at": _utc_now(),
                    "events": len(event_metadata),
                    "fetched_this_run": index,
                    "pending_this_run": len(pending) - index,
                    "unresolved": remaining,
                    "coverage": _coverage_by_target(
                        event_metadata,
                        combined,
                        targets,
                    ),
                    "last_event": metadata,
                    "api_error": scraper.last_api_error,
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
        combined = _combined_odds(existing_odds, cached_odds)
        _write_json_atomic(status_path, {
            "status": "writing",
            "updated_at": _utc_now(),
            "coverage": _coverage_by_target(event_metadata, combined, targets),
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
        "patch": manifest["patch"],
    })
    print(json.dumps({
        "status": "completed",
        "events": manifest["events"],
        "coverage": manifest["coverage"],
        "patch": manifest["patch"],
    }, ensure_ascii=False, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
