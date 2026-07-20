import type {
    PredictionQualitySummary,
    PredictionQualityVariantSummary,
} from "@/types/predictions";

interface PredictionQualityPanelProps {
    quality: PredictionQualitySummary;
}

const STATUS_STYLES: Record<PredictionQualityVariantSummary["status"], string> = {
    complete: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500 dark:text-emerald-300",
    degraded: "border-rose-500/40 bg-rose-500/10 text-rose-500 dark:text-rose-300",
    legacy: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
};

function label(value: string): string {
    return value.replaceAll("_", " ");
}

function topFeatures(counts: Record<string, number>): string {
    const entries = Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 4);
    if (!entries.length) return "None";
    return entries.map(([feature, count]) => `${feature} (${count})`).join(", ");
}

function combineFeatureCounts(...sources: Record<string, number>[]): Record<string, number> {
    const combined: Record<string, number> = {};
    for (const source of sources) {
        for (const [feature, count] of Object.entries(source)) {
            combined[feature] = (combined[feature] ?? 0) + count;
        }
    }
    return combined;
}

function VariantRow({
    name,
    state,
}: {
    name: string;
    state: PredictionQualityVariantSummary;
}) {
    const coverage = state.coverage_pct ?? 0;
    const issueCounts = combineFeatureCounts(
        state.missing_feature_counts,
        state.invalid_feature_counts,
    );

    return (
        <div className="border-t border-gray-200 py-4 first:border-t-0 dark:border-gray-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-sm font-bold capitalize text-gray-900 dark:text-white">
                        {label(name)}
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {state.matches_evaluated} matches, {state.targets_evaluated} target evaluations
                    </p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${STATUS_STYLES[state.status]}`}>
                    {state.status}
                </span>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="font-semibold text-gray-600 dark:text-gray-300">Feature coverage</span>
                        <span className="font-bold text-gray-900 dark:text-white">
                            {state.coverage_pct === null ? "N/A" : `${state.coverage_pct.toFixed(1)}%`}
                        </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                        <div
                            className={`h-full rounded-full ${state.status === "complete" ? "bg-emerald-500" : "bg-amber-400"}`}
                            style={{ width: `${Math.max(0, Math.min(100, coverage))}%` }}
                        />
                    </div>
                </div>

                <dl className="grid grid-cols-3 gap-x-5 text-right">
                    <div>
                        <dt className="text-[10px] font-semibold uppercase text-gray-400">Defaulted</dt>
                        <dd className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{state.defaulted_feature_count}</dd>
                    </div>
                    <div>
                        <dt className="text-[10px] font-semibold uppercase text-gray-400">Drift</dt>
                        <dd className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{state.drift_warning_targets}</dd>
                    </div>
                    <div>
                        <dt className="text-[10px] font-semibold uppercase text-gray-400">Legacy</dt>
                        <dd className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{state.missing_quality_targets}</dd>
                    </div>
                </dl>
            </div>

            <div className="mt-3 grid gap-2 text-xs text-gray-500 dark:text-gray-400 md:grid-cols-2">
                <p className="min-w-0 truncate" title={topFeatures(issueCounts)}>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Input issues:</span>{" "}
                    {topFeatures(issueCounts)}
                </p>
                <p className="min-w-0 truncate" title={topFeatures(state.drifted_feature_counts)}>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Drifted:</span>{" "}
                    {topFeatures(state.drifted_feature_counts)}
                </p>
            </div>
        </div>
    );
}

export default function PredictionQualityPanel({ quality }: PredictionQualityPanelProps) {
    const variants = Object.entries(quality.variants).filter(
        (entry): entry is [string, PredictionQualityVariantSummary] => Boolean(entry[1]),
    );

    return (
        <section className="mt-6 rounded-lg border border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900/50 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3 py-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Prediction input quality
                </h2>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${
                    quality.status === "complete"
                        ? STATUS_STYLES.complete
                        : quality.status === "degraded"
                            ? STATUS_STYLES.degraded
                            : STATUS_STYLES.legacy
                }`}>
                    {quality.status}
                </span>
            </div>

            {variants.length ? variants.map(([name, state]) => (
                <VariantRow key={name} name={name} state={state} />
            )) : (
                <p className="border-t border-gray-200 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    No input-quality metadata is available for this report.
                </p>
            )}
        </section>
    );
}