import argparse
from pathlib import Path

from sofascore.paired_walk_forward_figures import (
    generate_paired_walk_forward_figures,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate figures for a paired walk-forward odds analysis.",
    )
    parser.add_argument("--analysis-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    try:
        manifest = generate_paired_walk_forward_figures(
            args.analysis_dir,
            args.output_dir,
        )
    except (OSError, ValueError) as exc:
        print(f"Paired walk-forward figure export failed: {exc}")
        return 2
    print(
        f"Paired walk-forward figures exported to {args.output_dir.resolve()}: "
        f"{len(manifest['figures'])} figures in PNG and SVG formats"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
