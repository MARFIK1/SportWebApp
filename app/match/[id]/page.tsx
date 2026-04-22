import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getAllCompetitions } from "@/app/util/league/leagueRegistry";
import { findMatchInCompetitions, loadAllSeasons } from "@/app/util/data/dataService";
import { loadPredictionReport, loadAnalysisReport, getMatchPrediction } from "@/app/util/data/predictionService";
import { PredictionMatch, PredictionReport } from "@/types/predictions";
import type { SofascoreMatch } from "@/types/sofascore";
import { teamLogoUrl } from "@/app/util/urls";
import MatchPredictions from "./MatchPredictions";
import MatchStatistics from "./MatchStatistics";
import { getServerT } from "@/app/util/i18n/getLocale";
import MatchPredictionVariantProvider from "./MatchPredictionVariantProvider";
import MatchPredictionSidebar from "./MatchPredictionSidebar";

interface StatDefinition {
    label: string;
    homeKeys: string[];
    awayKeys: string[];
}

const STAT_MAP: StatDefinition[] = [
    { label: "Ball Possession", homeKeys: ["home_ballpossession"], awayKeys: ["away_ballpossession"] },
    { label: "Expected Goals (xG)", homeKeys: ["home_expectedgoals", "home_xg"], awayKeys: ["away_expectedgoals", "away_xg"] },
    { label: "Total Shots", homeKeys: ["home_totalshotsongoal"], awayKeys: ["away_totalshotsongoal"] },
    { label: "Shots on Goal", homeKeys: ["home_shotsongoal"], awayKeys: ["away_shotsongoal"] },
    { label: "Shots off Goal", homeKeys: ["home_shotsoffgoal"], awayKeys: ["away_shotsoffgoal"] },
    { label: "Blocked Shots", homeKeys: ["home_blockedscoringattempt"], awayKeys: ["away_blockedscoringattempt"] },
    { label: "Corner Kicks", homeKeys: ["home_cornerkicks"], awayKeys: ["away_cornerkicks"] },
    { label: "Fouls", homeKeys: ["home_fouls"], awayKeys: ["away_fouls"] },
    { label: "Yellow Cards", homeKeys: ["home_yellowcards"], awayKeys: ["away_yellowcards"] },
    { label: "Goalkeeper Saves", homeKeys: ["home_goalkeepersaves"], awayKeys: ["away_goalkeepersaves"] },
    { label: "Total Passes", homeKeys: ["home_passes"], awayKeys: ["away_passes"] },
    { label: "Accurate Passes", homeKeys: ["home_accuratepasses"], awayKeys: ["away_accuratepasses"] },
    { label: "Tackles", homeKeys: ["home_totaltackle"], awayKeys: ["away_totaltackle"] },
];

function readStatValue(raw: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
        const value = raw[key];
        if (typeof value === "number") return value;
    }
    return null;
}

function buildMatchStats(m: SofascoreMatch): { type: string; homeValue: number; awayValue: number }[] {
    const raw = m as unknown as Record<string, unknown>;
    const stats: { type: string; homeValue: number; awayValue: number }[] = [];
    for (const { label, homeKeys, awayKeys } of STAT_MAP) {
        const hVal = readStatValue(raw, homeKeys);
        const aVal = readStatValue(raw, awayKeys);
        if (hVal !== null || aVal !== null) {
            stats.push({ type: label, homeValue: hVal ?? 0, awayValue: aVal ?? 0 });
        }
    }
    return stats;
}

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ date?: string }>;
}

function findPredictionMatch(report: PredictionReport, eventId: number, homeTeam: string, awayTeam: string): PredictionMatch | undefined {
    return getMatchPrediction(report, eventId) ?? report.matches.find((m) => m.home_team === homeTeam && m.away_team === awayTeam);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const resolvedParams = await params;
    const eventId = parseInt(resolvedParams.id, 10);
    if (!Number.isFinite(eventId)) return { title: "Match" };
    const result = findMatchInCompetitions(eventId, getAllCompetitions());
    if (!result) return { title: "Match" };
    const { match } = result;
    const score = match.home_score != null && match.away_score != null ? ` ${match.home_score}-${match.away_score}` : "";
    return {
        title: `${match.home_team} vs ${match.away_team}${score}`,
        description: `${match.home_team} vs ${match.away_team} - match statistics, predictions, and head-to-head`,
    };
}

