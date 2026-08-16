import type {
    LineupUsageSummary,
    ModelDiagnosticsArtifact,
    OperationalLogEntry,
    OperationalStatusArtifact,
} from "../util/data/predictionService";

interface SystemStatusPanelProps {
    status: OperationalStatusArtifact | null;
    reportDates: string[];
    diagnostics: ModelDiagnosticsArtifact | null;
    lineupUsage: LineupUsageSummary | null;
}

function formatDateTime(value: string | null | undefined): string {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    return new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Warsaw",
    }).format(parsed);
}

function statusLabel(status: OperationalLogEntry["status"] | undefined): string {
    if (status === "success") return "OK";
    if (status === "partial") return "PARTIAL";
    if (status === "failed") return "FAILED";
    return "UNKNOWN";
}

function statusClass(status: OperationalLogEntry["status"] | undefined): string {
    if (status === "success") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-400";
    if (status === "partial") return "border-amber-400/30 bg-amber-400/10 text-amber-400";
    if (status === "failed") return "border-rose-400/30 bg-rose-400/10 text-rose-400";
    return "border-amber-400/30 bg-amber-400/10 text-amber-300";
}

function LogCard({ title, log }: { title: string; log: OperationalLogEntry | null | undefined }) {
    return (
        <div className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-black/20">
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-black uppercase tracking-[0.16em] text-gray-700 dark:text-gray-300">{title}</h3>
                    <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{log?.file_name ?? "no log found"}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-black ${statusClass(log?.status)}`}>
                    {statusLabel(log?.status)}
                </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Started</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{formatDateTime(log?.started_at)}</div>
                </div>
                <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Last write</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{formatDateTime(log?.last_modified)}</div>
                </div>
            </div>

            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{log?.summary ?? "No automation log was captured yet."}</p>

            {log?.tail?.length ? (
                <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.16em] text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                        Log tail
                    </summary>
                    <pre className="scrollbar-app mt-3 max-h-52 overflow-auto rounded-xl bg-gray-950 p-3 text-xs leading-relaxed text-gray-200">
                        {log.tail.join("\n")}
                    </pre>
                </details>
            ) : null}
        </div>
    );
}

function formatPercent(numerator: number, denominator: number): string {
    if (denominator <= 0) return "-";
    return `${Math.round((numerator / denominator) * 1000) / 10}%`;
}

function LineupUsagePanel({ lineupUsage }: { lineupUsage: LineupUsageSummary | null }) {
    if (!lineupUsage || lineupUsage.dates.length === 0) return null;

    const { totals, dates } = lineupUsage;
    const totalTargets =
        totals.target_contexts.confirmed_lineup +
        totals.target_contexts.baseline +
        totals.target_contexts.baseline_fallback +
        totals.target_contexts.other;

    return (
        <div className="mt-4">
            <div className="mb-3">
                <h3 className="text-sm font-black uppercase tracking-[0.16em] text-gray-700 dark:text-gray-300">Lineup model usage</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Last {dates.length} report dates: {dates[0]?.date} - {dates[dates.length - 1]?.date}
                </p>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-black/20">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Lineup targets</div>
                    <div className="mt-2 text-3xl font-black text-gray-900 dark:text-white">
                        {totals.target_contexts.confirmed_lineup}
                        <span className="text-base font-bold text-gray-500 dark:text-gray-400"> / {totalTargets}</span>
                    </div>
                    <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        baseline {totals.target_contexts.baseline}, fallback {totals.target_contexts.baseline_fallback}
                    </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-black/20">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Lineup coverage</div>
                    <div className="mt-2 text-3xl font-black text-gray-900 dark:text-white">
                        {formatPercent(totals.confirmed_lineups, totals.total_matches)}
                    </div>
                    <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {totals.confirmed_lineups} confirmed of {totals.total_matches} matches ({totals.lineups_collected} collected)
                    </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-black/20">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Lineup-model matches</div>
                    <div className="mt-2 text-3xl font-black text-gray-900 dark:text-white">{totals.lineup_model_matches}</div>
                    <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">matches predicted with lineup-aware models</div>
                </div>
            </div>

            <div className="scrollbar-app overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
                <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-gray-50/80 text-xs font-bold uppercase tracking-[0.12em] text-gray-500 dark:bg-black/20 dark:text-gray-400">
                        <tr>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2 text-right">Matches</th>
                            <th className="px-3 py-2 text-right">Confirmed lineups</th>
                            <th className="px-3 py-2 text-right">Lineup targets</th>
                            <th className="px-3 py-2 text-right">Baseline targets</th>
                            <th className="px-3 py-2 text-right">Fallback targets</th>
                            <th className="px-3 py-2 text-right">Lineup matches</th>
                        </tr>
                    </thead>
                    <tbody className="text-gray-700 dark:text-gray-200">
                        {[...dates].reverse().map((row) => (
                            <tr key={row.date} className="border-t border-gray-200 dark:border-gray-800">
                                <td className="px-3 py-2 font-semibold">{row.date}</td>
                                <td className="px-3 py-2 text-right">{row.total_matches}</td>
                                <td className="px-3 py-2 text-right">{row.confirmed_lineups}</td>
                                <td className="px-3 py-2 text-right font-semibold">{row.target_contexts.confirmed_lineup}</td>
                                <td className="px-3 py-2 text-right">{row.target_contexts.baseline}</td>
                                <td className="px-3 py-2 text-right">{row.target_contexts.baseline_fallback}</td>
                                <td className="px-3 py-2 text-right">{row.lineup_model_matches}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function SystemStatusPanel({ status, reportDates, diagnostics, lineupUsage }: SystemStatusPanelProps) {
    const latestReportDate = reportDates[reportDates.length - 1] ?? "-";
    const firstReportDate = reportDates[0] ?? "-";

    return (
        <section className="mx-auto mt-5 w-full max-w-[1600px] px-3 sm:px-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-gray-800 dark:bg-gray-900/50 dark:shadow-black/10 sm:p-5">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-500">System status</p>
                        <h2 className="mt-1 text-2xl font-black text-gray-900 dark:text-white">Automation health</h2>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Snapshot: {formatDateTime(status?.generated_at)}
                    </p>
                </div>

                <div className="mb-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-black/20">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Reports</div>
                        <div className="mt-2 text-3xl font-black text-gray-900 dark:text-white">{reportDates.length}</div>
                        <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{firstReportDate} - {latestReportDate}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-black/20">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Model diagnostics</div>
                        <div className="mt-2 text-3xl font-black text-gray-900 dark:text-white">{diagnostics?.finished_matches ?? "-"}</div>
                        <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">finished matches in diagnostics</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-black/20">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Training window</div>
                        <div className="mt-2 text-xl font-black text-gray-900 dark:text-white">
                            {diagnostics?.date_range.first ?? "-"}
                        </div>
                        <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">to {diagnostics?.date_range.last ?? "-"}</div>
                    </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                    <LogCard title="Daily refresh" log={status?.daily} />
                    <LogCard title="Lineup refresh" log={status?.lineup} />
                    <LogCard title="Weekly training" log={status?.weekly} />
                </div>

                <LineupUsagePanel lineupUsage={lineupUsage} />
            </div>
        </section>
    );
}
