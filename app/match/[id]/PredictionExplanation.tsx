"use client";

import { getConsensusConfidence, getPredictionSignals, getPredictionStrength, type PredictionSignal } from "@/app/util/predictions/confidence";
import { getDrawWatchSignalFromModels } from "@/app/util/predictions/drawWatch";
import type { AnalysisMatch, MatchResult } from "@/types/predictions";
import { useLanguage } from "@/app/components/common/LanguageProvider";
import { useMatchPredictionVariant } from "./MatchPredictionVariantProvider";

interface PredictionExplanationProps {
    homeTeam: string;
    awayTeam: string;
    analysis: AnalysisMatch | null;
}

function pickLabel(outcome: MatchResult | null | undefined, homeTeam: string, awayTeam: string, drawLabel: string): string {
    if (outcome === "HOME") return homeTeam;
    if (outcome === "AWAY") return awayTeam;
    if (outcome === "DRAW") return drawLabel;
    return "-";
}

function formScore(form: string | undefined): number | null {
    if (!form) return null;
    let score = 0;
    for (const result of form) {
        if (result === "W") score += 3;
        if (result === "D") score += 1;
    }
    return score;
}

function hasMeaningfulPair(home: number | null | undefined, away: number | null | undefined): boolean {
    return (
        typeof home === "number" &&
        typeof away === "number" &&
        Number.isFinite(home) &&
        Number.isFinite(away) &&
        (Math.abs(home) > 0 || Math.abs(away) > 0)
    );
}
function getSignalTone(signal: PredictionSignal): string {
    if (signal.severity === "warning") return "border-amber-400/40 bg-amber-400/10 text-amber-600 dark:text-amber-300";
    return "border-sky-400/30 bg-sky-400/10 text-sky-600 dark:text-sky-300";
}

export default function PredictionExplanation({ homeTeam, awayTeam, analysis }: PredictionExplanationProps) {
    const { t } = useLanguage();
    const { bundle, match } = useMatchPredictionVariant();
    const consensus = bundle.consensus;
    const drawWatch = getDrawWatchSignalFromModels(bundle.models);

    if (!consensus) return null;

    const confidence = getConsensusConfidence(consensus);
    const strength = getPredictionStrength(consensus);
    const predictionSignals = getPredictionSignals(match, { consensus });
    const predictionLabel = pickLabel(consensus.prediction, homeTeam, awayTeam, t("draw"));
    const homeXg = analysis?.goals?.expected_goals_home;
    const awayXg = analysis?.goals?.expected_goals_away;
    const xgDiff = homeXg != null && awayXg != null ? homeXg - awayXg : null;
    const xgEdgeTeam = xgDiff == null || Math.abs(xgDiff) < 0.15 ? null : xgDiff > 0 ? homeTeam : awayTeam;
    const usesXgBasis =
        analysis?.data_quality?.goals_source === "xg" ||
        (analysis?.data_quality?.goals_source == null && hasMeaningfulPair(analysis?.goals?.home?.avg_xg_for, analysis?.goals?.away?.avg_xg_for));
    const homeSample = usesXgBasis
        ? analysis?.data_quality?.home_xg_n ?? analysis?.goals?.home?.xg_n
        : analysis?.data_quality?.home_history_n ?? analysis?.goals?.home?.n;
    const awaySample = usesXgBasis
        ? analysis?.data_quality?.away_xg_n ?? analysis?.goals?.away?.xg_n
        : analysis?.data_quality?.away_history_n ?? analysis?.goals?.away?.n;
    const homeFormScore = formScore(analysis?.form?.home);
    const awayFormScore = formScore(analysis?.form?.away);
    const formDiff = homeFormScore != null && awayFormScore != null ? homeFormScore - awayFormScore : null;
    const formEdgeTeam = formDiff == null || Math.abs(formDiff) < 2 ? null : formDiff > 0 ? homeTeam : awayTeam;

    return (
        <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 dark:bg-emerald-500/10 sm:p-5">
            <div className="mb-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
                    {t("prediction_reasoning")}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {t("prediction_reasoning_hint")}
                </p>
            </div>

            <div className="space-y-3">
                <div className="rounded-xl bg-white/80 p-3 dark:bg-gray-900/70">
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                        {t("consensus_pick")}
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-base font-black text-gray-900 dark:text-white">{predictionLabel}</span>
                        <span className="shrink-0 text-xl font-black text-emerald-500">{confidence.toFixed(0)}%</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{t("agreement")}: {consensus.agreement ?? "-"}</span>
                        <span className="rounded-full border border-gray-200 px-2 py-0.5 font-bold uppercase tracking-[0.12em] text-gray-500 dark:border-white/10 dark:text-gray-300">
                            {t(`prediction_strength_${strength.tier}`)}
                        </span>
                    </div>
                    {predictionSignals.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2" aria-label={t("prediction_signals")}>
                            {predictionSignals.map((signal) => (
                                <span
                                    key={signal.type}
                                    className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${getSignalTone(signal)}`}
                                >
                                    {t(`prediction_signal_${signal.type}`)}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div className="rounded-xl bg-white/70 p-3 dark:bg-gray-900/55">
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                            {usesXgBasis ? t("pre_match_xg_context") : t("pre_match_goal_context")}
                        </div>
                        <div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">
                            {xgEdgeTeam ?? t("balanced")}
                        </div>
                        {xgDiff != null && (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {homeXg?.toFixed(2)} - {awayXg?.toFixed(2)}
                            </div>
                        )}
                        {(homeSample != null || awaySample != null) && (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {usesXgBasis ? t("xg_basis") : t("recent_goals_basis")} {"\u2022"} {t("history_sample")}: {homeSample ?? "-"} / {awaySample ?? "-"}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl bg-white/70 p-3 dark:bg-gray-900/55">
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                            {t("form_context")}
                        </div>
                        <div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">
                            {formEdgeTeam ?? t("balanced")}
                        </div>
                        {homeFormScore != null && awayFormScore != null && (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {homeFormScore} - {awayFormScore} {t("points_short").toLowerCase()}
                            </div>
                        )}
                    </div>
                </div>

                <div className={`rounded-xl border p-3 ${drawWatch ? "border-amber-400/40 bg-amber-400/10" : "border-gray-200 bg-white/70 dark:border-white/10 dark:bg-gray-900/55"}`}>
                    <div className="flex items-center justify-between gap-3">
                        <span className={`text-[10px] font-black uppercase tracking-[0.14em] ${drawWatch ? "text-amber-600 dark:text-amber-300" : "text-gray-500 dark:text-gray-400"}`}>
                            {t("draw_watch")}
                        </span>
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                            {drawWatch ? drawWatch.model : t("no_draw_watch")}
                        </span>
                    </div>
                    {drawWatch && (
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <div>
                                <div className="text-gray-500 dark:text-gray-400">{t("draw_probability")}</div>
                                <div className="text-base font-black text-gray-900 dark:text-white">{drawWatch.drawProbability.toFixed(1)}%</div>
                            </div>
                            <div>
                                <div className="text-gray-500 dark:text-gray-400">{t("gap_to_best")}</div>
                                <div className="text-base font-black text-gray-900 dark:text-white">{drawWatch.gapToBest.toFixed(1)}pp</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
