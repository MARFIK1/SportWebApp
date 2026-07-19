import type { ReactNode } from "react";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import TeamLogo from "@/app/components/common/TeamLogo";
import { computeStandings, type StandingRow } from "@/app/util/data/dataService";
import { resolveSofascoreMatchResult, type ResolvedMatchResult } from "@/app/util/predictions/matchResult";
import {
    buildWorldCupSlotCandidatePairs,
    candidatePairForLoserPlaceholder,
    candidatePairForWinnerPlaceholder,
    type WorldCupSlotCandidatePair,
} from "@/app/util/predictions/worldCupSlotResolver";
import {
    buildGroupStageEventIds,
    detectTournamentGroups,
    type TournamentGroup,
} from "@/app/util/tournament/tournamentGroups";
import type { SofascoreMatch } from "@/types/sofascore";
import type { PredictionMatch } from "@/types/predictions";
import WorldCupBracket from "./WorldCupBracket";
import { buildWorldCupKnockoutRounds, type KnockoutRoundWithMatches, type TournamentFormat } from "./bracketConfig";

interface TournamentContextProps {
    matches: SofascoreMatch[];
    slotByEventId: Map<number, number>;
    format: TournamentFormat;
    currentMatch: SofascoreMatch;
    competitionSlug: string;
    predictionMatches?: PredictionMatch[];
    t: (key: string) => string;
}


type CandidateOutcome = "winner" | "loser";

interface TeamMarkProps {
    teamId: number;
    teamName: string;
    t: (key: string) => string;
    align?: "left" | "right";
    candidatePair?: WorldCupSlotCandidatePair | null;
    candidateOutcome?: CandidateOutcome;
    reverseCandidatePair?: boolean;
    compact?: boolean;
}

interface ScoreBadgeProps {
    children: ReactNode;
    tone?: "default" | "current";
    compact?: boolean;
}

interface GroupStandingsTableProps {
    group: TournamentGroup;
    homeTeamId: number;
    awayTeamId: number;
    t: (key: string) => string;
}

interface GroupFixturesProps {
    group: TournamentGroup;
    currentMatchId: number;
    predictionsByEventId: Map<number, PredictionMatch>;
    t: (key: string) => string;
}

interface GroupStageSectionProps extends GroupStandingsTableProps {
    competitionSlug: string;
    currentMatchId: number;
    predictionsByEventId: Map<number, PredictionMatch>;
}

interface FeaturedKnockoutMatchProps {
    match: SofascoreMatch;
    roundLabel: string;
    predictionsByEventId: Map<number, PredictionMatch>;
    candidatePairs: Map<number, WorldCupSlotCandidatePair>;
    reverseCandidatePair?: boolean;
    t: (key: string) => string;
}

interface FeaturedTeamLogoProps {
    teamId: number;
    teamName: string;
    t: (key: string) => string;
    candidatePair?: WorldCupSlotCandidatePair | null;
    candidateOutcome?: CandidateOutcome;
    reverseCandidatePair?: boolean;
}

interface KnockoutRoundsListProps {
    rounds: KnockoutRoundWithMatches[];
    currentMatchId: number;
    predictionsByEventId: Map<number, PredictionMatch>;
    candidatePairs: Map<number, WorldCupSlotCandidatePair>;
    t: (key: string) => string;
}

interface KnockoutSectionProps {
    matches: SofascoreMatch[];
    slotByEventId: Map<number, number>;
    currentMatch: SofascoreMatch;
    predictionsByEventId: Map<number, PredictionMatch>;
    format: TournamentFormat;
    rounds: KnockoutRoundWithMatches[];
    t: (key: string) => string;
}
const PLACEHOLDER_TEAM_RE = /^(?:[12][A-Z]|[GH][12]|[WL]\d+|3[A-Z](?:\/3[A-Z])+)$/;

function validTeamId(teamId: number): boolean {
    return Number.isFinite(teamId) && teamId > 0;
}

