import { computeWorldCupBracketSlots, detectWorldCupFormat } from "@/app/match/[id]/bracketConfig";
import { loadAllSeasons, loadUpcomingMatches } from "@/app/util/data/dataService";
import { loadPredictionReport } from "@/app/util/data/predictionService";
import type { Competition } from "@/app/util/league/leagueRegistry";
import { resolveSofascoreMatchResult } from "@/app/util/predictions/matchResult";
import type { PredictionMatch } from "@/types/predictions";
import type { SofascoreMatch, SofascoreUpcomingMatch } from "@/types/sofascore";

interface SlotTeam {
    teamName: string;
}

interface SlotOutcome {
    winner: SlotTeam;
    loser: SlotTeam;
}

export interface WorldCupSlotCandidate {
    teamId: number;
    teamName: string;
}

export interface WorldCupSlotCandidatePair {
    home: WorldCupSlotCandidate;
    away: WorldCupSlotCandidate;
    winner?: WorldCupSlotCandidate;
    loser?: WorldCupSlotCandidate;
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

export function loserSlotFromTeamName(name: string): number | null {
    const match = /^l(\d+)$/i.exec(name.trim());
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

function teamNameForSide(sourceMatch: SofascoreMatch, reportMatch: PredictionMatch | undefined, side: "HOME" | "AWAY"): string | null {
    const reportName = side === "HOME" ? reportMatch?.home_team : reportMatch?.away_team;
    if (reportName && !isWorldCupPlaceholderTeamName(reportName)) return reportName;

    const sourceName = side === "HOME" ? sourceMatch.home_team : sourceMatch.away_team;
    return sourceName && !isWorldCupPlaceholderTeamName(sourceName) ? sourceName : null;
}

function slotOutcomeFromMatch(sourceMatch: SofascoreMatch, reportMatch: PredictionMatch | undefined): SlotOutcome | null {
    const state = resolveSofascoreMatchResult(sourceMatch, reportMatch);
    if (!state.isFinished || state.actualResult === null || state.actualResult === "DRAW") return null;

    const winnerSide = state.actualResult;
    const loserSide = winnerSide === "HOME" ? "AWAY" : "HOME";
    const winnerName = teamNameForSide(sourceMatch, reportMatch, winnerSide);
    const loserName = teamNameForSide(sourceMatch, reportMatch, loserSide);
    return winnerName && loserName
        ? { winner: { teamName: winnerName }, loser: { teamName: loserName } }
        : null;
}

function buildSlotOutcomesFromMatches(sourceMatches: SofascoreMatch[], predictionMatches: PredictionMatch[]): Map<number, SlotOutcome> {
    const outcomes = new Map<number, SlotOutcome>();
    if (sourceMatches.length === 0) return outcomes;

    const historicalMatches = predictionMatchesByEventId(predictionMatches);
    const format = detectWorldCupFormat(sourceMatches[0], sourceMatches);
    const slotByEventId = computeWorldCupBracketSlots(sourceMatches, format);

    for (const sourceMatch of sourceMatches) {
        const slot = slotByEventId.get(sourceMatch.event_id);
        if (slot == null) continue;

        const outcome = slotOutcomeFromMatch(sourceMatch, historicalMatches.get(sourceMatch.event_id));
        if (outcome) outcomes.set(slot, outcome);
    }

    return outcomes;
}

function buildWorldCupSlotOutcomes(competitions: Competition[], dates: string[], selectedDate: string): Map<number, SlotOutcome> {
    const historicalMatches = finishedReportMatchesByEventId(dates, selectedDate);
    const predictionMatches = Array.from(historicalMatches.values());
    const outcomes = new Map<number, SlotOutcome>();

    for (const competition of competitions) {
        if (competition.slug !== "fifa-world-cup") continue;
        const sourceMatches = loadCompetitionMatches(competition, selectedDate);
        for (const [slot, outcome] of buildSlotOutcomesFromMatches(sourceMatches, predictionMatches)) {
            outcomes.set(slot, outcome);
        }
    }

    return outcomes;
}

function resolveOutcomePlaceholder(name: string, slotOutcomes: Map<number, SlotOutcome>): string {
    const winnerSlot = winnerSlotFromTeamName(name);
    if (winnerSlot != null) return slotOutcomes.get(winnerSlot)?.winner.teamName ?? name;

    const loserSlot = loserSlotFromTeamName(name);
    if (loserSlot != null) return slotOutcomes.get(loserSlot)?.loser.teamName ?? name;

    return name;
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
        const homeWon = state.isFinished && state.actualResult === "HOME";
        const awayWon = state.isFinished && state.actualResult === "AWAY";
        const winner = homeWon ? home : awayWon ? away : undefined;
        const loser = homeWon ? away : awayWon ? home : undefined;
        pairs.set(slot, { home, away, winner, loser });
    }
    return pairs;
}

export function candidatePairForWinnerPlaceholder(name: string, candidatePairs: Map<number, WorldCupSlotCandidatePair>): WorldCupSlotCandidatePair | null {
    const slot = winnerSlotFromTeamName(name);
    return slot == null ? null : candidatePairs.get(slot) ?? null;
}

export function candidatePairForLoserPlaceholder(name: string, candidatePairs: Map<number, WorldCupSlotCandidatePair>): WorldCupSlotCandidatePair | null {
    const slot = loserSlotFromTeamName(name);
    return slot == null ? null : candidatePairs.get(slot) ?? null;
}

export function resolveWorldCupCandidatePlaceholderName(name: string, candidatePairs: Map<number, WorldCupSlotCandidatePair>): string {
    const winnerPair = candidatePairForWinnerPlaceholder(name, candidatePairs);
    if (winnerPair) return formatWorldCupSlotCandidatePair(winnerPair);

    const loserPair = candidatePairForLoserPlaceholder(name, candidatePairs);
    if (loserPair?.loser) return loserPair.loser.teamName;
    return loserPair ? [loserPair.home.teamName, loserPair.away.teamName].join("/") : name;
}

function resolvePredictionTeamPlaceholders(match: PredictionMatch, slotOutcomes: Map<number, SlotOutcome>): PredictionMatch {
    const homeTeam = resolveOutcomePlaceholder(match.home_team, slotOutcomes);
    const awayTeam = resolveOutcomePlaceholder(match.away_team, slotOutcomes);
    if (homeTeam === match.home_team && awayTeam === match.away_team) return match;

    return {
        ...match,
        home_team: homeTeam,
        away_team: awayTeam,
    };
}

export function resolveWorldCupReportMatches(matches: PredictionMatch[], competitions: Competition[], dates: string[], selectedDate: string): PredictionMatch[] {
    const slotOutcomes = buildWorldCupSlotOutcomes(competitions, dates, selectedDate);
    return matches.map((match) => resolvePredictionTeamPlaceholders(match, slotOutcomes));
}

export function resolveWorldCupPredictionMatches(matches: PredictionMatch[], sourceMatches: SofascoreMatch[]): PredictionMatch[] {
    const slotOutcomes = buildSlotOutcomesFromMatches(sourceMatches, matches);
    return matches.map((match) => resolvePredictionTeamPlaceholders(match, slotOutcomes));
}
