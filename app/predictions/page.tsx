import type { Metadata } from "next";
import {
    listReportDates,
    loadPredictionReport,
    aggregateAccuracy,
    loadComparisonSummary,
    computeAccuracyOverTime,
    computeResultTypeAccuracy,
} from "../util/data/predictionService";
import { resolveCompetitionByDataPath } from "../util/league/leagueRegistry";
import { loadAllSeasons } from "../util/data/dataService";
import DatePicker from "../components/home/DatePicker";
import PredictionsClient from "./PredictionsClient";
import ModelComparisonCharts from "./ModelComparisonCharts";
import { getServerT } from "../util/i18n/getLocale";

export const metadata: Metadata = {
    title: "Predictions Dashboard",
    description: "Machine learning prediction dashboard with per-model accuracy tracking and consensus voting across 9 classifiers",
};

interface PageProps {
    searchParams: { date?: string };
}

function buildTeamIdsForReport(leagueDataPaths: string[]): Record<string, number> {
    const teamIds: Record<string, number> = {};
    for (const dataPath of leagueDataPaths) {
        const comp = resolveCompetitionByDataPath(dataPath);
        if (!comp) continue;
        const matches = loadAllSeasons(comp);
        for (const m of matches) {
            if (!(m.home_team in teamIds)) teamIds[m.home_team] = m.home_team_id;
            if (!(m.away_team in teamIds)) teamIds[m.away_team] = m.away_team_id;
        }
    }
    return teamIds;
}

export default async function Predictions({ searchParams }: PageProps) {
    const dates = listReportDates();
    const selectedDate = searchParams.date || dates[dates.length - 1] || "";
    const report = selectedDate ? loadPredictionReport(selectedDate) : null;

    const t = getServerT();

    if (!report || dates.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500 dark:text-gray-400">
                <p className="text-xl">{t("no_data")}</p>
            </div>
        );
    }

    const allDatesAccuracy = aggregateAccuracy(dates);
    const comparisonSummary = loadComparisonSummary();
    const accuracyOverTime = computeAccuracyOverTime(dates);
    const resultTypeBreakdown = computeResultTypeAccuracy(dates);

    const leagueDataPaths = Array.from(new Set(report.matches.map((m) => `${m.comp_type}/${m.league}`)));
    const teamIds = buildTeamIdsForReport(leagueDataPaths);

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

    const consensusAcc = report.summary.model_accuracy["consensus"];
    const bestModel = Object.entries(report.summary.model_accuracy)
        .filter(([key]) => key !== "consensus")
        .sort((a, b) => b[1].accuracy_pct - a[1].accuracy_pct)[0];

    const modelRanking = Object.entries(allDatesAccuracy)
        .filter(([key]) => key !== "consensus")
        .sort((a, b) => b[1].accuracy_pct - a[1].accuracy_pct);

    return (
        <div className="flex flex-col w-full max-w-[1600px] mx-auto px-6 py-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-5 text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t("total_matches_today")}</div>
                    <div className="text-4xl font-bold text-gray-900 dark:text-white">{report.summary.total_matches}</div>
                </div>
                <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-5 text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t("consensus_accuracy")}</div>
                    <div className="text-4xl font-bold text-emerald-400">{consensusAcc?.accuracy_pct ?? 0}%</div>
                </div>
                <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-5 text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t("best_model_day")}</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{bestModel?.[0] ?? t("empty_placeholder")}</div>
                    <div className="text-sm text-emerald-400">{bestModel?.[1]?.accuracy_pct ?? 0}%</div>
                </div>
            </div>

            <DatePicker dates={dates} selectedDate={selectedDate} todayIso={new Date().toISOString().slice(0, 10)} basePath="/predictions" />

            <ModelComparisonCharts
                comparison={comparisonSummary}
                accuracyOverTime={accuracyOverTime}
                resultTypeBreakdown={resultTypeBreakdown}
            />

            <div className="flex flex-col lg:flex-row gap-6 mt-6">
                <div className="flex-1">
                    <PredictionsClient
                        matches={report.matches}
                        leagues={leagues}
                        teamIds={teamIds}
                        dayAccuracy={report.summary.model_accuracy}
                    />
                </div>

                <div className="w-full lg:w-[320px]">
                    <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-5 sticky top-4">
                        <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                            {t("model_performance")}
                            <span className="text-[10px] text-gray-400 dark:text-gray-600 ml-2">({t("all_time")})</span>
                        </h3>
                        <div className="space-y-2">
                            {modelRanking.map(([model, acc], i) => (
                                <div key={model} className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-800 last:border-0">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-gray-400 dark:text-gray-500 w-4">{i + 1}</span>
                                        <span className="text-sm text-gray-900 dark:text-white font-medium">{model}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
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
    );
}
