import argparse
import csv
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from sofascore.predictor import (
    MODEL_SCOPES,
    TARGET_CONFIGS,
    THESIS_CORE_CLASSIFICATION_MODELS,
)
from sofascore.training_window import parse_iso_date
from sofascore.walk_forward import (
    aggregate_walk_forward_metrics,
    build_weekly_folds,
)
from train_models import ALL_TARGETS, VARIANT_CONFIG, _variant_names, parse_targets


MANIFEST_SCHEMA_VERSION = 1
DEFAULT_START_DATE = "2026-04-01"
DEFAULT_END_DATE = "2026-07-19"
ALL_CLASSIFICATION_MODELS = THESIS_CORE_CLASSIFICATION_MODELS | {
    "KNN",
    "Ensemble",
    "Stacking",
    "LSTM",
}
REGRESSION_MODELS = {
    "Random Forest",
    "Gradient Boosting",
    "XGBoost",
    "LightGBM",
}
PAIRED_VARIANTS = {
    "without_odds": "with_odds",
    "with_odds": "without_odds",
    "without_odds_lineup": "with_odds_lineup",
    "with_odds_lineup": "without_odds_lineup",
}


def parse_non_negative_int(value: str):
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be zero or greater")
    return parsed


def parse_positive_int(value: str):
    parsed = parse_non_negative_int(value)
    if parsed == 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Run a leakage-safe weekly walk-forward evaluation with expanding "
            "training windows."
        ),
    )
    parser.add_argument("--data-dir", type=Path, default=SCRIPT_DIR / "data")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--start-date", default=DEFAULT_START_DATE)
    parser.add_argument("--end-date", default=DEFAULT_END_DATE)
    parser.add_argument(
        "--variant",
        choices=(*VARIANT_CONFIG, "both", "lineup_both"),
        default="both",
    )
    parser.add_argument("--targets", type=parse_targets, default=list(ALL_TARGETS))
    parser.add_argument("--model-scope", choices=MODEL_SCOPES, default="all")
    parser.add_argument("--optuna-seed", type=parse_non_negative_int, default=42)
    parser.add_argument(
        "--first-fold-optuna-trials",
        type=parse_non_negative_int,
        default=50,
        help=(
            "Tune once using only the pre-window training data, then freeze the "
            "resulting profile for every later fold."
        ),
    )
    parser.add_argument(
        "--independent-samples",
        action="store_true",
        help="Do not constrain odds/no-odds variants to paired target cohorts.",
    )
    parser.add_argument(
        "--save-models",
        action="store_true",
        help=(
            "Serialize every fold model. Disabled by default because a complete "
            "two-variant run can require tens of gigabytes."
        ),
    )
    parser.add_argument(
        "--max-folds",
        type=parse_positive_int,
        help="Execute only the first N folds per variant; useful for a smoke run.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rerun completed jobs for the same immutable plan.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the immutable plan and commands without writing artifacts.",
    )
    return parser.parse_args()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _atomic_write_json(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary_path, path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise


def _plan_fingerprint(protocol: dict, jobs: list[dict]) -> str:
    stable_jobs = [
        {
            "id": job["id"],
            "variant": job["variant"],
            "fold": job["fold"],
        }
        for job in jobs
    ]
    encoded = json.dumps(
        {"protocol": protocol, "jobs": stable_jobs},
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _job_paths(output_dir: Path, variant: str, fold_slug: str) -> dict:
    job_dir = output_dir / "folds" / variant / fold_slug
    variant_dir = job_dir / variant
    return {
        "job_dir": job_dir,
        "metrics": variant_dir / "training_metrics.json",
        "hyperparameters": variant_dir / "hyperparameters.json",
        "run": job_dir / "run.json",
        "model": variant_dir / VARIANT_CONFIG[variant]["filename"],
    }


def build_training_command(
    data_dir: Path,
    job_dir: Path,
    variant: str,
    targets: list[str],
    fold,
    model_scope: str,
    optuna_seed: int,
    optuna_trials: int,
    hyperparameter_profile: Path | None,
    paired_common_sample: bool,
    save_models: bool,
) -> list[str]:
    command = [
        sys.executable,
        str(SCRIPT_DIR / "train_models.py"),
        "--data-dir",
        str(data_dir),
        "--output-dir",
        str(job_dir),
        "--variant",
        variant,
        "--targets",
        ",".join(targets),
        "--data-cutoff",
        fold.test_end.isoformat(),
        "--test-start-date",
        fold.test_start.isoformat(),
        "--model-scope",
        model_scope,
        "--optuna-seed",
        str(optuna_seed),
        "--optuna-trials",
        str(0 if hyperparameter_profile is not None else optuna_trials),
        "--skip-production-benchmark",
    ]
    if hyperparameter_profile is not None:
        command.extend(["--hyperparameters-from", str(hyperparameter_profile)])
    if paired_common_sample:
        command.append("--paired-common-sample")
    if save_models:
        command.append("--save-models")
    return command


def _write_metrics_csv(summary: dict, path: Path):
    rows = []
    for variant, variant_payload in summary.get("variants", {}).items():
        for target, target_payload in variant_payload.get("targets", {}).items():
            task = target_payload.get("task")
            for model, metrics in target_payload.get("models", {}).items():
                rows.append({
                    "variant": variant,
                    "target": target,
                    "task": task,
                    "model": model,
                    "fold_count": metrics.get("fold_count"),
                    "test_rows": metrics.get("test_rows"),
                    "accuracy": metrics.get("accuracy"),
                    "macro_f1": metrics.get("macro_f1"),
                    "balanced_accuracy": metrics.get("balanced_accuracy"),
                    "brier_score": metrics.get("brier_score"),
                    "log_loss": metrics.get("log_loss"),
                    "ece_fold_weighted": metrics.get("ece_fold_weighted"),
                    "mae": metrics.get("mae"),
                    "rmse": metrics.get("rmse"),
                    "r2_fold_weighted": metrics.get("r2_fold_weighted"),
                })
    fieldnames = [
        "variant",
        "target",
        "task",
        "model",
        "fold_count",
        "test_rows",
        "accuracy",
        "macro_f1",
        "balanced_accuracy",
        "brier_score",
        "log_loss",
        "ece_fold_weighted",
        "mae",
        "rmse",
        "r2_fold_weighted",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        with temporary_path.open("w", encoding="utf-8", newline="") as target:
            writer = csv.DictWriter(target, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        os.replace(temporary_path, path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise


def _load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _completed_job(paths: dict, save_models: bool) -> bool:
    required = [paths["run"], paths["metrics"]]
    if save_models:
        required.append(paths["model"])
    return all(path.exists() for path in required)


def validate_fold_metrics(
    payload: dict,
    targets: list[str],
    model_scope: str,
    fold,
    expected_hyperparameter_policy: str,
) -> list[str]:
    errors = []
    target_payloads = payload.get("targets", {})
    expected_classification_models = (
        set(THESIS_CORE_CLASSIFICATION_MODELS)
        if model_scope == "thesis_core"
        else set(ALL_CLASSIFICATION_MODELS)
    )
    for target in targets:
        target_payload = target_payloads.get(target)
        if not isinstance(target_payload, dict):
            errors.append(f"missing metrics for target {target}")
            continue
        stats = target_payload.get("stats", {})
        task = TARGET_CONFIGS[target].get("task")
        expected_models = (
            REGRESSION_MODELS
            if task == "regression"
            else expected_classification_models
        )
        trained_models = set(stats.get("trained_models", []))
        missing_models = sorted(expected_models - trained_models)
        if missing_models:
            errors.append(
                f"{target}: missing trained models: {', '.join(missing_models)}"
            )

        validation = stats.get("validation", {})
        if validation.get("strategy") != "fixed_temporal_window":
            errors.append(f"{target}: validation is not a fixed temporal window")
        if stats.get("selection", {}).get("source") != "temporal_cross_validation":
            errors.append(f"{target}: model selection did not use temporal CV")

        date_ranges = stats.get("date_ranges", {})
        test_range = date_ranges.get("test", {})
        train_range = (
            date_ranges.get("deployment_train", {})
            if task != "regression"
            else date_ranges.get("train", {})
        )
        test_min = test_range.get("min")
        test_max = test_range.get("max")
        train_max = train_range.get("max")
        if not test_min or test_min < fold.test_start.isoformat():
            errors.append(f"{target}: test rows begin before the fold")
        if not test_max or test_max > fold.test_end.isoformat():
            errors.append(f"{target}: test rows end after the fold")
        if not train_max or train_max > fold.train_end.isoformat():
            errors.append(f"{target}: training rows cross the release cutoff")

        if task != "regression":
            deployment_refit = stats.get("deployment_refit", {})
            if deployment_refit.get("status") != "completed":
                errors.append(f"{target}: deployment refit is incomplete")
            if deployment_refit.get("test_excluded") is not True:
                errors.append(f"{target}: deployment refit did not exclude test rows")
            deployment_models = deployment_refit.get("models", {})
            missing_deployment_metrics = sorted(
                model
                for model in expected_classification_models
                if not isinstance(
                    deployment_models.get(model, {}).get("test_metrics"),
                    dict,
                )
            )
            if missing_deployment_metrics:
                errors.append(
                    f"{target}: missing deployment test metrics: "
                    f"{', '.join(missing_deployment_metrics)}"
                )
            deployment_consensus = deployment_refit.get("consensus", {})
            missing_consensus = sorted(
                name
                for name in ("Consensus Argmax", "Consensus Policy")
                if not isinstance(deployment_consensus.get(name), dict)
            )
            if missing_consensus:
                errors.append(
                    f"{target}: missing deployment consensus metrics: "
                    f"{', '.join(missing_consensus)}"
                )
            policy = stats.get("hyperparameters", {}).get("policy")
            if policy != expected_hyperparameter_policy:
                errors.append(
                    f"{target}: expected hyperparameter policy "
                    f"{expected_hyperparameter_policy}, got {policy}"
                )
    return errors


def _aggregate_completed_jobs(manifest: dict, output_dir: Path):
    entries = []
    for job in manifest["jobs"]:
        if job.get("status") != "completed":
            continue
        metrics_path = output_dir / job["artifacts"]["metrics"]
        if not metrics_path.exists():
            continue
        entries.append({
            "variant": job["variant"],
            "fold": job["fold"],
            "metrics": _load_json(metrics_path),
        })
    summary = aggregate_walk_forward_metrics(entries)
    summary["generated_at"] = _utc_now()
    summary["plan_fingerprint"] = manifest["plan_fingerprint"]
    summary["complete"] = all(
        job.get("status") == "completed" for job in manifest["jobs"]
    )
    _atomic_write_json(output_dir / "walk_forward_summary.json", summary)
    _write_metrics_csv(summary, output_dir / "walk_forward_metrics.csv")


def validate_paired_job(
    manifest: dict,
    output_dir: Path,
    job: dict,
    targets: list[str],
) -> list[str]:
    paired_variant = PAIRED_VARIANTS.get(job["variant"])
    if not paired_variant:
        return []
    counterpart = next(
        (
            candidate
            for candidate in manifest["jobs"]
            if candidate["variant"] == paired_variant
            and candidate["fold"]["release_id"] == job["fold"]["release_id"]
            and candidate.get("status") == "completed"
        ),
        None,
    )
    if counterpart is None:
        return []

    current_metrics = _load_json(output_dir / job["artifacts"]["metrics"])
    counterpart_metrics = _load_json(
        output_dir / counterpart["artifacts"]["metrics"]
    )
    errors = []
    for target in targets:
        current_stats = (
            current_metrics.get("targets", {}).get(target, {}).get("stats", {})
        )
        counterpart_stats = (
            counterpart_metrics.get("targets", {}).get(target, {}).get("stats", {})
        )
        current_fingerprint = current_stats.get("validation_fingerprint")
        counterpart_fingerprint = counterpart_stats.get("validation_fingerprint")
        if not current_fingerprint or not counterpart_fingerprint:
            errors.append(f"{target}: paired holdout fingerprint is missing")
        elif current_fingerprint != counterpart_fingerprint:
            errors.append(f"{target}: paired variants use different holdout rows")
    return errors


def main():
    args = parse_args()
    try:
        start_date = parse_iso_date(args.start_date, "walk-forward start date")
        end_date = parse_iso_date(args.end_date, "walk-forward end date")
        folds = build_weekly_folds(start_date, end_date)
    except ValueError as exc:
        print(f"Invalid walk-forward window: {exc}")
        return 2

    data_dir = args.data_dir.resolve()
    output_dir = args.output_dir.resolve()
    variants = _variant_names(args.variant)
    paired_common_sample = not args.independent_samples
    save_models = args.save_models
    classification_targets = [
        target
        for target in args.targets
        if TARGET_CONFIGS[target].get("task") != "regression"
    ]

    protocol = {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "schedule": "calendar_weeks_ending_sunday",
        "training_window": "expanding",
        "release_rule": "train_through_previous_day",
        "hyperparameter_policy": "tune_on_first_pre_holdout_window_then_freeze",
        "first_fold_optuna_trials": args.first_fold_optuna_trials,
        "optuna_seed": args.optuna_seed,
        "variants": variants,
        "targets": args.targets,
        "model_scope": args.model_scope,
        "paired_common_sample": paired_common_sample,
        "save_models": save_models,
    }
    jobs = []
    for variant in variants:
        for fold in folds:
            paths = _job_paths(output_dir, variant, fold.slug)
            jobs.append({
                "id": f"{variant}:{fold.release_id}",
                "variant": variant,
                "fold": fold.as_dict(),
                "artifacts": {
                    "run": str(paths["run"].relative_to(output_dir)),
                    "metrics": str(paths["metrics"].relative_to(output_dir)),
                    "hyperparameters": str(
                        paths["hyperparameters"].relative_to(output_dir)
                    ),
                    "model": str(paths["model"].relative_to(output_dir)),
                },
                "status": "pending",
            })
    fingerprint = _plan_fingerprint(protocol, jobs)

    print(
        f"Walk-forward plan: {len(folds)} folds x {len(variants)} variants "
        f"= {len(jobs)} jobs",
        flush=True,
    )
    print(
        f"Evaluation window: {start_date.isoformat()}..{end_date.isoformat()} "
        f"(first train cutoff: {folds[0].train_end.isoformat()})"
    )
    print(
        "Hyperparameters: tuned on fold 1 pre-holdout data, then frozen",
        flush=True,
    )

    if args.dry_run:
        for variant in variants:
            first_profile = _job_paths(
                output_dir,
                variant,
                folds[0].slug,
            )["hyperparameters"]
            for fold in folds:
                if args.max_folds and fold.index > args.max_folds:
                    continue
                paths = _job_paths(output_dir, variant, fold.slug)
                profile = (
                    first_profile
                    if classification_targets and fold.index > 1
                    else None
                )
                command = build_training_command(
                    data_dir,
                    paths["job_dir"],
                    variant,
                    args.targets,
                    fold,
                    args.model_scope,
                    args.optuna_seed,
                    args.first_fold_optuna_trials,
                    profile,
                    paired_common_sample,
                    save_models,
                )
                print(subprocess.list2cmdline(command))
        return 0

    manifest_path = output_dir / "walk_forward_run.json"
    existing_manifest = None
    if manifest_path.exists():
        try:
            existing_manifest = _load_json(manifest_path)
        except (OSError, json.JSONDecodeError) as exc:
            print(f"Cannot resume invalid manifest {manifest_path}: {exc}")
            return 2
        if existing_manifest.get("plan_fingerprint") != fingerprint:
            print(
                "Output directory belongs to a different walk-forward plan. "
                "Use a new --output-dir."
            )
            return 2

    previous_jobs = {
        job["id"]: job
        for job in (existing_manifest or {}).get("jobs", [])
    }
    for job in jobs:
        previous = previous_jobs.get(job["id"], {})
        if previous.get("status") == "completed":
            job.update(previous)

    manifest = {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "created_at": (
            existing_manifest.get("created_at")
            if existing_manifest
            else _utc_now()
        ),
        "updated_at": _utc_now(),
        "plan_fingerprint": fingerprint,
        "protocol": protocol,
        "data_dir": str(data_dir),
        "output_dir": str(output_dir),
        "jobs": jobs,
    }
    _atomic_write_json(manifest_path, manifest)

    jobs_by_id = {job["id"]: job for job in manifest["jobs"]}
    for variant in variants:
        first_paths = _job_paths(output_dir, variant, folds[0].slug)
        frozen_profile = first_paths["hyperparameters"]
        for fold in folds:
            if args.max_folds and fold.index > args.max_folds:
                continue
            paths = _job_paths(output_dir, variant, fold.slug)
            job = jobs_by_id[f"{variant}:{fold.release_id}"]

            if (
                not args.force
                and job.get("status") == "completed"
                and _completed_job(paths, save_models)
            ):
                existing_errors = validate_fold_metrics(
                    _load_json(paths["metrics"]),
                    args.targets,
                    args.model_scope,
                    fold,
                    (
                        "frozen_profile"
                        if classification_targets and fold.index > 1
                        else (
                            "optuna_pre_holdout"
                            if classification_targets
                            and args.first_fold_optuna_trials > 0
                            else "defaults"
                        )
                    ),
                )
                if not existing_errors:
                    print(f"[SKIP] {job['id']} already completed")
                    continue
                print(
                    f"[WARN] {job['id']} has incomplete artifacts and will be rerun: "
                    f"{'; '.join(existing_errors)}"
                )

            if classification_targets and fold.index > 1 and not frozen_profile.exists():
                print(
                    f"Cannot run {job['id']}: first-fold hyperparameter profile "
                    f"is missing at {frozen_profile}"
                )
                job["status"] = "blocked"
                job["error"] = "missing first-fold hyperparameter profile"
                manifest["updated_at"] = _utc_now()
                _atomic_write_json(manifest_path, manifest)
                return 3

            profile = (
                frozen_profile
                if classification_targets and fold.index > 1
                else None
            )
            command = build_training_command(
                data_dir,
                paths["job_dir"],
                variant,
                args.targets,
                fold,
                args.model_scope,
                args.optuna_seed,
                args.first_fold_optuna_trials,
                profile,
                paired_common_sample,
                save_models,
            )
            print(f"\n[RUN] {job['id']}", flush=True)
            print(subprocess.list2cmdline(command), flush=True)
            job.update({
                "status": "running",
                "started_at": _utc_now(),
                "command": command,
            })
            job.pop("error", None)
            manifest["updated_at"] = _utc_now()
            _atomic_write_json(manifest_path, manifest)

            completed = subprocess.run(
                command,
                cwd=str(SCRIPT_DIR),
                check=False,
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
            )
            if completed.returncode != 0:
                job.update({
                    "status": "failed",
                    "finished_at": _utc_now(),
                    "return_code": completed.returncode,
                    "error": "training command failed",
                })
                manifest["updated_at"] = _utc_now()
                _atomic_write_json(manifest_path, manifest)
                _aggregate_completed_jobs(manifest, output_dir)
                return completed.returncode or 4

            if not _completed_job(paths, save_models):
                job.update({
                    "status": "failed",
                    "finished_at": _utc_now(),
                    "return_code": 0,
                    "error": "training finished without all expected artifacts",
                })
                manifest["updated_at"] = _utc_now()
                _atomic_write_json(manifest_path, manifest)
                _aggregate_completed_jobs(manifest, output_dir)
                return 4
            validation_errors = validate_fold_metrics(
                _load_json(paths["metrics"]),
                args.targets,
                args.model_scope,
                fold,
                (
                    "frozen_profile"
                    if classification_targets and fold.index > 1
                    else (
                        "optuna_pre_holdout"
                        if classification_targets
                        and args.first_fold_optuna_trials > 0
                        else "defaults"
                    )
                ),
            )
            if validation_errors:
                job.update({
                    "status": "failed",
                    "finished_at": _utc_now(),
                    "return_code": 0,
                    "error": "fold quality gate failed",
                    "validation_errors": validation_errors,
                })
                manifest["updated_at"] = _utc_now()
                _atomic_write_json(manifest_path, manifest)
                _aggregate_completed_jobs(manifest, output_dir)
                print("Fold quality gate failed:")
                for error in validation_errors:
                    print(f"  - {error}")
                return 4
            if classification_targets and fold.index == 1 and not frozen_profile.exists():
                job.update({
                    "status": "failed",
                    "finished_at": _utc_now(),
                    "return_code": 0,
                    "error": "first fold did not export a hyperparameter profile",
                })
                manifest["updated_at"] = _utc_now()
                _atomic_write_json(manifest_path, manifest)
                _aggregate_completed_jobs(manifest, output_dir)
                return 4

            job.update({
                "status": "completed",
                "finished_at": _utc_now(),
                "return_code": 0,
            })
            job.pop("validation_errors", None)
            if paired_common_sample:
                paired_errors = validate_paired_job(
                    manifest,
                    output_dir,
                    job,
                    args.targets,
                )
                if paired_errors:
                    job.update({
                        "status": "failed",
                        "error": "paired-cohort quality gate failed",
                        "validation_errors": paired_errors,
                    })
                    manifest["updated_at"] = _utc_now()
                    _atomic_write_json(manifest_path, manifest)
                    _aggregate_completed_jobs(manifest, output_dir)
                    print("Paired-cohort quality gate failed:")
                    for error in paired_errors:
                        print(f"  - {error}")
                    return 4
            manifest["updated_at"] = _utc_now()
            _atomic_write_json(manifest_path, manifest)

    _aggregate_completed_jobs(manifest, output_dir)
    completed_count = sum(
        job.get("status") == "completed" for job in manifest["jobs"]
    )
    print(
        f"\nWalk-forward artifacts: {completed_count}/{len(manifest['jobs'])} jobs "
        f"completed in {output_dir}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
