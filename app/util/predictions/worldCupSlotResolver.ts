import { computeWorldCupBracketSlots, detectWorldCupFormat } from "@/app/match/[id]/bracketConfig";
import { loadAllSeasons, loadUpcomingMatches } from "@/app/util/data/dataService";
import { loadPredictionReport } from "@/app/util/data/predictionService";
import type { Competition } from "@/app/util/league/leagueRegistry";
import { resolveSofascoreMatchResult } from "@/app/util/predictions/matchResult";
import type { PredictionMatch } from "@/types/predictions";
import type { SofascoreMatch, SofascoreUpcomingMatch } from "@/types/sofascore";

interface SlotWinner {
    teamName: string;
}

export interface WorldCupSlotCandidate {
    teamId: number;
    teamName: string;
}

export interface WorldCupSlotCandidatePair {
    home: WorldCupSlotCandidate;
    away: WorldCupSlotCandidate;
    winner?: WorldCupSlotCandidate;
}

const WORLD_CUP_SLOT_TEAM_RE = /^(?:[12][A-Z]|[GH][12]|[WL]\d+|3[A-Z](?:\/3[A-Z])+|TBD)$/i;

export function isWorldCupPlaceholderTeamName(name: string): boolean {
    const normalized = name.trim().toLowerCase();
    return WORLD_CUP_SLOT_TEAM_RE.test(name.trim()) || /^(?:winner|loser)\b/.test(normalized);
}

function isConcreteWorldCupTeam(teamId: number, teamName: string): boolean {
    return Number.isFinite(teamId) && teamId > 0 && !isWorldCupPlaceholderTeamName(teamName);
}

export function winnerSlotFromTeamName(name: string): number | null {
    const match = /^w(\d+)$/i.exec(name.trim());
    if (!match) return null;
    const slot = Number(match[1]);
    return Number.isFinite(slot) ? slot : null;
}

function asSofascoreMatch(match: SofascoreMatch | SofascoreUpcomingMatch): SofascoreMatch {
    if ("season" in match && typeof match.season === "string") return match;
    return {
        ...match,
        season: match.date.slice(0, 4),
    } as SofascoreMatch;
}

function seasonYearFromMatch(match: SofascoreMatch): string | null {
    const seasonYear = String(match.season ?? "").match(/\b(?:19|20)\d{2}\b/)?.[0];
    return seasonYear ?? match.date.slice(0, 4) ?? null;
}

function loadCompetitionMatches(competition: Competition, selectedDate: string): SofascoreMatch[] {
    const selectedYear = selectedDate.slice(0, 4);
    const matches = [
        ...loadAllSeasons(competition),
        ...loadUpcomingMatches(competition).map(asSofascoreMatch),
    ];
    const seasonMatches = matches.filter((match) => seasonYearFromMatch(match) === selectedYear);
    return seasonMatches.length > 0 ? seasonMatches : matches;
}

function finishedReportMatchesByEventId(dates: string[], selectedDate: string): Map<number, PredictionMatch> {
    const byEventId = new Map<number, PredictionMatch>();
    for (const date of dates) {
        if (date > selectedDate) continue;
        const historicalReport = loadPredictionReport(date);
        for (const match of historicalReport?.matches ?? []) {
            if (typeof match.event_id !== "number") continue;
            if (match.status !== "finished" || !match.actual_result) continue;
            byEventId.set(match.event_id, match);
        }
    }
    return byEventId;
}

function predictionMatchesByEventId(predictionMatches: PredictionMatch[]): Map<number, PredictionMatch> {
    const byEventId = new Map<number, PredictionMatch>();
    for (const match of predictionMatches) {
        if (typeof match.event_id !== "number") continue;
        byEventId.set(match.event_id, match);
    }
    return byEventId;
}

function predictionMatchMap(predictionMatches?: PredictionMatch[] | Map<number, PredictionMatch>): Map<number, PredictionMatch> {
    if (!predictionMatches) return new Map<number, PredictionMatch>();
    return predictionMatches instanceof Map ? predictionMatches : predictionMatchesByEventId(predictionMatches);
}

function teamNameForWinnerSide(sourceMatch: SofascoreMatch, reportMatch: PredictionMatch | undefined, side: "HOME" | "AWAY"): string | null {
    const reportName = side === "HOME" ? reportMatch?.home_team : reportMatch?.away_team;
    if (reportName && !isWorldCupPlaceholderTeamName(reportName)) return reportName;

    const sourceName = side === "HOME" ? sourceMatch.home_team : sourceMatch.away_team;
    return sourceName && !isWorldCupPlaceholderTeamName(sourceName) ? sourceName : null;
}

function slotWinnerFromMatch(sourceMatch: SofascoreMatch, reportMatch: PredictionMatch | undefined): SlotWinner | null {
    const state = resolveSofascoreMatchResult(sourceMatch, reportMatch);
    if (!state.isFinished || state.actualResult === null || state.actualResult === "DRAW") return null;

    const teamName = teamNameForWinnerSide(sourceMatch, reportMatch, state.actualResult);
    return teamName ? { teamName } : null;
}