function isPlaceholderTeam(name: string): boolean {
    return !name || PLACEHOLDER_TEAM_RE.test(name.trim());
}

function buildTeamIds(matches: SofascoreMatch[]): Map<string, number> {
    const ids = new Map<string, number>();
    for (const match of matches) {
        if (validTeamId(match.home_team_id) && !isPlaceholderTeam(match.home_team)) ids.set(match.home_team, match.home_team_id);
        if (validTeamId(match.away_team_id) && !isPlaceholderTeam(match.away_team)) ids.set(match.away_team, match.away_team_id);
    }
    return ids;
}

function predictionMap(predictionMatches: PredictionMatch[] | undefined): Map<number, PredictionMatch> {
    const byEventId = new Map<number, PredictionMatch>();
    for (const pred of predictionMatches ?? []) {
        if (typeof pred.event_id === "number") byEventId.set(pred.event_id, pred);
    }
    return byEventId;
}

function resolveDisplayMatch(
    match: SofascoreMatch,
    predictionsByEventId: Map<number, PredictionMatch>,
    teamIds: Map<string, number>,
): SofascoreMatch {
    const pred = predictionsByEventId.get(match.event_id);
    if (!pred) return match;

    const replaceHome = isPlaceholderTeam(match.home_team) && !isPlaceholderTeam(pred.home_team);
    const replaceAway = isPlaceholderTeam(match.away_team) && !isPlaceholderTeam(pred.away_team);
    if (!replaceHome && !replaceAway) return match;

    const homeTeam = replaceHome ? pred.home_team : match.home_team;
    const awayTeam = replaceAway ? pred.away_team : match.away_team;

    return {
        ...match,
        home_team: homeTeam,
        away_team: awayTeam,
        home_team_id: replaceHome ? (teamIds.get(homeTeam) ?? match.home_team_id) : match.home_team_id,
        away_team_id: replaceAway ? (teamIds.get(awayTeam) ?? match.away_team_id) : match.away_team_id,
    };
}

function resolveCurrentGroup(matches: SofascoreMatch[], groupStageEventIds: Set<number>, homeTeamId: number, awayTeamId: number): TournamentGroup | null {
    return detectTournamentGroups(matches, groupStageEventIds).find((group) =>
        group.teamIds.includes(homeTeamId) || group.teamIds.includes(awayTeamId)
    ) ?? null;
}

function zeroStandingRow(teamId: number, teamName: string): StandingRow {
    return {
        position: 0,
        teamId,
        teamName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        form: [],
    };
}

function sortStandings(a: StandingRow, b: StandingRow): number {
    return (
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        a.teamName.localeCompare(b.teamName)
    );
}

function buildGroupStandings(group: TournamentGroup): StandingRow[] {
    const rowsByTeam = new Map(computeStandings(group.matches).map((row) => [row.teamId, row]));
    for (const teamId of group.teamIds) {
        if (!rowsByTeam.has(teamId)) {
            rowsByTeam.set(teamId, zeroStandingRow(teamId, group.teamNames.get(teamId) ?? String(teamId)));
        }
    }

    const rows = Array.from(rowsByTeam.values()).sort(sortStandings);
    rows.forEach((row, index) => {
        row.position = index + 1;
    });
    return rows;
}

function formatGoalDifference(value: number): string {
    if (value > 0) return `+${value}`;
    return String(value);
}

function formStyle(result: string): string {
    if (result === "W") return "bg-emerald-500 text-gray-950";
    if (result === "D") return "bg-gray-400 text-gray-950";
    return "bg-red-500 text-gray-950";
}

function rowStyle(row: StandingRow, homeTeamId: number, awayTeamId: number): string {
    if (row.teamId === homeTeamId) return "border-emerald-400/65 bg-emerald-500/12";
    if (row.teamId === awayTeamId) return "border-blue-400/65 bg-blue-500/12";
    return "border-white/10 bg-gray-950/25";
}

