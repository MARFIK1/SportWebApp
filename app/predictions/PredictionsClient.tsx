"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { PredictionMatch, ModelPrediction, ConsensusPrediction } from "@/types/predictions";
import { useLanguage } from "@/app/components/common/LanguageProvider";
import TeamLogo from "@/app/components/common/TeamLogo";
import { getDrawWatchSignalFromPredictions } from "@/app/util/predictions/drawWatch";
import {
    getTeamFavoriteKey,
} from "@/app/util/favorites/favorites";
import { useStoredFavorites } from "@/app/util/favorites/useStoredFavorites";
import type { MatchResult } from "@/types/predictions";

interface PredictionsClientProps {
    matches: PredictionMatch[];
    leagues: { dataPath: string; name: string; count: number; slug: string }[];
    teamIds: Record<string, number>;
}

type MatchViewFilter = "all" | "favorites" | "drawWatch" | "highConfidence" | "finished" | "upcoming";
type MatchSort = "default" | "confidence" | "agreement" | "drawProbability" | "kickoff";

const HIGH_CONFIDENCE_THRESHOLD = 60;
const OUTCOMES: MatchResult[] = ["HOME", "DRAW", "AWAY"];

function getProbabilityScale(probabilities: Record<MatchResult, number> | undefined): number {
    if (!probabilities) return 1;
    return Math.max(...OUTCOMES.map((outcome) => probabilities[outcome] ?? 0)) <= 1 ? 100 : 1;
}

function getConsensusConfidence(match: PredictionMatch): number {
    const consensus = match.predictions.consensus as ConsensusPrediction;
    if (!consensus?.prediction) return 0;
    const scale = getProbabilityScale(consensus.avg_probabilities);
    return (consensus.avg_probabilities?.[consensus.prediction] ?? 0) * scale;
}

