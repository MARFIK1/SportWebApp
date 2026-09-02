import csv
import hashlib
import json
import re
from pathlib import Path
from typing import Any


EVALUATION_FIELDS = (
    "source_run",
    "variant",
    "target",
    "task",
    "feature_set",
    "total_rows",
    "train_rows",
    "test_rows",
    "feature_count",
    "selected_model",
    "selection_metric",
    "cv_score",
    "test_score",
    "test_best_model",
    "test_best_score",
    "baseline_score",
    "test_improvement_over_baseline",
    "gate_candidate",
    "gate_metric",
    "gate_baseline",
    "gate_candidate_score",
    "gate_improvement",
    "balanced_accuracy",
    "minimum_class_recall",
    "brier_score",
    "log_loss",
    "ece",
    "accepted_by_evaluation_gate",
    "rejection_reasons",
)

MODEL_FIELDS = (
    "source_run",
    "variant",
    "target",
    "task",
    "model",
    "cv_mean",
    "cv_std",
    "accuracy",
    "macro_f1",
    "balanced_accuracy",
    "precision",
    "recall",
    "f1",
    "brier_score",
    "log_loss",
    "ece",
    "mae",
    "rmse",
    "r2",
    "train_time_s",
    "predict_time_ms",
    "memory_mb",
    "model_size_kb",
)

PROMOTION_FIELDS = (
    "variant",
    "target",
    "release_id",
    "artifact_id",
    "accepted",
    "fallback",
    "final_source",
    "candidate",
    "feature_set",
    "reasons",
)


