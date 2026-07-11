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
from sofascore.predictor import (
    COMPETITION_TYPES,
    FEATURE_SETS,
    TARGET_CONFIGS,
    UniversalPredictor,
)
from sofascore.training_report import build_training_comparison, write_training_comparison


ALL_TARGETS = tuple(TARGET_CONFIGS)
DEFAULT_TARGETS = ("result",)
BASE_ODDS_REQUIREMENTS = ("odds_home_win", "odds_draw", "odds_away_win")


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


def parse_args():
    parser = argparse.ArgumentParser(
        description="Train Backend v2 football models with temporal validation.",
    )
    parser.add_argument("--data-dir", type=Path, default=SCRIPT_DIR / "data")
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument(
        "--variant",
        choices=("without_odds", "with_odds", "both"),
        default="without_odds",
    )
    parser.add_argument("--targets", type=parse_targets, default=list(DEFAULT_TARGETS))
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--optuna-trials", type=parse_non_negative_int, default=50)
    parser.add_argument(
        "--feature-set",
        choices=tuple(sorted(FEATURE_SETS)),
        default="pre_match_safe",
    )
    parser.add_argument("--allow-auto-features", action="store_true")
    parser.add_argument("--allow-legacy-features", action="store_true")
    parser.add_argument("--audit-only", action="store_true")
    parser.add_argument("--save-models", action="store_true")
    return parser.parse_args()


def _load_manifest(path: Path):
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as source:
        return json.load(source)


def _variant_names(value: str):
    return ["without_odds", "with_odds"] if value == "both" else [value]


def _dataset_summary(df, audit: dict):
    dates = df.get("date")
    valid_dates = dates.dropna().astype(str) if dates is not None else []
    return {
        "rows": len(df),
        "date_min": min(valid_dates) if len(valid_dates) else None,
        "date_max": max(valid_dates) if len(valid_dates) else None,
        "competitions": int(df["competition"].nunique()) if "competition" in df else None,
        "feature_dataset_count": audit.get("dataset_count"),
        "feature_dataset_samples": audit.get("total_samples"),
        "dataset_builder_version": audit.get("expected_builder_version"),
    }


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

    os.environ["SOFASCORE_FEATURE_SET"] = args.feature_set
    if args.allow_auto_features:
        os.environ["SOFASCORE_ALLOW_AUTO_FEATURES"] = "1"
    else:
        os.environ.pop("SOFASCORE_ALLOW_AUTO_FEATURES", None)

    loader = UniversalPredictor(str(data_dir))
    dataframe = loader.load_all_data()
    if dataframe.empty:
        print("No finished feature rows found.")
        return 3

    run_name = datetime.now(timezone.utc).strftime("backend_v2_%Y%m%dT%H%M%SZ")
    output_dir = (args.output_dir or data_dir / "models" / "experiments" / run_name).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    dataset_summary = _dataset_summary(dataframe, audit)
    run_summary = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "data_dir": str(data_dir),
        "output_dir": str(output_dir),
        "targets": args.targets,
        "variants": _variant_names(args.variant),
        "test_size": args.test_size,
        "optuna_trials": args.optuna_trials,
        "feature_set": args.feature_set,
        "dataset": dataset_summary,
        "outputs": {},
    }

    odds_columns = [column for column in dataframe.columns if column.startswith("odds_")]
    for variant in _variant_names(args.variant):
        variant_dir = output_dir / variant
        variant_dir.mkdir(parents=True, exist_ok=True)
        predictor = UniversalPredictor(str(data_dir))

        if variant == "without_odds":
            training_frame = dataframe.drop(columns=odds_columns, errors="ignore")
            odds_requirements = None
            baseline_name = "universal_predictor.pkl.manifest.json"
        else:
            training_frame = dataframe
            odds_requirements = {"__all__": list(BASE_ODDS_REQUIREMENTS)}
            baseline_name = "universal_predictor_with_odds.pkl.manifest.json"

        results = predictor.train_all_models(
            training_frame,
            test_size=args.test_size,
            targets=args.targets,
            odds_requirements=odds_requirements,
            optuna_trials=args.optuna_trials,
        )
        if not results:
            print(f"No targets trained for {variant}.")
            return 4

        metrics_path = variant_dir / "training_metrics.json"
        predictor.export_metrics_json(str(metrics_path))
        baseline_path = data_dir / "models" / baseline_name
        comparison = build_training_comparison(
            predictor.training_stats,
            _load_manifest(baseline_path),
            variant,
            dataset_summary,
        )
        comparison_paths = write_training_comparison(comparison, variant_dir)
        variant_output = {
            "training_metrics": str(metrics_path),
            "comparison": comparison_paths,
            "baseline_manifest": str(baseline_path),
        }

        if args.save_models:
            model_path = variant_dir / baseline_name.removesuffix(".manifest.json")
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
