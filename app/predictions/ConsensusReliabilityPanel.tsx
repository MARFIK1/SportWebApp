import type {
    CompetitionReliabilityRow,
    ConsensusConfidenceBucketRow,
} from "../util/data/predictionService";
import { resolveCompetitionByDataPath } from "../util/league/leagueRegistry";

interface ConsensusReliabilityPanelProps {
    competitionRows: CompetitionReliabilityRow[];
    confidenceBuckets: ConsensusConfidenceBucketRow[];
    t: (key: string) => string;
}

function pct(value: number | null | undefined): string {
    return Number.isFinite(value) ? `${Number(value).toFixed(1)}%` : "-";
}

function competitionName(key: string): string {
    const registryName = resolveCompetitionByDataPath(key)?.name;
    if (registryName) return registryName;

    const parts = key.split("/").filter(Boolean);
    const fallback = parts.at(-1) ?? key;
    return fallback
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function Bar({ value, tone = "emerald" }: { value: number; tone?: "emerald" | "blue" }) {
    const color = tone === "blue" ? "bg-blue-400" : "bg-emerald-400";
    return (
        <div className="h-2 min-w-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div
                className={`h-full rounded-full ${color}`}
                style={{ width: `${Math.max(3, Math.min(100, value))}%` }}
            />
        </div>
    );
}

export default function ConsensusReliabilityPanel({
    competitionRows,
    confidenceBuckets,
    t,
}: ConsensusReliabilityPanelProps) {
    const visibleCompetitions = competitionRows
        .filter((row) => row.total > 0)
        .slice(0, 8);
    const visibleBuckets = confidenceBuckets.filter((row) => row.total > 0);

    if (visibleCompetitions.length === 0 && visibleBuckets.length === 0) return null;

    return (
        <section className="mt-6 grid gap-4 xl:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-gray-800 dark:bg-gray-900/50 dark:shadow-black/10 sm:p-5">
                <div className="mb-4">
                    <h2 className="text-lg font-black text-gray-900 dark:text-white">{t("public_competition_reliability")}</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("public_competition_hint")}</p>
                </div>

                <div className="space-y-3">
                    {visibleCompetitions.map((row) => (
                        <div key={row.competitionKey} className="grid min-w-0 gap-2 rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-black/20">
                            <div className="flex min-w-0 items-center justify-between gap-3">
                                <span className="truncate text-sm font-bold text-gray-900 dark:text-white">{competitionName(row.competitionKey)}</span>
                                <span className="shrink-0 text-sm font-black text-emerald-400">{pct(row.accuracy_pct)}</span>
                            </div>
                            <Bar value={row.accuracy_pct} />
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                                <span>{row.correct}/{row.total}</span>
                                <span>{t("avg_confidence")}: {pct(row.avg_confidence_pct)}</span>
                                <span>{t("sample")}: {row.total}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-gray-800 dark:bg-gray-900/50 dark:shadow-black/10 sm:p-5">
                <div className="mb-4">
                    <h2 className="text-lg font-black text-gray-900 dark:text-white">{t("public_consensus_buckets")}</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("public_consensus_buckets_hint")}</p>
                </div>

                <div className="space-y-3">
                    {visibleBuckets.map((row) => (
                        <div key={row.label} className="grid grid-cols-[64px_minmax(0,1fr)_70px] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-black/20">
                            <span className="text-sm font-black text-gray-900 dark:text-white">{row.label}</span>
                            <div className="min-w-0">
                                <Bar value={row.accuracy_pct} tone="blue" />
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                                    <span>{row.correct}/{row.total}</span>
                                    <span>{t("avg_confidence")}: {pct(row.avg_confidence_pct)}</span>
                                </div>
                            </div>
                            <span className="text-right text-sm font-black text-blue-400">{pct(row.accuracy_pct)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}