import fs from "fs";
import path from "path";
import { cache } from "../serverCache";
import { readJson } from "./fileUtils";
import { filterReportDatesByWindow } from "./reportWindow";
import { isValidYmdDate, normalizeReportDate } from "./dateUtils";
import { PredictionReport, AnalysisReport, PredictionMatch, ModelAccuracy, ModelPrediction, ConsensusPrediction, MatchResult } from "@/types/predictions";

type RawPredictionMatch = Omit<PredictionMatch, "predictions"> & {
    predictions: Record<string, ModelPrediction>;
    consensus?: ConsensusPrediction;
};

type RawPredictionReport = Omit<PredictionReport, "matches"> & {
    matches: RawPredictionMatch[];
};

interface AccuracyHistoryModelStats {
    correct: number;
    incorrect: number;
    total: number;
}

interface AccuracyHistoryDate {
    date: string;
    models: Record<string, AccuracyHistoryModelStats>;
}

interface AccuracyHistoryArtifact {
    generated_at?: string;
    dates: AccuracyHistoryDate[];
}

interface DiagnosticClassStats {
    support: number;
    predicted: number;
    correct: number;
    precision_pct: number;
    recall_pct: number;
    f1_pct: number;
}

export interface DiagnosticConfidenceBucket {
    label: string;
    min: number;
    max: number | null;
    total: number;
    correct: number;
    accuracy_pct: number;
    avg_confidence_pct: number;
}

export interface DiagnosticLeagueAccuracy {
    correct: number;
    total: number;
    accuracy_pct: number;
}

export interface DiagnosticDrawThresholdRow {
    threshold_pct: number;
    max_gap_to_best_pct: number;
    total: number;
    correct: number;
    draw_support: number;
    draw_predicted: number;
    draw_correct: number;
    accuracy_pct: number;
    accuracy_delta_pct: number;
    accuracy_loss_pct: number;
    draw_precision_pct: number;
    draw_recall_pct: number;
    draw_recall_delta_pct: number;
    draw_f1_pct: number;
}

export interface DiagnosticDrawWatchMatch {
    report_date: string;
    event_id: number | string;
    league: string;
    home_team: string;
    away_team: string;
    actual_result: MatchResult;
    base_prediction: MatchResult;
    adjusted_prediction: MatchResult;
    base_correct: boolean;
    adjusted_correct: boolean;
    would_change_prediction: boolean;
    effect: string;
    draw_probability_pct: number;
    draw_gap_to_best_pct: number;
    rule_threshold_pct: number;
    rule_max_gap_to_best_pct: number;
}

export interface ModelDiagnosticStats {
    total: number;
    correct: number;
    incorrect: number;
    accuracy_pct: number;
    avg_confidence_pct: number;
    brier_score: number | null;
    per_class: Record<MatchResult, DiagnosticClassStats>;
    confidence_buckets: DiagnosticConfidenceBucket[];
    league_accuracy: Record<string, DiagnosticLeagueAccuracy>;
    draw_threshold_sweep: DiagnosticDrawThresholdRow[];
    draw_watch_matches: DiagnosticDrawWatchMatch[];
}

export interface ModelDiagnosticsArtifact {
    generated_at: string;
    date_range: {
        first: string | null;
        last: string | null;
    };
    reports_read: number;
    finished_matches: number;
    models: Record<string, ModelDiagnosticStats>;
    csv_exports?: string;
}

function repoPath(...segments: string[]): string {
    return path.join(/*turbopackIgnore: true*/ process.cwd(), ...segments);
}

function allowSourceFallback(): boolean {
    return process.env.NODE_ENV !== "production";
}

function normalizePredictionMatch(match: RawPredictionMatch): PredictionMatch {
    const predictions = match.predictions as PredictionMatch["predictions"];
    if ("consensus" in predictions) {
        return match as unknown as PredictionMatch;
    }

    if (!match.consensus) {
        return { ...match, predictions } as PredictionMatch;
    }

    return {
        ...match,
        predictions: {
            ...match.predictions,
            consensus: match.consensus,
        } as PredictionMatch["predictions"],
    };
}

function normalizePredictionReport(report: RawPredictionReport | null): PredictionReport | null {
    if (!report) return null;
    return {
        ...report,
        matches: report.matches.map(normalizePredictionMatch),
    };
}

