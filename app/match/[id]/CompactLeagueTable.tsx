import Link from "next/link";
import TeamLogo from "@/app/components/common/TeamLogo";
import type { StandingRow } from "@/app/util/data/dataService";

interface CompactLeagueTableProps {
    standings: StandingRow[];
    homeTeamId: number;
    awayTeamId: number;
    leagueSlug: string;
    t: (key: string) => string;
}

type StandingZoneKind = "champions" | "europa" | "conference" | "relegation";

interface StandingZoneRule {
    kind: StandingZoneKind;
    from?: number;
    to?: number;
    bottomCount?: number;
}

interface StandingZone {
    kind: StandingZoneKind;
    from: number;
    to: number;
}

const LEAGUE_ZONE_RULES: Record<string, StandingZoneRule[]> = {
    "england-premier-league": [
        { kind: "champions", from: 1, to: 5 },
        { kind: "europa", from: 6, to: 6 },
        { kind: "conference", from: 7, to: 7 },
        { kind: "relegation", bottomCount: 3 },
    ],
    "spain-la-liga": [
        { kind: "champions", from: 1, to: 4 },
        { kind: "europa", from: 5, to: 5 },
        { kind: "conference", from: 6, to: 6 },
        { kind: "relegation", bottomCount: 3 },
    ],
    "italy-serie-a": [
        { kind: "champions", from: 1, to: 4 },
        { kind: "europa", from: 5, to: 5 },
        { kind: "conference", from: 6, to: 6 },
        { kind: "relegation", bottomCount: 3 },
    ],
    "germany-bundesliga": [
        { kind: "champions", from: 1, to: 4 },
        { kind: "europa", from: 5, to: 5 },
        { kind: "conference", from: 6, to: 6 },
        { kind: "relegation", bottomCount: 2 },
    ],
    "france-ligue-1": [
        { kind: "champions", from: 1, to: 3 },
        { kind: "europa", from: 4, to: 4 },
        { kind: "conference", from: 5, to: 5 },
        { kind: "relegation", bottomCount: 2 },
    ],
    "netherlands-eredivisie": [
        { kind: "champions", from: 1, to: 2 },
        { kind: "europa", from: 3, to: 3 },
        { kind: "conference", from: 4, to: 4 },
        { kind: "relegation", bottomCount: 2 },
    ],
    "portugal-primeira-liga": [
        { kind: "champions", from: 1, to: 2 },
        { kind: "europa", from: 3, to: 3 },
        { kind: "conference", from: 4, to: 4 },
        { kind: "relegation", bottomCount: 2 },
    ],
    "poland-ekstraklasa": [
        { kind: "champions", from: 1, to: 1 },
        { kind: "conference", from: 2, to: 3 },
        { kind: "relegation", bottomCount: 3 },
    ],
};

function getStandingZones(leagueSlug: string, teamsCount: number): StandingZone[] {
    const rules = LEAGUE_ZONE_RULES[leagueSlug] ?? [];
    return rules
        .map((rule) => {
            const from = rule.bottomCount ? Math.max(1, teamsCount - rule.bottomCount + 1) : rule.from;
            const to = rule.bottomCount ? teamsCount : rule.to ?? rule.from;
            if (!from || !to || from > to) return null;
            return { kind: rule.kind, from, to };
        })
        .filter((zone): zone is StandingZone => zone !== null);
}

function getPositionZone(position: number, zones: StandingZone[]): StandingZone | undefined {
    return zones.find((zone) => position >= zone.from && position <= zone.to);
}

function zoneLabel(kind: StandingZoneKind, t: (key: string) => string): string {
    if (kind === "champions") return t("zone_champions_league");
    if (kind === "europa") return t("zone_europa_league");
    if (kind === "conference") return t("zone_conference_league");
    return t("zone_relegation");
}

function zoneColor(kind: StandingZoneKind): string {
    if (kind === "champions") return "bg-emerald-500";
    if (kind === "europa") return "bg-blue-500";
    if (kind === "conference") return "bg-cyan-400";
    return "bg-red-500";
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

function positionStyle(position: number, zones: StandingZone[]): string {
    const zone = getPositionZone(position, zones);
    if (zone) return `${zoneColor(zone.kind)} text-white`;
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
    t,
}: CompactLeagueTableProps) {
    if (standings.length === 0) return null;
    const zones = getStandingZones(leagueSlug, standings.length);

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
                                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${positionStyle(row.position, zones)}`}>
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

            {zones.length > 0 && (
                <div className="mt-4 grid gap-2 border-t border-gray-200 pt-4 dark:border-white/10 sm:grid-cols-2">
                    {zones.map((zone) => (
                        <div key={`${zone.kind}-${zone.from}-${zone.to}`} className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${zoneColor(zone.kind)}`} />
                            <span>{zoneLabel(zone.kind, t)}</span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
