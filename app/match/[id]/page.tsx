import Link from "next/link";
import type { Metadata } from "next";
import { getAllCompetitions, resolveCompetitionByDataPath, type Competition } from "@/app/util/league/leagueRegistry";
import { buildMatchLookupMaps, computeStandings, findMatchInCompetitions, findMatchInTeamHistory, listSeasonFiles, loadAllSeasons, loadSeasonMatches, loadTeamHistory, loadUpcomingMatches, resolveLeagueTableContext } from "@/app/util/data/dataService";
import { getMatchPrediction, loadPredictionReport, loadAnalysisReport } from "@/app/util/data/predictionService";
import type { SofascoreMatch } from "@/types/sofascore";
import type { PredictionMatch, PredictionReport } from "@/types/predictions";
import CompactLeagueTable from "./CompactLeagueTable";
import MatchPredictions from "./MatchPredictions";
import TeamLogo from "@/app/components/common/TeamLogo";
import MatchStatistics from "./MatchStatistics";
import { getServerT } from "@/app/util/i18n/getLocale";
import { normalizeReportDate } from "@/app/util/data/dateUtils";
import MatchPredictionVariantProvider from "./MatchPredictionVariantProvider";
import MatchPredictionSidebar from "./MatchPredictionSidebar";
import MatchHistoryTabs, { type MatchHistoryItem } from "./MatchHistoryTabs";
import PostMatchInsights from "./PostMatchInsights";
import PredictionExplanation from "./PredictionExplanation";
import PredictionTriangle from "./PredictionTriangle";
import TeamRadar from "./TeamRadar";
import TournamentContext from "./TournamentContext";
import { computeKnockoutSlots } from "./WorldCupBracket";
import { findPredictionMatch, repairMatchAnalysis, resolveMatchDisplayState } from "./matchData";
import { parseScorePair, resolveSofascoreMatchResult } from "@/app/util/predictions/matchResult";

interface StatDefinition {
    label: string;
    homeKeys: string[];
    awayKeys: string[];
}

const STAT_MAP: StatDefinition[] = [
    { label: "Ball Possession", homeKeys: ["home_ballpossession"], awayKeys: ["away_ballpossession"] },
    { label: "Expected Goals (xG)", homeKeys: ["home_expectedgoals", "home_xg"], awayKeys: ["away_expectedgoals", "away_xg"] },
    { label: "Total Shots", homeKeys: ["home_totalshotsongoal"], awayKeys: ["away_totalshotsongoal"] },
    { label: "Shots on Goal", homeKeys: ["home_shotsongoal"], awayKeys: ["away_shotsongoal"] },
    { label: "Shots off Goal", homeKeys: ["home_shotsoffgoal"], awayKeys: ["away_shotsoffgoal"] },
    { label: "Blocked Shots", homeKeys: ["home_blockedscoringattempt"], awayKeys: ["away_blockedscoringattempt"] },
    { label: "Corner Kicks", homeKeys: ["home_cornerkicks"], awayKeys: ["away_cornerkicks"] },
    { label: "Fouls", homeKeys: ["home_fouls"], awayKeys: ["away_fouls"] },
    { label: "Yellow Cards", homeKeys: ["home_yellowcards"], awayKeys: ["away_yellowcards"] },
    { label: "Goalkeeper Saves", homeKeys: ["home_goalkeepersaves"], awayKeys: ["away_goalkeepersaves"] },
    { label: "Total Passes", homeKeys: ["home_passes"], awayKeys: ["away_passes"] },
    { label: "Accurate Passes", homeKeys: ["home_accuratepasses"], awayKeys: ["away_accuratepasses"] },
    { label: "Tackles", homeKeys: ["home_totaltackle"], awayKeys: ["away_totaltackle"] },
];

function readStatValue(raw: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
        const value = raw[key];
        if (typeof value === "number") return value;
    }
    return null;
}

function buildMatchStats(m: SofascoreMatch): { type: string; homeValue: number; awayValue: number }[] {
    const raw = m as unknown as Record<string, unknown>;
    const stats: { type: string; homeValue: number; awayValue: number }[] = [];
    for (const { label, homeKeys, awayKeys } of STAT_MAP) {
        const hVal = readStatValue(raw, homeKeys);
        const aVal = readStatValue(raw, awayKeys);
        if (hVal !== null || aVal !== null) {
            stats.push({ type: label, homeValue: hVal ?? 0, awayValue: aVal ?? 0 });
        }
    }
    return stats;
}

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ date?: string }>;
}

