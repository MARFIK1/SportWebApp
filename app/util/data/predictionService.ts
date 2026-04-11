import fs from "fs";
import path from "path";
import { PredictionReport, AnalysisReport, PredictionMatch, ModelAccuracy } from "@/types/predictions";

function resolveReportsDir(): string {
    const prebuilt = path.join(process.cwd(), ".data", "reports");
    if (fs.existsSync(prebuilt)) return prebuilt;
    return path.join(process.cwd(), "SofascoreData", "reports");
}

const REPORTS_DIR = process.env.SOFASCORE_REPORTS_DIR || resolveReportsDir();

function readJson<T>(filePath: string): T | null {
    try {
        const raw = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function loadPredictionReport(date: string): PredictionReport | null {
    const filePath = path.join(REPORTS_DIR, date, "predictions_finished.json");
    return readJson<PredictionReport>(filePath);
}

export function loadAnalysisReport(date: string): AnalysisReport | null {
    const filePath = path.join(REPORTS_DIR, date, "analysis.json");
    return readJson<AnalysisReport>(filePath);
}

export function listReportDates(): string[] {
    if (!fs.existsSync(REPORTS_DIR)) return [];
    return fs.readdirSync(REPORTS_DIR)
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort();
}

export function getLatestReportDate(): string | null {
    const dates = listReportDates();
    return dates.length > 0 ? dates[dates.length - 1] : null;
}

export function getMatchPrediction(report: PredictionReport, matchId: string): PredictionMatch | undefined {
    return report.matches.find((m) => m.id === matchId);
}

export function getMatchesByLeague(report: PredictionReport, league: string): PredictionMatch[] {
    return report.matches.filter((m) => m.league === league);
}

export function getModelAccuracySummary(report: PredictionReport): Record<string, ModelAccuracy> {
    return report.summary.model_accuracy;
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
