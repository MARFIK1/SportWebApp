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

Current summary from `SofascoreData/data/models/comparison_summary.csv`:

| Model | Test Accuracy | Live Accuracy | Live Matches | Brier Score |
|-------|:-------------:|:-------------:|:------------:|:-----------:|
| LightGBM | 50.3% | 50.5% | 1102 | 0.614 |
| MLP | 49.5% | 50.4% | 1102 | 0.616 |
| Random Forest | 48.5% | 47.9% | 1102 | 0.624 |
| Logistic Regression | 47.3% | 45.7% | 1102 | 0.628 |
| Stacking | 46.3% | 47.6% | 1102 | 0.630 |
| XGBoost | 45.9% | 44.6% | 1102 | 0.632 |
| LSTM | 45.4% | 43.7% | 1102 | 0.632 |
| KNN | 45.3% | 43.6% | 1102 | 0.663 |
| Ensemble | 45.2% | 43.3% | 1102 | 0.635 |

Current comparison summary was generated on `2026-04-21`.
The currently used model artifacts were last refreshed on:

- `without_odds`: `2026-04-20`
- `with_odds`: `2026-04-21`

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

## Prebuild And `.data`

The frontend does not ship the full raw training dataset.

Before production build/deploy, `scripts/prebuild.mjs` prepares a smaller `.data/` snapshot for the app:

- copies only the competitions used by the frontend
- trims match/player payloads to fields actually used in the UI
- copies model comparison outputs
- copies only a recent report window by default

This keeps the deployment payload much smaller and separates:

- full working data in `SofascoreData/data`
- app-ready snapshot in `.data`

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
npx tsc --noEmit --incremental false
npx tsc -p tsconfig.test.json --noEmit --incremental false
npm run lint
```
