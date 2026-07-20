import {
    listReportDates,
    loadPredictionReport,
    aggregateAccuracy,
    loadComparisonSummary,
    loadModelDiagnostics,
    computeAccuracyOverTime,
    computeResultTypeAccuracy,
    computeConsensusAccuracy,
    computeCompetitionReliability,
    computeConsensusConfidenceBuckets,
    getModelAccuracySummary,
} from "../util/data/predictionService";
import { getCompetitionDisplayPriority, resolveCompetitionByDataPath } from "../util/league/leagueRegistry";
import { buildMatchLookupMaps } from "../util/data/dataService";
import DatePicker from "../components/home/DatePicker";
import PredictionsClient from "./PredictionsClient";
import ModelComparisonCharts from "./ModelComparisonCharts";
import ModelDiagnosticsPanel from "./ModelDiagnosticsPanel";
import PublicModelInsights from "./PublicModelInsights";
import PredictionQualityPanel from "./PredictionQualityPanel";
import DailyHighlights from "./DailyHighlights";
import ConsensusReliabilityPanel from "./ConsensusReliabilityPanel";
import { getServerT } from "../util/i18n/getLocale";
import { normalizeReportDate, todayYmd } from "../util/data/dateUtils";

interface PredictionsDashboardProps {
    searchParams: { date?: string };
    basePath: string;
    showDiagnostics?: boolean;
}

function selectReportDate(dates: string[], requestedDate: string | null, todayIso: string): string {
    if (requestedDate && dates.includes(requestedDate)) return requestedDate;
    if (dates.includes(todayIso)) return todayIso;
    return dates[dates.length - 1] || "";
}