def _read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return payload


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _write_csv(path: Path, fields: tuple[str, ...], rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _source_run_name(source: Any) -> str:
    if source == "baseline":
        return "baseline"
    parts = [part for part in re.split(r"[\\/]", str(source)) if part]
    return parts[-3] if len(parts) >= 3 else "candidate"


def _gate_values(task: str, metrics: dict[str, Any]) -> tuple[str, Any, Any, Any]:
    if task == "regression":
        return (
            "mae",
            metrics.get("baseline_mae"),
            metrics.get("candidate_mae"),
            metrics.get("relative_mae_improvement"),
        )
    return (
        "macro_f1",
        metrics.get("baseline_macro_f1"),
        metrics.get("candidate_macro_f1"),
        metrics.get("macro_f1_improvement"),
    )


def _collect_run(
    run_dir: Path,
) -> tuple[
    dict[str, Any],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[tuple[str, Path]],
]:
    run_path = run_dir / "run.json"
    run = _read_json(run_path)
    variants = run.get("variants")
    if not isinstance(variants, list) or not variants:
        raise ValueError(f"Missing variants in {run_path}")

    provenance = {
        "run_id": run_dir.name,
        "schema_version": run.get("schema_version"),
        "created_at": run.get("created_at"),
        "variants": variants,
        "targets": run.get("targets"),
        "data_cutoff": run.get("data_cutoff"),
        "test_start_date": run.get("test_start_date"),
        "optuna_trials": run.get("optuna_trials"),
        "optuna_seed": run.get("optuna_seed"),
        "model_scope": run.get("model_scope"),
        "paired_common_sample": run.get("paired_common_sample"),
        "dataset": run.get("dataset"),
    }
    evaluation_rows: list[dict[str, Any]] = []
    model_rows: list[dict[str, Any]] = []
    input_records = [(f"{run_dir.name}/run.json", run_path)]

    for variant in variants:
        variant_dir = run_dir / str(variant)
        metrics_path = variant_dir / "training_metrics.json"
        acceptance_path = variant_dir / "acceptance.json"
        training = _read_json(metrics_path)
        acceptance = _read_json(acceptance_path)
        input_records.extend((
            (f"{run_dir.name}/{variant}/training_metrics.json", metrics_path),
            (f"{run_dir.name}/{variant}/acceptance.json", acceptance_path),
        ))
        targets = training.get("targets")
        if not isinstance(targets, dict):
            raise ValueError(f"Missing targets in {metrics_path}")
        acceptance_targets = acceptance.get("targets", {})

        for target in sorted(targets):
            target_data = targets[target]
            if not isinstance(target_data, dict):
                continue
            stats = target_data.get("stats", {})
            selection = stats.get("selection", {})
            gate = acceptance_targets.get(target, {})
            gate_metrics = gate.get("metrics", {})
            task = gate.get("task") or (
                "regression" if target_data.get("task") == "regression" else "classification"
            )
            gate_metric, gate_baseline, gate_candidate, gate_improvement = _gate_values(
                task,
                gate_metrics,
            )
            consensus_metrics = stats.get("decision_policy_test_evaluation", {}).get(
                "Consensus Policy",
                {},
            )
            evaluation_rows.append({
                "source_run": run_dir.name,
                "variant": variant,
                "target": target,
                "task": task,
                "feature_set": gate.get("feature_set") or stats.get("feature_set"),
                "total_rows": stats.get("total_matches"),
                "train_rows": stats.get("train_matches"),
                "test_rows": stats.get("test_matches"),
                "feature_count": stats.get("features"),
                "selected_model": selection.get("best_model"),
                "selection_metric": selection.get("validation_metric") or selection.get("metric"),
                "cv_score": selection.get("validation_score"),
                "test_score": selection.get("test_score"),
                "test_best_model": selection.get("test_best_model"),
                "test_best_score": selection.get("test_best_score"),
                "baseline_score": selection.get("baseline_score"),
                "test_improvement_over_baseline": selection.get("improvement_over_baseline"),
                "gate_candidate": gate.get("candidate"),
                "gate_metric": gate_metric,
                "gate_baseline": gate_baseline,
                "gate_candidate_score": gate_candidate,
                "gate_improvement": gate_improvement,
                "balanced_accuracy": gate_metrics.get("balanced_accuracy"),
                "minimum_class_recall": gate_metrics.get("minimum_class_recall"),
                "brier_score": gate_metrics.get("candidate_brier_score"),
                "log_loss": consensus_metrics.get("log_loss"),
                "ece": gate_metrics.get("candidate_ece"),
                "accepted_by_evaluation_gate": gate.get("accepted"),
                "rejection_reasons": "; ".join(gate.get("reasons", [])),
            })

            detailed = stats.get("detailed_metrics", {})
            cv_results = stats.get("cv_results", {})
            for model in sorted(detailed):
                values = detailed[model] or {}
                cv = cv_results.get(model, {}) or {}
                model_rows.append({
                    "source_run": run_dir.name,
                    "variant": variant,
                    "target": target,
                    "task": task,
                    "model": model,
                    "cv_mean": cv.get("mean"),
                    "cv_std": cv.get("std"),
                    **{field: values.get(field) for field in MODEL_FIELDS[7:]},
                })

    return provenance, evaluation_rows, model_rows, input_records


def _collect_promotions(
    accepted_dir: Path,
) -> tuple[list[dict[str, Any]], list[tuple[str, Path]]]:
    rows: list[dict[str, Any]] = []
    inputs: list[tuple[str, Path]] = []
    for variant in ("without_odds", "with_odds"):
        path = accepted_dir / f"{variant}.promotion.json"
        promotion = _read_json(path)
        pointer_path = accepted_dir / f"active_{variant}.json"
        model_name = (
            "universal_predictor_with_odds.pkl"
            if variant == "with_odds"
            else "universal_predictor.pkl"
        )
        manifest_path = accepted_dir / f"{model_name}.manifest.json"
        pointer = _read_json(pointer_path)
        _read_json(manifest_path)
        inputs.extend((
            (f"accepted/{path.name}", path),
            (f"accepted/{pointer_path.name}", pointer_path),
            (f"accepted/{manifest_path.name}", manifest_path),
        ))
        accepted = set(promotion.get("accepted_targets", []))
        fallback = set(promotion.get("fallback_targets", []))
        decisions = promotion.get("decisions", {})
        sources = promotion.get("source_by_target", {})
        targets = sorted(set(sources) | accepted | fallback)
        for target in targets:
            decision = decisions.get(target, {})
            reasons = decision.get("reasons", [])
            if not decision and target in fallback:
                reasons = ["no candidate evaluation"]
            rows.append({
                "variant": variant,
                "target": target,
                "release_id": pointer.get("release_id"),
                "artifact_id": pointer.get("artifact_id"),
                "accepted": target in accepted,
                "fallback": target in fallback,
                "final_source": _source_run_name(sources.get(target, "baseline")),
                "candidate": decision.get("candidate"),
                "feature_set": decision.get("feature_set"),
                "reasons": "; ".join(reasons),
            })
    return rows, inputs


def _format_metric(value: Any) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, float):
        return f"{value:.4f}"
    return str(value)


