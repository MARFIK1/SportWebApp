"""
Universal Match Predictor.
"""

import json
import os
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
from pathlib import Path

from sklearn.ensemble import (
    RandomForestClassifier, VotingClassifier, GradientBoostingClassifier,
    StackingClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split, cross_val_score, TimeSeriesSplit
from sklearn.metrics import (
    accuracy_score, classification_report,
    precision_score, recall_score, f1_score,
    mean_absolute_error, mean_squared_error, r2_score,
)
from sklearn.calibration import CalibratedClassifierCV
from sklearn.base import BaseEstimator, ClassifierMixin, clone
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestRegressor
import joblib
import time
import psutil
import tempfile

from xgboost import XGBClassifier, XGBRegressor
from lightgbm import LGBMClassifier, LGBMRegressor
from sofascore.lstm_model import LSTMPredictor, HAS_TORCH
import optuna
optuna.logging.set_verbosity(optuna.logging.WARNING)

try:
    from sklearn.frozen import FrozenEstimator
except ImportError:
    FrozenEstimator = None


COMPETITION_TYPES = ['league', 'cups', 'european', 'international']


def _configure_estimator_for_single_thread_inference(estimator, seen=None):
    """Avoid spawning joblib worker pools for single-match predictions."""
    if estimator is None:
        return

    if seen is None:
        seen = set()

    obj_id = id(estimator)
    if obj_id in seen:
        return
    seen.add(obj_id)

    for attr_name, attr_value in (
        ('n_jobs', 1),
        ('thread_count', 1),
        ('nthread', 1),
    ):
        if hasattr(estimator, attr_name):
            try:
                setattr(estimator, attr_name, attr_value)
            except Exception:
                pass

    nested_attrs = (
        'estimator',
        'base_estimator',
        'final_estimator',
        'best_estimator_',
    )
    for attr_name in nested_attrs:
        _configure_estimator_for_single_thread_inference(
            getattr(estimator, attr_name, None),
            seen,
        )

    collection_attrs = (
        'estimators',
        'estimators_',
        'named_estimators_',
        'calibrated_classifiers_',
        'steps',
        'named_steps',
    )
    for attr_name in collection_attrs:
        children = getattr(estimator, attr_name, None)
        if children is None:
            continue

        if isinstance(children, dict):
            iterable = children.values()
        else:
            iterable = children

        for child in iterable:
            if isinstance(child, tuple) and len(child) == 2:
                child = child[1]
            _configure_estimator_for_single_thread_inference(child, seen)


def _sort_training_rows_by_date(X, y, dates=None, sample_weights=None):
    """Sort training rows chronologically before any temporal CV/tuning."""
    if dates is None:
        return X, y, sample_weights, None

    parsed_dates = pd.to_datetime(dates.loc[X.index], errors='coerce')
    sort_keys = parsed_dates.where(parsed_dates.notna(), pd.Timestamp.max)
    sort_idx = sort_keys.sort_values(kind='mergesort').index

    X_sorted = X.loc[sort_idx]
    y_sorted = y.loc[sort_idx]
    sorted_dates = parsed_dates.loc[sort_idx]

    if sample_weights is None:
        sorted_weights = None
    else:
        sorted_weights = pd.Series(sample_weights, index=X.index).loc[sort_idx].values

    return X_sorted, y_sorted, sorted_weights, sorted_dates


class TemporalStackingClassifier(BaseEstimator, ClassifierMixin):
    """Time-aware stacking using expanding-window out-of-fold meta features."""

    def __init__(self, estimators, final_estimator=None, n_splits=3):
        self.estimators = estimators
        self.final_estimator = final_estimator or LogisticRegression(max_iter=1000, C=1.0)
        self.n_splits = n_splits

    @staticmethod
    def _proba_to_meta_features(proba):
        if proba.ndim == 1:
            return proba.reshape(-1, 1)
        if proba.shape[1] == 2:
            return proba[:, 1].reshape(-1, 1)
        return proba

    @staticmethod
    def _fit_estimator(estimator, X, y, sample_weight=None):
        if sample_weight is None:
            estimator.fit(X, y)
            return estimator
        try:
            estimator.fit(X, y, sample_weight=sample_weight)
        except TypeError:
            estimator.fit(X, y)
        return estimator

    def fit(self, X, y, sample_weight=None):
        if hasattr(X, 'iloc'):
            X_train = X
        else:
            X_train = pd.DataFrame(X)

        if hasattr(y, 'iloc'):
            y_train = y
        else:
            y_train = pd.Series(y, index=X_train.index)

        n_samples = len(X_train)
        if n_samples < (self.n_splits + 1) * 2:
            raise ValueError("Not enough samples for temporal stacking")

        blocks = [block for block in np.array_split(np.arange(n_samples), self.n_splits + 1) if len(block) > 0]
        if len(blocks) < 2:
            raise ValueError("Not enough chronological blocks for temporal stacking")

        meta_rows = []
        meta_targets = []
        meta_weights = []

        for block_idx in range(1, len(blocks)):
            train_pos = np.concatenate(blocks[:block_idx])
            test_pos = blocks[block_idx]

            if len(train_pos) == 0 or len(test_pos) == 0:
                continue

            fold_parts = []
            for _, estimator in self.estimators:
                fold_model = clone(estimator)
                fit_weights = sample_weight[train_pos] if sample_weight is not None else None
                self._fit_estimator(
                    fold_model,
                    X_train.iloc[train_pos],
                    y_train.iloc[train_pos],
                    fit_weights,
                )
                proba = fold_model.predict_proba(X_train.iloc[test_pos])
                fold_parts.append(self._proba_to_meta_features(proba))

            meta_rows.append(np.hstack(fold_parts))
            meta_targets.append(y_train.iloc[test_pos].to_numpy())
            if sample_weight is not None:
                meta_weights.append(sample_weight[test_pos])

        if not meta_rows:
            raise ValueError("Temporal stacking could not build any out-of-fold meta features")

        meta_X = np.vstack(meta_rows)
        meta_y = np.concatenate(meta_targets)
        meta_w = np.concatenate(meta_weights) if meta_weights else None

        self.final_estimator_ = clone(self.final_estimator)
        self._fit_estimator(self.final_estimator_, meta_X, meta_y, meta_w)

        self.estimators_ = []
        for name, estimator in self.estimators:
            fitted = clone(estimator)
            self._fit_estimator(fitted, X_train, y_train, sample_weight)
            self.estimators_.append((name, fitted))

        self.classes_ = np.unique(y_train)
        return self

    def _transform(self, X):
        if hasattr(X, 'iloc'):
            X_data = X
        else:
            X_data = pd.DataFrame(X)

        parts = []
        for _, estimator in self.estimators_:
            proba = estimator.predict_proba(X_data)
            parts.append(self._proba_to_meta_features(proba))
        return np.hstack(parts)

    def predict(self, X):
        meta_X = self._transform(X)
        return self.final_estimator_.predict(meta_X)

    def predict_proba(self, X):
        meta_X = self._transform(X)
        if hasattr(self.final_estimator_, 'predict_proba'):
            return self.final_estimator_.predict_proba(meta_X)

        preds = self.final_estimator_.predict(meta_X)
        proba = np.zeros((len(preds), len(self.classes_)))
        for idx, cls in enumerate(self.classes_):
            proba[:, idx] = (preds == cls).astype(float)
        return proba


META_COLUMNS = {
    'event_id', 'date', 'round', 'home_team', 'away_team',
    'home_team_id', 'away_team_id',
    'comp_type', 'country', 'competition', 'league',
    'home_score', 'away_score', 'home_score_ht', 'away_score_ht', 'status',
}

LABEL_COLUMNS = {
    'label_result', 'label_result_int', 'label_home_goals', 'label_away_goals',
    'label_total_goals', 'label_btts', 'label_over_2_5', 'label_over_1_5',
    'label_total_corners', 'label_corners_over_8_5', 'label_corners_over_10_5',
    'label_total_cards', 'label_cards_over_3_5', 'label_cards_over_4_5',
}


FEATURE_COLUMNS = [
    'home_rest_days', 'away_rest_days', 'rest_days_diff',
    'home_is_congested', 'away_is_congested',
    'home_form_points', 'away_form_points', 'form_points_diff',
    'home_form_avg_points', 'away_form_avg_points',
    'home_form_wins', 'away_form_wins',
    'home_form_draws', 'away_form_draws',
    'home_form_losses', 'away_form_losses',
    'home_form_goals_for', 'away_form_goals_for',
    'home_form_goals_against', 'away_form_goals_against',
    'home_form_goal_diff', 'away_form_goal_diff',
    'home_form_xg_for', 'away_form_xg_for',
    'home_form_xg_against', 'away_form_xg_against',
    'home_form_xg_diff', 'away_form_xg_diff', 'xg_form_diff',
    'home_form_clean_sheets', 'away_form_clean_sheets',
    'home_form10_points', 'away_form10_points', 'form10_points_diff',
    'home_form10_avg_points', 'away_form10_avg_points',
    'home_form10_wins', 'away_form10_wins',
    'home_form10_goals_for', 'away_form10_goals_for',
    'home_form10_goals_against', 'away_form10_goals_against',
    'home_form10_goal_diff', 'away_form10_goal_diff',
    'home_form10_xg_for', 'away_form10_xg_for',
    'home_form10_xg_diff', 'away_form10_xg_diff',
    'home_form10_clean_sheets', 'away_form10_clean_sheets',
    'home_avg_player_rating', 'away_avg_player_rating', 'player_rating_diff',
    'home_top_scorer_goals', 'away_top_scorer_goals',
    'home_total_team_goals', 'away_total_team_goals',
    'home_total_team_assists', 'away_total_team_assists',
    'home_avg_minutes_starters', 'away_avg_minutes_starters',
    'home_squad_avg_age', 'away_squad_avg_age',
    'home_table_position', 'away_table_position', 'position_diff',
    'home_table_points', 'away_table_points', 'points_diff',
    'home_table_goal_diff', 'away_table_goal_diff',
    'home_table_ppg', 'away_table_ppg', 'ppg_diff',
    'h2h_matches', 'h2h_home_wins', 'h2h_away_wins', 'h2h_draws',
    'h2h_home_goals', 'h2h_away_goals', 'h2h_home_win_rate',
    'home_momentum_points', 'away_momentum_points', 'momentum_diff',
    'home_momentum_goals', 'away_momentum_goals',
    'home_momentum_xg', 'away_momentum_xg',
    'home_venue_form_points', 'away_venue_form_points', 'venue_ppg_diff',
    'home_venue_form_ppg', 'away_venue_form_ppg',
    'home_venue_form_goals_for', 'away_venue_form_goals_for',
    'home_venue_form_goals_against', 'away_venue_form_goals_against',
    'home_venue_form_clean_sheets', 'away_venue_form_clean_sheets',
    'home_fatigue_matches', 'away_fatigue_matches', 'fatigue_diff',
    'home_fatigue_avg_days', 'away_fatigue_avg_days',
    'home_sos_avg_position', 'away_sos_avg_position', 'sos_diff',
    'home_sos_avg_ppg', 'away_sos_avg_ppg',
    'home_clean_sheet_pct', 'away_clean_sheet_pct',
    'home_failed_to_score_pct', 'away_failed_to_score_pct',
    'home_elo', 'away_elo', 'elo_diff',
    'home_wform_ppg', 'away_wform_ppg', 'wform_ppg_diff',
    'home_wform_goals_for', 'away_wform_goals_for',
    'home_wform_goals_against', 'away_wform_goals_against',
    'home_wform_xg_diff', 'away_wform_xg_diff', 'wform_xg_diff',
    'home_wform_clean_sheets', 'away_wform_clean_sheets',
    'odds_home_win', 'odds_draw', 'odds_away_win',
    'odds_home_prob', 'odds_draw_prob', 'odds_away_prob',
    'odds_overround',
    'odds_over_2_5', 'odds_under_2_5', 'odds_over_2_5_prob',
    'odds_btts_yes', 'odds_btts_no', 'odds_btts_prob',
]

RESULT_MAP = {0: 'HOME', 1: 'DRAW', 2: 'AWAY'}
BINARY_MAP = {0: 'NO', 1: 'YES'}

TARGET_CONFIGS = {
    'result': {
        'label_col': 'label_result_int',
        'num_classes': 3,
        'class_names': RESULT_MAP,
        'task': 'multiclass',
    },
    'btts': {
        'label_col': 'label_btts',
        'num_classes': 2,
        'class_names': {0: 'NO', 1: 'YES'},
        'task': 'binary',
    },
    'over_2_5': {
        'label_col': 'label_over_2_5',
        'num_classes': 2,
        'class_names': {0: 'UNDER', 1: 'OVER'},
        'task': 'binary',
    },
    'over_1_5': {
        'label_col': 'label_over_1_5',
        'num_classes': 2,
        'class_names': {0: 'UNDER', 1: 'OVER'},
        'task': 'binary',
    },
    'corners_over_8_5': {
        'label_col': 'label_corners_over_8_5',
        'num_classes': 2,
        'class_names': {0: 'UNDER', 1: 'OVER'},
        'task': 'binary',
    },
    'corners_over_10_5': {
        'label_col': 'label_corners_over_10_5',
        'num_classes': 2,
        'class_names': {0: 'UNDER', 1: 'OVER'},
        'task': 'binary',
    },
    'cards_over_3_5': {
        'label_col': 'label_cards_over_3_5',
        'num_classes': 2,
        'class_names': {0: 'UNDER', 1: 'OVER'},
        'task': 'binary',
    },
    'cards_over_4_5': {
        'label_col': 'label_cards_over_4_5',
        'num_classes': 2,
        'class_names': {0: 'UNDER', 1: 'OVER'},
        'task': 'binary',
    },
    'total_goals': {
        'label_col': 'label_total_goals',
        'task': 'regression',
    },
    'total_corners': {
        'label_col': 'label_total_corners',
        'task': 'regression',
    },
    'total_cards': {
        'label_col': 'label_total_cards',
        'task': 'regression',
    },
}


class UniversalPredictor:

    def __init__(self, data_dir: str):
        self.data_dir = Path(data_dir)
        self.models = {}
        self.scalers = {}
        self.feature_columns_by_target = {}
        self.scaler = StandardScaler()
        self.trained = False
        self.feature_columns = []   # Backward compat (result target)
        self.training_stats = {}

    @staticmethod
    def _filter_positive_odds(
        df: pd.DataFrame,
        target: str,
        odds_requirements: Optional[Dict[str, List[str]]],
    ) -> pd.DataFrame:
        if not odds_requirements:
            return df

        required_cols = list(dict.fromkeys(
            odds_requirements.get('__all__', []) + odds_requirements.get(target, [])
        ))
        if not required_cols:
            return df

        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            print(
                f"\n  [SKIP] Target '{target}' - missing required odds columns: "
                f"{', '.join(missing_cols)}"
            )
            return df.iloc[0:0].copy()

        odds_values = df[required_cols].apply(pd.to_numeric, errors='coerce')
        mask = odds_values.gt(0).all(axis=1)
        filtered = df.loc[mask].copy()
        removed = len(df) - len(filtered)

        if removed > 0:
            print(
                f"  Odds completeness filter for {target}: "
                f"keeping {len(filtered)} of {len(df)} rows "
                f"({removed} missing/non-positive odds)"
            )

        return filtered
        
    def discover_all_competitions(self) -> Dict[str, Dict[str, List[str]]]:
        discovered = {}

        for comp_type in COMPETITION_TYPES:
            comp_dir = self.data_dir / comp_type
            if not comp_dir.exists():
                continue

            discovered[comp_type] = {}

            if comp_type == 'european':
                # european/{competition}/ - flat structure, no country subfolder
                for comp_subdir in comp_dir.iterdir():
                    if not comp_subdir.is_dir():
                        continue
                    features_dir = comp_subdir / 'features'
                    if features_dir.exists() and any(features_dir.glob('*.json')):
                        discovered[comp_type].setdefault('uefa', []).append(comp_subdir.name)
                continue

            for country_dir in comp_dir.iterdir():
                if not country_dir.is_dir():
                    continue
                country = country_dir.name
                discovered[comp_type][country] = []

                for comp_subdir in country_dir.iterdir():
                    if not comp_subdir.is_dir():
                        continue
                    features_dir = comp_subdir / 'features'
                    if features_dir.exists() and any(features_dir.glob('*.json')):
                        discovered[comp_type][country].append(comp_subdir.name)

        return discovered
    
    def discover_leagues(self) -> Dict[str, List[str]]:
        """Backwards compatible wrapper for discover_all_competitions."""
        all_comps = self.discover_all_competitions()
        return all_comps.get('league', {})
    
    def load_competition_data(self, comp_type: str, country: str, competition: str,
                               seasons: Optional[List[str]] = None) -> pd.DataFrame:
        if comp_type == 'european':
            features_path = self.data_dir / comp_type / competition / 'features'
        else:
            features_path = self.data_dir / comp_type / country / competition / 'features'
        
        if not features_path.exists():
            return pd.DataFrame()
        
        all_seasons_path = features_path / 'features_all_seasons.json'
        if all_seasons_path.exists() and seasons is None:
            with open(all_seasons_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            df = pd.DataFrame(data.get('samples', []))
            df['comp_type'] = comp_type
            df['country'] = country
            df['competition'] = competition
            return df
        
        dfs = []
        for file in features_path.glob('features_*.json'):
            if 'all_seasons' in file.name:
                continue
            with open(file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            season_df = pd.DataFrame(data.get('samples', []))
            season_df['comp_type'] = comp_type
            season_df['country'] = country
            season_df['competition'] = competition
            dfs.append(season_df)
        
        if dfs:
            return pd.concat(dfs, ignore_index=True)
        return pd.DataFrame()
    
    def load_league_data(self, country: str, league: str, 
                         seasons: Optional[List[str]] = None) -> pd.DataFrame:
        """Load feature data for a specific league (backwards compatible)."""
        df = self.load_competition_data('league', country, league, seasons)
        if not df.empty:
            df['league'] = league  # backwards compatibility
        return df
    
    def load_all_data(self, comp_types: Optional[List[str]] = None,
                      countries: Optional[List[str]] = None) -> pd.DataFrame:
        all_data = []
        discovered = self.discover_all_competitions()
        
        types_to_load = comp_types if comp_types else COMPETITION_TYPES
        
        for comp_type in types_to_load:
            if comp_type not in discovered:
                continue
            
            for country, competitions in discovered[comp_type].items():
                if countries and country not in countries:
                    continue
                    
                for competition in competitions:
                    df = self.load_competition_data(comp_type, country, competition)
                    if not df.empty:
                        if 'label_result_int' in df.columns:
                            df_finished = df[df['label_result_int'].notna()]
                            if not df_finished.empty:
                                all_data.append(df_finished)
                                print(f"  Loaded: {comp_type}/{country}/{competition} ({len(df_finished)} matches)")
        
        if all_data:
            return pd.concat(all_data, ignore_index=True)
        return pd.DataFrame()
    
    def load_all_leagues(self, countries: Optional[List[str]] = None) -> pd.DataFrame:
        """Backwards compatible wrapper - loads all competition types."""
        return self.load_all_data(countries=countries)
    
    def prepare_data(self, df: pd.DataFrame, target: str = 'result') -> Tuple[pd.DataFrame, pd.Series, Dict]:
        """Returns (X, y, meta) with auto-discovered numeric features."""
        config = TARGET_CONFIGS[target]
        label_col = config['label_col']

        if label_col not in df.columns:
            raise ValueError(f"Missing '{label_col}' column for target '{target}'")

        skip = META_COLUMNS | LABEL_COLUMNS
        numeric_cols = df.select_dtypes(include='number').columns.tolist()
        discovered = [c for c in numeric_cols if c not in skip]

        known = [c for c in FEATURE_COLUMNS if c in discovered]
        new_features = [c for c in discovered if c not in set(FEATURE_COLUMNS)]
        feature_cols = known + new_features

        if not feature_cols:
            raise ValueError("No feature columns found in data")

        if new_features:
            print(f"  Auto-discovered {len(new_features)} new features beyond reference list")

        min_non_null_ratio = 0.5
        non_null_ratio = df[feature_cols].notna().mean()
        sparse_features = non_null_ratio[non_null_ratio < min_non_null_ratio].index.tolist()
        if sparse_features:
            feature_cols = [c for c in feature_cols if c not in set(sparse_features)]
            print(
                f"  Sparse feature filter: dropping {len(sparse_features)} features "
                f"(coverage < {min_non_null_ratio:.0%})"
            )

        group_cols = [c for c in ['comp_type', 'country', 'competition'] if c in df.columns]
        extra_cols = (['date'] if 'date' in df.columns else []) + group_cols

        cols_needed = list(set(feature_cols + [label_col] + extra_cols))
        df_clean = df[cols_needed].copy()
        df_clean = df_clean.dropna(subset=[label_col])

        feature_na_count = int(df_clean[feature_cols].isna().sum().sum())
        if feature_na_count:
            df_clean[feature_cols] = df_clean[feature_cols].fillna(0)

        X = df_clean[feature_cols]
        if config.get('task') == 'regression':
            y = df_clean[label_col].astype(float)
        else:
            y = df_clean[label_col].astype(int)

        meta = {}
        if 'date' in df_clean.columns:
            meta['date'] = df_clean['date']
        for col in group_cols:
            meta[col] = df_clean[col]

        return X, y, meta
    
    def train_all_models(self, df: pd.DataFrame, test_size: float = 0.2,
                         targets: Optional[List[str]] = None,
                         odds_requirements: Optional[Dict[str, List[str]]] = None) -> Dict:
        if targets is None:
            targets = ['result', 'btts', 'over_2_5', 'over_1_5']

        all_results = {}
        for target in targets:
            if target not in TARGET_CONFIGS:
                print(f"\n  [SKIP] Target '{target}' - unknown target")
                continue
            config = TARGET_CONFIGS[target]
            label_col = config['label_col']
            if label_col not in df.columns:
                print(f"\n  [SKIP] Target '{target}' - missing column '{label_col}' in data")
                continue

            target_df = self._filter_positive_odds(df, target, odds_requirements)
            if target_df.empty:
                print(f"\n  [SKIP] Target '{target}' - no rows after odds completeness filter")
                continue

            print(f"\n{'='*70}")
            task_label = config.get('task', 'multiclass').upper()
            print(f"  TRAINING TARGET: {target.upper()} [{task_label}]")
            print(f"{'='*70}")

            results = self._train_target(target_df, target, test_size)
            all_results[target] = results

        self.trained = True

        if 'result' in self.feature_columns_by_target:
            self.feature_columns = self.feature_columns_by_target['result']
        if 'result' in self.scalers:
            self.scaler = self.scalers['result']

        print("\n" + "=" * 70)
        print("ALL TARGETS TRAINING COMPLETE")
        print("=" * 70)
        for target, results in all_results.items():
            if not results:
                continue
            config = TARGET_CONFIGS.get(target, {})
            if config.get('task') == 'regression':
                best = min(results, key=results.get)
                print(f"  {target:20s}: best = {best} (MAE={results[best]:.3f})")
            else:
                best = max(results, key=results.get)
                print(f"  {target:20s}: best = {best} ({results[best]:.1%})")

        return all_results

    def _optuna_tune(self, X_train, y_train, sample_weights, target, n_trials=50):
        config = TARGET_CONFIGS[target]
        is_binary = config['task'] == 'binary'
        tscv = TimeSeriesSplit(n_splits=3)

        xgb_best = {}
        lgb_best = {}

        def xgb_objective(trial):
            params = {
                'n_estimators': trial.suggest_int('n_estimators', 300, 600),
                'max_depth': trial.suggest_int('max_depth', 4, 8),
                'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.08, log=True),
                'subsample': trial.suggest_float('subsample', 0.7, 0.9),
                'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 0.9),
                'min_child_weight': trial.suggest_int('min_child_weight', 3, 10),
                'gamma': trial.suggest_float('gamma', 0.05, 0.5),
                'random_state': 42, 'n_jobs': -1,
            }
            if is_binary:
                params['eval_metric'] = 'logloss'
                params['objective'] = 'binary:logistic'
            else:
                params['eval_metric'] = 'mlogloss'
            model = XGBClassifier(**params)
            scores = cross_val_score(model, X_train, y_train, cv=tscv,
                                     scoring='accuracy', n_jobs=-1,
                                     params={'sample_weight': sample_weights})
            return scores.mean()

        study = optuna.create_study(direction='maximize')
        study.optimize(xgb_objective, n_trials=n_trials, show_progress_bar=False)
        xgb_best = study.best_params
        print(f"Optuna XGBoost: acc={study.best_value:.4f} ({n_trials} trials)")

        def lgb_objective(trial):
            params = {
                'n_estimators': trial.suggest_int('n_estimators', 300, 600),
                'max_depth': trial.suggest_int('max_depth', 6, 14),
                'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.08, log=True),
                'subsample': trial.suggest_float('subsample', 0.7, 0.9),
                'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 0.9),
                'min_child_samples': trial.suggest_int('min_child_samples', 15, 40),
                'reg_alpha': trial.suggest_float('reg_alpha', 0.05, 0.5),
                'reg_lambda': trial.suggest_float('reg_lambda', 0.05, 0.5),
                'is_unbalance': True,
                'random_state': 42, 'n_jobs': -1, 'verbose': -1,
            }
            if is_binary:
                params['objective'] = 'binary'
            model = LGBMClassifier(**params)
            scores = cross_val_score(model, X_train, y_train, cv=tscv,
                                     scoring='accuracy', n_jobs=-1,
                                     params={'sample_weight': sample_weights})
            return scores.mean()

        study = optuna.create_study(direction='maximize')
        study.optimize(lgb_objective, n_trials=n_trials, show_progress_bar=False)
        lgb_best = study.best_params
        print(f"Optuna LightGBM: acc={study.best_value:.4f} ({n_trials} trials)")

        return xgb_best, lgb_best

    def _build_model_configs(self, target: str, y_train: pd.Series = None,
                             xgb_params: Dict = None, lgb_params: Dict = None) -> Dict:
        config = TARGET_CONFIGS[target]
        is_binary = config['task'] == 'binary'

        model_configs = {
            'Logistic Regression': {
                'model': LogisticRegression(
                    max_iter=1000, C=0.5, class_weight='balanced', random_state=42
                ),
                'scaled': True,
                'sample_weight': False,
            },
            'Random Forest': {
                'model': RandomForestClassifier(
                    n_estimators=400, max_depth=15, min_samples_split=10,
                    min_samples_leaf=5, class_weight='balanced_subsample',
                    random_state=42, n_jobs=-1
                ),
                'scaled': False,
                'sample_weight': False,
            },
            'KNN': {
                'model': KNeighborsClassifier(n_neighbors=11, weights='distance', n_jobs=-1),
                'scaled': True,
                'sample_weight': False,
            },
            'MLP': {
                'model': MLPClassifier(
                    hidden_layer_sizes=(128, 64, 32), max_iter=600,
                    learning_rate_init=0.001, early_stopping=True,
                    validation_fraction=0.15, random_state=42
                ),
                'scaled': True,
                'sample_weight': False,
            },
        }

        xgb_defaults = dict(
            n_estimators=400, max_depth=7, learning_rate=0.03,
            subsample=0.8, colsample_bytree=0.8,
            min_child_weight=3, gamma=0.1,
            random_state=42, n_jobs=-1,
        )
        if xgb_params:
            xgb_defaults.update(xgb_params)
            xgb_defaults['random_state'] = 42
            xgb_defaults['n_jobs'] = -1
        if is_binary:
            xgb_defaults['eval_metric'] = 'logloss'
            xgb_defaults['objective'] = 'binary:logistic'
        else:
            xgb_defaults['eval_metric'] = 'mlogloss'
        model_configs['XGBoost'] = {
            'model': XGBClassifier(**xgb_defaults),
            'scaled': False,
            'sample_weight': True,
        }

        lgb_defaults = dict(
            n_estimators=400, max_depth=12, learning_rate=0.03,
            subsample=0.8, colsample_bytree=0.8, is_unbalance=True,
            min_child_samples=20, reg_alpha=0.1, reg_lambda=0.1,
            random_state=42, n_jobs=-1, verbose=-1,
        )
        if lgb_params:
            lgb_defaults.update(lgb_params)
            lgb_defaults['random_state'] = 42
            lgb_defaults['n_jobs'] = -1
            lgb_defaults['verbose'] = -1
        if is_binary:
            lgb_defaults['objective'] = 'binary'
        model_configs['LightGBM'] = {
            'model': LGBMClassifier(**lgb_defaults),
            'scaled': False,
            'sample_weight': False,
        }

        return model_configs

    def _train_target(self, df: pd.DataFrame, target: str, test_size: float) -> Dict:
        config = TARGET_CONFIGS[target]
        is_regression = config.get('task') == 'regression'

        X, y, meta = self.prepare_data(df, target)
        feature_cols = X.columns.tolist()

        print(f"\n  Dataset: {len(X)} matches, {len(feature_cols)} features")
        if is_regression:
            print(f"  Label stats: mean={y.mean():.2f}, std={y.std():.2f}, "
                  f"min={y.min():.0f}, max={y.max():.0f}")
        else:
            class_names = config['class_names']
            print(f"  Class distribution:")
            for cls, name in class_names.items():
                count = (y == cls).sum()
                print(f"    {name}: {count} ({count / len(y) * 100:.1f}%)")

        dates = meta.get('date')

        if dates is not None:
            group_parts = []
            for col in ['comp_type', 'country', 'competition']:
                if col in meta:
                    group_parts.append(meta[col].astype(str))

            if group_parts:
                comp_groups = group_parts[0]
                for part in group_parts[1:]:
                    comp_groups = comp_groups + '/' + part
            else:
                comp_groups = pd.Series('all', index=X.index)

            train_idx, test_idx = [], []
            for group_name in comp_groups.unique():
                mask = comp_groups == group_name
                group_dates = dates[mask].sort_values()
                n = len(group_dates)
                split = int(n * (1 - test_size))

                if split < 5 or (n - split) < 5:
                    train_idx.extend(group_dates.index.tolist())
                    continue
                train_idx.extend(group_dates.iloc[:split].index.tolist())
                test_idx.extend(group_dates.iloc[split:].index.tolist())

            X_train, X_test = X.loc[train_idx], X.loc[test_idx]
            y_train, y_test = y.loc[train_idx], y.loc[test_idx]
            n_comps = comp_groups.nunique()
            print(f"\n  Per-competition temporal split ({n_comps} competitions):")
            print(f"    Train: {len(X_train)}, Test: {len(X_test)}")
        else:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=42, stratify=y
            )
            print(f"\n  Random split: Train: {len(X_train)}, Test: {len(X_test)}")

        corr_matrix = X_train.corr().abs()
        upper_tri = corr_matrix.where(
            np.triu(np.ones(corr_matrix.shape, dtype=bool), k=1)
        )
        corr_drop = [col for col in upper_tri.columns if any(upper_tri[col] > 0.95)]
        if corr_drop:
            print(f"  Correlation filter: removing {len(corr_drop)} features (r > 0.95)")
            X_train = X_train.drop(columns=corr_drop)
            X_test = X_test.drop(columns=corr_drop)
            feature_cols = [c for c in feature_cols if c not in set(corr_drop)]

        if is_regression:
            from sklearn.feature_selection import mutual_info_regression
            mi_scores = mutual_info_regression(X_train, y_train, random_state=42, n_neighbors=5)
        else:
            from sklearn.feature_selection import mutual_info_classif
            mi_scores = mutual_info_classif(X_train, y_train, random_state=42, n_neighbors=5)
        mi_series = pd.Series(mi_scores, index=X_train.columns).sort_values(ascending=False)

        task = config.get('task', 'multiclass')
        if task in ('binary', 'regression'):
            mi_threshold = 0.003
        else:
            mi_threshold = 0.005

        useful_features = mi_series[mi_series > mi_threshold].index.tolist()

        MIN_FEATURES = 10
        if len(useful_features) < MIN_FEATURES:
            useful_features = mi_series.head(MIN_FEATURES).index.tolist()

        max_features = 60
        if len(useful_features) > max_features:
            useful_features = useful_features[:max_features]

        mi_removed = len(X_train.columns) - len(useful_features)
        if mi_removed > 0:
            print(f"  MI selection: keeping {len(useful_features)} of {len(X_train.columns)} "
                  f"(threshold={mi_threshold}, removed {mi_removed})")
            X_train = X_train[useful_features]
            X_test = X_test[useful_features]
            feature_cols = useful_features

        print(f"  Top 5 features (MI): {', '.join(mi_series.head(5).index)}")
        print(f"  Final features: {len(feature_cols)}")

        self.feature_columns_by_target[target] = feature_cols

        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)
        self.scalers[target] = scaler

        if is_regression:
            return self._train_regression_models(
                target, config, X_train, X_test, X_train_scaled, X_test_scaled,
                y_train, y_test, feature_cols, scaler, X, meta, df
            )

        from sklearn.utils.class_weight import compute_sample_weight
        sample_weights = compute_sample_weight('balanced', y_train)

        train_dates = meta.get('date')
        if train_dates is not None:
            train_dates_dt = pd.to_datetime(train_dates.loc[X_train.index], errors='coerce')
            max_date = train_dates_dt.max()
            days_ago = (max_date - train_dates_dt).dt.days.fillna(0).values
            temporal_weights = np.exp(-days_ago / 365.0)
            sample_weights = sample_weights * temporal_weights
            print(f"Temporal weighting: decay=365d, range=[{temporal_weights.min():.3f}, {temporal_weights.max():.3f}]")

        X_model_train = X_train
        y_model_train = y_train
        sample_weights_model = sample_weights
        model_train_dates = None
        X_cal_raw = None
        X_cal_scaled = None
        y_cal = None

        min_model_rows = max(200, config.get('num_classes', 2) * 50)
        desired_cal_size = max(200, int(len(X_train) * 0.15))
        max_cal_size = max(0, len(X_train) - min_model_rows)
        cal_size = min(desired_cal_size, max_cal_size)

        if cal_size >= max(50, config.get('num_classes', 2) * 10):
            if train_dates is not None:
                sorted_dates = pd.to_datetime(train_dates.loc[X_train.index], errors='coerce')
                sorted_idx = sorted_dates.sort_values().index
                cal_idx = list(sorted_idx[-cal_size:])
            else:
                rng = np.random.RandomState(42)
                cal_pos = rng.permutation(len(X_train))[:cal_size]
                cal_idx = list(X_train.iloc[cal_pos].index)

            cal_idx_set = set(cal_idx)
            fit_idx = [idx for idx in X_train.index if idx not in cal_idx_set]
            candidate_y = y_train.loc[fit_idx]

            if candidate_y.nunique() == y_train.nunique():
                weights_by_index = pd.Series(sample_weights, index=X_train.index)
                X_model_train = X_train.loc[fit_idx]
                y_model_train = candidate_y
                sample_weights_model = weights_by_index.loc[fit_idx].values
                X_cal_raw = X_train.loc[cal_idx]
                X_cal_scaled = scaler.transform(X_cal_raw)
                y_cal = y_train.loc[cal_idx]
                print(f"Calibration holdout: train={len(X_model_train)}, cal={len(X_cal_raw)}")
            else:
                print("Calibration holdout skipped: not all classes remain in training split")

        X_model_train, y_model_train, sample_weights_model, model_train_dates = _sort_training_rows_by_date(
            X_model_train,
            y_model_train,
            train_dates if train_dates is not None else None,
            sample_weights_model,
        )
        if model_train_dates is not None:
            print("Chronological order enforced for tuning and meta-model training")

        xgb_tuned, lgb_tuned = self._optuna_tune(
            X_model_train, y_model_train, sample_weights_model, target, n_trials=50
        )

        model_configs = self._build_model_configs(
            target, y_train=y_model_train,
            xgb_params=xgb_tuned, lgb_params=lgb_tuned,
        )

        self.models[target] = {}
        results = {}
        detailed_metrics = {}

        is_binary = config['task'] == 'binary'
        avg_method = 'binary' if is_binary else 'weighted'

        print(f"\n  Training models...")
        for name, mc in model_configs.items():
            X_tr = scaler.transform(X_model_train) if mc['scaled'] else X_model_train
            X_te = X_test_scaled if mc['scaled'] else X_test

            base_model = mc['model']

            proc = psutil.Process()
            mem_before = proc.memory_info().rss / 1024 / 1024
            cpu_before = proc.cpu_times()
            t0 = time.time()

            try:
                if mc.get('sample_weight'):
                    base_model.fit(X_tr, y_model_train, sample_weight=sample_weights_model)
                else:
                    base_model.fit(X_tr, y_model_train)
                model = base_model
            except Exception as e:
                print(f"    {name}: training failed ({e})")
                continue

            train_time = time.time() - t0
            cpu_after = proc.cpu_times()
            cpu_train_s = (cpu_after.user - cpu_before.user) + (cpu_after.system - cpu_before.system)
            mem_after = proc.memory_info().rss / 1024 / 1024
            mem_delta = max(0.1, mem_after - mem_before)

            with tempfile.NamedTemporaryFile(delete=False, suffix='.pkl') as tmp:
                tmp_path = tmp.name
            joblib.dump(model, tmp_path, compress=3)
            model_size_kb = os.path.getsize(tmp_path) / 1024
            os.unlink(tmp_path)

            t_pred = time.time()
            y_pred = model.predict(X_te)
            predict_time_ms = (time.time() - t_pred) * 1000
            acc = accuracy_score(y_test, y_pred)

            from collections import Counter
            pred_dist = Counter(y_pred.tolist())
            if len(pred_dist) == 1:
                print(f"    WARNING: {name} predicts only class {list(pred_dist.keys())[0]}!")

            prec = precision_score(y_test, y_pred, average=avg_method, zero_division=0)
            rec = recall_score(y_test, y_pred, average=avg_method, zero_division=0)
            f1 = f1_score(y_test, y_pred, average=avg_method, zero_division=0)

            self.models[target][name] = {
                'model': model, 'scaled': mc['scaled'], 'accuracy': acc,
                'precision': prec, 'recall': rec, 'f1': f1,
                'train_time_s': round(train_time, 2),
                'predict_time_ms': round(predict_time_ms, 2),
                'cpu_time_s': round(cpu_train_s, 2),
                'memory_mb': round(mem_delta, 1),
                'model_size_kb': round(model_size_kb, 1),
            }
            results[name] = acc
            detailed_metrics[name] = {
                'accuracy': round(acc, 4), 'precision': round(prec, 4),
                'recall': round(rec, 4), 'f1': round(f1, 4),
                'train_time_s': round(train_time, 2),
                'predict_time_ms': round(predict_time_ms, 2),
                'cpu_time_s': round(cpu_train_s, 2),
                'memory_mb': round(mem_delta, 1),
                'model_size_kb': round(model_size_kb, 1),
            }
            print(f"    {name}: acc={acc:.1%} f1={f1:.1%} [{train_time:.1f}s, pred={predict_time_ms:.1f}ms, {model_size_kb:.0f}KB]")

        if X_cal_raw is not None and y_cal is not None:
            print(f"\n  Calibrating models (holdout={len(X_cal_raw)})...")
            for name, mdata in list(self.models[target].items()):
                try:
                    if FrozenEstimator is not None:
                        estimator = FrozenEstimator(mdata['model'])
                        cal_model = CalibratedClassifierCV(estimator, method='sigmoid')
                    else:
                        cal_model = CalibratedClassifierCV(mdata['model'], cv='prefit', method='sigmoid')
                    X_cal = X_cal_scaled if mdata['scaled'] else X_cal_raw
                    cal_model.fit(X_cal, y_cal)
                    self.models[target][name]['calibrated_model'] = cal_model
                    print(f"{name}: calibrated (sigmoid/Platt)")
                except Exception as e:
                    print(f"{name}: calibration skipped ({e})")
        else:
            print("\n  Calibration skipped: not enough training rows for a separate holdout")
        feature_importances = {}
        for name in ['Random Forest', 'XGBoost', 'LightGBM']:
            if name in self.models[target]:
                model_obj = self.models[target][name]['model']
                if hasattr(model_obj, 'feature_importances_'):
                    imp = pd.Series(model_obj.feature_importances_, index=feature_cols)
                    feature_importances[name] = imp.sort_values(ascending=False).head(15).to_dict()
                    print(f"{name} top 3: {', '.join(imp.sort_values(ascending=False).head(3).index)}")
        if feature_importances:
            print(f"Tree feature importances extracted for {len(feature_importances)} models")
        cv_results = {}
        if model_train_dates is not None:
            print(f"\n  Temporal cross-validation (5-fold)...")
            tscv = TimeSeriesSplit(n_splits=5)
            X_train_sorted = X_model_train
            y_train_sorted = y_model_train

            for name, mdata in self.models[target].items():
                if name in ('Ensemble', 'Stacking', 'LSTM'):
                    continue
                try:
                    if mdata['scaled']:
                        cv_estimator = Pipeline([
                            ('scaler', StandardScaler()),
                            ('model', clone(mdata['model'])),
                        ])
                    else:
                        cv_estimator = clone(mdata['model'])
                    scores = cross_val_score(
                        cv_estimator, X_train_sorted, y_train_sorted,
                        cv=tscv, scoring='accuracy', n_jobs=-1
                    )
                    cv_results[name] = {
                        'mean': round(float(scores.mean()), 4),
                        'std': round(float(scores.std()), 4),
                        'folds': [round(float(s), 4) for s in scores],
                    }
                    print(f"{name}: CV={scores.mean():.1%} (+/- {scores.std():.1%})")
                except Exception as e:
                    print(f"{name}: CV skipped ({e})")

        tree_models = ['Random Forest', 'XGBoost', 'LightGBM']
        ensemble_estimators = []
        for name in tree_models:
            if name in self.models[target]:
                ensemble_estimators.append(
                    (name.lower().replace(' ', '_'), clone(self.models[target][name]['model']))
                )

        if len(ensemble_estimators) >= 2:
            ensemble_weights = []
            for name in tree_models:
                if name in self.models[target]:
                    ensemble_weights.append(cv_results.get(name, {}).get('mean', 1.0))

            if cv_results:
                print("Ensemble weights: temporal CV means")
            else:
                print("Ensemble weights: equal (no temporal CV available)")

            proc = psutil.Process()
            mem_before_ens = proc.memory_info().rss / 1024 / 1024
            cpu_before_ens = proc.cpu_times()
            t0 = time.time()
            ensemble = VotingClassifier(
                estimators=ensemble_estimators, voting='soft',
                weights=ensemble_weights, n_jobs=-1,
            )
            ensemble.fit(X_model_train, y_model_train, sample_weight=sample_weights_model)
            ens_time = time.time() - t0
            cpu_after_ens = proc.cpu_times()
            cpu_ens_s = (cpu_after_ens.user - cpu_before_ens.user) + (cpu_after_ens.system - cpu_before_ens.system)
            mem_ens = max(0.1, proc.memory_info().rss / 1024 / 1024 - mem_before_ens)

            t_pred = time.time()
            y_ens = ensemble.predict(X_test)
            pred_time_ens = (time.time() - t_pred) * 1000
            acc_ens = accuracy_score(y_test, y_ens)
            prec_ens = precision_score(y_test, y_ens, average=avg_method, zero_division=0)
            rec_ens = recall_score(y_test, y_ens, average=avg_method, zero_division=0)
            f1_ens = f1_score(y_test, y_ens, average=avg_method, zero_division=0)
            self.models[target]['Ensemble'] = {
                'model': ensemble, 'scaled': False, 'accuracy': acc_ens,
                'precision': prec_ens, 'recall': rec_ens, 'f1': f1_ens,
                'train_time_s': round(ens_time, 2),
                'predict_time_ms': round(pred_time_ens, 2),
                'cpu_time_s': round(cpu_ens_s, 2),
                'memory_mb': round(mem_ens, 1),
            }
            results['Ensemble'] = acc_ens
            detailed_metrics['Ensemble'] = {
                'accuracy': round(acc_ens, 4), 'precision': round(prec_ens, 4),
                'recall': round(rec_ens, 4), 'f1': round(f1_ens, 4),
                'train_time_s': round(ens_time, 2), 'predict_time_ms': round(pred_time_ens, 2),
                'cpu_time_s': round(cpu_ens_s, 2), 'memory_mb': round(mem_ens, 1),
            }
            print(f"    Ensemble: acc={acc_ens:.1%} f1={f1_ens:.1%} [{ens_time:.1f}s, pred={pred_time_ens:.1f}ms]")

        if len(ensemble_estimators) >= 2:
            stacking_estimators = []
            for name in tree_models:
                if name in self.models[target]:
                    stacking_estimators.append(
                        (name.lower().replace(' ', '_'), clone(self.models[target][name]['model']))
                    )
            proc = psutil.Process()
            mem_before_st = proc.memory_info().rss / 1024 / 1024
            cpu_before_st = proc.cpu_times()
            t0 = time.time()
            if model_train_dates is not None:
                stacking = TemporalStackingClassifier(
                    estimators=stacking_estimators,
                    final_estimator=LogisticRegression(max_iter=1000, C=1.0),
                    n_splits=3,
                )
                print("Stacking: temporal expanding-window meta features")
            else:
                stacking = StackingClassifier(
                    estimators=stacking_estimators,
                    final_estimator=LogisticRegression(max_iter=1000, C=1.0),
                    cv=3, stack_method='predict_proba', n_jobs=-1
                )
            stacking.fit(X_model_train, y_model_train, sample_weight=sample_weights_model)
            stack_time = time.time() - t0
            cpu_after_st = proc.cpu_times()
            cpu_stack_s = (cpu_after_st.user - cpu_before_st.user) + (cpu_after_st.system - cpu_before_st.system)
            mem_stack = max(0.1, proc.memory_info().rss / 1024 / 1024 - mem_before_st)

            t_pred = time.time()
            y_stack = stacking.predict(X_test)
            pred_time_st = (time.time() - t_pred) * 1000
            acc_stack = accuracy_score(y_test, y_stack)
            prec_stack = precision_score(y_test, y_stack, average=avg_method, zero_division=0)
            rec_stack = recall_score(y_test, y_stack, average=avg_method, zero_division=0)
            f1_stack = f1_score(y_test, y_stack, average=avg_method, zero_division=0)
            self.models[target]['Stacking'] = {
                'model': stacking, 'scaled': False, 'accuracy': acc_stack,
                'precision': prec_stack, 'recall': rec_stack, 'f1': f1_stack,
                'train_time_s': round(stack_time, 2),
                'predict_time_ms': round(pred_time_st, 2),
                'cpu_time_s': round(cpu_stack_s, 2),
                'memory_mb': round(mem_stack, 1),
            }
            results['Stacking'] = acc_stack
            detailed_metrics['Stacking'] = {
                'accuracy': round(acc_stack, 4), 'precision': round(prec_stack, 4),
                'recall': round(rec_stack, 4), 'f1': round(f1_stack, 4),
                'train_time_s': round(stack_time, 2), 'predict_time_ms': round(pred_time_st, 2),
                'cpu_time_s': round(cpu_stack_s, 2), 'memory_mb': round(mem_stack, 1),
            }
            print(f"    Stacking: acc={acc_stack:.1%} f1={f1_stack:.1%} [{stack_time:.1f}s, pred={pred_time_st:.1f}ms]")

        if HAS_TORCH and not is_regression:
            try:
                lstm = LSTMPredictor(num_classes=config['num_classes'], epochs=50)
                lstm_meta = dict(meta)
                for col in ['home_team', 'away_team']:
                    if col in df.columns:
                        lstm_meta[col] = df[col].loc[X_model_train.index]

                proc = psutil.Process()
                mem_before_lstm = proc.memory_info().rss / 1024 / 1024
                cpu_before_lstm = proc.cpu_times()
                t0 = time.time()
                lstm.fit(X_model_train, y_model_train, meta=lstm_meta)
                lstm_time = time.time() - t0
                cpu_after_lstm = proc.cpu_times()
                cpu_lstm_s = (cpu_after_lstm.user - cpu_before_lstm.user) + (cpu_after_lstm.system - cpu_before_lstm.system)
                mem_lstm = max(0.1, proc.memory_info().rss / 1024 / 1024 - mem_before_lstm)

                if lstm._fitted:
                    lstm_state = lstm.get_state()
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.pkl') as tmp:
                        tmp_path = tmp.name
                    joblib.dump(lstm_state, tmp_path, compress=3)
                    lstm_size_kb = os.path.getsize(tmp_path) / 1024
                    os.unlink(tmp_path)

                    X_full = pd.concat([X_model_train, X_test])
                    lstm_full_meta = dict(meta)
                    for col in ['home_team', 'away_team']:
                        if col in df.columns:
                            lstm_full_meta[col] = df[col].loc[X_full.index]
                    home_seqs_all, away_seqs_all, valid_all = lstm.build_sequences(
                        X_full, meta=lstm_full_meta, update_history=False
                    )
                    n_tr = len(X_model_train)
                    home_seqs_te = home_seqs_all[n_tr:]
                    away_seqs_te = away_seqs_all[n_tr:]
                    valid_te = valid_all[n_tr:]
                    if valid_te.sum() > 0:
                        y_test_valid = y_test.values[valid_te]

                        t_pred = time.time()
                        proba = lstm.predict_proba((home_seqs_te[valid_te], away_seqs_te[valid_te]))
                        pred_time_lstm = (time.time() - t_pred) * 1000

                        y_pred_lstm = np.argmax(proba, axis=1)
                        acc_lstm = accuracy_score(y_test_valid, y_pred_lstm)
                        prec_lstm = precision_score(y_test_valid, y_pred_lstm, average=avg_method, zero_division=0)
                        rec_lstm = recall_score(y_test_valid, y_pred_lstm, average=avg_method, zero_division=0)
                        f1_lstm = f1_score(y_test_valid, y_pred_lstm, average=avg_method, zero_division=0)

                        self.models[target]['LSTM'] = {
                            'model': lstm, 'scaled': False, 'accuracy': acc_lstm,
                            'precision': prec_lstm, 'recall': rec_lstm, 'f1': f1_lstm,
                            'type': 'lstm',
                            'train_time_s': round(lstm_time, 2),
                            'predict_time_ms': round(pred_time_lstm, 2),
                            'cpu_time_s': round(cpu_lstm_s, 2),
                            'memory_mb': round(mem_lstm, 1),
                            'model_size_kb': round(lstm_size_kb, 1),
                            'n_sequences': int(valid_te.sum()),
                        }
                        results['LSTM'] = acc_lstm
                        detailed_metrics['LSTM'] = {
                            'accuracy': round(acc_lstm, 4), 'precision': round(prec_lstm, 4),
                            'recall': round(rec_lstm, 4), 'f1': round(f1_lstm, 4),
                            'train_time_s': round(lstm_time, 2),
                            'predict_time_ms': round(pred_time_lstm, 2),
                            'cpu_time_s': round(cpu_lstm_s, 2),
                            'memory_mb': round(mem_lstm, 1),
                            'model_size_kb': round(lstm_size_kb, 1),
                        }
                        print(f"    LSTM: acc={acc_lstm:.1%} f1={f1_lstm:.1%} "
                              f"[{lstm_time:.1f}s, pred={pred_time_lstm:.1f}ms, "
                              f"{lstm_size_kb:.0f}KB, {valid_te.sum()} seqs]")
            except Exception as e:
                print(f"    LSTM: error ({e})")

        self.training_stats[target] = {
            'total_matches': len(X),
            'train_matches': len(X_train),
            'test_matches': len(X_test),
            'features': len(feature_cols),
            'feature_names': feature_cols,
            'mi_scores_top10': mi_series.head(10).to_dict(),
            'results': results,
            'detailed_metrics': detailed_metrics,
            'feature_importances': feature_importances,
            'cv_results': cv_results,
        }

        best = max(results, key=results.get) if results else '?'
        best_acc = results.get(best, 0)
        print(f"\n  Best for {target}: {best} ({best_acc:.1%})")

        return results

    def _build_regression_configs(self) -> Dict:
        from sklearn.ensemble import GradientBoostingRegressor

        configs = {
            'Random Forest': {
                'model': RandomForestRegressor(
                    n_estimators=500, max_depth=15, min_samples_split=8,
                    min_samples_leaf=4, max_features='sqrt',
                    random_state=42, n_jobs=-1
                ),
                'scaled': False,
            },
            'Gradient Boosting': {
                'model': GradientBoostingRegressor(
                    n_estimators=400, max_depth=5, learning_rate=0.03,
                    subsample=0.8, min_samples_leaf=10,
                    loss='huber', alpha=0.9,
                    random_state=42
                ),
                'scaled': False,
            },
        }
        configs['XGBoost'] = {
            'model': XGBRegressor(
                n_estimators=500, max_depth=7, learning_rate=0.02,
                subsample=0.8, colsample_bytree=0.8,
                min_child_weight=5, gamma=0.1, reg_alpha=0.1,
                random_state=42, n_jobs=-1
            ),
            'scaled': False,
        }
        configs['LightGBM'] = {
            'model': LGBMRegressor(
                n_estimators=500, max_depth=12, learning_rate=0.02,
                subsample=0.8, colsample_bytree=0.8,
                min_child_samples=20, reg_alpha=0.1, reg_lambda=0.1,
                random_state=42, n_jobs=-1, verbose=-1
            ),
            'scaled': False,
        }
        return configs

    def _train_regression_models(self, target, config, X_train, X_test,
                                  X_train_scaled, X_test_scaled,
                                  y_train, y_test, feature_cols, scaler,
                                  X, meta, df) -> Dict:
        model_configs = self._build_regression_configs()
        self.models[target] = {}
        results = {}
        detailed_metrics = {}

        print(f"\n  Training regression models...")
        for name, mc in model_configs.items():
            X_tr = X_train_scaled if mc['scaled'] else X_train
            X_te = X_test_scaled if mc['scaled'] else X_test

            proc = psutil.Process()
            mem_before = proc.memory_info().rss / 1024 / 1024
            cpu_before = proc.cpu_times()
            t0 = time.time()
            model = mc['model']
            model.fit(X_tr, y_train)
            train_time = time.time() - t0
            cpu_after = proc.cpu_times()
            cpu_train_s = (cpu_after.user - cpu_before.user) + (cpu_after.system - cpu_before.system)
            mem_delta = max(0.1, proc.memory_info().rss / 1024 / 1024 - mem_before)

            t_pred = time.time()
            y_pred = model.predict(X_te)
            predict_time_ms = (time.time() - t_pred) * 1000

            mae = mean_absolute_error(y_test, y_pred)
            rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
            r2 = r2_score(y_test, y_pred)

            with tempfile.NamedTemporaryFile(delete=False, suffix='.pkl') as tmp:
                tmp_path = tmp.name
            joblib.dump(model, tmp_path, compress=3)
            model_size_kb = os.path.getsize(tmp_path) / 1024
            os.unlink(tmp_path)

            self.models[target][name] = {
                'model': model, 'scaled': mc['scaled'],
                'mae': mae, 'rmse': rmse, 'r2': r2,
                'train_time_s': round(train_time, 2),
                'predict_time_ms': round(predict_time_ms, 2),
                'cpu_time_s': round(cpu_train_s, 2),
                'memory_mb': round(mem_delta, 1),
                'model_size_kb': round(model_size_kb, 1),
                'task': 'regression',
            }
            results[name] = mae  # MAE as primary metric
            detailed_metrics[name] = {
                'mae': round(mae, 4), 'rmse': round(rmse, 4), 'r2': round(r2, 4),
                'train_time_s': round(train_time, 2),
                'predict_time_ms': round(predict_time_ms, 2),
                'cpu_time_s': round(cpu_train_s, 2),
                'memory_mb': round(mem_delta, 1),
                'model_size_kb': round(model_size_kb, 1),
            }
            print(f"    {name}: MAE={mae:.3f} RMSE={rmse:.3f} R²={r2:.3f} "
                  f"[{train_time:.1f}s, pred={predict_time_ms:.1f}ms, {model_size_kb:.0f}KB]")

        self.training_stats[target] = {
            'total_matches': len(X),
            'train_matches': len(X_train),
            'test_matches': len(X_test),
            'features': len(feature_cols),
            'feature_names': feature_cols,
            'results': results,
            'detailed_metrics': detailed_metrics,
        }

        best = min(results, key=results.get) if results else '?'
        print(f"\n  Best for {target}: {best} (MAE={results.get(best, 0):.3f})")
        return results
    
    def predict_match(self, features: Dict, model_name: str = 'Ensemble',
                      target: str = 'result') -> Dict:
        if not self.trained:
            raise ValueError("Models not trained. Call train_all_models() first.")

        target_models = self.models.get(target, {})
        if model_name not in target_models:
            raise ValueError(f"Model '{model_name}' not found for target '{target}'. "
                             f"Available: {list(target_models.keys())}")

        model_data = target_models[model_name]
        model = model_data['model']
        config = TARGET_CONFIGS[target]

        feat_cols = self.feature_columns_by_target.get(target, self.feature_columns)
        scaler = self.scalers.get(target, self.scaler)

        if config.get('task') == 'regression' or model_data.get('task') == 'regression':
            feature_values = [[features.get(col, 0) for col in feat_cols]]
            X = pd.DataFrame(feature_values, columns=feat_cols)
            X_pred = scaler.transform(X) if model_data.get('scaled') else X
            y_pred = model.predict(X_pred)[0]
            return {
                'prediction': round(float(y_pred), 2),
                'model': model_name,
                'task': 'regression',
            }

        class_names = config['class_names']

        if model_data.get('type') == 'lstm' and hasattr(model, 'predict_single'):
            lstm_features = dict(features)
            lstm_features['_home_team'] = features.get('home_team', features.get('_home_team', ''))
            lstm_features['_away_team'] = features.get('away_team', features.get('_away_team', ''))
            lstm_features['_date'] = features.get('date', features.get('_date', 'z'))
            proba = model.predict_single(lstm_features)
            pred = int(np.argmax(proba))

            result = {
                'prediction': class_names.get(pred, str(pred)),
                'prediction_int': pred,
                'model': model_name,
                'probabilities': {
                    class_names[i]: round(float(p) * 100, 1)
                    for i, p in enumerate(proba)
                },
                'confidence': round(float(max(proba)) * 100, 1),
            }
            return result

        feature_values = [[features.get(col, 0) for col in feat_cols]]
        X = pd.DataFrame(feature_values, columns=feat_cols)

        if model_data['scaled']:
            X_pred = scaler.transform(X)
        else:
            X_pred = X

        cal_model = model_data.get('calibrated_model')
        predict_model = cal_model if cal_model is not None else model

        pred = predict_model.predict(X_pred)[0]
        proba = predict_model.predict_proba(X_pred)[0] if hasattr(predict_model, 'predict_proba') else None

        result = {
            'prediction': class_names.get(int(pred), str(pred)),
            'prediction_int': int(pred),
            'model': model_name,
            'calibrated': cal_model is not None,
        }

        if proba is not None:
            result['probabilities'] = {
                class_names[i]: round(float(p) * 100, 1)
                for i, p in enumerate(proba)
            }
            result['confidence'] = round(float(max(proba)) * 100, 1)

        return result

    def predict_match_all_models(self, features: Dict, target: str = 'result') -> Dict:
        if not self.trained:
            raise ValueError("Models not trained. Call train_all_models() first.")

        target_models = self.models.get(target, {})
        if not target_models:
            return {}

        config = TARGET_CONFIGS[target]

        predictions = {}
        for name in target_models.keys():
            predictions[name] = self.predict_match(features, name, target)

        if config.get('task') == 'regression':
            values = [p['prediction'] for p in predictions.values() if 'prediction' in p]
            avg_val = round(np.mean(values), 2) if values else 0
            predictions['consensus'] = {
                'prediction': avg_val,
                'min': round(min(values), 2) if values else 0,
                'max': round(max(values), 2) if values else 0,
                'n_models': len(values),
                'task': 'regression',
            }
            return predictions

        class_names = config['class_names']
        from collections import Counter
        votes = [p['prediction_int'] for p in predictions.values() if 'prediction_int' in p]
        if not votes:
            return predictions

        vote_counter = Counter(votes)

        votes_breakdown = {class_names.get(k, str(k)): v for k, v in vote_counter.items()}
        for label in class_names.values():
            votes_breakdown.setdefault(label, 0)

        all_probs = [p.get('probabilities', {}) for p in predictions.values() if p.get('probabilities')]
        avg_probabilities = {}
        if all_probs:
            for label in class_names.values():
                avg_probabilities[label] = round(
                    sum(p.get(label, 0) for p in all_probs) / len(all_probs), 1
                )

        top_vote = vote_counter.most_common(1)[0]
        if avg_probabilities:
            best_label = max(avg_probabilities, key=avg_probabilities.get)
            consensus_prediction = best_label
        else:
            consensus_prediction = class_names.get(top_vote[0], str(top_vote[0]))

        predictions['consensus'] = {
            'prediction': consensus_prediction,
            'agreement': f"{top_vote[1]}/{len(votes)}",
            'agreement_pct': round(top_vote[1] / len(votes) * 100, 1),
            'votes': votes_breakdown,
            'avg_probabilities': avg_probabilities,
        }

        return predictions

    def predict_match_all_targets(self, features: Dict) -> Dict:
        all_predictions = {}
        for target in self.models.keys():
            all_predictions[target] = self.predict_match_all_models(features, target)
        return all_predictions
    
    def load_upcoming_matches(self, country: str, league: str) -> List[Dict]:
        raw_dir = self.data_dir / 'league' / country / league / 'raw'
        
        if not raw_dir.exists():
            return []
        
        upcoming = []
        today = datetime.now().strftime('%Y-%m-%d')
        
        for file in raw_dir.glob('*.json'):
            with open(file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            for match in data.get('matches', []):
                status = match.get('status', {}).get('type', '')
                match_date = match.get('date', '')
                
                if status in ['notstarted', 'inprogress'] and match_date >= today:
                    upcoming.append({
                        'match_id': match.get('match_id'),
                        'home_team': match.get('home_team'),
                        'away_team': match.get('away_team'),
                        'date': match_date,
                        'time': match.get('time', ''),
                        'status': status,
                        'country': country,
                        'league': league,
                        'round': match.get('round', {}).get('round', '')
                    })
        
        return sorted(upcoming, key=lambda x: (x['date'], x.get('time', '')))
    
    def predict_upcoming(self, country: str, league: str, 
                        model_name: str = 'Ensemble') -> List[Dict]:
        df = self.load_league_data(country, league)
        if df.empty:
            return []
        
        upcoming = self.load_upcoming_matches(country, league)
        predictions = []
        
        for match in upcoming:
            features = self._get_match_features(
                df, match['home_team'], match['away_team'], match['date']
            )
            
            if features:
                pred = self.predict_match_all_models(features)
                predictions.append({
                    **match,
                    'predictions': pred
                })
        
        return predictions
    
    def _get_match_features(self, df: pd.DataFrame, home_team: str, 
                           away_team: str, match_date: str) -> Optional[Dict]:
        df_sorted = df.sort_values('date', ascending=False)
        
        home_matches = df_sorted[
            (df_sorted['home_team'] == home_team) | 
            (df_sorted['away_team'] == home_team)
        ]
        
        away_matches = df_sorted[
            (df_sorted['home_team'] == away_team) | 
            (df_sorted['away_team'] == away_team)
        ]
        
        if home_matches.empty or away_matches.empty:
            return None
        
        latest_home = home_matches.iloc[0]
        latest_away = away_matches.iloc[0]
        
        features = {}
        
        for col in self.feature_columns:
            if col.startswith('home_'):
                home_as_home = df_sorted[df_sorted['home_team'] == home_team]
                if not home_as_home.empty:
                    features[col] = home_as_home.iloc[0].get(col, 0)
                else:
                    features[col] = latest_home.get(col, 0)
            elif col.startswith('away_'):
                away_as_away = df_sorted[df_sorted['away_team'] == away_team]
                if not away_as_away.empty:
                    features[col] = away_as_away.iloc[0].get(col, 0)
                else:
                    features[col] = latest_away.get(col, 0)
            elif col.endswith('_diff'):
                base = col.replace('_diff', '')
                home_val = features.get(f'home_{base}', features.get(f'home_form_{base}', 0))
                away_val = features.get(f'away_{base}', features.get(f'away_form_{base}', 0))
                features[col] = home_val - away_val if home_val and away_val else 0
            else:
                features[col] = 0
        
        return features
    
    def compare_predictions(self, predictions: List[Dict], 
                           actual_results: Dict[int, Dict]) -> Dict:
        comparison = {
            'matches': [],
            'model_accuracy': {name: {'correct': 0, 'total': 0} 
                              for name in list(self.models.keys()) + ['consensus']}
        }
        
        for pred in predictions:
            match_id = pred['match_id']
            if match_id not in actual_results:
                continue
            
            actual = actual_results[match_id]
            hs, as_ = actual['home_score'], actual['away_score']
            
            if hs > as_:
                actual_result = 'HOME'
            elif hs < as_:
                actual_result = 'AWAY'
            else:
                actual_result = 'DRAW'
            
            match_comparison = {
                'match': f"{pred['home_team']} vs {pred['away_team']}",
                'date': pred['date'],
                'actual_result': actual_result,
                'actual_score': f"{hs}:{as_}",
                'model_results': {}
            }
            
            for model_name, model_pred in pred['predictions'].items():
                if isinstance(model_pred, dict) and 'prediction' in model_pred:
                    predicted = model_pred['prediction']
                    correct = predicted == actual_result
                    
                    match_comparison['model_results'][model_name] = {
                        'predicted': predicted,
                        'correct': correct
                    }
                    
                    comparison['model_accuracy'][model_name]['total'] += 1
                    if correct:
                        comparison['model_accuracy'][model_name]['correct'] += 1
            
            comparison['matches'].append(match_comparison)
        
        for model in comparison['model_accuracy']:
            data = comparison['model_accuracy'][model]
            if data['total'] > 0:
                data['accuracy'] = round(data['correct'] / data['total'] * 100, 1)
            else:
                data['accuracy'] = 0
        
        return comparison
    
    def predict_confident_only(self, features_list: List[Dict], 
                               min_confidence: float = 55.0,
                               model_name: str = 'Ensemble') -> Tuple[List[Dict], Dict]:
        confident = []
        all_preds = []
        
        for features in features_list:
            pred = self.predict_match(features, model_name)
            all_preds.append(pred)
            
            if pred.get('confidence', 0) >= min_confidence:
                confident.append({**features, 'prediction': pred})
        
        stats = {
            'total_matches': len(features_list),
            'confident_matches': len(confident),
            'coverage': round(len(confident) / len(features_list) * 100, 1) if features_list else 0,
            'min_confidence': min_confidence
        }
        
        return confident, stats
    
    def save_models(self, path: str):
        """Save trained models to disk (multi-target format v2)."""
        if not self.trained:
            raise ValueError("No trained models to save")

        lstm_states = {}
        models_for_joblib = {}

        for target, target_models in self.models.items():
            models_for_joblib[target] = {}
            for name, data in target_models.items():
                if data.get('type') == 'lstm' and hasattr(data['model'], 'get_state'):
                    lstm_states[f"{target}/{name}"] = data['model'].get_state()
                    placeholder = {
                        'model': None, 'scaled': False, 'type': 'lstm',
                    }
                    for k in ('accuracy', 'f1', 'mae', 'rmse', 'r2', 'task'):
                        if k in data:
                            placeholder[k] = data[k]
                    models_for_joblib[target][name] = placeholder
                else:
                    models_for_joblib[target][name] = data

        save_data = {
            'version': 2,
            'models': models_for_joblib,
            'scalers': self.scalers,
            'feature_columns_by_target': self.feature_columns_by_target,
            'training_stats': self.training_stats,
            'lstm_states': lstm_states,
        }

        joblib.dump(save_data, path, compress=3)
        print(f"Models saved to: {path}")

    def load_models(self, path: str):
        """Load trained models from disk (handles v1 and v2 format)."""
        save_data = joblib.load(path)

        version = save_data.get('version', 1)

        if version >= 2:
            self.models = save_data['models']
            self.scalers = save_data.get('scalers', {})
            self.feature_columns_by_target = save_data.get('feature_columns_by_target', {})
            self.training_stats = save_data.get('training_stats', {})

            lstm_states = save_data.get('lstm_states', {})
            for key, state in lstm_states.items():
                if '/' in key and state is not None and HAS_TORCH:
                    target, name = key.split('/', 1)
                    if target in self.models and name in self.models[target]:
                        lstm = LSTMPredictor()
                        lstm.load_state(state)
                        self.models[target][name]['model'] = lstm
        else:
            # Legacy v1: flat models dict -> wrap as 'result' target
            self.models = {'result': save_data['models']}
            self.scalers = {'result': save_data.get('scaler', StandardScaler())}
            self.feature_columns_by_target = {
                'result': save_data.get('feature_columns', [])
            }
            self.training_stats = save_data.get('training_stats', {})

        if 'result' in self.feature_columns_by_target:
            self.feature_columns = self.feature_columns_by_target['result']
        if 'result' in self.scalers:
            self.scaler = self.scalers['result']

        self.trained = True

        for target_models in self.models.values():
            for model_data in target_models.values():
                _configure_estimator_for_single_thread_inference(model_data.get('model'))
                _configure_estimator_for_single_thread_inference(model_data.get('calibrated_model'))

        targets = list(self.models.keys())
        for t in targets:
            models_in_t = list(self.models[t].keys())
            print(f"  [{t}] Loaded: {', '.join(models_in_t)}")


    def run_scaling_tests(self, df: pd.DataFrame, target: str = 'result',
                          fractions: Optional[List[float]] = None,
                          model_name: str = 'XGBoost') -> List[Dict]:
        if fractions is None:
            fractions = [0.1, 0.25, 0.5, 0.75, 1.0]

        config = TARGET_CONFIGS[target]
        is_regression = config.get('task') == 'regression'

        X, y, meta = self.prepare_data(df, target)

        dates = meta.get('date')
        if dates is not None:
            sorted_idx = dates.sort_values().index
            split = int(len(sorted_idx) * 0.8)
            test_idx = sorted_idx[split:]
            full_train_idx = sorted_idx[:split]
        else:
            full_train_idx = X.index[:int(len(X) * 0.8)]
            test_idx = X.index[int(len(X) * 0.8):]

        X_test = X.loc[test_idx]
        y_test = y.loc[test_idx]

        results = []
        print(f"\n{'='*70}")
        print(f"  SCALING TEST: {target.upper()} with {model_name}")
        print(f"  Test set: {len(X_test)} matches (fixed)")
        print(f"{'='*70}")

        for frac in fractions:
            n_train = max(100, int(len(full_train_idx) * frac))
            train_idx = full_train_idx[:n_train]

            X_train = X.loc[train_idx]
            y_train = y.loc[train_idx]

            feature_cols = X_train.columns.tolist()
            scaler = StandardScaler()
            X_train_scaled = scaler.fit_transform(X_train)
            X_test_scaled = scaler.transform(X_test)

            if is_regression:
                model_configs = self._build_regression_configs()
            else:
                model_configs = self._build_model_configs(target, y_train=y_train)

            if model_name not in model_configs:
                available = list(model_configs.keys())
                print(f"    Model '{model_name}' not available. Using '{available[0]}'")
                model_name = available[0]

            mc = model_configs[model_name]
            model = clone(mc['model']) if hasattr(mc['model'], 'get_params') else mc['model']
            X_tr = X_train_scaled if mc.get('scaled') else X_train
            X_te = X_test_scaled if mc.get('scaled') else X_test

            proc = psutil.Process()
            mem_before = proc.memory_info().rss / 1024 / 1024
            cpu_before = proc.cpu_times()
            t0 = time.time()

            if not is_regression and mc.get('sample_weight'):
                from sklearn.utils.class_weight import compute_sample_weight
                sw = compute_sample_weight('balanced', y_train)
                model.fit(X_tr, y_train, sample_weight=sw)
            else:
                model.fit(X_tr, y_train)

            train_time = time.time() - t0
            cpu_after = proc.cpu_times()
            cpu_s = (cpu_after.user - cpu_before.user) + (cpu_after.system - cpu_before.system)
            mem_delta = max(0.1, proc.memory_info().rss / 1024 / 1024 - mem_before)

            t_pred = time.time()
            y_pred = model.predict(X_te)
            predict_time_ms = (time.time() - t_pred) * 1000

            entry = {
                'data_fraction': frac,
                'n_train': len(X_train),
                'n_test': len(X_test),
                'n_features': len(feature_cols),
                'train_time_s': round(train_time, 2),
                'predict_time_ms': round(predict_time_ms, 2),
                'cpu_time_s': round(cpu_s, 2),
                'memory_mb': round(mem_delta, 1),
            }

            if is_regression:
                mae = mean_absolute_error(y_test, y_pred)
                rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
                r2 = r2_score(y_test, y_pred)
                entry.update({'mae': round(mae, 4), 'rmse': round(rmse, 4), 'r2': round(r2, 4)})
                print(f"    {frac*100:5.0f}% ({n_train:>6} rows): MAE={mae:.3f} R²={r2:.3f} "
                      f"[train={train_time:.1f}s, pred={predict_time_ms:.1f}ms, RAM={mem_delta:.1f}MB]")
            else:
                acc = accuracy_score(y_test, y_pred)
                avg_method = 'binary' if config['task'] == 'binary' else 'weighted'
                f1 = f1_score(y_test, y_pred, average=avg_method, zero_division=0)
                entry.update({'accuracy': round(acc, 4), 'f1': round(f1, 4)})
                print(f"    {frac*100:5.0f}% ({n_train:>6} rows): acc={acc:.1%} f1={f1:.1%} "
                      f"[train={train_time:.1f}s, pred={predict_time_ms:.1f}ms, RAM={mem_delta:.1f}MB]")

            results.append(entry)

        return results

    def export_metrics_json(self, output_path: Optional[str] = None,
                            scaling_results: Optional[Dict] = None) -> str:
        """Export training metrics to JSON (for frontend display)."""
        if output_path is None:
            output_path = str(self.data_dir / 'models' / 'training_metrics.json')

        metrics = {
            'exported_at': datetime.now().isoformat(),
            'targets': {},
        }

        all_targets = set(self.models.keys())
        if scaling_results:
            all_targets.update(scaling_results.keys())

        for target in sorted(all_targets):
            config = TARGET_CONFIGS.get(target, {})

            target_data = {
                'task': config.get('task', 'unknown'),
                'class_names': config.get('class_names'),
                'stats': self.training_stats.get(target, {}),
                'models': {},
            }

            stats_copy = dict(target_data['stats'])
            stats_copy.pop('feature_names', None)  # too large for JSON
            target_data['stats'] = stats_copy

            target_models = self.models.get(target, {})
            for model_name, model_data in target_models.items():
                model_metrics = {}
                for key, value in model_data.items():
                    if key == 'model':
                        continue
                    if isinstance(value, (int, float, str, bool, type(None))):
                        model_metrics[key] = value
                    elif isinstance(value, np.floating):
                        model_metrics[key] = float(value)
                    elif isinstance(value, np.integer):
                        model_metrics[key] = int(value)

                target_data['models'][model_name] = model_metrics

            if scaling_results and target in scaling_results:
                target_data['scaling_tests'] = scaling_results[target]

            metrics['targets'][target] = target_data

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(metrics, f, indent=2, ensure_ascii=False, default=str)

        print(f"\nMetrics exported to: {output_path}")
        return output_path


def quick_predict(data_dir: str, country: str, league: str) -> Dict:
    predictor = UniversalPredictor(data_dir)
    print(f"\nLoading data for {country}/{league}...")
    df = predictor.load_league_data(country, league)
    
    if df.empty:
        return {'error': f'No data for {country}/{league}'}

    results = predictor.train_all_models(df)
    upcoming = predictor.predict_upcoming(country, league)
    
    return {
        'training_results': results,
        'upcoming_predictions': upcoming
    }


def predict_all_leagues(data_dir: str, countries: Optional[List[str]] = None) -> Dict:
    """Train on all leagues and predict upcoming matches."""
    predictor = UniversalPredictor(data_dir)
    print("Loading all league data...")
    df = predictor.load_all_leagues(countries)
    
    if df.empty:
        return {'error': 'No data found'}

    results = predictor.train_all_models(df)
    all_predictions = {}
    discovered = predictor.discover_leagues()
    
    for country, leagues in discovered.items():
        if countries and country not in countries:
            continue
        for league in leagues:
            upcoming = predictor.predict_upcoming(country, league)
            if upcoming:
                all_predictions[f"{country}/{league}"] = upcoming
    
    return {
        'training_results': results,
        'total_training_matches': len(df),
        'predictions_by_league': all_predictions
    }
