# Thesis snapshot 2026-07-19

This profile separates the reproducible thesis dataset from the continuously
updated application. The analysis window is 2026-04-01 through 2026-07-19,
inclusive. Historical rows before 2026-04-01 remain available as model context,
while rows after 2026-07-19 are excluded.

The live `main` checkout and `SportWebApp-daily-stable` keep running normally.
Do not point the daily task at the exported thesis directory.

There are two complementary frozen artifacts:

- the research package created by `create_thesis_snapshot.py`, containing
  feature datasets and evaluation reports
- the runnable demo package created by `npm run snapshot:thesis-demo`,
  containing trimmed frontend data, report sidecars and model metadata

The runnable package uses the current application code but exposes no match or
report after `2026-07-19`; its implicit current date is frozen to the same day.

## Before export

Feature datasets must use the builder version required by
`snapshot_2026-07-19.json` and carry a matching source fingerprint. Rebuild the
daily-stable datasets with the current generator before auditing them:

```powershell
$workspaceRoot = Split-Path -Parent $PWD.Path
$stableRoot = (Resolve-Path "..\SportWebApp-daily-stable\SofascoreData").Path
$snapshotRoot = Join-Path $workspaceRoot "SportWebApp-thesis-2026-07-19"

python SofascoreData/regenerate_all_features.py `
  --data-dir (Join-Path $stableRoot "data") `
  --force
```

Then audit the source without copying files:

```powershell
python SofascoreData/create_thesis_snapshot.py `
  --source-root $stableRoot `
  --audit-only
```

After rebuilding stale feature datasets, create the immutable data package in a
directory outside the Git checkout:

```powershell
python SofascoreData/create_thesis_snapshot.py `
  --source-root $stableRoot `
  --output-dir $snapshotRoot
```

The export contains filtered feature datasets, reports from the analysis
window, `snapshot_manifest.json`, and `checksums.sha256`. Model artifacts and
diagnostics are added only after the evaluation run is complete.

## Evaluation training

Use the exported `data` directory and explicit temporal boundaries:

```powershell
python SofascoreData/train_models.py `
  --data-dir (Join-Path $snapshotRoot "data") `
  --data-cutoff 2026-07-19 `
  --test-start-date 2026-04-01 `
  --variant both `
  --targets all `
  --paired-common-sample `
  --model-scope thesis_core `
  --optuna-seed 42 `
  --skip-production-benchmark `
  --save-models `
  --output-dir (Join-Path $snapshotRoot "model-runs\thesis-core-evaluation")
```

The untouched 2026-04-01 through 2026-07-19 window is used for evaluation.
Do not describe a model refitted on that evaluation window as an independently
evaluated model.

`thesis_core` trains Logistic Regression, Random Forest, MLP, XGBoost and
LightGBM. KNN, soft voting, stacking and LSTM remain available in the normal
`all` scope, but are excluded from this primary benchmark so experimental
meta-model weighting does not blur the comparison of base estimators.
The explicit Optuna seed makes repeated hyperparameter searches reproducible
and is recorded in the training run metadata.

The repository records the exact Python environment in
`requirements-lock.txt` and the runtime versions in `environment.json`.
Install the lock only in a dedicated virtual environment.

The offline feature evaluation starts on 2026-04-01. If the source audit warns
that the first stored daily report is later (currently 2026-04-16), report-based
application evaluation must use that later availability date unless the missing
reports are recovered from an archived checkout.

## Weekly walk-forward evaluation

Keep the fixed 2026-04-01 through 2026-07-19 holdout above as the primary,
directly comparable benchmark. Use the walk-forward run as a complementary
production simulation: each release is trained through the day before its test
week, so April results can inform May models and no future result can inform an
earlier prediction.

The first fold predicts 2026-04-01 through 2026-04-05 from data ending on
2026-03-31. Later folds cover complete Monday-Sunday weeks; the final fold is
2026-07-13 through 2026-07-19. XGBoost and LightGBM are tuned only in the first
pre-holdout training window. Their versioned profile is then frozen for all
later folds, while estimator weights are refitted on the expanding data window.

The primary production-style run uses the complete independent no-odds sample.
This keeps all 11 targets and all nine classification model definitions in scope
through the final date even after historical odds coverage ends. A target or a
sequence model that cannot be evaluated in a sparse fold is recorded explicitly
as unavailable instead of being treated as a prediction. Inspect its commands
without training:

```powershell
python SofascoreData/run_walk_forward_backtest.py `
  --data-dir (Join-Path $snapshotRoot "data") `
  --output-dir (Join-Path $snapshotRoot "model-runs\walk-forward-weekly-all9-without-odds-full-seed42") `
  --variant without_odds `
  --targets all `
  --model-scope all `
  --first-fold-optuna-trials 50 `
  --independent-samples `
  --skip-empty-folds `
  --skip-insufficient-targets `
  --dry-run
