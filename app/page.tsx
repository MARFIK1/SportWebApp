import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listReportDates, loadPredictionReport } from "./util/data/predictionService";
import { getCompetitionDisplayGroup, isFeaturedCompetition, resolveCompetitionByDataPath, type Competition } from "./util/league/leagueRegistry";
import { buildMatchLookupMaps, findMatchInCompetitions } from "./util/data/dataService";
import DatePicker from "./components/home/DatePicker";
import HomeLeagueList from "./components/home/HomeLeagueList";
import { getServerT } from "./util/i18n/getLocale";
import { expandYmdDateRange, normalizeReportDate, todayYmd } from "./util/data/dateUtils";
import { getMatchConsensusConfidence, isHighConfidenceMatch } from "./util/predictions/confidence";
import type { PredictionMatch } from "@/types/predictions";
import { formatScorePair, resolveSofascoreMatchResult } from "./util/predictions/matchResult";
import { isWorldCupPlaceholderTeamName, resolveWorldCupReportMatches } from "./util/predictions/worldCupSlotResolver";

export const metadata: Metadata = {
    title: "Home",
    description: "Daily football matches with ML predictions across 44 competitions: results, consensus picks, and model accuracy for each fixture.",
};

interface PageProps {
    searchParams: Promise<{ date?: string }>;
}

const REPORT_DAYS_PAST = 30;
const DAILY_DATE_WINDOW_DAYS = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateUtc(date: string): number {
    return Date.parse(`${date}T12:00:00Z`);
}

function formatDateUtc(time: number): string {
    return new Date(time).toISOString().slice(0, 10);
}

function getDayOffset(date: string, todayIso: string): number | null {
    const dateTime = parseDateUtc(date);
    const todayTime = parseDateUtc(todayIso);
    if (!Number.isFinite(dateTime) || !Number.isFinite(todayTime)) return null;

    return Math.round((dateTime - todayTime) / MS_PER_DAY);
}

function isInReportDateWindow(date: string, todayIso: string): boolean {
    const offset = getDayOffset(date, todayIso);
    return offset !== null && offset >= -REPORT_DAYS_PAST;
}

function addDailyDateWindow(expandedDates: Set<string>, anchor: string) {
    const baseTime = parseDateUtc(anchor);
    if (!Number.isFinite(baseTime)) return;

    for (let offset = -DAILY_DATE_WINDOW_DAYS; offset <= DAILY_DATE_WINDOW_DAYS; offset += 1) {
        expandedDates.add(formatDateUtc(baseTime + offset * MS_PER_DAY));
    }
}

function selectCalendarDate(dates: string[], requestedDate: string | null, todayIso: string): string {
    if (requestedDate && dates.includes(requestedDate)) return requestedDate;
    if (dates.includes(todayIso)) return todayIso;
    return dates[dates.length - 1] || todayIso || "";
}

function getDatePickerDates(dates: string[], todayIso: string): string[] {
    const reportDates = dates.filter((date) => isInReportDateWindow(date, todayIso));
    const expandedDates = new Set(reportDates);
    addDailyDateWindow(expandedDates, todayIso);

    return expandYmdDateRange(Array.from(expandedDates));
}

