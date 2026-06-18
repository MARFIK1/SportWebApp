"use client";

import { useLanguage } from "@/app/components/common/LanguageProvider";
import { PredictionVariantKey } from "@/types/predictions";
import { getPredictionStrength, type PredictionStrengthTier } from "@/app/util/predictions/confidence";
import { getDrawWatchSignalFromModels } from "@/app/util/predictions/drawWatch";
import { useMatchPredictionVariant } from "./MatchPredictionVariantProvider";

const PRIMARY_MARKETS = [
    "btts",
    "over_2_5",
    "over_1_5",
    "corners_over_8_5",
    "cards_over_3_5",
] as const;

function maxProbability(probs: Record<string, number> | undefined): number {
    if (!probs) return 0;
    const values = Object.values(probs);
    return values.length > 0 ? Math.max(...values) : 0;
}

function getOutcomeLabel(outcome: "HOME" | "DRAW" | "AWAY", t: (key: string) => string): string {
    if (outcome === "HOME") return t("home_short");
    if (outcome === "AWAY") return t("away_short");
    return t("draw_short");
}

function getMarketLabel(key: string, t: (key: string) => string): string {
    if (key === "btts") return t("btts_yes");
    if (key === "over_2_5") return t("over_25");
    if (key === "over_1_5") return t("over_15");
    if (key === "corners_over_8_5") return t("corners_over_85");
    if (key === "cards_over_3_5") return t("cards_over_35");
    return key;
}

function getMarketPredictionLabel(value: string | number | null, t: (key: string) => string): string {
    if (value === null) return "-";
    if (value === "YES") return t("yes");
    if (value === "NO") return t("no");
    if (value === "OVER") return t("over");
    if (value === "UNDER") return t("under");
    return String(value);
}

function getVariantLabel(variant: PredictionVariantKey, t: (key: string) => string): string {
    return variant === "with_odds" ? t("with_odds") : t("without_odds");
}

function getStrengthTone(tier: PredictionStrengthTier): string {
    if (tier === "strong") return "text-emerald-400";
    if (tier === "lean") return "text-amber-400";
    return "text-gray-400";
}

