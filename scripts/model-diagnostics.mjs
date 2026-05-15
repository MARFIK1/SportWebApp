// Builds live model diagnostics from prediction reports without retraining.
// Run: npm run diagnostics:models

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const REPORTS_DIR = process.env.REPORTS_DIR
    ? path.resolve(ROOT, process.env.REPORTS_DIR)
    : path.join(ROOT, "SofascoreData", "reports");
const OUTPUT_PATH = process.env.MODEL_DIAGNOSTICS_OUT
    ? path.resolve(ROOT, process.env.MODEL_DIAGNOSTICS_OUT)
    : path.join(ROOT, "SofascoreData", "data", "models", "model_diagnostics.json");
const OUTPUT_DIR = process.env.MODEL_DIAGNOSTICS_DIR
    ? path.resolve(ROOT, process.env.MODEL_DIAGNOSTICS_DIR)
    : path.join(path.dirname(OUTPUT_PATH), "diagnostics");

const RESULTS = ["HOME", "DRAW", "AWAY"];
const BUCKETS = [
    { label: "<40", min: 0, max: 40 },
    { label: "40-45", min: 40, max: 45 },
    { label: "45-50", min: 45, max: 50 },
    { label: "50-55", min: 50, max: 55 },
    { label: "55-60", min: 55, max: 60 },
    { label: "60-65", min: 60, max: 65 },
    { label: "65+", min: 65, max: Number.POSITIVE_INFINITY },
];
const DRAW_THRESHOLDS = [24, 26, 28, 30, 32, 34, 36, 38, 40];
const DRAW_GAP_TO_BEST_GRID = [2, 4, 5, 6, 8, 10, 12];
const MAX_BALANCED_ACCURACY_LOSS = 2.5;
const MIN_BALANCED_DRAW_RECALL_GAIN = 2;
const MIN_LEAGUE_MATCHES = 20;
const MIN_DRAW_WATCH_RULE_MATCHES = 20;
const DRAW_WATCH_MODEL = process.env.DRAW_WATCH_MODEL || "LightGBM";
const DRAW_WATCH_THRESHOLD = numberEnv("DRAW_WATCH_THRESHOLD", 26);
const DRAW_WATCH_MAX_GAP_TO_BEST = numberEnv("DRAW_WATCH_MAX_GAP_TO_BEST", 10);

function numberEnv(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) ? value : fallback;
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
        return null;
    }
}

function isValidDateDir(name) {
    return /^\d{4}-\d{2}-\d{2}$/.test(name);
}

function reportPathForDate(dateDir) {
    const finished = path.join(dateDir, "predictions_finished.json");
    if (fs.existsSync(finished)) return finished;

    const unfinished = path.join(dateDir, "predictions_unfinished.json");
    if (fs.existsSync(unfinished)) return unfinished;

    return null;
}

