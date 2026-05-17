import type { ModelDiagnosticsArtifact, ModelDiagnosticStats } from "@/app/util/data/predictionService";
import { resolveCompetitionByDataPath } from "@/app/util/league/leagueRegistry";

interface ModelDiagnosticsPanelProps {
    diagnostics: ModelDiagnosticsArtifact | null;
    t: (key: string) => string;
}

interface ModelRow {
    model: string;
    stats: ModelDiagnosticStats;
}

function pct(value: number | null | undefined): string {
    return Number.isFinite(value) ? `${Number(value).toFixed(1)}%` : "-";
}

function brier(value: number | null | undefined): string {
    return Number.isFinite(value) ? Number(value).toFixed(4) : "-";
}

function modelRows(diagnostics: ModelDiagnosticsArtifact): ModelRow[] {
    return Object.entries(diagnostics.models)
        .filter(([, stats]) => stats.total > 0)
        .map(([model, stats]) => ({ model, stats }))
        .sort((a, b) => b.stats.accuracy_pct - a.stats.accuracy_pct || a.model.localeCompare(b.model));
}

function bestAccuracyModel(rows: ModelRow[]): ModelRow | null {
    return rows.find((row) => row.model !== "consensus") ?? rows[0] ?? null;
}

function bestBrierModel(rows: ModelRow[]): ModelRow | null {
    return rows
        .filter((row) => row.model !== "consensus" && row.stats.brier_score != null)
        .sort((a, b) => (a.stats.brier_score ?? 99) - (b.stats.brier_score ?? 99))[0] ?? null;
}

function drawWatchSummary(stats: ModelDiagnosticStats | undefined) {
    const rows = stats?.draw_watch_matches ?? [];
    const total = rows.length;
    const actualDraws = rows.filter((row) => row.actual_result === "DRAW").length;
    const fixedDraws = rows.filter((row) => row.effect === "fixed_draw").length;
    const lostHits = rows.filter((row) => row.effect === "lost_hit").length;
    const threshold = rows[0]?.rule_threshold_pct ?? 26;
    const gap = rows[0]?.rule_max_gap_to_best_pct ?? 10;

    return {
        total,
        actualDrawRate: total > 0 ? (actualDraws / total) * 100 : 0,
        fixedDraws,
        lostHits,
        threshold,
        gap,
    };
}

function leagueName(dataPath: string): string {
    const competition = resolveCompetitionByDataPath(dataPath);
    return competition?.name ?? dataPath.split("/").slice(-1)[0]?.replaceAll("_", " ") ?? dataPath;
}

function leagueRows(stats: ModelDiagnosticStats, direction: "best" | "weakest") {
    return Object.entries(stats.league_accuracy)
        .map(([league, row]) => ({ league, ...row }))
        .filter((row) => row.total >= 20)
        .sort((a, b) => (
            direction === "best"
                ? b.accuracy_pct - a.accuracy_pct || b.total - a.total
                : a.accuracy_pct - b.accuracy_pct || b.total - a.total
        ))
        .slice(0, 5);
}

function drawRuleRows(stats: ModelDiagnosticStats) {
    return [...stats.draw_threshold_sweep]
        .filter((row) => row.draw_predicted >= 20)
        .sort((a, b) =>
            b.draw_precision_pct - a.draw_precision_pct ||
            a.accuracy_loss_pct - b.accuracy_loss_pct ||
            b.draw_predicted - a.draw_predicted
        )
        .slice(0, 4);
}