function reportDirs(): string[] {
    const env = process.env.SOFASCORE_REPORTS_DIR;
    if (env) return [env];
    const prebuilt = repoPath(".data", "reports");
    const dirs: string[] = [];
    if (fs.existsSync(prebuilt)) dirs.push(prebuilt);
    if (allowSourceFallback()) {
        const source = repoPath("SofascoreData", "reports");
        if (fs.existsSync(source)) dirs.push(source);
    }
    return dirs;
}

function collectReportDates(): string[] {
    const dates = new Set<string>();
    for (const dir of reportDirs()) {
        if (!fs.existsSync(dir)) continue;
        let entries: string[];
        try {
            entries = fs.readdirSync(dir);
        } catch {
            continue;
        }
        for (const d of entries) {
            if (!isValidYmdDate(d)) continue;
            try {
                if (fs.statSync(path.join(dir, d)).isDirectory()) dates.add(d);
            } catch {
                // skip
            }
        }
    }
    return Array.from(dates).sort();
}

function accuracyHistoryPaths(): string[] {
    const paths = [repoPath(".data", "models", "accuracy_history.json")];
    if (allowSourceFallback()) {
        paths.push(repoPath("SofascoreData", "data", "models", "accuracy_history.json"));
    }
    return paths;
}

function modelDiagnosticsPaths(): string[] {
    const paths = [repoPath(".data", "models", "model_diagnostics.json")];
    if (allowSourceFallback()) {
        paths.push(repoPath("SofascoreData", "data", "models", "model_diagnostics.json"));
    }
    return paths;
}

function readPredictionReportInDateDir(dateDir: string): PredictionReport | null {
    return (
        normalizePredictionReport(readJson<RawPredictionReport>(path.join(dateDir, "predictions_finished.json"))) ??
        normalizePredictionReport(readJson<RawPredictionReport>(path.join(dateDir, "predictions_unfinished.json")))
    );
}

function safeReportDate(date: string): string | null {
    return normalizeReportDate(date);
}

function predictionReportMtime(dateDir: string): number {
    let latest = 0;
    for (const fileName of ["predictions_finished.json", "predictions_unfinished.json"]) {
        try {
            const stat = fs.statSync(path.join(dateDir, fileName));
            latest = Math.max(latest, stat.mtimeMs);
        } catch {
            // Missing report files are expected for dates without predictions.
        }
    }
    return latest;
}

function newestExistingReportDir(dateDirs: string[]): string | null {
    return dateDirs
        .map((dir) => ({ dir, mtime: predictionReportMtime(dir) }))
        .filter(({ mtime }) => mtime > 0)
        .sort((a, b) => b.mtime - a.mtime)[0]?.dir ?? null;
}

export const loadPredictionReport = cache((date: string): PredictionReport | null => {
    const safeDate = safeReportDate(date);
    if (!safeDate) return null;

    const env = process.env.SOFASCORE_REPORTS_DIR;
    if (env) {
        return readPredictionReportInDateDir(path.join(env, safeDate));
    }
    const dateDirs = [repoPath(".data", "reports", safeDate)];
    if (allowSourceFallback()) {
        dateDirs.push(repoPath("SofascoreData", "reports", safeDate));
    }
    const newestDir = newestExistingReportDir(dateDirs);
    return newestDir ? readPredictionReportInDateDir(newestDir) : null;
});

export const loadAnalysisReport = cache((date: string): AnalysisReport | null => {
    const safeDate = safeReportDate(date);
    if (!safeDate) return null;

    const env = process.env.SOFASCORE_REPORTS_DIR;
    if (env) {
        return readJson<AnalysisReport>(path.join(env, safeDate, "analysis.json"));
    }
    const prebuilt = repoPath(".data", "reports", safeDate, "analysis.json");
    if (!allowSourceFallback()) return readJson<AnalysisReport>(prebuilt);
    return readJson<AnalysisReport>(prebuilt) ?? readJson<AnalysisReport>(repoPath("SofascoreData", "reports", safeDate, "analysis.json"));
});

export const listReportDates = cache((): string[] => {
    return filterReportDatesByWindow(collectReportDates());
});

export const listAllReportDates = cache((): string[] => collectReportDates());

export const loadAccuracyHistory = cache((): AccuracyHistoryArtifact | null => {
    for (const filePath of accuracyHistoryPaths()) {
        const artifact = readJson<AccuracyHistoryArtifact>(filePath);
        if (!artifact?.dates?.length) continue;
        return {
            ...artifact,
            dates: artifact.dates
                .filter((row) => isValidYmdDate(row.date) && row.models && typeof row.models === "object")
                .sort((a, b) => a.date.localeCompare(b.date)),
        };
    }
    return null;
});

