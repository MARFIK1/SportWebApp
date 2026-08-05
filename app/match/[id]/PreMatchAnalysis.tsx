"use client";

import { useLanguage } from "@/app/components/common/LanguageProvider";
import type { AnalysisMatch } from "@/types/predictions";

interface PreMatchAnalysisProps {
    analysis: AnalysisMatch;
}

function FormSequence({ value }: { value: string }) {
    return (
        <div className="flex shrink-0 gap-1">
            {value.split("").map((result, index) => (
                <span
                    key={`${result}-${index}`}
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                        result === "W" ? "bg-emerald-600" : result === "D" ? "bg-gray-600" : "bg-red-600"
                    }`}
                >
                    {result}
                </span>
            ))}
        </div>
    );
}

export default function PreMatchAnalysis({ analysis }: PreMatchAnalysisProps) {
    const { t } = useLanguage();

    return (
        <section className="rounded-2xl bg-white p-4 dark:bg-gray-900/50 sm:p-6">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t("pre_match_analysis")}
            </h3>
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
                        <FormSequence value={analysis.form.home} />
                    </div>
                )}
                {analysis.form?.away && (
                    <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 text-gray-500 dark:text-gray-400">{t("away_form")}</span>
                        <FormSequence value={analysis.form.away} />
                    </div>
                )}
            </div>
        </section>
    );
}