function StatCard({
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
    const toneClass = tone === "blue"
        ? "border-blue-400/25 bg-blue-400/10 text-blue-400"
        : tone === "amber"
            ? "border-amber-400/25 bg-amber-400/10 text-amber-300"
            : "border-emerald-400/25 bg-emerald-400/10 text-emerald-400";

    return (
        <div className={`min-w-0 rounded-2xl border p-4 ${toneClass}`}>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{label}</div>
            <div className="mt-3 truncate text-3xl font-black text-gray-900 dark:text-white">{value}</div>
            <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{detail}</div>
        </div>
    );
}

export default function ModelDiagnosticsPanel({ diagnostics, t }: ModelDiagnosticsPanelProps) {
    if (!diagnostics) {
        return (
            <section className="mt-6 rounded-3xl border border-dashed border-gray-300 bg-white/70 p-5 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900/30 dark:text-gray-400">
                {t("diagnostics_missing")}
            </section>
        );
    }

    const rows = modelRows(diagnostics);
    const bestModel = bestAccuracyModel(rows);
    const calibrated = bestBrierModel(rows);
    const drawRows = rows
        .filter((row) => row.model !== "consensus")
        .sort((a, b) => b.stats.per_class.DRAW.recall_pct - a.stats.per_class.DRAW.recall_pct);
    const drawWatchModel = rows.find((row) => row.model === "LightGBM") ?? bestModel;
    const drawWatch = drawWatchSummary(drawWatchModel?.stats);
    const confidenceModel = bestModel;
    const bestLeagues = bestModel ? leagueRows(bestModel.stats, "best") : [];
    const weakestLeagues = bestModel ? leagueRows(bestModel.stats, "weakest") : [];
    const rules = drawWatchModel ? drawRuleRows(drawWatchModel.stats) : [];

    return (
        <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-gray-800 dark:bg-gray-900/50 dark:shadow-black/10 sm:p-5">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-xl font-black text-gray-900 dark:text-white sm:text-2xl">{t("diagnostics_title")}</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {diagnostics.date_range.first} - {diagnostics.date_range.last} · {diagnostics.finished_matches} {t("diagnostics_finished_matches")}
                    </p>
                </div>
                <div className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                    {t("diagnostics_reports")}: {diagnostics.reports_read}
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label={t("diagnostics_best_accuracy")}
                    value={bestModel ? pct(bestModel.stats.accuracy_pct) : "-"}
                    detail={bestModel?.model ?? t("empty_placeholder")}
                />
                <StatCard
                    label={t("diagnostics_best_brier")}
                    value={calibrated ? brier(calibrated.stats.brier_score) : "-"}
                    detail={calibrated?.model ?? t("empty_placeholder")}
                    tone="blue"
                />
                <StatCard
                    label={t("diagnostics_draw_recall")}
                    value={drawRows[0] ? pct(drawRows[0].stats.per_class.DRAW.recall_pct) : "-"}
                    detail={drawRows[0]?.model ?? t("empty_placeholder")}
                    tone="amber"
                />
                <StatCard
                    label={t("diagnostics_draw_watch")}
                    value={pct(drawWatch.actualDrawRate)}
                    detail={`${drawWatch.total} ${t("diagnostics_flags")}, ${drawWatch.fixedDraws} ${t("diagnostics_fixed_draws")}`}
                    tone="amber"
                />
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-black/20">
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="text-sm font-black uppercase tracking-[0.16em] text-gray-700 dark:text-gray-300">{t("diagnostics_draw_watch_rules")}</h3>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {drawWatchModel?.model ?? "LightGBM"} · DRAW &gt;= {drawWatch.threshold}% · gap &lt;= {drawWatch.gap}pp
                        </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-white p-3 dark:bg-gray-900/70">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{t("diagnostics_actual_draw_rate")}</div>
                            <div className="mt-1 text-2xl font-black text-amber-400">{pct(drawWatch.actualDrawRate)}</div>
                        </div>
                        <div className="rounded-xl bg-white p-3 dark:bg-gray-900/70">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{t("diagnostics_fixed_draws")}</div>
                            <div className="mt-1 text-2xl font-black text-emerald-400">{drawWatch.fixedDraws}</div>
                        </div>
                        <div className="rounded-xl bg-white p-3 dark:bg-gray-900/70">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{t("diagnostics_lost_hits")}</div>
                            <div className="mt-1 text-2xl font-black text-rose-400">{drawWatch.lostHits}</div>
                        </div>
                    </div>
                    {rules.length > 0 && (
                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full min-w-[620px] text-sm">
                                <thead className="text-xs uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
                                    <tr>
                                        <th className="px-2 py-2 text-left">{t("diagnostics_rule")}</th>
                                        <th className="px-2 py-2 text-right">{t("diagnostics_flags")}</th>
                                        <th className="px-2 py-2 text-right">{t("diagnostics_actual_draw_rate")}</th>
                                        <th className="px-2 py-2 text-right">{t("diagnostics_accuracy_loss")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rules.map((rule) => (
                                        <tr key={`${rule.threshold_pct}-${rule.max_gap_to_best_pct}`} className="border-t border-gray-200 dark:border-gray-800">
                                            <td className="px-2 py-2 font-semibold text-gray-900 dark:text-white">
                                                DRAW &gt;= {rule.threshold_pct}%, gap &lt;= {rule.max_gap_to_best_pct}pp
                                            </td>
                                            <td className="px-2 py-2 text-right text-gray-600 dark:text-gray-300">{rule.draw_predicted}</td>
                                            <td className="px-2 py-2 text-right font-bold text-amber-400">{pct(rule.draw_precision_pct)}</td>
                                            <td className="px-2 py-2 text-right text-gray-600 dark:text-gray-300">{pct(rule.accuracy_loss_pct)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-black/20">
                    <h3 className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-gray-700 dark:text-gray-300">{t("diagnostics_draw_class")}</h3>
                    <div className="space-y-2">
                        {drawRows.slice(0, 6).map((row) => (
                            <div key={row.model} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 dark:bg-gray-900/70">
                                <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">{row.model}</span>
                                <span className="shrink-0 text-sm font-black text-amber-400">{pct(row.stats.per_class.DRAW.recall_pct)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {confidenceModel && (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-black/20">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-gray-700 dark:text-gray-300">{t("diagnostics_confidence_buckets")}</h3>
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{confidenceModel.model}</span>
                        </div>
                        <div className="space-y-2">
                            {confidenceModel.stats.confidence_buckets.map((bucket) => (
                                <div key={bucket.label} className="grid grid-cols-[54px_minmax(0,1fr)_62px] items-center gap-3 text-sm">
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
                    </div>
                )}

                {bestModel && (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-black/20">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-gray-700 dark:text-gray-300">{t("diagnostics_league_split")}</h3>
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{bestModel.model}</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                                <div className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-400">{t("diagnostics_best_leagues")}</div>
                                {bestLeagues.map((row) => (
                                    <div key={row.league} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 dark:bg-gray-900/70">
                                        <span className="min-w-0 truncate text-sm text-gray-900 dark:text-white">{leagueName(row.league)}</span>
                                        <span className="shrink-0 text-sm font-bold text-emerald-400">{pct(row.accuracy_pct)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="space-y-2">
                                <div className="text-xs font-bold uppercase tracking-[0.14em] text-rose-400">{t("diagnostics_weak_leagues")}</div>
                                {weakestLeagues.map((row) => (
                                    <div key={row.league} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 dark:bg-gray-900/70">
                                        <span className="min-w-0 truncate text-sm text-gray-900 dark:text-white">{leagueName(row.league)}</span>
                                        <span className="shrink-0 text-sm font-bold text-rose-400">{pct(row.accuracy_pct)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