function hasConfirmedTeams(match: PredictionMatch): boolean {
    return !isWorldCupPlaceholderTeamName(match.home_team) && !isWorldCupPlaceholderTeamName(match.away_team);
}
function enrichPredictionMatchTiming(match: PredictionMatch, competitions: Competition[]): PredictionMatch {
    const eventId = typeof match.event_id === "number" ? match.event_id : null;
    if (eventId === null) return match;

    const sourceMatch = findMatchInCompetitions(eventId, competitions)?.match;
    if (!sourceMatch) return match;

    const state = resolveSofascoreMatchResult(sourceMatch, match);
    if (!state.wentToExtraTime) return match;

    return {
        ...match,
        actual_extra_time_score: state.extraTimeScore ? formatScorePair(state.extraTimeScore) : match.actual_extra_time_score ?? null,
        actual_normal_time_score: state.normalTimeScore ? formatScorePair(state.normalTimeScore) : match.actual_normal_time_score ?? null,
    };
}
export default async function Home({ searchParams }: PageProps) {
    const resolvedSearchParams = await searchParams;
    const dates = listReportDates();
    const requestedDate = normalizeReportDate(resolvedSearchParams.date);
    const todayIso = todayYmd();
    const datePickerDates = getDatePickerDates(dates, todayIso);
    const selectedDate = selectCalendarDate(datePickerDates, requestedDate, todayIso);
    if (requestedDate && requestedDate !== selectedDate) redirect(`/?date=${selectedDate}`);

    const report = selectedDate && dates.includes(selectedDate) ? loadPredictionReport(selectedDate) : null;

    const t = await getServerT();

    if (!selectedDate || datePickerDates.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500 dark:text-gray-400">
                <p className="text-xl">{t("no_data")}</p>
            </div>
        );
    }

    const rawReportMatches = report?.matches ?? [];
    const leagueDataPaths = Array.from(new Set(rawReportMatches.map((m) => `${m.comp_type}/${m.league}`)));
    const competitions = leagueDataPaths.flatMap((dataPath) => {
        const comp = resolveCompetitionByDataPath(dataPath);
        return comp ? [comp] : [];
    });
    const { teamIds, eventIds } = buildMatchLookupMaps(competitions);
    const reportMatches = resolveWorldCupReportMatches(rawReportMatches, competitions, dates, selectedDate)
        .filter(hasConfirmedTeams);
    const matches = reportMatches.map((match) => enrichPredictionMatchTiming(match, competitions));
    const matchesByLeague: Record<string, PredictionMatch[]> = {};
    for (const match of matches) {
        const key = `${match.comp_type}/${match.league}`;
        if (!matchesByLeague[key]) matchesByLeague[key] = [];
        matchesByLeague[key].push(match);
    }

    const leagueSections = Object.entries(matchesByLeague).map(([dataPath, matches]) => {
        const comp = resolveCompetitionByDataPath(dataPath);
        const priority = comp?.priority ?? 999;
        const sectionGroup = getCompetitionDisplayGroup(comp);

        return {
            dataPath,
            leagueName: comp?.name ?? dataPath,
            slug: comp?.slug ?? dataPath,
            priority,
            sectionGroup,
            defaultOpen: isFeaturedCompetition(comp),
            matches,
        };
    }).sort((a, b) => {
        const groupDiff = a.sectionGroup - b.sectionGroup;
        if (groupDiff !== 0) return groupDiff;
        const priorityDiff = a.priority - b.priority;
        if (priorityDiff !== 0) return priorityDiff;
        return a.leagueName.localeCompare(b.leagueName);
    });

    const totalMatches = matches.length;
    const finishedMatches = matches.filter((match) => match.status === "finished").length;
    const pendingMatches = Math.max(0, totalMatches - finishedMatches);
    const predictedMatches = matches.filter((match) => getMatchConsensusConfidence(match) > 0);
    const averageConfidence = predictedMatches.length
        ? predictedMatches.reduce((sum, match) => sum + getMatchConsensusConfidence(match), 0) / predictedMatches.length
        : 0;
    const highConfidenceCount = predictedMatches.filter(isHighConfidenceMatch).length;
    const matchSummaryText = totalMatches === 0
        ? t("no_matches_for_date_title")
        : finishedMatches === totalMatches
            ? t("all_completed")
            : `${finishedMatches} ${t("finished")}, ${pendingMatches} ${t("pending")}`;

    return (
        <div className="mx-auto flex w-full max-w-[1600px] flex-col px-3 py-5 sm:px-6 lg:px-8">
            <div className="relative mb-4 overflow-hidden rounded-[2rem] border border-emerald-500/10 bg-white/90 p-4 shadow-xl shadow-slate-900/5 dark:border-emerald-400/10 dark:bg-[#0b1220] dark:shadow-black/20 sm:mb-6 sm:p-8">
                <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-28 left-10 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

                <div className="relative grid gap-4 sm:gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.32em] text-emerald-500 dark:text-emerald-400">
                            {selectedDate}
                        </p>
                        <h1 className="mt-1 max-w-3xl text-2xl font-black tracking-tight text-gray-950 dark:text-white sm:mt-3 sm:text-5xl">
                            {totalMatches} {t("matches_analyzed")}
                        </h1>
                        <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500 dark:text-gray-400 sm:mt-3 sm:text-base sm:leading-6">
                            {matchSummaryText}
                        </p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        <div className="min-w-0 rounded-2xl border border-gray-200 bg-white/80 p-2.5 dark:border-white/10 dark:bg-white/[0.04] sm:p-4">
                            <p className="break-words text-[9px] font-semibold uppercase leading-tight tracking-[0.08em] text-gray-400 dark:text-gray-500 sm:text-[11px] sm:tracking-[0.2em]">
                                {t("finished")}
                            </p>
                            <p className="mt-1 text-xl font-black text-gray-950 dark:text-white sm:mt-2 sm:text-3xl">{finishedMatches}</p>
                        </div>
                        <div className="min-w-0 rounded-2xl border border-gray-200 bg-white/80 p-2.5 dark:border-white/10 dark:bg-white/[0.04] sm:p-4">
                            <p className="break-words text-[9px] font-semibold uppercase leading-tight tracking-[0.08em] text-gray-400 dark:text-gray-500 sm:text-[11px] sm:tracking-[0.2em]">
                                {t("pending")}
                            </p>
                            <p className="mt-1 text-xl font-black text-gray-950 dark:text-white sm:mt-2 sm:text-3xl">{pendingMatches}</p>
                        </div>
                        <div className="min-w-0 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 sm:p-4">
                            <p className="break-words text-[9px] font-semibold uppercase leading-tight tracking-[0.08em] text-emerald-600 dark:text-emerald-300 sm:text-[11px] sm:tracking-[0.2em]">
                                {t("confidence")}
                            </p>
                            <p className="mt-1 text-xl font-black text-emerald-500 sm:mt-2 sm:text-3xl">{averageConfidence.toFixed(0)}%</p>
                            <p className="mt-1 hidden text-xs font-medium text-gray-500 dark:text-gray-300 sm:block">
                                {highConfidenceCount} {t("high_confidence")}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <DatePicker dates={datePickerDates} selectedDate={selectedDate} todayIso={todayIso} />

            <HomeLeagueList
                sections={leagueSections}
                teamIds={teamIds}
                eventIds={eventIds}
                selectedDate={selectedDate}
                hasReport={totalMatches > 0}
            />
        </div>
    );
}
