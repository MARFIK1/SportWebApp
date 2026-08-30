import argparse
import json
from pathlib import Path

from sofascore.thesis_snapshot import (
    audit_snapshot_source,
    create_snapshot,
    load_snapshot_config,
)


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG = SCRIPT_DIR / "thesis" / "snapshot_2026-07-19.json"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Create a reproducible, date-bounded thesis snapshot.",
    )
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--audit-only", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    if not args.audit_only and args.output_dir is None:
        print("--output-dir is required unless --audit-only is used")
        return 2
    try:
        config = load_snapshot_config(args.config.resolve())
        audit = audit_snapshot_source(args.source_root, config)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Snapshot configuration failed: {exc}")
        return 2

    print(json.dumps(audit, ensure_ascii=False, indent=2))
    if args.audit_only:
        return 0 if audit["valid"] else 3
    if not audit["valid"]:
        print("Snapshot was not created because the source audit failed.")
        return 3

    try:
        manifest = create_snapshot(
            args.source_root,
            args.output_dir,
            config,
            tool_checkout=SCRIPT_DIR.parent,
        )
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Snapshot creation failed: {exc}")
        return 4
    print(
        f"Snapshot created: {args.output_dir.resolve()} "
        f"({manifest['file_count']} files, {manifest['total_bytes']} bytes)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
