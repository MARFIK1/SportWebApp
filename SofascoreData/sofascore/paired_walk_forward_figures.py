from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
from typing import Any, Callable

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np


ANALYSIS_FILES = (
    "paired_model_comparison.csv",
    "paired_primary_comparison.csv",
    "paired_fold_metrics.csv",
    "paired_analysis_manifest.json",
)
VARIANTS = ("without_odds", "with_odds")
VARIANT_LABELS = {
    "without_odds": "Without odds",
    "with_odds": "With odds",
}
TARGET_LABELS = {
    "result": "1X2 result",
    "btts": "Both teams to score",
    "over_1_5": "Over 1.5 goals",
    "over_2_5": "Over 2.5 goals",
    "cards_over_3_5": "Over 3.5 cards",
}
TARGET_ORDER = tuple(TARGET_LABELS)
MODEL_ORDER = (
    "Logistic Regression",
    "Random Forest",
    "KNN",
    "MLP",
    "XGBoost",
    "LightGBM",
    "Ensemble",
    "Stacking",
    "LSTM",
    "Consensus Argmax",
    "Consensus Policy",
)

GREEN = "#078C6B"
BLUE = "#3478D4"
RED = "#C7475A"
GRAY = "#7D8796"
LIGHT_GRAY = "#D8DEE8"
DARK = "#17212B"


def _configure_style() -> None:
    plt.rcParams.update({
        "axes.edgecolor": "#AEB8C6",
        "axes.labelcolor": DARK,
        "axes.spines.right": False,
        "axes.spines.top": False,
        "axes.titlecolor": DARK,
        "axes.titlesize": 11,
        "figure.facecolor": "white",
        "figure.titlesize": 13,
        "font.family": "DejaVu Sans",
        "font.size": 9,
        "legend.frameon": False,
        "savefig.facecolor": "white",
        "svg.hashsalt": "sportwebapp-paired-walk-forward-2026-07-19",
        "text.color": DARK,
        "xtick.color": "#4E5C6B",
        "ytick.color": "#4E5C6B",
    })


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def _read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return payload


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if np.isfinite(result) else None


def _truthy(value: Any) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes"}


def _model_sort_key(model: str) -> tuple[int, str]:
    try:
        return MODEL_ORDER.index(model), model
    except ValueError:
        return len(MODEL_ORDER), model


def _target_sort_key(target: str) -> tuple[int, str]:
    try:
        return TARGET_ORDER.index(target), target
    except ValueError:
        return len(TARGET_ORDER), target


def _format_axis(ax: plt.Axes, axis: str = "x") -> None:
    ax.set_axisbelow(True)
    ax.grid(axis=axis, color=LIGHT_GRAY, linewidth=0.7, alpha=0.7)


def _add_footer(fig: plt.Figure, manifest: dict[str, Any]) -> None:
    protocol = manifest.get("protocol") or {}
    method = manifest.get("method") or {}
    fig.supxlabel(
        f"Walk-forward: {protocol.get('start_date', 'unknown')} to "
        f"{protocol.get('end_date', 'unknown')}; "
        f"fold-block bootstrap n={method.get('bootstrap_iterations', 'unknown')}",
        x=0.01,
        ha="left",
        color=GRAY,
        fontsize=7,
    )


def _save_figure(fig: plt.Figure, output_dir: Path, stem: str) -> list[Path]:
    png_path = output_dir / f"{stem}.png"
    svg_path = output_dir / f"{stem}.svg"
    fig.savefig(
        png_path,
        dpi=220,
        bbox_inches="tight",
        metadata={"Software": "SportWebApp paired walk-forward figure exporter"},
    )
    fig.savefig(svg_path, bbox_inches="tight", metadata={"Date": None})
    plt.close(fig)
    return [png_path, svg_path]


