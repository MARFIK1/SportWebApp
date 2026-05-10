"use client";

import { useLanguage } from "@/app/components/common/LanguageProvider";
import type { MatchResult, ModelPrediction } from "@/types/predictions";
import { useOptionalMatchPredictionVariant } from "./MatchPredictionVariantProvider";

interface StatItem {
    type: string;
    homeValue: number;
    awayValue: number;
}

interface PostMatchInsightsProps {
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    actualResult: MatchResult;
    stats: StatItem[];
    xgHome: number | null;
    xgAway: number | null;
}

const EPSILON = 0.05;

function outcomeLabel(outcome: MatchResult, t: (key: string) => string): string {
    if (outcome === "HOME") return t("home_short");
    if (outcome === "AWAY") return t("away_short");
    return t("draw_short");
}

function outcomeTeamLabel(outcome: MatchResult, homeTeam: string, awayTeam: string, t: (key: string) => string): string {
    if (outcome === "HOME") return homeTeam;
    if (outcome === "AWAY") return awayTeam;
    return t("draw");
}

function getStat(stats: StatItem[], type: string): StatItem | null {
    return stats.find((stat) => stat.type === type) ?? null;
}

function safePct(part: number | null, total: number | null): number | null {
    if (part == null || total == null || total <= 0) return null;
    return (part / total) * 100;
}

function safeRatio(part: number | null, total: number | null): number | null {
    if (part == null || total == null || total <= 0) return null;
    return part / total;
}

function formatPct(value: number | null): string {
    return value == null ? "-" : `${value.toFixed(0)}%`;
}

function formatRatio(value: number | null): string {
    return value == null ? "-" : value.toFixed(2);
}

function getXgWinner(xgHome: number | null, xgAway: number | null): MatchResult {
    if (xgHome == null || xgAway == null) return "DRAW";
    if (xgHome > xgAway + EPSILON) return "HOME";
    if (xgAway > xgHome + EPSILON) return "AWAY";
    return "DRAW";
}

function getBestConfidenceModel(models: [string, ModelPrediction][]): [string, ModelPrediction] | null {
    let best: [string, ModelPrediction] | null = null;
    for (const model of models) {
        if ((model[1].confidence ?? -1) > (best?.[1].confidence ?? -1)) best = model;
    }
    return best;
}

function MetricCard({ label, home, away, homeTeam, awayTeam }: { label: string; home: string; away: string; homeTeam: string; awayTeam: string }) {
    return (
        <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-gray-800/50">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{label}</div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="min-w-0">
                    <div className="truncate text-xs text-gray-500 dark:text-gray-400">{homeTeam}</div>
                    <div className="text-xl font-black text-emerald-400">{home}</div>
                </div>
                <div className="text-xs font-bold uppercase text-gray-400 dark:text-gray-600">vs</div>
                <div className="min-w-0 text-right">
                    <div className="truncate text-xs text-gray-500 dark:text-gray-400">{awayTeam}</div>
                    <div className="text-xl font-black text-blue-400">{away}</div>
                </div>
            </div>
        </div>
    );
}

