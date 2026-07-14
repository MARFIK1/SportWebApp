import argparse
import json
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from sofascore.model_promotion import merge_accepted_candidates
from sofascore.predictor import TARGET_CONFIGS, UniversalPredictor


def parse_args():
    parser = argparse.ArgumentParser(
        description="Build a Backend v2 production candidate from accepted target artifacts.",
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
    )
    promotion["baseline"] = str(baseline_path)
    promotion["candidates"] = [str(path) for path in candidate_paths]
    promotion["output"] = str(output_path)

    missing_required = sorted(set(args.require_target) - set(promotion["accepted_targets"]))
    if missing_required:
        print(f"Required targets were not accepted: {', '.join(missing_required)}")
        return 4

    output_path.parent.mkdir(parents=True, exist_ok=True)
    promoted.save_models(str(output_path))
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as target:
        json.dump(promotion, target, ensure_ascii=False, indent=2)
        target.write("\n")

    print(f"Accepted targets: {', '.join(promotion['accepted_targets']) or 'none'}")
    print(f"Rejected targets: {', '.join(promotion['rejected_targets']) or 'none'}")
    print(f"Fallback targets: {', '.join(promotion['fallback_targets']) or 'none'}")
    print(f"Promotion report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())