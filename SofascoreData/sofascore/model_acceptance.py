import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Mapping, Optional


DEFAULT_ACCEPTANCE_THRESHOLDS = {
    "classification_min_macro_f1_improvement": 0.02,
    "classification_min_balanced_accuracy_margin_over_chance": 0.0,
    "classification_min_class_recall": 0.05,
    "classification_max_brier_increase": 0.01,
    "regression_min_relative_mae_improvement": 0.01,
}


def _number(value) -> Optional[float]:
    if isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _classification_candidate(stats: Mapping) -> tuple[str, Mapping]:
    policy_metrics = (
        stats.get("decision_policy_test_evaluation", {}) or {}
    ).get("Consensus Policy")
    if isinstance(policy_metrics, Mapping):
        return "Consensus Policy", policy_metrics

    selection = stats.get("selection", {}) or {}
    model_name = selection.get("best_model")
    detailed = stats.get("detailed_metrics", {}) or {}
    model_metrics = detailed.get(model_name)
    if model_name and isinstance(model_metrics, Mapping):
        return str(model_name), model_metrics
    return "unavailable", {}


def evaluate_classification_target(
    target: str,
    stats: Mapping,
    thresholds: Optional[Mapping[str, float]] = None,
) -> Dict:
    limits = {**DEFAULT_ACCEPTANCE_THRESHOLDS, **(thresholds or {})}
    baseline = (stats.get("baseline", {}) or {}).get("metrics", {}) or {}
    candidate_name, candidate = _classification_candidate(stats)
    baseline_macro_f1 = _number(baseline.get("macro_f1"))
    candidate_macro_f1 = _number(candidate.get("macro_f1"))
    balanced_accuracy = _number(candidate.get("balanced_accuracy"))
    baseline_brier = _number(baseline.get("brier_score"))
    candidate_brier = _number(candidate.get("brier_score"))
    recalls = [
        value
        for value in (
            _number(item)
            for item in (candidate.get("per_class_recall", {}) or {}).values()
        )
        if value is not None
    ]
    improvement = (
        candidate_macro_f1 - baseline_macro_f1
        if candidate_macro_f1 is not None and baseline_macro_f1 is not None
        else None
    )
    brier_increase = (
        candidate_brier - baseline_brier
        if candidate_brier is not None and baseline_brier is not None
        else None
    )

    reasons = []
    if improvement is None:
        reasons.append("missing macro-F1 baseline or candidate metric")
    elif improvement < limits["classification_min_macro_f1_improvement"]:
        reasons.append("macro-F1 improvement is below the acceptance threshold")
    chance_balanced_accuracy = 1.0 / len(recalls) if recalls else None
    required_balanced_accuracy = (
        chance_balanced_accuracy
        + limits["classification_min_balanced_accuracy_margin_over_chance"]
        if chance_balanced_accuracy is not None
        else None
    )
    if balanced_accuracy is None:
        reasons.append("missing balanced accuracy")
    elif (
        required_balanced_accuracy is not None
        and balanced_accuracy < required_balanced_accuracy
    ):
        reasons.append("balanced accuracy is below the chance-level threshold")
    if not recalls:
        reasons.append("missing per-class recall")
    elif min(recalls) < limits["classification_min_class_recall"]:
        reasons.append("at least one class recall is below the acceptance threshold")
    if brier_increase is None:
        reasons.append("missing Brier score baseline or candidate metric")
    elif brier_increase > limits["classification_max_brier_increase"]:
        reasons.append("Brier score regressed beyond the acceptance threshold")

    return {
        "target": target,
        "task": "classification",
        "accepted": not reasons,
        "candidate": candidate_name,
        "reasons": reasons,
        "metrics": {
            "baseline_macro_f1": baseline_macro_f1,
            "candidate_macro_f1": candidate_macro_f1,
            "macro_f1_improvement": improvement,
            "balanced_accuracy": balanced_accuracy,
            "required_balanced_accuracy": required_balanced_accuracy,
            "minimum_class_recall": min(recalls) if recalls else None,
            "baseline_brier_score": baseline_brier,
            "candidate_brier_score": candidate_brier,
            "brier_increase": brier_increase,
        },
    }


def evaluate_regression_target(
    target: str,
    stats: Mapping,
    thresholds: Optional[Mapping[str, float]] = None,
) -> Dict:
    limits = {**DEFAULT_ACCEPTANCE_THRESHOLDS, **(thresholds or {})}
    selection = stats.get("selection", {}) or {}
    baseline_mae = _number(selection.get("baseline_score"))
    candidate_mae = _number(selection.get("best_score"))
    relative_improvement = None
    if baseline_mae is not None and candidate_mae is not None and baseline_mae > 0:
        relative_improvement = (baseline_mae - candidate_mae) / baseline_mae

    reasons = []
    if relative_improvement is None:
        reasons.append("missing positive regression baseline or candidate MAE")
    elif relative_improvement < limits["regression_min_relative_mae_improvement"]:
        reasons.append("relative MAE improvement is below the acceptance threshold")

    return {
        "target": target,
        "task": "regression",
        "accepted": not reasons,
        "candidate": selection.get("best_model", "unavailable"),
        "reasons": reasons,
        "metrics": {
            "baseline_mae": baseline_mae,
            "candidate_mae": candidate_mae,
            "relative_mae_improvement": relative_improvement,
        },
    }


def evaluate_target(
    target: str,
    task: str,
    stats: Mapping,
    thresholds: Optional[Mapping[str, float]] = None,
) -> Dict:
    if task == "regression":
        return evaluate_regression_target(target, stats, thresholds)
    return evaluate_classification_target(target, stats, thresholds)


def build_acceptance_report(
    training_stats: Mapping[str, Mapping],
    target_tasks: Mapping[str, str],
    variant: str,
    thresholds: Optional[Mapping[str, float]] = None,
) -> Dict:
    limits = {**DEFAULT_ACCEPTANCE_THRESHOLDS, **(thresholds or {})}
    targets = {
        target: evaluate_target(
            target,
            target_tasks.get(target, "classification"),
            stats,
            limits,
        )
        for target, stats in sorted(training_stats.items())
    }
    accepted = [target for target, result in targets.items() if result["accepted"]]
    rejected = [target for target, result in targets.items() if not result["accepted"]]
    return {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "variant": variant,
        "thresholds": limits,
        "accepted_targets": accepted,
        "rejected_targets": rejected,
        "targets": targets,
    }


def write_acceptance_report(report: Mapping, output_path: Path) -> str:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as target:
        json.dump(report, target, ensure_ascii=False, indent=2)
        target.write("\n")
    return str(output_path)