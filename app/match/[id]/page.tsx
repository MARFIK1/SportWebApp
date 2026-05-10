import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getAllCompetitions } from "@/app/util/league/leagueRegistry";
import { findMatchInCompetitions, loadAllSeasons } from "@/app/util/data/dataService";
import { loadPredictionReport, loadAnalysisReport } from "@/app/util/data/predictionService";
import type { SofascoreMatch } from "@/types/sofascore";
import { teamLogoUrl } from "@/app/util/urls";
import MatchPredictions from "./MatchPredictions";
import MatchStatistics from "./MatchStatistics";
import { getServerT } from "@/app/util/i18n/getLocale";
import { normalizeReportDate } from "@/app/util/data/dateUtils";
import MatchPredictionVariantProvider from "./MatchPredictionVariantProvider";
import MatchPredictionSidebar from "./MatchPredictionSidebar";
import MatchHistoryTabs, { type MatchHistoryItem } from "./MatchHistoryTabs";
import PostMatchInsights from "./PostMatchInsights";
import PredictionTriangle from "./PredictionTriangle";
import TeamRadar from "./TeamRadar";
import { findPredictionMatch, repairMatchAnalysis, resolveMatchDisplayState } from "./matchData";

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

function toHistoryItem(match: SofascoreMatch): MatchHistoryItem {
    return {
        eventId: match.event_id,
        date: match.date,
        homeTeamId: match.home_team_id,
        homeTeam: match.home_team,
        awayTeamId: match.away_team_id,
        awayTeam: match.away_team,
        homeScore: match.home_score,
        awayScore: match.away_score,
    };
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
    const date = normalizeReportDate(resolvedSearchParams.date) || match.date.slice(0, 10);

    const predReport = loadPredictionReport(date);
    const analysisReport = loadAnalysisReport(date);
    const predMatch = predReport ? findPredictionMatch(predReport, eventId, match.home_team, match.away_team) : null;

    const analysisKey = `${match.home_team.toLowerCase().replace(/\s+/g, "_")}_vs_${match.away_team.toLowerCase().replace(/\s+/g, "_")}`;
    const rawAnalysis = analysisReport?.matches?.[analysisKey] ?? null;

    const { displayHomeScore, displayAwayScore, actualResult, isFinished } = resolveMatchDisplayState(match, predMatch);
    const matchStats = isFinished ? buildMatchStats(match) : [];
    const rawMatch = match as unknown as Record<string, unknown>;
    const actualXgHome = readStatValue(rawMatch, ["home_expectedgoals", "home_xg"]);
    const actualXgAway = readStatValue(rawMatch, ["away_expectedgoals", "away_xg"]);

    const finishedMatches: SofascoreMatch[] = [];
    for (const comp of competitions) {
        const allMatches = loadAllSeasons(comp);
        finishedMatches.push(...allMatches.filter((m) =>
            m.status === "finished" &&
            m.event_id !== eventId &&
            m.date < match.date
        ));
    }
    const uniqueFinishedMatches = Array.from(
        finishedMatches.reduce((map, m) => { map.set(m.event_id, m); return map; }, new Map<number, SofascoreMatch>()).values()
    ).sort((a, b) => b.date.localeCompare(a.date));
    const h2h = uniqueFinishedMatches.filter((m) =>
        (m.home_team_id === match.home_team_id && m.away_team_id === match.away_team_id) ||
        (m.home_team_id === match.away_team_id && m.away_team_id === match.home_team_id)
    ).slice(0, 10);
    const homeRecent = uniqueFinishedMatches.filter((m) =>
        m.home_team_id === match.home_team_id || m.away_team_id === match.home_team_id
    ).slice(0, 10);
    const awayRecent = uniqueFinishedMatches.filter((m) =>
        m.home_team_id === match.away_team_id || m.away_team_id === match.away_team_id
    ).slice(0, 10);
    const analysis = repairMatchAnalysis(rawAnalysis, match, homeRecent, awayRecent);
    const displayXgHome = isFinished
        ? actualXgHome ?? analysis?.goals?.expected_goals_home
        : analysis?.goals?.expected_goals_home ?? actualXgHome;
    const displayXgAway = isFinished
        ? actualXgAway ?? analysis?.goals?.expected_goals_away
        : analysis?.goals?.expected_goals_away ?? actualXgAway;

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
            <div className="scrollbar-app mb-5 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 text-sm text-gray-500 dark:text-gray-400 sm:mb-8">
                <Link href="/" prefetch={false} className="hover:text-gray-900 dark:hover:text-white transition-colors">{t("home")}</Link>
                <span>/</span>
                <Link href={`/?date=${date}`} prefetch={false} className="hover:text-gray-900 dark:hover:text-white transition-colors">{competition.name}</Link>
                <span>/</span>
                <span className="text-gray-700 dark:text-gray-300">{t("round_label")} {match.round}</span>
            </div>

            <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
                <div className="flex-1">
                    <div className="mb-6 rounded-2xl bg-white p-5 dark:bg-gray-900/50 sm:p-8">
                        <div className="text-center text-xs text-gray-500 dark:text-gray-400 mb-6">
                            {competition.country.toUpperCase()} {"\u2022"} {competition.name} {"\u2022"} {match.date.slice(0, 10)}
                        </div>

                        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-8">
                            <div className="flex min-w-0 flex-col items-center">
                                <div className="flex h-16 w-full items-center justify-center sm:h-24">
                                    <Image
                                        src={teamLogoUrl(match.home_team_id)}
                                        alt={match.home_team}
                                        width={80}
                                        height={80}
                                        className="h-14 w-14 object-contain sm:h-20 sm:w-20"
                                    />
                                </div>
                                <span className="mt-2 block min-h-10 min-w-0 line-clamp-2 break-words text-center text-sm font-semibold leading-tight sm:mt-3 sm:min-h-12 sm:text-lg">{match.home_team}</span>
                            </div>

                            <div className="flex min-w-[74px] flex-col items-center gap-2 sm:min-w-[120px]">
                                {isFinished ? (
                                    <>
                                        <span className="text-3xl font-bold sm:text-5xl">
                                            {displayHomeScore} - {displayAwayScore}
                                        </span>
                                        <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white sm:px-3 sm:text-xs">
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
                                        <span className="text-2xl font-semibold text-emerald-400 sm:text-3xl">vs</span>
                                        <span className="text-center text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                                            {match.status === "postponed" ? t("postponed") : t("not_started")}
                                        </span>
                                    </>
                                )}
                            </div>

                            <div className="flex min-w-0 flex-col items-center">
                                <div className="flex h-16 w-full items-center justify-center sm:h-24">
                                    <Image
                                        src={teamLogoUrl(match.away_team_id)}
                                        alt={match.away_team}
                                        width={80}
                                        height={80}
                                        className="h-14 w-14 object-contain sm:h-20 sm:w-20"
                                    />
                                </div>
                                <span className="mt-2 block min-h-10 min-w-0 line-clamp-2 break-words text-center text-sm font-semibold leading-tight sm:mt-3 sm:min-h-12 sm:text-lg">{match.away_team}</span>
                            </div>
                        </div>
                    </div>

                    {displayXgHome != null && displayXgAway != null && (() => {
                        const xgHome = displayXgHome;
                        const xgAway = displayXgAway;
                        const xgTotal = xgHome + xgAway;
                        const homePct = xgTotal > 0 ? (xgHome / xgTotal) * 100 : 50;
                        const awayPct = xgTotal > 0 ? (xgAway / xgTotal) * 100 : 50;
                        return (
                            <div className="mb-6 rounded-2xl bg-white p-4 dark:bg-gray-900/50 sm:p-6">
                                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t("expected_goals")}</h3>
                                <div className="flex items-center gap-2 sm:gap-4">
                                    <span className="w-12 text-center text-xl font-bold text-gray-900 dark:text-white sm:w-16 sm:text-2xl">{xgHome.toFixed(2)}</span>
                                    <div className="flex h-4 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 sm:h-6">
                                        <div className="bg-emerald-500 h-full" style={{ width: `${homePct}%` }} />
                                        <div className="bg-blue-500 h-full" style={{ width: `${awayPct}%` }} />
                                    </div>
                                    <span className="w-12 text-center text-xl font-bold text-gray-900 dark:text-white sm:w-16 sm:text-2xl">{xgAway.toFixed(2)}</span>
                                </div>
                            </div>
                        );
                    })()}

                    {(predMatch || analysis) && (
                        <div className="mb-6 space-y-6">
                            {analysis && <TeamRadar analysis={analysis} homeTeam={match.home_team} awayTeam={match.away_team} />}
                            {predMatch && <PredictionTriangle homeTeam={match.home_team} awayTeam={match.away_team} actualResult={isFinished ? actualResult : null} />}
                        </div>
                    )}

                    {isFinished && actualResult && displayHomeScore != null && displayAwayScore != null && (
                        <PostMatchInsights
                            homeTeam={match.home_team}
                            awayTeam={match.away_team}
                            homeScore={displayHomeScore}
                            awayScore={displayAwayScore}
                            actualResult={actualResult}
                            stats={matchStats}
                            xgHome={displayXgHome ?? null}
                            xgAway={displayXgAway ?? null}
                        />
                    )}

                    {isFinished && matchStats.length > 0 && (
                        <MatchStatistics stats={matchStats} />
                    )}

                    {(h2h.length > 0 || homeRecent.length > 0 || awayRecent.length > 0) && (
                        <MatchHistoryTabs
                            homeTeam={match.home_team}
                            awayTeam={match.away_team}
                            homeTeamId={match.home_team_id}
                            awayTeamId={match.away_team_id}
                            h2h={h2h.map(toHistoryItem)}
                            homeRecent={homeRecent.map(toHistoryItem)}
                            awayRecent={awayRecent.map(toHistoryItem)}
                            h2hStats={h2hStats}
                        />
                    )}
                </div>

                <div className="w-full lg:w-[400px] space-y-6">
                    {predMatch && <MatchPredictionSidebar />}
                    {analysis && (analysis.goals || analysis.corners || analysis.cards || analysis.form) && (
                        <div className="rounded-2xl bg-white p-4 dark:bg-gray-900/50 sm:p-6">
                            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t("pre_match_analysis")}</h3>
                            <div className="space-y-3 text-sm">
                                {analysis.goals?.btts_pct != null && (
                                    <div className="flex justify-between gap-3">
                                        <span className="min-w-0 text-gray-500 dark:text-gray-400">{t("btts_probability")}</span>
                                        <span className="shrink-0 font-semibold text-gray-900 dark:text-white">{analysis.goals.btts_pct.toFixed(0)}%</span>
                                    </div>
                                )}
                                {analysis.goals?.over_2_5_pct != null && (
                                    <div className="flex justify-between gap-3">
                                        <span className="min-w-0 text-gray-500 dark:text-gray-400">{t("over_25")}</span>
                                        <span className="shrink-0 font-semibold text-gray-900 dark:text-white">{analysis.goals.over_2_5_pct.toFixed(0)}%</span>
                                    </div>
                                )}
                                {analysis.corners?.expected_total != null && (
                                    <div className="flex justify-between gap-3">
                                        <span className="min-w-0 text-gray-500 dark:text-gray-400">{t("expected_corners")}</span>
                                        <span className="shrink-0 font-semibold text-gray-900 dark:text-white">{analysis.corners.expected_total.toFixed(1)}</span>
                                    </div>
                                )}
                                {analysis.cards?.expected_total != null && (
                                    <div className="flex justify-between gap-3">
                                        <span className="min-w-0 text-gray-500 dark:text-gray-400">{t("expected_cards")}</span>
                                        <span className="shrink-0 font-semibold text-gray-900 dark:text-white">{analysis.cards.expected_total.toFixed(1)}</span>
                                    </div>
                                )}
                                {analysis.form?.home && (
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="min-w-0 text-gray-500 dark:text-gray-400">{t("home_form")}</span>
                                        <div className="flex shrink-0 gap-1">
                                            {analysis.form.home.split("").map((c, i) => (
                                                <span key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                                    c === "W" ? "bg-emerald-600" : c === "D" ? "bg-gray-600" : "bg-red-600"
                                                }`}>{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {analysis.form?.away && (
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="min-w-0 text-gray-500 dark:text-gray-400">{t("away_form")}</span>
                                        <div className="flex shrink-0 gap-1">
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
        <div className="mx-auto flex w-full max-w-[1400px] flex-col px-3 py-5 text-gray-900 dark:text-white sm:px-6 sm:py-8">
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
