from datetime import date, datetime, timedelta
from typing import Optional, Union

import pandas as pd


DateValue = Union[str, date, datetime, pd.Timestamp]


def parse_iso_date(value: DateValue, field_name: str = "date") -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, pd.Timestamp):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must use YYYY-MM-DD format") from exc


def validate_training_window(
    data_cutoff: Optional[DateValue],
    test_start_date: Optional[DateValue],
) -> tuple[Optional[date], Optional[date]]:
    parsed_cutoff = (
        parse_iso_date(data_cutoff, "data cutoff")
        if data_cutoff is not None
        else None
    )
    parsed_test_start = (
        parse_iso_date(test_start_date, "test start date")
        if test_start_date is not None
        else None
    )
    if (
        parsed_cutoff is not None
        and parsed_test_start is not None
        and parsed_test_start > parsed_cutoff
    ):
        raise ValueError("test start date must not be later than data cutoff")
    return parsed_cutoff, parsed_test_start


def filter_dataframe_to_cutoff(
    dataframe: pd.DataFrame,
    data_cutoff: Optional[DateValue],
    date_column: str = "date",
) -> tuple[pd.DataFrame, dict]:
    rows_before = len(dataframe)
    if data_cutoff is None:
        return dataframe.copy(), {
            "policy": "unbounded",
            "data_cutoff": None,
            "rows_before": rows_before,
            "rows": rows_before,
            "rows_removed_after_cutoff": 0,
        }
    if date_column not in dataframe.columns:
        raise ValueError(f"data cutoff requires '{date_column}' column")

    parsed_cutoff = parse_iso_date(data_cutoff, "data cutoff")
    parsed_dates = pd.to_datetime(
        dataframe[date_column],
        format="mixed",
        errors="coerce",
        utc=True,
    )
    invalid = int(parsed_dates.isna().sum())
    if invalid:
        raise ValueError(
            f"data cutoff requires valid dates; invalid rows: {invalid}"
        )

    cutoff_exclusive = pd.Timestamp(parsed_cutoff, tz="UTC") + timedelta(days=1)
    mask = parsed_dates < cutoff_exclusive
    filtered = dataframe.loc[mask].copy()
    if filtered.empty:
        raise ValueError(f"data cutoff {parsed_cutoff.isoformat()} removed every row")

    retained_dates = parsed_dates.loc[filtered.index]
    return filtered, {
        "policy": "inclusive_data_cutoff",
        "data_cutoff": parsed_cutoff.isoformat(),
        "rows_before": rows_before,
        "rows": len(filtered),
        "rows_removed_after_cutoff": rows_before - len(filtered),
        "date_min": retained_dates.min().date().isoformat(),
        "date_max": retained_dates.max().date().isoformat(),
    }
