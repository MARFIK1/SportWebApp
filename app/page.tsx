import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listReportDates, loadPredictionReport } from "./util/data/predictionService";
import { resolveCompetitionByDataPath } from "./util/league/leagueRegistry";
import { buildMatchLookupMaps } from "./util/data/dataService";
import DatePicker from "./components/home/DatePicker";
import HomeLeagueList from "./components/home/HomeLeagueList";
import { getServerT } from "./util/i18n/getLocale";
import { normalizeReportDate, todayYmd } from "./util/data/dateUtils";
import type { ConsensusPrediction, PredictionMatch } from "@/types/predictions";

export const metadata: Metadata = {
    title: "Home",
    description: "Daily football matches with ML predictions across 44 competitions: results, consensus picks, and model accuracy for each fixture.",
};

interface PageProps {
    searchParams: Promise<{ date?: string }>;
}

function getConsensusConfidence(match: PredictionMatch): number {
    const consensus = match.predictions.consensus as ConsensusPrediction;
    const prediction = consensus?.prediction;
    return prediction ? consensus.avg_probabilities?.[prediction] ?? 0 : 0;
}

const REPORT_DAYS_PAST = 30;
const REPORT_DAYS_FUTURE = 1;
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
    return offset !== null && offset >= -REPORT_DAYS_PAST && offset <= REPORT_DAYS_FUTURE;
}

function addDailyDateWindow(expandedDates: Set<string>, anchor: string) {
    const baseTime = parseDateUtc(anchor);
    if (!Number.isFinite(baseTime)) return;

    for (let offset = -DAILY_DATE_WINDOW_DAYS; offset <= DAILY_DATE_WINDOW_DAYS; offset += 1) {
        expandedDates.add(formatDateUtc(baseTime + offset * MS_PER_DAY));
    }
}

function addDateRange(expandedDates: Set<string>, startDate: string, endDate: string, todayIso: string) {
    const startTime = parseDateUtc(startDate);
    const endTime = parseDateUtc(endDate);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return;

    for (let time = startTime; time <= endTime; time += MS_PER_DAY) {
        const date = formatDateUtc(time);
        if (isInReportDateWindow(date, todayIso)) {
            expandedDates.add(date);
        }
    }
}

function selectReportDate(dates: string[], requestedDate: string | null, todayIso: string): string {
    if (requestedDate && isInReportDateWindow(requestedDate, todayIso)) {
        return requestedDate;
    }

    return todayIso || dates[dates.length - 1] || "";
}

function getDatePickerDates(dates: string[], todayIso: string): string[] {
    const reportDates = dates.filter((date) => isInReportDateWindow(date, todayIso));
    const expandedDates = new Set(reportDates);
    if (reportDates.length > 0) {
        addDateRange(expandedDates, reportDates[0], reportDates[reportDates.length - 1], todayIso);
    }
    addDailyDateWindow(expandedDates, todayIso);

    return Array.from(expandedDates).sort((a, b) => a.localeCompare(b));
}

export default async function Home({ searchParams }: PageProps) {
    const resolvedSearchParams = await searchParams;
    const dates = listReportDates();
    const requestedDate = normalizeReportDate(resolvedSearchParams.date);
    const todayIso = todayYmd();
    const selectedDate = selectReportDate(dates, requestedDate, todayIso);
    if (requestedDate && requestedDate !== selectedDate) redirect(`/?date=${selectedDate}`);

    const report = selectedDate && dates.includes(selectedDate) ? loadPredictionReport(selectedDate) : null;
    const datePickerDates = getDatePickerDates(dates, todayIso);

    const t = await getServerT();

    if (!selectedDate || datePickerDates.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500 dark:text-gray-400">
                <p className="text-xl">{t("no_data")}</p>
            </div>
        );
    }

    const matches = report?.matches ?? [];
    const leagueDataPaths = Array.from(new Set(matches.map((m) => `${m.comp_type}/${m.league}`)));
    const competitions = leagueDataPaths.flatMap((dataPath) => {
        const comp = resolveCompetitionByDataPath(dataPath);
        return comp ? [comp] : [];
    });
    const { teamIds, eventIds } = buildMatchLookupMaps(competitions);

    const matchesByLeague: Record<string, PredictionMatch[]> = {};
    for (const match of matches) {
        const key = `${match.comp_type}/${match.league}`;
        if (!matchesByLeague[key]) matchesByLeague[key] = [];
        matchesByLeague[key].push(match);
    }

    const leagueSections = Object.entries(matchesByLeague).map(([dataPath, matches]) => {
        const comp = resolveCompetitionByDataPath(dataPath);
        const priority = comp?.priority ?? 999;
        const sectionGroup = comp?.compType === "european"
            ? 0
            : comp?.compType === "league" && priority <= 5
                ? 1
                : 2;

        return {
            dataPath,
            leagueName: comp?.name ?? dataPath,
            slug: comp?.slug ?? dataPath,
            priority,
            sectionGroup,
            defaultOpen: sectionGroup <= 1,
            matches,
        };
    }).sort((a, b) => {
        const groupDiff = a.sectionGroup - b.sectionGroup;
        if (groupDiff !== 0) return groupDiff;
        const priorityDiff = a.priority - b.priority;
        if (priorityDiff !== 0) return priorityDiff;
        return a.leagueName.localeCompare(b.leagueName);
    });

    const totalMatches = report?.summary.total_matches ?? 0;
    const finishedMatches = report?.summary.finished_matches ?? 0;
    const pendingMatches = totalMatches - finishedMatches;
    const predictedMatches = matches.filter((match) => getConsensusConfidence(match) > 0);
    const averageConfidence = predictedMatches.length
        ? predictedMatches.reduce((sum, match) => sum + getConsensusConfidence(match), 0) / predictedMatches.length
        : 0;
    const highConfidenceCount = predictedMatches.filter((match) => getConsensusConfidence(match) >= 60).length;
    const matchSummaryText = totalMatches === 0
        ? t("no_matches_for_date_title")
        : finishedMatches === totalMatches
            ? t("all_completed")
            : `${finishedMatches} ${t("finished")}, ${pendingMatches} ${t("pending")}`;

    return (
        <div className="mx-auto flex w-full max-w-[1600px] flex-col px-3 py-5 sm:px-6 lg:px-8">
            <div className="relative mb-6 overflow-hidden rounded-[2rem] border border-emerald-500/10 bg-white/90 p-5 shadow-xl shadow-slate-900/5 dark:border-emerald-400/10 dark:bg-[#0b1220] dark:shadow-black/20 sm:p-8">
                <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-28 left-10 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

                <div className="relative grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.32em] text-emerald-500 dark:text-emerald-400">
                            {selectedDate}
                        </p>
                        <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight text-gray-950 dark:text-white sm:text-5xl">
                            {totalMatches} {t("matches_analyzed")}
                        </h1>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400 sm:text-base">
                            {matchSummaryText}
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

            <DatePicker dates={datePickerDates} selectedDate={selectedDate} todayIso={todayIso} />

            <HomeLeagueList
                sections={leagueSections}
                teamIds={teamIds}
                eventIds={eventIds}
                selectedDate={selectedDate}
                hasReport={Boolean(report)}
            />
        </div>
    );
}