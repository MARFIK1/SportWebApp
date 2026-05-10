"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Rectangle,
    type BarShapeProps,
    type TooltipContentProps,
    type TooltipValueType,
} from "recharts";
import { useLanguage } from "@/app/components/common/LanguageProvider";
import { useTheme } from "@/app/components/common/ThemeProvider";
import type { ModelComparisonRow, AccuracyOverTimePoint, ResultTypeBreakdown } from "@/app/util/data/predictionService";

interface Props {
    comparison: ModelComparisonRow[];
    accuracyOverTime: AccuracyOverTimePoint[];
    resultTypeBreakdown: ResultTypeBreakdown[];
}

const MODEL_COLORS: Record<string, string> = {
    "LightGBM": "#10b981",
    "MLP": "#3b82f6",
    "Random Forest": "#f59e0b",
    "Stacking": "#8b5cf6",
    "Logistic Regression": "#ec4899",
    "XGBoost": "#ef4444",
    "LSTM": "#06b6d4",
    "KNN": "#84cc16",
    "Ensemble": "#f97316",
    "consensus": "#14b8a6",
};

const CHART_INITIAL_DIMENSION = { width: 800, height: 420 };
const MOBILE_CHART_INITIAL_DIMENSION = { width: 360, height: 390 };
const MOBILE_QUERY = "(max-width: 639px)";

function colorFor(model: string): string {
    return MODEL_COLORS[model] ?? "#9ca3af";
}

function pointValue(point: AccuracyOverTimePoint | undefined, model: string): number {
    const value = point?.[model];
    return typeof value === "number" ? value : Number.NEGATIVE_INFINITY;
}

function numericTooltipValue(value: TooltipValueType | undefined): number {
    const rawValue = Array.isArray(value) ? value[0] : value;
    if (typeof rawValue === "number") return rawValue;
    if (typeof rawValue === "string") {
        const parsed = Number(rawValue);
        return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
    }
    return Number.NEGATIVE_INFINITY;
}

function compactModelLabel(model: string): string {
    return model
        .replace("Logistic Regression", "Logistic")
        .replace("Random Forest", "Random F.")
        .replace("Ensemble", "Ens.");
}

