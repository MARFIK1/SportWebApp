import type {
    AccuracyOverTimePoint,
    ModelComparisonRow,
    ModelDiagnosticsArtifact,
    ModelDiagnosticStats,
} from "../util/data/predictionService";

interface PublicModelInsightsProps {
    comparison: ModelComparisonRow[];
    diagnostics: ModelDiagnosticsArtifact | null;
    accuracyOverTime: AccuracyOverTimePoint[];
    t: (key: string) => string;
}

interface ModelStat {
    model: string;
    stats: ModelDiagnosticStats;
}

function pct(value: number | null | undefined): string {
    return Number.isFinite(value) ? `${Number(value).toFixed(1)}%` : "-";
}

function brier(value: number | null | undefined): string {
    return Number.isFinite(value) ? Number(value).toFixed(4) : "-";
}

function modelStats(diagnostics: ModelDiagnosticsArtifact | null): ModelStat[] {
    if (!diagnostics) return [];
    return Object.entries(diagnostics.models)
        .filter(([model, stats]) => model !== "consensus" && stats.total > 0)
        .map(([model, stats]) => ({ model, stats }));
}

function latestTrend(accuracyOverTime: AccuracyOverTimePoint[], model: string): number | null {
    if (accuracyOverTime.length < 2) return null;
    const latest = accuracyOverTime[accuracyOverTime.length - 1]?.[model];
    const previous = accuracyOverTime[accuracyOverTime.length - 2]?.[model];
    if (typeof latest !== "number" || typeof previous !== "number") return null;
    return Math.round((latest - previous) * 10) / 10;
}

function InsightCard({
    label,
    value,
    detail,
    tone = "emerald",
}: {
    label: string;
    value: string;
    detail: string;
    tone?: "emerald" | "blue" | "amber";
}) {
    const valueClass = tone === "blue"
        ? "text-blue-400"
        : tone === "amber"
            ? "text-amber-400"
            : "text-emerald-400";

    return (
        <div className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-black/20">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{label}</div>
            <div className={`mt-2 truncate text-3xl font-black ${valueClass}`}>{value}</div>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{detail}</p>
        </div>
    );
}

export default function PublicModelInsights({
    comparison,
    diagnostics,
    accuracyOverTime,
    t,
}: PublicModelInsightsProps) {
    const rows = modelStats(diagnostics);
    const bestLive = [...comparison]
        .filter((row) => row.liveMatches > 0)
        .sort((a, b) => b.liveAccuracy - a.liveAccuracy)[0];
    const bestBrier = [...comparison]
        .filter((row) => row.brierScore > 0)
        .sort((a, b) => a.brierScore - b.brierScore)[0];
    const drawModel = [...rows].sort((a, b) =>
        b.stats.per_class.DRAW.recall_pct - a.stats.per_class.DRAW.recall_pct
    )[0];
    const confidenceModel = rows.find((row) => row.model === bestLive?.model) ?? rows[0];
    const trend = bestLive ? latestTrend(accuracyOverTime, bestLive.model) : null;

    if (!bestLive && !bestBrier && !drawModel && !confidenceModel) return null;

    return (
        <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-gray-800 dark:bg-gray-900/50 dark:shadow-black/10 sm:p-5">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-xl font-black text-gray-900 dark:text-white sm:text-2xl">{t("public_insights_title")}</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("public_insights_subtitle")}</p>
                </div>
                {trend !== null && (
                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${
                        trend >= 0
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
                            : "border-rose-400/30 bg-rose-400/10 text-rose-400"
                    }`}>
                        {bestLive?.model}: {trend >= 0 ? "+" : ""}{trend.toFixed(1)}pp
                    </span>
                )}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
                <InsightCard
                    label={t("public_best_live_model")}
                    value={bestLive ? pct(bestLive.liveAccuracy * 100) : "-"}
                    detail={bestLive ? `${bestLive.model} · ${bestLive.liveMatches} ${t("diagnostics_finished_matches")}` : t("empty_placeholder")}
                />
                <InsightCard
                    label={t("public_best_calibration")}
                    value={bestBrier ? brier(bestBrier.brierScore) : "-"}
                    detail={bestBrier ? `${bestBrier.model} · ${t("chart_brier")}` : t("empty_placeholder")}
                    tone="blue"
                />
                <InsightCard
                    label={t("public_draw_context")}
                    value={drawModel ? pct(drawModel.stats.per_class.DRAW.recall_pct) : "-"}
                    detail={drawModel ? `${drawModel.model} · ${t("public_draw_detail")}` : t("empty_placeholder")}
                    tone="amber"
                />
            </div>

            {confidenceModel?.stats.confidence_buckets?.length ? (
                <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-black/20">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-black uppercase tracking-[0.16em] text-gray-700 dark:text-gray-300">{t("public_confidence_quality")}</h3>
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{confidenceModel.model}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {confidenceModel.stats.confidence_buckets.map((bucket) => (
                            <div key={bucket.label} className="grid grid-cols-[54px_minmax(0,1fr)_54px] items-center gap-3 text-sm">
                                <span className="text-gray-500 dark:text-gray-400">{bucket.label}</span>
                                <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                                    <div
                                        className="h-full rounded-full bg-emerald-400"
                                        style={{ width: `${Math.max(3, Math.min(100, bucket.accuracy_pct))}%` }}
                                    />
                                </div>
                                <span className="text-right font-bold text-gray-900 dark:text-white">{pct(bucket.accuracy_pct)}</span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{t("public_confidence_hint")}</p>
                </div>
            ) : null}
        </section>
    );
}
