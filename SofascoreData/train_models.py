import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from sofascore.config import COMPETITIONS
from sofascore.dataset_audit import audit_feature_datasets
from sofascore.dataset_builder import DATASET_BUILDER_VERSION
from sofascore.model_acceptance import build_acceptance_report, write_acceptance_report
from sofascore.model_release import resolve_active_artifact
from sofascore.predictor import (
    COMPETITION_TYPES,
    FEATURE_SETS,
    MODEL_SCOPES,
    TARGET_CONFIGS,
    UniversalPredictor,
)
from sofascore.training_report import build_training_comparison, write_training_comparison
from sofascore.paired_benchmark import (
    BASE_ODDS_REQUIREMENTS,
    ODDS_REQUIREMENTS_BY_TARGET,
    build_common_odds_sample,
)
from sofascore.training_window import (
    filter_dataframe_to_cutoff,
    parse_iso_date,
    validate_training_window,
)


ALL_TARGETS = tuple(TARGET_CONFIGS)
DEFAULT_TARGETS = ("result",)
VARIANT_CONFIG = {
    "without_odds": {
        "feature_set": "pre_match_safe",
        "filename": "universal_predictor.pkl",
        "odds_used": False,
        "reference_variant": "without_odds",
    },
    "with_odds": {
        "feature_set": "odds_available",
        "filename": "universal_predictor_with_odds.pkl",
        "odds_used": True,
        "reference_variant": "with_odds",
    },
    "without_odds_lineup": {
        "feature_set": "lineup_available",
        "filename": "universal_predictor_lineup.pkl",
        "odds_used": False,
        "reference_variant": "without_odds",
    },
    "with_odds_lineup": {
        "feature_set": "lineup_with_odds",
        "filename": "universal_predictor_with_odds_lineup.pkl",
        "odds_used": True,
        "reference_variant": "with_odds",
    },
}
LINEUP_VARIANTS = {"without_odds_lineup", "with_odds_lineup"}


def parse_targets(value: str):
    if value.strip().lower() == "all":
        return list(ALL_TARGETS)
    targets = [target.strip() for target in value.split(",") if target.strip()]
    unknown = sorted(set(targets) - set(ALL_TARGETS))
    if unknown:
        raise argparse.ArgumentTypeError(f"unknown targets: {', '.join(unknown)}")
    if not targets:
        raise argparse.ArgumentTypeError("at least one target is required")
    return targets


def parse_non_negative_int(value: str):
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be zero or greater")
    return parsed


