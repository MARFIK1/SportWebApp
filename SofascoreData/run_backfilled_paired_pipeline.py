import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_status(path: Path, status: str, **details) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "status": status,
        "updated_at": _utc_now(),
        **details,
    }
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def _run_logged(command: list[str], log_path: Path) -> int:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as log:
        log.write(f"\n[{_utc_now()}] {subprocess.list2cmdline(command)}\n")
        log.flush()
        completed = subprocess.run(
            command,
            stdout=log,
            stderr=subprocess.STDOUT,
            check=False,
        )
        log.write(f"[{_utc_now()}] exit_code={completed.returncode}\n")
        log.flush()
        return completed.returncode


def parse_args():
    parser = argparse.ArgumentParser(
        description="Backfill snapshot odds and run the full paired walk-forward.",
    )
    parser.add_argument("--source-snapshot-root", type=Path, required=True)
    parser.add_argument("--derived-root", type=Path, required=True)
    parser.add_argument("--training-output", type=Path, required=True)
    parser.add_argument("--start-date", default="2026-04-01")
    parser.add_argument("--end-date", default="2026-07-19")
    parser.add_argument("--targets", default="result,btts")
    parser.add_argument("--optuna-trials", type=int, default=50)
    parser.add_argument("--optuna-seed", type=int, default=42)
    parser.add_argument("--backfill-retries", type=int, default=3)
    parser.add_argument("--retry-wait-seconds", type=int, default=300)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_snapshot_root = args.source_snapshot_root.resolve()
    derived_root = args.derived_root.resolve()
    training_output = args.training_output.resolve()
    status_path = derived_root / "pipeline_status.json"
    log_path = derived_root / "overnight_pipeline.log"
    python = str(Path(sys.executable).resolve())

    if args.backfill_retries < 1:
        print("backfill retries must be at least 1")
        return 2

    backfill_command = [
        python,
        "-u",
        str(SCRIPT_DIR / "backfill_snapshot_odds.py"),
        "--source-data-dir",
        str(source_snapshot_root / "data"),
        "--output-root",
        str(derived_root),
        "--start-date",
        args.start_date,
        "--end-date",
        args.end_date,
        "--targets",
        args.targets,
    ]

    backfill_code = None
    for attempt in range(1, args.backfill_retries + 1):
        _write_status(
            status_path,
            "backfill_running",
            attempt=attempt,
            attempts=args.backfill_retries,
            log=log_path.name,
        )
        backfill_code = _run_logged(backfill_command, log_path)
        if backfill_code == 0:
            break
        if attempt < args.backfill_retries:
            _write_status(
                status_path,
                "backfill_waiting_to_retry",
                attempt=attempt,
                exit_code=backfill_code,
                retry_in_seconds=args.retry_wait_seconds,
                log=log_path.name,
            )
            time.sleep(args.retry_wait_seconds)
    if backfill_code != 0:
        _write_status(
            status_path,
            "failed",
            stage="backfill",
            exit_code=backfill_code,
            log=log_path.name,
        )
        return int(backfill_code or 1)

    walk_forward_base = [
        python,
        "-u",
        str(SCRIPT_DIR / "run_walk_forward_backtest.py"),
        "--data-dir",
        str(derived_root / "data"),
        "--output-dir",
        str(training_output),
        "--start-date",
        args.start_date,
        "--end-date",
        args.end_date,
        "--variant",
        "both",
        "--targets",
        args.targets,
        "--model-scope",
        "all",
        "--first-fold-optuna-trials",
        str(args.optuna_trials),
        "--optuna-seed",
        str(args.optuna_seed),
        "--skip-empty-folds",
    ]

    _write_status(
        status_path,
        "dry_run_running",
        training_output=str(training_output),
        log=log_path.name,
    )
    dry_run_code = _run_logged([*walk_forward_base, "--dry-run"], log_path)
    if dry_run_code != 0:
        _write_status(
            status_path,
            "failed",
            stage="dry_run",
            exit_code=dry_run_code,
            log=log_path.name,
        )
        return dry_run_code

    _write_status(
        status_path,
        "training_running",
        training_output=str(training_output),
        log=log_path.name,
    )
    training_code = _run_logged(walk_forward_base, log_path)
    if training_code != 0:
        _write_status(
            status_path,
            "failed",
            stage="training",
            exit_code=training_code,
            training_output=str(training_output),
            log=log_path.name,
        )
        return training_code

    summary_path = training_output / "walk_forward_summary.json"
    summary = {}
    if summary_path.exists():
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
    if not summary.get("complete"):
        _write_status(
            status_path,
            "failed",
            stage="final_validation",
            reason="walk-forward summary is missing or incomplete",
            training_output=str(training_output),
            log=log_path.name,
        )
        return 6

    _write_status(
        status_path,
        "completed",
        training_output=str(training_output),
        summary=str(summary_path),
        log=log_path.name,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