function reportMatchDate(reportDate: string, startTime: string | null | undefined): string {
    if (startTime?.includes("T")) return startTime;
    if (startTime && /^\d{1,2}:\d{2}$/.test(startTime)) {
        return `${reportDate}T${startTime.padStart(5, "0")}:00+00:00`;
    }
    return reportDate;
}

function reportOnlyMatch(
    eventId: number,
    report: PredictionReport | null,
    reportDate: string | null,
): { match: SofascoreMatch; competition: Competition } | null {
    if (!report || !reportDate) return null;

    const predMatch = getMatchPrediction(report, eventId);
    if (!predMatch) return null;

    const competition = resolveCompetitionByDataPath(`${predMatch.comp_type}/${predMatch.league}`);
    if (!competition) return null;

    const teamIds = buildMatchLookupMaps([competition]).teamIds;
    const score = parseScorePair(predMatch.actual_score);
    const date = reportMatchDate(reportDate, predMatch.start_time);

    return {
        competition,
        match: {
            event_id: eventId,
            date,
            round: 0,
            home_team_id: teamIds[predMatch.home_team] ?? 0,
            home_team: predMatch.home_team,
            away_team_id: teamIds[predMatch.away_team] ?? 0,
            away_team: predMatch.away_team,
            home_score: score?.home ?? null,
            away_score: score?.away ?? null,
            home_score_ht: null,
            away_score_ht: null,
            status: predMatch.status,
            season: date.slice(0, 4),
        } as SofascoreMatch,
    };
}

function toHistoryItem(match: SofascoreMatch): MatchHistoryItem {
    const result = resolveSofascoreMatchResult(match, null);
    return {
        eventId: match.event_id,
        date: match.date,
        homeTeamId: match.home_team_id,
        homeTeam: match.home_team,
        awayTeamId: match.away_team_id,
        awayTeam: match.away_team,
        homeScore: result.regularScore?.home ?? match.home_score,
        awayScore: result.regularScore?.away ?? match.away_score,
    };
}

function resolveSeasonMatches(match: SofascoreMatch, matches: SofascoreMatch[]): SofascoreMatch[] {
    const explicitSeason = typeof match.season === "string" ? match.season : "";
    if (explicitSeason) {
        const seasonMatches = matches.filter((m) => m.season === explicitSeason);
        if (seasonMatches.length > 0) return seasonMatches;
    }

    const targetTime = Date.parse(match.date);
    const seasons = new Map<string, SofascoreMatch[]>();
    for (const item of matches) {
        if (typeof item.season !== "string" || item.season.length === 0) continue;
        const seasonMatches = seasons.get(item.season) ?? [];
        seasonMatches.push(item);
        seasons.set(item.season, seasonMatches);
    }

    let bestSeason: SofascoreMatch[] = [];
    let bestScore = Number.POSITIVE_INFINITY;

    for (const seasonMatches of seasons.values()) {
        const times = seasonMatches
            .map((item) => Date.parse(item.date))
            .filter((time) => Number.isFinite(time))
            .sort((a, b) => a - b);
        if (times.length === 0) continue;

        const minTime = times[0];
        const maxTime = times[times.length - 1];
        const distance = targetTime < minTime
            ? minTime - targetTime
            : targetTime > maxTime
                ? targetTime - maxTime
                : 0;

        if (distance < bestScore || (distance === bestScore && maxTime > Date.parse(bestSeason[0]?.date ?? "1970-01-01"))) {
            bestScore = distance;
            bestSeason = seasonMatches;
        }
    }

    return bestSeason.length > 0 ? bestSeason : matches;
}

function resolveWorldCupCompetition(competition: Competition, competitions: Competition[]): Competition | null {
    if (competition.slug === "fifa-world-cup") return competition;
    const competitionName = competition.name.toLowerCase();
    if (!competitionName.includes("world cup")) return null;
    return competitions.find((comp) => comp.slug === "fifa-world-cup") ?? null;
}

function addContextMatches(matchesByEventId: Map<number, SofascoreMatch>, matches: SofascoreMatch[]) {
    for (const match of matches) {
        matchesByEventId.set(match.event_id, match);
    }
}

function upcomingToContextMatch(match: ReturnType<typeof loadUpcomingMatches>[number]): SofascoreMatch {
    return {
        ...match,
        season: match.date.slice(0, 4),
    } as unknown as SofascoreMatch;
}