function AccuracyOverTimeTooltip({
    active,
    label,
    payload,
}: TooltipContentProps<TooltipValueType, string | number>) {
    if (!active || !payload?.length) return null;

    const rows = [...payload].sort((a, b) => {
        const byValue = numericTooltipValue(b.value) - numericTooltipValue(a.value);
        return byValue !== 0 ? byValue : String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });

    return (
        <div className="min-w-[190px] max-w-[calc(100vw-3rem)] rounded-lg border border-gray-200 bg-white/95 px-3 py-2 text-xs text-gray-950 shadow-xl shadow-slate-950/10 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95 dark:text-white dark:shadow-black/30 sm:min-w-[220px] sm:text-sm">
            <div className="mb-2 font-semibold text-gray-700 dark:text-gray-100">{label}</div>
            <div className="space-y-1.5">
                {rows.map((item) => {
                    const name = String(item.name ?? "");
                    const value = numericTooltipValue(item.value);
                    return (
                        <div key={name} className="flex items-center justify-between gap-5">
                            <div className="flex min-w-0 items-center gap-2">
                                <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: item.color ?? colorFor(name) }}
                                />
                                <span className="truncate font-semibold">{name}</span>
                            </div>
                            <span className="shrink-0 font-semibold">
                                {Number.isFinite(value) ? value.toFixed(1) : "-"}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ChartViewport({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const node = ref.current;
        if (!node || typeof ResizeObserver === "undefined") return;

        const observer = new ResizeObserver(([entry]) => {
            setReady(entry.contentRect.width > 0 && entry.contentRect.height > 0);
        });

        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={ref} className="h-full min-h-[320px] min-w-0">
            {ready ? children : null}
        </div>
    );
}

export default function ModelComparisonCharts({ comparison, accuracyOverTime, resultTypeBreakdown }: Props) {
    const { t } = useLanguage();
    const { theme } = useTheme();
    const [activeTab, setActiveTab] = useState<"comparison" | "overtime" | "resulttype" | "efficiency">("comparison");
    const [isCompact, setIsCompact] = useState(false);
    const [selectedOvertimeModels, setSelectedOvertimeModels] = useState<string[] | null>(null);

    useEffect(() => {
        const mediaQuery = window.matchMedia(MOBILE_QUERY);

        const syncCompactMode = () => {
            setIsCompact(mediaQuery.matches);
        };

        syncCompactMode();
        mediaQuery.addEventListener("change", syncCompactMode);

        return () => {
            mediaQuery.removeEventListener("change", syncCompactMode);
        };
    }, []);

    const chartColors = theme === "dark"
        ? { grid: "#374151", axis: "#9ca3af", tooltipBg: "rgba(31, 41, 55, 0.95)", tooltipBorder: "#374151", tooltipText: "#f3f4f6", tooltipLabel: "#d1d5db" }
        : { grid: "#d1d5db", axis: "#6b7280", tooltipBg: "rgba(255, 255, 255, 0.98)", tooltipBorder: "#d1d5db", tooltipText: "#111827", tooltipLabel: "#374151" };
    const tooltipStyle = { backgroundColor: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: 8, color: chartColors.tooltipText };
    const tooltipItemStyle = { color: chartColors.tooltipText };
    const tooltipLabelStyle = { color: chartColors.tooltipLabel };

    const sortedComparison = useMemo(
        () => [...comparison].sort((a, b) => b.liveAccuracy - a.liveAccuracy),
        [comparison]
    );

    const overtimeModelOptions = useMemo(
        () => {
            const latestPoint = accuracyOverTime[accuracyOverTime.length - 1];
            return Array.from(new Set(accuracyOverTime.flatMap((p) => Object.keys(p).filter((k) => k !== "date" && k !== "consensus"))))
                .sort((a, b) => {
                    const byAccuracy = pointValue(latestPoint, b) - pointValue(latestPoint, a);
                    return byAccuracy !== 0 ? byAccuracy : a.localeCompare(b);
                })
                .slice(0, 9);
        },
        [accuracyOverTime]
    );

    const visibleModels = useMemo(
        () => {
            const selected = selectedOvertimeModels ? new Set(selectedOvertimeModels) : null;
            return selected
                ? overtimeModelOptions.filter((model) => selected.has(model))
                : overtimeModelOptions;
        },
        [overtimeModelOptions, selectedOvertimeModels]
    );

    const toggleOvertimeModel = (model: string) => {
        setSelectedOvertimeModels((current) => {
            const base = (current ?? overtimeModelOptions)
                .filter((item) => overtimeModelOptions.includes(item));
            return base.includes(model)
                ? base.filter((item) => item !== model)
                : [...base, model];
        });
    };

    const brierSorted = useMemo(
        () => [...comparison].sort((a, b) => a.brierScore - b.brierScore),
        [comparison]
    );

    const chartInitialDimension = isCompact ? MOBILE_CHART_INITIAL_DIMENSION : CHART_INITIAL_DIMENSION;
    const chartPanelClassName = isCompact
        ? "h-[390px] min-w-0"
        : "h-[360px] min-w-[660px] sm:h-[420px]";
    const chartFrameClassName = isCompact
        ? "min-w-0 pb-2"
        : "scrollbar-app -mx-2 overflow-x-auto px-2 pb-2";

    if (comparison.length === 0 && accuracyOverTime.length === 0) return null;

    const tabs: { id: typeof activeTab; label: string }[] = [
        { id: "comparison", label: t("chart_test_vs_live") },
        { id: "overtime", label: t("chart_accuracy_over_time") },
        { id: "resulttype", label: t("chart_result_type") },
        { id: "efficiency", label: t("chart_efficiency") },
    ];

    return (
        <div className="mt-6 min-w-0 overflow-hidden rounded-2xl bg-white p-3 dark:bg-gray-900/50 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t("ml_comparison")}
                </h3>
                <div className="grid w-full grid-cols-2 gap-1 sm:flex sm:w-auto sm:max-w-full sm:overflow-x-auto sm:pb-1" role="tablist" aria-label={t("ml_comparison")}>
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            role="tab"
                            id={`chart-tab-${tab.id}`}
                            aria-selected={activeTab === tab.id}
                            aria-controls={`chart-panel-${tab.id}`}
                            className={`min-h-9 rounded-lg px-2 py-1.5 text-[11px] font-semibold leading-tight transition-colors sm:shrink-0 sm:px-3 sm:text-xs ${
                                activeTab === tab.id
                                    ? "bg-emerald-600 text-white"
                                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className={activeTab === "overtime" ? "grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_250px]" : "min-w-0"}>
                <div className={chartFrameClassName}>
                    <div
                        id={`chart-panel-${activeTab}`}
                        role="tabpanel"
                        aria-labelledby={`chart-tab-${activeTab}`}
                        className={chartPanelClassName}
                    >
                        {activeTab === "comparison" && sortedComparison.length > 0 && (
                            <ChartViewport>
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={320} initialDimension={chartInitialDimension}>
                                    <BarChart
                                        data={sortedComparison.map((r) => ({
                                        model: r.model,
                                        [t("chart_test_acc")]: Math.round(r.testAccuracy * 1000) / 10,
                                        [t("chart_live_acc")]: Math.round(r.liveAccuracy * 1000) / 10,
                                        }))}
                                        layout={isCompact ? "vertical" : "horizontal"}
                                        margin={isCompact ? { top: 8, right: 8, bottom: 8, left: 0 } : { top: 5, right: 5, bottom: 5, left: 5 }}
                                        barCategoryGap={isCompact ? 8 : undefined}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.4} />
                                        {isCompact ? (
                                            <>
                                                <XAxis type="number" tick={{ fontSize: 10, fill: chartColors.axis }} domain={[0, 60]} />
                                                <YAxis type="category" dataKey="model" width={82} tick={{ fontSize: 10, fill: chartColors.axis }} tickFormatter={compactModelLabel} />
                                            </>
                                        ) : (
                                            <>
                                                <XAxis dataKey="model" tick={{ fontSize: 11, fill: chartColors.axis }} angle={-20} textAnchor="end" height={70} />
                                                <YAxis tick={{ fontSize: 11, fill: chartColors.axis }} domain={[0, 60]} label={{ value: "%", angle: -90, position: "insideLeft", fill: chartColors.axis }} />
                                            </>
                                        )}
                                        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                                        <Legend wrapperStyle={{ fontSize: isCompact ? 10 : 12 }} />
                                        <Bar dataKey={t("chart_test_acc")} fill="#3b82f6" barSize={isCompact ? 7 : undefined} />
                                        <Bar dataKey={t("chart_live_acc")} fill="#10b981" barSize={isCompact ? 7 : undefined} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartViewport>
                        )}

                        {activeTab === "overtime" && accuracyOverTime.length > 0 && (
                            visibleModels.length > 0 ? (
                                <ChartViewport>
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={320} initialDimension={chartInitialDimension}>
                                        <LineChart data={accuracyOverTime} margin={isCompact ? { top: 8, right: 8, bottom: 8, left: -10 } : { top: 5, right: 5, bottom: 5, left: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.4} />
                                            <XAxis dataKey="date" tick={{ fontSize: isCompact ? 9 : 10, fill: chartColors.axis }} minTickGap={isCompact ? 22 : 5} />
                                            <YAxis tick={{ fontSize: 11, fill: chartColors.axis }} domain={[30, 60]} label={{ value: "%", angle: -90, position: "insideLeft", fill: chartColors.axis }} />
                                            <Tooltip content={(props) => <AccuracyOverTimeTooltip {...props} />} />
                                            {!isCompact && <Legend wrapperStyle={{ fontSize: 11 }} />}
                                            {visibleModels.map((m) => (
                                                <Line key={m} type="monotone" dataKey={m} stroke={colorFor(m)} strokeWidth={2} dot={false} />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </ChartViewport>
                            ) : (
                                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                                    {t("chart_no_models")}
                                </div>
                            )
                        )}

                        {activeTab === "resulttype" && resultTypeBreakdown.length > 0 && (
                            <ChartViewport>
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={320} initialDimension={chartInitialDimension}>
                                    <BarChart
                                        data={resultTypeBreakdown}
                                        layout={isCompact ? "vertical" : "horizontal"}
                                        margin={isCompact ? { top: 8, right: 8, bottom: 8, left: 0 } : { top: 5, right: 5, bottom: 5, left: 5 }}
                                        barCategoryGap={isCompact ? 8 : undefined}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.4} />
                                        {isCompact ? (
                                            <>
                                                <XAxis type="number" tick={{ fontSize: 10, fill: chartColors.axis }} domain={[0, 100]} />
                                                <YAxis type="category" dataKey="model" width={82} tick={{ fontSize: 10, fill: chartColors.axis }} tickFormatter={compactModelLabel} />
                                            </>
                                        ) : (
                                            <>
                                                <XAxis dataKey="model" tick={{ fontSize: 11, fill: chartColors.axis }} angle={-20} textAnchor="end" height={70} />
                                                <YAxis tick={{ fontSize: 11, fill: chartColors.axis }} domain={[0, 100]} label={{ value: "%", angle: -90, position: "insideLeft", fill: chartColors.axis }} />
                                            </>
                                        )}
                                        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                                        <Legend wrapperStyle={{ fontSize: isCompact ? 10 : 12 }} />
                                        <Bar dataKey="HOME" fill="#10b981" barSize={isCompact ? 6 : undefined} />
                                        <Bar dataKey="DRAW" fill="#f59e0b" barSize={isCompact ? 6 : undefined} />
                                        <Bar dataKey="AWAY" fill="#3b82f6" barSize={isCompact ? 6 : undefined} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartViewport>
                        )}

                        {activeTab === "efficiency" && brierSorted.length > 0 && (
                            <ChartViewport>
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={320} initialDimension={chartInitialDimension}>
                                    <BarChart
                                        data={brierSorted.map((r) => ({
                                            model: r.model,
                                            [t("chart_brier")]: r.brierScore,
                                        }))}
                                        layout={isCompact ? "vertical" : "horizontal"}
                                        margin={isCompact ? { top: 8, right: 8, bottom: 8, left: 0 } : { top: 5, right: 5, bottom: 5, left: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.4} />
                                        {isCompact ? (
                                            <>
                                                <XAxis type="number" tick={{ fontSize: 10, fill: chartColors.axis }} domain={["auto", "auto"]} />
                                                <YAxis type="category" dataKey="model" width={82} tick={{ fontSize: 10, fill: chartColors.axis }} tickFormatter={compactModelLabel} />
                                            </>
                                        ) : (
                                            <>
                                                <XAxis dataKey="model" tick={{ fontSize: 11, fill: chartColors.axis }} angle={-20} textAnchor="end" height={70} />
                                                <YAxis tick={{ fontSize: 11, fill: chartColors.axis }} domain={["auto", "auto"]} />
                                            </>
                                        )}
                                        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                                        <Legend wrapperStyle={{ fontSize: isCompact ? 10 : 12 }} />
                                        <Bar
                                            dataKey={t("chart_brier")}
                                            barSize={isCompact ? 12 : undefined}
                                            shape={(props: BarShapeProps) => {
                                                const payload = props.payload as { model?: string } | undefined;
                                                const model = typeof payload?.model === "string" ? payload.model : "";
                                                const { isActive, option, ...rectProps } = props;
                                                void isActive;
                                                void option;
                                                return <Rectangle {...rectProps} fill={colorFor(model)} />;
                                            }}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartViewport>
                        )}
                    </div>
                </div>

                {activeTab === "overtime" && overtimeModelOptions.length > 0 && (
                    <div className="min-w-0 rounded-xl border border-gray-200 bg-white/70 p-3 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-[#0b1220]/70 dark:shadow-black/10">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                                    {t("chart_models")}
                                </p>
                                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                                    {visibleModels.length}/{overtimeModelOptions.length}
                                </p>
                            </div>
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => setSelectedOvertimeModels(null)}
                                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 transition-colors hover:border-emerald-300 hover:text-gray-950 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:border-emerald-400/40 dark:hover:text-white"
                                >
                                    {t("select_all")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedOvertimeModels([])}
                                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 transition-colors hover:border-emerald-300 hover:text-gray-950 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:border-emerald-400/40 dark:hover:text-white"
                                >
                                    {t("clear_selection")}
                                </button>
                            </div>
                        </div>

                        <div className="scrollbar-app flex flex-wrap gap-2 lg:max-h-[330px] lg:overflow-y-auto lg:pr-1">
                            {overtimeModelOptions.map((model) => {
                                const selected = visibleModels.includes(model);
                                return (
                                    <button
                                        key={model}
                                        type="button"
                                        onClick={() => toggleOvertimeModel(model)}
                                        aria-pressed={selected}
                                        className={`inline-flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                                            selected
                                                ? "border-emerald-300 bg-emerald-50 text-gray-950 shadow-sm dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-white"
                                                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:border-white/20 dark:hover:text-white"
                                        }`}
                                    >
                                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorFor(model) }} />
                                        <span className="truncate">{model}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-center">
                {t("chart_hint")}
            </p>
        </div>
    );
}