export const loadModelDiagnostics = cache((): ModelDiagnosticsArtifact | null => {
    for (const filePath of modelDiagnosticsPaths()) {
        const artifact = readJson<ModelDiagnosticsArtifact>(filePath);
        if (!artifact?.models || typeof artifact.models !== "object") continue;
        return artifact;
    }
    return null;
});

export function getLatestReportDate(): string | null {
    const dates = listReportDates();
    return dates.length > 0 ? dates[dates.length - 1] : null;
}

export function getMatchPrediction(report: PredictionReport, matchId: string | number): PredictionMatch | undefined {
    const numericId = typeof matchId === "number" ? matchId : Number.parseInt(matchId, 10);
    if (Number.isFinite(numericId)) {
        const byEventId = report.matches.find((m) => m.event_id === numericId);
        if (byEventId) return byEventId;
    }

    return report.matches.find((m) => m.id === String(matchId));
}

export function getMatchesByLeague(report: PredictionReport, league: string): PredictionMatch[] {
    return report.matches.filter((m) => m.league === league);
}

export function getModelAccuracySummary(report: PredictionReport): Record<string, ModelAccuracy> {
    return report.summary.model_accuracy;
}

export function computeConsensusAccuracy(matches: PredictionMatch[]): ModelAccuracy {
    const finished = matches.filter((m) => m.status === "finished" && m.actual_result);
    let correct = 0;

    for (const match of finished) {
        const consensus = match.predictions.consensus as ConsensusPrediction | undefined;
        if (consensus?.prediction === match.actual_result) correct++;
    }

    const total = finished.length;
    return {
        correct,
        incorrect: Math.max(0, total - correct),
        total,
        accuracy_pct: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
    };
}

export interface ModelComparisonRow {
    model: string;
    testAccuracy: number;
    testF1: number;
    liveAccuracy: number;
    liveMatches: number;
    brierScore: number;
    trainTime: number;
    predictTime: number;
    memory: number;
    modelSize: number;
}

export function loadComparisonSummary(): ModelComparisonRow[] {
    const prebuilt = repoPath(".data", "models", "comparison_summary.csv");
    const dev = allowSourceFallback() ? repoPath("SofascoreData", "data", "models", "comparison_summary.csv") : "";
    const filePath = fs.existsSync(prebuilt) ? prebuilt : dev;
    if (!fs.existsSync(filePath)) return [];

    const raw = fs.readFileSync(filePath, "utf-8").trim();
    const lines = raw.split(/\r?\n/);
    if (lines.length < 2) return [];

    const num = (s: string): number => {
        const v = parseFloat(s);
        return Number.isFinite(v) ? v : 0;
    };
    const int = (s: string): number => {
        const v = parseInt(s, 10);
        return Number.isFinite(v) ? v : 0;
    };

    const parseCsvLine = (line: string): string[] => {
        const cols: string[] = [];
        let current = "";
        let quoted = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const next = line[i + 1];

            if (char === '"' && quoted && next === '"') {
                current += '"';
                i++;
            } else if (char === '"') {
                quoted = !quoted;
            } else if (char === "," && !quoted) {
                cols.push(current);
                current = "";
            } else {
                current += char;
            }
        }

        cols.push(current);
        return cols;
    };

    const rows: ModelComparisonRow[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length < 10) continue;
        rows.push({
            model: cols[0],
            testAccuracy: num(cols[1]),
            testF1: num(cols[2]),
            liveAccuracy: num(cols[3]),
            liveMatches: int(cols[4]),
            brierScore: num(cols[5]),
            trainTime: num(cols[6]),
            predictTime: num(cols[7]),
            memory: num(cols[8]),
            modelSize: num(cols[9]),
        });
    }
    return rows;
}

export interface AccuracyOverTimePoint {
    date: string;
    [model: string]: number | string;
}

function addAccuracyStats(
    running: Record<string, { correct: number; total: number }>,
    model: string,
    acc: AccuracyHistoryModelStats | ModelAccuracy
): void {
    if (!running[model]) running[model] = { correct: 0, total: 0 };
    running[model].correct += Number.isFinite(acc.correct) ? acc.correct : 0;
    running[model].total += Number.isFinite(acc.total) ? acc.total : 0;
}

