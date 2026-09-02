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


RESULT_FILES = (
    "evaluation_summary.csv",
    "model_metrics.csv",
    "promotion_summary.csv",
    "confusion_matrices.csv",
    "results_manifest.json",
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
    "corners_over_8_5": "Corners over 8.5",
    "corners_over_10_5": "Corners over 10.5",
    "cards_over_3_5": "Cards over 3.5",
    "cards_over_4_5": "Cards over 4.5",
    "total_goals": "Total goals",
    "total_corners": "Total corners",
    "total_cards": "Total cards",
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
AMBER = "#D49318"
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
        "svg.hashsalt": "sportwebapp-thesis-2026-07-19",
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
        raise ValueError(f"Expected a JSON object in {path.name}")
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
        return float(value)
    except (TypeError, ValueError):
        return None


def _truthy(value: Any) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes"}


def _target_sort_key(target: str) -> tuple[int, str]:
    try:
        return TARGET_ORDER.index(target), target
    except ValueError:
        return len(TARGET_ORDER), target


def _model_sort_key(model: str) -> tuple[int, str]:
    try:
        return MODEL_ORDER.index(model), model
    except ValueError:
        return len(MODEL_ORDER), model


def _label_target(target: str) -> str:
    return TARGET_LABELS.get(target, target.replace("_", " ").title())


def _format_axis(ax: plt.Axes, axis: str = "y") -> None:
    ax.set_axisbelow(True)
    ax.grid(axis=axis, color=LIGHT_GRAY, linewidth=0.7, alpha=0.7)


def _add_footer(fig: plt.Figure, manifest: dict[str, Any]) -> None:
    cutoff = manifest.get("data_cutoff", "unknown")
    test_start = manifest.get("test_start_date", "unknown")
    fig.supxlabel(
        f"Evaluation window: {test_start} to {cutoff}",
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
        metadata={"Software": "SportWebApp thesis figure exporter"},
    )
    fig.savefig(
        svg_path,
        bbox_inches="tight",
        metadata={"Date": None},
    )
    plt.close(fig)
    return [png_path, svg_path]


def _candidate_lookup(
    rows: list[dict[str, str]],
) -> dict[tuple[str, str], dict[str, str]]:
    return {
        (row.get("variant", ""), row.get("target", "")): row
        for row in rows
    }


def _plot_odds_impact(
    evaluations: list[dict[str, str]],
    manifest: dict[str, Any],
) -> plt.Figure:
    lookup = _candidate_lookup(evaluations)
    targets = sorted({
        target
        for variant, target in lookup
        if variant == "without_odds"
        and ("with_odds", target) in lookup
        and lookup[(variant, target)].get("task") == "classification"
    }, key=_target_sort_key)
    differences = []
    labels = []
    for target in targets:
        without = _number(lookup[("without_odds", target)].get("gate_candidate_score"))
        with_odds = _number(lookup[("with_odds", target)].get("gate_candidate_score"))
        if without is None or with_odds is None:
            continue
        labels.append(_label_target(target))
        differences.append(with_odds - without)

    fig, ax = plt.subplots(
        figsize=(9, max(4.2, len(labels) * 0.48 + 1.8)),
        layout="constrained",
    )
    positions = np.arange(len(labels))
    colors = [GREEN if value >= 0 else RED for value in differences]
    ax.barh(positions, differences, color=colors, height=0.58)
    ax.axvline(0, color=DARK, linewidth=0.9)
    ax.set_yticks(positions, labels)
    ax.invert_yaxis()
    ax.set_xlabel("Change in macro F1 after adding odds")
    ax.set_title("Impact of betting odds on classification performance", loc="left")
    _format_axis(ax, axis="x")
    for position, value in zip(positions, differences):
        offset = 3 if value >= 0 else -3
        alignment = "left" if value >= 0 else "right"
        ax.annotate(
            f"{value:+.3f}",
            (value, position),
            xytext=(offset, 0),
            textcoords="offset points",
            va="center",
            ha=alignment,
            fontsize=8,
        )
    _add_footer(fig, manifest)
    return fig


def _plot_classification_markets(
    evaluations: list[dict[str, str]],
    manifest: dict[str, Any],
) -> plt.Figure:
    lookup = _candidate_lookup(evaluations)
    targets = sorted({
        row.get("target", "")
        for row in evaluations
        if row.get("task") == "classification"
        and _number(row.get("gate_candidate_score")) is not None
    }, key=_target_sort_key)
    positions = np.arange(len(targets))
    width = 0.36
    fig, ax = plt.subplots(figsize=(11, 5.8), layout="constrained")
    for index, variant in enumerate(VARIANTS):
        values = [
            _number(lookup.get((variant, target), {}).get("gate_candidate_score"))
            for target in targets
        ]
        heights = [value if value is not None else np.nan for value in values]
        ax.bar(
            positions + (index - 0.5) * width,
            heights,
            width,
            label=VARIANT_LABELS[variant],
            color=GREEN if variant == "without_odds" else BLUE,
        )
    ax.set_xticks(positions, [_label_target(target) for target in targets], rotation=30, ha="right")
    ax.set_ylabel("Macro F1")
    ax.set_ylim(0, 0.7)
    ax.set_title("Classification market performance", loc="left")
    ax.legend(ncol=2, loc="upper left")
    _format_axis(ax)
    _add_footer(fig, manifest)
    return fig


def _plot_regression_targets(
    evaluations: list[dict[str, str]],
    manifest: dict[str, Any],
) -> plt.Figure:
    lookup = _candidate_lookup(evaluations)
    targets = sorted({
        row.get("target", "")
        for row in evaluations
        if row.get("task") == "regression"
    }, key=_target_sort_key)
    positions = np.arange(len(targets))
    width = 0.18
    series = (
        ("without_odds", "gate_baseline", "Baseline, without odds", "#B8C1CC"),
        ("without_odds", "gate_candidate_score", "Candidate, without odds", GREEN),
        ("with_odds", "gate_baseline", "Baseline, with odds", "#8FA9CB"),
        ("with_odds", "gate_candidate_score", "Candidate, with odds", BLUE),
    )
    fig, ax = plt.subplots(figsize=(9, 5.4), layout="constrained")
    for index, (variant, field, label, color) in enumerate(series):
        values = [
            _number(lookup.get((variant, target), {}).get(field))
            for target in targets
        ]
        heights = [value if value is not None else np.nan for value in values]
        ax.bar(
            positions + (index - 1.5) * width,
            heights,
            width,
            label=label,
            color=color,
        )
    ax.set_xticks(positions, [_label_target(target) for target in targets])
    ax.set_ylabel("Mean absolute error (lower is better)")
    ax.set_title("Regression target performance", loc="left")
    ax.legend(ncol=2, loc="upper left")
    _format_axis(ax)
    _add_footer(fig, manifest)
    return fig


def _plot_result_models(
    models: list[dict[str, str]],
    manifest: dict[str, Any],
) -> plt.Figure:
    rows = [
        row for row in models
        if row.get("target") == "result" and _number(row.get("macro_f1")) is not None
    ]
    lookup = {
        (row.get("variant", ""), row.get("model", "")): _number(row.get("macro_f1"))
        for row in rows
    }
    model_names = sorted({row.get("model", "") for row in rows}, key=_model_sort_key)
    positions = np.arange(len(model_names))
    height = 0.36
    fig, ax = plt.subplots(
        figsize=(9.5, max(5.4, len(model_names) * 0.46 + 1.8)),
        layout="constrained",
    )
    for index, variant in enumerate(VARIANTS):
        values = [lookup.get((variant, model), np.nan) for model in model_names]
        ax.barh(
            positions + (index - 0.5) * height,
            values,
            height,
            label=VARIANT_LABELS[variant],
            color=GREEN if variant == "without_odds" else BLUE,
        )
    ax.set_yticks(positions, model_names)
    ax.invert_yaxis()
    ax.set_xlim(0, 0.65)
    ax.set_xlabel("Macro F1")
    ax.set_title("1X2 model comparison on the holdout set", loc="left")
    ax.legend(ncol=2, loc="lower right")
    _format_axis(ax, axis="x")
    _add_footer(fig, manifest)
    return fig


def _plot_calibration(
    evaluations: list[dict[str, str]],
    manifest: dict[str, Any],
) -> plt.Figure:
    classification = [row for row in evaluations if row.get("task") == "classification"]
    metrics = (
        ("brier_score", "Brier score"),
        ("log_loss", "Log loss"),
        ("ece", "Expected calibration error"),
    )
    fig, axes = plt.subplots(1, 3, figsize=(11, 4.8), layout="constrained")
    for ax, (field, label) in zip(axes, metrics):
        means = []
        for variant in VARIANTS:
            values = [
                value
                for row in classification
                if row.get("variant") == variant
                for value in [_number(row.get(field))]
                if value is not None
            ]
            means.append(float(np.mean(values)) if values else np.nan)
        bars = ax.bar(
            [VARIANT_LABELS[variant] for variant in VARIANTS],
            means,
            color=(GREEN, BLUE),
            width=0.62,
        )
        ax.set_title(label)
        ax.set_ylabel("Mean across classification targets")
        ax.tick_params(axis="x", rotation=15)
        _format_axis(ax)
        for bar, value in zip(bars, means):
            if np.isnan(value):
                continue
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height(),
                f"{value:.3f}",
                ha="center",
                va="bottom",
                fontsize=8,
            )
    fig.suptitle("Probability calibration metrics (lower is better)", x=0.01, ha="left")
    _add_footer(fig, manifest)
    return fig


