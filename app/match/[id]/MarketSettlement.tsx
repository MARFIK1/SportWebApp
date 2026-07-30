"use client";

import { CheckIcon, MinusIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { useLanguage } from "@/app/components/common/LanguageProvider";
import {
    buildMarketSettlements,
    type MarketSettlement as Settlement,
    type MarketSettlementKey,
} from "@/app/util/predictions/marketSettlement";
import { useMatchPredictionVariant } from "./MatchPredictionVariantProvider";

function marketLabel(key: MarketSettlementKey, t: (key: string) => string): string {
    if (key === "result") return "1X2";
    if (key === "btts") return t("btts_market");
    if (key === "over_1_5") return t("over_15");
    if (key === "over_2_5") return t("over_25");
    if (key === "corners_over_8_5") return t("corners_over_85");
    return t("cards_over_35");
}

function outcomeLabel(
    value: string | null,
    homeTeam: string,
    awayTeam: string,
    t: (key: string) => string,
): string {
    if (!value) return t("market_unavailable");
    if (value === "HOME") return homeTeam;
    if (value === "AWAY") return awayTeam;
    if (value === "DRAW") return t("draw");
    if (value === "YES") return t("yes");
    if (value === "NO") return t("no");
    if (value === "OVER") return t("over");
    if (value === "UNDER") return t("under");
    return value;
}

function actualLabel(
    settlement: Settlement,
    homeTeam: string,
    awayTeam: string,
    t: (key: string) => string,
): string {
    if (settlement.actualValue == null) return t("market_unavailable");
    if (settlement.key === "result" || settlement.key === "btts") {
        return outcomeLabel(String(settlement.actualValue), homeTeam, awayTeam, t);
    }
    if (settlement.key === "over_1_5" || settlement.key === "over_2_5") {
        return String(settlement.actualValue) + " " + t("goals_count");
    }
    if (settlement.key === "corners_over_8_5") {
        return String(settlement.actualValue) + " " + t("corners_count");
    }
    return String(settlement.actualValue) + " " + t("cards_count");
}

function Verdict({ settlement, t }: { settlement: Settlement; t: (key: string) => string }) {
    if (settlement.status === "correct") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">
                <CheckIcon className="h-4 w-4" />
                {t("correct")}
            </span>
        );
    }
    if (settlement.status === "incorrect") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-400">
                <XMarkIcon className="h-4 w-4" />
                {t("incorrect")}
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-500/10 px-2.5 py-1 text-xs font-bold text-gray-500 dark:text-gray-400">
            <MinusIcon className="h-4 w-4" />
            {t("market_unavailable")}
        </span>
    );
}

function MobileLabel({ children }: { children: React.ReactNode }) {
    return (
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-500 sm:hidden">
            {children}
        </span>
    );
}

export default function MarketSettlement() {
    const { t } = useLanguage();
    const { match, bundle, activeVariant } = useMatchPredictionVariant();
    const settlements = buildMarketSettlements({
        match,
        consensus: bundle.consensus,
        marketPredictions: bundle.marketPredictions,
    });

    return (
        <section className="mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900/50">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 px-4 py-4 dark:border-white/10 sm:px-6">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-400">{t("post_match_review")}</p>
                    <h3 className="mt-1 text-lg font-black text-gray-900 dark:text-white sm:text-xl">{t("market_settlement")}</h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("market_settlement_hint")}</p>
                </div>
                <span className="rounded-full border border-gray-200 px-3 py-1 text-xs font-bold text-gray-500 dark:border-white/10 dark:text-gray-400">
                    {activeVariant === "with_odds" ? t("with_odds") : t("without_odds")}
                </span>
            </div>

            <div className="hidden grid-cols-[1.1fr_1.2fr_0.7fr_1.2fr_auto] gap-4 border-b border-gray-200 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:border-white/10 dark:text-gray-500 sm:grid sm:px-6">
                <span>{t("market")}</span>
                <span>{t("predicted")}</span>
                <span>{t("probability")}</span>
                <span>{t("actual_value")}</span>
                <span className="text-right">{t("verdict")}</span>
            </div>

            <div className="divide-y divide-gray-200 dark:divide-white/10">
                {settlements.map((settlement) => (
                    <div
                        key={settlement.key}
                        className="grid grid-cols-2 items-center gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-[1.1fr_1.2fr_0.7fr_1.2fr_auto] sm:px-6"
                    >
                        <div>
                            <MobileLabel>{t("market")}</MobileLabel>
                            <span className="text-sm font-black text-gray-900 dark:text-white">
                                {marketLabel(settlement.key, t)}
                            </span>
                        </div>
                        <div>
                            <MobileLabel>{t("predicted")}</MobileLabel>
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                {outcomeLabel(settlement.prediction, match.home_team, match.away_team, t)}
                            </span>
                        </div>
                        <div>
                            <MobileLabel>{t("probability")}</MobileLabel>
                            <span className="font-mono text-sm font-bold tabular-nums text-gray-700 dark:text-gray-200">
                                {settlement.probability == null ? "-" : settlement.probability.toFixed(0) + "%"}
                            </span>
                        </div>
                        <div>
                            <MobileLabel>{t("actual_value")}</MobileLabel>
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                {actualLabel(settlement, match.home_team, match.away_team, t)}
                            </span>
                        </div>
                        <div className="sm:text-right">
                            <MobileLabel>{t("verdict")}</MobileLabel>
                            <Verdict settlement={settlement} t={t} />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
