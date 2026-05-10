"use client";

import { useLanguage } from "@/app/components/common/LanguageProvider";
import { ModelPrediction } from "@/types/predictions";
import { useMatchPredictionVariant } from "./MatchPredictionVariantProvider";

export default function MatchPredictions() {
    const { t } = useLanguage();
    const { bundle, matchFinished, activeVariant, canSwitchVariants } = useMatchPredictionVariant();
    const models = bundle.models;

    const outcomeLabel = (outcome: ModelPrediction["prediction"]) => {
        if (!outcome) return "-";
        if (outcome === "HOME") return t("home_short");
        if (outcome === "AWAY") return t("away_short");
        return t("draw_short");
    };

    if (models.length === 0) return null;

    return (
        <div className="mt-8 rounded-2xl bg-white p-4 dark:bg-gray-900/50 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t("all_model_predictions")}</h3>
                {canSwitchVariants && (
                    <span className="shrink-0 text-xs font-semibold text-emerald-400">
                        {activeVariant === "with_odds" ? t("with_odds") : t("without_odds")}
                    </span>
                )}
            </div>

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
                        {matchFinished && pred.correct != null && (
                            <div className="mt-3 flex justify-end">
                                <span className={`text-xs font-bold ${pred.correct ? "text-emerald-400" : "text-red-400"}`}>
                                    {pred.correct ? "\u2713" : "\u2717"}
                                </span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-3 px-2">{t("model")}</th>
                            <th className="text-center py-3 px-2">{t("prediction")}</th>
                            <th className="text-center py-3 px-2">{t("home_pct")}</th>
                            <th className="text-center py-3 px-2">{t("draw_pct")}</th>
                            <th className="text-center py-3 px-2">{t("away_pct")}</th>
                            <th className="text-center py-3 px-2">{t("confidence")}</th>
                            {matchFinished && (
                                <th className="text-center py-3 px-2">{t("result")}</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {models.map(([name, pred]) => (
                            <tr key={name} className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800/50">
                                <td className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{name}</td>
                                <td className="text-center py-3 px-2">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                                        pred.prediction === "HOME" ? "bg-emerald-600/30 text-emerald-400" :
                                        pred.prediction === "AWAY" ? "bg-blue-600/30 text-blue-400" :
                                        "bg-yellow-600/30 text-yellow-400"
                                    }`}>
                                        {outcomeLabel(pred.prediction)}
                                    </span>
                                </td>
                                <td className="text-center py-3 px-2 text-gray-700 dark:text-gray-300">{pred.probabilities.HOME?.toFixed(1)}%</td>
                                <td className="text-center py-3 px-2 text-gray-700 dark:text-gray-300">{pred.probabilities.DRAW?.toFixed(1)}%</td>
                                <td className="text-center py-3 px-2 text-gray-700 dark:text-gray-300">{pred.probabilities.AWAY?.toFixed(1)}%</td>
                                <td className="text-center py-3 px-2">
                                    <span className={`font-semibold ${(pred.confidence ?? 0) >= 60 ? "text-emerald-400" : (pred.confidence ?? 0) >= 45 ? "text-yellow-400" : "text-gray-500 dark:text-gray-400"}`}>
                                        {pred.confidence !== null ? `${pred.confidence.toFixed(1)}%` : "-"}
                                    </span>
                                </td>
                                {matchFinished && (
                                    <td className="text-center py-3 px-2">
                                        {pred.correct != null && (
                                            <span className={`text-xs font-bold ${pred.correct ? "text-emerald-400" : "text-red-400"}`}>
                                                {pred.correct ? "\u2713" : "\u2717"}
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
    );
}
