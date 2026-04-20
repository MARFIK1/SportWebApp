import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getCompetitionBySlug } from "@/app/util/league/leagueRegistry";
import { loadAllSeasons, computeStandings, type StandingRow } from "@/app/util/data/dataService";
import type { SofascoreMatch } from "@/types/sofascore";
import { teamLogoUrl } from "@/app/util/urls";
import { getServerT } from "@/app/util/i18n/getLocale";

interface PageProps {
    params: { slug: string };
    searchParams: { season?: string };
}

// Detect groups via connected components - teams that played each other belong to the same group
function detectGroups(matches: SofascoreMatch[]): Map<string, Set<number>> | null {
    // Only group stage rounds (1-10)
    const groupMatches = matches.filter((m) => m.round != null && m.round <= 10 && m.status === "finished");
    if (groupMatches.length === 0) return null;

    const teamGroup = new Map<number, number>();
    const groups = new Map<number, Set<number>>();
    let nextId = 0;

    for (const m of groupMatches) {
        const hId = m.home_team_id;
        const aId = m.away_team_id;
        const gh = teamGroup.get(hId);
        const ga = teamGroup.get(aId);

        if (gh == null && ga == null) {
            const gid = nextId++;
            teamGroup.set(hId, gid);
            teamGroup.set(aId, gid);
            groups.set(gid, new Set([hId, aId]));
        } else if (gh != null && ga == null) {
            teamGroup.set(aId, gh);
            groups.get(gh)!.add(aId);
        } else if (ga != null && gh == null) {
            teamGroup.set(hId, ga);
            groups.get(ga)!.add(hId);
        } else if (gh != null && ga != null && gh !== ga) {
            for (const t of Array.from(groups.get(ga)!)) {
                teamGroup.set(t, gh);
                groups.get(gh)!.add(t);
            }
            groups.delete(ga);
        }
    }

    if (groups.size <= 1) return null;

    const result = new Map<string, Set<number>>();
    const sorted = Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
    sorted.forEach(([, teamIds], i) => {
        result.set(String.fromCharCode(65 + i), teamIds);
    });
    return result;
}

