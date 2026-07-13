from typing import Dict, Mapping, Optional, Sequence

import numpy as np
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score


DECISION_POLICY_VERSION = 1


def normalize_probabilities(probabilities) -> np.ndarray:
    values = np.asarray(probabilities, dtype=float)
    if values.ndim == 1:
        values = values.reshape(1, -1)
    if values.ndim != 2 or values.shape[1] == 0:
        raise ValueError("probabilities must be a non-empty 2D matrix")

    normalized = np.nan_to_num(values, nan=0.0, posinf=0.0, neginf=0.0)
    normalized = np.clip(normalized, 0.0, None)
    row_sums = normalized.sum(axis=1, keepdims=True)
    valid_rows = row_sums[:, 0] > 0
    normalized[valid_rows] /= row_sums[valid_rows]
    normalized[~valid_rows] = 1.0 / normalized.shape[1]
    return normalized


def apply_decision_policy(
    probabilities,
    policy: Optional[Dict],
    class_labels: Sequence[int],
) -> np.ndarray:
    normalized = normalize_probabilities(probabilities)
    labels = np.asarray(class_labels)
    if normalized.shape[1] != len(labels):
        raise ValueError("probability columns must match class labels")

    offsets = np.zeros(len(labels), dtype=float)
    if policy:
        policy_labels = policy.get("class_labels", list(class_labels))
        if list(policy_labels) != list(class_labels):
            raise ValueError("decision policy class labels do not match")
        configured = np.asarray(policy.get("log_offsets", offsets), dtype=float)
        if configured.shape != offsets.shape:
            raise ValueError("decision policy offsets do not match class labels")
        offsets = configured

    scores = np.log(np.clip(normalized, 1e-12, 1.0)) + offsets
    return labels[np.argmax(scores, axis=1)]


def _decision_metrics(y_true, y_pred) -> Dict[str, float]:
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "macro_f1": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
    }


def fit_result_decision_policy(
    y_true,
    probabilities,
    class_labels: Sequence[int] = (0, 1, 2),
    max_accuracy_drop: float = 0.06,
) -> Dict:
    labels = list(class_labels)
    if labels != [0, 1, 2]:
        raise ValueError("result decision policy requires HOME/DRAW/AWAY labels [0, 1, 2]")

    normalized = normalize_probabilities(probabilities)
    y_values = np.asarray(y_true)
    if len(y_values) != len(normalized):
        raise ValueError("labels and probabilities must contain the same rows")
    if len(y_values) == 0:
        raise ValueError("decision policy requires at least one row")

    baseline_pred = apply_decision_policy(normalized, None, labels)
    baseline = _decision_metrics(y_values, baseline_pred)
    accuracy_floor = max(0.0, baseline["accuracy"] - max_accuracy_drop)
    best_offsets = np.zeros(3, dtype=float)
    best_metrics = baseline
    best_key = (
        baseline["macro_f1"],
        baseline["balanced_accuracy"],
        baseline["accuracy"],
        0.0,
    )

    home_offsets = np.round(np.arange(-0.40, 0.401, 0.05), 2)
    draw_offsets = np.round(np.arange(0.0, 1.201, 0.05), 2)
    for home_offset in home_offsets:
        for draw_offset in draw_offsets:
            offsets = np.array([home_offset, draw_offset, 0.0])
            candidate = {
                "class_labels": labels,
                "log_offsets": offsets.tolist(),
            }
            predicted = apply_decision_policy(normalized, candidate, labels)
            metrics = _decision_metrics(y_values, predicted)
            if metrics["accuracy"] + 1e-12 < accuracy_floor:
                continue
            key = (
                metrics["macro_f1"],
                metrics["balanced_accuracy"],
                metrics["accuracy"],
                -float(np.linalg.norm(offsets)),
            )
            if key > best_key:
                best_key = key
                best_offsets = offsets
                best_metrics = metrics

    return {
        "version": DECISION_POLICY_VERSION,
        "type": "multiclass_log_offsets",
        "class_labels": labels,
        "log_offsets": [round(float(value), 4) for value in best_offsets],
        "selection_metric": "macro_f1",
        "fit_rows": int(len(y_values)),
        "max_accuracy_drop": float(max_accuracy_drop),
        "accuracy_floor": round(float(accuracy_floor), 4),
        "baseline_metrics": {
            key: round(value, 4) for key, value in baseline.items()
        },
        "tuned_metrics": {
            key: round(value, 4) for key, value in best_metrics.items()
        },
    }


def weighted_average_probabilities(
    probabilities_by_model: Mapping[str, np.ndarray],
    weights: Optional[Mapping[str, float]] = None,
) -> Optional[np.ndarray]:
    selected = []
    selected_weights = []
    for model_name, probabilities in probabilities_by_model.items():
        if weights and model_name not in weights:
            continue
        weight = float(weights.get(model_name, 1.0)) if weights else 1.0
        if weight <= 0:
            continue
        selected.append(normalize_probabilities(probabilities))
        selected_weights.append(weight)

    if not selected:
        return None
    shape = selected[0].shape
    if any(values.shape != shape for values in selected):
        raise ValueError("model probability matrices must use the same shape")
    return np.average(
        np.stack(selected),
        axis=0,
        weights=selected_weights,
    )

