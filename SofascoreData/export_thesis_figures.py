import argparse
from pathlib import Path

from sofascore.thesis_figures import generate_thesis_figures


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate reproducible thesis figures from exported evaluation results."
    )
    parser.add_argument("--results-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()

    manifest = generate_thesis_figures(args.results_dir, args.output_dir)
    print(
        f"Thesis figures exported to {args.output_dir.resolve()}: "
        f"{len(manifest['figures'])} figures in PNG and SVG formats"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