def _plot_promotions(
    promotions: list[dict[str, str]],
    manifest: dict[str, Any],
) -> plt.Figure:
    accepted = [
        sum(_truthy(row.get("accepted")) for row in promotions if row.get("variant") == variant)
        for variant in VARIANTS
    ]
    fallback = [
        sum(_truthy(row.get("fallback")) for row in promotions if row.get("variant") == variant)
        for variant in VARIANTS
    ]
    positions = np.arange(len(VARIANTS))
    fig, ax = plt.subplots(figsize=(7.5, 5), layout="constrained")
    ax.bar(positions, accepted, color=GREEN, width=0.58, label="Promoted")
    ax.bar(positions, fallback, bottom=accepted, color=GRAY, width=0.58, label="Baseline fallback")
    ax.set_xticks(positions, [VARIANT_LABELS[variant] for variant in VARIANTS])
    ax.set_ylabel("Number of prediction targets")
    ax.set_title("Final model package decisions", loc="left")
    ax.legend(ncol=2, loc="upper right")
    _format_axis(ax)
    for position, (accepted_count, fallback_count) in enumerate(zip(accepted, fallback)):
        ax.text(position, accepted_count / 2, str(accepted_count), ha="center", va="center", color="white")
        if fallback_count:
            ax.text(
                position,
                accepted_count + fallback_count / 2,
                str(fallback_count),
                ha="center",
                va="center",
                color="white",
            )
    _add_footer(fig, manifest)
    return fig


