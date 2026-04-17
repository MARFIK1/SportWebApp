import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getAllCompetitions } from "@/app/util/league/leagueRegistry";
import { findPlayerInCompetitions, loadAllSeasons } from "@/app/util/data/dataService";
import type { SofascoreMatch } from "@/types/sofascore";
import { teamLogoUrl, playerImageUrl } from "@/app/util/urls";
import { getServerT } from "@/app/util/i18n/getLocale";

interface PageProps {
    params: { id: string };
}

const POSITION_KEYS: Record<string, string> = {
    G: "goalkeeper",
    D: "defender",
    M: "midfielder",
    F: "forward",
};

function calculateAge(dateOfBirth: string): number {
    const birth = new Date(dateOfBirth);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const playerId = parseInt(params.id, 10);
    if (!Number.isFinite(playerId)) return { title: "Player" };
    const result = findPlayerInCompetitions(playerId, getAllCompetitions());
    if (!result) return { title: "Player" };
    const { player } = result;
    return {
        title: player.name,
        description: `${player.name} - ${player.team} - player profile, recent matches, stats`,
    };
}

export default async function PlayerPage({ params }: PageProps) {
    const playerId = parseInt(params.id, 10);
    const competitions = getAllCompetitions();
    const result = Number.isFinite(playerId) ? findPlayerInCompetitions(playerId, competitions) : null;

    const t = getServerT();

    if (!result) {
        return (
            <div className="flex justify-center items-center min-h-[60vh] text-gray-500 dark:text-gray-400">
                <p className="text-xl">{t("player_not_found")}</p>
            </div>
        );
    }

    const { player } = result;
    const age = player.date_of_birth ? calculateAge(player.date_of_birth) : null;

    let teamId: number | null = null;

    for (const comp of competitions) {
        const matches = loadAllSeasons(comp);
        for (const m of matches) {
            if (m.home_team === player.team) { teamId = m.home_team_id; break; }
            if (m.away_team === player.team) { teamId = m.away_team_id; break; }
        }
        if (teamId) break;
    }

    const recentMatches: SofascoreMatch[] = [];
    if (teamId) {
        for (const comp of competitions) {
            const matches = loadAllSeasons(comp);
            const teamMatches = matches.filter((m) =>
                (m.home_team_id === teamId || m.away_team_id === teamId) && m.status === "finished"
            );
            recentMatches.push(...teamMatches);
        }
    }

    const uniqueRecent = Array.from(
        recentMatches.reduce((map, m) => { map.set(m.event_id, m); return map; }, new Map<number, SofascoreMatch>()).values()
    ).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

    return (
        <div className="flex flex-col w-full max-w-[1000px] mx-auto px-6 py-8 text-gray-900 dark:text-white">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-8">
                <Link href="/" className="hover:text-gray-900 dark:hover:text-white transition-colors">{t("home")}</Link>
                <span>/</span>
                {teamId && (
                    <>
                        <Link href={`/team/${teamId}`} className="hover:text-gray-900 dark:hover:text-white transition-colors">{player.team}</Link>
                        <span>/</span>
                    </>
                )}
                <span className="text-gray-700 dark:text-gray-300">{player.name}</span>
            </div>

            <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-8 mb-6">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                    <Image
                        src={playerImageUrl(playerId)}
                        alt={player.name}
                        width={120}
                        height={120}
                        className="rounded-full object-contain"
                        style={{ width: "120px", height: "120px" }}
                    />
                    <div className="flex-1 text-center sm:text-left">
                        <h1 className="text-3xl font-bold mb-2">{player.name}</h1>
                        <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
                            <span className="px-3 py-1 bg-emerald-600/30 text-emerald-400 rounded-full text-sm font-semibold">
                                {POSITION_KEYS[player.position] ? t(POSITION_KEYS[player.position]) : player.position}
                            </span>
                            {player.jersey_number && (
                                <span className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm">
                                    #{player.jersey_number}
                                </span>
                            )}
                            {player.country && (
                                <span className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-sm">
                                    {player.country}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
                    {teamId && (
                        <Link href={`/team/${teamId}`} className="text-center hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-xl p-3 transition-colors">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("team")}</div>
                            <Image
                                src={teamLogoUrl(teamId)}
                                alt={player.team}
                                width={32}
                                height={32}
                                className="object-contain mx-auto mb-1"
                                style={{ width: "32px", height: "32px" }}
                            />
                            <div className="text-sm font-semibold">{player.team}</div>
                        </Link>
                    )}
                    {age !== null && (
                        <div className="text-center p-3">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("age")}</div>
                            <div className="text-2xl font-bold text-emerald-400">{age}</div>
                            <div className="text-xs text-gray-400 dark:text-gray-500">{player.date_of_birth}</div>
                        </div>
                    )}
                    {player.height > 0 && (
                        <div className="text-center p-3">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("height")}</div>
                            <div className="text-2xl font-bold text-blue-400">{player.height} cm</div>
                        </div>
                    )}
                    <div className="text-center p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("position")}</div>
                        <div className="text-2xl font-bold text-yellow-400">
                            {POSITION_KEYS[player.position] ? t(POSITION_KEYS[player.position]) : player.position}
                        </div>
                    </div>
                </div>
            </div>

            {uniqueRecent.length > 0 && (
                <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                        {t("recent_team_matches")}
                    </h3>
                    <div className="space-y-2">
                        {uniqueRecent.map((m) => {
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
                                        <span className="text-sm truncate">{m.home_team}</span>
                                    </div>
                                    <span className="text-sm font-bold px-2">{m.home_score} - {m.away_score}</span>
                                    <div className="flex items-center gap-2 flex-1 justify-end">
                                        <span className="text-sm truncate text-right">{m.away_team}</span>
                                        <Image src={teamLogoUrl(m.away_team_id)} alt={m.away_team} width={24} height={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
                                    </div>
                                    <span className="text-xs text-gray-400 dark:text-gray-500 w-20 text-right">{m.date.slice(0, 10)}</span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}