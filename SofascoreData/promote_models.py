import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from sofascore.model_promotion import merge_accepted_candidates
from sofascore.model_release import (
    active_pointer_name,
    atomic_copy_file,
    atomic_write_json,
    build_active_pointer,
    create_release_id,
)
from sofascore.predictor import TARGET_CONFIGS, UniversalPredictor


def parse_args():
    parser = argparse.ArgumentParser(
        description="Build and activate a versioned Backend v2.1 model release.",
    )
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path)
    parser.add_argument(
        "--variant",
        choices=("without_odds", "with_odds"),
        required=True,
    )
    parser.add_argument("--require-target", action="append", default=[])
    parser.add_argument(
        "--allow-unpaired",
        action="store_true",
        help="Allow bootstrap promotion without a same-holdout production benchmark.",
    )
    return parser.parse_args()


def _load_predictor(path: Path, data_dir: Path) -> UniversalPredictor:
    predictor = UniversalPredictor(str(data_dir))
    predictor.load_models(str(path))
    return predictor


def main():
    args = parse_args()
    baseline_path = args.baseline.resolve()
    candidate_paths = [path.resolve() for path in args.candidate]
    output_path = args.output.resolve()
    report_path = (args.report or Path(f"{output_path}.promotion.json")).resolve()

    input_paths = {baseline_path, *candidate_paths}
    if output_path in input_paths:
        print("Refusing to overwrite an input model artifact directly.")
        return 2
    if report_path == output_path or report_path in input_paths:
        print("Refusing to overwrite a model artifact with the promotion report.")
        return 2
    missing = [path for path in [baseline_path, *candidate_paths] if not path.exists()]
    if missing:
        print(f"Missing model artifact: {missing[0]}")
        return 3

    data_dir = SCRIPT_DIR / "data"
    baseline = _load_predictor(baseline_path, data_dir)
    candidates = (
        (str(path), _load_predictor(path, data_dir))
        for path in candidate_paths
    )
    target_tasks = {
        target: config.get("task", "classification")
        for target, config in TARGET_CONFIGS.items()
    }
    promoted, promotion = merge_accepted_candidates(
        baseline,
        candidates,
        target_tasks,
        args.variant,
        require_production_benchmark=not args.allow_unpaired,
    )
    promotion["baseline"] = str(baseline_path)
    promotion["candidates"] = [str(path) for path in candidate_paths]
    promotion["output"] = str(output_path)

    missing_required = sorted(set(args.require_target) - set(promotion["accepted_targets"]))
    if missing_required:
        print(f"Required targets were not accepted: {', '.join(missing_required)}")
        return 4

    release_id = create_release_id(args.variant, promotion)
    release_dir = output_path.parent / "releases" / release_id
    release_path = release_dir / output_path.name
    released_at = datetime.now(timezone.utc).isoformat()
    promotion.update({
        "release_id": release_id,
        "released_at": released_at,
        "release_artifact": str(release_path),
    })
    metadata = dict(promoted.artifact_metadata or {})
    metadata["promotion"] = promotion
    metadata["release"] = {
        "schema_version": 1,
        "release_id": release_id,
        "variant": args.variant,
        "released_at": released_at,
    }
    promoted.artifact_metadata = metadata

    manifest = promoted.save_models(str(release_path))
    release_manifest_path = Path(f"{release_path}.manifest.json")
    atomic_copy_file(release_manifest_path, Path(f"{output_path}.manifest.json"))
    atomic_copy_file(release_path, output_path)

    pointer = build_active_pointer(
        args.variant,
        release_id,
        release_path,
        manifest,
        output_path.parent,
    )
    pointer_path = output_path.parent / active_pointer_name(args.variant)
    atomic_write_json(pointer_path, pointer)

    promotion["artifact"] = pointer
    promotion["artifact_manifest"] = {
        "artifact_id": manifest.get("artifact_id"),
        "artifact_sha256": manifest.get("artifact_sha256"),
        "version": manifest.get("version"),
    }
    atomic_write_json(report_path, promotion)

    print(f"Accepted targets: {', '.join(promotion['accepted_targets']) or 'none'}")
    print(f"Rejected targets: {', '.join(promotion['rejected_targets']) or 'none'}")
    print(f"Fallback targets: {', '.join(promotion['fallback_targets']) or 'none'}")
    print(f"Release artifact: {release_path}")
    print(f"Active pointer: {pointer_path}")
    print(f"Promotion report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())