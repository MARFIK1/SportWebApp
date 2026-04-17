import type { Metadata } from "next";
import { listReportDates, loadPredictionReport } from "./util/data/predictionService";
import { resolveCompetitionByDataPath } from "./util/league/leagueRegistry";
import { loadAllSeasons } from "./util/data/dataService";
import DatePicker from "./components/home/DatePicker";
import LeagueSection from "./components/home/LeagueSection";
import { getServerT } from "./util/i18n/getLocale";

export const metadata: Metadata = {
    title: "Home",
    description: "Daily football matches with ML predictions across 44 competitions: live scores, consensus picks, and model accuracy for each fixture.",
};

interface PageProps {
    searchParams: { date?: string };
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

export default async function Home({ searchParams }: PageProps) {
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

    return (
        <div className="flex flex-col w-full max-w-[1600px] mx-auto px-6 py-6">
            <div className="text-center mb-6">
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
                    {totalMatches} {t("matches_analyzed")}
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                    {finishedMatches === totalMatches
                        ? t("all_completed")
                        : `${finishedMatches} ${t("finished")}, ${totalMatches - finishedMatches} ${t("pending")}`}
                </p>
            </div>

            <DatePicker dates={dates} selectedDate={selectedDate} todayIso={new Date().toISOString().slice(0, 10)} />

            <div className="mt-6">
                {leagueSections.map(({ dataPath, leagueName, slug, matches }) => (
                    <LeagueSection
                        key={dataPath}
                        league={dataPath}
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