function listReports() {
    if (!fs.existsSync(REPORTS_DIR)) {
        throw new Error(`reports directory not found: ${REPORTS_DIR}`);
    }

    return fs.readdirSync(REPORTS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && isValidDateDir(entry.name))
        .map((entry) => {
            const dateDir = path.join(REPORTS_DIR, entry.name);
            const filePath = reportPathForDate(dateDir);
            return filePath ? { date: entry.name, filePath } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizePercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n <= 1 ? n * 100 : n;
}

function probabilityFor(prediction, result) {
    const probabilities = prediction?.probabilities ?? prediction?.avg_probabilities;
    const value = probabilities?.[result];
    return normalizePercent(value);
}

function confidenceFor(prediction) {
    const direct = normalizePercent(prediction?.confidence);
    if (direct != null) return direct;

    const predicted = prediction?.prediction;
    if (!RESULTS.includes(predicted)) return null;
    return probabilityFor(prediction, predicted);
}

function brierFor(prediction, actual) {
    let sum = 0;
    for (const result of RESULTS) {
        const p = (probabilityFor(prediction, result) ?? 0) / 100;
        const y = actual === result ? 1 : 0;
        sum += (p - y) ** 2;
    }
    return sum;
}

function probabilitiesFor(prediction) {
    const probabilities = prediction?.probabilities ?? prediction?.avg_probabilities;
    if (!probabilities) return null;

    const normalized = {};
    for (const result of RESULTS) {
        const value = normalizePercent(probabilities[result]);
        if (value == null) return null;
        normalized[result] = value;
    }
    return normalized;
}

function argmaxResult(probabilities) {
    return RESULTS
        .map((result) => ({ result, value: probabilities[result] }))
        .sort((a, b) => b.value - a.value || RESULTS.indexOf(a.result) - RESULTS.indexOf(b.result))[0].result;
}

function predictWithDrawThreshold(probabilities, threshold, maxGapToBest) {
    const best = argmaxResult(probabilities);
    const bestProbability = probabilities[best];
    const drawProbability = probabilities.DRAW;

    if (drawProbability >= threshold && bestProbability - drawProbability <= maxGapToBest) {
        return "DRAW";
    }

    return best;
}

function emptyClassStats() {
    return {
        support: 0,
        predicted: 0,
        correct: 0,
        precision_pct: 0,
        recall_pct: 0,
        f1_pct: 0,
    };
}

function createModelAccumulator() {
    const confusion = {};
    const perClass = {};
    for (const actual of RESULTS) {
        confusion[actual] = {};
        perClass[actual] = emptyClassStats();
        for (const predicted of RESULTS) {
            confusion[actual][predicted] = 0;
        }
    }

    return {
        total: 0,
        correct: 0,
        confidence_sum: 0,
        confidence_count: 0,
        brier_sum: 0,
        brier_count: 0,
        confusion_matrix: confusion,
        per_class: perClass,
        confidence_buckets: BUCKETS.map((bucket) => ({
            ...bucket,
            total: 0,
            correct: 0,
            confidence_sum: 0,
        })),
        league_accuracy: {},
        draw_probability_when_draw_sum: 0,
        draw_probability_when_draw_count: 0,
        threshold_records: [],
    };
}

function ensureLeague(acc, leagueKey) {
    if (!acc.league_accuracy[leagueKey]) {
        acc.league_accuracy[leagueKey] = { correct: 0, total: 0, accuracy_pct: 0 };
    }
    return acc.league_accuracy[leagueKey];
}

function addPrediction(acc, match, prediction, reportDate) {
    const actual = match.actual_result;
    const predicted = prediction?.prediction;
    if (!RESULTS.includes(actual) || !RESULTS.includes(predicted)) return;

    const correct = predicted === actual;
    const confidence = confidenceFor(prediction);

    acc.total++;
    if (correct) acc.correct++;

    acc.confusion_matrix[actual][predicted]++;
    acc.per_class[actual].support++;
    acc.per_class[predicted].predicted++;
    if (correct) acc.per_class[actual].correct++;

    if (confidence != null) {
        acc.confidence_sum += confidence;
        acc.confidence_count++;

        const bucket = acc.confidence_buckets.find((b) => confidence >= b.min && confidence < b.max);
        if (bucket) {
            bucket.total++;
            if (correct) bucket.correct++;
            bucket.confidence_sum += confidence;
        }
    }

    const brier = brierFor(prediction, actual);
    if (Number.isFinite(brier)) {
        acc.brier_sum += brier;
        acc.brier_count++;
    }

    const leagueKey = `${match.comp_type}/${match.league}`;
    const league = ensureLeague(acc, leagueKey);
    league.total++;
    if (correct) league.correct++;

    if (actual === "DRAW") {
        const drawProbability = probabilityFor(prediction, "DRAW");
        if (drawProbability != null) {
            acc.draw_probability_when_draw_sum += drawProbability;
            acc.draw_probability_when_draw_count++;
        }
    }

    const probabilities = probabilitiesFor(prediction);
    if (probabilities) {
        acc.threshold_records.push({
            report_date: reportDate,
            event_id: match.event_id ?? "",
            league: `${match.comp_type}/${match.league}`,
            round: match.round ?? "",
            home_team: match.home_team ?? "",
            away_team: match.away_team ?? "",
            home_score: match.home_score ?? "",
            away_score: match.away_score ?? "",
            actual,
            base_prediction: predicted,
            base_correct: correct,
            confidence_pct: confidence,
            probabilities,
        });
    }
}

function round1(value) {
    return Math.round(value * 10) / 10;
}

function pct(numerator, denominator) {
    return denominator > 0 ? round1((numerator / denominator) * 100) : 0;
}

function csvValue(value) {
    if (value == null) return "";
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(filePath, rows, columns) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const header = columns.join(",");
    const body = rows.map((row) => columns.map((column) => csvValue(row[column])).join(","));
    fs.writeFileSync(filePath, [header, ...body].join("\n") + "\n");
}

function finalizeModel(acc) {
    for (const result of RESULTS) {
        const cls = acc.per_class[result];
        cls.precision_pct = pct(cls.correct, cls.predicted);
        cls.recall_pct = pct(cls.correct, cls.support);
        const p = cls.precision_pct / 100;
        const r = cls.recall_pct / 100;
        cls.f1_pct = p + r > 0 ? round1(((2 * p * r) / (p + r)) * 100) : 0;
    }

    const confidenceBuckets = acc.confidence_buckets.map((bucket) => ({
        label: bucket.label,
        min: bucket.min,
        max: Number.isFinite(bucket.max) ? bucket.max : null,
        total: bucket.total,
        correct: bucket.correct,
        accuracy_pct: pct(bucket.correct, bucket.total),
        avg_confidence_pct: bucket.total > 0 ? round1(bucket.confidence_sum / bucket.total) : 0,
    }));

    const leagueAccuracy = Object.fromEntries(
        Object.entries(acc.league_accuracy)
            .map(([league, stats]) => [
                league,
                {
                    ...stats,
                    accuracy_pct: pct(stats.correct, stats.total),
                },
            ])
            .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
    );

    const accuracyPct = pct(acc.correct, acc.total);
    const drawRecallPct = acc.per_class.DRAW.recall_pct;

    return {
        total: acc.total,
        correct: acc.correct,
        incorrect: Math.max(0, acc.total - acc.correct),
        accuracy_pct: accuracyPct,
        avg_confidence_pct: acc.confidence_count > 0 ? round1(acc.confidence_sum / acc.confidence_count) : 0,
        brier_score: acc.brier_count > 0 ? Math.round((acc.brier_sum / acc.brier_count) * 10000) / 10000 : null,
        confusion_matrix: acc.confusion_matrix,
        per_class: acc.per_class,
        confidence_buckets: confidenceBuckets,
        league_accuracy: leagueAccuracy,
        draw_probability_when_draw_pct: acc.draw_probability_when_draw_count > 0
            ? round1(acc.draw_probability_when_draw_sum / acc.draw_probability_when_draw_count)
            : 0,
        draw_threshold_sweep: finalizeDrawThresholdSweep(acc.threshold_records, accuracyPct, drawRecallPct),
        draw_watch_matches: finalizeDrawWatchMatches(acc.threshold_records),
    };
}

function finalizeDrawThresholdSweep(records, baseAccuracyPct, baseDrawRecallPct) {
    const rows = [];

    for (const threshold of DRAW_THRESHOLDS) {
        for (const maxGap of DRAW_GAP_TO_BEST_GRID) {
            const stats = {
                threshold_pct: threshold,
                max_gap_to_best_pct: maxGap,
                total: 0,
                correct: 0,
                draw_support: 0,
                draw_predicted: 0,
                draw_correct: 0,
                accuracy_pct: 0,
                accuracy_delta_pct: 0,
                accuracy_loss_pct: 0,
                draw_precision_pct: 0,
                draw_recall_pct: 0,
                draw_recall_delta_pct: 0,
                draw_f1_pct: 0,
            };

            for (const record of records) {
                const predicted = predictWithDrawThreshold(
                    record.probabilities,
                    threshold,
                    maxGap
                );
                const correct = predicted === record.actual;

                stats.total++;
                if (correct) stats.correct++;
                if (record.actual === "DRAW") stats.draw_support++;
                if (predicted === "DRAW") stats.draw_predicted++;
                if (predicted === "DRAW" && record.actual === "DRAW") stats.draw_correct++;
            }

            stats.accuracy_pct = pct(stats.correct, stats.total);
            stats.accuracy_delta_pct = round1(stats.accuracy_pct - baseAccuracyPct);
            stats.accuracy_loss_pct = round1(Math.max(0, baseAccuracyPct - stats.accuracy_pct));
            stats.draw_precision_pct = pct(stats.draw_correct, stats.draw_predicted);
            stats.draw_recall_pct = pct(stats.draw_correct, stats.draw_support);
            stats.draw_recall_delta_pct = round1(stats.draw_recall_pct - baseDrawRecallPct);

            const p = stats.draw_precision_pct / 100;
            const r = stats.draw_recall_pct / 100;
            stats.draw_f1_pct = p + r > 0 ? round1(((2 * p * r) / (p + r)) * 100) : 0;

            rows.push(stats);
        }
    }

    return rows;
}

function drawWatchEffect(record, adjustedPrediction) {
    if (record.base_prediction === adjustedPrediction) {
        return adjustedPrediction === record.actual ? "kept_hit" : "kept_miss";
    }

    if (adjustedPrediction === record.actual) return "fixed_draw";
    if (record.base_prediction === record.actual) return "lost_hit";
    return "changed_miss";
}

function finalizeDrawWatchMatches(records) {
    return records
        .map((record) => {
            const bestClass = argmaxResult(record.probabilities);
            const bestProbability = record.probabilities[bestClass];
            const drawProbability = record.probabilities.DRAW;
            const drawGapToBest = round1(bestProbability - drawProbability);
            const adjustedPrediction = predictWithDrawThreshold(
                record.probabilities,
                DRAW_WATCH_THRESHOLD,
                DRAW_WATCH_MAX_GAP_TO_BEST
            );

            return {
                report_date: record.report_date,
                event_id: record.event_id,
                league: record.league,
                round: record.round,
                home_team: record.home_team,
                away_team: record.away_team,
                home_score: record.home_score,
                away_score: record.away_score,
                actual_result: record.actual,
                base_prediction: record.base_prediction,
                adjusted_prediction: adjustedPrediction,
                base_correct: record.base_correct,
                adjusted_correct: adjustedPrediction === record.actual,
                would_change_prediction: adjustedPrediction !== record.base_prediction,
                effect: drawWatchEffect(record, adjustedPrediction),
                home_probability_pct: round1(record.probabilities.HOME),
                draw_probability_pct: round1(drawProbability),
                away_probability_pct: round1(record.probabilities.AWAY),
                best_class: bestClass,
                best_probability_pct: round1(bestProbability),
                draw_gap_to_best_pct: drawGapToBest,
                confidence_pct: record.confidence_pct == null ? null : round1(record.confidence_pct),
                rule_threshold_pct: DRAW_WATCH_THRESHOLD,
                rule_max_gap_to_best_pct: DRAW_WATCH_MAX_GAP_TO_BEST,
            };
        })
        .filter((row) => row.adjusted_prediction === "DRAW")
        .sort((a, b) =>
            a.report_date.localeCompare(b.report_date) ||
            a.league.localeCompare(b.league) ||
            a.home_team.localeCompare(b.home_team)
        );
}

function collectDiagnostics() {
    const reports = listReports();
    const models = {};
    let finishedMatches = 0;
    let firstDate = null;
    let lastDate = null;

    for (const { date, filePath } of reports) {
        const report = readJson(filePath);
        if (!report?.matches?.length) continue;

        for (const match of report.matches) {
            if (match.status !== "finished" || !RESULTS.includes(match.actual_result)) continue;
            finishedMatches++;
            firstDate ??= date;
            lastDate = date;

            const predictions = {
                ...(match.predictions ?? {}),
                ...(match.consensus ? { consensus: match.consensus } : {}),
            };

            for (const [model, prediction] of Object.entries(predictions)) {
                if (!prediction || model === "undefined") continue;
                if (!models[model]) models[model] = createModelAccumulator();
                addPrediction(models[model], match, prediction, date);
            }
        }
    }

    const finalizedModels = Object.fromEntries(
        Object.entries(models)
            .map(([model, acc]) => [model, finalizeModel(acc)])
            .sort((a, b) => b[1].accuracy_pct - a[1].accuracy_pct || a[0].localeCompare(b[0]))
    );

    return {
        generated_at: new Date().toISOString(),
        source_reports: REPORTS_DIR,
        date_range: {
            first: firstDate,
            last: lastDate,
        },
        reports_read: reports.length,
        finished_matches: finishedMatches,
        models: finalizedModels,
    };
}

function getModelEntries(diagnostics) {
    return Object.entries(diagnostics.models).filter(([, stats]) => stats.total > 0);
}

function summarizeDrawWatchRows(rows) {
    const total = rows.length;
    const actualDraws = rows.filter((row) => row.actual_result === "DRAW").length;
    const baseCorrect = rows.filter((row) => row.base_correct).length;
    const adjustedCorrect = rows.filter((row) => row.adjusted_correct).length;
    const changed = rows.filter((row) => row.would_change_prediction).length;
    const fixedDraw = rows.filter((row) => row.effect === "fixed_draw").length;
    const lostHit = rows.filter((row) => row.effect === "lost_hit").length;
    const changedMiss = rows.filter((row) => row.effect === "changed_miss").length;
    const keptHit = rows.filter((row) => row.effect === "kept_hit").length;
    const keptMiss = rows.filter((row) => row.effect === "kept_miss").length;

    return [{
        model: DRAW_WATCH_MODEL,
        threshold_pct: DRAW_WATCH_THRESHOLD,
        max_gap_to_best_pct: DRAW_WATCH_MAX_GAP_TO_BEST,
        total_matches: total,
        actual_draws: actualDraws,
        actual_draw_rate_pct: pct(actualDraws, total),
        base_correct: baseCorrect,
        base_accuracy_pct: pct(baseCorrect, total),
        adjusted_correct: adjustedCorrect,
        adjusted_accuracy_pct: pct(adjustedCorrect, total),
        adjusted_accuracy_delta_pct: round1(pct(adjustedCorrect, total) - pct(baseCorrect, total)),
        changed_predictions: changed,
        fixed_draws: fixedDraw,
        lost_hits: lostHit,
        changed_misses: changedMiss,
        kept_hits: keptHit,
        kept_misses: keptMiss,
    }];
}

function buildDiagnosticsTables(diagnostics) {
    const modelEntries = getModelEntries(diagnostics);

    const overallRows = modelEntries
        .map(([model, stats]) => ({
            model,
            accuracy_pct: stats.accuracy_pct,
            draw_recall_pct: stats.per_class.DRAW.recall_pct,
            brier_score: stats.brier_score,
            avg_confidence_pct: stats.avg_confidence_pct,
            total: stats.total,
            correct: stats.correct,
            incorrect: stats.incorrect,
        }))
        .sort((a, b) => b.accuracy_pct - a.accuracy_pct || a.model.localeCompare(b.model));

    const drawRows = modelEntries
        .map(([model, stats]) => ({
            model,
            draw_support: stats.per_class.DRAW.support,
            draw_predicted: stats.per_class.DRAW.predicted,
            draw_correct: stats.per_class.DRAW.correct,
            draw_precision_pct: stats.per_class.DRAW.precision_pct,
            draw_recall_pct: stats.per_class.DRAW.recall_pct,
            draw_f1_pct: stats.per_class.DRAW.f1_pct,
            avg_draw_prob_when_draw_pct: stats.draw_probability_when_draw_pct,
        }))
        .sort((a, b) => b.draw_recall_pct - a.draw_recall_pct || b.draw_f1_pct - a.draw_f1_pct || a.model.localeCompare(b.model));

    const thresholdRows = modelEntries
        .filter(([model]) => model !== "consensus")
        .flatMap(([model, stats]) => stats.draw_threshold_sweep.map((row) => ({
            model,
            base_accuracy_pct: stats.accuracy_pct,
            base_draw_recall_pct: stats.per_class.DRAW.recall_pct,
            threshold_pct: row.threshold_pct,
            max_gap_to_best_pct: row.max_gap_to_best_pct,
            accuracy_pct: row.accuracy_pct,
            accuracy_delta_pct: row.accuracy_delta_pct,
            accuracy_loss_pct: row.accuracy_loss_pct,
            draw_precision_pct: row.draw_precision_pct,
            draw_recall_pct: row.draw_recall_pct,
            draw_recall_delta_pct: row.draw_recall_delta_pct,
            draw_f1_pct: row.draw_f1_pct,
            draw_predicted: row.draw_predicted,
            draw_correct: row.draw_correct,
            total: row.total,
        })));

    const bestThresholdRows = modelEntries
        .filter(([model]) => model !== "consensus")
        .map(([model, stats]) => {
            const best = [...stats.draw_threshold_sweep]
                .sort((a, b) => b.draw_f1_pct - a.draw_f1_pct || a.accuracy_loss_pct - b.accuracy_loss_pct || b.accuracy_pct - a.accuracy_pct)[0];
            return {
                model,
                base_accuracy_pct: stats.accuracy_pct,
                base_draw_recall_pct: stats.per_class.DRAW.recall_pct,
                threshold_pct: best?.threshold_pct ?? null,
                max_gap_to_best_pct: best?.max_gap_to_best_pct ?? null,
                accuracy_pct: best?.accuracy_pct ?? null,
                accuracy_loss_pct: best?.accuracy_loss_pct ?? null,
                draw_precision_pct: best?.draw_precision_pct ?? null,
                draw_recall_pct: best?.draw_recall_pct ?? null,
                draw_recall_delta_pct: best?.draw_recall_delta_pct ?? null,
                draw_f1_pct: best?.draw_f1_pct ?? null,
            };
        })
        .sort((a, b) => b.draw_f1_pct - a.draw_f1_pct || a.accuracy_loss_pct - b.accuracy_loss_pct);

    const balancedThresholdRows = thresholdRows
        .filter((row) =>
            row.accuracy_loss_pct <= MAX_BALANCED_ACCURACY_LOSS &&
            row.draw_recall_delta_pct >= MIN_BALANCED_DRAW_RECALL_GAIN
        )
        .sort((a, b) =>
            b.draw_f1_pct - a.draw_f1_pct ||
            a.accuracy_loss_pct - b.accuracy_loss_pct ||
            b.draw_recall_delta_pct - a.draw_recall_delta_pct ||
            b.accuracy_pct - a.accuracy_pct
        );

    const bestBalancedRowsByModel = modelEntries
        .filter(([model]) => model !== "consensus")
        .map(([model]) => balancedThresholdRows.find((row) => row.model === model))
        .filter(Boolean)
        .sort((a, b) =>
            b.base_accuracy_pct - a.base_accuracy_pct ||
            a.accuracy_loss_pct - b.accuracy_loss_pct ||
            b.draw_f1_pct - a.draw_f1_pct
        );

    const confidenceRows = modelEntries
        .flatMap(([model, stats]) => stats.confidence_buckets.map((bucket) => ({
            model,
            bucket: bucket.label,
            min_pct: bucket.min,
            max_pct: bucket.max,
            total: bucket.total,
            correct: bucket.correct,
            accuracy_pct: bucket.accuracy_pct,
            avg_confidence_pct: bucket.avg_confidence_pct,
        })));

    const confidenceSummaryRows = modelEntries
        .filter(([model]) => model !== "consensus")
        .map(([model, stats]) => {
            const high = stats.confidence_buckets.find((bucket) => bucket.label === "65+");
            const low = stats.confidence_buckets.find((bucket) => bucket.label === "<40");
            return {
                model,
                low_conf_accuracy_pct: low?.accuracy_pct ?? 0,
                high_conf_accuracy_pct: high?.accuracy_pct ?? 0,
                high_conf_matches: high?.total ?? 0,
                high_conf_avg_pct: high?.avg_confidence_pct ?? 0,
            };
        })
        .sort((a, b) => b.high_conf_accuracy_pct - a.high_conf_accuracy_pct || b.high_conf_matches - a.high_conf_matches);

    const leagueRows = modelEntries
        .flatMap(([model, stats]) => Object.entries(stats.league_accuracy).map(([league, leagueStats]) => ({
            model,
            league,
            total: leagueStats.total,
            correct: leagueStats.correct,
            accuracy_pct: leagueStats.accuracy_pct,
        })))
        .sort((a, b) => a.model.localeCompare(b.model) || b.total - a.total || b.accuracy_pct - a.accuracy_pct);

    const confusionRows = modelEntries.flatMap(([model, stats]) =>
        RESULTS.flatMap((actual) =>
            RESULTS.map((predicted) => ({
                model,
                actual,
                predicted,
                count: stats.confusion_matrix[actual][predicted],
            }))
        )
    );

    const drawWatchRows = modelEntries
        .filter(([model]) => model === DRAW_WATCH_MODEL)
        .flatMap(([model, stats]) => stats.draw_watch_matches.map((row) => ({
            model,
            ...row,
        })));

    const drawWatchSummaryRows = summarizeDrawWatchRows(drawWatchRows);
    const drawWatchRuleRows = thresholdRows
        .filter((row) => row.model === DRAW_WATCH_MODEL && row.draw_predicted >= MIN_DRAW_WATCH_RULE_MATCHES)
        .map((row) => ({
            model: row.model,
            threshold_pct: row.threshold_pct,
            max_gap_to_best_pct: row.max_gap_to_best_pct,
            flagged_matches: row.draw_predicted,
            actual_draws: row.draw_correct,
            actual_draw_rate_pct: row.draw_precision_pct,
            draw_recall_pct: row.draw_recall_pct,
            draw_f1_pct: row.draw_f1_pct,
            accuracy_pct: row.accuracy_pct,
            accuracy_loss_pct: row.accuracy_loss_pct,
        }))
        .sort((a, b) =>
            b.actual_draw_rate_pct - a.actual_draw_rate_pct ||
            b.flagged_matches - a.flagged_matches ||
            a.accuracy_loss_pct - b.accuracy_loss_pct
        );

    const bestAccuracyModel = overallRows.find((row) => row.model !== "consensus") ?? overallRows[0];
    const bestLeagueRows = bestAccuracyModel
        ? leagueRows
            .filter((row) => row.model === bestAccuracyModel.model && row.total >= MIN_LEAGUE_MATCHES)
            .sort((a, b) => b.accuracy_pct - a.accuracy_pct || b.total - a.total)
        : [];

    return {
        overallRows,
        drawRows,
        thresholdRows,
        bestThresholdRows,
        balancedThresholdRows,
        bestBalancedRowsByModel,
        confidenceRows,
        confidenceSummaryRows,
        leagueRows,
        bestLeagueRows,
        confusionRows,
        drawWatchRows,
        drawWatchSummaryRows,
        drawWatchRuleRows,
    };
}

function writeCsvExports(tables) {
    writeCsv(path.join(OUTPUT_DIR, "overall_live_diagnostics.csv"), tables.overallRows, [
        "model", "accuracy_pct", "draw_recall_pct", "brier_score", "avg_confidence_pct", "total", "correct", "incorrect",
    ]);
    writeCsv(path.join(OUTPUT_DIR, "draw_class_diagnostics.csv"), tables.drawRows, [
        "model", "draw_support", "draw_predicted", "draw_correct", "draw_precision_pct", "draw_recall_pct", "draw_f1_pct", "avg_draw_prob_when_draw_pct",
    ]);
    writeCsv(path.join(OUTPUT_DIR, "draw_threshold_sweep.csv"), tables.thresholdRows, [
        "model", "base_accuracy_pct", "base_draw_recall_pct", "threshold_pct", "max_gap_to_best_pct", "accuracy_pct", "accuracy_delta_pct",
        "accuracy_loss_pct", "draw_precision_pct", "draw_recall_pct", "draw_recall_delta_pct", "draw_f1_pct", "draw_predicted", "draw_correct", "total",
    ]);
    writeCsv(path.join(OUTPUT_DIR, "balanced_draw_candidates.csv"), tables.balancedThresholdRows, [
        "model", "base_accuracy_pct", "base_draw_recall_pct", "threshold_pct", "max_gap_to_best_pct", "accuracy_pct", "accuracy_delta_pct",
        "accuracy_loss_pct", "draw_precision_pct", "draw_recall_pct", "draw_recall_delta_pct", "draw_f1_pct", "draw_predicted", "draw_correct", "total",
    ]);
    writeCsv(path.join(OUTPUT_DIR, "balanced_draw_candidates_by_model.csv"), tables.bestBalancedRowsByModel, [
        "model", "base_accuracy_pct", "base_draw_recall_pct", "threshold_pct", "max_gap_to_best_pct", "accuracy_pct", "accuracy_delta_pct",
        "accuracy_loss_pct", "draw_precision_pct", "draw_recall_pct", "draw_recall_delta_pct", "draw_f1_pct", "draw_predicted", "draw_correct", "total",
    ]);
    writeCsv(path.join(OUTPUT_DIR, "confidence_buckets.csv"), tables.confidenceRows, [
        "model", "bucket", "min_pct", "max_pct", "total", "correct", "accuracy_pct", "avg_confidence_pct",
    ]);
    writeCsv(path.join(OUTPUT_DIR, "league_accuracy.csv"), tables.leagueRows, [
        "model", "league", "total", "correct", "accuracy_pct",
    ]);
    writeCsv(path.join(OUTPUT_DIR, "confusion_matrix.csv"), tables.confusionRows, [
        "model", "actual", "predicted", "count",
    ]);
    writeCsv(path.join(OUTPUT_DIR, "draw_watch_matches.csv"), tables.drawWatchRows, [
        "model", "report_date", "event_id", "league", "round", "home_team", "away_team", "home_score", "away_score",
        "actual_result", "base_prediction", "adjusted_prediction", "base_correct", "adjusted_correct", "would_change_prediction",
        "effect", "home_probability_pct", "draw_probability_pct", "away_probability_pct", "best_class", "best_probability_pct",
        "draw_gap_to_best_pct", "confidence_pct", "rule_threshold_pct", "rule_max_gap_to_best_pct",
    ]);
    writeCsv(path.join(OUTPUT_DIR, "draw_watch_summary.csv"), tables.drawWatchSummaryRows, [
        "model", "threshold_pct", "max_gap_to_best_pct", "total_matches", "actual_draws", "actual_draw_rate_pct",
        "base_correct", "base_accuracy_pct", "adjusted_correct", "adjusted_accuracy_pct", "adjusted_accuracy_delta_pct",
        "changed_predictions", "fixed_draws", "lost_hits", "changed_misses", "kept_hits", "kept_misses",
    ]);
    writeCsv(path.join(OUTPUT_DIR, "draw_watch_rule_search.csv"), tables.drawWatchRuleRows, [
        "model", "threshold_pct", "max_gap_to_best_pct", "flagged_matches", "actual_draws", "actual_draw_rate_pct",
        "draw_recall_pct", "draw_f1_pct", "accuracy_pct", "accuracy_loss_pct",
    ]);

    return OUTPUT_DIR;
}

function printSummary(diagnostics, tables, csvDir) {
    const rows = tables.overallRows.map((row) => ({
        model: row.model,
        accuracy: row.accuracy_pct,
        drawRecall: row.draw_recall_pct,
        brier: row.brier_score,
        total: row.total,
    }));

    const drawRows = tables.drawRows.map((row) => ({
        model: row.model,
        drawSupport: row.draw_support,
        drawPredicted: row.draw_predicted,
        drawPrecision: row.draw_precision_pct,
        drawRecall: row.draw_recall_pct,
        drawF1: row.draw_f1_pct,
        avgDrawProbWhenDraw: row.avg_draw_prob_when_draw_pct,
    }));

    const bestThresholdRows = tables.bestThresholdRows.map((row) => ({
        model: row.model,
        baseAcc: row.base_accuracy_pct,
        baseDrawRecall: row.base_draw_recall_pct,
        threshold: row.threshold_pct,
        gap: row.max_gap_to_best_pct,
        thresholdAcc: row.accuracy_pct,
        accLoss: row.accuracy_loss_pct,
        thresholdDrawRecall: row.draw_recall_pct,
        drawRecallGain: row.draw_recall_delta_pct,
        thresholdDrawF1: row.draw_f1_pct,
    }));

    const balancedRows = tables.balancedThresholdRows.slice(0, 12).map((row) => ({
        model: row.model,
        baseAcc: row.base_accuracy_pct,
        threshold: row.threshold_pct,
        gap: row.max_gap_to_best_pct,
        accuracy: row.accuracy_pct,
        accLoss: row.accuracy_loss_pct,
        drawRecall: row.draw_recall_pct,
        drawRecallGain: row.draw_recall_delta_pct,
        drawF1: row.draw_f1_pct,
    }));

    const balancedByModelRows = tables.bestBalancedRowsByModel.map((row) => ({
        model: row.model,
        baseAcc: row.base_accuracy_pct,
        baseDrawRecall: row.base_draw_recall_pct,
        threshold: row.threshold_pct,
        gap: row.max_gap_to_best_pct,
        accuracy: row.accuracy_pct,
        accLoss: row.accuracy_loss_pct,
        drawRecall: row.draw_recall_pct,
        drawRecallGain: row.draw_recall_delta_pct,
        drawF1: row.draw_f1_pct,
    }));

    const drawWatchSummaryRows = tables.drawWatchSummaryRows.map((row) => ({
        model: row.model,
        threshold: row.threshold_pct,
        gap: row.max_gap_to_best_pct,
        matches: row.total_matches,
        actualDrawRate: row.actual_draw_rate_pct,
        baseAccOnWatch: row.base_accuracy_pct,
        adjustedAccOnWatch: row.adjusted_accuracy_pct,
        fixedDraws: row.fixed_draws,
        lostHits: row.lost_hits,
        changedMisses: row.changed_misses,
    }));

    const drawWatchRuleRows = tables.drawWatchRuleRows.slice(0, 8).map((row) => ({
        model: row.model,
        threshold: row.threshold_pct,
        gap: row.max_gap_to_best_pct,
        flagged: row.flagged_matches,
        actualDrawRate: row.actual_draw_rate_pct,
        drawRecall: row.draw_recall_pct,
        accuracy: row.accuracy_pct,
        accLoss: row.accuracy_loss_pct,
    }));

    const confidenceRows = tables.confidenceSummaryRows.map((row) => ({
        model: row.model,
        lowConfAcc: row.low_conf_accuracy_pct,
        highConfAcc: row.high_conf_accuracy_pct,
        highConfMatches: row.high_conf_matches,
        highConfAvg: row.high_conf_avg_pct,
    }));

    const bestAccuracyModel = tables.overallRows.find((row) => row.model !== "consensus") ?? tables.overallRows[0];
    const bestBrierModel = tables.overallRows
        .filter((row) => row.model !== "consensus" && row.brier_score != null)
        .sort((a, b) => a.brier_score - b.brier_score)[0];
    const bestDrawModel = tables.drawRows.find((row) => row.model !== "consensus");
    const bestThreshold = tables.bestThresholdRows[0];
    const bestBalanced = tables.balancedThresholdRows[0];
    const drawWatchSummary = tables.drawWatchSummaryRows[0];
    const bestAccuracyBalanced = bestAccuracyModel
        ? tables.bestBalancedRowsByModel.find((row) => row.model === bestAccuracyModel.model)
        : null;
    const leagueRows = tables.bestLeagueRows.map((row) => ({
        league: row.league,
        total: row.total,
        accuracy: row.accuracy_pct,
    }));

    console.log(`reports: ${diagnostics.reports_read}`);
    console.log(`finished matches: ${diagnostics.finished_matches}`);
    console.log(`date range: ${diagnostics.date_range.first ?? "-"} .. ${diagnostics.date_range.last ?? "-"}`);
    console.log("");
    console.log("1) overall live diagnostics:");
    console.table(rows);
    console.log("2) draw class diagnostics:");
    console.table(drawRows);
    console.log("3) best draw-aware rule per model (highest DRAW F1):");
    console.table(bestThresholdRows);
    console.log(`4) balanced DRAW candidates (accuracy loss <= ${MAX_BALANCED_ACCURACY_LOSS}pp, DRAW recall gain >= ${MIN_BALANCED_DRAW_RECALL_GAIN}pp):`);
    console.table(balancedRows);
    console.log("5) best balanced DRAW candidate per model:");
    console.table(balancedByModelRows);
    console.log(`6) draw watch rule (${DRAW_WATCH_MODEL}, DRAW >= ${DRAW_WATCH_THRESHOLD}%, gap <= ${DRAW_WATCH_MAX_GAP_TO_BEST}pp):`);
    console.table(drawWatchSummaryRows);
    console.log(`7) draw watch rule search (${DRAW_WATCH_MODEL}, min ${MIN_DRAW_WATCH_RULE_MATCHES} flagged matches):`);
    console.table(drawWatchRuleRows);
    console.log("8) confidence bucket sanity check:");
    console.table(confidenceRows);

    if (leagueRows.length > 0) {
        console.log(`9) league split for best accuracy model (${bestAccuracyModel.model}, min ${MIN_LEAGUE_MATCHES} matches):`);
        console.log("best leagues:");
        console.table(leagueRows.slice(0, 8));
        console.log("weakest leagues:");
        console.table([...leagueRows].reverse().slice(0, 8));
    }

    console.log("key takeaways:");
    if (bestAccuracyModel) {
        console.log(`- Best accuracy: ${bestAccuracyModel.model} (${bestAccuracyModel.accuracy_pct}%).`);
    }
    if (bestBrierModel) {
        console.log(`- Best Brier score: ${bestBrierModel.model} (${bestBrierModel.brier_score}); lower means better probability calibration.`);
    }
    if (bestDrawModel) {
        console.log(`- Best raw DRAW recall: ${bestDrawModel.model} (${bestDrawModel.draw_recall_pct}%), but check its overall accuracy before using it as the main model.`);
    }
    if (bestThreshold) {
        console.log(
            `- Best simulated DRAW F1: ${bestThreshold.model}, DRAW >= ${bestThreshold.threshold_pct}% and within ${bestThreshold.max_gap_to_best_pct}pp of the best class ` +
            `gives DRAW recall ${bestThreshold.draw_recall_pct}% at ${bestThreshold.accuracy_pct}% accuracy.`
        );
    }
    if (bestBalanced) {
        console.log(
            `- Best balanced candidate: ${bestBalanced.model}, DRAW >= ${bestBalanced.threshold_pct}% and within ${bestBalanced.max_gap_to_best_pct}pp. ` +
            `Accuracy changes ${bestBalanced.accuracy_delta_pct}pp, DRAW recall changes +${bestBalanced.draw_recall_delta_pct}pp.`
        );
    }
    if (bestAccuracyBalanced) {
        console.log(
            `- For the top accuracy model (${bestAccuracyModel.model}), the balanced DRAW rule is DRAW >= ${bestAccuracyBalanced.threshold_pct}% ` +
            `and within ${bestAccuracyBalanced.max_gap_to_best_pct}pp: accuracy ${bestAccuracyBalanced.accuracy_pct}% ` +
            `(${bestAccuracyBalanced.accuracy_delta_pct}pp), DRAW recall ${bestAccuracyBalanced.draw_recall_pct}%.`
        );
    }
    if (drawWatchSummary) {
        console.log(
            `- Draw watch flags ${drawWatchSummary.total_matches} historical ${DRAW_WATCH_MODEL} matches; ` +
            `${drawWatchSummary.actual_draw_rate_pct}% were actual draws. It would fix ${drawWatchSummary.fixed_draws} draws and lose ${drawWatchSummary.lost_hits} previous hits.`
        );
    }
    console.log("- This script does not retrain models or change predictions; it only diagnoses existing reports.");
    console.log("");
    console.log(`written: ${OUTPUT_PATH}`);
    console.log(`csv exports: ${csvDir}`);
}

const diagnostics = collectDiagnostics();
const tables = buildDiagnosticsTables(diagnostics);
const csvDir = writeCsvExports(tables);

diagnostics.csv_exports = csvDir;

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(diagnostics, null, 2) + "\n");
printSummary(diagnostics, tables, csvDir);