```

Remove `--dry-run` to execute. The runner is resumable: rerunning the same
command skips completed jobs and continues at the first incomplete fold. Use
`--max-folds 1` for a first-fold smoke run. The snapshot has no feature rows for
2026-06-01 through 2026-06-07, so that calendar fold is retained in the
manifest as explicitly skipped; the next fold still trains only through its
previous-day cutoff. Targets with fewer than five usable labels in an otherwise
non-empty week are also recorded as unavailable while the other targets keep
their own out-of-sample predictions. Report target- and model-specific fold
counts and sample sizes in the thesis rather than treating unavailable labels or
sequences as failed predictions. By default the runner retains metrics,
hyperparameter profiles and manifests but not serialized models; a full set of
two-variant model artifacts would require tens of gigabytes. Add
`--save-models` only when those historical binaries are needed.

The complete odds/no-odds comparison is a separate paired experiment for
`result`, `btts`, `over_1_5`, `over_2_5` and `cards_over_3_5`. Do not modify the
immutable thesis snapshot to extend odds or outcome coverage. Create a
versioned derived dataset instead, retain the raw API response ledger, and run
the paired variants on identical target-specific rows. For a card-market event
whose frozen feature row has no final card label, the backfill also archives
the final Sofascore statistics response and derives the same yellow-card target
used by the original feature generator. Missing markets and outcomes are never
imputed.

The unattended pipeline replays the preliminary raw ledger, fetches every
still-missing requested market, validates the resulting cohort with a dry run,
and starts training only when every target has at least five paired holdout rows
in every non-empty calendar fold:

```powershell
python SofascoreData/run_backfilled_paired_pipeline.py `
  --source-snapshot-root $snapshotRoot `
  --derived-root (Join-Path $snapshotRoot "derived-data\odds-backfilled-five-markets-v1") `
  --training-output (Join-Path $snapshotRoot "model-runs\walk-forward-weekly-paired-five-markets-full-backfilled-seed42") `
  --analysis-output (Join-Path $snapshotRoot "results-paired-walk-forward-five-markets-full") `
  --figures-output (Join-Path $snapshotRoot "figures-paired-walk-forward-five-markets-full") `
  --seed-ledger (Join-Path $snapshotRoot "derived-data\odds-backfilled-result-btts-v1\odds_fetch_ledger.jsonl") `
  --start-date 2026-04-01 `
  --end-date 2026-07-19 `
  --targets result,btts,over_1_5,over_2_5,cards_over_3_5 `
  --optuna-trials 50 `
  --optuna-seed 42
```

The earlier `odds-backfilled-result-btts-v1` run is preliminary and is not the
complete odds-impact release. It queried 659 events and established 1X2
coverage of 1,909/1,927 and BTTS coverage of 1,892/1,927. Replaying its raw
responses with the corrected market parser recovers 617 Over 1.5, 635 Over 2.5
and 122 card-line prices before the complete fetch begins. Final coverage must
come from `derived_snapshot_manifest.json`; unresolved events remain listed in
provenance rather than being fabricated.

