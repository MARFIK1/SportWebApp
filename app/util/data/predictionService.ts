import fs from "fs";
import path from "path";
import { cache } from "../serverCache";
import { readJson } from "./fileUtils";
import { filterReportDatesByWindow } from "./reportWindow";
import { PredictionReport, AnalysisReport, PredictionMatch, ModelAccuracy, ModelPrediction, ConsensusPrediction } from "@/types/predictions";

type RawPredictionMatch = Omit<PredictionMatch, "predictions"> & {
    predictions: Record<string, ModelPrediction>;
    consensus?: ConsensusPrediction;
};

type RawPredictionReport = Omit<PredictionReport, "matches"> & {
    matches: RawPredictionMatch[];
};

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
    const prebuilt = path.join(process.cwd(), ".data", "reports");
    const source = path.join(process.cwd(), "SofascoreData", "reports");
    const dirs: string[] = [];
    if (fs.existsSync(prebuilt)) dirs.push(prebuilt);
    if (fs.existsSync(source)) dirs.push(source);
    return dirs;
}

function readPredictionReportInDateDir(dateDir: string): PredictionReport | null {
    return (
        normalizePredictionReport(readJson<RawPredictionReport>(path.join(dateDir, "predictions_finished.json"))) ??
        normalizePredictionReport(readJson<RawPredictionReport>(path.join(dateDir, "predictions_unfinished.json")))
    );
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
    const env = process.env.SOFASCORE_REPORTS_DIR;
    if (env) {
        return readPredictionReportInDateDir(path.join(env, date));
    }
    const prebuiltDir = path.join(process.cwd(), ".data", "reports", date);
    const sourceDir = path.join(process.cwd(), "SofascoreData", "reports", date);
    const newestDir = newestExistingReportDir([prebuiltDir, sourceDir]);
    return newestDir ? readPredictionReportInDateDir(newestDir) : null;
});

export const loadAnalysisReport = cache((date: string): AnalysisReport | null => {
    const env = process.env.SOFASCORE_REPORTS_DIR;
    if (env) {
        return readJson<AnalysisReport>(path.join(env, date, "analysis.json"));
    }
    const prebuilt = path.join(process.cwd(), ".data", "reports", date, "analysis.json");
    const source = path.join(process.cwd(), "SofascoreData", "reports", date, "analysis.json");
    return readJson<AnalysisReport>(prebuilt) ?? readJson<AnalysisReport>(source);
});

export const listReportDates = cache((): string[] => {
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
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
            try {
                if (fs.statSync(path.join(dir, d)).isDirectory()) dates.add(d);
            } catch {
                // skip
            }
        }
    }
    return filterReportDatesByWindow(Array.from(dates).sort());
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
    const prebuilt = path.join(process.cwd(), ".data", "models", "comparison_summary.csv");
    const dev = path.join(process.cwd(), "SofascoreData", "data", "models", "comparison_summary.csv");
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

    const rows: ModelComparisonRow[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
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

export function computeAccuracyOverTime(dates: string[]): AccuracyOverTimePoint[] {
    const points: AccuracyOverTimePoint[] = [];
    const running: Record<string, { correct: number; total: number }> = {};

    for (const date of dates) {
        const report = loadPredictionReport(date);
        if (!report) continue;

        for (const [model, acc] of Object.entries(report.summary.model_accuracy)) {
            if (!running[model]) running[model] = { correct: 0, total: 0 };
            running[model].correct += acc.correct;
            running[model].total += acc.total;
        }

        const point: AccuracyOverTimePoint = { date };
        for (const [model, stats] of Object.entries(running)) {
            point[model] = stats.total > 0 ? Math.round((stats.correct / stats.total) * 1000) / 10 : 0;
        }
        points.push(point);
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

export function aggregateAccuracy(dates: string[]): Record<string, ModelAccuracy> {
    const totals = new Map<string, ModelAccuracy>();

    for (const date of dates) {
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
