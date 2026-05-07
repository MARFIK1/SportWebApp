import type { Metadata } from "next";
import {
    listReportDates,
    loadPredictionReport,
    aggregateAccuracy,
    loadComparisonSummary,
    computeAccuracyOverTime,
    computeResultTypeAccuracy,
    computeConsensusAccuracy,
} from "../util/data/predictionService";
import { resolveCompetitionByDataPath } from "../util/league/leagueRegistry";
import { buildMatchLookupMaps } from "../util/data/dataService";
import DatePicker from "../components/home/DatePicker";
import PredictionsClient from "./PredictionsClient";
import ModelComparisonCharts from "./ModelComparisonCharts";
import { getServerT } from "../util/i18n/getLocale";
import { normalizeReportDate, todayYmd } from "../util/data/dateUtils";

export const metadata: Metadata = {
    title: "Predictions Dashboard",
    description: "Machine learning prediction dashboard with per-model accuracy tracking and consensus voting across 9 classifiers",
};

interface PageProps {
    searchParams: Promise<{ date?: string }>;
}

function selectReportDate(dates: string[], requestedDate: string | null, todayIso: string): string {
    if (requestedDate && dates.includes(requestedDate)) return requestedDate;
    if (dates.includes(todayIso)) return todayIso;
    return dates[dates.length - 1] || "";
}

