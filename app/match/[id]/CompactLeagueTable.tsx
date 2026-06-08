import Link from "next/link";
import TeamLogo from "@/app/components/common/TeamLogo";
import { resolveSofascoreMatchResult } from "@/app/util/predictions/matchResult";
import type { StandingRow } from "@/app/util/data/dataService";
import type { SofascoreMatch } from "@/types/sofascore";
import {
    getPositionZone,
    getStandingZones,
    getStandingTeamZones,
    getTeamStandingZone,
    standingZoneColor,
    standingZoneLabelKey,
    type StandingZone,
    type StandingZoneKind,
    type StandingTeamZoneRule,
} from "@/app/util/league/leagueRules";

interface CompactLeagueTableProps {
    standings: StandingRow[];
    homeTeamId: number;
    awayTeamId: number;
    leagueSlug: string;
    season?: string;
    playoffMatches?: SofascoreMatch[];
    regularTeamIds?: Set<number>;
    currentMatchId?: number;
    t: (key: string) => string;
}

function zoneLabel(kind: StandingZoneKind, t: (key: string) => string): string {
    return t(standingZoneLabelKey(kind));
}

function zoneColor(kind: StandingZoneKind): string {
    return standingZoneColor(kind);
}

function rowStyle(row: StandingRow, homeTeamId: number, awayTeamId: number): string {
    if (row.teamId === homeTeamId) {
        return "border-emerald-400/60 bg-emerald-500/15";
    }
    if (row.teamId === awayTeamId) {
        return "border-blue-400/60 bg-blue-500/15";
    }
    return "border-transparent bg-gray-100/70 dark:bg-gray-800/55";
}

const ZONE_PRIORITY: Record<StandingZoneKind, number> = {
    champions: 5,
    europa: 4,
    conference: 3,
    relegationPlayoff: 2,
    relegation: 1,
};

function resolveRowZone(row: StandingRow, zones: StandingZone[], teamZones: StandingTeamZoneRule[]): StandingZoneKind | undefined {
    const positionZone = getPositionZone(row.position, zones)?.kind;
    const teamZone = getTeamStandingZone(row.teamId, row.teamName, teamZones)?.kind;

    if (!positionZone) return teamZone;
    if (!teamZone) return positionZone;
    return ZONE_PRIORITY[teamZone] > ZONE_PRIORITY[positionZone] ? teamZone : positionZone;
}

function positionStyle(row: StandingRow, zones: StandingZone[], teamZones: StandingTeamZoneRule[]): string {
    const zoneKind = resolveRowZone(row, zones, teamZones);
    if (zoneKind) return `${zoneColor(zoneKind)} text-white`;
    return "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-white";
}

function formStyle(result: string): string {
    if (result === "W") return "bg-emerald-500 text-gray-950";
    if (result === "D") return "bg-gray-400 text-gray-950";
    return "bg-red-500 text-gray-950";
}

function formatGoalDifference(value: number): string {
    if (value > 0) return `+${value}`;
    return String(value);
}

function teamRoleLabel(teamId: number, regularTeamIds: Set<number> | undefined, t: (key: string) => string): string {
    if (!regularTeamIds || regularTeamIds.has(teamId)) return t("regular_table_team");
    return t("playoff_opponent");
}

function formatPlayoffResult(match: SofascoreMatch, t: (key: string) => string): string {
    const result = resolveSofascoreMatchResult(match, null);
    if (match.status === "finished" && result.regularScore) {
        const base = `${result.regularScore.home} - ${result.regularScore.away}`;
        if (result.penaltyScore) {
            return `${base} (${t("penalties")} ${result.penaltyScore.home} - ${result.penaltyScore.away})`;
        }
        return base;
    }
    if (match.status === "postponed") return t("postponed");
    return t("not_started");
}

function matchPairKey(match: SofascoreMatch): string {
    return [match.home_team_id, match.away_team_id].sort((a, b) => a - b).join("-");
}