function compactResultLabel(state: ResolvedMatchResult, t: (key: string) => string): string | null {
    if (!state.regularScore) return null;
    const base = `${state.regularScore.home}-${state.regularScore.away}`;
    if (state.penaltyScore) return `${base} \u00b7 ${t("penalties")} ${state.penaltyScore.home}-${state.penaltyScore.away}`;
    if (state.wentToExtraTime) return `${base} AET`;
    return base;
}

function formatMatchScore(match: SofascoreMatch, state: ResolvedMatchResult, t: (key: string) => string): string {
    if (state.isFinished) return compactResultLabel(state, t) ?? "vs";
    if (match.status === "postponed") return t("postponed");
    return "vs";
}

function selectedCandidate(candidatePair: WorldCupSlotCandidatePair | null, outcome: CandidateOutcome) {
    return outcome === "loser" ? candidatePair?.loser : candidatePair?.winner;
}

function candidatePairSides(candidatePair: WorldCupSlotCandidatePair, outcome: CandidateOutcome, reverse = false) {
    const sides = outcome === "loser" ? [candidatePair.away, candidatePair.home] : [candidatePair.home, candidatePair.away];
    return reverse ? [sides[1], sides[0]] : sides;
}

function candidateResolution(name: string, candidatePairs: Map<number, WorldCupSlotCandidatePair>): { pair: WorldCupSlotCandidatePair | null; outcome: CandidateOutcome } {
    const loserPair = candidatePairForLoserPlaceholder(name, candidatePairs);
    if (loserPair) return { pair: loserPair, outcome: "loser" };
    return { pair: candidatePairForWinnerPlaceholder(name, candidatePairs), outcome: "winner" };
}

function displayTeamName(name: string, t: (key: string) => string, candidatePair: WorldCupSlotCandidatePair | null = null, candidateOutcome: CandidateOutcome = "winner", reverseCandidatePair = false): string {
    const candidate = selectedCandidate(candidatePair, candidateOutcome);
    if (candidate) return candidate.teamName;
    if (candidatePair) return candidatePairSides(candidatePair, candidateOutcome, reverseCandidatePair).map((item) => item.teamName).join(" / ");
    return isPlaceholderTeam(name) ? t("to_be_decided") : name;
}

function TeamMark({ teamId, teamName, t, align = "left", candidatePair = null, candidateOutcome = "winner", reverseCandidatePair = false, compact = false }: TeamMarkProps) {
    const placeholder = isPlaceholderTeam(teamName) && !candidatePair;
    const candidate = selectedCandidate(candidatePair, candidateOutcome);
    const label = displayTeamName(teamName, t, candidatePair, candidateOutcome, reverseCandidatePair);
    const logoSize = compact ? 20 : 24;
    const logoClass = compact ? "h-5 w-5" : "h-6 w-6";
    const pairLogoSize = compact ? 16 : logoSize;
    const pairLogoClass = compact ? "h-4 w-4" : logoClass;
    const compactLabelClass = candidatePair && !candidate
        ? "truncate text-[9px] leading-none"
        : "truncate text-[11px] leading-tight";
    return (
        <div
            title={label}
            className={`flex min-w-0 items-center ${compact ? "gap-1.5" : "gap-2"} ${align === "right" ? "flex-row-reverse text-right" : ""}`}
        >
            {candidate ? (
                <TeamLogo teamId={candidate.teamId} alt={candidate.teamName} size={logoSize} className={`${logoClass} shrink-0 object-contain`} />
            ) : candidatePair ? (
                <span className={`flex shrink-0 items-center justify-center -space-x-1 ${compact ? "h-5 w-7" : "h-6 w-9"}`}>
                    {candidatePairSides(candidatePair, candidateOutcome, reverseCandidatePair).map((item) => (
                        <span key={item.teamId} className={`flex items-center justify-center rounded-full border border-white/15 bg-gray-950/80 p-0.5 ${pairLogoClass}`}>
                            <TeamLogo teamId={item.teamId} alt={item.teamName} size={pairLogoSize} className="h-full w-full object-contain" />
                        </span>
                    ))}
                </span>
            ) : placeholder ? (
                <span className={`flex shrink-0 items-center justify-center rounded-full border border-white/15 bg-gray-800 text-[9px] font-black text-gray-400 ${logoClass}`}>
                    ?
                </span>
            ) : (
                <TeamLogo teamId={teamId} alt={label} size={logoSize} className={`${logoClass} shrink-0 object-contain`} />
            )}
            <span className={`${compact ? compactLabelClass : "truncate text-xs"} font-bold ${placeholder ? "text-gray-400" : "text-gray-900 dark:text-white"}`}>
                {label}
            </span>
        </div>
    );
}

