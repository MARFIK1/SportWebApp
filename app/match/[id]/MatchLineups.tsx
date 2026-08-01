"use client";

import { CheckBadgeIcon, StarIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import TeamLogo from "@/app/components/common/TeamLogo";
import { useLanguage } from "@/app/components/common/LanguageProvider";
import type { MatchLineupPlayer, MatchLineupSide, MatchLineupSnapshot } from "@/types/matchLineups";
import { formationRows, lineupPlayerLabel } from "./lineupLayout";

interface MatchLineupsProps {
    snapshot: MatchLineupSnapshot;
    homeTeam: string;
    awayTeam: string;
    homeTeamId: number;
    awayTeamId: number;
}

interface TeamDetails {
    name: string;
    id: number;
}

function PlayerMarker({
    player,
    highlighted,
}: {
    player: MatchLineupPlayer;
    highlighted: boolean;
}) {
    const label = lineupPlayerLabel(player);
    const jersey = player.jersey_number || "-";

    return (
        <div className="flex min-w-0 max-w-[88px] flex-1 flex-col items-center" title={player.name}>
            <span
                className={"relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-black tabular-nums shadow-md " + (
                    highlighted
                        ? "border-amber-300 bg-amber-300 text-gray-950"
                        : "border-white/80 bg-gray-950 text-white"
                )}
            >
                {jersey}
                {player.captain && (
                    <span className="absolute -right-2 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-gray-950 bg-sky-400 text-[8px] font-black text-gray-950">
                        C
                    </span>
                )}
            </span>
            <span className="mt-1 w-full truncate text-center text-[10px] font-bold text-white">
                {label}
            </span>
            {player.rating != null && (
                <span className={"mt-0.5 rounded px-1 py-px text-[9px] font-black tabular-nums " + (
                    highlighted ? "bg-amber-300 text-gray-950" : "bg-gray-950/80 text-emerald-300"
                )}>
                    {player.rating.toFixed(1)}
                </span>
            )}
        </div>
    );
}

function FormationPitch({
    lineup,
    team,
    highlightedPlayerId,
}: {
    lineup: MatchLineupSide;
    team: TeamDetails;
    highlightedPlayerId?: number;
}) {
    const { t } = useLanguage();
    const rows = formationRows(lineup.starters, lineup.formation);

    return (
        <div className="mx-auto w-full min-w-0 max-w-[520px]">
            <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <TeamLogo
                        teamId={team.id}
                        alt={team.name}
                        size={28}
                        className="h-7 w-7 shrink-0 object-contain"
                    />
                    <span className="truncate text-sm font-bold text-gray-100" title={team.name}>
                        {team.name}
                    </span>
                </div>
                <span className="shrink-0 rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold uppercase text-emerald-300">
                    {t("formation")} {lineup.formation || "-"}
                </span>
            </div>

            <div className="relative aspect-[4/5] min-h-[390px] overflow-hidden rounded-lg border border-emerald-200/30 bg-[#174c3c] p-3 sm:p-4">
                <div className="pointer-events-none absolute inset-3 rounded border border-white/25" />
                <div className="pointer-events-none absolute left-3 right-3 top-1/2 border-t border-white/25" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
                <div className="pointer-events-none absolute left-1/2 top-3 h-16 w-28 -translate-x-1/2 border border-t-0 border-white/25" />
                <div className="pointer-events-none absolute bottom-3 left-1/2 h-16 w-28 -translate-x-1/2 border border-b-0 border-white/25" />

                <div className="relative z-10 flex h-full flex-col-reverse justify-between py-3">
                    {rows.map((row, rowIndex) => (
                        <div
                            key={team.id + "-" + rowIndex}
                            className="flex min-h-[54px] items-center justify-around gap-1"
                        >
                            {row.map((player, playerIndex) => (
                                <PlayerMarker
                                    key={player.id ?? player.name + "-" + playerIndex}
                                    player={player}
                                    highlighted={player.id != null && player.id === highlightedPlayerId}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function SubstituteList({
    lineup,
    team,
}: {
    lineup: MatchLineupSide;
    team: TeamDetails;
}) {
    const { t } = useLanguage();

    if (lineup.substitutes.length === 0) return null;

    return (
        <div className="min-w-0">
            <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
                <TeamLogo
                    teamId={team.id}
                    alt={team.name}
                    size={22}
                    className="h-[22px] w-[22px] shrink-0 object-contain"
                />
                <h3 className="truncate text-xs font-bold uppercase text-gray-400">
                    {team.name} {"\u2022"} {t("substitutes")}
                </h3>
            </div>
            <ul className="mt-2 grid gap-x-5 sm:grid-cols-2">
                {lineup.substitutes.map((player, index) => (
                    <li
                        key={player.id ?? player.name + "-" + index}
                        className="flex min-h-9 items-center gap-2 border-b border-gray-800/70 py-1.5 text-xs"
                    >
                        <span className="w-6 shrink-0 text-center font-bold tabular-nums text-gray-500">
                            {player.jersey_number || "-"}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-gray-200" title={player.name}>
                            {player.name}
                        </span>
                        {player.rating != null && (
                            <span className="shrink-0 font-bold tabular-nums text-emerald-300">
                                {player.rating.toFixed(1)}
                            </span>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default function MatchLineups({
    snapshot,
    homeTeam,
    awayTeam,
    homeTeamId,
    awayTeamId,
}: MatchLineupsProps) {
    const { t } = useLanguage();
    const home = { name: homeTeam, id: homeTeamId };
    const away = { name: awayTeam, id: awayTeamId };
    const topRated = snapshot.top_rated_player;
    const topRatedTeam = topRated?.team_side === "home" ? homeTeam : awayTeam;
    const hasSubstitutes = snapshot.home.substitutes.length > 0 || snapshot.away.substitutes.length > 0;

    return (
        <section className="mb-6 overflow-hidden rounded-2xl border border-gray-800 bg-white dark:bg-gray-900/50">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 px-4 py-4 sm:px-6">
                <div>
                    <div className="flex items-center gap-2">
                        <UserGroupIcon aria-hidden="true" className="h-5 w-5 text-emerald-400" />
                        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">
                            {t("match_lineups")}
                        </h2>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{t("match_lineups_hint")}</p>
                </div>
                <span className={"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase " + (
                    snapshot.confirmed
                        ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                        : "border-gray-600 bg-gray-800 text-gray-300"
                )}>
                    <CheckBadgeIcon aria-hidden="true" className="h-4 w-4" />
                    {t(snapshot.confirmed ? "confirmed_lineups" : "provisional_lineups")}
                </span>
            </div>

            {topRated && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300/20 bg-amber-300/[0.06] px-4 py-3 sm:px-6">
                    <div className="flex min-w-0 items-center gap-2">
                        <StarIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-300" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase text-amber-300">{t("top_rated_player")}</p>
                            <p className="truncate text-sm font-bold text-gray-100">
                                {topRated.name} <span className="font-medium text-gray-500">{"\u2022"} {topRatedTeam}</span>
                            </p>
                        </div>
                    </div>
                    <span className="rounded bg-amber-300 px-2 py-1 text-sm font-black tabular-nums text-gray-950">
                        {topRated.rating?.toFixed(1)}
                    </span>
                </div>
            )}

            <div className="grid gap-6 p-4 sm:p-6 2xl:grid-cols-2">
                <FormationPitch
                    lineup={snapshot.home}
                    team={home}
                    highlightedPlayerId={topRated?.team_side === "home" ? topRated.id : undefined}
                />
                <FormationPitch
                    lineup={snapshot.away}
                    team={away}
                    highlightedPlayerId={topRated?.team_side === "away" ? topRated.id : undefined}
                />
            </div>

            {hasSubstitutes && (
                <div className="grid gap-6 border-t border-gray-800 px-4 py-5 sm:px-6 2xl:grid-cols-2">
                    <SubstituteList lineup={snapshot.home} team={home} />
                    <SubstituteList lineup={snapshot.away} team={away} />
                </div>
            )}

            <p className="border-t border-gray-800 px-4 py-3 text-[10px] text-gray-500 sm:px-6">
                {t("timeline_snapshot")}: {snapshot.updated_at}
            </p>
        </section>
    );
}