export default async function Predictions({ searchParams }: PageProps) {
    const resolvedSearchParams = await searchParams;
    const dates = listReportDates();
    const requestedDate = normalizeReportDate(resolvedSearchParams.date);
    const todayIso = todayYmd();
    const selectedDate = selectReportDate(dates, requestedDate, todayIso);
    const report = selectedDate ? loadPredictionReport(selectedDate) : null;

    const t = await getServerT();

    if (!report || dates.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500 dark:text-gray-400">
                <p className="text-xl">{t("no_data")}</p>
            </div>
        );
    }

    const allDatesAccuracy = aggregateAccuracy();
    const comparisonSummary = loadComparisonSummary();
    const accuracyOverTime = computeAccuracyOverTime();
    const resultTypeBreakdown = computeResultTypeAccuracy(dates);

    const leagueDataPaths = Array.from(new Set(report.matches.map((m) => `${m.comp_type}/${m.league}`)));
    const competitions = leagueDataPaths.flatMap((dataPath) => {
        const comp = resolveCompetitionByDataPath(dataPath);
        return comp ? [comp] : [];
    });
    const { teamIds } = buildMatchLookupMaps(competitions);

    const matchCountByLeague: Record<string, number> = {};
    for (const m of report.matches) {
        const key = `${m.comp_type}/${m.league}`;
        matchCountByLeague[key] = (matchCountByLeague[key] ?? 0) + 1;
    }

    const leagues = leagueDataPaths.map((dp) => {
        const comp = resolveCompetitionByDataPath(dp);
        return {
            dataPath: dp,
            name: comp?.name ?? dp,
            priority: comp?.priority ?? 999,
            count: matchCountByLeague[dp] ?? 0,
        };
    }).sort((a, b) => a.priority - b.priority);

    const consensusAcc = computeConsensusAccuracy(report.matches);
    const bestModel = Object.entries(report.summary.model_accuracy)
        .filter(([key]) => key !== "consensus")
        .filter(([, acc]) => acc.total > 0)
        .sort((a, b) => b[1].accuracy_pct - a[1].accuracy_pct)[0];

    const dayModelRanking = Object.entries(report.summary.model_accuracy)
        .filter(([key]) => key !== "consensus")
        .filter(([, acc]) => acc.total > 0)
        .sort((a, b) => b[1].accuracy_pct - a[1].accuracy_pct);

    const modelRanking = Object.entries(allDatesAccuracy)
        .filter(([key]) => key !== "consensus")
        .sort((a, b) => b[1].accuracy_pct - a[1].accuracy_pct);

    return (
        <div className="flex w-full min-w-0 max-w-[1600px] flex-col overflow-x-hidden px-4 py-6 sm:px-6 lg:mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-sm shadow-slate-900/5 dark:border-gray-800 dark:bg-gray-900/50 dark:shadow-black/10">
                    <div className="absolute inset-y-0 left-0 w-1 bg-emerald-400" />
                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-[0.22em] mb-2">{t("total_matches_today")}</div>
                    <div className="text-4xl font-bold text-gray-900 dark:text-white">{report.summary.total_matches}</div>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-sm shadow-slate-900/5 dark:border-gray-800 dark:bg-gray-900/50 dark:shadow-black/10">
                    <div className="absolute inset-y-0 left-0 w-1 bg-cyan-400" />
                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-[0.22em] mb-2">{t("consensus_accuracy")}</div>
                    <div className="text-4xl font-bold text-emerald-400">{consensusAcc?.accuracy_pct ?? 0}%</div>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-sm shadow-slate-900/5 dark:border-gray-800 dark:bg-gray-900/50 dark:shadow-black/10">
                    <div className="absolute inset-y-0 left-0 w-1 bg-emerald-400" />
                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-[0.22em] mb-2">{t("best_model_day")}</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{bestModel?.[0] ?? t("empty_placeholder")}</div>
                    <div className="text-sm text-emerald-400">{bestModel?.[1]?.accuracy_pct ?? 0}%</div>
                </div>
            </div>

            <DatePicker dates={dates} selectedDate={selectedDate} todayIso={todayIso} basePath="/predictions" />

            <ModelComparisonCharts
                comparison={comparisonSummary}
                accuracyOverTime={accuracyOverTime}
                resultTypeBreakdown={resultTypeBreakdown}
            />

            <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0">
                    <PredictionsClient
                        matches={report.matches}
                        leagues={leagues}
                        teamIds={teamIds}
                    />
                </div>

                <div className="min-w-0">
                    <div className="sticky top-4 space-y-4">
                        <div className="rounded-2xl bg-white p-5 dark:bg-gray-900/50">
                            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                {t("model_performance")}
                                <span className="ml-2 text-[10px] text-gray-400 dark:text-gray-600">({t("day")})</span>
                            </h3>
                            <div className="space-y-2">
                                {dayModelRanking.length > 0 ? dayModelRanking.map(([model, acc], i) => (
                                    <div key={model} className="flex min-w-0 items-center justify-between gap-3 border-b border-gray-200 py-2 last:border-0 dark:border-gray-800">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className="w-4 shrink-0 text-xs text-gray-400 dark:text-gray-500">{i + 1}</span>
                                            <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{model}</span>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-3">
                                            <span className={`text-sm font-bold ${acc.accuracy_pct >= 45 ? "text-emerald-400" : "text-gray-500 dark:text-gray-400"}`}>
                                                {acc.accuracy_pct}%
                                            </span>
                                            <span className="text-xs text-gray-400 dark:text-gray-500">{acc.correct}/{acc.total}</span>
                                        </div>
                                    </div>
                                )) : (
                                    <p className="py-2 text-sm text-gray-500 dark:text-gray-400">{t("no_finished_matches")}</p>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl bg-white p-5 dark:bg-gray-900/50">
                            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                {t("model_performance")}
                                <span className="ml-2 text-[10px] text-gray-400 dark:text-gray-600">({t("all_time")})</span>
                            </h3>
                            <div className="space-y-2">
                                {modelRanking.map(([model, acc], i) => (
                                    <div key={model} className="flex min-w-0 items-center justify-between gap-3 border-b border-gray-200 py-2 last:border-0 dark:border-gray-800">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className="w-4 shrink-0 text-xs text-gray-400 dark:text-gray-500">{i + 1}</span>
                                            <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{model}</span>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-3">
                                            <span className={`text-sm font-bold ${acc.accuracy_pct >= 45 ? "text-emerald-400" : "text-gray-500 dark:text-gray-400"}`}>
                                                {acc.accuracy_pct}%
                                            </span>
                                            <span className="text-xs text-gray-400 dark:text-gray-500">{acc.correct}/{acc.total}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