function StandingsTable({ standings, t }: { standings: StandingRow[]; t: (key: string) => string }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-3 px-2 w-8">#</th>
                        <th className="text-left py-3 px-2">{t("team")}</th>
                        <th className="text-center py-3 px-2">{t("played")}</th>
                        <th className="text-center py-3 px-2">{t("wins")}</th>
                        <th className="text-center py-3 px-2">{t("draws")}</th>
                        <th className="text-center py-3 px-2">{t("losses")}</th>
                        <th className="text-center py-3 px-2">{t("gf_ga")}</th>
                        <th className="text-center py-3 px-2">{t("gd")}</th>
                        <th className="text-center py-3 px-2">{t("points")}</th>
                        <th className="text-center py-3 px-2">{t("form")}</th>
                    </tr>
                </thead>
                <tbody>
                    {standings.map((row) => (
                        <tr key={row.teamId} className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors">
                            <td className="py-3 px-2 text-gray-500 dark:text-gray-400">{row.position}</td>
                            <td className="py-3 px-2">
                                <Link href={`/team/${row.teamId}`} className="flex items-center gap-2 hover:text-emerald-400 transition-colors">
                                    <Image src={teamLogoUrl(row.teamId)} alt={row.teamName} width={24} height={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
                                    <span className="font-medium">{row.teamName}</span>
                                </Link>
                            </td>
                            <td className="text-center py-3 px-2">{row.played}</td>
                            <td className="text-center py-3 px-2 text-emerald-400">{row.won}</td>
                            <td className="text-center py-3 px-2 text-yellow-400">{row.drawn}</td>
                            <td className="text-center py-3 px-2 text-red-400">{row.lost}</td>
                            <td className="text-center py-3 px-2">{row.goalsFor} / {row.goalsAgainst}</td>
                            <td className={`text-center py-3 px-2 font-semibold ${row.goalDifference > 0 ? "text-emerald-400" : row.goalDifference < 0 ? "text-red-400" : ""}`}>
                                {row.goalDifference > 0 ? "+" : ""}{row.goalDifference}
                            </td>
                            <td className="text-center py-3 px-2 font-bold text-emerald-400">{row.points}</td>
                            <td className="py-3 px-2">
                                <div className="flex gap-1 justify-center">
                                    {row.form.map((c, i) => (
                                        <span key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                                            c === "W" ? "bg-emerald-600" : c === "D" ? "bg-gray-600" : "bg-red-600"
                                        }`}>{c}</span>
                                    ))}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const competition = getCompetitionBySlug(params.slug);
    if (!competition) return { title: "League" };
    return {
        title: competition.name,
        description: `${competition.name} standings, upcoming matches, and recent results`,
    };
}

export default async function LeaguePage({ params, searchParams }: PageProps) {
    const t = await getServerT();
    const competition = getCompetitionBySlug(params.slug);

    if (!competition) {
        return (
            <div className="flex justify-center items-center min-h-[60vh] text-gray-500 dark:text-gray-400">
                <p className="text-xl">{t("not_found")}</p>
            </div>
        );
    }

    const allMatches = loadAllSeasons(competition);

    const seasonSet = new Set<string>();
    for (const m of allMatches) {
        if (m.season) seasonSet.add(m.season);
    }
    const seasons = Array.from(seasonSet).sort();
    const selectedSeason = searchParams.season || (seasons.length > 0 ? seasons[seasons.length - 1] : "");
    const seasonMatches = selectedSeason ? allMatches.filter((m) => m.season === selectedSeason) : allMatches;

    const groups = detectGroups(seasonMatches);
    const playoffMatches = seasonMatches.filter((m) => m.round != null && m.round > 10);

    const finished = seasonMatches
        .filter((m) => m.status === "finished")
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10);

    const upcoming = seasonMatches
        .filter((m) => m.status !== "finished" && m.status !== "postponed")
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 10);

    return (
        <div className="flex flex-col w-full max-w-[1400px] mx-auto px-6 py-8 text-gray-900 dark:text-white">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-8">
                <Link href="/" className="hover:text-gray-900 dark:hover:text-white transition-colors">{t("home")}</Link>
                <span>/</span>
                <span className="text-gray-700 dark:text-gray-300">{competition.name}</span>
            </div>

            <div className="text-center mb-6">
                <h1 className="text-3xl font-bold">{competition.name}</h1>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                    {competition.country.toUpperCase()}
                </span>
            </div>

            {seasons.length > 1 && (
                <div className="flex items-center justify-center gap-2 mb-6 overflow-x-auto pb-2">
                    {seasons.map((s) => (
                        <Link
                            key={s}
                            href={`/league/${params.slug}?season=${encodeURIComponent(s)}`}
                            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                                s === selectedSeason
                                    ? "bg-emerald-600 text-white"
                                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                            }`}
                        >
                            {s}
                        </Link>
                    ))}
                </div>
            )}

            {groups ? (
                <div className="space-y-6 mb-6">
                    {Array.from(groups.entries()).map(([letter, teamIds]) => {
                        const groupMatches = seasonMatches.filter(
                            (m) => m.round != null && m.round <= 10 && (teamIds.has(m.home_team_id) || teamIds.has(m.away_team_id))
                        );
                        const standings = computeStandings(groupMatches);
                        return (
                            <div key={letter} className="bg-white dark:bg-gray-900/50 rounded-2xl p-6">
                                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                                    {t("group")} {letter}
                                </h3>
                                <StandingsTable standings={standings} t={t} />
                            </div>
                        );
                    })}

                    {playoffMatches.length > 0 && (
                        <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-6">
                            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                                {t("playoffs")}
                            </h3>
                            <div className="space-y-2">
                                {playoffMatches
                                    .sort((a, b) => a.date.localeCompare(b.date))
                                    .map((m) => (
                                    <Link key={m.event_id} href={`/match/${m.event_id}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors">
                                        <div className="flex items-center gap-2 flex-1">
                                            <Image src={teamLogoUrl(m.home_team_id)} alt={m.home_team} width={24} height={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
                                            <span className="text-sm truncate">{m.home_team}</span>
                                        </div>
                                        {m.status === "finished" ? (
                                            <span className="text-sm font-bold px-2">{m.home_score} - {m.away_score}</span>
                                        ) : (
                                            <span className="text-sm text-gray-400 dark:text-gray-500 px-2">vs</span>
                                        )}
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
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-8 mb-6">
                    {(() => {
                        const standings = computeStandings(seasonMatches);
                        return standings.length > 0 ? <StandingsTable standings={standings} t={t} /> : null;
                    })()}
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6">
                {upcoming.length > 0 && (
                    <div className="flex-1 bg-white dark:bg-gray-900/50 rounded-2xl p-6">
                        <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t("upcoming_matches")}</h3>
                        <div className="space-y-2">
                            {upcoming.map((m) => (
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

                {finished.length > 0 && (
                    <div className="flex-1 bg-white dark:bg-gray-900/50 rounded-2xl p-6">
                        <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t("recent_results")}</h3>
                        <div className="space-y-2">
                            {finished.map((m) => (
                                <Link key={m.event_id} href={`/match/${m.event_id}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors">
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
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