export default function PostMatchInsights({ homeTeam, awayTeam, homeScore, awayScore, actualResult, stats, xgHome, xgAway }: PostMatchInsightsProps) {
    const { t } = useLanguage();
    const bundle = useOptionalMatchPredictionVariant()?.bundle;

    const xg = getStat(stats, "Expected Goals (xG)");
    const totalShots = getStat(stats, "Total Shots");
    const shotsOnGoal = getStat(stats, "Shots on Goal");
    const passes = getStat(stats, "Total Passes");
    const accuratePasses = getStat(stats, "Accurate Passes");
    const displayXgHome = xg?.homeValue ?? xgHome;
    const displayXgAway = xg?.awayValue ?? xgAway;
    const hasXg = displayXgHome != null && displayXgAway != null;
    const xgWinner = getXgWinner(displayXgHome, displayXgAway);
    const resultFollowedXg = hasXg ? xgWinner === actualResult : null;
    const models = bundle?.models ?? [];
    const modelHits = models.filter(([, prediction]) => prediction.correct === true).length;
    const bestConfidenceModel = getBestConfidenceModel(models);
    const consensus = bundle?.consensus;
    const consensusPrediction = consensus?.prediction ?? null;

    const cards = [
        {
            label: t("shot_accuracy"),
            home: formatPct(safePct(shotsOnGoal?.homeValue ?? null, totalShots?.homeValue ?? null)),
            away: formatPct(safePct(shotsOnGoal?.awayValue ?? null, totalShots?.awayValue ?? null)),
        },
        {
            label: t("goal_conversion"),
            home: formatPct(safePct(homeScore, totalShots?.homeValue ?? null)),
            away: formatPct(safePct(awayScore, totalShots?.awayValue ?? null)),
        },
        {
            label: t("xg_per_shot"),
            home: formatRatio(safeRatio(xg?.homeValue ?? null, totalShots?.homeValue ?? null)),
            away: formatRatio(safeRatio(xg?.awayValue ?? null, totalShots?.awayValue ?? null)),
        },
        {
            label: t("pass_accuracy"),
            home: formatPct(safePct(accuratePasses?.homeValue ?? null, passes?.homeValue ?? null)),
            away: formatPct(safePct(accuratePasses?.awayValue ?? null, passes?.awayValue ?? null)),
        },
    ].filter((card) => card.home !== "-" || card.away !== "-");

    return (
        <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-gray-900/50 sm:p-6">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-400">{t("post_match_review")}</p>
                    <h3 className="mt-1 text-lg font-black text-gray-900 dark:text-white sm:text-xl">{t("match_verdict")}</h3>
                </div>
                <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{homeScore} - {awayScore}</div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-gray-800/50">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{t("actual_result")}</div>
                    <div className="mt-3"><span className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-black text-white">{outcomeLabel(actualResult, t)}</span></div>
                    <div className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{outcomeTeamLabel(actualResult, homeTeam, awayTeam, t)}</div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-gray-800/50">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{t("xg_story")}</div>
                    <div className="mt-3 text-2xl font-black text-gray-900 dark:text-white">{hasXg ? `${displayXgHome.toFixed(2)} - ${displayXgAway.toFixed(2)}` : "-"}</div>
                    <div className={`mt-2 text-sm font-semibold ${resultFollowedXg === false ? "text-amber-400" : "text-emerald-400"}`}>
                        {hasXg ? (xg ? (resultFollowedXg ? t("scoreline_followed_xg") : t("scoreline_beat_xg")) : t("pre_match_xg_context")) : t("market_unavailable")}
                    </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-gray-800/50">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{t("prediction_review")}</div>
                    <div className={`mt-3 text-2xl font-black ${consensus?.correct == null ? "text-gray-500 dark:text-gray-400" : consensus.correct ? "text-emerald-400" : "text-red-400"}`}>
                        {consensus?.correct == null ? "-" : consensus.correct ? t("correct") : t("incorrect")}
                    </div>
                    <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                        {consensusPrediction ? `${t("consensus_pick")}: ${outcomeLabel(consensusPrediction, t)}` : t("no_prediction_review")}
                    </div>
                </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {models.length > 0 && (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-gray-800/50">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{t("models_correct")}</div>
                                <div className="mt-2 text-2xl font-black text-emerald-400">{modelHits}/{models.length}</div>
                            </div>
                            {bestConfidenceModel && (
                                <div className="text-right">
                                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{t("best_confidence_model")}</div>
                                    <div className="mt-2 text-sm font-bold text-gray-900 dark:text-white">{bestConfidenceModel[0]}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{bestConfidenceModel[1].confidence != null ? `${bestConfidenceModel[1].confidence.toFixed(1)}%` : "-"}</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-gray-800/50">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{t("xg_advantage")}</div>
                    <div className="mt-2 text-lg font-black text-gray-900 dark:text-white">{hasXg ? outcomeTeamLabel(xgWinner, homeTeam, awayTeam, t) : "-"}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {hasXg && displayXgHome != null && displayXgAway != null ? `${Math.abs(displayXgHome - displayXgAway).toFixed(2)} xG` : t("market_unavailable")}
                    </div>
                </div>
            </div>

            {cards.length > 0 && (
                <div className="mt-5">
                    <h4 className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{t("efficiency")}</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                        {cards.map((card) => <MetricCard key={card.label} label={card.label} home={card.home} away={card.away} homeTeam={homeTeam} awayTeam={awayTeam} />)}
                    </div>
                </div>
            )}
        </section>
    );
}
