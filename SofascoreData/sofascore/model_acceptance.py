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
    "classification_max_ece_increase": 0.02,
    "classification_min_macro_f1_delta_vs_production": 0.0,
    "classification_max_brier_delta_vs_production": 0.005,
    "classification_max_ece_delta_vs_production": 0.01,
    "regression_min_relative_mae_improvement": 0.01,
    "regression_min_relative_mae_improvement_vs_production": 0.0,
    "production_min_coverage": 1.0,
}


FLOAT_COMPARISON_EPSILON = 1e-12
DEPLOYABLE_FEATURE_SETS_BY_VARIANT = {
    "without_odds": {"pre_match_safe"},
    "with_odds": {"odds_available"},
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


def _production_benchmark_evaluation(
    stats: Mapping,
    limits: Mapping[str, float],
    expected_artifact_id: Optional[str],
) -> Dict:
    benchmark = stats.get("production_benchmark", {}) or {}
    reference = benchmark.get("reference_artifact", {}) or {}
    reference_artifact_id = reference.get("artifact_id")
    coverage = _number(benchmark.get("coverage"))
    holdout_fingerprint = benchmark.get("holdout_fingerprint")
    candidate_fingerprint = stats.get("validation_fingerprint")
    reasons = []

    if not benchmark:
        reasons.append("missing active-production benchmark")
    elif not benchmark.get("comparable"):
        reasons.append("active-production benchmark is not comparable")
    if coverage is None:
        reasons.append("missing active-production benchmark coverage")
    elif coverage < limits["production_min_coverage"]:
        reasons.append("active-production benchmark coverage is below the threshold")
    if not holdout_fingerprint or not candidate_fingerprint:
        reasons.append("missing temporal holdout fingerprint")
    elif holdout_fingerprint != candidate_fingerprint:
        reasons.append("active-production benchmark uses a different temporal holdout")
    if not reference_artifact_id:
        reasons.append("missing active-production artifact ID")
    elif expected_artifact_id and reference_artifact_id != expected_artifact_id:
        reasons.append("active-production artifact ID does not match the promotion baseline")

    return {
        "valid": not reasons,
        "reasons": reasons,
        "reference_artifact": reference,
        "coverage": coverage,
        "holdout_fingerprint": holdout_fingerprint,
        "metrics": benchmark.get("metrics", {}) or {},
    }


def evaluate_classification_target(
    target: str,
    stats: Mapping,
    thresholds: Optional[Mapping[str, float]] = None,
    require_production_benchmark: bool = False,
    expected_production_artifact_id: Optional[str] = None,
) -> Dict:
    limits = {**DEFAULT_ACCEPTANCE_THRESHOLDS, **(thresholds or {})}
    baseline = (stats.get("baseline", {}) or {}).get("metrics", {}) or {}
    candidate_name, candidate = _classification_candidate(stats)
    baseline_macro_f1 = _number(baseline.get("macro_f1"))
    candidate_macro_f1 = _number(candidate.get("macro_f1"))
    balanced_accuracy = _number(candidate.get("balanced_accuracy"))
    baseline_brier = _number(baseline.get("brier_score"))
    candidate_brier = _number(candidate.get("brier_score"))
    baseline_ece = _number(baseline.get("ece"))
    candidate_ece = _number(candidate.get("ece"))
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
    ece_increase = (
        candidate_ece - baseline_ece
        if candidate_ece is not None and baseline_ece is not None
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
    if ece_increase is None:
        reasons.append("missing ECE baseline or candidate metric")
    elif ece_increase > limits["classification_max_ece_increase"]:
        reasons.append("ECE regressed beyond the acceptance threshold")

    production = _production_benchmark_evaluation(
        stats,
        limits,
        expected_production_artifact_id,
    )
    production_macro_f1 = _number(production["metrics"].get("macro_f1"))
    production_brier = _number(production["metrics"].get("brier_score"))
    production_ece = _number(production["metrics"].get("ece"))
    macro_f1_delta = (
        candidate_macro_f1 - production_macro_f1
        if candidate_macro_f1 is not None and production_macro_f1 is not None
        else None
    )
    brier_delta = (
        candidate_brier - production_brier
        if candidate_brier is not None and production_brier is not None
        else None
    )
    ece_delta = (
        candidate_ece - production_ece
        if candidate_ece is not None and production_ece is not None
        else None
    )
    if require_production_benchmark:
        reasons.extend(production["reasons"])
        if macro_f1_delta is None:
            reasons.append("missing candidate or active-production macro-F1")
        elif macro_f1_delta + FLOAT_COMPARISON_EPSILON < limits["classification_min_macro_f1_delta_vs_production"]:
            reasons.append("macro-F1 is below the active-production model")
        if brier_delta is None:
            reasons.append("missing candidate or active-production Brier score")
        elif brier_delta - FLOAT_COMPARISON_EPSILON > limits["classification_max_brier_delta_vs_production"]:
            reasons.append("Brier score regressed against the active-production model")
        if ece_delta is None:
            reasons.append("missing candidate or active-production ECE")
        elif ece_delta - FLOAT_COMPARISON_EPSILON > limits["classification_max_ece_delta_vs_production"]:
            reasons.append("ECE regressed against the active-production model")

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
            "baseline_ece": baseline_ece,
            "candidate_ece": candidate_ece,
            "ece_increase": ece_increase,
            "production_macro_f1": production_macro_f1,
            "macro_f1_delta_vs_production": macro_f1_delta,
            "production_brier_score": production_brier,
            "brier_delta_vs_production": brier_delta,
            "production_ece": production_ece,
            "ece_delta_vs_production": ece_delta,
        },
        "production_benchmark": production,
    }