function loadContextMatches(competition: Competition, seasonHint?: string | null): SofascoreMatch[] {
    const matchesByEventId = new Map<number, SofascoreMatch>();

    if (competition.slug === "fifa-world-cup") {
        const seasonYear = seasonHint && /^\d{4}$/.test(seasonHint) ? seasonHint : null;
        const seasonFiles = listSeasonFiles(competition);
        const exactSeasonFiles = seasonYear
            ? seasonFiles.filter((file) => file === `${seasonYear}.json` || file === `world_cup_${seasonYear}.json`)
            : [];
        const filesToLoad = exactSeasonFiles.length > 0 ? exactSeasonFiles : seasonFiles;

        for (const seasonFile of filesToLoad) {
            addContextMatches(matchesByEventId, loadSeasonMatches(competition, seasonFile));
        }

        for (const upcoming of loadUpcomingMatches(competition)) {
            if (seasonYear && !String(upcoming.date ?? "").startsWith(seasonYear)) continue;
            matchesByEventId.set(upcoming.event_id, upcomingToContextMatch(upcoming));
        }

        return Array.from(matchesByEventId.values());
    }

    for (const match of loadAllSeasons(competition)) {
        matchesByEventId.set(match.event_id, match);
    }

    return Array.from(matchesByEventId.values());
}


function hasSameTeamPair(match: SofascoreMatch, homeTeamId: number, awayTeamId: number): boolean {
    return (
        (match.home_team_id === homeTeamId && match.away_team_id === awayTeamId) ||
        (match.home_team_id === awayTeamId && match.away_team_id === homeTeamId)
    );
}

function resolvePlayoffContextMatches(
    match: SofascoreMatch,
    seasonMatches: SofascoreMatch[],
    regularTeamIds: Set<number> | undefined
): SofascoreMatch[] {
    if (!regularTeamIds) return [];

    const currentMatchUsesExternalTeam =
        !regularTeamIds.has(match.home_team_id) || !regularTeamIds.has(match.away_team_id);
    if (!currentMatchUsesExternalTeam) return [];

    const contextMatches = seasonMatches
        .filter((item) => hasSameTeamPair(item, match.home_team_id, match.away_team_id))
        .sort((a, b) => a.date.localeCompare(b.date));

    if (!contextMatches.some((item) => item.event_id === match.event_id)) {
        contextMatches.push(match);
        contextMatches.sort((a, b) => a.date.localeCompare(b.date));
    }

    return Array.from(
        contextMatches.reduce((map, item) => {
            map.set(item.event_id, item);
            return map;
        }, new Map<number, SofascoreMatch>()).values()
    );
}


const WORLD_CUP_SLOT_TEAM_RE = /^(?:[12][A-Z]|[GH][12]|[WL]\d+|3[A-Z](?:\/3[A-Z])+)$/;

function isWorldCupSlotTeam(teamName: string): boolean {
    return WORLD_CUP_SLOT_TEAM_RE.test(teamName.trim());
}

function validTeamId(teamId: number): boolean {
    return Number.isFinite(teamId) && teamId > 0;
}

function addDaysYmd(date: string, offset: number): string | null {
    const base = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(base.getTime())) return null;
    base.setUTCDate(base.getUTCDate() + offset);
    return base.toISOString().slice(0, 10);
}

function collectNearbyPredictionMatches(date: string, radiusDays = 21): PredictionMatch[] {
    const matchesByEventId = new Map<number, PredictionMatch>();

    for (let offset = -radiusDays; offset <= radiusDays; offset += 1) {
        const reportDate = addDaysYmd(date, offset);
        if (!reportDate) continue;

        const report = loadPredictionReport(reportDate);
        for (const match of report?.matches ?? []) {
            if (typeof match.event_id === "number") {
                matchesByEventId.set(match.event_id, match);
            }
        }
    }

    return Array.from(matchesByEventId.values());
}

function buildDisplayTeamIds(
    competition: Competition,
    competitionMatches: SofascoreMatch[],
    predictionMatches: PredictionMatch[],
): Record<string, number> {
    const ids = { ...buildMatchLookupMaps([competition]).teamIds };

    for (const match of competitionMatches) {
        if (validTeamId(match.home_team_id) && !isWorldCupSlotTeam(match.home_team)) {
            ids[match.home_team] = ids[match.home_team] ?? match.home_team_id;
        }
        if (validTeamId(match.away_team_id) && !isWorldCupSlotTeam(match.away_team)) {
            ids[match.away_team] = ids[match.away_team] ?? match.away_team_id;
        }
    }

    for (const pred of predictionMatches) {
        const homeId = ids[pred.home_team];
        const awayId = ids[pred.away_team];
        if (validTeamId(homeId)) ids[pred.home_team] = homeId;
        if (validTeamId(awayId)) ids[pred.away_team] = awayId;
    }

    return ids;
}