def _ordered_classes(values: set[str]) -> list[str]:
    preferred = ("HOME", "DRAW", "AWAY", "NO", "YES", "UNDER", "OVER")
    return [value for value in preferred if value in values] + sorted(values - set(preferred))


def _plot_confusion_matrices(
    evaluations: list[dict[str, str]],
    confusions: list[dict[str, str]],
    manifest: dict[str, Any],
) -> plt.Figure:
    evaluation_lookup = _candidate_lookup(evaluations)
    combinations = [
        (variant, target)
        for target in ("result", "btts")
        for variant in VARIANTS
    ]
    fig, axes = plt.subplots(2, 2, figsize=(10, 8.2), layout="constrained")
    image = None
    for ax, (variant, target) in zip(axes.flat, combinations):
        candidate = evaluation_lookup.get((variant, target), {}).get("gate_candidate")
        rows = [
            row for row in confusions
            if row.get("variant") == variant
            and row.get("target") == target
            and row.get("model") == candidate
        ]
        if not rows:
            ax.axis("off")
            ax.set_title(f"{_label_target(target)}: {VARIANT_LABELS[variant]} (not available)")
            continue
        classes = _ordered_classes({
            row.get("actual_class", "") for row in rows
        } | {
            row.get("predicted_class", "") for row in rows
        })
        indexes = {label: index for index, label in enumerate(classes)}
        counts = np.zeros((len(classes), len(classes)), dtype=float)
        for row in rows:
            actual = row.get("actual_class", "")
            predicted = row.get("predicted_class", "")
            count = _number(row.get("count"))
            if actual in indexes and predicted in indexes and count is not None:
                counts[indexes[actual], indexes[predicted]] += count
        totals = counts.sum(axis=1, keepdims=True)
        normalized = np.divide(counts, totals, out=np.zeros_like(counts), where=totals != 0)
        image = ax.imshow(normalized, cmap="YlGnBu", vmin=0, vmax=1)
        ax.set_xticks(range(len(classes)), classes)
        ax.set_yticks(range(len(classes)), classes)
        ax.set_xlabel("Predicted class")
        ax.set_ylabel("Actual class")
        ax.set_title(f"{_label_target(target)}: {VARIANT_LABELS[variant]}")
        for actual_index in range(len(classes)):
            for predicted_index in range(len(classes)):
                value = normalized[actual_index, predicted_index]
                color = "white" if value >= 0.55 else DARK
                ax.text(
                    predicted_index,
                    actual_index,
                    f"{value:.0%}\n(n={counts[actual_index, predicted_index]:.0f})",
                    ha="center",
                    va="center",
                    color=color,
                    fontsize=8,
                )
    if image is not None:
        fig.colorbar(image, ax=axes.ravel().tolist(), shrink=0.78, label="Row-normalized share")
    fig.suptitle("Consensus-policy confusion matrices", x=0.01, ha="left")
    _add_footer(fig, manifest)
    return fig