function getAgreementCount(match: PredictionMatch): number {
    const consensus = match.predictions.consensus as ConsensusPrediction;
    if (!consensus?.agreement) return 0;
    const parsed = Number.parseInt(consensus.agreement.split("/")[0] ?? "0", 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getDrawProbability(match: PredictionMatch): number {
    return getDrawWatchSignalFromPredictions(match.predictions)?.drawProbability ?? 0;
}

function kickoffValue(match: PredictionMatch): number {
    const [hour = "99", minute = "99"] = (match.start_time || "").split(":");
    const h = Number.parseInt(hour, 10);
    const m = Number.parseInt(minute, 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 9999;
    return h * 60 + m;
}

function getLeagueDataPath(match: PredictionMatch): string {
    return `${match.comp_type}/${match.league}`;
}

function matchMatchesFavorites(
    match: PredictionMatch,
    favoriteLeagueKeys: Set<string>,
    favoriteTeamKeys: Set<string>,
    teamIds: Record<string, number>,
    leagueSlugByDataPath: Map<string, string>,
): boolean {
    const dataPath = getLeagueDataPath(match);
    const slug = leagueSlugByDataPath.get(dataPath);
    if (favoriteLeagueKeys.has(dataPath) || (slug && favoriteLeagueKeys.has(slug))) {
        return true;
    }

    const homeKey = getTeamFavoriteKey(teamIds[match.home_team] ?? null, match.home_team);
    const awayKey = getTeamFavoriteKey(teamIds[match.away_team] ?? null, match.away_team);
    return favoriteTeamKeys.has(homeKey) || favoriteTeamKeys.has(awayKey);
}

function matchPassesViewFilter(match: PredictionMatch, filter: MatchViewFilter): boolean {
    if (filter === "drawWatch") return Boolean(getDrawWatchSignalFromPredictions(match.predictions));
    if (filter === "highConfidence") return getConsensusConfidence(match) >= HIGH_CONFIDENCE_THRESHOLD;
    if (filter === "finished") return match.status === "finished";
    if (filter === "upcoming") return match.status !== "finished";
    return true;
}

function sortMatches(matches: PredictionMatch[], sortBy: MatchSort): PredictionMatch[] {
    const sorted = [...matches];
    if (sortBy === "confidence") {
        return sorted.sort((a, b) => getConsensusConfidence(b) - getConsensusConfidence(a) || getAgreementCount(b) - getAgreementCount(a));
    }
    if (sortBy === "agreement") {
        return sorted.sort((a, b) => getAgreementCount(b) - getAgreementCount(a) || getConsensusConfidence(b) - getConsensusConfidence(a));
    }
    if (sortBy === "drawProbability") {
        return sorted.sort((a, b) => getDrawProbability(b) - getDrawProbability(a) || getConsensusConfidence(b) - getConsensusConfidence(a));
    }
    if (sortBy === "kickoff") {
        return sorted.sort((a, b) => kickoffValue(a) - kickoffValue(b));
    }
    return sorted;
}

export default function PredictionsClient({ matches, leagues, teamIds }: PredictionsClientProps) {
    const { t } = useLanguage();
    const [selectedLeague, setSelectedLeague] = useState<string>("all");
    const [viewFilter, setViewFilter] = useState<MatchViewFilter>("all");
    const [sortBy, setSortBy] = useState<MatchSort>("default");
    const [leagueMenuOpen, setLeagueMenuOpen] = useState(false);
    const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
    const [favorites] = useStoredFavorites();
    const matchRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const pendingScrollMatch = useRef<string | null>(null);

    const favoriteLeagueKeys = useMemo(() => new Set(favorites.leagues), [favorites.leagues]);
    const favoriteTeamKeys = useMemo(() => new Set(favorites.teams), [favorites.teams]);
    const leagueSlugByDataPath = useMemo(
        () => new Map(leagues.map((league) => [league.dataPath, league.slug])),
        [leagues],
    );

    const leagueFiltered = selectedLeague === "all"
        ? matches
        : matches.filter((m) => `${m.comp_type}/${m.league}` === selectedLeague);
    const favoritesFiltered = leagueFiltered.filter((match) => (
        matchMatchesFavorites(match, favoriteLeagueKeys, favoriteTeamKeys, teamIds, leagueSlugByDataPath)
    ));
    const viewFiltered = viewFilter === "favorites"
        ? favoritesFiltered
        : leagueFiltered.filter((match) => matchPassesViewFilter(match, viewFilter));
    const filtered = sortMatches(
        viewFiltered,
        sortBy,
    );
    const viewFilterOptions: { key: MatchViewFilter; label: string; count: number }[] = [
        { key: "all", label: t("filter_all_matches"), count: leagueFiltered.length },
        { key: "favorites", label: t("favorites_only"), count: favoritesFiltered.length },
        { key: "drawWatch", label: t("filter_draw_watch"), count: leagueFiltered.filter((match) => matchPassesViewFilter(match, "drawWatch")).length },
        { key: "highConfidence", label: t("filter_high_confidence"), count: leagueFiltered.filter((match) => matchPassesViewFilter(match, "highConfidence")).length },
        { key: "finished", label: t("filter_finished"), count: leagueFiltered.filter((match) => matchPassesViewFilter(match, "finished")).length },
        { key: "upcoming", label: t("filter_upcoming"), count: leagueFiltered.filter((match) => matchPassesViewFilter(match, "upcoming")).length },
    ];
    const sortOptions: { key: MatchSort; label: string }[] = [
        { key: "default", label: t("sort_default") },
        { key: "confidence", label: t("sort_confidence") },
        { key: "agreement", label: t("sort_agreement") },
        { key: "drawProbability", label: t("sort_draw_probability") },
        { key: "kickoff", label: t("sort_kickoff") },
    ];
    const leagueOptions = [
        { dataPath: "all", name: t("all_leagues"), count: matches.length },
        ...leagues,
    ];
    const selectedLeagueOption = leagueOptions.find((league) => league.dataPath === selectedLeague) ?? leagueOptions[0];

    useEffect(() => {
        if (!expandedMatch || pendingScrollMatch.current !== expandedMatch) {
            return;
        }

        const frame = window.requestAnimationFrame(() => {
            matchRefs.current[expandedMatch]?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
            pendingScrollMatch.current = null;
        });

        return () => window.cancelAnimationFrame(frame);
    }, [expandedMatch]);

    const toggleExpandedMatch = (matchId: string, isExpanded: boolean) => {
        if (isExpanded) {
            pendingScrollMatch.current = null;
            setExpandedMatch(null);
            return;
        }

        pendingScrollMatch.current = matchId;
        setExpandedMatch(matchId);
    };

    const outcomeLabel = (outcome: ModelPrediction["prediction"]) => {
        if (!outcome) return "-";
        if (outcome === "HOME") return t("home_short");
        if (outcome === "AWAY") return t("away_short");
        return t("draw_short");
    };

    return (
        <div className="min-w-0">
            <div className="mb-4 sm:hidden">
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400" htmlFor="league-filter-button">
                    {t("all_leagues")}
                </label>
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-gray-900">
                    <button
                        id="league-filter-button"
                        type="button"
                        onClick={() => setLeagueMenuOpen((open) => !open)}
                        aria-expanded={leagueMenuOpen}
                        aria-controls="league-filter-options"
                        className="flex w-full min-w-0 items-center justify-between gap-3 px-3 py-3 text-left text-sm font-semibold text-gray-900 outline-none transition-colors focus:ring-2 focus:ring-inset focus:ring-emerald-500/40 dark:text-white"
                    >
                        <span className="min-w-0 truncate">
                            {selectedLeagueOption.name} ({selectedLeagueOption.count})
                        </span>
                        <ChevronDownIcon
                            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${leagueMenuOpen ? "rotate-180" : ""}`}
                            aria-hidden="true"
                        />
                    </button>

                    {leagueMenuOpen && (
                        <div id="league-filter-options" className="border-t border-gray-200 p-1 dark:border-white/10">
                            <div
                                className="scrollbar-app max-h-72 overflow-y-auto overscroll-contain"
                                data-header-scroll-ignore="true"
                                onTouchMove={(event) => event.stopPropagation()}
                                onTouchStart={(event) => event.stopPropagation()}
                                onWheel={(event) => event.stopPropagation()}
                            >
                                {leagueOptions.map((league) => {
                                    const selected = selectedLeague === league.dataPath;
                                    return (
                                        <button
                                            key={league.dataPath}
                                            type="button"
                                            onClick={() => {
                                                setSelectedLeague(league.dataPath);
                                                setExpandedMatch(null);
                                                setLeagueMenuOpen(false);
                                            }}
                                            className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                                                selected
                                                    ? "bg-emerald-600 text-white"
                                                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                                            }`}
                                        >
                                            <span className="min-w-0 truncate">{league.name}</span>
                                            <span className={`shrink-0 text-xs ${selected ? "text-white/80" : "text-gray-400 dark:text-gray-500"}`}>
                                                {league.count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="scrollbar-app mb-4 hidden max-w-full items-center gap-2 overflow-x-auto pb-2 sm:flex">
                <button
                    onClick={() => setSelectedLeague("all")}
                    className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                        selectedLeague === "all" ? "bg-emerald-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                >
                    {t("all_leagues")} ({matches.length})
                </button>
                {leagues.map((l) => (
                    <button
                        key={l.dataPath}
                        onClick={() => setSelectedLeague(l.dataPath)}
                        className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                            selectedLeague === l.dataPath ? "bg-emerald-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        }`}
                    >
                        {l.name} ({l.count})
                    </button>
                ))}
            </div>

            <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-gray-900/50 dark:shadow-black/10 sm:p-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="min-w-0">
                        <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                            {t("filter_label")}
                        </div>
                        <div className="scrollbar-app flex max-w-full gap-2 overflow-x-auto pb-1">
                            {viewFilterOptions.map((option) => {
                                const selected = viewFilter === option.key;
                                return (
                                    <button
                                        key={option.key}
                                        type="button"
                                        onClick={() => {
                                            setViewFilter(option.key);
                                            setExpandedMatch(null);
                                        }}
                                        className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${
                                            selected
                                                ? "border-emerald-500 bg-emerald-600 text-white"
                                                : "border-gray-200 bg-gray-50 text-gray-600 hover:border-emerald-400 hover:text-gray-900 dark:border-gray-800 dark:bg-black/20 dark:text-gray-300 dark:hover:text-white"
                                        }`}
                                    >
                                        {option.label}
                                        <span className={`ml-2 text-xs ${selected ? "text-white/80" : "text-gray-400 dark:text-gray-500"}`}>
                                            {option.count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="min-w-0">
                        <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400" htmlFor="prediction-sort">
                            {t("sort_label")}
                        </label>
                        <select
                            id="prediction-sort"
                            value={sortBy}
                            onChange={(event) => {
                                setSortBy(event.target.value as MatchSort);
                                setExpandedMatch(null);
                            }}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-bold text-gray-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-800 dark:bg-black/20 dark:text-white"
                        >
                            {sortOptions.map((option) => (
                                <option key={option.key} value={option.key}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-200 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <span>{t("filtered_matches")}: <strong className="text-gray-900 dark:text-white">{filtered.length}</strong></span>
                    {(viewFilter !== "all" || sortBy !== "default") && (
                        <button
                            type="button"
                            onClick={() => {
                                setViewFilter("all");
                                setSortBy("default");
                                setExpandedMatch(null);
                            }}
                            className="font-bold text-emerald-500 hover:text-emerald-400"
                        >
                            {t("reset_filters")}
                        </button>
                    )}
                </div>
            </div>

            <div className="min-w-0 space-y-3">
                {filtered.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-400">
                        {t("no_matches_after_filters")}
                    </div>
                )}

                {filtered.map((match) => {
                    const consensus = match.predictions.consensus as ConsensusPrediction;
                    const isExpanded = expandedMatch === match.id;
                    const models = Object.entries(match.predictions).filter(([key]) => key !== "consensus") as [string, ModelPrediction][];
                    const isFinished = match.status === "finished";
                    const score = match.actual_score?.split("-").map((s) => s.trim());
                    const penaltyScore = match.actual_penalty_score?.split("-").map((s) => s.trim());
                    const correct = consensus?.correct;
                    const drawWatch = getDrawWatchSignalFromPredictions(match.predictions);

                    return (
                        <div
                            key={match.id}
                            ref={(element) => {
                                matchRefs.current[match.id] = element;
                            }}
                            className="min-w-0 scroll-mt-36 overflow-hidden rounded-xl bg-white dark:bg-gray-900/50 sm:scroll-mt-6"
                        >
                            <button
                                onClick={() => toggleExpandedMatch(match.id, isExpanded)}
                                aria-expanded={isExpanded}
                                aria-controls={`prediction-details-${match.id}`}
                                className="flex w-full flex-col gap-3 p-3 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800/50 sm:flex-row sm:items-center sm:gap-5 sm:p-4"
                            >
                                <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:w-[420px] lg:w-[520px] lg:gap-4 2xl:w-[700px]">
                                    <div className="flex min-w-0 items-center gap-2">
                                        {teamIds[match.home_team] && (
                                            <TeamLogo
                                                teamId={teamIds[match.home_team]}
                                                alt={match.home_team}
                                                size={24}
                                                className="h-6 w-6 shrink-0 object-contain"
                                            />
                                        )}
                                        <span className="min-w-0 truncate text-sm text-gray-900 dark:text-white">{match.home_team}</span>
                                    </div>
                                    {isFinished && score ? (
                                        <span className="flex flex-col items-center rounded-lg bg-gray-100 px-2 py-1 text-sm font-bold text-gray-900 dark:bg-black/30 dark:text-white">
                                            <span>{score[0]} - {score[1]}</span>
                                            {penaltyScore && (
                                                <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                                                    {t("penalties")} {penaltyScore[0]} - {penaltyScore[1]}
                                                </span>
                                            )}
                                        </span>
                                    ) : (
                                        <span className="px-1 text-sm text-gray-400 dark:text-gray-500">vs</span>
                                    )}
                                    <div className="flex min-w-0 items-center justify-end gap-2">
                                        <span className="min-w-0 truncate text-right text-sm text-gray-900 dark:text-white">{match.away_team}</span>
                                        {teamIds[match.away_team] && (
                                            <TeamLogo
                                                teamId={teamIds[match.away_team]}
                                                alt={match.away_team}
                                                size={24}
                                                className="h-6 w-6 shrink-0 object-contain"
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:flex-1 sm:gap-4 xl:justify-end">
                                    {consensus && (
                                        <>
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                consensus.prediction === "HOME" ? "bg-emerald-600/30 text-emerald-400" :
                                                consensus.prediction === "AWAY" ? "bg-blue-600/30 text-blue-400" :
                                                "bg-yellow-600/30 text-yellow-400"
                                            }`}>
                                                {consensus.prediction}
                                            </span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 sm:text-xs">
                                                {consensus.agreement}
                                            </span>
                                            <span className="text-[11px] text-gray-400 dark:text-gray-500 sm:text-xs">
                                                H:{consensus.avg_probabilities?.HOME?.toFixed(0)}%
                                                {" "}D:{consensus.avg_probabilities?.DRAW?.toFixed(0)}%
                                                {" "}A:{consensus.avg_probabilities?.AWAY?.toFixed(0)}%
                                            </span>
                                            {drawWatch && (
                                                <span
                                                    className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-300 sm:text-xs"
                                                    title={`${t("draw_watch_hint")}: ${drawWatch.drawProbability.toFixed(1)}%, ${t("gap_to_best")}: ${drawWatch.gapToBest.toFixed(1)}pp`}
                                                >
                                                    {t("draw_watch")} {drawWatch.drawProbability.toFixed(0)}%
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>

                                {isFinished && (
                                    <span
                                        className={`text-xs font-bold ${correct ? "text-emerald-400" : "text-red-400"}`}
                                        aria-label={correct ? t("correct") : t("incorrect")}
                                        role="img"
                                    >
                                        <span aria-hidden="true">{correct ? "\u2713" : "\u2717"}</span>
                                    </span>
                                )}

                                <span className="self-end text-sm text-gray-400 dark:text-gray-500 sm:self-auto" aria-hidden="true">{isExpanded ? "\u25B2" : "\u25BC"}</span>
                            </button>

                            {isExpanded && (
                                <div id={`prediction-details-${match.id}`} className="border-t border-gray-200 px-3 pb-4 pt-3 dark:border-white/10 sm:px-4">
                                    <div className="space-y-3 md:hidden">
                                        {models.map(([name, pred]) => (
                                            <div key={name} className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-white/10 dark:bg-gray-800/50">
                                                <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
                                                    <span className="min-w-0 truncate text-sm font-black text-gray-900 dark:text-white">{name}</span>
                                                    <span className={`shrink-0 rounded px-2 py-1 text-xs font-bold ${
                                                        pred.prediction === "HOME" ? "bg-emerald-600/30 text-emerald-400" :
                                                        pred.prediction === "AWAY" ? "bg-blue-600/30 text-blue-400" :
                                                        "bg-yellow-600/30 text-yellow-400"
                                                    }`}>
                                                        {outcomeLabel(pred.prediction)}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-center min-[390px]:grid-cols-4">
                                                    <div className="min-w-0 rounded-lg bg-white/70 px-1.5 py-2 dark:bg-gray-900/40">
                                                        <div className="break-words text-[9px] font-bold uppercase leading-tight tracking-[0.08em] text-gray-500 dark:text-gray-400 min-[390px]:tracking-[0.1em]">{t("home_pct")}</div>
                                                        <div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{pred.probabilities.HOME?.toFixed(1)}%</div>
                                                    </div>
                                                    <div className="min-w-0 rounded-lg bg-white/70 px-1.5 py-2 dark:bg-gray-900/40">
                                                        <div className="break-words text-[9px] font-bold uppercase leading-tight tracking-[0.08em] text-gray-500 dark:text-gray-400 min-[390px]:tracking-[0.1em]">{t("draw_pct")}</div>
                                                        <div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{pred.probabilities.DRAW?.toFixed(1)}%</div>
                                                    </div>
                                                    <div className="min-w-0 rounded-lg bg-white/70 px-1.5 py-2 dark:bg-gray-900/40">
                                                        <div className="break-words text-[9px] font-bold uppercase leading-tight tracking-[0.08em] text-gray-500 dark:text-gray-400 min-[390px]:tracking-[0.1em]">{t("away_pct")}</div>
                                                        <div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{pred.probabilities.AWAY?.toFixed(1)}%</div>
                                                    </div>
                                                    <div className="min-w-0 rounded-lg bg-white/70 px-1.5 py-2 dark:bg-gray-900/40">
                                                        <div className="break-words text-[9px] font-bold uppercase leading-tight tracking-[0.08em] text-gray-500 dark:text-gray-400 min-[390px]:tracking-[0.1em]">{t("confidence")}</div>
                                                        <div className={`mt-1 text-sm font-bold ${(pred.confidence ?? 0) >= 60 ? "text-emerald-400" : (pred.confidence ?? 0) >= 45 ? "text-yellow-400" : "text-gray-500 dark:text-gray-400"}`}>
                                                            {pred.confidence !== null ? `${pred.confidence.toFixed(1)}%` : "-"}
                                                        </div>
                                                    </div>
                                                </div>
                                                {isFinished && pred.correct != null && (
                                                    <div className="mt-3 flex justify-end">
                                                        <span className={`text-xs font-bold ${pred.correct ? "text-emerald-400" : "text-red-400"}`}>
                                                            {pred.correct ? "\u2713" : "\u2717"}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="scrollbar-app hidden max-w-full overflow-x-auto md:block">
                                    <table className="w-full min-w-[720px] text-sm">
                                        <thead>
                                            <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-800">
                                                <th className="text-left py-2 px-2">{t("model")}</th>
                                                <th className="text-center py-2 px-2">{t("prediction")}</th>
                                                <th className="text-center py-2 px-2">{t("home_pct")}</th>
                                                <th className="text-center py-2 px-2">{t("draw_pct")}</th>
                                                <th className="text-center py-2 px-2">{t("away_pct")}</th>
                                                <th className="text-center py-2 px-2">{t("confidence")}</th>
                                                {isFinished && <th className="text-center py-2 px-2">{t("result")}</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {models.map(([name, pred]) => (
                                                <tr key={name} className="border-b border-gray-200 dark:border-gray-800/50">
                                                    <td className="py-2 px-2 text-gray-900 dark:text-white">{name}</td>
                                                    <td className="text-center py-2 px-2">
                                                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                                                            pred.prediction === "HOME" ? "bg-emerald-600/30 text-emerald-400" :
                                                            pred.prediction === "AWAY" ? "bg-blue-600/30 text-blue-400" :
                                                            "bg-yellow-600/30 text-yellow-400"
                                                        }`}>
                                                            {pred.prediction}
                                                        </span>
                                                    </td>
                                                    <td className="text-center py-2 px-2 text-gray-700 dark:text-gray-300">{pred.probabilities.HOME?.toFixed(1)}%</td>
                                                    <td className="text-center py-2 px-2 text-gray-700 dark:text-gray-300">{pred.probabilities.DRAW?.toFixed(1)}%</td>
                                                    <td className="text-center py-2 px-2 text-gray-700 dark:text-gray-300">{pred.probabilities.AWAY?.toFixed(1)}%</td>
                                                    <td className="text-center py-2 px-2">
                                                        <span className={`font-semibold ${(pred.confidence ?? 0) >= 60 ? "text-emerald-400" : (pred.confidence ?? 0) >= 45 ? "text-yellow-400" : "text-gray-500 dark:text-gray-400"}`}>
                                                            {pred.confidence !== null ? `${pred.confidence.toFixed(1)}%` : "-"}
                                                        </span>
                                                    </td>
                                                    {isFinished && (
                                                        <td className="text-center py-2 px-2">
                                                            {pred.correct != null && (
                                                                <span
                                                                    className={`text-xs font-bold ${pred.correct ? "text-emerald-400" : "text-red-400"}`}
                                                                    aria-label={pred.correct ? t("correct") : t("incorrect")}
                                                                    role="img"
                                                                >
                                                                    <span aria-hidden="true">{pred.correct ? "\u2713" : "\u2717"}</span>
                                                                </span>
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