function resolveReportBackedMatchTeams(
    match: SofascoreMatch,
    predMatch: PredictionMatch | null | undefined,
    teamIds: Record<string, number>,
): SofascoreMatch {
    if (!predMatch) return match;

    const replaceHome = isWorldCupSlotTeam(match.home_team) && !isWorldCupSlotTeam(predMatch.home_team);
    const replaceAway = isWorldCupSlotTeam(match.away_team) && !isWorldCupSlotTeam(predMatch.away_team);
    if (!replaceHome && !replaceAway) return match;

    const homeTeam = replaceHome ? predMatch.home_team : match.home_team;
    const awayTeam = replaceAway ? predMatch.away_team : match.away_team;

    return {
        ...match,
        home_team: homeTeam,
        away_team: awayTeam,
        home_team_id: replaceHome ? (teamIds[homeTeam] ?? match.home_team_id) : match.home_team_id,
        away_team_id: replaceAway ? (teamIds[awayTeam] ?? match.away_team_id) : match.away_team_id,
    };
}

function resolveReportBackedSeasonMatches(
    matches: SofascoreMatch[],
    predictionMatches: PredictionMatch[],
    teamIds: Record<string, number>,
): SofascoreMatch[] {
    if (predictionMatches.length === 0) return matches;

    const predictionsByEventId = new Map<number, PredictionMatch>();
    for (const pred of predictionMatches) {
        if (typeof pred.event_id === "number") predictionsByEventId.set(pred.event_id, pred);
    }

    return matches.map((match) => resolveReportBackedMatchTeams(match, predictionsByEventId.get(match.event_id), teamIds));
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;
    const eventId = parseInt(resolvedParams.id, 10);
    if (!Number.isFinite(eventId)) return { title: "Match" };
    const competitions = getAllCompetitions();
    const result = findMatchInCompetitions(eventId, competitions) ?? findMatchInTeamHistory(eventId);
    if (!result) return { title: "Match" };

    const requestedDate = normalizeReportDate(resolvedSearchParams.date);
    const reportDate = requestedDate || result.match.date.slice(0, 10);
    const predReport = reportDate ? loadPredictionReport(reportDate) : null;
    const worldCupCompetition = resolveWorldCupCompetition(result.competition, competitions);
    const contextCompetition = worldCupCompetition ?? result.competition;
    const competitionMatches = loadContextMatches(contextCompetition, reportDate?.slice(0, 4) ?? result.match.date.slice(0, 4));
    const selectedPredictionMatches = predReport?.matches ?? [];
    const nearbyPredictionMatches = worldCupCompetition && reportDate
        ? collectNearbyPredictionMatches(reportDate)
        : selectedPredictionMatches;
    const predictionMatches = nearbyPredictionMatches.length > 0 ? nearbyPredictionMatches : selectedPredictionMatches;
    const predMatch = (predReport ? findPredictionMatch(predReport, eventId, result.match.home_team, result.match.away_team) : null) ??
        predictionMatches.find((item) => String(item.event_id) === String(eventId)) ??
        null;
    const teamIds = buildDisplayTeamIds(contextCompetition, competitionMatches, predictionMatches);
    const match = resolveReportBackedMatchTeams(result.match, predMatch, teamIds);

    const matchResult = resolveSofascoreMatchResult(match, null);
    const score = matchResult.regularScore ? ` ${matchResult.regularScore.home}-${matchResult.regularScore.away}` : "";
    return {
        title: `${match.home_team} vs ${match.away_team}${score}`,
        description: `${match.home_team} vs ${match.away_team} - match statistics, predictions, and head-to-head`,
    };
}

