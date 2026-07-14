from datetime import datetime, timezone
from typing import Dict, Iterable, Mapping, Tuple

from sofascore.model_acceptance import build_acceptance_report


def _declared_variant(candidate) -> str | None:
    metadata = getattr(candidate, "artifact_metadata", {}) or {}
    training = metadata.get("training", {}) or {}
    promotion = metadata.get("promotion", {}) or {}
    return training.get("variant") or promotion.get("variant")


def _copy_target(baseline, candidate, target: str) -> None:
    baseline.models[target] = candidate.models[target]
    baseline.scalers[target] = candidate.scalers[target]
    baseline.feature_columns_by_target[target] = candidate.feature_columns_by_target[target]
    baseline.feature_sets_by_target[target] = candidate.feature_sets_by_target.get(
        target,
        "unknown",
    )
    baseline.training_stats[target] = candidate.training_stats[target]
    if target in candidate.decision_policies:
        baseline.decision_policies[target] = candidate.decision_policies[target]
    else:
        baseline.decision_policies.pop(target, None)


def merge_accepted_candidates(
    baseline,
    candidates: Iterable[Tuple[str, object]],
    target_tasks: Mapping[str, str],
    variant: str,
) -> tuple[object, Dict]:
    baseline_variant = _declared_variant(baseline)
    if baseline_variant and baseline_variant != variant:
        raise ValueError(
            f"baseline variant mismatch: expected {variant}, got {baseline_variant}"
        )

    baseline_targets = set(baseline.models)
    source_by_target = {target: "baseline" for target in baseline_targets}
    decisions = {}

    for source, candidate in candidates:
        candidate_variant = _declared_variant(candidate)
        if candidate_variant and candidate_variant != variant:
            raise ValueError(
                f"candidate variant mismatch: expected {variant}, got {candidate_variant}"
            )
        acceptance = build_acceptance_report(
            candidate.training_stats,
            target_tasks,
            variant,
        )
        for target, decision in acceptance["targets"].items():
            if target in decisions:
                raise ValueError(f"duplicate candidate target: {target}")
            decision = {**decision, "source": source}
            decisions[target] = decision
            if not decision["accepted"]:
                continue
            if target not in candidate.models:
                raise ValueError(f"accepted target has no saved models: {target}")
            _copy_target(baseline, candidate, target)
            source_by_target[target] = source

    if "result" in baseline.feature_columns_by_target:
        baseline.feature_columns = baseline.feature_columns_by_target["result"]
    if "result" in baseline.scalers:
        baseline.scaler = baseline.scalers["result"]
    baseline.trained = bool(baseline.models)

    accepted_targets = sorted(
        target for target, decision in decisions.items() if decision["accepted"]
    )
    rejected_targets = sorted(
        target for target, decision in decisions.items() if not decision["accepted"]
    )
    fallback_targets = sorted(
        target for target, source in source_by_target.items() if source == "baseline"
    )
    promotion = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "variant": variant,
        "accepted_targets": accepted_targets,
        "rejected_targets": rejected_targets,
        "fallback_targets": fallback_targets,
        "source_by_target": dict(sorted(source_by_target.items())),
        "decisions": dict(sorted(decisions.items())),
    }
    metadata = dict(getattr(baseline, "artifact_metadata", {}) or {})
    metadata["promotion"] = promotion
    baseline.artifact_metadata = metadata
    return baseline, promotion