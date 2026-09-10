import argparse
import json
from pathlib import Path

from sofascore.paired_walk_forward_analysis import (
    PRIMARY_MODEL,
    export_paired_walk_forward_analysis,
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Export paired statistical analysis for a walk-forward run.",
    )
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--bootstrap-iterations", type=int, default=10_000)
    parser.add_argument("--bootstrap-seed", type=int, default=42)
    parser.add_argument("--primary-model", default=PRIMARY_MODEL)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        manifest = export_paired_walk_forward_analysis(
            run_dir=args.run_dir,
            output_dir=args.output_dir,
            bootstrap_iterations=args.bootstrap_iterations,
            bootstrap_seed=args.bootstrap_seed,
            primary_model=args.primary_model,
        )
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Paired walk-forward analysis failed: {exc}")
        return 2
    counts = manifest["outputs"]
    print(
        f"Paired analysis exported to {args.output_dir.resolve()}: "
        f"{counts['comparison_rows']} model comparisons, "
        f"{counts['primary_rows']} primary comparisons, "
        f"{counts['fold_metric_rows']} fold metric rows"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