def evaluate_regression_target(
    target: str,
    stats: Mapping,
    thresholds: Optional[Mapping[str, float]] = None,
    require_production_benchmark: bool = False,
    expected_production_artifact_id: Optional[str] = None,
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

    production = _production_benchmark_evaluation(
        stats,
        limits,
        expected_production_artifact_id,
    )
    production_mae = _number(production["metrics"].get("mae"))
    production_relative_improvement = None
    if production_mae is not None and candidate_mae is not None and production_mae > 0:
        production_relative_improvement = (production_mae - candidate_mae) / production_mae
    if require_production_benchmark:
        reasons.extend(production["reasons"])
        if production_relative_improvement is None:
            reasons.append("missing candidate or active-production MAE")
        elif production_relative_improvement + FLOAT_COMPARISON_EPSILON < limits[
            "regression_min_relative_mae_improvement_vs_production"
        ]:
            reasons.append("MAE is worse than the active-production model")

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
            "production_mae": production_mae,
            "relative_mae_improvement_vs_production": production_relative_improvement,
        },
        "production_benchmark": production,
    }


def evaluate_target(
    target: str,
    task: str,
    stats: Mapping,
    thresholds: Optional[Mapping[str, float]] = None,
    require_production_benchmark: bool = False,
    expected_production_artifact_id: Optional[str] = None,
) -> Dict:
    if task == "regression":
        return evaluate_regression_target(
            target,
            stats,
            thresholds,
            require_production_benchmark,
            expected_production_artifact_id,
        )
    return evaluate_classification_target(
        target,
        stats,
        thresholds,
        require_production_benchmark,
        expected_production_artifact_id,
    )


def build_acceptance_report(
    training_stats: Mapping[str, Mapping],
    target_tasks: Mapping[str, str],
    variant: str,
    thresholds: Optional[Mapping[str, float]] = None,
    require_production_benchmark: bool = False,
    expected_production_artifact_id: Optional[str] = None,
) -> Dict:
    limits = {**DEFAULT_ACCEPTANCE_THRESHOLDS, **(thresholds or {})}
    deployable_feature_sets = DEPLOYABLE_FEATURE_SETS_BY_VARIANT.get(variant, set())
    targets = {}
    for target, stats in sorted(training_stats.items()):
        result = evaluate_target(
            target,
            target_tasks.get(target, "classification"),
            stats,
            limits,
            require_production_benchmark,
            expected_production_artifact_id,
        )
        feature_set = stats.get("feature_set")
        result["feature_set"] = feature_set
        if not feature_set:
            result["reasons"].append("missing feature-set deployment contract")
        elif feature_set not in deployable_feature_sets:
            result["reasons"].append(
                f"feature set '{feature_set}' is not deployable for {variant}"
            )
        result["accepted"] = not result["reasons"]
        targets[target] = result

    accepted = [target for target, result in targets.items() if result["accepted"]]
    rejected = [target for target, result in targets.items() if not result["accepted"]]
    return {
        "schema_version": 2,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "variant": variant,
        "thresholds": limits,
        "production_benchmark": {
            "required": require_production_benchmark,
            "expected_artifact_id": expected_production_artifact_id,
        },
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