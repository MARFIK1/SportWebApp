import Link from "next/link";
import TeamLogo from "@/app/components/common/TeamLogo";
import { computeStandings, type StandingRow } from "@/app/util/data/dataService";
import { resolveSofascoreMatchResult } from "@/app/util/predictions/matchResult";
import type { SofascoreMatch } from "@/types/sofascore";
import type { PredictionMatch } from "@/types/predictions";

interface TournamentContextProps {
    matches: SofascoreMatch[];
    currentMatch: SofascoreMatch;
    competitionSlug: string;
    predictionMatches?: PredictionMatch[];
    t: (key: string) => string;
}

interface TournamentGroup {
    letter: string;
    teamIds: number[];
    teamNames: Map<number, string>;
    matches: SofascoreMatch[];
}

const GROUP_STAGE_ROUNDS = new Set([1, 2, 3]);
const GROUP_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const KNOCKOUT_ROUNDS = [
    { round: 6, labelKey: "round_of_32" },
    { round: 5, labelKey: "round_of_16" },
    { round: 27, labelKey: "quarter_finals" },
    { round: 28, labelKey: "semi_finals" },
    { round: 50, labelKey: "third_place" },
    { round: 29, labelKey: "final" },
];

const PLACEHOLDER_TEAM_RE = /^(?:[12][A-Z]|[GH][12]|[WL]\d+|3[A-Z](?:\/3[A-Z])+)$/;