function buildSlotWinnersFromMatches(sourceMatches: SofascoreMatch[], predictionMatches: PredictionMatch[]): Map<number, SlotWinner> {
    const winners = new Map<number, SlotWinner>();
    if (sourceMatches.length === 0) return winners;

    const historicalMatches = predictionMatchesByEventId(predictionMatches);
    const format = detectWorldCupFormat(sourceMatches[0], sourceMatches);
    const slotByEventId = computeWorldCupBracketSlots(sourceMatches, format);

    for (const sourceMatch of sourceMatches) {
        const slot = slotByEventId.get(sourceMatch.event_id);
        if (slot == null) continue;

        const winner = slotWinnerFromMatch(sourceMatch, historicalMatches.get(sourceMatch.event_id));
        if (winner) winners.set(slot, winner);
    }

    return winners;
}

function buildWorldCupSlotWinners(competitions: Competition[], dates: string[], selectedDate: string): Map<number, SlotWinner> {
    const historicalMatches = finishedReportMatchesByEventId(dates, selectedDate);
    const predictionMatches = Array.from(historicalMatches.values());
    const winners = new Map<number, SlotWinner>();

    for (const competition of competitions) {
        if (competition.slug !== "fifa-world-cup") continue;
        const sourceMatches = loadCompetitionMatches(competition, selectedDate);
        for (const [slot, winner] of buildSlotWinnersFromMatches(sourceMatches, predictionMatches)) {
            winners.set(slot, winner);
        }
    }

    return winners;
}

function resolveWinnerPlaceholder(name: string, slotWinners: Map<number, SlotWinner>): string {
    const slot = winnerSlotFromTeamName(name);
    if (slot == null) return name;
    return slotWinners.get(slot)?.teamName ?? name;
}

function candidateForSide(match: SofascoreMatch, side: "HOME" | "AWAY"): WorldCupSlotCandidate | null {
    const teamId = side === "HOME" ? match.home_team_id : match.away_team_id;
    const teamName = side === "HOME" ? match.home_team : match.away_team;
    return isConcreteWorldCupTeam(teamId, teamName) ? { teamId, teamName } : null;
}

export function formatWorldCupSlotCandidatePair(pair: WorldCupSlotCandidatePair, separator = "/"): string {
    if (pair.winner) return pair.winner.teamName;
    return `${pair.home.teamName}${separator}${pair.away.teamName}`;
}

export function buildWorldCupSlotCandidatePairs(sourceMatches: SofascoreMatch[], slotByEventId: Map<number, number>, predictionMatches?: PredictionMatch[] | Map<number, PredictionMatch>): Map<number, WorldCupSlotCandidatePair> {
    const pairs = new Map<number, WorldCupSlotCandidatePair>();
    const predictionByEventId = predictionMatchMap(predictionMatches);
    for (const match of sourceMatches) {
        const slot = slotByEventId.get(match.event_id);
        if (slot == null) continue;
        const home = candidateForSide(match, "HOME");
        const away = candidateForSide(match, "AWAY");
        if (!home || !away) continue;

        const state = resolveSofascoreMatchResult(match, predictionByEventId.get(match.event_id) ?? null);
        const winner = state.isFinished && state.actualResult === "HOME"
            ? home
            : state.isFinished && state.actualResult === "AWAY"
                ? away
                : undefined;
        pairs.set(slot, { home, away, winner });
    }
    return pairs;
}

export function candidatePairForWinnerPlaceholder(name: string, candidatePairs: Map<number, WorldCupSlotCandidatePair>): WorldCupSlotCandidatePair | null {
    const slot = winnerSlotFromTeamName(name);
    return slot == null ? null : candidatePairs.get(slot) ?? null;
}

export function resolveWorldCupCandidatePlaceholderName(name: string, candidatePairs: Map<number, WorldCupSlotCandidatePair>): string {
    const pair = candidatePairForWinnerPlaceholder(name, candidatePairs);
    return pair ? formatWorldCupSlotCandidatePair(pair) : name;
}

function resolvePredictionTeamPlaceholders(match: PredictionMatch, slotWinners: Map<number, SlotWinner>): PredictionMatch {
    const homeTeam = resolveWinnerPlaceholder(match.home_team, slotWinners);
    const awayTeam = resolveWinnerPlaceholder(match.away_team, slotWinners);
    if (homeTeam === match.home_team && awayTeam === match.away_team) return match;

    return {
        ...match,
        home_team: homeTeam,
        away_team: awayTeam,
    };
}

export function resolveWorldCupReportMatches(matches: PredictionMatch[], competitions: Competition[], dates: string[], selectedDate: string): PredictionMatch[] {
    const slotWinners = buildWorldCupSlotWinners(competitions, dates, selectedDate);
    return matches.map((match) => resolvePredictionTeamPlaceholders(match, slotWinners));
}

export function resolveWorldCupPredictionMatches(matches: PredictionMatch[], sourceMatches: SofascoreMatch[]): PredictionMatch[] {
    const slotWinners = buildSlotWinnersFromMatches(sourceMatches, matches);
    return matches.map((match) => resolvePredictionTeamPlaceholders(match, slotWinners));
}