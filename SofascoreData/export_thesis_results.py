import argparse
import json
from pathlib import Path

from sofascore.thesis_results import export_thesis_results


def parse_args():
    parser = argparse.ArgumentParser(
        description="Export reproducible thesis evaluation tables and provenance.",
    )
    parser.add_argument("--primary-run", type=Path, required=True)
    parser.add_argument("--accepted-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--supplemental-run", type=Path, action="append", default=[])
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        manifest = export_thesis_results(
            primary_run=args.primary_run,
            accepted_dir=args.accepted_dir,
            output_dir=args.output_dir,
            supplemental_runs=args.supplemental_run,
        )
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Thesis result export failed: {exc}")
        return 2
    counts = manifest["outputs"]
    print(
        f"Thesis results exported to {args.output_dir.resolve()}: "
        f"{counts['evaluation_rows']} evaluations, "
        f"{counts['model_rows']} model rows, "
        f"{counts['promotion_rows']} promotion decisions"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
