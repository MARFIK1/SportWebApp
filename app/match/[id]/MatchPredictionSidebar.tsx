"use client";

import { useLanguage } from "@/app/components/common/LanguageProvider";
import { PredictionVariantKey } from "@/types/predictions";
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

export default function MatchPredictionSidebar() {
    const { t } = useLanguage();
    const {
        availableVariants,
        activeVariant,
        canSwitchVariants,
        setActiveVariant,
        bundle,
        matchFinished,
    } = useMatchPredictionVariant();
    const showMarketPanel = Boolean(bundle.marketPredictions) || bundle.skippedTargets.length > 0;

    return (
        <>
            {canSwitchVariants && (
                <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-4">
                    <div className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        {t("prediction_variant")}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {availableVariants.map((variant) => (
                            <button
                                key={variant}
                                type="button"
                                onClick={() => setActiveVariant(variant)}
                                className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
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

            {bundle.consensus && (
                <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("match_insight")}</h3>
                        <span className="text-xs text-emerald-400 font-semibold">{t("consensus")}</span>
                    </div>
                    <div className="flex justify-between gap-3 mb-4">
                        {(["HOME", "DRAW", "AWAY"] as const).map((outcome) => (
                            <div
                                key={outcome}
                                className={`flex-1 text-center p-3 rounded-xl ${
                                    bundle.consensus?.prediction === outcome ? "bg-emerald-600/30 border border-emerald-500" : "bg-gray-100 dark:bg-gray-800"
                                }`}
                            >
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                    {getOutcomeLabel(outcome, t)}
                                </div>
                                <div className="text-xl font-bold">
                                    {(bundle.consensus?.avg_probabilities?.[outcome] ?? 0).toFixed(0)}%
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">{t("model_confidence")}</span>
                            <span className="text-gray-900 dark:text-white font-semibold">
                                {maxProbability(bundle.consensus.avg_probabilities).toFixed(0)}%
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
                <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-6">
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
                                        <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">{getMarketLabel(key, t)}</div>
                                        <div className="text-xl font-bold text-gray-400 dark:text-gray-500">-</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-500">{t("market_unavailable")}</div>
                                    </div>
                                );
                            }
                            const prob = maxProbability(market.consensus.avg_probabilities);
                            return (
                                <div key={key} className="min-h-[84px] bg-gray-100 dark:bg-gray-800 rounded-xl p-3">
                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">{getMarketLabel(key, t)}</div>
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
