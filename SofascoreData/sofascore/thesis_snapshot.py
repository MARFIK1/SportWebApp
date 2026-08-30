import hashlib
import json
import platform
import re
import shutil
import subprocess
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from .training_window import parse_iso_date


REPORT_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SNAPSHOT_CONFIG_FILENAME = "snapshot_config.json"
SNAPSHOT_MANIFEST_FILENAME = "snapshot_manifest.json"
SNAPSHOT_CHECKSUMS_FILENAME = "checksums.sha256"


def _read_json(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as source:
        payload = json.load(source)
    if not isinstance(payload, dict):
        raise ValueError(f"JSON root must be an object: {path}")
    return payload


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with open(temporary, "w", encoding="utf-8") as target:
        json.dump(payload, target, ensure_ascii=False, indent=2)
        target.write("\n")
    temporary.replace(path)


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _git_commit(checkout: Path) -> Optional[str]:
    try:
        result = subprocess.run(
            ["git", "-C", str(checkout), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return result.stdout.strip() or None


def _sample_date(value) -> date:
    if isinstance(value, str):
        normalized = value.strip().replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized).date()
        except ValueError:
            pass
    return parse_iso_date(value, "sample date")


def load_snapshot_config(path: Path) -> dict:
    config = _read_json(path)
    required = {
        "schema_version",
        "snapshot_id",
        "analysis_start",
        "analysis_end",
        "data_cutoff",
        "required_dataset_builder_version",
        "required_source_fingerprint_version",
    }
    missing = sorted(required - set(config))
    if missing:
        raise ValueError("snapshot config is missing: " + ", ".join(missing))
    if config["schema_version"] != 1:
        raise ValueError("unsupported snapshot config schema version")

    analysis_start = parse_iso_date(config["analysis_start"], "analysis start")
    analysis_end = parse_iso_date(config["analysis_end"], "analysis end")
    data_cutoff = parse_iso_date(config["data_cutoff"], "data cutoff")
    if analysis_start > analysis_end:
        raise ValueError("analysis start must not be later than analysis end")
    if analysis_end > data_cutoff:
        raise ValueError("analysis end must not be later than data cutoff")

    return {
        **config,
        "analysis_start": analysis_start.isoformat(),
        "analysis_end": analysis_end.isoformat(),
        "data_cutoff": data_cutoff.isoformat(),
    }


def _report_directories(source_root: Path, config: dict) -> list[Path]:
    reports_root = source_root / "reports"
    if not reports_root.exists():
        return []
    analysis_start = parse_iso_date(config["analysis_start"])
    analysis_end = parse_iso_date(config["analysis_end"])
    selected = []
    for candidate in reports_root.iterdir():
        if not candidate.is_dir() or not REPORT_DATE_PATTERN.fullmatch(candidate.name):
            continue
        report_date = parse_iso_date(candidate.name)
        if analysis_start <= report_date <= analysis_end:
            selected.append(candidate)
    return sorted(selected, key=lambda item: item.name)


def _feature_files(source_root: Path) -> list[Path]:
    data_root = source_root / "data"
    if not data_root.exists():
        return []
    return sorted(data_root.rglob("features_all_seasons.json"))


def _filter_feature_payload(
    payload: dict,
    cutoff: date,
    source_path: Path,
) -> tuple[dict, dict]:
    samples = payload.get("samples")
    if not isinstance(samples, list):
        raise ValueError(f"feature dataset has no samples array: {source_path}")

    retained = []
    removed = 0
    dates = []
    for index, sample in enumerate(samples):
        if not isinstance(sample, dict):
            raise ValueError(f"feature sample {index} is not an object: {source_path}")
        try:
            sample_date = _sample_date(sample.get("date"))
        except ValueError as exc:
            raise ValueError(
                f"invalid feature sample date at index {index}: {source_path}"
            ) from exc
        if sample_date <= cutoff:
            retained.append(sample)
            dates.append(sample_date)
        else:
            removed += 1

    metadata = dict(payload.get("metadata") or {})
    metadata.update({
        "total_samples": len(retained),
        "snapshot_data_cutoff": cutoff.isoformat(),
        "snapshot_source_samples": len(samples),
        "snapshot_removed_after_cutoff": removed,
    })
    filtered = {**payload, "metadata": metadata, "samples": retained}
    return filtered, {
        "source_samples": len(samples),
        "samples": len(retained),
        "removed_after_cutoff": removed,
        "date_min": min(dates).isoformat() if dates else None,
        "date_max": max(dates).isoformat() if dates else None,
    }


def audit_snapshot_source(source_root: Path, config: dict) -> dict:
    source_root = source_root.resolve()
    cutoff = parse_iso_date(config["data_cutoff"])
    required_builder = config["required_dataset_builder_version"]
    required_fingerprint = config["required_source_fingerprint_version"]
    reports = _report_directories(source_root, config)
    features = _feature_files(source_root)
    issues = []
    warnings = []
    feature_rows = 0
    retained_rows = 0
    removed_rows = 0
    date_min = None
    date_max = None

    if not reports:
        issues.append("no report directories found in the analysis window")
    if not features:
        issues.append("no features_all_seasons.json datasets found")
    if reports and reports[0].name > config["analysis_start"]:
        warnings.append(
            "first available report date is later than the requested analysis start: "
            f"{reports[0].name} > {config['analysis_start']}"
        )

    for feature_path in features:
        display_path = feature_path.relative_to(source_root)
        try:
            payload = _read_json(feature_path)
            builder_version = (payload.get("metadata") or {}).get(
                "dataset_builder_version"
            )
            if builder_version != required_builder:
                issues.append(
                    f"stale builder version at {display_path}: "
                    f"expected {required_builder}, got {builder_version}"
                )
            fingerprint_version = (payload.get("metadata") or {}).get(
                "source_fingerprint_schema_version"
            )
            if fingerprint_version != required_fingerprint:
                issues.append(
                    f"stale source fingerprint at {display_path}: "
                    f"expected {required_fingerprint}, got {fingerprint_version}"
                )
            if not (payload.get("metadata") or {}).get(
                "source_fingerprint_complete"
            ):
                issues.append(
                    f"incomplete source fingerprint at {display_path}; "
                    "run a full feature regeneration"
                )
            _, stats = _filter_feature_payload(payload, cutoff, display_path)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            issues.append(str(exc))
            continue
        feature_rows += stats["source_samples"]
        retained_rows += stats["samples"]
        removed_rows += stats["removed_after_cutoff"]
        if stats["date_min"]:
            date_min = min(date_min, stats["date_min"]) if date_min else stats["date_min"]
        if stats["date_max"]:
            date_max = max(date_max, stats["date_max"]) if date_max else stats["date_max"]

    return {
        "valid": not issues,
        "issues": issues,
        "warnings": warnings,
        "source_name": source_root.name,
        "snapshot_id": config["snapshot_id"],
        "analysis_window": {
            "start": config["analysis_start"],
            "end": config["analysis_end"],
        },
        "data_cutoff": config["data_cutoff"],
        "report_directories": len(reports),
        "report_date_min": reports[0].name if reports else None,
        "report_date_max": reports[-1].name if reports else None,
        "feature_datasets": len(features),
        "feature_source_rows": feature_rows,
        "feature_rows": retained_rows,
        "feature_rows_removed_after_cutoff": removed_rows,
        "feature_date_min": date_min,
        "feature_date_max": date_max,
    }


def _output_file_records(output_root: Path) -> list[dict]:
    excluded = {SNAPSHOT_MANIFEST_FILENAME, SNAPSHOT_CHECKSUMS_FILENAME}
    records = []
    for path in sorted(item for item in output_root.rglob("*") if item.is_file()):
        relative = path.relative_to(output_root).as_posix()
        if relative in excluded:
            continue
        records.append({
            "path": relative,
            "bytes": path.stat().st_size,
            "sha256": _file_sha256(path),
        })
    return records


def _write_checksums(output_root: Path) -> None:
    checksum_path = output_root / SNAPSHOT_CHECKSUMS_FILENAME
    files = [
        path
        for path in output_root.rglob("*")
        if path.is_file() and path != checksum_path
    ]
    lines = [
        f"{_file_sha256(path)}  {path.relative_to(output_root).as_posix()}"
        for path in sorted(files)
    ]
    checksum_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def create_snapshot(
    source_root: Path,
    output_root: Path,
    config: dict,
    tool_checkout: Optional[Path] = None,
) -> dict:
    source_root = source_root.resolve()
    output_root = output_root.resolve()
    audit = audit_snapshot_source(source_root, config)
    if not audit["valid"]:
        preview = "; ".join(audit["issues"][:5])
        raise ValueError(f"snapshot source audit failed: {preview}")
    if output_root.exists() and any(output_root.iterdir()):
        raise ValueError(f"snapshot output directory is not empty: {output_root}")
    output_root.mkdir(parents=True, exist_ok=True)

    _write_json(output_root / SNAPSHOT_CONFIG_FILENAME, config)

    for report_dir in _report_directories(source_root, config):
        destination = output_root / "reports" / report_dir.name
        shutil.copytree(report_dir, destination)

    cutoff = parse_iso_date(config["data_cutoff"])
    for feature_path in _feature_files(source_root):
        payload = _read_json(feature_path)
        relative = feature_path.relative_to(source_root)
        filtered, _ = _filter_feature_payload(payload, cutoff, relative)
        _write_json(output_root / relative, filtered)

    tool_checkout = (
        tool_checkout.resolve()
        if tool_checkout is not None
        else Path(__file__).resolve().parents[2]
    )
    files = _output_file_records(output_root)
    manifest = {
        "schema_version": 1,
        "snapshot_id": config["snapshot_id"],
        "created_at": datetime.now().astimezone().isoformat(),
        "analysis_window": audit["analysis_window"],
        "data_cutoff": audit["data_cutoff"],
        "source": {
            "name": source_root.name,
            "git_commit": _git_commit(source_root.parent),
        },
        "tool": {
            "git_commit": _git_commit(tool_checkout),
            "python": platform.python_version(),
        },
        "dataset": audit,
        "files": files,
        "file_count": len(files),
        "total_bytes": sum(item["bytes"] for item in files),
    }
    _write_json(output_root / SNAPSHOT_MANIFEST_FILENAME, manifest)
    _write_checksums(output_root)
    return manifest