function validTeamId(teamId: number): boolean {
    return Number.isFinite(teamId) && teamId > 0;
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

function isGroupStageMatch(match: SofascoreMatch): boolean {
    return GROUP_STAGE_ROUNDS.has(Number(match.round)) && validTeamId(match.home_team_id) && validTeamId(match.away_team_id);
}

function sortMatches(a: SofascoreMatch, b: SofascoreMatch): number {
    const dateCompare = String(a.date ?? "").localeCompare(String(b.date ?? ""));
    if (dateCompare !== 0) return dateCompare;
    return a.event_id - b.event_id;
}

function detectTournamentGroups(matches: SofascoreMatch[]): TournamentGroup[] {
    const groupMatches = matches.filter(isGroupStageMatch);
    if (groupMatches.length === 0) return [];

    const parent = new Map<number, number>();
    const teamNames = new Map<number, string>();

    function find(teamId: number): number {
        const currentParent = parent.get(teamId);
        if (currentParent == null) {
            parent.set(teamId, teamId);
            return teamId;
        }
        if (currentParent === teamId) return teamId;
        const root = find(currentParent);
        parent.set(teamId, root);
        return root;
    }

    function union(a: number, b: number) {
        const rootA = find(a);
        const rootB = find(b);
        if (rootA !== rootB) parent.set(rootB, rootA);
    }

    for (const match of groupMatches) {
        parent.set(match.home_team_id, parent.get(match.home_team_id) ?? match.home_team_id);
        parent.set(match.away_team_id, parent.get(match.away_team_id) ?? match.away_team_id);
        teamNames.set(match.home_team_id, match.home_team);
        teamNames.set(match.away_team_id, match.away_team);
        union(match.home_team_id, match.away_team_id);
    }

    const teamGroups = new Map<number, Set<number>>();
    for (const teamId of parent.keys()) {
        const root = find(teamId);
        const group = teamGroups.get(root) ?? new Set<number>();
        group.add(teamId);
        teamGroups.set(root, group);
    }

    return Array.from(teamGroups.values())
        .map((teamSet) => {
            const ids = Array.from(teamSet);
            const groupSet = new Set(ids);
            const groupMatchList = groupMatches
                .filter((match) => groupSet.has(match.home_team_id) && groupSet.has(match.away_team_id))
                .sort(sortMatches);
            return { ids, matches: groupMatchList };
        })
        .filter((group) => group.ids.length >= 3 && group.matches.length > 0)
        .sort((a, b) => sortMatches(a.matches[0], b.matches[0]))
        .map((group, index) => ({
            letter: GROUP_LETTERS[index] ?? String(index + 1),
            teamIds: group.ids.sort((a, b) => (teamNames.get(a) ?? "").localeCompare(teamNames.get(b) ?? "")),
            teamNames,
            matches: group.matches,
        }));
}

function resolveCurrentGroup(matches: SofascoreMatch[], homeTeamId: number, awayTeamId: number): TournamentGroup | null {
    return detectTournamentGroups(matches).find((group) =>
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
    if (row.teamId === homeTeamId) return "border-emerald-400/65 bg-emerald-500/15";
    if (row.teamId === awayTeamId) return "border-blue-400/65 bg-blue-500/15";
    return "border-white/10 bg-gray-950/25";
}

function formatMatchScore(match: SofascoreMatch, t: (key: string) => string): string {
    const result = resolveSofascoreMatchResult(match, null);
    if (match.status === "finished" && result.regularScore) {
        const base = `${result.regularScore.home} - ${result.regularScore.away}`;
        if (result.penaltyScore) {
            return `${base} (${t("penalties")} ${result.penaltyScore.home} - ${result.penaltyScore.away})`;
        }
        return base;
    }
    if (match.status === "postponed") return t("postponed");
    return "vs";
}

function isPlaceholderTeam(name: string): boolean {
    return PLACEHOLDER_TEAM_RE.test(name.trim());
}

function TeamMark({ teamId, teamName, align = "left" }: { teamId: number; teamName: string; align?: "left" | "right" }) {
    const placeholder = isPlaceholderTeam(teamName);
    return (
        <div className={`flex min-w-0 items-center gap-2 ${align === "right" ? "justify-end text-right" : ""}`}>
            {align === "right" && <span className="truncate text-xs font-black text-gray-900 dark:text-white">{teamName}</span>}
            {placeholder ? (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 bg-gray-800 text-[9px] font-black text-gray-300">
                    {teamName.slice(0, 3)}
                </span>
            ) : (
                <TeamLogo
                    teamId={teamId}
                    alt={teamName}
                    size={24}
                    className="h-6 w-6 shrink-0 object-contain"
                />
            )}
            {align === "left" && <span className="truncate text-xs font-black text-gray-900 dark:text-white">{teamName}</span>}
        </div>
    );
}

function GroupStandingsCard({
    group,
    homeTeamId,
    awayTeamId,
    competitionSlug,
    currentMatchId,
    t,
}: {
    group: TournamentGroup;
    homeTeamId: number;
    awayTeamId: number;
    competitionSlug: string;
    currentMatchId: number;
    t: (key: string) => string;
}) {
    const standings = buildGroupStandings(group);

    return (
        <section className="rounded-2xl bg-white p-4 dark:bg-gray-900/50 sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t("group_standings")}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t("group_context_hint")}
                    </p>
                </div>
                <Link
                    href={`/league/${competitionSlug}`}
                    prefetch={false}
                    className="shrink-0 rounded-lg border border-emerald-500/40 px-2.5 py-1.5 text-xs font-bold text-emerald-500 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
                >
                    {t("view_full_table")}
                </Link>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-lg font-black text-gray-900 dark:text-white">
                        {t("group")} {group.letter}
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-500 dark:text-emerald-300">
                        {t("group_standings")}
                    </div>
                </div>
                <span className="rounded-full border border-white/10 bg-gray-950/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                    {group.matches.length} {t("matches_count")}
                </span>
            </div>

            <div className="overflow-x-auto pb-1">
                <div className="min-w-[560px]">
                    <div className="grid grid-cols-[2rem_minmax(9.5rem,1fr)_2rem_4rem_2.6rem_4.3rem_2.8rem] gap-2 px-1.5 pb-2 text-[10px] font-black uppercase tracking-[0.08em] text-gray-500 dark:text-gray-500">
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
                                    className={`grid grid-cols-[2rem_minmax(9.5rem,1fr)_2rem_4rem_2.6rem_4.3rem_2.8rem] items-center gap-2 rounded-lg border px-1.5 py-1.5 text-xs ${rowStyle(row, homeTeamId, awayTeamId)}`}
                                >
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-black text-gray-800 dark:bg-gray-700 dark:text-white">
                                        {row.position}
                                    </span>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <TeamLogo
                                            teamId={row.teamId}
                                            alt={row.teamName}
                                            size={22}
                                            className="h-5 w-5 shrink-0 object-contain"
                                        />
                                        <div className="min-w-0">
                                            <div className="truncate font-bold text-gray-900 dark:text-white">
                                                {row.teamName}
                                            </div>
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
                                    <span className="text-right text-sm font-black text-gray-900 dark:text-white">
                                        {row.points}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="mt-5 border-t border-gray-200 pt-4 dark:border-white/10">
                <div className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                    {t("group_fixtures")}
                </div>
                <div className="space-y-2">
                    {group.matches.map((match) => {
                        const isCurrent = match.event_id === currentMatchId;
                        return (
                            <Link
                                key={match.event_id}
                                href={`/match/${match.event_id}?date=${match.date.slice(0, 10)}`}
                                prefetch={false}
                                className={`rounded-lg border p-2.5 transition-colors ${isCurrent ? "border-emerald-400/70 bg-emerald-500/15" : "border-white/10 bg-gray-950/25 hover:border-emerald-400/40 hover:bg-emerald-500/10"}`}
                            >
                                <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                                    <span>{match.date.slice(5, 10)}</span>
                                    {isCurrent && <span className="text-emerald-500 dark:text-emerald-300">{t("current_match")}</span>}
                                </div>
                                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                                    <TeamMark teamId={match.home_team_id} teamName={match.home_team} />
                                    <span className="rounded-md bg-gray-950/65 px-2 py-1 text-center text-xs font-black text-white">
                                        {formatMatchScore(match, t)}
                                    </span>
                                    <TeamMark teamId={match.away_team_id} teamName={match.away_team} align="right" />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

type KnockoutRound = (typeof KNOCKOUT_ROUNDS)[number] & { matches: SofascoreMatch[] };

function TeamIcon({ teamId, teamName, size = 24 }: { teamId: number; teamName: string; size?: number }) {
    if (isPlaceholderTeam(teamName)) {
        return (
            <span
                className="flex shrink-0 items-center justify-center rounded-full border border-white/15 bg-gray-700 text-[9px] font-black text-gray-200"
                style={{ width: size, height: size }}
            >
                {teamName.slice(0, 3)}
            </span>
        );
    }

    return (
        <TeamLogo
            teamId={teamId}
            alt={teamName}
            size={size}
            className="shrink-0 object-contain"
            style={{ width: size, height: size }}
        />
    );
}

function shortTeamName(teamName: string): string {
    if (teamName.length <= 11) return teamName;
    return teamName
        .replace("Bosnia & Herzegovina", "Bosnia")
        .replace("Cote d'Ivoire", "C. d'Ivoire")
        .replace("South Africa", "S. Africa")
        .replace("New Zealand", "N. Zealand");
}

function FeaturedKnockoutMatch({
    match,
    roundLabel,
    t,
}: {
    match: SofascoreMatch;
    roundLabel: string;
    t: (key: string) => string;
}) {
    return (
        <Link
            href={`/match/${match.event_id}?date=${match.date.slice(0, 10)}`}
            prefetch={false}
            className="block overflow-hidden rounded-2xl border border-emerald-400/60 bg-emerald-500/15 p-4 transition-colors hover:bg-emerald-500/20"
        >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300">
                    {t("current_match")}
                </span>
                <span className="rounded-full border border-emerald-300/30 bg-gray-950/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100">
                    {roundLabel}
                </span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                <div className="flex min-w-0 flex-col items-center gap-2 text-center">
                    <TeamIcon teamId={match.home_team_id} teamName={match.home_team} size={40} />
                    <span className="max-w-full truncate text-sm font-black text-white">
                        {shortTeamName(match.home_team)}
                    </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <span className="rounded-xl bg-gray-950 px-3 py-2 text-sm font-black text-white">
                        {formatMatchScore(match, t)}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400">
                        {match.date.slice(5, 10)}
                    </span>
                </div>
                <div className="flex min-w-0 flex-col items-center gap-2 text-center">
                    <TeamIcon teamId={match.away_team_id} teamName={match.away_team} size={40} />
                    <span className="max-w-full truncate text-sm font-black text-white">
                        {shortTeamName(match.away_team)}
                    </span>
                </div>
            </div>
        </Link>
    );
}

function KnockoutMatchRow({
    match,
    isCurrent,
    t,
}: {
    match: SofascoreMatch;
    isCurrent: boolean;
    t: (key: string) => string;
}) {
    return (
        <Link
            href={`/match/${match.event_id}?date=${match.date.slice(0, 10)}`}
            prefetch={false}
            className={`block rounded-xl border p-3 transition-colors ${isCurrent ? "border-emerald-400/70 bg-emerald-500/15" : "border-white/10 bg-gray-950/35 hover:border-emerald-400/40 hover:bg-emerald-500/10"}`}
        >
            <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-gray-500 dark:text-gray-400">
                <span>{match.date.slice(5, 10)}</span>
                {isCurrent && <span className="text-emerald-300">{t("current_match")}</span>}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] items-center gap-2">
                <TeamMark teamId={match.home_team_id} teamName={match.home_team} />
                <span className="rounded-lg bg-gray-950 px-2 py-1.5 text-center text-[11px] font-black text-white">
                    {formatMatchScore(match, t)}
                </span>
                <TeamMark teamId={match.away_team_id} teamName={match.away_team} align="right" />
            </div>
        </Link>
    );
}

function RoundPathSummary({
    rounds,
    currentRoundIndex,
    currentMatchId,
    t,
}: {
    rounds: KnockoutRound[];
    currentRoundIndex: number;
    currentMatchId: number;
    t: (key: string) => string;
}) {
    return (
        <div className="space-y-3">
            {rounds.map((round, index) => {
                const isActiveRound = index === currentRoundIndex;
                const isPastRound = index < currentRoundIndex;
                const currentInRound = round.matches.find((match) => match.event_id === currentMatchId);
                const sampleMatch = currentInRound ?? round.matches[0];

                return (
                    <div key={round.round} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
                        <div className="flex flex-col items-center">
                            <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-black ${isActiveRound ? "border-emerald-300 bg-emerald-400 text-gray-950" : isPastRound ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300" : "border-white/15 bg-gray-800 text-gray-400"}`}>
                                {index + 1}
                            </span>
                            {index < rounds.length - 1 && (
                                <span className={`mt-1 h-full min-h-8 w-px ${isPastRound || isActiveRound ? "bg-emerald-400/35" : "bg-white/10"}`} />
                            )}
                        </div>
                        <div className={`min-w-0 rounded-2xl border p-3 ${isActiveRound ? "border-emerald-400/60 bg-emerald-500/10" : "border-white/10 bg-gray-950/25"}`}>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                                    {t(round.labelKey)}
                                </span>
                                <span className="rounded-full bg-gray-950/70 px-2 py-0.5 text-[10px] font-black text-gray-300">
                                    {round.matches.length}
                                </span>
                            </div>
                            {sampleMatch ? (
                                <KnockoutMatchRow
                                    match={sampleMatch}
                                    isCurrent={sampleMatch.event_id === currentMatchId}
                                    t={t}
                                />
                            ) : null}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function KnockoutBracket({
    matches,
    currentMatchId,
    t,
}: {
    matches: SofascoreMatch[];
    currentMatchId: number;
    t: (key: string) => string;
}) {
    const rounds: KnockoutRound[] = KNOCKOUT_ROUNDS.map((round) => ({
        ...round,
        matches: matches.filter((match) => Number(match.round) === round.round).sort(sortMatches),
    })).filter((round) => round.matches.length > 0);

    if (rounds.length === 0) return null;

    const rawCurrentRoundIndex = rounds.findIndex((round) => round.matches.some((match) => match.event_id === currentMatchId));
    const currentRoundIndex = rawCurrentRoundIndex >= 0 ? rawCurrentRoundIndex : 0;
    const currentRound = rounds[currentRoundIndex] ?? rounds[0];
    const currentRoundMatch = currentRound.matches.find((match) => match.event_id === currentMatchId) ?? currentRound.matches[0];

    return (
        <section className="rounded-2xl bg-white p-4 dark:bg-gray-900/50 sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t("knockout_bracket")}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t("knockout_bracket_hint")}
                    </p>
                </div>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-400">
                    {t(currentRound.labelKey)}
                </span>
            </div>

            <div className="space-y-4">
                {currentRoundMatch && (
                    <FeaturedKnockoutMatch
                        match={currentRoundMatch}
                        roundLabel={t(currentRound.labelKey)}
                        t={t}
                    />
                )}
                <RoundPathSummary
                    rounds={rounds}
                    currentRoundIndex={currentRoundIndex}
                    currentMatchId={currentMatchId}
                    t={t}
                />
            </div>
        </section>
    );
}
export default function TournamentContext({
    matches,
    currentMatch,
    competitionSlug,
    predictionMatches,
    t,
}: TournamentContextProps) {
    const teamIds = buildTeamIds(matches);
    const predictionsByEventId = predictionMap(predictionMatches);
    const displayMatches = matches.map((match) => resolveDisplayMatch(match, predictionsByEventId, teamIds));
    const displayCurrentMatch = resolveDisplayMatch(currentMatch, predictionsByEventId, teamIds);
    const displayHomeTeamId = displayCurrentMatch.home_team_id;
    const displayAwayTeamId = displayCurrentMatch.away_team_id;
    const currentRound = Number(displayCurrentMatch.round);
    const currentGroup = GROUP_STAGE_ROUNDS.has(currentRound)
        ? resolveCurrentGroup(displayMatches, displayHomeTeamId, displayAwayTeamId)
        : null;
    const knockoutMatches = displayMatches.filter((match) => KNOCKOUT_ROUNDS.some((round) => round.round === Number(match.round)));

    if (currentGroup) {
        return (
            <GroupStandingsCard
                group={currentGroup}
                homeTeamId={displayHomeTeamId}
                awayTeamId={displayAwayTeamId}
                competitionSlug={competitionSlug}
                currentMatchId={displayCurrentMatch.event_id}
                t={t}
            />
        );
    }

    if (knockoutMatches.length === 0) return null;

    return <KnockoutBracket matches={knockoutMatches} currentMatchId={displayCurrentMatch.event_id} t={t} />;
}
