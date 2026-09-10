from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from scipy.stats import binomtest


VARIANTS = ("without_odds", "with_odds")
PRIMARY_MODEL = "Consensus Policy"
MODEL_ORDER = (
    "Logistic Regression",
    "Random Forest",
    "KNN",
    "MLP",
    "XGBoost",
    "LightGBM",
    "Ensemble",
    "Stacking",
    "LSTM",
    "Consensus Argmax",
    "Consensus Policy",
)
METRIC_NAMES = (
    "accuracy",
    "macro_f1",
    "balanced_accuracy",
    "brier_score",
    "log_loss",
)
COMPARISON_FIELDS = (
    "target",
    "task",
    "model",
    "primary_model",
    "fold_count",
    "paired_rows",
    "probability_rows",
    "without_accuracy",
    "with_accuracy",
    "delta_accuracy",
    "delta_accuracy_ci_low",
    "delta_accuracy_ci_high",
    "without_macro_f1",
    "with_macro_f1",
    "delta_macro_f1",
    "delta_macro_f1_ci_low",
    "delta_macro_f1_ci_high",
    "without_balanced_accuracy",
    "with_balanced_accuracy",
    "delta_balanced_accuracy",
    "delta_balanced_accuracy_ci_low",
    "delta_balanced_accuracy_ci_high",
    "without_brier_score",
    "with_brier_score",
    "delta_brier_score",
    "delta_brier_score_ci_low",
    "delta_brier_score_ci_high",
    "without_log_loss",
    "with_log_loss",
    "delta_log_loss",
    "delta_log_loss_ci_low",
    "delta_log_loss_ci_high",
    "mcnemar_without_wrong_with_correct",
    "mcnemar_without_correct_with_wrong",
    "mcnemar_discordant",
    "mcnemar_exact_p",
    "mcnemar_holm_p",
    "mcnemar_holm_significant_0_05",
    "macro_f1_ci_excludes_zero",
)
FOLD_FIELDS = (
    "fold_index",
    "release_id",
    "test_start",
    "test_end",
    "target",
    "model",
    "variant",
    "rows",
    "probability_rows",
    "accuracy",
    "macro_f1",
    "balanced_accuracy",
    "brier_score",
    "log_loss",
)