def _plot_macro_f1_forest(
    comparisons: list[dict[str, str]],
    manifest: dict[str, Any],
) -> plt.Figure:
    targets = sorted(
        {row.get("target", "") for row in comparisons if row.get("target")},
        key=_target_sort_key,
    )
    columns = 2 if len(targets) > 1 else 1
    rows_count = max(1, (len(targets) + columns - 1) // columns)
    fig, axes = plt.subplots(
        rows_count,
        columns,
        figsize=(14, 4.2 * rows_count),
        sharex=True,
        layout="constrained",
    )
    axes = np.atleast_1d(axes).ravel()
    for ax, target in zip(axes, targets):
        rows = sorted(
            [row for row in comparisons if row.get("target") == target],
            key=lambda row: _model_sort_key(row.get("model", "")),
        )
        positions = np.arange(len(rows))
        values = np.asarray([
            100 * float(row["delta_macro_f1"])
            for row in rows
        ])
        lows = np.asarray([
            100 * float(row["delta_macro_f1_ci_low"])
            for row in rows
        ])
        highs = np.asarray([
            100 * float(row["delta_macro_f1_ci_high"])
            for row in rows
        ])
        colors = [
            BLUE if _truthy(row.get("primary_model"))
            else GREEN if value >= 0
            else RED
            for row, value in zip(rows, values)
        ]
        ax.errorbar(
            values,
            positions,
            xerr=np.vstack((values - lows, highs - values)),
            fmt="none",
            ecolor=GRAY,
            elinewidth=1.2,
            capsize=2.5,
            zorder=1,
        )
        ax.scatter(values, positions, c=colors, s=34, zorder=2)
        ax.axvline(0, color=DARK, linewidth=0.9)
        ax.set_yticks(positions, [row["model"] for row in rows])
        ax.invert_yaxis()
        ax.set_title(TARGET_LABELS.get(target, target), loc="left")
        ax.set_xlabel("Macro F1 change with odds (percentage points)")
        _format_axis(ax)
    for ax in axes[len(targets):]:
        ax.set_visible(False)
    fig.suptitle(
        "Paired effect of odds across models\n"
        "Blue marks the primary model; green/red marks positive/negative change; "
        "whiskers show 95% fold-block bootstrap intervals",
        x=0.01,
        ha="left",
    )
    _add_footer(fig, manifest)
    return fig


def _plot_primary_fold_trajectory(
    folds: list[dict[str, str]],
    manifest: dict[str, Any],
) -> plt.Figure:
    primary_model = str((manifest.get("method") or {}).get("primary_model"))
    targets = sorted(
        {
            row.get("target", "")
            for row in folds
            if row.get("target") and row.get("model") == primary_model
        },
        key=_target_sort_key,
    )
    fig, axes = plt.subplots(
        len(targets),
        1,
        figsize=(11, max(4.5, 2.5 * len(targets))),
        sharex=True,
        layout="constrained",
    )
    axes = np.atleast_1d(axes)
    all_indexes = sorted({
        int(row["fold_index"])
        for row in folds
        if row.get("model") == primary_model
    })
    date_by_index = {
        int(row["fold_index"]): row.get("test_start", "")[5:]
        for row in folds
        if row.get("model") == primary_model
    }
    for ax, target in zip(axes, targets):
        for variant, color in zip(VARIANTS, (GREEN, BLUE)):
            rows = sorted(
                [
                    row for row in folds
                    if row.get("target") == target
                    and row.get("model") == primary_model
                    and row.get("variant") == variant
                ],
                key=lambda row: int(row["fold_index"]),
            )
            ax.plot(
                [int(row["fold_index"]) for row in rows],
                [float(row["macro_f1"]) for row in rows],
                color=color,
                marker="o",
                markersize=4,
                linewidth=1.5,
                label=VARIANT_LABELS[variant],
            )
        ax.set_title(TARGET_LABELS.get(target, target), loc="left")
        ax.set_ylabel("Macro F1")
        ax.set_ylim(0, 1)
        _format_axis(ax, axis="y")
        ax.legend(ncol=2, loc="upper left")
    axes[-1].set_xticks(
        all_indexes,
        [date_by_index[index] for index in all_indexes],
        rotation=35,
        ha="right",
    )
    axes[-1].set_xlabel("Fold test start (MM-DD); missing week had no feature rows")
    fig.suptitle(
        f"Weekly paired performance of {primary_model}",
        x=0.01,
        ha="left",
    )
    _add_footer(fig, manifest)
    return fig


def _plot_primary_probability_effects(
    primary: list[dict[str, str]],
    manifest: dict[str, Any],
) -> plt.Figure:
    metrics = (
        ("brier_score", "Brier score change"),
        ("log_loss", "Log-loss change"),
    )
    rows = sorted(primary, key=lambda row: _target_sort_key(row["target"]))
    labels = [TARGET_LABELS.get(row["target"], row["target"]) for row in rows]
    positions = np.arange(len(rows))
    fig, axes = plt.subplots(
        1,
        2,
        figsize=(11, max(3.6, 0.8 * len(rows) + 2.0)),
        layout="constrained",
    )
    for ax, (metric, title) in zip(axes, metrics):
        values = np.asarray([float(row[f"delta_{metric}"]) for row in rows])
        lows = np.asarray([float(row[f"delta_{metric}_ci_low"]) for row in rows])
        highs = np.asarray([float(row[f"delta_{metric}_ci_high"]) for row in rows])
        colors = [GREEN if value < 0 else RED for value in values]
        ax.errorbar(
            values,
            positions,
            xerr=np.vstack((values - lows, highs - values)),
            fmt="none",
            ecolor=GRAY,
            elinewidth=1.3,
            capsize=3,
            zorder=1,
        )
        ax.scatter(values, positions, c=colors, s=42, zorder=2)
        for value, position in zip(values, positions):
            ax.annotate(
                f"{value:+.4f}",
                (value, position),
                xytext=(0, 8),
                textcoords="offset points",
                ha="center",
                va="bottom",
                fontsize=8,
            )
        ax.axvline(0, color=DARK, linewidth=0.9)
        ax.set_yticks(positions, labels)
        ax.invert_yaxis()
        ax.set_title(title, loc="left")
        ax.set_xlabel("With odds minus without odds (lower favors odds)")
        _format_axis(ax)
    fig.suptitle(
        "Primary model probability-quality effect\nWhiskers show 95% fold-block bootstrap intervals",
        x=0.01,
        ha="left",
    )
    _add_footer(fig, manifest)
    return fig


def generate_paired_walk_forward_figures(
    analysis_dir: Path,
    output_dir: Path,
) -> dict[str, Any]:
    analysis_dir = analysis_dir.resolve()
    output_dir = output_dir.resolve()
    missing = [name for name in ANALYSIS_FILES if not (analysis_dir / name).is_file()]
    if missing:
        raise FileNotFoundError(
            "Missing paired analysis inputs: " + ", ".join(sorted(missing))
        )
    _configure_style()
    comparisons = _read_csv(analysis_dir / "paired_model_comparison.csv")
    primary = _read_csv(analysis_dir / "paired_primary_comparison.csv")
    folds = _read_csv(analysis_dir / "paired_fold_metrics.csv")
    manifest = _read_json(analysis_dir / "paired_analysis_manifest.json")
    output_dir.mkdir(parents=True, exist_ok=True)

    builders: tuple[tuple[str, Callable[[], plt.Figure]], ...] = (
        (
            "paired_macro_f1_effect_by_model",
            lambda: _plot_macro_f1_forest(comparisons, manifest),
        ),
        (
            "paired_primary_weekly_macro_f1",
            lambda: _plot_primary_fold_trajectory(folds, manifest),
        ),
        (
            "paired_primary_probability_effects",
            lambda: _plot_primary_probability_effects(primary, manifest),
        ),
    )
    figure_entries = []
    figure_paths = []
    for figure_id, builder in builders:
        paths = _save_figure(builder(), output_dir, figure_id)
        figure_paths.extend(paths)
        figure_entries.append({
            "id": figure_id,
            "files": [
                {"name": path.name, "sha256": _sha256(path)}
                for path in paths
            ],
        })

    figure_manifest = {
        "schema_version": 1,
        "source_run": manifest.get("source_run"),
        "plan_fingerprint": manifest.get("plan_fingerprint"),
        "protocol": manifest.get("protocol"),
        "method": manifest.get("method"),
        "sources": [
            {"name": name, "sha256": _sha256(analysis_dir / name)}
            for name in ANALYSIS_FILES
        ],
        "figures": figure_entries,
    }
    manifest_path = output_dir / "figures_manifest.json"
    manifest_path.write_text(
        json.dumps(figure_manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    checksum_paths = sorted([*figure_paths, manifest_path], key=lambda path: path.name)
    (output_dir / "checksums.sha256").write_text(
        "\n".join(f"{_sha256(path)}  {path.name}" for path in checksum_paths) + "\n",
        encoding="utf-8",
    )
    return figure_manifest