def generate_thesis_figures(results_dir: Path, output_dir: Path) -> dict[str, Any]:
    results_dir = results_dir.resolve()
    output_dir = output_dir.resolve()
    missing = [name for name in RESULT_FILES if not (results_dir / name).is_file()]
    if missing:
        raise FileNotFoundError(
            "Missing thesis result inputs: " + ", ".join(sorted(missing))
        )

    _configure_style()
    evaluations = _read_csv(results_dir / "evaluation_summary.csv")
    models = _read_csv(results_dir / "model_metrics.csv")
    promotions = _read_csv(results_dir / "promotion_summary.csv")
    confusions = _read_csv(results_dir / "confusion_matrices.csv")
    results_manifest = _read_json(results_dir / "results_manifest.json")
    output_dir.mkdir(parents=True, exist_ok=True)

    builders: tuple[tuple[str, Callable[[], plt.Figure]], ...] = (
        ("odds_impact_macro_f1", lambda: _plot_odds_impact(evaluations, results_manifest)),
        (
            "classification_markets_macro_f1",
            lambda: _plot_classification_markets(evaluations, results_manifest),
        ),
        (
            "regression_targets_mae",
            lambda: _plot_regression_targets(evaluations, results_manifest),
        ),
        ("result_models_macro_f1", lambda: _plot_result_models(models, results_manifest)),
        ("calibration_metrics", lambda: _plot_calibration(evaluations, results_manifest)),
        ("promotion_outcomes", lambda: _plot_promotions(promotions, results_manifest)),
        (
            "confusion_matrices_result_btts",
            lambda: _plot_confusion_matrices(evaluations, confusions, results_manifest),
        ),
    )

    figure_entries = []
    figure_paths: list[Path] = []
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

    manifest = {
        "schema_version": 1,
        "data_cutoff": results_manifest.get("data_cutoff"),
        "test_start_date": results_manifest.get("test_start_date"),
        "sources": [
            {"name": name, "sha256": _sha256(results_dir / name)}
            for name in RESULT_FILES
        ],
        "figures": figure_entries,
    }
    manifest_path = output_dir / "figures_manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    checksum_paths = sorted([*figure_paths, manifest_path], key=lambda path: path.name)
    (output_dir / "checksums.sha256").write_text(
        "\n".join(f"{_sha256(path)}  {path.name}" for path in checksum_paths) + "\n",
        encoding="utf-8",
    )
    return manifest
