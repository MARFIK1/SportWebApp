"""
LSTM model for football match prediction.
Dual-branch architecture: one LSTM for home team history, one for away.
"""

import os
import random
import numpy as np
import pandas as pd
from collections import defaultdict

try:
    import torch
    import torch.nn as nn
    from torch.utils.data import Dataset, DataLoader
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

SEED = 42


def _seed_everything(seed: int = SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    if HAS_TORCH:
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed(seed)
            torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False

SEQUENCE_FEATURES_HOME = [
    'home_form_avg_points', 'home_form_goals_for', 'home_form_goals_against',
    'home_form_wins', 'home_form_losses',
    'home_form_goal_diff', 'home_form_xg_for', 'home_form_xg_against',
    'home_form_xg_diff', 'home_form_clean_sheets',
    'home_form10_avg_points', 'home_form10_goals_for', 'home_form10_goals_against',
    'home_form10_goal_diff', 'home_form10_xg_for', 'home_form10_xg_diff',
    'home_form10_clean_sheets',
    'home_table_position', 'home_table_ppg',
    'home_table_points', 'home_table_goal_diff',
    'home_elo',
    'home_wform_ppg', 'home_wform_goals_for', 'home_wform_goals_against',
    'home_wform_xg_diff', 'home_wform_clean_sheets',
    'home_momentum_points', 'home_momentum_goals', 'home_momentum_xg',
    'home_rest_days',
    'home_venue_form_ppg', 'home_venue_form_goals_for',
    'home_venue_form_goals_against', 'home_venue_form_clean_sheets',
    'home_clean_sheet_pct', 'home_failed_to_score_pct',
    'home_fatigue_matches',
    'home_sos_avg_position',
]

SEQUENCE_FEATURES_AWAY = [
    'away_form_avg_points', 'away_form_goals_for', 'away_form_goals_against',
    'away_form_wins', 'away_form_losses',
    'away_form_goal_diff', 'away_form_xg_for', 'away_form_xg_against',
    'away_form_xg_diff', 'away_form_clean_sheets',
    'away_form10_avg_points', 'away_form10_goals_for', 'away_form10_goals_against',
    'away_form10_goal_diff', 'away_form10_xg_for', 'away_form10_xg_diff',
    'away_form10_clean_sheets',
    'away_table_position', 'away_table_ppg',
    'away_table_points', 'away_table_goal_diff',
    'away_elo',
    'away_wform_ppg', 'away_wform_goals_for', 'away_wform_goals_against',
    'away_wform_xg_diff', 'away_wform_clean_sheets',
    'away_momentum_points', 'away_momentum_goals', 'away_momentum_xg',
    'away_rest_days',
    'away_venue_form_ppg', 'away_venue_form_goals_for',
    'away_venue_form_goals_against', 'away_venue_form_clean_sheets',
    'away_clean_sheet_pct', 'away_failed_to_score_pct',
    'away_fatigue_matches',
    'away_sos_avg_position',
]

SEQ_LEN = 5
INPUT_SIZE = len(SEQUENCE_FEATURES_HOME)


if not HAS_TORCH:
    class LSTMPredictor:
        """Stub when PyTorch is not installed."""
        def __init__(self, *args, **kwargs):
            raise ImportError("PyTorch is not installed. pip install torch")

else:

    class MatchSequenceDataset(Dataset):

        def __init__(self, home_seqs, away_seqs, labels):
            self.home_seqs = torch.FloatTensor(home_seqs)
            self.away_seqs = torch.FloatTensor(away_seqs)
            self.labels = torch.LongTensor(labels)

        def __len__(self):
            return len(self.labels)

        def __getitem__(self, idx):
            return self.home_seqs[idx], self.away_seqs[idx], self.labels[idx]

    class MatchLSTM(nn.Module):

        def __init__(self, input_size=INPUT_SIZE, hidden_size=64, num_layers=2,
                     num_classes=3, dropout=0.3):
            super().__init__()
            self.home_lstm = nn.LSTM(
                input_size, hidden_size, num_layers,
                batch_first=True, dropout=dropout if num_layers > 1 else 0,
            )
            self.away_lstm = nn.LSTM(
                input_size, hidden_size, num_layers,
                batch_first=True, dropout=dropout if num_layers > 1 else 0,
            )
            self.classifier = nn.Sequential(
                nn.Linear(hidden_size * 2, 128),
                nn.ReLU(),
                nn.Dropout(dropout),
                nn.Linear(128, 64),
                nn.ReLU(),
                nn.Dropout(dropout),
                nn.Linear(64, num_classes),
            )

        def forward(self, home_seq, away_seq):
            _, (h_home, _) = self.home_lstm(home_seq)
            _, (h_away, _) = self.away_lstm(away_seq)
            combined = torch.cat([h_home[-1], h_away[-1]], dim=1)
            return self.classifier(combined)

    class LSTMPredictor:

        def __init__(self, num_classes=3, hidden_size=128, num_layers=2,
                     dropout=0.3, lr=0.001, epochs=100, batch_size=256):
            self.num_classes = num_classes
            self.hidden_size = hidden_size
            self.num_layers = num_layers
            self.dropout = dropout
            self.lr = lr
            self.epochs = epochs
            self.batch_size = batch_size

            self.model = None
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

            self.team_history = {}
            self._fitted = False

        def build_sequences(self, df, y=None, meta=None, update_history=True):
            """Build (home_seqs, away_seqs, valid_mask) from a DataFrame of features."""
            team_matches = defaultdict(list)

            dates = meta.get('date', pd.Series(index=df.index, dtype=str)) if meta else pd.Series(index=df.index, dtype=str)

            for idx in df.index:
                row = df.loc[idx]
                date_val = dates.loc[idx] if idx in dates.index else ''

                home_team = meta.get('home_team', pd.Series(dtype=str)).get(idx, '') if meta and 'home_team' in meta else ''
                away_team = meta.get('away_team', pd.Series(dtype=str)).get(idx, '') if meta and 'away_team' in meta else ''

                home_feats = np.array([row.get(f, 0) for f in SEQUENCE_FEATURES_HOME], dtype=np.float32)
                away_feats = np.array([row.get(f, 0) for f in SEQUENCE_FEATURES_AWAY], dtype=np.float32)

                if home_team:
                    team_matches[home_team].append((date_val, home_feats))
                if away_team:
                    team_matches[away_team].append((date_val, away_feats))

            for team in team_matches:
                team_matches[team].sort(key=lambda x: x[0])

            if update_history:
                self.team_history = dict(team_matches)

            n = len(df)
            home_seqs = np.zeros((n, SEQ_LEN, INPUT_SIZE), dtype=np.float32)
            away_seqs = np.zeros((n, SEQ_LEN, INPUT_SIZE), dtype=np.float32)
            valid_mask = np.zeros(n, dtype=bool)

            for i, idx in enumerate(df.index):
                date_val = dates.loc[idx] if idx in dates.index else ''
                home_team = meta.get('home_team', pd.Series(dtype=str)).get(idx, '') if meta and 'home_team' in meta else ''
                away_team = meta.get('away_team', pd.Series(dtype=str)).get(idx, '') if meta and 'away_team' in meta else ''

                home_hist = [h for h in team_matches.get(home_team, []) if h[0] < date_val]
                away_hist = [h for h in team_matches.get(away_team, []) if h[0] < date_val]

                if len(home_hist) >= SEQ_LEN and len(away_hist) >= SEQ_LEN:
                    for j in range(SEQ_LEN):
                        home_seqs[i, j] = home_hist[-(SEQ_LEN - j)][1]
                        away_seqs[i, j] = away_hist[-(SEQ_LEN - j)][1]
                    valid_mask[i] = True

            return home_seqs, away_seqs, valid_mask

        def fit(self, df, y, meta=None):
            print("    LSTM: building sequences...")
            home_seqs, away_seqs, valid = self.build_sequences(df, y, meta)

            n_valid = valid.sum()
            if n_valid < 100:
                print(f"LSTM: not enough complete sequences ({n_valid}), skipping")
                return self

            home_seqs = home_seqs[valid]
            away_seqs = away_seqs[valid]
            y_valid = np.array(y)[valid] if hasattr(y, '__len__') else y.values[valid]

            print(f"LSTM: {n_valid} training sequences (out of {len(valid)})")
            self._home_mean = home_seqs.mean(axis=(0, 1))
            self._home_std = home_seqs.std(axis=(0, 1)) + 1e-8
            self._away_mean = away_seqs.mean(axis=(0, 1))
            self._away_std = away_seqs.std(axis=(0, 1)) + 1e-8

            home_seqs = (home_seqs - self._home_mean) / self._home_std
            away_seqs = (away_seqs - self._away_mean) / self._away_std

            _seed_everything(SEED)
            val_size = max(256, int(len(y_valid) * 0.15))
            indices = np.arange(len(y_valid))
            np.random.shuffle(indices)
            val_idx, train_idx = indices[:val_size], indices[val_size:]

            train_dataset = MatchSequenceDataset(
                home_seqs[train_idx], away_seqs[train_idx], y_valid[train_idx]
            )
            val_dataset = MatchSequenceDataset(
                home_seqs[val_idx], away_seqs[val_idx], y_valid[val_idx]
            )
            train_loader = DataLoader(train_dataset, batch_size=self.batch_size, shuffle=True)
            val_loader = DataLoader(val_dataset, batch_size=self.batch_size, shuffle=False)

            self.model = MatchLSTM(
                input_size=INPUT_SIZE, hidden_size=self.hidden_size,
                num_layers=self.num_layers, num_classes=self.num_classes,
                dropout=self.dropout,
            ).to(self.device)

            class_counts = np.bincount(y_valid.astype(int), minlength=self.num_classes)
            weights = 1.0 / (class_counts + 1)
            weights = weights / weights.sum() * self.num_classes
            class_weights = torch.FloatTensor(weights).to(self.device)

            criterion = nn.CrossEntropyLoss(weight=class_weights)
            optimizer = torch.optim.Adam(self.model.parameters(), lr=self.lr, weight_decay=1e-4)
            scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5)

            best_val_acc = 0.0
            best_state = None
            patience_counter = 0

            for epoch in range(self.epochs):
                self.model.train()
                total_loss = 0
                for h_batch, a_batch, labels in train_loader:
                    h_batch = h_batch.to(self.device)
                    a_batch = a_batch.to(self.device)
                    labels = labels.to(self.device)

                    optimizer.zero_grad()
                    outputs = self.model(h_batch, a_batch)
                    loss = criterion(outputs, labels)
                    loss.backward()
                    torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
                    optimizer.step()

                    total_loss += loss.item()

                self.model.eval()
                val_correct = 0
                val_total = 0
                val_loss = 0
                with torch.no_grad():
                    for h_batch, a_batch, labels in val_loader:
                        h_batch = h_batch.to(self.device)
                        a_batch = a_batch.to(self.device)
                        labels = labels.to(self.device)
                        outputs = self.model(h_batch, a_batch)
                        val_loss += criterion(outputs, labels).item()
                        preds = outputs.argmax(dim=1)
                        val_correct += (preds == labels).sum().item()
                        val_total += labels.size(0)

                val_acc = val_correct / val_total
                avg_val_loss = val_loss / len(val_loader)
                scheduler.step(avg_val_loss)

                if val_acc > best_val_acc + 0.001:
                    best_val_acc = val_acc
                    best_state = {k: v.cpu().clone() for k, v in self.model.state_dict().items()}
                    patience_counter = 0
                else:
                    patience_counter += 1
                    if patience_counter >= 15:
                        avg_train = total_loss / len(train_loader)
                        print(f"LSTM: early stopping at epoch {epoch + 1} "
                              f"(train_loss={avg_train:.4f}, val_acc={val_acc:.4f})")
                        break

            if patience_counter < 15:
                avg_train = total_loss / len(train_loader)
                print(f"LSTM: trained {self.epochs} epochs "
                      f"(train_loss={avg_train:.4f}, val_acc={val_acc:.4f})")

            if best_state is not None:
                self.model.load_state_dict(best_state)
                self.model.to(self.device)

            self._fitted = True
            return self

        def predict(self, df_or_seqs, meta=None):
            proba = self.predict_proba(df_or_seqs, meta)
            return np.argmax(proba, axis=1)

        def predict_proba(self, df_or_seqs, meta=None):
            if not self._fitted or self.model is None:
                n = len(df_or_seqs) if hasattr(df_or_seqs, '__len__') else 1
                return np.ones((n, self.num_classes)) / self.num_classes

            if isinstance(df_or_seqs, tuple) and len(df_or_seqs) == 2:
                home_seqs, away_seqs = df_or_seqs
            else:
                home_seqs, away_seqs, valid = self.build_sequences(
                    df_or_seqs, meta=meta, update_history=False
                )
                result = np.ones((len(valid), self.num_classes)) / self.num_classes
                if valid.sum() > 0:
                    h_valid = home_seqs[valid]
                    a_valid = away_seqs[valid]
                    h_valid = (h_valid - self._home_mean) / self._home_std
                    a_valid = (a_valid - self._away_mean) / self._away_std
                    proba = self._predict_from_seqs(h_valid, a_valid)
                    result[valid] = proba
                return result

            home_seqs = (home_seqs - self._home_mean) / self._home_std
            away_seqs = (away_seqs - self._away_mean) / self._away_std

            return self._predict_from_seqs(home_seqs, away_seqs)

        def _predict_from_seqs(self, home_seqs, away_seqs):
            """Internal prediction from pre-normalized sequences."""
            self.model.eval()
            with torch.no_grad():
                h = torch.FloatTensor(home_seqs).to(self.device)
                a = torch.FloatTensor(away_seqs).to(self.device)
                logits = self.model(h, a)
                proba = torch.softmax(logits, dim=1).cpu().numpy()
            return proba

        def predict_single(self, features: dict):
            if not self._fitted:
                return np.ones(self.num_classes) / self.num_classes

            home_team = features.get('_home_team', '')
            away_team = features.get('_away_team', '')
            match_date = features.get('_date', 'z')

            home_hist = [h for h in self.team_history.get(home_team, []) if h[0] < match_date]
            away_hist = [h for h in self.team_history.get(away_team, []) if h[0] < match_date]

            if len(home_hist) < SEQ_LEN or len(away_hist) < SEQ_LEN:
                return np.ones(self.num_classes) / self.num_classes

            home_seq = np.array([home_hist[-(SEQ_LEN - j)][1] for j in range(SEQ_LEN)], dtype=np.float32)
            away_seq = np.array([away_hist[-(SEQ_LEN - j)][1] for j in range(SEQ_LEN)], dtype=np.float32)

            home_seq = home_seq.reshape(1, SEQ_LEN, INPUT_SIZE)
            away_seq = away_seq.reshape(1, SEQ_LEN, INPUT_SIZE)

            home_seq = (home_seq - self._home_mean) / self._home_std
            away_seq = (away_seq - self._away_mean) / self._away_std

            return self._predict_from_seqs(home_seq, away_seq)[0]

        def get_state(self):
            if not self._fitted or self.model is None:
                return None
            return {
                'model_state': self.model.state_dict(),
                'config': {
                    'num_classes': self.num_classes,
                    'hidden_size': self.hidden_size,
                    'num_layers': self.num_layers,
                    'dropout': self.dropout,
                    'input_size': INPUT_SIZE,
                },
                'normalization': {
                    'home_mean': self._home_mean,
                    'home_std': self._home_std,
                    'away_mean': self._away_mean,
                    'away_std': self._away_std,
                },
                'team_history': self.team_history,
            }

        def load_state(self, state):
            if state is None:
                return

            cfg = state['config']
            self.num_classes = cfg['num_classes']
            self.hidden_size = cfg['hidden_size']
            self.num_layers = cfg['num_layers']
            self.dropout = cfg['dropout']

            self.model = MatchLSTM(
                input_size=cfg['input_size'],
                hidden_size=self.hidden_size,
                num_layers=self.num_layers,
                num_classes=self.num_classes,
                dropout=self.dropout,
            ).to(self.device)
            self.model.load_state_dict(state['model_state'])
            self.model.eval()

            norm = state['normalization']
            self._home_mean = norm['home_mean']
            self._home_std = norm['home_std']
            self._away_mean = norm['away_mean']
            self._away_std = norm['away_std']

            self.team_history = state.get('team_history', {})
            self._fitted = True