export default async function Match({ params, searchParams }: PageProps) {
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;
    const eventId = parseInt(resolvedParams.id, 10);
    const competitions = getAllCompetitions();
    const result = Number.isFinite(eventId) ? findMatchInCompetitions(eventId, competitions) : null;

    const t = await getServerT();

    if (!result) {
        return (
            <div className="flex justify-center items-center min-h-[60vh] text-gray-500 dark:text-gray-400">
                <p className="text-xl">{t("match_not_found")}</p>
            </div>
        );
    }

    const { match, competition } = result;
    const date = resolvedSearchParams.date || match.date.slice(0, 10);

    const predReport = loadPredictionReport(date);
    const analysisReport = loadAnalysisReport(date);
    const predMatch = predReport ? findPredictionMatch(predReport, eventId, match.home_team, match.away_team) : null;

    const analysisKey = `${match.home_team.toLowerCase().replace(/\s+/g, "_")}_vs_${match.away_team.toLowerCase().replace(/\s+/g, "_")}`;
    const analysis = analysisReport?.matches?.[analysisKey] ?? null;

    const isFinished = match.status === "finished";
    const matchStats = isFinished ? buildMatchStats(match) : [];

    const h2hMatches: SofascoreMatch[] = [];
    for (const comp of competitions) {
        const allMatches = loadAllSeasons(comp);
        const meetings = allMatches.filter((m) =>
            m.status === "finished" && m.event_id !== eventId && (
                (m.home_team_id === match.home_team_id && m.away_team_id === match.away_team_id) ||
                (m.home_team_id === match.away_team_id && m.away_team_id === match.home_team_id)
            )
        );
        h2hMatches.push(...meetings);
    }
    const h2h = Array.from(
        h2hMatches.reduce((map, m) => { map.set(m.event_id, m); return map; }, new Map<number, SofascoreMatch>()).values()
    ).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

    const h2hStats = { homeWins: 0, draws: 0, awayWins: 0 };
    for (const m of h2h) {
        const homeIsHome = m.home_team_id === match.home_team_id;
        if (m.home_score! > m.away_score!) {
            if (homeIsHome) h2hStats.homeWins++;
            else h2hStats.awayWins++;
        } else if (m.home_score! < m.away_score!) {
            if (homeIsHome) h2hStats.awayWins++;
            else h2hStats.homeWins++;
        } else {
            h2hStats.draws++;
        }
    }

    const content = (
        <>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-8">
                <Link href="/" className="hover:text-gray-900 dark:hover:text-white transition-colors">{t("home")}</Link>
                <span>/</span>
                <Link href={`/?date=${date}`} className="hover:text-gray-900 dark:hover:text-white transition-colors">{competition.name}</Link>
                <span>/</span>
                <span className="text-gray-700 dark:text-gray-300">{t("round_label")} {match.round}</span>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                <div className="flex-1">
                    <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-8 mb-6">
                        <div className="text-center text-xs text-gray-500 dark:text-gray-400 mb-6">
                            {competition.country.toUpperCase()} {"\u2022"} {competition.name} {"\u2022"} {match.date.slice(0, 10)}
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8">
                            <div className="flex w-[140px] flex-col items-center gap-3 sm:w-[200px]">
                                <Image
                                    src={teamLogoUrl(match.home_team_id)}
                                    alt={match.home_team}
                                    width={80}
                                    height={80}
                                    className="object-contain"
                                    style={{ width: "80px", height: "80px" }}
                                />
                                <span className="text-lg font-semibold text-center">{match.home_team}</span>
                            </div>

                            <div className="flex flex-col items-center gap-2">
                                {isFinished ? (
                                    <>
                                        <span className="text-5xl font-bold">
                                            {match.home_score} - {match.away_score}
                                        </span>
                                        <span className="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                                            {t("full_time")}
                                        </span>
                                        {match.home_score_pen != null && match.away_score_pen != null && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                {t("penalties")}: {match.home_score_pen} - {match.away_score_pen}
                                            </span>
                                        )}
                                        {match.home_score_ht != null && match.away_score_ht != null && (
                                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                                {t("half_time")}: {match.home_score_ht} - {match.away_score_ht}
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <span className="text-3xl font-semibold text-emerald-400">vs</span>
                                        <span className="text-sm text-gray-500 dark:text-gray-400">
                                            {match.status === "postponed" ? t("postponed") : t("not_started")}
                                        </span>
                                    </>
                                )}
                            </div>

                            <div className="flex w-[140px] flex-col items-center gap-3 sm:w-[200px]">
                                <Image
                                    src={teamLogoUrl(match.away_team_id)}
                                    alt={match.away_team}
                                    width={80}
                                    height={80}
                                    className="object-contain"
                                    style={{ width: "80px", height: "80px" }}
                                />
                                <span className="text-lg font-semibold text-center">{match.away_team}</span>
                            </div>
                        </div>
                    </div>

                    {analysis?.goals?.expected_goals_home != null && analysis?.goals?.expected_goals_away != null && (() => {
                        const xgHome = analysis.goals.expected_goals_home;
                        const xgAway = analysis.goals.expected_goals_away;
                        const xgTotal = xgHome + xgAway;
                        const homePct = xgTotal > 0 ? (xgHome / xgTotal) * 100 : 50;
                        const awayPct = xgTotal > 0 ? (xgAway / xgTotal) * 100 : 50;
                        return (
                            <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-6 mb-6">
                                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t("expected_goals")}</h3>
                                <div className="flex items-center gap-4">
                                    <span className="text-2xl font-bold text-gray-900 dark:text-white w-16 text-center">{xgHome.toFixed(2)}</span>
                                    <div className="flex-1 flex h-6 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                                        <div className="bg-emerald-500 h-full" style={{ width: `${homePct}%` }} />
                                        <div className="bg-blue-500 h-full" style={{ width: `${awayPct}%` }} />
                                    </div>
                                    <span className="text-2xl font-bold text-gray-900 dark:text-white w-16 text-center">{xgAway.toFixed(2)}</span>
                                </div>
                            </div>
                        );
                    })()}

                    {isFinished && matchStats.length > 0 && (
                        <MatchStatistics stats={matchStats} />
                    )}

                    {h2h.length > 0 && (
                        <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-6 mt-6">
                            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t("head_to_head")}</h3>
                            <div className="flex items-center justify-center gap-6 mb-4">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-emerald-400">{h2hStats.homeWins}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{match.home_team}</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-gray-500 dark:text-gray-400">{h2hStats.draws}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{t("draws")}</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-blue-400">{h2hStats.awayWins}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{match.away_team}</div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {h2h.map((m) => (
                                    <Link key={m.event_id} href={`/match/${m.event_id}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors">
                                        <div className="flex items-center gap-2 flex-1">
                                            <Image src={teamLogoUrl(m.home_team_id)} alt={m.home_team} width={20} height={20} className="object-contain" style={{ width: "20px", height: "20px" }} />
                                            <span className="text-sm truncate">{m.home_team}</span>
                                        </div>
                                        <span className="text-sm font-bold px-2">{m.home_score} - {m.away_score}</span>
                                        <div className="flex items-center gap-2 flex-1 justify-end">
                                            <span className="text-sm truncate text-right">{m.away_team}</span>
                                            <Image src={teamLogoUrl(m.away_team_id)} alt={m.away_team} width={20} height={20} className="object-contain" style={{ width: "20px", height: "20px" }} />
                                        </div>
                                        <span className="text-xs text-gray-400 dark:text-gray-500 w-20 text-right">{m.date.slice(0, 10)}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="w-full lg:w-[400px] space-y-6">
                    {predMatch && <MatchPredictionSidebar />}
                    {analysis && (analysis.goals || analysis.corners || analysis.cards || analysis.form) && (
                        <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-6">
                            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t("pre_match_analysis")}</h3>
                            <div className="space-y-3 text-sm">
                                {analysis.goals?.btts_pct != null && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500 dark:text-gray-400">{t("btts_probability")}</span>
                                        <span className="text-gray-900 dark:text-white font-semibold">{analysis.goals.btts_pct.toFixed(0)}%</span>
                                    </div>
                                )}
                                {analysis.goals?.over_2_5_pct != null && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500 dark:text-gray-400">{t("over_25")}</span>
                                        <span className="text-gray-900 dark:text-white font-semibold">{analysis.goals.over_2_5_pct.toFixed(0)}%</span>
                                    </div>
                                )}
                                {analysis.corners?.expected_total != null && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500 dark:text-gray-400">{t("expected_corners")}</span>
                                        <span className="text-gray-900 dark:text-white font-semibold">{analysis.corners.expected_total.toFixed(1)}</span>
                                    </div>
                                )}
                                {analysis.cards?.expected_total != null && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500 dark:text-gray-400">{t("expected_cards")}</span>
                                        <span className="text-gray-900 dark:text-white font-semibold">{analysis.cards.expected_total.toFixed(1)}</span>
                                    </div>
                                )}
                                {analysis.form?.home && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500 dark:text-gray-400">{t("home_form")}</span>
                                        <div className="flex gap-1">
                                            {analysis.form.home.split("").map((c, i) => (
                                                <span key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                                    c === "W" ? "bg-emerald-600" : c === "D" ? "bg-gray-600" : "bg-red-600"
                                                }`}>{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {analysis.form?.away && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500 dark:text-gray-400">{t("away_form")}</span>
                                        <div className="flex gap-1">
                                            {analysis.form.away.split("").map((c, i) => (
                                                <span key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                                    c === "W" ? "bg-emerald-600" : c === "D" ? "bg-gray-600" : "bg-red-600"
                                                }`}>{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {predMatch && <MatchPredictions />}
        </>
    );

    return (
        <div className="flex flex-col w-full max-w-[1400px] mx-auto px-6 py-8 text-gray-900 dark:text-white">
            {predMatch ? (
                <MatchPredictionVariantProvider key={predMatch.id} match={predMatch} matchFinished={isFinished}>
                    {content}
                </MatchPredictionVariantProvider>
            ) : (
                content
            )}
        </div>
    );
}