export default async function PredictionsDashboard({
    searchParams,
    basePath,
    showDiagnostics = false,
}: PredictionsDashboardProps) {
    const dates = listReportDates();
    const requestedDate = normalizeReportDate(searchParams.date);
    const todayIso = todayYmd();
    const selectedDate = selectReportDate(dates, requestedDate, todayIso);
    const report = selectedDate ? loadPredictionReport(selectedDate) : null;

    const t = await getServerT();

    if (!report || dates.length === 0) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center text-gray-500 dark:text-gray-400">
                <p className="text-xl">{t("no_data")}</p>
            </div>
        );
    }

    const allDatesAccuracy = aggregateAccuracy();
    const comparisonSummary = loadComparisonSummary();
    const modelDiagnostics = loadModelDiagnostics();
    const accuracyOverTime = computeAccuracyOverTime();
    const resultTypeBreakdown = computeResultTypeAccuracy(dates);
    const competitionReliability = computeCompetitionReliability();
    const consensusConfidenceBuckets = computeConsensusConfidenceBuckets();

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
            slug: comp?.slug ?? dp,
            priority: getCompetitionDisplayPriority(comp),
            count: matchCountByLeague[dp] ?? 0,
        };
    }).sort((a, b) => a.priority - b.priority);

    const consensusAcc = computeConsensusAccuracy(report.matches);
    const dayAccuracy = getModelAccuracySummary(report);
    const bestModel = Object.entries(dayAccuracy)
        .filter(([key]) => key !== "consensus")
        .filter(([, acc]) => acc.total > 0)
        .sort((a, b) => b[1].accuracy_pct - a[1].accuracy_pct)[0];

    const dayModelRanking = Object.entries(dayAccuracy)
        .filter(([key]) => key !== "consensus")
        .filter(([, acc]) => acc.total > 0)
        .sort((a, b) => b[1].accuracy_pct - a[1].accuracy_pct);

    const modelRanking = Object.entries(allDatesAccuracy)
        .filter(([key]) => key !== "consensus")
        .sort((a, b) => b[1].accuracy_pct - a[1].accuracy_pct);

    return (
        <div className="flex w-full min-w-0 max-w-[1600px] flex-col overflow-x-hidden px-3 py-5 sm:px-6 lg:mx-auto">
            <div className="mb-5 grid grid-cols-1 gap-3 sm:mb-6 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 text-center shadow-sm shadow-slate-900/5 dark:border-gray-800 dark:bg-gray-900/50 dark:shadow-black/10 sm:p-5">
                    <div className="absolute inset-y-0 left-0 w-1 bg-emerald-400" />
                    <div className="mb-1 text-xs uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{t("matches_for_date")}</div>
                    <div className="text-4xl font-bold text-gray-900 dark:text-white">{report.summary.total_matches}</div>
                    <div className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">{selectedDate}</div>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 text-center shadow-sm shadow-slate-900/5 dark:border-gray-800 dark:bg-gray-900/50 dark:shadow-black/10 sm:p-5">
                    <div className="absolute inset-y-0 left-0 w-1 bg-cyan-400" />
                    <div className="mb-2 text-xs uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{t("consensus_accuracy")}</div>
                    <div className="text-4xl font-bold text-emerald-400">{consensusAcc?.accuracy_pct ?? 0}%</div>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 text-center shadow-sm shadow-slate-900/5 dark:border-gray-800 dark:bg-gray-900/50 dark:shadow-black/10 sm:p-5">
                    <div className="absolute inset-y-0 left-0 w-1 bg-emerald-400" />
                    <div className="mb-2 text-xs uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{t("best_model_day")}</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{bestModel?.[0] ?? t("empty_placeholder")}</div>
                    <div className="text-sm text-emerald-400">{bestModel?.[1]?.accuracy_pct ?? 0}%</div>
                </div>
            </div>

            <DatePicker dates={dates} selectedDate={selectedDate} todayIso={todayIso} basePath={basePath} />

            <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0">
                    <PredictionsClient
                        matches={report.matches}
                        leagues={leagues}
                        teamIds={teamIds}
                    />
                </div>

                <div className="min-w-0">
                    <div className="space-y-4 lg:sticky lg:top-4">
                        <div className="rounded-2xl bg-white p-4 dark:bg-gray-900/50 sm:p-5">
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

                        <div className="rounded-2xl bg-white p-4 dark:bg-gray-900/50 sm:p-5">
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

            <DailyHighlights
                matches={report.matches}
                selectedDate={selectedDate}
                teamIds={teamIds}
                t={t}
            />

            <ConsensusReliabilityPanel
                competitionRows={competitionReliability}
                confidenceBuckets={consensusConfidenceBuckets}
                t={t}
            />

            <ModelComparisonCharts
                comparison={comparisonSummary}
                accuracyOverTime={accuracyOverTime}
                resultTypeBreakdown={resultTypeBreakdown}
            />

            <PublicModelInsights
                comparison={comparisonSummary}
                diagnostics={modelDiagnostics}
                accuracyOverTime={accuracyOverTime}
                t={t}
            />

            {showDiagnostics && report.prediction_quality && (
                <PredictionQualityPanel quality={report.prediction_quality} />
            )}

            {showDiagnostics && report.model_release && (
                <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/50 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            {t("model_snapshot")}
                        </h2>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${
                            report.model_release.status === "consistent"
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                                : report.model_release.status === "mixed"
                                    ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                                    : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                        }`}>
                            {report.model_release.status === "consistent"
                                ? t("model_snapshot_consistent")
                                : report.model_release.status === "mixed"
                                    ? t("model_snapshot_mixed")
                                    : t("model_snapshot_legacy")}
                        </span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {Object.entries(report.model_release.variants).map(([variant, state]) => state ? (
                            <div key={variant} className="min-w-0 border-t border-gray-200 pt-3 dark:border-gray-800">
                                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">{variant}</div>
                                <div className="mt-1 truncate font-mono text-[11px] text-gray-500 dark:text-gray-400" title={state.artifact?.artifact_id ?? state.artifact_ids.join(", ")}>
                                    {state.artifact?.artifact_id ?? (state.artifact_ids.join(", ") || t("empty_placeholder"))}
                                </div>
                            </div>
                        ) : null)}
                    </div>
                    {report.model_release.snapshot_id && (
                        <div className="mt-3 truncate font-mono text-[10px] text-gray-400 dark:text-gray-600" title={report.model_release.snapshot_id}>
                            {report.model_release.snapshot_id}
                        </div>
                    )}
                </section>
            )}

            {showDiagnostics && <ModelDiagnosticsPanel diagnostics={modelDiagnostics} t={t} />}

        </div>
    );
}
