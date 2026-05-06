# SportWebApp

Football results and prediction web app backed by a custom Sofascore scraping and ML pipeline.

## Overview

The app combines a Python data pipeline with a Next.js frontend:

- the scraper collects fixtures, scores, statistics and selected odds markets from Sofascore
- historical data is transformed into ML features and used to train multiple models
- `predict_today.py` generates daily prediction reports consumed by the web app
- the frontend shows match lists, match pages, teams, players, league tables and a `/predictions` dashboard

On the match page you can now compare two prediction variants:

- `Without odds` - data-only model variant
- `With odds` - odds-enhanced model variant

Both variants are stored in the report payload and can be toggled directly on the match page.

## Stack

- **Next.js 16.2.4** (App Router) + **React 19** + TypeScript
- **Tailwind CSS 3**
- **ESLint 9** + `eslint-config-next`
- **Python 3.11**
- **ML:** scikit-learn, XGBoost, LightGBM, PyTorch (LSTM), Optuna
- **Charts:** Recharts
- **Tests:** Jest

## Model Results

Main classification task: `HOME / DRAW / AWAY`.
Random baseline is about `33%`.

Current `without_odds` summary from `SofascoreData/data/models/comparison_summary.csv`:

| Model | Test Accuracy | Test F1 | Live Accuracy | Live Matches | Brier Score |
|-------|:-------------:|:-------:|:-------------:|:------------:|:-----------:|
| LightGBM | 49.8% | 43.3% | 51.7% | 1407 | 0.605 |
| MLP | 50.0% | 43.8% | 51.5% | 1407 | 0.608 |
| Random Forest | 48.3% | 46.6% | 49.1% | 1407 | 0.615 |
| Logistic Regression | 46.2% | 46.9% | 47.9% | 1407 | 0.615 |
| XGBoost | 46.4% | 46.6% | 47.5% | 1407 | 0.620 |
| Stacking | 45.7% | 46.5% | 47.6% | 1407 | 0.624 |
| KNN | 46.0% | 43.8% | 44.7% | 1407 | 0.652 |
| Ensemble | 46.3% | 46.5% | 44.4% | 1407 | 0.628 |
| LSTM | 46.2% | 44.4% | 43.1% | 1407 | 0.642 |

Current comparison summary was generated on `2026-04-30` after retraining with the safer pre-match feature set.
Compared with the previous `2026-04-23` summary, the top live accuracy increased from about `50.4%` to `51.7%`.
The currently used model artifacts were last refreshed on:

- `without_odds`: `2026-04-30`
- `with_odds`: `2026-04-30`

The current training pipeline separates feature sets by availability:

- `without_odds` uses `pre_match_safe` features available before a match
- `with_odds` uses `odds_available` features when valid match-result odds are present
- model artifacts include JSON manifests with feature set, target list, date ranges and calibration metrics

The app also predicts additional markets such as:

- BTTS
- over 1.5 goals
- over 2.5 goals
- corners 8.5+
- cards 3.5+

These are typical high-interest pre-match bookmaker markets commonly used in football betting analysis.

## Prediction Variants

Daily reports can contain two parallel prediction bundles:

- `without_odds`
- `with_odds`

The report still keeps the top-level prediction fields for compatibility, but match pages can now switch between the two explicit variants.

The current default match-page view is `without_odds`, with `with_odds` available as a comparison variant.

This makes it possible to compare:

- a model trained only on football/statistical data
- a model that also uses available bookmaker odds features

## Data Pipeline

The Python side lives in `SofascoreData/` and is responsible for:

1. scraping raw match data
2. generating ML-ready features
3. training and comparing models
4. generating daily prediction reports

Important files:

```text
SofascoreData/
  sofascore/                # scraper, feature generation, predictor code
  data/                     # full historical dataset and trained models
  reports/                  # daily prediction reports used by the web app
  predict_today.py          # scrape/update/repredict entry point
  train_models.ipynb        # training workflow
  ml_comparison.ipynb       # model comparison workflow
```

Common scraping commands:

```bash
cd SofascoreData
python scrape_all.py              # current/latest season for all competitions
python scrape_all.py --all        # full 5-season scrape
python scrape_all.py --seasons 3  # custom season count
```

## Prebuild And `.data`

The frontend does not ship the full raw training dataset.

Before production build/deploy, `scripts/prebuild.mjs` prepares a smaller `.data/` snapshot for the app:

- copies only the competitions used by the frontend
- trims match/player payloads to fields actually used in the UI
- copies model comparison outputs
- copies only a recent report window by default
- writes compact historical `accuracy_history.json` for dashboard charts

This keeps the deployment payload much smaller and separates:

- full working data in `SofascoreData/data`
- app-ready snapshot in `.data`

By default the app ships reports from `14` days back through `14` days ahead.
The `/predictions` dashboard keeps the full accuracy-over-time history from the compact prebuild artifact instead of requiring all historical report folders in production.

Useful environment flags:

- `PREBUILD_REPORT_DAYS_PAST`
- `PREBUILD_REPORT_DAYS_FUTURE`
- `PREBUILD_COPY_ALL_REPORTS=1`
- `PREBUILD_CLEAN=1`

## Project Structure

```text
app/                        # Next.js application
  page.tsx                  # home page with daily matches
  match/[id]/               # match details page
  team/[id]/                # team page
  player/[id]/              # player page
  league/[slug]/            # league tables / standings
  predictions/              # model dashboard
scripts/
  prebuild.mjs              # builds the trimmed .data snapshot
  vercel-deploy.mjs         # deploy helper with local data staging
SofascoreData/
  sofascore/                # scraper + ML code
  data/                     # full historical data + trained models
  reports/                  # generated daily reports
types/                      # shared frontend types
__tests__/                  # unit tests
```

## Local Development

The repo is currently developed with modern Node.js and Python 3.11.

Install frontend dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

Install Python dependencies for scraping / ML:

```bash
pip install -r SofascoreData/requirements.txt
python -m nbstripout --install
```

On Windows, if the repository path contains spaces, normalize the local Git filter to the project venv:

```bash
git config filter.nbstripout.clean ".venv/Scripts/python.exe -m nbstripout"
git config filter.nbstripout.smudge cat
git config filter.nbstripout.required true
git config diff.ipynb.textconv ".venv/Scripts/python.exe -m nbstripout -t"
```

The app reads from `.data/` first and falls back to `SofascoreData/data/` when needed.

Scraping also requires a local Chrome or Brave browser for Selenium.

## Build And Deploy

Local production build:

```bash
npm run build:prod
```

Deploy with local data snapshot:

```bash
npm run deploy:vercel
```

Important: pushing Git commits alone does **not** deploy the local `.data/` snapshot. The production deploy flow for this project is the local Vercel deploy command above.

## Testing

```bash
npm test
npm run typecheck
npm run typecheck:test
npm run lint
```
