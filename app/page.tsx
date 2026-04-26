import type { Metadata } from "next";
import { listReportDates, loadPredictionReport } from "./util/data/predictionService";
import { resolveCompetitionByDataPath } from "./util/league/leagueRegistry";
import { loadAllSeasons } from "./util/data/dataService";
import DatePicker from "./components/home/DatePicker";
import LeagueSection from "./components/home/LeagueSection";
import { getServerT } from "./util/i18n/getLocale";
import type { ConsensusPrediction, PredictionMatch } from "@/types/predictions";

export const metadata: Metadata = {
    title: "Home",
    description: "Daily football matches with ML predictions across 44 competitions: results, consensus picks, and model accuracy for each fixture.",
};

interface PageProps {
    searchParams: Promise<{ date?: string }>;
}

function buildLookups(leagueDataPaths: string[]): { teamIds: Record<string, number>; eventIds: Record<string, number> } {
    const teamIds: Record<string, number> = {};
    const eventIds: Record<string, number> = {};
    for (const dataPath of leagueDataPaths) {
        const comp = resolveCompetitionByDataPath(dataPath);
        if (!comp) continue;
        const matches = loadAllSeasons(comp);
        for (const m of matches) {
            if (!(m.home_team in teamIds)) teamIds[m.home_team] = m.home_team_id;
            if (!(m.away_team in teamIds)) teamIds[m.away_team] = m.away_team_id;
            const key = `${m.home_team}_vs_${m.away_team}_${m.date.slice(0, 10)}`;
            eventIds[key] = m.event_id;
        }
    }
    return { teamIds, eventIds };
}

function getConsensusConfidence(match: PredictionMatch): number {
    const consensus = match.predictions.consensus as ConsensusPrediction;
    const prediction = consensus?.prediction;
    return prediction ? consensus.avg_probabilities?.[prediction] ?? 0 : 0;
}

export default async function Home({ searchParams }: PageProps) {
    const resolvedSearchParams = await searchParams;
    const dates = listReportDates();
    const selectedDate = resolvedSearchParams.date || dates[dates.length - 1] || "";
    const report = selectedDate ? loadPredictionReport(selectedDate) : null;

    const t = await getServerT();

    if (!report || dates.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500 dark:text-gray-400">
                <p className="text-xl">{t("no_data")}</p>
            </div>
        );
    }

    const leagueDataPaths = Array.from(new Set(report.matches.map((m) => `${m.comp_type}/${m.league}`)));
    const { teamIds, eventIds } = buildLookups(leagueDataPaths);

    const matchesByLeague: Record<string, typeof report.matches> = {};
    for (const match of report.matches) {
        const key = `${match.comp_type}/${match.league}`;
        if (!matchesByLeague[key]) matchesByLeague[key] = [];
        matchesByLeague[key].push(match);
    }

    const leagueSections = Object.entries(matchesByLeague).map(([dataPath, matches]) => {
        const comp = resolveCompetitionByDataPath(dataPath);
        return {
            dataPath,
            leagueName: comp?.name ?? dataPath,
            slug: comp?.slug ?? dataPath,
            priority: comp?.priority ?? 999,
            matches,
        };
    }).sort((a, b) => a.priority - b.priority);

    const totalMatches = report.summary.total_matches;
    const finishedMatches = report.summary.finished_matches;
    const pendingMatches = totalMatches - finishedMatches;
    const predictedMatches = report.matches.filter((match) => getConsensusConfidence(match) > 0);
    const averageConfidence = predictedMatches.length
        ? predictedMatches.reduce((sum, match) => sum + getConsensusConfidence(match), 0) / predictedMatches.length
        : 0;
    const highConfidenceCount = predictedMatches.filter((match) => getConsensusConfidence(match) >= 60).length;

    return (
        <div className="flex flex-col w-full max-w-[1600px] mx-auto px-4 py-5 sm:px-6 lg:px-8">
            <div className="relative mb-6 overflow-hidden rounded-[2rem] border border-emerald-500/10 bg-white/90 p-6 shadow-xl shadow-slate-900/5 dark:border-emerald-400/10 dark:bg-[#0b1220] dark:shadow-black/20 sm:p-8">
                <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-28 left-10 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

                <div className="relative grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.32em] text-emerald-500 dark:text-emerald-400">
                            {selectedDate}
                        </p>
                        <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight text-gray-950 dark:text-white sm:text-5xl">
                            {totalMatches} {t("matches_analyzed")}
                        </h1>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400 sm:text-base">
                            {finishedMatches === totalMatches
                                ? t("all_completed")
                                : `${finishedMatches} ${t("finished")}, ${pendingMatches} ${t("pending")}`}
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-gray-200 bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                                {t("finished")}
                            </p>
                            <p className="mt-2 text-3xl font-black text-gray-950 dark:text-white">{finishedMatches}</p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                                {t("pending")}
                            </p>
                            <p className="mt-2 text-3xl font-black text-gray-950 dark:text-white">{pendingMatches}</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">
                                {t("confidence")}
                            </p>
                            <p className="mt-2 text-3xl font-black text-emerald-500">{averageConfidence.toFixed(0)}%</p>
                            <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-300">
                                {highConfidenceCount} {t("high_confidence")}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <DatePicker dates={dates} selectedDate={selectedDate} todayIso={new Date().toISOString().slice(0, 10)} />

            <div className="mt-6">
                {leagueSections.map(({ dataPath, leagueName, slug, matches }) => (
                    <LeagueSection
                        key={dataPath}
                        leagueName={leagueName}
                        slug={slug}
                        matches={matches}
                        teamIds={teamIds}
                        eventIds={eventIds}
                        selectedDate={selectedDate}
                    />
                ))}
            </div>
        </div>
    );
}