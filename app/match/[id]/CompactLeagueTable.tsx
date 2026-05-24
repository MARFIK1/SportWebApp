import Link from "next/link";
import TeamLogo from "@/app/components/common/TeamLogo";
import type { StandingRow } from "@/app/util/data/dataService";
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

export default function CompactLeagueTable({
    standings,
    homeTeamId,
    awayTeamId,
    leagueSlug,
    season,
    t,
}: CompactLeagueTableProps) {
    if (standings.length === 0) return null;
    const zones = getStandingZones(leagueSlug, standings.length, season);
    const teamZones = getStandingTeamZones(leagueSlug, season);
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
        </section>
    );
}
