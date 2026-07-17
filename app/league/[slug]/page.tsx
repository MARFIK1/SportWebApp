import Link from "next/link";
import type { Metadata } from "next";
import { detectWorldCupFormat } from "@/app/match/[id]/bracketConfig";
import { getCompetitionBySlug } from "@/app/util/league/leagueRegistry";
import { resolveSeasonSelection } from "@/app/util/league/seasonResolver";
import { todayYmd } from "@/app/util/data/dateUtils";
import { loadAllSeasons, computeStandings, resolveLeagueTableContext, type StandingRow } from "@/app/util/data/dataService";
import { loadPredictionReport } from "@/app/util/data/predictionService";
import {
    detectTournamentGroups,
    partitionTournamentMatches,
    type TournamentGroup,
} from "@/app/util/tournament/tournamentGroups";
import {
    isUpcomingTournamentMatch,
    normalizeWorldCupTournamentMatches,
} from "@/app/util/tournament/worldCupTournamentView";
import type { PredictionMatch } from "@/types/predictions";
import type { SofascoreMatch } from "@/types/sofascore";
import { getServerT } from "@/app/util/i18n/getLocale";
import TeamLogo from "@/app/components/common/TeamLogo";
import { resolveSofascoreMatchResult } from "@/app/util/predictions/matchResult";

interface PageProps {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ season?: string }>;
}

function loadTournamentPredictionMatches(matches: SofascoreMatch[]): PredictionMatch[] {
    const eventIds = new Set(matches.map((match) => match.event_id));
    const reportDates = new Set(matches.map((match) => match.date.slice(0, 10)));
    return Array.from(reportDates)
        .flatMap((date) => loadPredictionReport(date)?.matches ?? [])
        .filter((match) => typeof match.event_id === "number" && eventIds.has(match.event_id));
}

