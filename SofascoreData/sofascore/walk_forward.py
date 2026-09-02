import math
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable, Mapping

from sofascore.training_window import DateValue, parse_iso_date


@dataclass(frozen=True)
class WalkForwardFold:
    index: int
    train_end: date
    test_start: date
    test_end: date

    @property
    def release_id(self) -> str:
        return f"wf-{self.index:02d}-{self.test_start.isoformat()}"

    @property
    def slug(self) -> str:
        return (
            f"fold-{self.index:02d}_{self.test_start.isoformat()}_"
            f"{self.test_end.isoformat()}"
        )

    def as_dict(self) -> dict:
        return {
            "index": self.index,
            "release_id": self.release_id,
            "train_end": self.train_end.isoformat(),
            "test_start": self.test_start.isoformat(),
            "test_end": self.test_end.isoformat(),
        }


def build_weekly_folds(
    start_date: DateValue,
    end_date: DateValue,
) -> list[WalkForwardFold]:
    start = parse_iso_date(start_date, "walk-forward start date")
    end = parse_iso_date(end_date, "walk-forward end date")
    if end < start:
        raise ValueError("walk-forward end date must not be earlier than start date")

    folds = []
    cursor = start
    index = 1
    while cursor <= end:
        days_until_sunday = (6 - cursor.weekday()) % 7
        fold_end = min(end, cursor + timedelta(days=days_until_sunday))
        folds.append(
            WalkForwardFold(
                index=index,
                train_end=cursor - timedelta(days=1),
                test_start=cursor,
                test_end=fold_end,
            )
        )
        cursor = fold_end + timedelta(days=1)
        index += 1
    return folds


def _safe_number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(float(value)):
        return None
    return float(value)


def _matrix(value):
    if not isinstance(value, list) or not value:
        return None
    size = len(value)
    if any(not isinstance(row, list) or len(row) != size for row in value):
        return None
    try:
        return [[int(cell) for cell in row] for row in value]
    except (TypeError, ValueError):
        return None


def _sum_matrix(left, right):
    if left is None:
        return [row[:] for row in right]
    if len(left) != len(right):
        raise ValueError("walk-forward confusion matrices use inconsistent classes")
    return [
        [left[row][column] + right[row][column] for column in range(len(left))]
        for row in range(len(left))
    ]


def _classification_from_confusion_matrix(matrix: list[list[int]]) -> dict:
    total = sum(sum(row) for row in matrix)
    accuracy = sum(matrix[index][index] for index in range(len(matrix))) / total
    recalls = []
    f1_scores = []
    per_class_recall = {}
    for index in range(len(matrix)):
        true_positive = matrix[index][index]
        support = sum(matrix[index])
        predicted = sum(row[index] for row in matrix)
        recall = true_positive / support if support else 0.0
        precision = true_positive / predicted if predicted else 0.0
        f1 = (
            2 * precision * recall / (precision + recall)
            if precision + recall
            else 0.0
        )
        if support:
            recalls.append(recall)
        f1_scores.append(f1)
        per_class_recall[str(index)] = round(recall, 6)
    return {
        "accuracy": round(accuracy, 6),
        "macro_f1": round(sum(f1_scores) / len(f1_scores), 6),
        "balanced_accuracy": round(sum(recalls) / len(recalls), 6),
        "per_class_recall": per_class_recall,
    }


def _weighted_metric(accumulator: Mapping, name: str):
    weight = accumulator["weighted_metrics"].get(name, {}).get("weight", 0)
    if not weight:
        return None
    total = accumulator["weighted_metrics"][name]["total"]
    return round(total / weight, 6)


def aggregate_walk_forward_metrics(entries: Iterable[Mapping]) -> dict:
    accumulators = {}
    entry_count = 0
    for entry in entries:
        variant = entry["variant"]
        payload = entry["metrics"]
        entry_count += 1
        for target, target_payload in payload.get("targets", {}).items():
            task = target_payload.get("task", "unknown")
            stats = target_payload.get("stats", {})
            default_rows = int(stats.get("test_matches") or 0)
            if task == "regression":
                evaluated_models = stats.get("detailed_metrics", {})
            else:
                deployment = stats.get("deployment_refit", {})
                evaluated_models = {
                    name: metadata.get("test_metrics", {})
                    for name, metadata in deployment.get("models", {}).items()
                    if isinstance(metadata, Mapping)
                }
                evaluated_models.update(deployment.get("consensus", {}))
            for model, metrics in evaluated_models.items():
                key = (variant, target, model)
                accumulator = accumulators.setdefault(
                    key,
                    {
                        "task": task,
                        "fold_count": 0,
                        "test_rows": 0,
                        "confusion_matrix": None,
                        "weighted_metrics": {},
                    },
                )
                accumulator["fold_count"] += 1

                matrix = _matrix(metrics.get("confusion_matrix"))
                rows = sum(sum(row) for row in matrix) if matrix else default_rows
                accumulator["test_rows"] += rows
                if matrix:
                    accumulator["confusion_matrix"] = _sum_matrix(
                        accumulator["confusion_matrix"],
                        matrix,
                    )

                metric_names = (
                    ("brier_score", "log_loss", "ece")
                    if task != "regression"
                    else ("mae", "rmse", "r2")
                )
                for metric_name in metric_names:
                    value = _safe_number(metrics.get(metric_name))
                    if value is None or rows <= 0:
                        continue
                    bucket = accumulator["weighted_metrics"].setdefault(
                        metric_name,
                        {"total": 0.0, "weight": 0},
                    )
                    contribution = value * value if metric_name == "rmse" else value
                    bucket["total"] += contribution * rows
                    bucket["weight"] += rows

    variants = {}
    for (variant, target, model), accumulator in sorted(accumulators.items()):
        task = accumulator["task"]
        result = {
            "fold_count": accumulator["fold_count"],
            "test_rows": accumulator["test_rows"],
        }
        if task == "regression":
            result.update({
                "mae": _weighted_metric(accumulator, "mae"),
                "rmse": (
                    round(math.sqrt(_weighted_metric(accumulator, "rmse")), 6)
                    if _weighted_metric(accumulator, "rmse") is not None
                    else None
                ),
                "r2_fold_weighted": _weighted_metric(accumulator, "r2"),
            })
        else:
            matrix = accumulator["confusion_matrix"]
            if matrix:
                result.update(_classification_from_confusion_matrix(matrix))
                result["confusion_matrix"] = matrix
            result.update({
                "brier_score": _weighted_metric(accumulator, "brier_score"),
                "log_loss": _weighted_metric(accumulator, "log_loss"),
                "ece_fold_weighted": _weighted_metric(accumulator, "ece"),
            })

        target_output = variants.setdefault(variant, {"targets": {}})["targets"].setdefault(
            target,
            {"task": task, "models": {}},
        )
        target_output["models"][model] = result

    return {
        "schema_version": 1,
        "completed_fold_artifacts": entry_count,
        "variants": variants,
        "notes": {
            "classification": (
                "Metrics use estimators refitted on every pre-fold row. Accuracy, "
                "macro F1 and balanced accuracy are recomputed from confusion "
                "matrices summed across folds. Brier score and log loss are "
                "row-weighted fold means."
            ),
            "calibration": (
                "ECE is a fold-weighted descriptive value, not ECE recomputed from "
                "pooled row-level probabilities."
            ),
            "regression": (
                "MAE is row-weighted and RMSE is pooled from fold MSE. R2 is a "
                "fold-weighted descriptive value."
            ),
        },
    }