def _write_summary(
    path: Path,
    runs: list[dict[str, Any]],
    evaluation_rows: list[dict[str, Any]],
    promotion_rows: list[dict[str, Any]],
) -> None:
    primary = runs[0]
    run_ids = ", ".join(f"`{run['run_id']}`" for run in runs)
    lines = [
        "# Thesis evaluation results",
        "",
        f"- Data cutoff: `{primary.get('data_cutoff')}`",
        f"- Evaluation start: `{primary.get('test_start_date')}`",
        f"- Optuna seed: `{primary.get('optuna_seed')}`",
        f"- Primary model scope: `{primary.get('model_scope')}`",
        f"- Source runs: {run_ids}",
        "",
        "## Evaluation gates",
        "",
        "| Variant | Target | Candidate | Metric | Baseline | Candidate score | Improvement | Accepted |",
        "| --- | --- | --- | --- | ---: | ---: | ---: | :---: |",
    ]
    for row in evaluation_rows:
        lines.append(
            "| {variant} | {target} | {candidate} | {metric} | {baseline} | "
            "{score} | {improvement} | {accepted} |".format(
                variant=row["variant"],
                target=row["target"],
                candidate=row["gate_candidate"] or "",
                metric=row["gate_metric"],
                baseline=_format_metric(row["gate_baseline"]),
                score=_format_metric(row["gate_candidate_score"]),
                improvement=_format_metric(row["gate_improvement"]),
                accepted=_format_metric(row["accepted_by_evaluation_gate"]),
            )
        )

    lines.extend((
        "",
        "## Final promoted package",
        "",
        "| Variant | Target | Accepted | Fallback | Final source | Reason |",
        "| --- | --- | :---: | :---: | --- | --- |",
    ))
    for row in promotion_rows:
        lines.append(
            "| {variant} | {target} | {accepted} | {fallback} | {source} | {reason} |".format(
                variant=row["variant"],
                target=row["target"],
                accepted=_format_metric(row["accepted"]),
                fallback=_format_metric(row["fallback"]),
                source=row["final_source"],
                reason=row["reasons"],
            )
        )
    lines.extend((
        "",
        "The evaluation gate is an offline comparison against the statistical baseline.",
        "The final package keeps the historical cutoff-safe model for every rejected target.",
        "",
    ))
    path.write_text("\n".join(lines), encoding="utf-8")


def export_thesis_results(
    primary_run: Path,
    accepted_dir: Path,
    output_dir: Path,
    supplemental_runs: list[Path] | None = None,
) -> dict[str, Any]:
    run_dirs = [primary_run.resolve(), *(path.resolve() for path in supplemental_runs or [])]
    accepted_dir = accepted_dir.resolve()
    output_dir = output_dir.resolve()

    runs: list[dict[str, Any]] = []
    evaluation_rows: list[dict[str, Any]] = []
    model_rows: list[dict[str, Any]] = []
    input_records: list[tuple[str, Path]] = []
    seen_targets: set[tuple[str, str]] = set()
    expected_window: tuple[Any, Any] | None = None

    for run_dir in run_dirs:
        provenance, run_evaluations, run_models, run_inputs = _collect_run(run_dir)
        window = (provenance.get("data_cutoff"), provenance.get("test_start_date"))
        if expected_window is None:
            expected_window = window
        elif window != expected_window:
            raise ValueError(
                f"Run {run_dir.name} uses window {window}, expected {expected_window}"
            )
        for row in run_evaluations:
            key = (str(row["variant"]), str(row["target"]))
            if key in seen_targets:
                raise ValueError(f"Duplicate evaluation result for {key[0]}/{key[1]}")
            seen_targets.add(key)
        runs.append(provenance)
        evaluation_rows.extend(run_evaluations)
        model_rows.extend(run_models)
        input_records.extend(run_inputs)

    promotion_rows, promotion_inputs = _collect_promotions(accepted_dir)
    input_records.extend(promotion_inputs)
    evaluation_rows.sort(key=lambda row: (str(row["variant"]), str(row["target"])))
    model_rows.sort(
        key=lambda row: (str(row["variant"]), str(row["target"]), str(row["model"]))
    )
    promotion_rows.sort(key=lambda row: (str(row["variant"]), str(row["target"])))

    output_dir.mkdir(parents=True, exist_ok=True)
    evaluation_path = output_dir / "evaluation_summary.csv"
    models_path = output_dir / "model_metrics.csv"
    promotions_path = output_dir / "promotion_summary.csv"
    summary_path = output_dir / "README.md"
    _write_csv(evaluation_path, EVALUATION_FIELDS, evaluation_rows)
    _write_csv(models_path, MODEL_FIELDS, model_rows)
    _write_csv(promotions_path, PROMOTION_FIELDS, promotion_rows)
    _write_summary(summary_path, runs, evaluation_rows, promotion_rows)

    manifest = {
        "schema_version": 1,
        "data_cutoff": expected_window[0] if expected_window else None,
        "test_start_date": expected_window[1] if expected_window else None,
        "runs": runs,
        "inputs": [
            {"source": source, "sha256": _sha256(path)}
            for source, path in sorted(input_records, key=lambda item: item[0])
        ],
        "outputs": {
            "evaluation_rows": len(evaluation_rows),
            "model_rows": len(model_rows),
            "promotion_rows": len(promotion_rows),
        },
    }
    manifest_path = output_dir / "results_manifest.json"
    _write_json(manifest_path, manifest)

    output_paths = sorted(
        (evaluation_path, models_path, promotions_path, summary_path, manifest_path),
        key=lambda item: item.name,
    )
    checksum_lines = [
        f"{_sha256(path)}  {path.name}"
        for path in output_paths
    ]
    (output_dir / "checksums.sha256").write_text(
        "\n".join(checksum_lines) + "\n",
        encoding="utf-8",
    )
    return manifest