def _read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return payload


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _write_csv(path: Path, fields: tuple[str, ...], rows: Iterable[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def _model_sort_key(name: str) -> tuple[int, str]:
    try:
        return MODEL_ORDER.index(name), name
    except ValueError:
        return len(MODEL_ORDER), name


def _identity(row: dict[str, Any]) -> tuple[Any, ...]:
    event_id = row.get("event_id")
    fallback = (
        row.get("date"),
        row.get("home_team_id") or row.get("home_team"),
        row.get("away_team_id") or row.get("away_team"),
    )
    return (
        row.get("target"),
        event_id if event_id is not None else fallback,
        row.get("date"),
        row.get("actual"),
    )


def _load_prediction_rows(path: Path) -> dict[tuple[Any, ...], dict[str, Any]]:
    rows = {}
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError(f"Invalid prediction row {line_number} in {path}")
            key = _identity(row)
            if key in rows:
                raise ValueError(f"Duplicate prediction identity in {path}: {key}")
            rows[key] = row
    return rows


def _available_prediction(row: dict[str, Any], model: str) -> dict | None:
    payload = (row.get("predictions") or {}).get(model)
    if not isinstance(payload, dict) or payload.get("available") is False:
        return None
    if payload.get("prediction") is None:
        return None
    return payload


def _probability_losses(
    source_row: dict[str, Any],
    prediction: dict[str, Any],
) -> tuple[float, float] | None:
    probabilities = prediction.get("probabilities")
    actual_label = str(source_row.get("actual_label"))
    if not isinstance(probabilities, dict) or actual_label not in probabilities:
        return None
    try:
        values = {str(label): float(value) for label, value in probabilities.items()}
    except (TypeError, ValueError):
        return None
    if not values or any(not np.isfinite(value) for value in values.values()):
        return None
    brier = sum(
        (value - (1.0 if label == actual_label else 0.0)) ** 2
        for label, value in values.items()
    )
    probability = float(np.clip(values[actual_label], 1e-15, 1 - 1e-15))
    return brier, -float(np.log(probability))


def _confusion_metrics(matrix: np.ndarray) -> dict[str, float]:
    total = float(matrix.sum())
    if total <= 0:
        return {
            "accuracy": float("nan"),
            "macro_f1": float("nan"),
            "balanced_accuracy": float("nan"),
        }
    diagonal = np.diag(matrix).astype(float)
    support = matrix.sum(axis=1).astype(float)
    predicted = matrix.sum(axis=0).astype(float)
    recall = np.divide(diagonal, support, out=np.zeros_like(diagonal), where=support > 0)
    precision = np.divide(
        diagonal,
        predicted,
        out=np.zeros_like(diagonal),
        where=predicted > 0,
    )
    denominator = precision + recall
    f1 = np.divide(
        2 * precision * recall,
        denominator,
        out=np.zeros_like(diagonal),
        where=denominator > 0,
    )
    return {
        "accuracy": float(diagonal.sum() / total),
        "macro_f1": float(f1.mean()),
        "balanced_accuracy": float(recall.mean()),
    }


def _sufficient_statistics(
    pairs: list[dict[str, Any]],
    variant: str,
    model: str,
    labels: tuple[Any, ...],
) -> dict[str, Any]:
    label_indexes = {label: index for index, label in enumerate(labels)}
    matrix = np.zeros((len(labels), len(labels)), dtype=np.int64)
    brier_sum = 0.0
    log_loss_sum = 0.0
    probability_rows = 0
    correctness = []
    for pair in pairs:
        source_row = pair[variant]
        prediction = _available_prediction(source_row, model)
        if prediction is None:
            raise ValueError(f"Unavailable prediction passed to statistics: {model}")
        actual = source_row.get("actual")
        predicted = prediction.get("prediction")
        matrix[label_indexes[actual], label_indexes[predicted]] += 1
        correctness.append(actual == predicted)
        losses = _probability_losses(source_row, prediction)
        if losses is not None:
            brier_sum += losses[0]
            log_loss_sum += losses[1]
            probability_rows += 1
    return {
        "rows": len(pairs),
        "matrix": matrix,
        "brier_sum": brier_sum,
        "log_loss_sum": log_loss_sum,
        "probability_rows": probability_rows,
        "correctness": np.asarray(correctness, dtype=bool),
    }


def _metrics_from_statistics(statistics: dict[str, Any]) -> dict[str, float | int | None]:
    result: dict[str, float | int | None] = {
        "rows": statistics["rows"],
        "probability_rows": statistics["probability_rows"],
        **_confusion_metrics(statistics["matrix"]),
        "brier_score": None,
        "log_loss": None,
    }
    probability_rows = statistics["probability_rows"]
    if probability_rows:
        result["brier_score"] = statistics["brier_sum"] / probability_rows
        result["log_loss"] = statistics["log_loss_sum"] / probability_rows
    return result


def _bootstrap_metric_vectors(
    statistics: list[dict[str, Any]],
    draws: np.ndarray,
) -> dict[str, np.ndarray]:
    matrices = np.stack([item["matrix"] for item in statistics])
    rows = np.asarray([item["rows"] for item in statistics], dtype=float)
    probability_rows = np.asarray(
        [item["probability_rows"] for item in statistics],
        dtype=float,
    )
    brier_sums = np.asarray([item["brier_sum"] for item in statistics], dtype=float)
    log_loss_sums = np.asarray(
        [item["log_loss_sum"] for item in statistics],
        dtype=float,
    )
    sampled_matrices = matrices[draws].sum(axis=1).astype(float)
    sampled_rows = rows[draws].sum(axis=1)
    sampled_probability_rows = probability_rows[draws].sum(axis=1)
    diagonal = np.diagonal(sampled_matrices, axis1=1, axis2=2)
    support = sampled_matrices.sum(axis=2)
    predicted = sampled_matrices.sum(axis=1)
    recall = np.divide(
        diagonal,
        support,
        out=np.zeros_like(diagonal),
        where=support > 0,
    )
    precision = np.divide(
        diagonal,
        predicted,
        out=np.zeros_like(diagonal),
        where=predicted > 0,
    )
    denominator = precision + recall
    f1 = np.divide(
        2 * precision * recall,
        denominator,
        out=np.zeros_like(diagonal),
        where=denominator > 0,
    )
    return {
        "accuracy": diagonal.sum(axis=1) / sampled_rows,
        "macro_f1": f1.mean(axis=1),
        "balanced_accuracy": recall.mean(axis=1),
        "brier_score": np.divide(
            brier_sums[draws].sum(axis=1),
            sampled_probability_rows,
            out=np.full(len(draws), np.nan),
            where=sampled_probability_rows > 0,
        ),
        "log_loss": np.divide(
            log_loss_sums[draws].sum(axis=1),
            sampled_probability_rows,
            out=np.full(len(draws), np.nan),
            where=sampled_probability_rows > 0,
        ),
    }


def _cluster_bootstrap_deltas(
    fold_statistics: dict[str, list[dict[str, Any]]],
    iterations: int,
    seed: int,
) -> dict[str, tuple[float, float]]:
    fold_count = len(fold_statistics[VARIANTS[0]])
    if fold_count == 0 or len(fold_statistics[VARIANTS[1]]) != fold_count:
        raise ValueError("Paired bootstrap requires matching non-empty fold blocks")
    rng = np.random.default_rng(seed)
    draws = rng.integers(0, fold_count, size=(iterations, fold_count))
    without = _bootstrap_metric_vectors(fold_statistics[VARIANTS[0]], draws)
    with_odds = _bootstrap_metric_vectors(fold_statistics[VARIANTS[1]], draws)
    intervals = {}
    for metric in METRIC_NAMES:
        delta = with_odds[metric] - without[metric]
        finite = delta[np.isfinite(delta)]
        intervals[metric] = (
            float(np.percentile(finite, 2.5)),
            float(np.percentile(finite, 97.5)),
        )
    return intervals


def _holm_adjust(values: list[float]) -> list[float]:
    if not values:
        return []
    order = sorted(range(len(values)), key=values.__getitem__)
    adjusted = [1.0] * len(values)
    running = 0.0
    total = len(values)
    for rank, index in enumerate(order):
        candidate = min(1.0, (total - rank) * values[index])
        running = max(running, candidate)
        adjusted[index] = running
    return adjusted


def _seed_for(seed: int, target: str, model: str) -> int:
    digest = hashlib.sha256(f"{seed}:{target}:{model}".encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big", signed=False)


def _load_paired_run(run_dir: Path) -> tuple[dict, dict, dict, list[Path]]:
    run_path = run_dir / "walk_forward_run.json"
    summary_path = run_dir / "walk_forward_summary.json"
    index_path = run_dir / "walk_forward_predictions.json"
    run = _read_json(run_path)
    summary = _read_json(summary_path)
    prediction_index = _read_json(index_path)
    protocol = run.get("protocol") or {}
    if protocol.get("paired_common_sample") is not True:
        raise ValueError("Walk-forward run is not a paired common-sample experiment")
    if set(protocol.get("variants") or []) != set(VARIANTS):
        raise ValueError("Walk-forward run must contain odds and no-odds variants")
    if summary.get("complete") is not True:
        raise ValueError("Walk-forward summary is not complete")
    fingerprints = {
        run.get("plan_fingerprint"),
        summary.get("plan_fingerprint"),
        prediction_index.get("plan_fingerprint"),
    }
    if len(fingerprints) != 1 or None in fingerprints:
        raise ValueError("Walk-forward plan fingerprints do not match")
    return run, summary, prediction_index, [run_path, summary_path, index_path]


def _pair_prediction_rows(
    run_dir: Path,
    run: dict,
    prediction_index: dict,
) -> tuple[dict[str, list[dict]], dict[str, Any], list[Path]]:
    index_entries = {
        str(Path(item["path"])): item
        for item in prediction_index.get("files", [])
    }
    jobs_by_fold: dict[str, dict[str, dict]] = defaultdict(dict)
    status_counts = Counter()
    for job in run.get("jobs", []):
        status_counts[job.get("status")] += 1
        jobs_by_fold[job["fold"]["release_id"]][job["variant"]] = job

    paired_by_target: dict[str, list[dict]] = defaultdict(list)
    input_paths = []
    evaluated_folds = []
    skipped_folds = []
    for release_id, variant_jobs in sorted(
        jobs_by_fold.items(),
        key=lambda item: min(job["fold"]["index"] for job in item[1].values()),
    ):
        if set(variant_jobs) != set(VARIANTS):
            raise ValueError(f"Fold {release_id} does not contain both variants")
        statuses = {variant_jobs[variant].get("status") for variant in VARIANTS}
        if statuses == {"skipped"}:
            skipped_folds.append(release_id)
            continue
        if statuses != {"completed"}:
            raise ValueError(f"Fold {release_id} is not a completed pair: {statuses}")

        loaded = {}
        for variant in VARIANTS:
            job = variant_jobs[variant]
            relative_path = Path(job["artifacts"]["predictions"])
            path = run_dir / relative_path
            entry = index_entries.get(str(relative_path))
            if entry is None:
                raise ValueError(f"Prediction index is missing {relative_path}")
            if _sha256(path) != entry.get("sha256"):
                raise ValueError(f"Prediction checksum mismatch: {relative_path}")
            rows = _load_prediction_rows(path)
            if len(rows) != entry.get("rows"):
                raise ValueError(f"Prediction row count mismatch: {relative_path}")
            loaded[variant] = rows
            input_paths.append(path)
        if set(loaded[VARIANTS[0]]) != set(loaded[VARIANTS[1]]):
            raise ValueError(f"Paired prediction identities differ in {release_id}")

        fold = variant_jobs[VARIANTS[0]]["fold"]
        evaluated_folds.append(release_id)
        for key in sorted(loaded[VARIANTS[0]], key=str):
            without = loaded[VARIANTS[0]][key]
            with_odds = loaded[VARIANTS[1]][key]
            target = str(without.get("target"))
            paired_by_target[target].append({
                "fold": fold,
                VARIANTS[0]: without,
                VARIANTS[1]: with_odds,
            })

    indexed_rows = sum(item.get("rows", 0) for item in prediction_index.get("files", []))
    loaded_rows = sum(len(rows) for rows in paired_by_target.values()) * 2
    if loaded_rows != indexed_rows:
        raise ValueError(
            f"Prediction index has {indexed_rows} rows but paired loader found {loaded_rows}"
        )
    return paired_by_target, {
        "job_statuses": dict(status_counts),
        "evaluated_folds": evaluated_folds,
        "skipped_folds": skipped_folds,
        "prediction_files": len(input_paths),
        "prediction_rows": indexed_rows,
    }, input_paths


def _comparison_rows(
    paired_by_target: dict[str, list[dict]],
    bootstrap_iterations: int,
    bootstrap_seed: int,
    primary_model: str,
) -> tuple[list[dict], list[dict]]:
    comparisons = []
    fold_rows = []
    for target in sorted(paired_by_target):
        target_pairs = paired_by_target[target]
        model_names = sorted({
            model
            for pair in target_pairs
            for variant in VARIANTS
            for model in (pair[variant].get("predictions") or {})
        }, key=_model_sort_key)
        for model in model_names:
            model_pairs = [
                pair
                for pair in target_pairs
                if all(_available_prediction(pair[variant], model) for variant in VARIANTS)
            ]
            if not model_pairs:
                continue
            labels = tuple(sorted({
                value
                for pair in model_pairs
                for variant in VARIANTS
                for value in (
                    pair[variant].get("actual"),
                    _available_prediction(pair[variant], model).get("prediction"),
                )
            }, key=str))
            folds: dict[str, list[dict]] = defaultdict(list)
            fold_metadata = {}
            for pair in model_pairs:
                release_id = pair["fold"]["release_id"]
                folds[release_id].append(pair)
                fold_metadata[release_id] = pair["fold"]

            fold_statistics = {variant: [] for variant in VARIANTS}
            all_statistics = {}
            for variant in VARIANTS:
                all_statistics[variant] = _sufficient_statistics(
                    model_pairs,
                    variant,
                    model,
                    labels,
                )
                for release_id in sorted(
                    folds,
                    key=lambda value: fold_metadata[value]["index"],
                ):
                    statistics = _sufficient_statistics(
                        folds[release_id],
                        variant,
                        model,
                        labels,
                    )
                    fold_statistics[variant].append(statistics)
                    metrics = _metrics_from_statistics(statistics)
                    fold = fold_metadata[release_id]
                    fold_rows.append({
                        "fold_index": fold["index"],
                        "release_id": release_id,
                        "test_start": fold["test_start"],
                        "test_end": fold["test_end"],
                        "target": target,
                        "model": model,
                        "variant": variant,
                        **metrics,
                    })

            metrics = {
                variant: _metrics_from_statistics(all_statistics[variant])
                for variant in VARIANTS
            }
            intervals = _cluster_bootstrap_deltas(
                fold_statistics,
                bootstrap_iterations,
                _seed_for(bootstrap_seed, target, model),
            )
            without_correct = all_statistics[VARIANTS[0]]["correctness"]
            with_correct = all_statistics[VARIANTS[1]]["correctness"]
            improved = int(np.sum(~without_correct & with_correct))
            degraded = int(np.sum(without_correct & ~with_correct))
            discordant = improved + degraded
            mcnemar_p = (
                float(binomtest(improved, discordant, 0.5).pvalue)
                if discordant
                else 1.0
            )
            row = {
                "target": target,
                "task": target_pairs[0][VARIANTS[0]].get("task"),
                "model": model,
                "primary_model": model == primary_model,
                "fold_count": len(folds),
                "paired_rows": len(model_pairs),
                "probability_rows": min(
                    int(metrics[variant]["probability_rows"])
                    for variant in VARIANTS
                ),
                "mcnemar_without_wrong_with_correct": improved,
                "mcnemar_without_correct_with_wrong": degraded,
                "mcnemar_discordant": discordant,
                "mcnemar_exact_p": mcnemar_p,
            }
            for metric in METRIC_NAMES:
                without_value = metrics[VARIANTS[0]][metric]
                with_value = metrics[VARIANTS[1]][metric]
                row[f"without_{metric}"] = without_value
                row[f"with_{metric}"] = with_value
                row[f"delta_{metric}"] = (
                    with_value - without_value
                    if without_value is not None and with_value is not None
                    else None
                )
                row[f"delta_{metric}_ci_low"] = intervals[metric][0]
                row[f"delta_{metric}_ci_high"] = intervals[metric][1]
            row["macro_f1_ci_excludes_zero"] = (
                row["delta_macro_f1_ci_low"] > 0
                or row["delta_macro_f1_ci_high"] < 0
            )
            comparisons.append(row)

    adjusted = _holm_adjust([float(row["mcnemar_exact_p"]) for row in comparisons])
    for row, adjusted_p in zip(comparisons, adjusted):
        row["mcnemar_holm_p"] = adjusted_p
        row["mcnemar_holm_significant_0_05"] = adjusted_p < 0.05
    return comparisons, fold_rows


def _format_percent(value: Any, signed: bool = False) -> str:
    if value is None:
        return ""
    sign = "+" if signed else ""
    return f"{float(value) * 100:{sign}.2f}%"


def _validate_summary_metrics(
    comparisons: list[dict],
    summary: dict[str, Any],
) -> int:
    checked = 0
    tolerances = {
        "accuracy": 1e-6,
        "macro_f1": 1e-6,
        "balanced_accuracy": 1e-6,
        "brier_score": 5e-5,
        "log_loss": 5e-5,
    }
    for row in comparisons:
        target = row["target"]
        model = row["model"]
        for variant, prefix in (("without_odds", "without"), ("with_odds", "with")):
            expected = (
                summary.get("variants", {})
                .get(variant, {})
                .get("targets", {})
                .get(target, {})
                .get("models", {})
                .get(model)
            )
            if not isinstance(expected, dict):
                raise ValueError(f"Summary is missing {variant}/{target}/{model}")
            if int(expected.get("test_rows") or 0) != int(row["paired_rows"]):
                raise ValueError(
                    f"Summary row count differs for {variant}/{target}/{model}"
                )
            for metric, tolerance in tolerances.items():
                observed = row[f"{prefix}_{metric}"]
                reference = expected.get(metric)
                if observed is None or reference is None:
                    raise ValueError(
                        f"Summary metric is missing for {variant}/{target}/{model}/{metric}"
                    )
                if abs(float(observed) - float(reference)) > tolerance:
                    raise ValueError(
                        f"Recomputed metric differs from summary for "
                        f"{variant}/{target}/{model}/{metric}"
                    )
                checked += 1
    return checked


def _write_readme(
    path: Path,
    manifest: dict[str, Any],
    primary_rows: list[dict],
) -> None:
    protocol = manifest["protocol"]
    validation = manifest["validation"]
    lines = [
        "# Paired walk-forward odds analysis",
        "",
        f"- Evaluation window: `{protocol.get('start_date')}` to `{protocol.get('end_date')}`",
        f"- Evaluated temporal folds: `{len(validation['evaluated_folds'])}`",
        f"- Explicitly skipped empty folds: `{len(validation['skipped_folds'])}`",
        f"- Bootstrap: `{manifest['method']['bootstrap_iterations']}` fold-block replicates, seed `{manifest['method']['bootstrap_seed']}`",
        f"- Primary estimator: `{manifest['method']['primary_model']}`",
        "",
        "## Primary comparison",
        "",
        "| Target | Paired rows | Macro F1 without | Macro F1 with | Delta (95% CI) | Accuracy delta (95% CI) | Brier delta (95% CI) | McNemar p |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in primary_rows:
        lines.append(
            "| {target} | {rows} | {without_f1} | {with_f1} | {delta_f1} "
            "[{f1_low}, {f1_high}] | {delta_acc} [{acc_low}, {acc_high}] | "
            "{delta_brier} [{brier_low}, {brier_high}] | {p:.4g} |".format(
                target=row["target"],
                rows=row["paired_rows"],
                without_f1=_format_percent(row["without_macro_f1"]),
                with_f1=_format_percent(row["with_macro_f1"]),
                delta_f1=_format_percent(row["delta_macro_f1"], signed=True),
                f1_low=_format_percent(row["delta_macro_f1_ci_low"], signed=True),
                f1_high=_format_percent(row["delta_macro_f1_ci_high"], signed=True),
                delta_acc=_format_percent(row["delta_accuracy"], signed=True),
                acc_low=_format_percent(row["delta_accuracy_ci_low"], signed=True),
                acc_high=_format_percent(row["delta_accuracy_ci_high"], signed=True),
                delta_brier=f"{row['delta_brier_score']:+.4f}",
                brier_low=f"{row['delta_brier_score_ci_low']:+.4f}",
                brier_high=f"{row['delta_brier_score_ci_high']:+.4f}",
                p=row["mcnemar_exact_p"],
            )
        )
    lines.extend((
        "",
        "Positive deltas favor odds for accuracy and macro F1. Negative deltas favor odds for Brier score and log loss.",
        "Confidence intervals use a percentile bootstrap that resamples complete weekly folds, preserving within-fold dependence.",
        "The exact McNemar test is reported for paired correctness; Holm-adjusted exploratory p-values for every model are in `paired_model_comparison.csv`.",
        "Inference is based on 15 temporal blocks, so effect sizes and confidence intervals should lead the interpretation.",
        "",
    ))
    path.write_text("\n".join(lines), encoding="utf-8")


def export_paired_walk_forward_analysis(
    run_dir: Path,
    output_dir: Path,
    bootstrap_iterations: int = 10_000,
    bootstrap_seed: int = 42,
    primary_model: str = PRIMARY_MODEL,
) -> dict[str, Any]:
    if bootstrap_iterations < 100:
        raise ValueError("bootstrap iterations must be at least 100")
    run_dir = run_dir.resolve()
    output_dir = output_dir.resolve()
    run, summary, prediction_index, base_inputs = _load_paired_run(run_dir)
    paired_by_target, validation, prediction_inputs = _pair_prediction_rows(
        run_dir,
        run,
        prediction_index,
    )
    comparisons, fold_rows = _comparison_rows(
        paired_by_target,
        bootstrap_iterations,
        bootstrap_seed,
        primary_model,
    )
    summary_metric_checks = _validate_summary_metrics(comparisons, summary)
    comparisons.sort(key=lambda row: (row["target"], _model_sort_key(row["model"])))
    fold_rows.sort(key=lambda row: (
        row["target"],
        _model_sort_key(row["model"]),
        int(row["fold_index"]),
        VARIANTS.index(row["variant"]),
    ))
    primary_rows = [row for row in comparisons if row["primary_model"]]
    if {row["target"] for row in primary_rows} != set(paired_by_target):
        raise ValueError(f"Primary model {primary_model} is missing for at least one target")

    derived_manifest_path = Path(str(run.get("data_dir", ""))).parent / "derived_snapshot_manifest.json"
    derived_manifest = None
    if derived_manifest_path.is_file():
        derived_manifest = _read_json(derived_manifest_path)
        base_inputs.append(derived_manifest_path)

    output_dir.mkdir(parents=True, exist_ok=True)
    comparison_path = output_dir / "paired_model_comparison.csv"
    primary_path = output_dir / "paired_primary_comparison.csv"
    folds_path = output_dir / "paired_fold_metrics.csv"
    readme_path = output_dir / "README.md"
    manifest_path = output_dir / "paired_analysis_manifest.json"
    _write_csv(comparison_path, COMPARISON_FIELDS, comparisons)
    _write_csv(primary_path, COMPARISON_FIELDS, primary_rows)
    _write_csv(folds_path, FOLD_FIELDS, fold_rows)

    manifest = {
        "schema_version": 1,
        "source_run": run_dir.name,
        "plan_fingerprint": run.get("plan_fingerprint"),
        "protocol": run.get("protocol"),
        "method": {
            "primary_model": primary_model,
            "bootstrap": "percentile cluster bootstrap over complete weekly folds",
            "bootstrap_iterations": bootstrap_iterations,
            "bootstrap_seed": bootstrap_seed,
            "confidence_level": 0.95,
            "accuracy_test": "two-sided exact McNemar test",
            "multiplicity": "Holm correction across all target-model McNemar tests",
        },
        "validation": validation,
        "odds_backfill": {
            "source_snapshot_id": (
                derived_manifest.get("source_snapshot_id")
                if derived_manifest else None
            ),
            "coverage": derived_manifest.get("coverage") if derived_manifest else None,
            "unresolved_events": (
                (derived_manifest.get("events") or {}).get("unresolved")
                if derived_manifest else None
            ),
        },
        "inputs": [
            {
                "source": (
                    path.name
                    if path.parent == run_dir or path == derived_manifest_path
                    else path.relative_to(run_dir).as_posix()
                ),
                "sha256": _sha256(path),
            }
            for path in sorted(set([*base_inputs, *prediction_inputs]), key=str)
        ],
        "outputs": {
            "comparison_rows": len(comparisons),
            "primary_rows": len(primary_rows),
            "fold_metric_rows": len(fold_rows),
        },
    }
    manifest["validation"]["summary_metric_checks"] = summary_metric_checks
    _write_readme(readme_path, manifest, primary_rows)
    _write_json(manifest_path, manifest)
    output_paths = (
        comparison_path,
        primary_path,
        folds_path,
        readme_path,
        manifest_path,
    )
    (output_dir / "checksums.sha256").write_text(
        "\n".join(f"{_sha256(path)}  {path.name}" for path in output_paths) + "\n",
        encoding="utf-8",
    )
    return manifest
