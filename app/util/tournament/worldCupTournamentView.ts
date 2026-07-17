import {
    computeWorldCupBracketSlots,
    detectWorldCupFormat,
} from "@/app/match/[id]/bracketConfig";
import { resolveSofascoreMatchResult } from "@/app/util/predictions/matchResult";
import {
    buildWorldCupSlotCandidatePairs,
    candidatePairForLoserPlaceholder,
    candidatePairForWinnerPlaceholder,
    isWorldCupPlaceholderTeamName,
    resolveWorldCupPredictionMatches,
    type WorldCupSlotCandidate,
    type WorldCupSlotCandidatePair,
} from "@/app/util/predictions/worldCupSlotResolver";
import type { PredictionMatch } from "@/types/predictions";
import type { SofascoreMatch } from "@/types/sofascore";
import { deduplicateTournamentMatches } from "./tournamentGroups";

function normalizedTeamName(name: string): string {
    return name.trim().toLocaleLowerCase("en");
}

function reportQuality(match: PredictionMatch): number {
    return (match.status === "finished" ? 10 : 0) + (match.actual_score ? 1 : 0);
}

function predictionMatchesByEventId(matches: PredictionMatch[]): Map<number, PredictionMatch> {
    const selected = new Map<number, PredictionMatch>();
    for (const match of matches) {
        if (typeof match.event_id !== "number") continue;
        const current = selected.get(match.event_id);
        if (!current || reportQuality(match) >= reportQuality(current)) {
            selected.set(match.event_id, match);
        }
    }
    return selected;
}

function concreteTeamIds(matches: SofascoreMatch[]): Map<string, number> {
    const ids = new Map<string, number>();
    for (const match of matches) {
        if (!isWorldCupPlaceholderTeamName(match.home_team)) {
            ids.set(normalizedTeamName(match.home_team), match.home_team_id);
        }
        if (!isWorldCupPlaceholderTeamName(match.away_team)) {
            ids.set(normalizedTeamName(match.away_team), match.away_team_id);
        }
    }
    return ids;
}

function mergeReportSide(
    sourceName: string,
    sourceId: number,
    reportName: string | undefined,
    teamIds: Map<string, number>,
): WorldCupSlotCandidate {
    const useReportName = Boolean(
        reportName
        && isWorldCupPlaceholderTeamName(sourceName)
        && !isWorldCupPlaceholderTeamName(reportName),
    );
    const teamName = useReportName ? reportName as string : sourceName;
    return {
        teamName,
        teamId: useReportName ? (teamIds.get(normalizedTeamName(teamName)) ?? sourceId) : sourceId,
    };
}

function mergeReportMatch(
    source: SofascoreMatch,
    report: PredictionMatch | undefined,
    teamIds: Map<string, number>,
): SofascoreMatch {
    if (!report) return source;

    const home = mergeReportSide(source.home_team, source.home_team_id, report.home_team, teamIds);
    const away = mergeReportSide(source.away_team, source.away_team_id, report.away_team, teamIds);
    const result = resolveSofascoreMatchResult(source, report);

    return {
        ...source,
        home_team: home.teamName,
        home_team_id: home.teamId,
        away_team: away.teamName,
        away_team_id: away.teamId,
        status: result.displayStatus,
        home_score: result.regularScore?.home ?? source.home_score,
        away_score: result.regularScore?.away ?? source.away_score,
        home_score_et: result.extraTimeScore?.home ?? source.home_score_et,
        away_score_et: result.extraTimeScore?.away ?? source.away_score_et,
        home_score_pen: result.penaltyScore?.home ?? source.home_score_pen,
        away_score_pen: result.penaltyScore?.away ?? source.away_score_pen,
    };
}

function candidateForPlaceholder(
    name: string,
    candidatePairs: Map<number, WorldCupSlotCandidatePair>,
): WorldCupSlotCandidate | null {
    const winnerPair = candidatePairForWinnerPlaceholder(name, candidatePairs);
    if (winnerPair?.winner) return winnerPair.winner;
    const loserPair = candidatePairForLoserPlaceholder(name, candidatePairs);
    return loserPair?.loser ?? null;
}

function resolveScheduledSide(
    teamName: string,
    teamId: number,
    candidatePairs: Map<number, WorldCupSlotCandidatePair>,
): WorldCupSlotCandidate {
    return candidateForPlaceholder(teamName, candidatePairs) ?? { teamName, teamId };
}

function resolveScheduledMatch(
    match: SofascoreMatch,
    candidatePairs: Map<number, WorldCupSlotCandidatePair>,
): SofascoreMatch {
    const home = resolveScheduledSide(match.home_team, match.home_team_id, candidatePairs);
    const away = resolveScheduledSide(match.away_team, match.away_team_id, candidatePairs);
    if (home.teamName === match.home_team && away.teamName === match.away_team) return match;

    return {
        ...match,
        home_team: home.teamName,
        home_team_id: home.teamId,
        away_team: away.teamName,
        away_team_id: away.teamId,
    };
}

export function normalizeWorldCupTournamentMatches(
    sourceMatches: SofascoreMatch[],
    predictionMatches: PredictionMatch[],
): SofascoreMatch[] {
    const source = deduplicateTournamentMatches(sourceMatches);
    if (source.length === 0) return [];

    const teamIds = concreteTeamIds(source);
    const resolvedReports = resolveWorldCupPredictionMatches(predictionMatches, source);
    const reportsByEventId = predictionMatchesByEventId(resolvedReports);
    const slotByEventId = computeWorldCupBracketSlots(source, detectWorldCupFormat(source[0], source));
    const merged = source.map((match) => mergeReportMatch(match, reportsByEventId.get(match.event_id), teamIds));
    const candidatePairs = buildWorldCupSlotCandidatePairs(merged, slotByEventId);

    return merged.map((match) => resolveScheduledMatch(match, candidatePairs));
}

export function isUpcomingTournamentMatch(match: SofascoreMatch, today: string): boolean {
    const status = String(match.status ?? "").toLowerCase();
    if (status === "finished" || status === "postponed" || status === "cancelled") return false;
    return match.date.slice(0, 10) >= today;
}
