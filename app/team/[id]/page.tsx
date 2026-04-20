import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getAllCompetitions } from "@/app/util/league/leagueRegistry";
import { findTeamData, getTeamSquad, type PlayerInfo } from "@/app/util/data/dataService";
import type { SofascoreMatch } from "@/types/sofascore";
import { teamLogoUrl, playerImageUrl } from "@/app/util/urls";
import { getServerT } from "@/app/util/i18n/getLocale";

interface PageProps {
    params: { id: string };
}

const POSITION_KEYS: Record<string, string> = {
    G: "goalkeepers",
    D: "defenders",
    M: "midfielders",
    F: "forwards",
};

const POSITION_ORDER = ["G", "D", "M", "F"];

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const teamId = parseInt(params.id, 10);
    if (!Number.isFinite(teamId)) return { title: "Team" };
    const { teamName } = findTeamData(teamId, getAllCompetitions());
    if (!teamName) return { title: "Team" };
    return {
        title: teamName,
        description: `${teamName} - squad, fixtures, recent results, and league standings`,
    };
}

export default async function TeamPage({ params }: PageProps) {
    const teamId = parseInt(params.id, 10);
    const competitions = getAllCompetitions();
    const { teamName, data } = Number.isFinite(teamId)
        ? findTeamData(teamId, competitions)
        : { teamName: "", data: [] };

    const t = await getServerT();

    if (!teamName || data.length === 0) {
        return (
            <div className="flex justify-center items-center min-h-[60vh] text-gray-500 dark:text-gray-400">
                <p className="text-xl">{t("team_not_found")}</p>
            </div>
        );
    }

    const primaryLeague = data.find((d) => d.standing !== null) ?? data[0];
    const standing = primaryLeague.standing;

    const allMatches = data.flatMap((d) => d.matches);
    const uniqueMatches = Array.from(
        allMatches.reduce((map, m) => { map.set(m.event_id, m); return map; }, new Map<number, SofascoreMatch>()).values()
    );

    const finished = uniqueMatches
        .filter((m) => m.status === "finished")
        .sort((a, b) => b.date.localeCompare(a.date));

    const upcoming = uniqueMatches
        .filter((m) => m.status !== "finished" && m.status !== "postponed")
        .sort((a, b) => a.date.localeCompare(b.date));

    const recentMatches = finished.slice(0, 10);
    const nextMatches = upcoming.slice(0, 5);

    const squad = getTeamSquad(teamName, competitions);
    const grouped: Record<string, PlayerInfo[]> = {};
    for (const p of squad) {
        const pos = p.position || "F";
        if (!grouped[pos]) grouped[pos] = [];
        grouped[pos].push(p);
    }

    const form = standing?.form ?? [];

    return (
        <div className="flex flex-col w-full max-w-[1400px] mx-auto px-6 py-8 text-gray-900 dark:text-white">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-8">
                <Link href="/" className="hover:text-gray-900 dark:hover:text-white transition-colors">{t("home")}</Link>
                <span>/</span>
                <span className="text-gray-700 dark:text-gray-300">{teamName}</span>
            </div>

            <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-8 mb-6">
                <div className="flex flex-col items-center gap-4">
                    <Image
                        src={teamLogoUrl(teamId)}
                        alt={teamName}
                        width={100}
                        height={100}
                        className="object-contain"
                        style={{ width: "100px", height: "100px" }}
                    />
                    <h1 className="text-3xl font-bold">{teamName}</h1>
                    {primaryLeague.competition && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                            {primaryLeague.competition.country.toUpperCase()} {"\u2022"} {primaryLeague.competition.name}
                        </span>
                    )}
                </div>

                {standing && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-4 mt-8">
                        <div className="text-center">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{t("rank")}</div>
                            <div className="text-2xl font-bold text-yellow-400">#{standing.position}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{t("played")}</div>
                            <div className="text-2xl font-bold">{standing.played}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{t("wins")}</div>
                            <div className="text-2xl font-bold text-emerald-400">{standing.won}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{t("draws")}</div>
                            <div className="text-2xl font-bold text-yellow-400">{standing.drawn}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{t("losses")}</div>
                            <div className="text-2xl font-bold text-red-400">{standing.lost}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{t("gf_ga")}</div>
                            <div className="text-2xl font-bold">{standing.goalsFor} / {standing.goalsAgainst}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{t("gd")}</div>
                            <div className={`text-2xl font-bold ${standing.goalDifference > 0 ? "text-emerald-400" : standing.goalDifference < 0 ? "text-red-400" : ""}`}>
                                {standing.goalDifference > 0 ? "+" : ""}{standing.goalDifference}
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{t("points")}</div>
                            <div className="text-2xl font-bold text-emerald-400">{standing.points}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{t("form")}</div>
                            <div className="flex gap-1 justify-center mt-1">
                                {form.map((c, i) => (
                                    <span key={i} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                        c === "W" ? "bg-emerald-600" : c === "D" ? "bg-gray-600" : "bg-red-600"
                                    }`}>{c}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1 space-y-6">
                    {nextMatches.length > 0 && (
                        <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-6">
                            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t("upcoming_matches")}</h3>
                            <div className="space-y-2">
                                {nextMatches.map((m) => (
                                    <Link key={m.event_id} href={`/match/${m.event_id}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors">
                                        <div className="flex items-center gap-2 flex-1">
                                            <Image src={teamLogoUrl(m.home_team_id)} alt={m.home_team} width={24} height={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
                                            <span className="text-sm truncate">{m.home_team}</span>
                                        </div>
                                        <span className="text-sm text-gray-400 dark:text-gray-500 px-2">vs</span>
                                        <div className="flex items-center gap-2 flex-1 justify-end">
                                            <span className="text-sm truncate text-right">{m.away_team}</span>
                                            <Image src={teamLogoUrl(m.away_team_id)} alt={m.away_team} width={24} height={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
                                        </div>
                                        <span className="text-xs text-gray-400 dark:text-gray-500 w-20 text-right">{m.date.slice(0, 10)}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-6">
                        <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t("recent_results")}</h3>
                        <div className="space-y-2">
                            {recentMatches.map((m) => {
                                const isHome = m.home_team_id === teamId;
                                const teamScore = isHome ? m.home_score : m.away_score;
                                const opponentScore = isHome ? m.away_score : m.home_score;
                                const won = teamScore !== null && opponentScore !== null && teamScore > opponentScore;
                                const drew = teamScore !== null && opponentScore !== null && teamScore === opponentScore;

                                return (
                                    <Link key={m.event_id} href={`/match/${m.event_id}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors">
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                            won ? "bg-emerald-600" : drew ? "bg-gray-600" : "bg-red-600"
                                        }`}>
                                            {won ? "W" : drew ? "D" : "L"}
                                        </span>
                                        <div className="flex items-center gap-2 flex-1">
                                            <Image src={teamLogoUrl(m.home_team_id)} alt={m.home_team} width={24} height={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
                                            <span className={`text-sm truncate ${isHome ? "font-semibold" : ""}`}>{m.home_team}</span>
                                        </div>
                                        <span className="text-sm font-bold px-2">{m.home_score} - {m.away_score}</span>
                                        <div className="flex items-center gap-2 flex-1 justify-end">
                                            <span className={`text-sm truncate text-right ${!isHome ? "font-semibold" : ""}`}>{m.away_team}</span>
                                            <Image src={teamLogoUrl(m.away_team_id)} alt={m.away_team} width={24} height={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
                                        </div>
                                        <span className="text-xs text-gray-400 dark:text-gray-500 w-20 text-right">{m.date.slice(0, 10)}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {squad.length > 0 && (
                    <div className="w-full lg:w-[400px]">
                        <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-6 sticky top-4">
                            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t("squad")}</h3>
                            {POSITION_ORDER.map((pos) => {
                                const players = grouped[pos];
                                if (!players || players.length === 0) return null;
                                return (
                                    <div key={pos} className="mb-4">
                                        <div className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                                            {POSITION_KEYS[pos] ? t(POSITION_KEYS[pos]) : pos}
                                        </div>
                                        <div className="space-y-1">
                                            {players.map((p) => (
                                                <Link key={p.id} href={`/player/${p.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors">
                                                    <Image
                                                        src={playerImageUrl(p.id)}
                                                        alt={p.name}
                                                        width={32}
                                                        height={32}
                                                        className="rounded-full object-contain"
                                                        style={{ width: "32px", height: "32px" }}
                                                    />
                                                    <div className="flex-1">
                                                        <span className="text-sm">{p.name}</span>
                                                    </div>
                                                    <span className="text-xs text-gray-400 dark:text-gray-500">#{p.jersey_number}</span>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}