export default async function Match({ params, searchParams }: PageProps) {
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;
    const eventId = parseInt(resolvedParams.id, 10);
    const competitions = getAllCompetitions();
    const requestedDate = normalizeReportDate(resolvedSearchParams.date);
    const indexedResult = Number.isFinite(eventId) ? findMatchInCompetitions(eventId, competitions) : null;
    const teamHistoryResult = !indexedResult && Number.isFinite(eventId) ? findMatchInTeamHistory(eventId) : null;
    const initialDate = requestedDate || indexedResult?.match.date.slice(0, 10) || teamHistoryResult?.match.date.slice(0, 10) || null;
    const predReport = initialDate ? loadPredictionReport(initialDate) : null;
    const result = indexedResult ?? teamHistoryResult ?? (Number.isFinite(eventId) ? reportOnlyMatch(eventId, predReport, initialDate) : null);

    const t = await getServerT();

    if (!result) {
        return (
            <div className="flex justify-center items-center min-h-[60vh] text-gray-500 dark:text-gray-400">
                <p className="text-xl">{t("match_not_found")}</p>
            </div>
        );
    }

    const { match: sourceMatch, competition } = result;
    const date = initialDate || sourceMatch.date.slice(0, 10);
    const worldCupCompetition = resolveWorldCupCompetition(competition, competitions);
    const contextCompetition = worldCupCompetition ?? competition;
    const competitionMatches = loadContextMatches(contextCompetition, date.slice(0, 4));
    const selectedPredictionMatches = predReport?.matches ?? [];
    const isWorldCupMatch = Boolean(worldCupCompetition);
    const nearbyPredictionMatches = isWorldCupMatch ? collectNearbyPredictionMatches(date) : selectedPredictionMatches;
    const predictionMatches = nearbyPredictionMatches.length > 0 ? nearbyPredictionMatches : selectedPredictionMatches;
    const displayTeamIds = buildDisplayTeamIds(contextCompetition, competitionMatches, predictionMatches);
    const predMatch = (predReport ? findPredictionMatch(predReport, eventId, sourceMatch.home_team, sourceMatch.away_team) : null) ??
        predictionMatches.find((item) => String(item.event_id) === String(eventId)) ??
        null;
    const match = resolveReportBackedMatchTeams(sourceMatch, predMatch, displayTeamIds);
    const resolvedCompetitionMatches = isWorldCupMatch
        ? resolveReportBackedSeasonMatches(competitionMatches, predictionMatches, displayTeamIds)
        : competitionMatches;
    const sameSeasonMatches = resolveSeasonMatches(match, resolvedCompetitionMatches);
    const knockoutSlotByEventId = isWorldCupMatch
        ? computeKnockoutSlots(resolveSeasonMatches(match, competitionMatches))
        : new Map<number, number>();
    const leagueTableContext = competition.compType === "league" ? resolveLeagueTableContext(sameSeasonMatches) : null;
    const leagueStandings = leagueTableContext
        ? computeStandings(leagueTableContext.standingsMatches)
        : [];
    const leaguePlayoffMatches = leagueTableContext
        ? resolvePlayoffContextMatches(match, sameSeasonMatches, leagueTableContext.regularTeamIds)
        : [];

    const analysisReport = loadAnalysisReport(date);

    const analysisKey = `${match.home_team.toLowerCase().replace(/\s+/g, "_")}_vs_${match.away_team.toLowerCase().replace(/\s+/g, "_")}`;
    const rawAnalysis = analysisReport?.matches?.[analysisKey] ?? null;

    const { displayHomeScore, displayAwayScore, penaltyScore, decidedByPenalties, actualResult, isFinished } = resolveMatchDisplayState(match, predMatch);
    const penaltyWinnerName = decidedByPenalties && actualResult
        ? (actualResult === "HOME" ? match.home_team : actualResult === "AWAY" ? match.away_team : null)
        : null;
    const matchStats = isFinished ? buildMatchStats(match) : [];
    const rawMatch = match as unknown as Record<string, unknown>;
    const actualXgHome = readStatValue(rawMatch, ["home_expectedgoals", "home_xg"]);
    const actualXgAway = readStatValue(rawMatch, ["away_expectedgoals", "away_xg"]);

    const isInternationalMatch = competition.compType === "international";
    const competitionFinishedMatches: SofascoreMatch[] = [];
    for (const comp of competitions) {
        const allMatches = comp.dataPath === competition.dataPath ? competitionMatches : loadAllSeasons(comp);
        competitionFinishedMatches.push(...allMatches.filter((m) =>
            m.status === "finished" &&
            m.event_id !== eventId &&
            m.date < match.date
        ));
    }
    const teamHistoryMatches = [
        ...loadTeamHistory(match.home_team_id).filter((m) =>
            m.status === "finished" &&
            m.event_id !== eventId &&
            m.date < match.date
        ),
        ...loadTeamHistory(match.away_team_id).filter((m) =>
            m.status === "finished" &&
            m.event_id !== eventId &&
            m.date < match.date
        ),
    ];
    const uniqueFinishedMatches = Array.from(
        [...competitionFinishedMatches, ...teamHistoryMatches].reduce((map, m) => { map.set(m.event_id, m); return map; }, new Map<number, SofascoreMatch>()).values()
    ).sort((a, b) => b.date.localeCompare(a.date));
    const recentHistoryMatches = isInternationalMatch
        ? Array.from(teamHistoryMatches.reduce((map, m) => { map.set(m.event_id, m); return map; }, new Map<number, SofascoreMatch>()).values())
            .sort((a, b) => b.date.localeCompare(a.date))
        : uniqueFinishedMatches;
    const h2h = uniqueFinishedMatches.filter((m) =>
        (m.home_team_id === match.home_team_id && m.away_team_id === match.away_team_id) ||
        (m.home_team_id === match.away_team_id && m.away_team_id === match.home_team_id)
    ).slice(0, 10);
    const homeRecent = recentHistoryMatches.filter((m) =>
        m.home_team_id === match.home_team_id || m.away_team_id === match.home_team_id
    ).slice(0, 10);
    const awayRecent = recentHistoryMatches.filter((m) =>
        m.home_team_id === match.away_team_id || m.away_team_id === match.away_team_id
    ).slice(0, 10);
    const analysis = repairMatchAnalysis(rawAnalysis, match, homeRecent, awayRecent);
    const displayXgHome = isFinished
        ? actualXgHome ?? analysis?.goals?.expected_goals_home
        : analysis?.goals?.expected_goals_home ?? actualXgHome;
    const displayXgAway = isFinished
        ? actualXgAway ?? analysis?.goals?.expected_goals_away
        : analysis?.goals?.expected_goals_away ?? actualXgAway;

    const h2hStats = { homeWins: 0, draws: 0, awayWins: 0 };
    for (const m of h2h) {
        const homeIsHome = m.home_team_id === match.home_team_id;
        const result = resolveSofascoreMatchResult(m, null).actualResult;
        if (result === "HOME") {
            if (homeIsHome) h2hStats.homeWins++;
            else h2hStats.awayWins++;
        } else if (result === "AWAY") {
            if (homeIsHome) h2hStats.awayWins++;
            else h2hStats.homeWins++;
        } else if (result === "DRAW") {
            h2hStats.draws++;
        }
    }

    const content = (
        <>
            <div className="scrollbar-app mb-5 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 text-sm text-gray-500 dark:text-gray-400 sm:mb-8">
                <Link href="/" prefetch={false} className="hover:text-gray-900 dark:hover:text-white transition-colors">{t("home")}</Link>
                <span>/</span>
                <Link href={`/?date=${date}`} prefetch={false} className="hover:text-gray-900 dark:hover:text-white transition-colors">{competition.name}</Link>
                {match.round > 0 && (
                    <>
                        <span>/</span>
                        <span className="text-gray-700 dark:text-gray-300">{t("round_label")} {match.round}</span>
                    </>
                )}
            </div>

            <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
                <div className="flex-1">
                    <div className="mb-6 rounded-2xl bg-white p-5 dark:bg-gray-900/50 sm:p-8">
                        <div className="text-center text-xs text-gray-500 dark:text-gray-400 mb-6">
                            {competition.country.toUpperCase()} {"\u2022"} {competition.name} {"\u2022"} {match.date.slice(0, 10)}
                        </div>

                        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-8">
                            <div className="flex min-w-0 flex-col items-center">
                                <div className="flex h-16 w-full items-center justify-center sm:h-24">
                                    <TeamLogo
                                        teamId={match.home_team_id}
                                        alt={match.home_team}
                                        size={96}
                                        loading="eager"
                                        className="h-14 w-14 object-contain sm:h-20 sm:w-20"
                                    />
                                </div>
                                <span className="mt-2 block min-h-10 min-w-0 line-clamp-2 break-words text-center text-sm font-semibold leading-tight sm:mt-3 sm:min-h-12 sm:text-lg">{match.home_team}</span>
                            </div>

                            <div className="flex min-w-[74px] flex-col items-center gap-2 sm:min-w-[120px]">
                                {isFinished ? (
                                    <>
                                        <span className="text-3xl font-bold sm:text-5xl">
                                            {displayHomeScore} - {displayAwayScore}
                                        </span>
                                        <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white sm:px-3 sm:text-xs">
                                            {t("full_time")}
                                        </span>
                                        {penaltyScore && (
                                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                                {t("penalties")} {penaltyScore.home} - {penaltyScore.away}
                                            </span>
                                        )}
                                        {penaltyWinnerName && (
                                            <span className="mt-0.5 max-w-[180px] rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-center text-[11px] font-bold leading-tight text-amber-600 dark:text-amber-300">
                                                {penaltyWinnerName} {t("won_on_penalties")}
                                            </span>
                                        )}
                                        {match.home_score_ht != null && match.away_score_ht != null && (
                                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                                {t("half_time")}: {match.home_score_ht} - {match.away_score_ht}
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <span className="text-2xl font-semibold text-emerald-400 sm:text-3xl">vs</span>
                                        <span className="text-center text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                                            {match.status === "postponed" ? t("postponed") : t("not_started")}
                                        </span>
                                    </>
                                )}
                            </div>

                            <div className="flex min-w-0 flex-col items-center">
                                <div className="flex h-16 w-full items-center justify-center sm:h-24">
                                    <TeamLogo
                                        teamId={match.away_team_id}
                                        alt={match.away_team}
                                        size={96}
                                        loading="eager"
                                        className="h-14 w-14 object-contain sm:h-20 sm:w-20"
                                    />
                                </div>
                                <span className="mt-2 block min-h-10 min-w-0 line-clamp-2 break-words text-center text-sm font-semibold leading-tight sm:mt-3 sm:min-h-12 sm:text-lg">{match.away_team}</span>
                            </div>
                        </div>
                    </div>

                    {displayXgHome != null && displayXgAway != null && (() => {
                        const xgHome = displayXgHome;
                        const xgAway = displayXgAway;
                        const xgTotal = xgHome + xgAway;
                        const homePct = xgTotal > 0 ? (xgHome / xgTotal) * 100 : 50;
                        const awayPct = xgTotal > 0 ? (xgAway / xgTotal) * 100 : 50;
                        return (
                            <div className="mb-6 rounded-2xl bg-white p-4 dark:bg-gray-900/50 sm:p-6">
                                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t("expected_goals")}</h3>
                                <div className="flex items-center gap-2 sm:gap-4">
                                    <span className="w-12 text-center text-xl font-bold text-gray-900 dark:text-white sm:w-16 sm:text-2xl">{xgHome.toFixed(2)}</span>
                                    <div className="flex h-4 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 sm:h-6">
                                        <div className="bg-emerald-500 h-full" style={{ width: `${homePct}%` }} />
                                        <div className="bg-blue-500 h-full" style={{ width: `${awayPct}%` }} />
                                    </div>
                                    <span className="w-12 text-center text-xl font-bold text-gray-900 dark:text-white sm:w-16 sm:text-2xl">{xgAway.toFixed(2)}</span>
                                </div>
                            </div>
                        );
                    })()}

                    {(predMatch || analysis) && (
                        <div className="mb-6 space-y-6">
                            {analysis && <TeamRadar analysis={analysis} homeTeam={match.home_team} awayTeam={match.away_team} />}
                            {predMatch && <PredictionTriangle homeTeam={match.home_team} awayTeam={match.away_team} actualResult={isFinished ? actualResult : null} />}
                        </div>
                    )}

                    {isFinished && actualResult && displayHomeScore != null && displayAwayScore != null && (
                        <PostMatchInsights
                            homeTeam={match.home_team}
                            awayTeam={match.away_team}
                            homeScore={displayHomeScore}
                            awayScore={displayAwayScore}
                            actualResult={actualResult}
                            stats={matchStats}
                            xgHome={displayXgHome ?? null}
                            xgAway={displayXgAway ?? null}
                        />
                    )}

                    {isFinished && matchStats.length > 0 && (
                        <MatchStatistics stats={matchStats} />
                    )}

                    {(h2h.length > 0 || homeRecent.length > 0 || awayRecent.length > 0) && (
                        <MatchHistoryTabs
                            homeTeam={match.home_team}
                            awayTeam={match.away_team}
                            homeTeamId={match.home_team_id}
                            awayTeamId={match.away_team_id}
                            h2h={h2h.map(toHistoryItem)}
                            homeRecent={homeRecent.map(toHistoryItem)}
                            awayRecent={awayRecent.map(toHistoryItem)}
                            h2hStats={h2hStats}
                        />
                    )}
                </div>

                <div className="w-full space-y-6 lg:w-[540px] xl:w-[680px]">
                    {predMatch && (
                        <PredictionExplanation
                            homeTeam={match.home_team}
                            awayTeam={match.away_team}
                            analysis={analysis}
                        />
                    )}
                    {predMatch && <MatchPredictionSidebar />}
                    <CompactLeagueTable
                        standings={leagueStandings}
                        homeTeamId={match.home_team_id}
                        awayTeamId={match.away_team_id}
                        leagueSlug={competition.slug}
                        season={match.season || date || match.date}
                        playoffMatches={leaguePlayoffMatches}
                        regularTeamIds={leagueTableContext?.regularTeamIds}
                        currentMatchId={match.event_id}
                        t={t}
                    />
                    {analysis && (analysis.goals || analysis.corners || analysis.cards || analysis.form) && (
                        <div className="rounded-2xl bg-white p-4 dark:bg-gray-900/50 sm:p-6">
                            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t("pre_match_analysis")}</h3>
                            <div className="space-y-3 text-sm">
                                {analysis.goals?.btts_pct != null && (
                                    <div className="flex justify-between gap-3">
                                        <span className="min-w-0 text-gray-500 dark:text-gray-400">{t("btts_probability")}</span>
                                        <span className="shrink-0 font-semibold text-gray-900 dark:text-white">{analysis.goals.btts_pct.toFixed(0)}%</span>
                                    </div>
                                )}
                                {analysis.goals?.over_2_5_pct != null && (
                                    <div className="flex justify-between gap-3">
                                        <span className="min-w-0 text-gray-500 dark:text-gray-400">{t("over_25")}</span>
                                        <span className="shrink-0 font-semibold text-gray-900 dark:text-white">{analysis.goals.over_2_5_pct.toFixed(0)}%</span>
                                    </div>
                                )}
                                {analysis.corners?.expected_total != null && (
                                    <div className="flex justify-between gap-3">
                                        <span className="min-w-0 text-gray-500 dark:text-gray-400">{t("expected_corners")}</span>
                                        <span className="shrink-0 font-semibold text-gray-900 dark:text-white">{analysis.corners.expected_total.toFixed(1)}</span>
                                    </div>
                                )}
                                {analysis.cards?.expected_total != null && (
                                    <div className="flex justify-between gap-3">
                                        <span className="min-w-0 text-gray-500 dark:text-gray-400">{t("expected_cards")}</span>
                                        <span className="shrink-0 font-semibold text-gray-900 dark:text-white">{analysis.cards.expected_total.toFixed(1)}</span>
                                    </div>
                                )}
                                {analysis.form?.home && (
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="min-w-0 text-gray-500 dark:text-gray-400">{t("home_form")}</span>
                                        <div className="flex shrink-0 gap-1">
                                            {analysis.form.home.split("").map((c, i) => (
                                                <span key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                                    c === "W" ? "bg-emerald-600" : c === "D" ? "bg-gray-600" : "bg-red-600"
                                                }`}>{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {analysis.form?.away && (
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="min-w-0 text-gray-500 dark:text-gray-400">{t("away_form")}</span>
                                        <div className="flex shrink-0 gap-1">
                                            {analysis.form.away.split("").map((c, i) => (
                                                <span key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                                    c === "W" ? "bg-emerald-600" : c === "D" ? "bg-gray-600" : "bg-red-600"
                                                }`}>{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {isWorldCupMatch && (
                <div className="mt-6">
                    <TournamentContext
                        matches={sameSeasonMatches}
                        slotByEventId={knockoutSlotByEventId}
                        currentMatch={match}
                        competitionSlug={contextCompetition.slug}
                        predictionMatches={predictionMatches}
                        t={t}
                    />
                </div>
            )}

            {predMatch && <MatchPredictions />}
        </>
    );

    return (
        <div className="mx-auto flex w-full max-w-[1680px] flex-col px-3 py-5 text-gray-900 dark:text-white sm:px-6 sm:py-8">
            {predMatch ? (
                <MatchPredictionVariantProvider key={predMatch.id} match={predMatch} matchFinished={isFinished}>
                    {content}
                </MatchPredictionVariantProvider>
            ) : (
                content
            )}
        </div>
    );
}