function ScoreBadge({ children, tone = "default", compact = false }: ScoreBadgeProps) {
    const cls =
        tone === "current"
            ? "border border-amber-400/50 bg-amber-400/15 text-amber-600 dark:text-amber-200"
            : "border border-white/10 bg-gray-950/60 text-white";
    return (
        <span className={`shrink-0 whitespace-nowrap rounded-md text-center font-black ${compact ? "px-1.5 py-1 text-[10px]" : "px-2 py-1 text-[11px]"} ${cls}`}>
            {children}
        </span>
    );
}


function GroupStandingsTable({ group, homeTeamId, awayTeamId, t }: GroupStandingsTableProps) {
    const standings = buildGroupStandings(group);
    return (
        <div className="overflow-x-auto">
            <div className="min-w-[420px]">
                <div className="grid grid-cols-[1.75rem_minmax(7rem,1fr)_2rem_3.4rem_2.4rem_3.8rem_2.4rem] gap-2 px-1.5 pb-2 text-[10px] font-black uppercase tracking-[0.08em] text-gray-500 dark:text-gray-500">
                    <span>#</span>
                    <span>{t("team")}</span>
                    <span className="text-center">{t("played_short")}</span>
                    <span className="text-center">{t("win_draw_loss_short")}</span>
                    <span className="text-center">{t("gd_short")}</span>
                    <span className="text-center">{t("last5")}</span>
                    <span className="text-right">{t("points_short")}</span>
                </div>
                <div className="space-y-1">
                    {standings.map((row) => {
                        const isHome = row.teamId === homeTeamId;
                        const isAway = row.teamId === awayTeamId;
                        return (
                            <div
                                key={row.teamId}
                                className={`grid grid-cols-[1.75rem_minmax(7rem,1fr)_2rem_3.4rem_2.4rem_3.8rem_2.4rem] items-center gap-2 rounded-lg border px-1.5 py-1.5 text-xs ${rowStyle(row, homeTeamId, awayTeamId)}`}
                            >
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-black text-gray-800 dark:bg-gray-700 dark:text-white">
                                    {row.position}
                                </span>
                                <div className="flex min-w-0 items-center gap-2">
                                    <TeamLogo teamId={row.teamId} alt={row.teamName} size={22} className="h-5 w-5 shrink-0 object-contain" />
                                    <div className="min-w-0">
                                        <div className="truncate font-bold text-gray-900 dark:text-white">{row.teamName}</div>
                                        {(isHome || isAway) && (
                                            <div className={`mt-0.5 text-[8px] font-black uppercase tracking-[0.14em] ${isHome ? "text-emerald-500 dark:text-emerald-300" : "text-blue-500 dark:text-blue-300"}`}>
                                                {isHome ? t("home_short") : t("away_short")}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <span className="text-center font-semibold text-gray-700 dark:text-gray-200">{row.played}</span>
                                <span className="text-center font-semibold text-gray-700 dark:text-gray-200">{row.won}-{row.drawn}-{row.lost}</span>
                                <span className={`text-center font-bold ${row.goalDifference >= 0 ? "text-emerald-500 dark:text-emerald-300" : "text-red-500 dark:text-red-300"}`}>
                                    {formatGoalDifference(row.goalDifference)}
                                </span>
                                <span className="flex justify-center gap-0.5">
                                    {row.form.length > 0 ? row.form.slice(-5).map((result, index) => (
                                        <span key={`${result}-${index}`} className={`flex h-5 w-4 items-center justify-center rounded-[3px] text-[10px] font-black ${formStyle(result)}`}>
                                            {result}
                                        </span>
                                    )) : <span className="text-xs font-semibold text-gray-500">-</span>}
                                </span>
                                <span className="text-right text-sm font-black text-gray-900 dark:text-white">{row.points}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function GroupFixtures({ group, currentMatchId, predictionsByEventId, t }: GroupFixturesProps) {
    const byMatchday = new Map<number, SofascoreMatch[]>();
    for (const match of group.matches) {
        const day = Number(match.round) || 0;
        const list = byMatchday.get(day) ?? [];
        list.push(match);
        byMatchday.set(day, list);
    }
    const matchdays = Array.from(byMatchday.entries()).sort((a, b) => a[0] - b[0]);

    return (
        <div className="space-y-4">
            {matchdays.map(([day, dayMatches]) => (
                <div key={day}>
                    <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                        {t("matchday")} {day}
                    </div>
                    <div className="space-y-1.5">
                        {dayMatches.map((match) => {
                            const isCurrent = match.event_id === currentMatchId;
                            const state = resolveSofascoreMatchResult(match, predictionsByEventId.get(match.event_id) ?? null);
                            return (
                                <Link
                                    key={match.event_id}
                                    href={`/match/${match.event_id}?date=${match.date.slice(0, 10)}`}
                                    prefetch={false}
                                    className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${isCurrent ? "border-amber-400/60 bg-amber-400/10" : "border-white/10 bg-gray-950/25 hover:border-emerald-400/40 hover:bg-emerald-500/10"}`}
                                >
                                    <TeamMark teamId={match.home_team_id} teamName={match.home_team} t={t} />
                                    <ScoreBadge tone={isCurrent ? "current" : "default"}>{formatMatchScore(match, state, t)}</ScoreBadge>
                                    <TeamMark teamId={match.away_team_id} teamName={match.away_team} t={t} align="right" />
                                </Link>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

function GroupStageSection({ group, homeTeamId, awayTeamId, competitionSlug, currentMatchId, predictionsByEventId, t }: GroupStageSectionProps) {
    return (
        <section className="rounded-2xl bg-white p-4 dark:bg-gray-900/50 sm:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t("group")} {group.letter}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("group_context_hint")}</p>
                </div>
                <Link
                    href={`/league/${competitionSlug}`}
                    prefetch={false}
                    className="shrink-0 rounded-lg border border-emerald-500/40 px-2.5 py-1.5 text-xs font-bold text-emerald-500 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
                >
                    {t("view_full_table")}
                </Link>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <div>
                    <div className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                        {t("group_standings")}
                    </div>
                    <GroupStandingsTable group={group} homeTeamId={homeTeamId} awayTeamId={awayTeamId} t={t} />
                </div>
                <div>
                    <div className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                        {t("group_fixtures")}
                    </div>
                    <GroupFixtures group={group} currentMatchId={currentMatchId} predictionsByEventId={predictionsByEventId} t={t} />
                </div>
            </div>
        </section>
    );
}


function FeaturedTeamLogo({ teamId, teamName, t, candidatePair = null, candidateOutcome = "winner", reverseCandidatePair = false }: FeaturedTeamLogoProps) {
    if (candidatePair) {
        const candidate = selectedCandidate(candidatePair, candidateOutcome);
        const label = candidate?.teamName ?? candidatePairSides(candidatePair, candidateOutcome, reverseCandidatePair).map((item) => item.teamName).join(" / ");
        if (candidate) {
            return (
                <span title={label} className="flex h-11 w-11 items-center justify-center sm:h-14 sm:w-14">
                    <TeamLogo
                        teamId={candidate.teamId}
                        alt={candidate.teamName}
                        size={56}
                        className="h-full w-full object-contain"
                    />
                </span>
            );
        }
        return (
            <span title={label} className="flex h-11 w-20 items-center justify-center -space-x-2 sm:h-14 sm:w-24">
                {candidatePairSides(candidatePair, candidateOutcome, reverseCandidatePair).map((item) => (
                    <span key={item.teamId} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-gray-950/80 p-1 shadow-lg sm:h-14 sm:w-14">
                        <TeamLogo teamId={item.teamId} alt={item.teamName} size={56} className="h-full w-full object-contain" />
                    </span>
                ))}
            </span>
        );
    }

    if (isPlaceholderTeam(teamName) || !validTeamId(teamId)) {
        return (
            <span
                title={t("to_be_decided")}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-gray-800 text-base font-black text-gray-400 sm:h-14 sm:w-14"
            >
                ?
            </span>
        );
    }

    return <TeamLogo teamId={teamId} alt={teamName} size={56} className="h-11 w-11 object-contain sm:h-14 sm:w-14" />;
}

function FeaturedKnockoutMatch({ match, roundLabel, predictionsByEventId, candidatePairs, reverseCandidatePair = false, t }: FeaturedKnockoutMatchProps) {
    const state = resolveSofascoreMatchResult(match, predictionsByEventId.get(match.event_id) ?? null);
    const scoreText = state.isFinished ? compactResultLabel(state, t) : null;
    const homeCandidate = candidateResolution(match.home_team, candidatePairs);
    const awayCandidate = candidateResolution(match.away_team, candidatePairs);
    const homeLabel = displayTeamName(match.home_team, t, homeCandidate.pair, homeCandidate.outcome, reverseCandidatePair);
    const awayLabel = displayTeamName(match.away_team, t, awayCandidate.pair, awayCandidate.outcome, reverseCandidatePair);
    const winnerName = state.decidedByPenalties && state.actualResult
        ? (state.actualResult === "HOME" ? match.home_team : state.actualResult === "AWAY" ? match.away_team : null)
        : null;

    return (
        <Link
            href={`/match/${match.event_id}?date=${match.date.slice(0, 10)}`}
            prefetch={false}
            className="block overflow-hidden rounded-2xl border border-emerald-400/50 bg-emerald-500/10 p-4 transition-colors hover:bg-emerald-500/15 sm:p-5"
        >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-500 dark:text-emerald-300">
                    {t("current_match")}
                </span>
                <span className="rounded-full border border-emerald-300/30 bg-gray-950/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-100">
                    {roundLabel}
                </span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6">
                <div className="flex min-w-0 flex-col items-center gap-2 text-center">
                    <FeaturedTeamLogo teamId={match.home_team_id} teamName={match.home_team} candidatePair={homeCandidate.pair} candidateOutcome={homeCandidate.outcome} reverseCandidatePair={reverseCandidatePair} t={t} />
                    <span title={homeLabel} className="max-w-full truncate text-sm font-black text-gray-900 dark:text-white">
                        {homeLabel}
                    </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <span className="rounded-xl bg-gray-950 px-3 py-2 text-lg font-black text-white">
                        {scoreText ?? "vs"}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400">{match.date.slice(5, 10)}</span>
                </div>
                <div className="flex min-w-0 flex-col items-center gap-2 text-center">
                    <FeaturedTeamLogo teamId={match.away_team_id} teamName={match.away_team} candidatePair={awayCandidate.pair} candidateOutcome={awayCandidate.outcome} reverseCandidatePair={reverseCandidatePair} t={t} />
                    <span title={awayLabel} className="max-w-full truncate text-sm font-black text-gray-900 dark:text-white">
                        {awayLabel}
                    </span>
                </div>
            </div>
            {winnerName && (
                <div className="mt-3 flex justify-center">
                    <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-bold text-amber-600 dark:text-amber-300">
                        {winnerName} {t("won_on_penalties")}
                    </span>
                </div>
            )}
        </Link>
    );
}

function roundColumn(stage: KnockoutRoundWithMatches["stage"], hasRoundOf32: boolean): number {
    if (hasRoundOf32) {
        if (stage === "R32") return 0;
        if (stage === "R16" || stage === "QF") return 1;
        return 2;
    }
    if (stage === "R16") return 0;
    if (stage === "QF") return 1;
    return 2;
}

function groupRoundsIntoColumns(rounds: KnockoutRoundWithMatches[]): KnockoutRoundWithMatches[][] {
    const hasRoundOf32 = rounds.some((round) => round.stage === "R32");
    const columns: KnockoutRoundWithMatches[][] = [[], [], []];
    for (const round of rounds) columns[roundColumn(round.stage, hasRoundOf32)].push(round);
    return columns.filter((column) => column.length > 0);
}

function KnockoutRoundsList({ rounds, currentMatchId, predictionsByEventId, candidatePairs, t }: KnockoutRoundsListProps) {
    const columns = groupRoundsIntoColumns(rounds);
    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 xl:items-start">
            {columns.map((column, columnIndex) => (
                <div key={columnIndex} className="relative">
                    <div className="space-y-4">
                        {column.map((round) => (
                            <div key={round.labelKey} className="rounded-xl border border-white/10 bg-gray-950/25 p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                                        {t(round.labelKey)}
                                    </span>
                                    <span className="rounded-full bg-gray-950/60 px-2 py-0.5 text-[10px] font-black text-gray-400">
                                        {round.matches.length}
                                    </span>
                                </div>
                                <div className="space-y-1.5">
                                    {round.matches.map((match) => {
                                        const isCurrent = match.event_id === currentMatchId;
                                        const state = resolveSofascoreMatchResult(match, predictionsByEventId.get(match.event_id) ?? null);
                                        const homeCandidate = candidateResolution(match.home_team, candidatePairs);
                                        const awayCandidate = candidateResolution(match.away_team, candidatePairs);
                                        const reverseCandidatePair = round.stage === "FINAL";
                                        const homeLabel = displayTeamName(match.home_team, t, homeCandidate.pair, homeCandidate.outcome, reverseCandidatePair);
                                        const awayLabel = displayTeamName(match.away_team, t, awayCandidate.pair, awayCandidate.outcome, reverseCandidatePair);
                                        const scoreText = formatMatchScore(match, state, t);
                                        return (
                                            <Link
                                                key={match.event_id}
                                                href={`/match/${match.event_id}?date=${match.date.slice(0, 10)}`}
                                                prefetch={false}
                                                aria-label={`${homeLabel} ${scoreText} ${awayLabel}`}
                                                className={`grid min-h-10 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 rounded-lg border px-1.5 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${isCurrent ? "border-amber-400/60 bg-amber-400/10" : "border-white/10 bg-gray-950/40 hover:border-emerald-400/40 hover:bg-emerald-500/10"}`}
                                            >
                                                <TeamMark teamId={match.home_team_id} teamName={match.home_team} candidatePair={homeCandidate.pair} candidateOutcome={homeCandidate.outcome} reverseCandidatePair={reverseCandidatePair} compact t={t} />
                                                <ScoreBadge tone={isCurrent ? "current" : "default"} compact>{scoreText}</ScoreBadge>
                                                <TeamMark teamId={match.away_team_id} teamName={match.away_team} candidatePair={awayCandidate.pair} candidateOutcome={awayCandidate.outcome} reverseCandidatePair={reverseCandidatePair} compact t={t} align="right" />
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                    {columnIndex < columns.length - 1 && (
                        <span aria-hidden="true" className="pointer-events-none absolute -right-[18px] top-5 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-emerald-400/25 bg-gray-950 text-emerald-400 shadow-lg xl:flex">
                            <ChevronRightIcon className="h-3.5 w-3.5" />
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}
function hasCompleteBracket(format: TournamentFormat, slotByEventId: Map<number, number>, currentMatchId: number): boolean {
    const currentSlot = slotByEventId.get(currentMatchId);
    if (currentSlot == null) return false;
    const mappedSlots = new Set(slotByEventId.values());
    return format.leafSlots.every((slot) => mappedSlots.has(slot));
}

function KnockoutSection({ matches, slotByEventId, currentMatch, predictionsByEventId, format, rounds, t }: KnockoutSectionProps) {
    if (rounds.length === 0) return null;

    const currentRound = rounds.find((round) => round.matches.some((match) => match.event_id === currentMatch.event_id)) ?? rounds[0];
    const hasFullBracket = hasCompleteBracket(format, slotByEventId, currentMatch.event_id);
    const candidatePairs = buildWorldCupSlotCandidatePairs(matches, slotByEventId, predictionsByEventId);

    return (
        <section id="knockout-bracket" className="rounded-2xl bg-white p-4 dark:bg-gray-900/50 sm:p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t("knockout_bracket")}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("knockout_bracket_hint")}</p>
                </div>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-500 dark:text-emerald-400">
                    {t(currentRound.labelKey)}
                </span>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] xl:items-start">
                <div className="space-y-4">
                    <FeaturedKnockoutMatch
                        match={currentMatch}
                        roundLabel={t(currentRound.labelKey)}
                        predictionsByEventId={predictionsByEventId}
                        candidatePairs={candidatePairs}
                        reverseCandidatePair={currentRound.stage === "FINAL"}
                        t={t}
                    />
                    {hasFullBracket && (
                        <WorldCupBracket
                            format={format}
                            matches={matches}
                            slotByEventId={slotByEventId}
                            predictionsByEventId={predictionsByEventId}
                            candidatePairs={candidatePairs}
                            currentMatchId={currentMatch.event_id}
                            t={t}
                        />
                    )}
                </div>
                <KnockoutRoundsList
                    rounds={rounds}
                    currentMatchId={currentMatch.event_id}
                    predictionsByEventId={predictionsByEventId}
                    candidatePairs={candidatePairs}
                    t={t}
                />
            </div>
        </section>
    );
}
export default function TournamentContext({ matches, slotByEventId, format, currentMatch, competitionSlug, predictionMatches, t }: TournamentContextProps) {
    const teamIds = buildTeamIds(matches);
    const predictionsByEventId = predictionMap(predictionMatches);
    const displayMatches = matches.map((match) => resolveDisplayMatch(match, predictionsByEventId, teamIds));
    const displayCurrentMatch = resolveDisplayMatch(currentMatch, predictionsByEventId, teamIds);
    const displayHomeTeamId = displayCurrentMatch.home_team_id;
    const displayAwayTeamId = displayCurrentMatch.away_team_id;
    const groupStageEventIds = buildGroupStageEventIds(displayMatches, format);
    const knockoutRounds = buildWorldCupKnockoutRounds(displayMatches, format);
    const knockoutMatches = knockoutRounds.flatMap((round) => round.matches);
    const currentIsKnockout = knockoutMatches.some((match) => match.event_id === displayCurrentMatch.event_id);
    const currentGroup = !currentIsKnockout && groupStageEventIds.has(displayCurrentMatch.event_id)
        ? resolveCurrentGroup(displayMatches, groupStageEventIds, displayHomeTeamId, displayAwayTeamId)
        : null;

    if (currentGroup) {
        return (
            <GroupStageSection
                group={currentGroup}
                homeTeamId={displayHomeTeamId}
                awayTeamId={displayAwayTeamId}
                competitionSlug={competitionSlug}
                currentMatchId={displayCurrentMatch.event_id}
                predictionsByEventId={predictionsByEventId}
                t={t}
            />
        );
    }

    if (knockoutMatches.length === 0) return null;

    return (
        <KnockoutSection
            matches={knockoutMatches}
            slotByEventId={slotByEventId}
            currentMatch={displayCurrentMatch}
            predictionsByEventId={predictionsByEventId}
            format={format}
            rounds={knockoutRounds}
            t={t}
        />
    );
}
