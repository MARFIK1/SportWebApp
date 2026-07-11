from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Optional


FLAT_COMPETITION_TYPES = frozenset({"european", "international"})


def competition_features_path(
    data_dir: Path,
    comp_type: str,
    country: str,
    competition: str,
) -> Path:
    if comp_type in FLAT_COMPETITION_TYPES:
        return data_dir / comp_type / competition / "features"
    return data_dir / comp_type / country / competition / "features"


def _configured_country(
    registry: Mapping[str, Mapping[str, Mapping[str, object]]],
    comp_type: str,
    competition: str,
) -> str:
    owners = [
        country
        for country, competitions in registry.get(comp_type, {}).items()
        if competition in competitions
    ]
    if len(owners) == 1:
        return owners[0]
    return comp_type


def discover_feature_competitions(
    data_dir: Path,
    competition_types: Iterable[str],
    registry: Optional[Mapping[str, Mapping[str, Mapping[str, object]]]] = None,
) -> Dict[str, Dict[str, List[str]]]:
    configured = registry or {}
    discovered: Dict[str, Dict[str, List[str]]] = {}

    for comp_type in competition_types:
        comp_dir = data_dir / comp_type
        if not comp_dir.exists():
            continue

        countries: Dict[str, List[str]] = {}
        if comp_type in FLAT_COMPETITION_TYPES:
            for competition_dir in sorted(comp_dir.iterdir(), key=lambda path: path.name):
                if not competition_dir.is_dir():
                    continue
                features_dir = competition_dir / "features"
                if not features_dir.exists() or not any(features_dir.glob("*.json")):
                    continue
                country = _configured_country(configured, comp_type, competition_dir.name)
                countries.setdefault(country, []).append(competition_dir.name)
        else:
            for country_dir in sorted(comp_dir.iterdir(), key=lambda path: path.name):
                if not country_dir.is_dir():
                    continue
                competitions = []
                for competition_dir in sorted(country_dir.iterdir(), key=lambda path: path.name):
                    if not competition_dir.is_dir():
                        continue
                    features_dir = competition_dir / "features"
                    if features_dir.exists() and any(features_dir.glob("*.json")):
                        competitions.append(competition_dir.name)
                if competitions:
                    countries[country_dir.name] = competitions

        if countries:
            discovered[comp_type] = countries

    return discovered