The 2026-06-01 through 2026-06-07 calendar fold remains explicitly skipped for
both variants because the immutable source snapshot contains no feature rows
that week. The other 15 folds must contain all five targets in both variants;
the pipeline aborts before training instead of silently omitting an
insufficient target. A complete run therefore has 30 fold-variant jobs and 150
paired target-fold evaluations.

Outputs include `walk_forward_run.json`, pooled `walk_forward_summary.json`,
`walk_forward_metrics.csv`, one `holdout_predictions.jsonl` file per fold and
the checksummed `walk_forward_predictions.json` index. Each JSONL row identifies
the match and stores its actual value plus out-of-sample model and consensus
predictions. These compact records can later produce separate leakage-safe demo
reports without retaining tens of gigabytes of serialized weekly models.
Classification confusion matrices are summed before macro F1 and balanced
accuracy are recomputed. Brier score and log loss are weighted by evaluated
rows. Fold-weighted ECE and R2 remain descriptive and are labelled as such. The
evaluation never rewrites the frozen source reports or the runnable thesis demo.

Export paired inferential results from the per-match prediction ledger:

```powershell
$pairedRun = Join-Path $snapshotRoot "model-runs\walk-forward-weekly-paired-five-markets-full-backfilled-seed42"
$pairedResults = Join-Path $snapshotRoot "results-paired-walk-forward-five-markets-full"
$pairedFigures = Join-Path $snapshotRoot "figures-paired-walk-forward-five-markets-full"

python SofascoreData/export_paired_walk_forward_analysis.py `
  --run-dir $pairedRun `
  --output-dir $pairedResults `
  --bootstrap-iterations 10000 `
  --bootstrap-seed 42 `
  --primary-model "Consensus Policy"

python SofascoreData/export_paired_walk_forward_figures.py `
  --analysis-dir $pairedResults `
  --output-dir $pairedFigures
```

The primary uncertainty analysis resamples complete weekly folds rather than
individual matches. It reports 95% percentile intervals for paired metric
changes, an exact McNemar test for paired correctness, and Holm-adjusted
exploratory McNemar p-values across all target-model comparisons. The
production `Consensus Policy` is the pre-declared primary estimator; all other
model rows are descriptive secondary analyses.

## Evaluation result export

After promotion, export the final tables and provenance without manually copying
metrics from console output:

```powershell
python SofascoreData/export_thesis_results.py `
  --primary-run (Join-Path $snapshotRoot "model-runs\thesis-core-evaluation-seed42") `
  --supplemental-run (Join-Path $snapshotRoot "model-runs\supplemental-over-2-5-without-odds") `
  --accepted-dir (Join-Path $snapshotRoot "model-runs\accepted") `
  --output-dir (Join-Path $snapshotRoot "results")
```

The export contains evaluation and per-model CSV tables, normalized confusion
matrices, the final promotion decisions, a readable Markdown summary, input
provenance and SHA-256 checksums. Absolute source paths are intentionally
excluded from these artifacts.

Generate publication-ready PNG and SVG figures from that immutable result
package:

```powershell
python SofascoreData/export_thesis_figures.py `
  --results-dir (Join-Path $snapshotRoot "results") `
  --output-dir (Join-Path $snapshotRoot "figures")
```

The figure package contains target-level classification and regression
comparisons, calibration metrics, promotion outcomes and row-normalized
confusion matrices. Its manifest records the exact hashes of every source CSV
and generated image without storing machine-specific paths. Direct odds-impact
and paired-calibration figures include only targets whose `with_odds`
evaluation actually used an odds-enabled feature set; fallback evaluations on
`pre_match_safe` features are not presented as evidence about odds.

## Runnable application demo

From the application checkout, create and run the frozen frontend package:

```powershell
npm run snapshot:thesis-demo
npm run dev:thesis-demo -- --port 3001
```

After the final thesis model run is accepted, regenerate it with the immutable
model directory:

```powershell
npm run snapshot:thesis-demo -- `
  --models-dir (Join-Path $snapshotRoot "model-runs\accepted")
```

Commit the demo implementation first, then tag that exact code revision before
recording. The external data package is intentionally not committed because it
contains generated reports and large source-derived JSON files.