def parse_date(value: str):
    try:
        return parse_iso_date(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(str(exc)) from exc


def parse_args():
    parser = argparse.ArgumentParser(
        description="Train Backend v2 football models with temporal validation.",
    )
    parser.add_argument("--data-dir", type=Path, default=SCRIPT_DIR / "data")
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument(
        "--variant",
        choices=(*VARIANT_CONFIG, "both", "lineup_both"),
        default="without_odds",
    )
    parser.add_argument("--targets", type=parse_targets, default=list(DEFAULT_TARGETS))
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument(
        "--data-cutoff",
        type=parse_date,
        help="Include only matches on or before this YYYY-MM-DD date.",
    )
    parser.add_argument(
        "--test-start-date",
        type=parse_date,
        help=(
            "Use matches before this YYYY-MM-DD date for training and matches "
            "from this date onward for the untouched temporal test window."
        ),
    )
    parser.add_argument("--optuna-trials", type=parse_non_negative_int, default=50)
    parser.add_argument(
        "--optuna-seed",
        type=parse_non_negative_int,
        default=42,
        help="Seed used by the Optuna samplers (default: 42).",
    )
    parser.add_argument(
        "--model-scope",
        choices=MODEL_SCOPES,
        default="all",
        help=(
            "Select trained estimators. thesis_core keeps Logistic Regression, "
            "Random Forest, MLP, XGBoost and LightGBM and excludes experimental "
            "KNN, Ensemble, Stacking and LSTM models."
        ),
    )
    parser.add_argument(
        "--feature-set",
        choices=tuple(sorted(FEATURE_SETS)),
        default=None,
        help="Override the feature set selected by the model variant.",
    )
    parser.add_argument("--allow-auto-features", action="store_true")
    parser.add_argument("--allow-legacy-features", action="store_true")
    parser.add_argument("--audit-only", action="store_true")
    parser.add_argument("--save-models", action="store_true")
    parser.add_argument(
        "--paired-common-sample",
        action="store_true",
        help=(
            "Train variants on identical per-target cohorts with complete matching odds. "
            "Targets without matching odds use the full common cohort."
        ),
    )
    parser.add_argument(
        "--skip-production-benchmark",
        action="store_true",
        help="Allow bootstrap training without comparing candidates to active production.",
    )
    return parser.parse_args()


def _load_manifest(path: Path):
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as source:
        return json.load(source)


def _variant_names(value: str):
    if value == "both":
        return ["without_odds", "with_odds"]
    if value == "lineup_both":
        return ["without_odds_lineup", "with_odds_lineup"]
    return [value]


def _model_filename(variant: str) -> str:
    return VARIANT_CONFIG[variant]["filename"]


def _load_production_reference(data_dir: Path, variant: str):
    reference_variant = VARIANT_CONFIG[variant]["reference_variant"]
    models_dir = data_dir / "models"
    artifact_path = resolve_active_artifact(
        models_dir,
        reference_variant,
        _model_filename(reference_variant),
    )
    if not artifact_path.exists():
        return None, artifact_path
    predictor = UniversalPredictor(str(data_dir))
    predictor.load_models(str(artifact_path))
    return predictor, artifact_path


def _filter_confirmed_lineup_rows(dataframe, variant: str):
    if variant not in LINEUP_VARIANTS:
        return dataframe, None
    marker = "confirmed_lineup_available"
    if marker not in dataframe.columns:
        raise ValueError(
            "Feature datasets do not contain confirmed lineup availability. "
            "Run regenerate_all_features.py --force."
        )
    filtered = dataframe[dataframe[marker].fillna(0).astype(float) >= 1].copy()
    metadata = {
        "rows_before": len(dataframe),
        "rows": len(filtered),
        "rows_removed": len(dataframe) - len(filtered),
        "coverage": len(filtered) / len(dataframe) if len(dataframe) else 0.0,
    }
    if filtered.empty:
        raise ValueError("No samples with complete confirmed starting lineups were found.")
    return filtered, metadata


def _build_paired_training_sample(dataframe, variant: str, target: str = "result"):
    lineup_sample = None
    if variant == "lineup_both" or variant in LINEUP_VARIANTS:
        lineup_variant = (
            "without_odds_lineup" if variant == "lineup_both" else variant
        )
        dataframe, lineup_sample = _filter_confirmed_lineup_rows(
            dataframe,
            lineup_variant,
        )

    required_columns = ODDS_REQUIREMENTS_BY_TARGET.get(
        target,
        BASE_ODDS_REQUIREMENTS,
    )
    dataframe, sample_metadata = build_common_odds_sample(
        dataframe,
        required_columns=required_columns,
    )
    if lineup_sample:
        sample_metadata = {
            **sample_metadata,
            "policy": "confirmed_lineup_and_common_odds",
            "lineup_sample": lineup_sample,
        }
    return dataframe, sample_metadata, lineup_sample


def _dataset_summary(df, audit: dict, sample_metadata: dict, data_window: dict):
    dates = df.get("date")
    valid_dates = dates.dropna().astype(str) if dates is not None else []
    summary = {
        "rows": len(df),
        "date_min": min(valid_dates) if len(valid_dates) else None,
        "date_max": max(valid_dates) if len(valid_dates) else None,
        "competitions": int(df["competition"].nunique()) if "competition" in df else None,
        "feature_dataset_count": audit.get("dataset_count"),
        "feature_dataset_samples": audit.get("total_samples"),
        "dataset_builder_version": audit.get("expected_builder_version"),
    }
    summary["sample"] = sample_metadata
    summary["data_window"] = data_window
    return summary


def _print_audit(audit: dict):
    print(
        f"Feature datasets: {audit['dataset_count']}, "
        f"samples: {audit['total_samples']}, versions: {', '.join(audit['versions'])}"
    )
    if audit["valid"]:
        print(f"Dataset audit: OK (builder v{audit['expected_builder_version']})")
        return
    print(f"Dataset audit: FAILED ({len(audit['issues'])} issue(s))")
    for issue in audit["issues"][:20]:
        print(
            f"  {issue['comp_type']}/{issue['country']}/{issue['competition']}: "
            f"{issue['status']} (version={issue.get('builder_version')})"
        )


def main():
    args = parse_args()
    try:
        data_cutoff, test_start_date = validate_training_window(
            args.data_cutoff,
            args.test_start_date,
        )
    except ValueError as exc:
        print(f"Invalid training window: {exc}")
        return 2
    data_dir = args.data_dir.resolve()
    audit = audit_feature_datasets(
        data_dir,
        DATASET_BUILDER_VERSION,
        COMPETITION_TYPES,
        COMPETITIONS,
    )
    _print_audit(audit)

    if args.audit_only:
        return 0 if audit["valid"] else 2
    if not audit["valid"] and not args.allow_legacy_features:
        print("Run regenerate_all_features.py --force before Backend v2 training.")
        return 2

    if args.allow_auto_features:
        os.environ["SOFASCORE_ALLOW_AUTO_FEATURES"] = "1"
    else:
        os.environ.pop("SOFASCORE_ALLOW_AUTO_FEATURES", None)

    loader = UniversalPredictor(str(data_dir))
    dataframe = loader.load_all_data()
    if dataframe.empty:
        print("No finished feature rows found.")
        return 3
    try:
        dataframe, data_window = filter_dataframe_to_cutoff(
            dataframe,
            data_cutoff,
        )
    except ValueError as exc:
        print(f"Training window failed: {exc}")
        return 3
    if data_cutoff:
        print(
            "Data cutoff: "
            f"{data_window['date_min']}..{data_window['date_max']} "
            f"({data_window['rows']} rows, "
            f"{data_window['rows_removed_after_cutoff']} removed)"
        )
    if test_start_date:
        print(f"Fixed temporal test window starts: {test_start_date.isoformat()}")

    sample_metadata = {
        "policy": (
            "target_specific_common_odds"
            if args.paired_common_sample
            else "variant_specific"
        ),
        "rows_before": len(dataframe),
        "rows": len(dataframe),
        "rows_removed": 0,
        "coverage": 1.0,
        "sample_hash": None,
    }
    if args.paired_common_sample:
        sample_metadata["required_columns_by_target"] = {
            target: list(columns)
            for target, columns in ODDS_REQUIREMENTS_BY_TARGET.items()
            if target in args.targets
        }
        print(
            "Paired common sample: target-specific odds cohorts will be "
            "applied inside each training target."
        )
    run_name = datetime.now(timezone.utc).strftime("backend_v2_%Y%m%dT%H%M%SZ")
    output_dir = (args.output_dir or data_dir / "models" / "experiments" / run_name).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    dataset_summary = _dataset_summary(
        dataframe,
        audit,
        sample_metadata,
        data_window,
    )
    run_summary = {
        "schema_version": 3,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "data_dir": str(data_dir),
        "output_dir": str(output_dir),
        "targets": args.targets,
        "variants": _variant_names(args.variant),
        "test_size": args.test_size,
        "data_cutoff": data_cutoff.isoformat() if data_cutoff else None,
        "test_start_date": test_start_date.isoformat() if test_start_date else None,
        "optuna_trials": args.optuna_trials,
        "optuna_seed": args.optuna_seed,
        "model_scope": args.model_scope,
        "feature_set": args.feature_set or "variant_default",
        "paired_common_sample": args.paired_common_sample,
        "production_benchmark_required": not args.skip_production_benchmark,
        "dataset": dataset_summary,
        "outputs": {},
    }

    for variant in _variant_names(args.variant):
        variant_config = VARIANT_CONFIG[variant]
        effective_feature_set = args.feature_set or variant_config["feature_set"]
        os.environ["SOFASCORE_FEATURE_SET"] = effective_feature_set
        variant_dir = output_dir / variant
        variant_dir.mkdir(parents=True, exist_ok=True)
        predictor = UniversalPredictor(str(data_dir))

        try:
            training_frame, lineup_sample = _filter_confirmed_lineup_rows(
                dataframe,
                variant,
            )
        except ValueError as exc:
            print(f"Lineup sample failed for {variant}: {exc}")
            return 3
        if lineup_sample:
            print(
                f"Confirmed lineup sample ({variant}): "
                f"{lineup_sample['rows']} / {lineup_sample['rows_before']} rows "
                f"({lineup_sample['coverage']:.2%})"
            )

        if variant_config["odds_used"]:
            odds_requirements = {
                target: list(columns)
                for target, columns in ODDS_REQUIREMENTS_BY_TARGET.items()
            }
        else:
            odds_requirements = None
        cohort_requirements = (
            {
                target: list(columns)
                for target, columns in ODDS_REQUIREMENTS_BY_TARGET.items()
            }
            if args.paired_common_sample
            else None
        )

        variant_sample_metadata = dict(sample_metadata)
        if lineup_sample:
            variant_sample_metadata["lineup"] = lineup_sample
        variant_dataset_summary = _dataset_summary(
            training_frame,
            audit,
            variant_sample_metadata,
            data_window,
        )

        reference_predictor = None
        reference_path = data_dir / "models" / _model_filename(variant)
        if not args.skip_production_benchmark:
            reference_predictor, reference_path = _load_production_reference(
                data_dir,
                variant,
            )
            if reference_predictor is None:
                print(
                    f"Active production artifact not found for {variant}: {reference_path}. "
                    "Use --skip-production-benchmark only for an initial bootstrap."
                )
                return 5
            reference_contract = reference_predictor.get_artifact_contract()
            print(
                f"Production reference ({variant}): "
                f"{reference_contract.get('artifact_id')} at {reference_path}"
            )

        results = predictor.train_all_models(
            training_frame,
            test_size=args.test_size,
            targets=args.targets,
            odds_requirements=odds_requirements,
            cohort_requirements=cohort_requirements,
            optuna_trials=args.optuna_trials,
            optuna_seed=args.optuna_seed,
            reference_predictor=reference_predictor,
            test_start_date=(
                test_start_date.isoformat()
                if test_start_date is not None
                else None
            ),
            model_scope=args.model_scope,
        )
        if not results:
            print(f"No targets trained for {variant}.")
            return 4

        metrics_path = variant_dir / "training_metrics.json"
        predictor.export_metrics_json(str(metrics_path))
        reference_manifest_path = Path(f"{reference_path}.manifest.json")
        comparison = build_training_comparison(
            predictor.training_stats,
            _load_manifest(reference_manifest_path),
            variant,
            variant_dataset_summary,
        )
        comparison_paths = write_training_comparison(comparison, variant_dir)
        acceptance = build_acceptance_report(
            predictor.training_stats,
            {
                target: TARGET_CONFIGS[target].get("task", "classification")
                for target in predictor.training_stats
            },
            variant,
            require_production_benchmark=not args.skip_production_benchmark,
            expected_production_artifact_id=(
                reference_predictor.get_artifact_contract().get("artifact_id")
                if reference_predictor is not None
                else None
            ),
        )
        acceptance_path = write_acceptance_report(
            acceptance,
            variant_dir / "acceptance.json",
        )
        predictor.artifact_metadata = {
            **predictor.artifact_metadata,
            "training": {
                "variant": variant,
                "targets": sorted(predictor.training_stats),
                "feature_set": effective_feature_set,
                "model_scope": args.model_scope,
                "accepted_targets": acceptance["accepted_targets"],
                "rejected_targets": acceptance["rejected_targets"],
                "production_reference": (
                    reference_predictor.get_artifact_contract()
                    if reference_predictor is not None
                    else None
                ),
                "data_window": data_window,
                "test_start_date": (
                    test_start_date.isoformat()
                    if test_start_date is not None
                    else None
                ),
            },
        }
        variant_output = {
            "training_metrics": str(metrics_path),
            "comparison": comparison_paths,
            "acceptance": acceptance_path,
            "production_artifact": str(reference_path),
            "production_manifest": str(reference_manifest_path),
            "feature_set": effective_feature_set,
            "dataset": variant_dataset_summary,
        }

        if args.save_models:
            model_path = variant_dir / _model_filename(variant)
            predictor.save_models(str(model_path))
            variant_output["model"] = str(model_path)

        run_summary["outputs"][variant] = variant_output

    summary_path = output_dir / "run.json"
    with open(summary_path, "w", encoding="utf-8") as target:
        json.dump(run_summary, target, ensure_ascii=False, indent=2)
        target.write("\n")
    print(f"Backend v2 training run saved to: {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
