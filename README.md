# SportWebApp

Football match prediction web app backed by a custom Sofascore scraping, feature engineering and machine-learning pipeline.

The project is designed as an end-to-end system, not a one-off notebook: data can be refreshed, reports can be regenerated, model quality can be measured on live matches, and the frontend can publish a compact production snapshot.

## What The App Does

- shows daily football predictions grouped by league
- supports favorite teams and leagues in the daily view
- shows draw-watch flags when a draw is close to the top prediction
- explains individual match predictions with key signals, probability maps and model votes
- compares `without odds` and `with odds` prediction variants
- displays live model accuracy, Brier score, confidence buckets and league splits
- exposes a protected `/admin` panel for operational status and deeper diagnostics
- deploys a trimmed `.data` snapshot instead of the full research dataset

## Stack

- Next.js `16.2.6` App Router, React `19.2.5`, TypeScript
- Tailwind CSS 3
- Recharts
- Jest, ESLint, TypeScript type checks
- Python 3.11 data pipeline
- scikit-learn, XGBoost, LightGBM, PyTorch LSTM, Optuna

## Main Routes

| Route | Purpose |
| --- | --- |
| `/` | daily match list, date picker, league sections, favorites, empty state for dates without tracked matches |
| `/match/[id]` | match detail page with teams, score/status, prediction explanation, radar, prediction triangle, H2H, model table and league table context |
| `/league/[slug]` | league standings and competition view |
| `/predictions` | public model dashboard and prediction analytics |
| `/admin` | protected operational panel with automation status and admin-only diagnostics |

## Current Model Snapshot

Main task: `HOME / DRAW / AWAY`.

Random baseline for a balanced 1X2 classifier is about `33%`, but football is noisy and draws are difficult, so live accuracy and calibration are tracked together.

Current `without_odds` summary from `SofascoreData/data/models/comparison_summary.csv`:

| Model | Test Accuracy | Test F1 | Live Accuracy | Live Matches | Brier |
| --- | ---: | ---: | ---: | ---: | ---: |
| LightGBM | 49.4% | 43.7% | 51.3% | 1726 | 0.609 |
| MLP | 49.0% | 44.6% | 50.8% | 1726 | 0.612 |
| Random Forest | 47.8% | 46.3% | 49.4% | 1726 | 0.617 |
| Logistic Regression | 45.5% | 46.3% | 47.9% | 1726 | 0.618 |
| XGBoost | 45.6% | 46.1% | 47.7% | 1726 | 0.622 |
| KNN | 45.4% | 43.5% | 46.2% | 1726 | 0.645 |
| Stacking | 45.4% | 46.1% | 46.1% | 1726 | 0.630 |
| Ensemble | 46.3% | 46.7% | 43.5% | 1726 | 0.634 |
| LSTM | 47.3% | 45.7% | 42.6% | 1726 | 0.646 |

`npm run diagnostics:models` also produces `SofascoreData/data/models/model_diagnostics.json`, currently based on 61 reports and 1875 finished matches from `2026-03-01` to `2026-05-14`.

## Prediction Outputs

Daily reports can contain two prediction bundles:

- `without_odds` - model variant based on football and statistical pre-match features
- `with_odds` - variant that additionally uses available match-result odds features

The app also predicts secondary markets:

- BTTS
- over 1.5 goals
- over 2.5 goals
- corners 8.5+
- cards 3.5+

## Data Pipeline

The Python pipeline lives in `SofascoreData/`:

```text
SofascoreData/
  sofascore/                 # scraper, feature generation and predictor code
  data/                      # historical data, model artifacts and diagnostics
  reports/                   # daily prediction reports consumed by the app
  predict_today.py           # update/scrape/predict entry point
  scrape_all.py              # competition season scraper
  regenerate_all_features.py # feature rebuild step
  train_models.ipynb         # training workflow
```

Typical workflow:

1. scraper downloads fixtures, results and statistics
2. feature engineering builds pre-match-safe features such as form, H2H and rolling team statistics
3. models are trained and compared with chronological validation
4. `predict_today.py` writes daily reports
5. the frontend reads reports and model metadata from `.data` or `SofascoreData`

Common Python commands:

```bash
cd SofascoreData
python scrape_all.py
python regenerate_all_features.py
python predict_today.py 2026-05-15 --update
python predict_today.py 2026-05-15 --scrape
```

## Model Diagnostics

Run:

```bash
npm run diagnostics:models
```

This generates:

- `SofascoreData/data/models/model_diagnostics.json`
- CSV files under `SofascoreData/data/models/diagnostics/`

Diagnostics include:

- live accuracy by model
- Brier score
- draw recall and confusion matrix
- confidence buckets
- league accuracy split
- draw-watch threshold sweep
- balanced draw candidates

The public `/predictions` page shows selected user-safe analytics. The `/admin` page shows operational and deeper diagnostic context.

## Local Development

Install frontend dependencies:

```bash
npm install
```

Run with local working data:

```bash
npm run dev
```

The app reads `.data/` first and falls back to `SofascoreData/data/` during local development. If your data lives outside the repository, point the app to it with `SOFASCORE_DATA_DIR` and `SOFASCORE_REPORTS_DIR`.

Install Python dependencies:

```bash
pip install -r SofascoreData/requirements.txt
python -m nbstripout --install
```

On Windows, if notebook output stripping needs a repo-local Python path:

```bash
git config filter.nbstripout.clean ".venv/Scripts/python.exe -m nbstripout"
git config filter.nbstripout.smudge cat
git config filter.nbstripout.required true
git config diff.ipynb.textconv ".venv/Scripts/python.exe -m nbstripout -t"
```

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD` | enables password login for `/admin` |
| `ADMIN_ACCESS_TOKEN` | alternative admin secret |
| `SOFASCORE_DATA_DIR` | overrides frontend data directory |
| `SOFASCORE_REPORTS_DIR` | overrides frontend reports directory |
| `PREBUILD_REPORT_DAYS_PAST` | controls past report window copied into `.data` |
| `PREBUILD_REPORT_DAYS_FUTURE` | controls future report window copied into `.data` |
| `PREBUILD_COPY_ALL_REPORTS` | copies all reports when set to `1` |
| `PREBUILD_CLEAN` | cleans `.data` before prebuild when set to `1` |
| `PREBUILD_LOGS_DIR` | copies automation logs into the production snapshot |
| `MODEL_DIAGNOSTICS_DIR` | custom CSV output directory for model diagnostics |

In local development, `/admin` is available without a password only when no admin secret is configured. In production, set `ADMIN_PASSWORD` or `ADMIN_ACCESS_TOKEN`.

## Prebuild And Data Snapshot

The frontend does not deploy the full raw dataset. `scripts/prebuild.mjs` prepares a compact `.data/` snapshot:

- trimmed competition and match payloads
- recent daily reports
- model comparison artifacts
- model diagnostics
- accuracy history for dashboard charts
- automation status/log summaries for `/admin`

The app reads `.data/` first and falls back to `SofascoreData/data/` during local development.

## Build And Deploy

Production build:

```bash
npm run build:prod
```

Deploy with local data snapshot:

```bash
npm run deploy:vercel
```

Current public deployment:

```text
https://sport-web-app-eight.vercel.app
```

For a different Vercel project, link and configure Vercel locally, set the required environment variables, then run the deploy command. Pushing Git commits alone does not upload the local `.data` snapshot. The local deploy flow builds and deploys the snapshot explicitly.

## Tests

```bash
npm test
npm run typecheck
npm run typecheck:test
npm run lint
```

## Repository Hygiene

- keep secrets in `.env.local` or Vercel environment variables, never in committed files
- notebook outputs are stripped with `nbstripout`
- generated diagnostics are useful for analysis, but only commit them intentionally