function resolvePlayoffContext(
    playoffMatches: SofascoreMatch[] | undefined,
    regularTeamIds: Set<number> | undefined,
    homeTeamId: number,
    awayTeamId: number,
    currentMatchId: number | undefined
): SofascoreMatch[] {
    if (!playoffMatches || playoffMatches.length === 0) return [];

    const currentIsPlayoff = currentMatchId != null && playoffMatches.some((match) => match.event_id === currentMatchId);
    const hasTableOutlier = regularTeamIds ? !regularTeamIds.has(homeTeamId) || !regularTeamIds.has(awayTeamId) : false;
    if (!currentIsPlayoff && !hasTableOutlier) return [];

    const currentPairKey = [homeTeamId, awayTeamId].sort((a, b) => a - b).join("-");
    const contextMatches = playoffMatches
        .filter((match) => matchPairKey(match) === currentPairKey)
        .sort((a, b) => a.date.localeCompare(b.date));

    return contextMatches.length > 0 ? contextMatches : playoffMatches.filter((match) => match.event_id === currentMatchId);
}

function PlayoffContextCard({
    matches,
    regularTeamIds,
    currentMatchId,
    t,
}: {
    matches: SofascoreMatch[];
    regularTeamIds?: Set<number>;
    currentMatchId?: number;
    t: (key: string) => string;
}) {
    if (matches.length === 0) return null;

    const secondMatch = matches.length > 1 ? matches[1] : null;

    return (
        <div className="mt-4 rounded-xl border border-amber-400/35 bg-amber-500/10 p-3 dark:bg-amber-500/10 sm:p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h4 className="text-xs font-black uppercase tracking-[0.12em] text-amber-400">
                        {t("playoff_context")}
                    </h4>
                    <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                        {t("playoff_context_hint")}
                    </p>
                </div>
                <span className="rounded-full border border-amber-400/35 px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-amber-400">
                    {matches.length > 1 ? t("playoff_tie") : t("special_match")}
                </span>
            </div>

            <div className="space-y-2">
                {matches.map((match, index) => {
                    const isCurrent = match.event_id === currentMatchId;
                    return (
                        <div
                            key={match.event_id}
                            className={`rounded-lg border p-2.5 ${isCurrent ? "border-amber-400/60 bg-amber-400/10" : "border-white/10 bg-gray-900/30"}`}
                        >
                            <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                                <span>{matches.length > 1 ? `${t("leg")} ${index + 1}` : t("match")}</span>
                                <span>{match.date.slice(0, 10)}</span>
                            </div>

                            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                                <div className="min-w-0">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <TeamLogo
                                            teamId={match.home_team_id}
                                            alt={match.home_team}
                                            size={20}
                                            className="h-5 w-5 shrink-0 object-contain"
                                        />
                                        <span className="truncate text-xs font-black text-gray-900 dark:text-white">{match.home_team}</span>
                                    </div>
                                    <div className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.1em] text-gray-500 dark:text-gray-400">
                                        {teamRoleLabel(match.home_team_id, regularTeamIds, t)}
                                    </div>
                                </div>

                                <div className="rounded-md bg-gray-950/65 px-2.5 py-1 text-center text-sm font-black text-white">
                                    {formatPlayoffResult(match, t)}
                                </div>

                                <div className="min-w-0 text-right">
                                    <div className="flex min-w-0 items-center justify-end gap-2">
                                        <span className="truncate text-xs font-black text-gray-900 dark:text-white">{match.away_team}</span>
                                        <TeamLogo
                                            teamId={match.away_team_id}
                                            alt={match.away_team}
                                            size={20}
                                            className="h-5 w-5 shrink-0 object-contain"
                                        />
                                    </div>
                                    <div className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.1em] text-gray-500 dark:text-gray-400">
                                        {teamRoleLabel(match.away_team_id, regularTeamIds, t)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {secondMatch && (
                <p className="mt-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                    {t("playoff_two_leg_hint")}
                </p>
            )}
        </div>
    );
}

export default function CompactLeagueTable({
    standings,
    homeTeamId,
    awayTeamId,
    leagueSlug,
    season,
    playoffMatches,
    regularTeamIds,
    currentMatchId,
    t,
}: CompactLeagueTableProps) {
    if (standings.length === 0) return null;
    const zones = getStandingZones(leagueSlug, standings.length, season);
    const teamZones = getStandingTeamZones(leagueSlug, season);
    const playoffContext = resolvePlayoffContext(playoffMatches, regularTeamIds, homeTeamId, awayTeamId, currentMatchId);
    const legendKinds = Array.from(new Set([
        ...zones.map((zone) => zone.kind),
        ...teamZones.map((zone) => zone.kind),
    ]));

    return (
        <section className="rounded-2xl bg-white p-4 dark:bg-gray-900/50 sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t("league_table")}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t("league_table_context")}
                    </p>
                </div>
                <Link
                    href={`/league/${leagueSlug}`}
                    prefetch={false}
                    className="shrink-0 rounded-lg border border-emerald-500/40 px-2.5 py-1.5 text-xs font-bold text-emerald-500 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
                >
                    {t("view_full_table")}
                </Link>
            </div>

            <div className="overflow-x-auto pb-1">
                <div className="min-w-[620px]">
                    <div className="grid grid-cols-[2rem_minmax(10.5rem,1fr)_1.8rem_1.8rem_1.8rem_1.8rem_2.5rem_3.4rem_5.1rem_2.6rem] gap-2 px-1.5 pb-2 text-[10px] font-black uppercase tracking-[0.08em] text-gray-500 dark:text-gray-500">
                        <span>#</span>
                        <span>{t("team")}</span>
                        <span className="text-center">{t("played_short")}</span>
                        <span className="text-center">{t("wins_short")}</span>
                        <span className="text-center">{t("draws_short")}</span>
                        <span className="text-center">{t("losses_short")}</span>
                        <span className="text-center">{t("gd_short")}</span>
                        <span className="text-center">{t("goals_short")}</span>
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
                                    className={`grid grid-cols-[2rem_minmax(10.5rem,1fr)_1.8rem_1.8rem_1.8rem_1.8rem_2.5rem_3.4rem_5.1rem_2.6rem] items-center gap-2 rounded-lg border px-1.5 py-1.5 text-xs ${rowStyle(row, homeTeamId, awayTeamId)}`}
                                >
                                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${positionStyle(row, zones, teamZones)}`}>
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
                                    <span className="text-center font-semibold text-gray-700 dark:text-gray-200">{row.won}</span>
                                    <span className="text-center font-semibold text-gray-700 dark:text-gray-200">{row.drawn}</span>
                                    <span className="text-center font-semibold text-gray-700 dark:text-gray-200">{row.lost}</span>
                                    <span className={`text-center font-bold ${row.goalDifference >= 0 ? "text-emerald-500 dark:text-emerald-300" : "text-red-500 dark:text-red-300"}`}>
                                        {formatGoalDifference(row.goalDifference)}
                                    </span>
                                    <span className="text-center font-semibold text-gray-700 dark:text-gray-200">
                                        {row.goalsFor}:{row.goalsAgainst}
                                    </span>
                                    <span className="flex justify-center gap-0.5">
                                        {row.form.slice(-5).map((result, index) => (
                                            <span key={`${result}-${index}`} className={`flex h-5 w-4 items-center justify-center rounded-[3px] text-[10px] font-black ${formStyle(result)}`}>
                                                {result}
                                            </span>
                                        ))}
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

            {legendKinds.length > 0 && (
                <div className="mt-4 grid gap-2 border-t border-gray-200 pt-4 dark:border-white/10 sm:grid-cols-2">
                    {legendKinds.map((kind) => (
                        <div key={kind} className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${zoneColor(kind)}`} />
                            <span>{zoneLabel(kind, t)}</span>
                        </div>
                    ))}
                </div>
            )}

            <PlayoffContextCard
                matches={playoffContext}
                regularTeamIds={regularTeamIds}
                currentMatchId={currentMatchId}
                t={t}
            />
        </section>
    );
}
