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

Inspect all generated commands without training:

```powershell
python SofascoreData/run_walk_forward_backtest.py `
  --data-dir (Join-Path $snapshotRoot "data") `
  --output-dir (Join-Path $snapshotRoot "model-runs\walk-forward-weekly") `
  --variant both `
  --targets all `
  --model-scope all `
  --first-fold-optuna-trials 50 `
  --dry-run
```

Remove `--dry-run` to execute. The runner is resumable: rerunning the same
command skips completed jobs and continues at the first incomplete fold. Use
`--max-folds 1` for a first-fold smoke run. By default it retains metrics,
hyperparameter profiles and manifests but not serialized models; a full set of
two-variant model artifacts would require tens of gigabytes. Add
`--save-models` only when those historical binaries are needed.

Outputs include `walk_forward_run.json`, pooled `walk_forward_summary.json` and
`walk_forward_metrics.csv`. Classification confusion matrices are summed before
macro F1 and balanced accuracy are recomputed. Brier score and log loss are
weighted by evaluated rows. Fold-weighted ECE and R2 remain descriptive and are
labelled as such. This process never rewrites the frozen daily reports or the
runnable thesis demo.

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
