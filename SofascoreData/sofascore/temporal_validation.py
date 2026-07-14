from dataclasses import dataclass
from typing import Hashable, List

import pandas as pd


@dataclass(frozen=True)
class TemporalHoldout:
    train_index: List[Hashable]
    holdout_index: List[Hashable]
    cutoff: pd.Timestamp


def build_temporal_holdout(
    dates: pd.Series,
    holdout_fraction: float,
    min_train_rows: int = 5,
    min_holdout_rows: int = 5,
) -> TemporalHoldout:
    if not 0 < holdout_fraction < 1:
        raise ValueError("holdout_fraction must be between 0 and 1")
    if not dates.index.is_unique:
        raise ValueError("date index must be unique")

    parsed = pd.to_datetime(dates, errors="coerce", utc=True)
    invalid = int(parsed.isna().sum())
    if invalid:
        raise ValueError(f"temporal split requires valid dates; invalid rows: {invalid}")

    total_rows = len(parsed)
    if total_rows < min_train_rows + min_holdout_rows:
        raise ValueError(
            "not enough rows for temporal split: "
            f"need {min_train_rows + min_holdout_rows}, got {total_rows}"
        )

    target_holdout_rows = max(min_holdout_rows, round(total_rows * holdout_fraction))
    candidates = []
    for cutoff in sorted(parsed.unique())[1:]:
        train_count = int((parsed < cutoff).sum())
        holdout_count = total_rows - train_count
        if train_count < min_train_rows or holdout_count < min_holdout_rows:
            continue
        candidates.append((abs(holdout_count - target_holdout_rows), cutoff, holdout_count))

    if not candidates:
        raise ValueError("dates do not provide a valid strict temporal cutoff")

    _, cutoff, _ = min(candidates, key=lambda item: (item[0], item[1]))
    train_index = parsed.index[parsed < cutoff].tolist()
    holdout_index = parsed.index[parsed >= cutoff].tolist()

    train_max = parsed.loc[train_index].max()
    holdout_min = parsed.loc[holdout_index].min()
    if not train_max < holdout_min:
        raise ValueError("temporal split invariant failed: train must precede holdout")

    return TemporalHoldout(
        train_index=train_index,
        holdout_index=holdout_index,
        cutoff=pd.Timestamp(cutoff),
    )
