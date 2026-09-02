import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


HYPERPARAMETER_PROFILE_SCHEMA_VERSION = 1

ESTIMATOR_PARAMETER_KEYS = {
    "xgboost": {
        "n_estimators",
        "max_depth",
        "learning_rate",
        "subsample",
        "colsample_bytree",
        "min_child_weight",
        "gamma",
    },
    "lightgbm": {
        "n_estimators",
        "max_depth",
        "learning_rate",
        "subsample",
        "colsample_bytree",
        "min_child_samples",
        "reg_alpha",
        "reg_lambda",
    },
}


def _validate_estimator_parameters(
    target: str,
    estimator: str,
    parameters: Any,
) -> dict:
    if not isinstance(parameters, Mapping):
        raise ValueError(
            f"hyperparameters for {target}/{estimator} must be an object"
        )

    unknown = sorted(set(parameters) - ESTIMATOR_PARAMETER_KEYS[estimator])
    if unknown:
        raise ValueError(
            f"unsupported hyperparameters for {target}/{estimator}: "
            f"{', '.join(unknown)}"
        )

    normalized = {}
    for name, value in parameters.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(
                f"hyperparameter {target}/{estimator}/{name} must be numeric"
            )
        normalized[name] = value
    return normalized


def normalize_hyperparameter_targets(targets: Any) -> dict:
    if not isinstance(targets, Mapping) or not targets:
        raise ValueError("hyperparameter profile must contain a non-empty targets object")

    normalized = {}
    for target, target_profile in targets.items():
        if not isinstance(target, str) or not target:
            raise ValueError("hyperparameter target names must be non-empty strings")
        if not isinstance(target_profile, Mapping):
            raise ValueError(f"hyperparameters for {target} must be an object")

        unknown_estimators = sorted(
            set(target_profile) - set(ESTIMATOR_PARAMETER_KEYS)
        )
        if unknown_estimators:
            raise ValueError(
                f"unsupported estimators for {target}: {', '.join(unknown_estimators)}"
            )

        missing_estimators = sorted(
            set(ESTIMATOR_PARAMETER_KEYS) - set(target_profile)
        )
        if missing_estimators:
            raise ValueError(
                f"missing estimators for {target}: {', '.join(missing_estimators)}"
            )

        normalized[target] = {
            estimator: _validate_estimator_parameters(
                target,
                estimator,
                target_profile[estimator],
            )
            for estimator in ESTIMATOR_PARAMETER_KEYS
        }
    return normalized


def load_hyperparameter_profile(path: Path | str) -> dict:
    profile_path = Path(path)
    try:
        payload = json.loads(profile_path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ValueError(f"cannot read hyperparameter profile: {profile_path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid hyperparameter profile JSON: {profile_path}") from exc

    if not isinstance(payload, Mapping):
        raise ValueError("hyperparameter profile must be a JSON object")
    schema_version = payload.get("schema_version")
    if schema_version != HYPERPARAMETER_PROFILE_SCHEMA_VERSION:
        raise ValueError(
            "unsupported hyperparameter profile schema version: "
            f"{schema_version!r}"
        )

    return {
        "schema_version": HYPERPARAMETER_PROFILE_SCHEMA_VERSION,
        "created_at": payload.get("created_at"),
        "source": payload.get("source") if isinstance(payload.get("source"), Mapping) else {},
        "targets": normalize_hyperparameter_targets(payload.get("targets")),
    }


def build_hyperparameter_profile(training_stats: Mapping, source: Mapping) -> dict:
    targets = {}
    for target, stats in training_stats.items():
        if not isinstance(stats, Mapping):
            continue
        parameters = stats.get("hyperparameters")
        if not isinstance(parameters, Mapping):
            continue
        targets[target] = {
            estimator: dict(parameters.get(estimator, {}))
            for estimator in ESTIMATOR_PARAMETER_KEYS
        }

    if not targets:
        raise ValueError("training stats do not contain classification hyperparameters")

    return {
        "schema_version": HYPERPARAMETER_PROFILE_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": dict(source),
        "targets": normalize_hyperparameter_targets(targets),
    }


def write_hyperparameter_profile(profile: Mapping, path: Path | str) -> str:
    profile_path = Path(path)
    normalized = {
        "schema_version": HYPERPARAMETER_PROFILE_SCHEMA_VERSION,
        "created_at": profile.get("created_at"),
        "source": dict(profile.get("source", {})),
        "targets": normalize_hyperparameter_targets(profile.get("targets")),
    }
    profile_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = profile_path.with_name(
        f".{profile_path.name}.{os.getpid()}.tmp"
    )
    try:
        temporary_path.write_text(
            json.dumps(normalized, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary_path, profile_path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise
    return str(profile_path)
