import json
from pathlib import Path
from typing import Dict, Mapping, Optional

from sofascore.data_layout import FLAT_COMPETITION_TYPES, competition_features_path


def read_json_metadata(path: Path, max_bytes: int = 1024 * 1024) -> Dict:
    decoder = json.JSONDecoder()
    buffer = ""

    with open(path, "r", encoding="utf-8-sig") as source:
        while len(buffer.encode("utf-8")) < max_bytes:
            chunk = source.read(65536)
            if not chunk:
                break
            buffer += chunk
            key_index = buffer.find('"metadata"')
            if key_index < 0:
                continue
            colon_index = buffer.find(":", key_index + len('"metadata"'))
            if colon_index < 0:
                continue
            value_start = colon_index + 1
            while value_start < len(buffer) and buffer[value_start].isspace():
                value_start += 1
            try:
                metadata, _ = decoder.raw_decode(buffer, value_start)
            except json.JSONDecodeError:
                continue
            if not isinstance(metadata, dict):
                raise ValueError(f"metadata must be an object: {path}")
            return metadata

    raise ValueError(f"could not read metadata from {path}")


def discover_raw_competitions(
    data_dir: Path,
    competition_types,
    registry: Optional[Mapping] = None,
) -> Dict:
    data_dir = Path(data_dir)
    configured = registry or {}
    discovered = {}

    for comp_type in competition_types:
        comp_dir = data_dir / comp_type
        if not comp_dir.exists():
            continue

        countries = {}
        if comp_type in FLAT_COMPETITION_TYPES:
            for competition_dir in sorted(comp_dir.iterdir(), key=lambda path: path.name):
                if not (competition_dir / "raw").exists():
                    continue
                owners = [
                    country
                    for country, competitions in configured.get(comp_type, {}).items()
                    if competition_dir.name in competitions
                ]
                country = owners[0] if len(owners) == 1 else comp_type
                countries.setdefault(country, []).append(competition_dir.name)
        else:
            for country_dir in sorted(comp_dir.iterdir(), key=lambda path: path.name):
                if not country_dir.is_dir():
                    continue
                competitions = [
                    competition_dir.name
                    for competition_dir in sorted(country_dir.iterdir(), key=lambda path: path.name)
                    if (competition_dir / "raw").exists()
                ]
                if competitions:
                    countries[country_dir.name] = competitions

        if countries:
            discovered[comp_type] = countries

    return discovered


def audit_feature_datasets(
    data_dir: Path,
    expected_builder_version: int,
    competition_types,
    registry: Optional[Mapping] = None,
) -> Dict:
    data_dir = Path(data_dir)
    discovered = discover_raw_competitions(data_dir, competition_types, registry)
    datasets = []
    issues = []

    for comp_type, countries in discovered.items():
        for country, competitions in countries.items():
            for competition in competitions:
                features_dir = competition_features_path(
                    data_dir,
                    comp_type,
                    country,
                    competition,
                )
                combined_path = features_dir / "features_all_seasons.json"
                dataset = {
                    "comp_type": comp_type,
                    "country": country,
                    "competition": competition,
                    "path": str(combined_path),
                    "builder_version": None,
                    "total_samples": None,
                }

                if not combined_path.exists():
                    dataset["status"] = "missing_combined_dataset"
                    issues.append(dict(dataset))
                    datasets.append(dataset)
                    continue

                try:
                    metadata = read_json_metadata(combined_path)
                except (OSError, UnicodeError, ValueError) as exc:
                    dataset["status"] = "invalid_metadata"
                    dataset["error"] = str(exc)
                    issues.append(dict(dataset))
                    datasets.append(dataset)
                    continue

                version = metadata.get("dataset_builder_version")
                dataset["builder_version"] = version
                dataset["total_samples"] = metadata.get("total_samples")
                dataset["source_builder_versions"] = metadata.get("source_builder_versions")
                dataset["status"] = "ok" if version == expected_builder_version else "stale"
                if dataset["status"] != "ok":
                    issues.append(dict(dataset))
                datasets.append(dataset)

    versions = sorted({str(item["builder_version"]) for item in datasets})
    return {
        "valid": bool(datasets) and not issues,
        "expected_builder_version": expected_builder_version,
        "dataset_count": len(datasets),
        "total_samples": sum(
            int(item["total_samples"])
            for item in datasets
            if isinstance(item.get("total_samples"), (int, float))
        ),
        "versions": versions,
        "datasets": datasets,
        "issues": issues,
    }
