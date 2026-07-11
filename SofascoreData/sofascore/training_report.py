import copy
import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional


HIGHER_IS_BETTER = frozenset({
    "accuracy",
    "balanced_accuracy",
    "f1",
    "macro_f1",
    "precision",
    "r2",
    "recall",
})
LOWER_IS_BETTER = frozenset({
    "brier_score",
    "ece",
    "log_loss",
    "mae",
    "rmse",
})
COMPARISON_METRICS = tuple(sorted(HIGHER_IS_BETTER | LOWER_IS_BETTER))
METRIC_CONTRACT = {
    "brier_score": {
        "definition": "mean_sample_sum_squared_probability_error",
        "class_reduction": "sum",
    },
}


def _numeric(value):
    return float(value) if isinstance(value, (int, float)) else None


def compare_model_metrics(current: Dict, baseline: Dict) -> list:
    rows = []
    for model in sorted(set(current) | set(baseline)):
        current_metrics = current.get(model, {})
        baseline_metrics = baseline.get(model, {})
        metrics = {}

        for metric in COMPARISON_METRICS:
            current_value = _numeric(current_metrics.get(metric))
            baseline_value = _numeric(baseline_metrics.get(metric))
            if current_value is None and baseline_value is None:
                continue

            delta = None
            improvement = None
            if current_value is not None and baseline_value is not None:
                delta = current_value - baseline_value
                improvement = delta if metric in HIGHER_IS_BETTER else -delta

            metrics[metric] = {
                "baseline": baseline_value,
                "current": current_value,
                "delta": delta,
                "improvement": improvement,
                "direction": "higher" if metric in HIGHER_IS_BETTER else "lower",
            }

        rows.append({"model": model, "metrics": metrics})
    return rows


def _classification_class_count(target: str, stats: Dict) -> Optional[int]:
    class_labels = stats.get("class_labels")
    if isinstance(class_labels, (list, tuple)) and len(class_labels) > 1:
        return len(class_labels)
    if target == "result":
        return 3
    if any(
        _numeric(metrics.get("brier_score")) is not None
        for metrics in stats.get("detailed_metrics", {}).values()
    ):
        return 2
    return None


def _prepare_baseline_metrics(
    target: str,
    stats: Dict,
    baseline_metrics: Dict,
    baseline_contract: Dict,
) -> tuple:
    prepared = copy.deepcopy(baseline_metrics)
    current_brier = METRIC_CONTRACT["brier_score"]
    baseline_brier = baseline_contract.get("brier_score", {})
    class_count = _classification_class_count(target, stats)
    conversion_factor = 1

    if baseline_brier != current_brier and class_count:
        conversion_factor = class_count
        for metrics in prepared.values():
            value = _numeric(metrics.get("brier_score"))
            if value is not None:
                metrics["brier_score"] = round(value * conversion_factor, 4)

    return prepared, {
        "current": current_brier,
        "baseline": baseline_brier or {
            "definition": "legacy_mean_elementwise_squared_probability_error",
            "class_reduction": "mean",
        },
        "baseline_conversion_factor": conversion_factor,
    }


def build_training_comparison(
    current_training_stats: Dict,
    baseline_manifest: Optional[Dict],
    variant: str,
    dataset_summary: Dict,
) -> Dict:
    baseline_metrics = (baseline_manifest or {}).get("metrics_by_target", {})
    baseline_contract = (baseline_manifest or {}).get("metric_contract", {})
    targets = {}

    for target in sorted(current_training_stats):
        target_stats = current_training_stats[target]
        current_metrics = target_stats.get("detailed_metrics", {})
        prepared_baseline, metric_contract = _prepare_baseline_metrics(
            target,
            target_stats,
            baseline_metrics.get(target, {}),
            baseline_contract,
        )
        targets[target] = {
            "validation": target_stats.get("validation"),
            "date_ranges": target_stats.get("date_ranges"),
            "feature_set": target_stats.get("feature_set"),
            "feature_count": target_stats.get("features"),
            "metric_contract": metric_contract,
            "models": compare_model_metrics(
                current_metrics,
                prepared_baseline,
            ),
        }

    return {
        "schema_version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "variant": variant,
        "dataset": dataset_summary,
        "baseline": {
            "created_at": (baseline_manifest or {}).get("created_at"),
            "dataset_hash": (baseline_manifest or {}).get("dataset_hash"),
            "code_hash": (baseline_manifest or {}).get("code_hash"),
        },
        "targets": targets,
    }


def write_training_comparison(report: Dict, output_dir: Path) -> Dict[str, str]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "comparison.json"
    csv_path = output_dir / "comparison.csv"

    with open(json_path, "w", encoding="utf-8") as target:
        json.dump(report, target, ensure_ascii=False, indent=2)
        target.write("\n")

    fieldnames = [
        "variant",
        "target",
        "model",
        "metric",
        "direction",
        "baseline",
        "current",
        "delta",
        "improvement",
    ]
    with open(csv_path, "w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=fieldnames)
        writer.writeheader()
        for target_name, target_data in report.get("targets", {}).items():
            for model_data in target_data.get("models", []):
                for metric, values in model_data.get("metrics", {}).items():
                    writer.writerow({
                        "variant": report.get("variant"),
                        "target": target_name,
                        "model": model_data.get("model"),
                        "metric": metric,
                        **values,
                    })

    return {"json": str(json_path), "csv": str(csv_path)}
