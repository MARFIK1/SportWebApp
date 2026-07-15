import hashlib
from typing import Dict, Tuple

import pandas as pd


BASE_ODDS_REQUIREMENTS = (
    "odds_home_win",
    "odds_draw",
    "odds_away_win",
)
SAMPLE_ID_CANDIDATES = (
    "event_id",
    "match_id",
    "id",
    "date",
    "home_team",
    "away_team",
    "home_team_id",
    "away_team_id",
    "label_result_int",
)


def build_common_odds_sample(
    dataframe: pd.DataFrame,
) -> Tuple[pd.DataFrame, Dict]:
    missing = [
        column
        for column in BASE_ODDS_REQUIREMENTS
        if column not in dataframe.columns
    ]
    if missing:
        raise ValueError(
            "paired common sample requires odds columns: "
            + ", ".join(missing)
        )

    odds_values = dataframe[list(BASE_ODDS_REQUIREMENTS)].apply(
        pd.to_numeric,
        errors="coerce",
    )
    mask = odds_values.gt(0).all(axis=1)
    filtered = dataframe.loc[mask].copy()
    if filtered.empty:
        raise ValueError("paired common sample contains no complete odds rows")

    identity_columns = [
        column
        for column in SAMPLE_ID_CANDIDATES
        if column in filtered.columns
    ]
    identity_columns.extend(
        column
        for column in BASE_ODDS_REQUIREMENTS
        if column not in identity_columns
    )
    identity_hashes = pd.util.hash_pandas_object(
        filtered[identity_columns],
        index=False,
        categorize=True,
    )
    sample_hash = hashlib.sha256(
        identity_hashes.to_numpy().tobytes()
    ).hexdigest()

    return filtered, {
        "policy": "complete_positive_base_1x2_odds",
        "rows_before": len(dataframe),
        "rows": len(filtered),
        "rows_removed": len(dataframe) - len(filtered),
        "coverage": round(float(mask.mean()), 6),
        "required_columns": list(BASE_ODDS_REQUIREMENTS),
        "identity_columns": identity_columns,
        "sample_hash": sample_hash,
    }