function accuracyPoint(date: string, running: Record<string, { correct: number; total: number }>): AccuracyOverTimePoint {
    const point: AccuracyOverTimePoint = { date };
    for (const [model, stats] of Object.entries(running)) {
        point[model] = stats.total > 0 ? Math.round((stats.correct / stats.total) * 1000) / 10 : 0;
    }
    return point;
}

export function computeAccuracyOverTime(dates?: string[]): AccuracyOverTimePoint[] {
    const points: AccuracyOverTimePoint[] = [];
    const running: Record<string, { correct: number; total: number }> = {};

    if (!dates) {
        const history = loadAccuracyHistory();
        if (history?.dates?.length) {
            for (const row of history.dates) {
                for (const [model, acc] of Object.entries(row.models)) {
                    addAccuracyStats(running, model, acc);
                }
                points.push(accuracyPoint(row.date, running));
            }
            return points;
        }
    }

    for (const date of dates ?? listAllReportDates()) {
        const report = loadPredictionReport(date);
        if (!report) continue;

        for (const [model, acc] of Object.entries(report.summary.model_accuracy)) {
            addAccuracyStats(running, model, acc);
        }

        points.push(accuracyPoint(date, running));
    }
    return points;
}

export interface ResultTypeBreakdown {
    model: string;
    HOME: number;
    DRAW: number;
    AWAY: number;
}

export function computeResultTypeAccuracy(dates: string[]): ResultTypeBreakdown[] {
    const stats: Record<string, Record<"HOME" | "DRAW" | "AWAY", { correct: number; total: number }>> = {};

    for (const date of dates) {
        const report = loadPredictionReport(date);
        if (!report) continue;

        for (const match of report.matches) {
            const actual = match.actual_result;
            if (!actual || (actual !== "HOME" && actual !== "DRAW" && actual !== "AWAY")) continue;

            for (const [model, pred] of Object.entries(match.predictions)) {
                if (model === "consensus") continue;
                const p = pred as ModelPrediction;
                if (!p.prediction) continue;

                if (!stats[model]) {
                    stats[model] = {
                        HOME: { correct: 0, total: 0 },
                        DRAW: { correct: 0, total: 0 },
                        AWAY: { correct: 0, total: 0 },
                    };
                }
                stats[model][actual].total++;
                if (p.prediction === actual) stats[model][actual].correct++;
            }
        }
    }

    const result: ResultTypeBreakdown[] = [];
    for (const [model, perType] of Object.entries(stats)) {
        result.push({
            model,
            HOME: perType.HOME.total > 0 ? Math.round((perType.HOME.correct / perType.HOME.total) * 1000) / 10 : 0,
            DRAW: perType.DRAW.total > 0 ? Math.round((perType.DRAW.correct / perType.DRAW.total) * 1000) / 10 : 0,
            AWAY: perType.AWAY.total > 0 ? Math.round((perType.AWAY.correct / perType.AWAY.total) * 1000) / 10 : 0,
        });
    }
    return result.sort((a, b) => a.model.localeCompare(b.model));
}

export function aggregateAccuracy(dates?: string[]): Record<string, ModelAccuracy> {
    const totals = new Map<string, ModelAccuracy>();

    const history = dates ? null : loadAccuracyHistory();
    if (history?.dates?.length) {
        for (const row of history.dates) {
            for (const [model, acc] of Object.entries(row.models)) {
                const existing = totals.get(model);
                if (existing) {
                    existing.correct += acc.correct;
                    existing.incorrect += acc.incorrect;
                    existing.total += acc.total;
                } else {
                    totals.set(model, { ...acc, accuracy_pct: 0 });
                }
            }
        }
    }

    for (const date of dates ?? (history?.dates?.length ? [] : listAllReportDates())) {
        const report = loadPredictionReport(date);
        if (!report) continue;

        for (const [model, acc] of Object.entries(report.summary.model_accuracy)) {
            const existing = totals.get(model);
            if (existing) {
                existing.correct += acc.correct;
                existing.incorrect += acc.incorrect;
                existing.total += acc.total;
            } else {
                totals.set(model, { ...acc });
            }
        }
    }

    const result: Record<string, ModelAccuracy> = {};
    totals.forEach((acc, model) => {
        acc.accuracy_pct = acc.total > 0 ? Math.round((acc.correct / acc.total) * 1000) / 10 : 0;
        result[model] = acc;
    });

    return result;
}