function detectLegacyGroups(matches: SofascoreMatch[]): TournamentGroup[] | null {
    const groupMatches = matches.filter((m) => m.round != null && m.round <= 10 && m.status === "finished");
    if (groupMatches.length === 0) return null;
    const groupEventIds = new Set(groupMatches.map((match) => match.event_id));
    const groups = detectTournamentGroups(groupMatches, groupEventIds);
    return groups.length > 1 ? groups : null;
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
                                <Link href={`/team/${row.teamId}`} prefetch={false} className="flex items-center gap-2 hover:text-emerald-400 transition-colors">
                                    <TeamLogo teamId={row.teamId} alt={row.teamName} size={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
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

function MatchScoreBadge({ match, t }: { match: SofascoreMatch; t: (key: string) => string }) {
    const result = resolveSofascoreMatchResult(match, null);
    if (match.status !== "finished" || !result.regularScore) {
        return <span className="text-sm text-gray-400 dark:text-gray-500 px-2">vs</span>;
    }

    return (
        <span className="flex flex-col items-center px-2 text-sm font-bold">
            <span>{result.regularScore.home} - {result.regularScore.away}</span>
            {result.penaltyScore && (
                <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                    {t("penalties")} {result.penaltyScore.home} - {result.penaltyScore.away}
                </span>
            )}
        </span>
    );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const resolvedParams = await params;
    const competition = getCompetitionBySlug(resolvedParams.slug);
    if (!competition) return { title: "League" };
    return {
        title: competition.name,
        description: `${competition.name} standings, upcoming matches, and recent results`,
    };
}

export default async function LeaguePage({ params, searchParams }: PageProps) {
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;
    const t = await getServerT();
    const competition = getCompetitionBySlug(resolvedParams.slug);

    if (!competition) {
        return (
            <div className="flex justify-center items-center min-h-[60vh] text-gray-500 dark:text-gray-400">
                <p className="text-xl">{t("not_found")}</p>
            </div>
        );
    }

    const allMatches = loadAllSeasons(competition);
    const {
        seasons,
        selectedSeason,
        matches: seasonMatches,
    } = resolveSeasonSelection(allMatches, resolvedSearchParams.season);

    const displayMatches = competition.slug === "fifa-world-cup"
        ? normalizeWorldCupTournamentMatches(seasonMatches, loadTournamentPredictionMatches(seasonMatches))
        : seasonMatches;
    const leagueTableContext = competition.compType === "league" ? resolveLeagueTableContext(displayMatches) : null;
    const standingsMatches = leagueTableContext?.standingsMatches ?? displayMatches;

    let groups = detectLegacyGroups(displayMatches);
    let playoffMatches = displayMatches.filter((m) => m.round != null && m.round > 10);

    if (competition.slug === "fifa-world-cup" && displayMatches.length > 0) {
        const format = detectWorldCupFormat(displayMatches[displayMatches.length - 1], displayMatches);
        const partition = partitionTournamentMatches(displayMatches, format);
        const detectedGroups = detectTournamentGroups(partition.matches, partition.groupStageEventIds);
        groups = detectedGroups.length > 1 ? detectedGroups : null;
        playoffMatches = partition.playoffMatches;
    }

    const finished = displayMatches
        .filter((m) => m.status === "finished")
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10);

    const today = todayYmd();
    const upcoming = displayMatches
        .filter((m) => isUpcomingTournamentMatch(m, today))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 10);

    return (
        <div className="flex flex-col w-full max-w-[1400px] mx-auto px-6 py-8 text-gray-900 dark:text-white">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-8">
                <Link href="/" prefetch={false} className="hover:text-gray-900 dark:hover:text-white transition-colors">{t("home")}</Link>
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
                            href={`/league/${resolvedParams.slug}?season=${encodeURIComponent(s)}`}
                            prefetch={false}
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
                    {groups.map((group) => {
                        const standings = computeStandings(group.matches);
                        return (
                            <div key={group.letter} className="bg-white dark:bg-gray-900/50 rounded-2xl p-6">
                                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                                    {t("group")} {group.letter}
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
                                    <Link key={m.event_id} href={`/match/${m.event_id}`} prefetch={false} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors">
                                        <div className="flex items-center gap-2 flex-1">
                                            <TeamLogo teamId={m.home_team_id} alt={m.home_team} size={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
                                            <span className="text-sm truncate">{m.home_team}</span>
                                        </div>
                                        <MatchScoreBadge match={m} t={t} />
                                        <div className="flex items-center gap-2 flex-1 justify-end">
                                            <span className="text-sm truncate text-right">{m.away_team}</span>
                                            <TeamLogo teamId={m.away_team_id} alt={m.away_team} size={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
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
                        const standings = computeStandings(standingsMatches);
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
                                <Link key={m.event_id} href={`/match/${m.event_id}`} prefetch={false} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors">
                                    <div className="flex items-center gap-2 flex-1">
                                        <TeamLogo teamId={m.home_team_id} alt={m.home_team} size={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
                                        <span className="text-sm truncate">{m.home_team}</span>
                                    </div>
                                    <span className="text-sm text-gray-400 dark:text-gray-500 px-2">vs</span>
                                    <div className="flex items-center gap-2 flex-1 justify-end">
                                        <span className="text-sm truncate text-right">{m.away_team}</span>
                                        <TeamLogo teamId={m.away_team_id} alt={m.away_team} size={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
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
                                <Link key={m.event_id} href={`/match/${m.event_id}`} prefetch={false} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors">
                                    <div className="flex items-center gap-2 flex-1">
                                        <TeamLogo teamId={m.home_team_id} alt={m.home_team} size={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
                                        <span className="text-sm truncate">{m.home_team}</span>
                                    </div>
                                    <MatchScoreBadge match={m} t={t} />
                                    <div className="flex items-center gap-2 flex-1 justify-end">
                                        <span className="text-sm truncate text-right">{m.away_team}</span>
                                            <TeamLogo teamId={m.away_team_id} alt={m.away_team} size={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
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