export default function MatchPredictionSidebar() {
    const { t } = useLanguage();
    const {
        availableVariants,
        activeVariant,
        canSwitchVariants,
        setActiveVariant,
        bundle,
        matchFinished,
        oddsAvailability,
    } = useMatchPredictionVariant();
    const showMarketPanel = Boolean(bundle.marketPredictions) || bundle.skippedTargets.length > 0;
    const drawWatch = getDrawWatchSignalFromModels(bundle.models);
    const strength = getPredictionStrength(bundle.consensus);
    const missingBaseOdds = oddsAvailability?.has_base_odds === false
        ? oddsAvailability.missing_base_odds
        : [];
    const showWithOddsUnavailable = !availableVariants.includes("with_odds") && missingBaseOdds.length > 0;

    return (
        <>
            {canSwitchVariants && (
                <div className="rounded-2xl bg-white p-4 dark:bg-gray-900/50">
                    <div className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        {t("prediction_variant")}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {availableVariants.map((variant) => (
                            <button
                                key={variant}
                                type="button"
                                onClick={() => setActiveVariant(variant)}
                                className={`min-w-0 rounded-xl px-3 py-3 text-sm font-semibold transition-colors sm:px-4 ${
                                    activeVariant === variant
                                        ? "bg-emerald-600 text-white"
                                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                                }`}
                            >
                                {getVariantLabel(variant, t)}
                            </button>
                        ))}
                    </div>
                    {activeVariant === "with_odds" && bundle.skippedTargets.length > 0 && (
                        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                            {t("variant_partial_markets")}
                        </p>
                    )}
                </div>
            )}

            {showWithOddsUnavailable && (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-xs text-amber-700 dark:text-amber-200">
                    <div className="font-black uppercase tracking-[0.14em]">
                        {t("with_odds_unavailable")}
                    </div>
                    <div className="mt-2 text-gray-600 dark:text-gray-300">
                        {t("with_odds_missing_base")}: {missingBaseOdds.join(", ")}
                    </div>
                </div>
            )}

            {bundle.consensus && (
                <div className="rounded-2xl bg-white p-4 dark:bg-gray-900/50 sm:p-6">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("match_insight")}</h3>
                        <span className="text-xs text-emerald-400 font-semibold">{t("consensus")}</span>
                    </div>
                    <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
                        {(["HOME", "DRAW", "AWAY"] as const).map((outcome) => (
                            <div
                                key={outcome}
                                className={`min-w-0 rounded-xl p-2.5 text-center sm:p-3 ${
                                    bundle.consensus?.prediction === outcome ? "bg-emerald-600/30 border border-emerald-500" : "bg-gray-100 dark:bg-gray-800"
                                }`}
                            >
                                <div className="mb-1 truncate text-[11px] text-gray-500 dark:text-gray-400 sm:text-xs">
                                    {getOutcomeLabel(outcome, t)}
                                </div>
                                <div className="text-lg font-bold sm:text-xl">
                                    {(bundle.consensus?.avg_probabilities?.[outcome] ?? 0).toFixed(0)}%
                                </div>
                            </div>
                        ))}
                    </div>
                    {drawWatch && (
                        <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-600 dark:text-amber-300">
                                    {t("draw_watch")}
                                </span>
                                <span className="text-xs font-semibold text-amber-700 dark:text-amber-200">
                                    {drawWatch.model}
                                </span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-lg bg-white/50 px-2.5 py-2 dark:bg-black/20">
                                    <div className="text-gray-500 dark:text-gray-400">{t("draw_probability")}</div>
                                    <div className="mt-1 text-base font-black text-gray-900 dark:text-white">
                                        {drawWatch.drawProbability.toFixed(1)}%
                                    </div>
                                </div>
                                <div className="rounded-lg bg-white/50 px-2.5 py-2 dark:bg-black/20">
                                    <div className="text-gray-500 dark:text-gray-400">{t("gap_to_best")}</div>
                                    <div className="mt-1 text-base font-black text-gray-900 dark:text-white">
                                        {drawWatch.gapToBest.toFixed(1)}pp
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">{t("model_confidence")}</span>
                            <span className="text-gray-900 dark:text-white font-semibold">
                                {maxProbability(bundle.consensus.avg_probabilities).toFixed(0)}%
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">{t("prediction_strength")}</span>
                            <span className={`font-semibold ${getStrengthTone(strength.tier)}`}>
                                {t(`prediction_strength_${strength.tier}`)}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">{t("agreement")}</span>
                            <span className="text-gray-900 dark:text-white font-semibold">{bundle.consensus.agreement}</span>
                        </div>
                        {matchFinished && bundle.consensus.correct != null && (
                            <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">{t("result")}</span>
                                <span className={`font-semibold ${bundle.consensus.correct ? "text-emerald-400" : "text-red-400"}`}>
                                    {bundle.consensus.correct ? t("correct") : t("incorrect")}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showMarketPanel && (
                <div className="rounded-2xl bg-white p-4 dark:bg-gray-900/50 sm:p-6">
                    <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t("advanced_markets")}</h3>
                    <div className="grid grid-cols-2 gap-3">
                        {PRIMARY_MARKETS.map((key) => {
                            const market = bundle.marketPredictions?.[key];
                            if (!market?.consensus) {
                                return (
                                    <div
                                        key={key}
                                        className="min-h-[84px] rounded-xl border border-dashed border-gray-300 bg-gray-100/70 p-3 opacity-80 dark:border-gray-700 dark:bg-gray-800/40"
                                    >
                                        <div className="break-words text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{getMarketLabel(key, t)}</div>
                                        <div className="text-xl font-bold text-gray-400 dark:text-gray-500">-</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-500">{t("market_unavailable")}</div>
                                    </div>
                                );
                            }
                            const prob = maxProbability(market.consensus.avg_probabilities);
                            return (
                                <div key={key} className="min-h-[84px] rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
                                    <div className="break-words text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{getMarketLabel(key, t)}</div>
                                    <div className="text-xl font-bold text-emerald-400">{prob.toFixed(0)}%</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{getMarketPredictionLabel(market.consensus.prediction, t)}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </>
    );
}
