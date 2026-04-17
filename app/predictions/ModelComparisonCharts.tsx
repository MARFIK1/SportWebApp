"use client";

import { useMemo, useState } from "react";
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

function colorFor(model: string): string {
    return MODEL_COLORS[model] ?? "#9ca3af";
}

export default function ModelComparisonCharts({ comparison, accuracyOverTime, resultTypeBreakdown }: Props) {
    const { t } = useLanguage();
    const { theme } = useTheme();
    const [activeTab, setActiveTab] = useState<"comparison" | "overtime" | "resulttype" | "efficiency">("comparison");

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

    const models = useMemo(
        () => Array.from(new Set(accuracyOverTime.flatMap((p) => Object.keys(p).filter((k) => k !== "date")))),
        [accuracyOverTime]
    );

    const visibleModels = useMemo(
        () => models.filter((m) => m !== "consensus").slice(0, 9),
        [models]
    );

    const brierSorted = useMemo(
        () => [...comparison].sort((a, b) => a.brierScore - b.brierScore),
        [comparison]
    );

    if (comparison.length === 0 && accuracyOverTime.length === 0) return null;

    const tabs: { id: typeof activeTab; label: string }[] = [
        { id: "comparison", label: t("chart_test_vs_live") },
        { id: "overtime", label: t("chart_accuracy_over_time") },
        { id: "resulttype", label: t("chart_result_type") },
        { id: "efficiency", label: t("chart_efficiency") },
    ];

    return (
        <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-5 mt-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t("ml_comparison")}
                </h3>
                <div className="flex gap-1 flex-wrap">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
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

            <div className="h-[420px]">
                {activeTab === "comparison" && sortedComparison.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sortedComparison.map((r) => ({
                            model: r.model,
                            [t("chart_test_acc")]: Math.round(r.testAccuracy * 1000) / 10,
                            [t("chart_live_acc")]: Math.round(r.liveAccuracy * 1000) / 10,
                        }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.4} />
                            <XAxis dataKey="model" tick={{ fontSize: 11, fill: chartColors.axis }} angle={-20} textAnchor="end" height={70} />
                            <YAxis tick={{ fontSize: 11, fill: chartColors.axis }} domain={[0, 60]} label={{ value: "%", angle: -90, position: "insideLeft", fill: chartColors.axis }} />
                            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey={t("chart_test_acc")} fill="#3b82f6" />
                            <Bar dataKey={t("chart_live_acc")} fill="#10b981" />
                        </BarChart>
                    </ResponsiveContainer>
                )}

                {activeTab === "overtime" && accuracyOverTime.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={accuracyOverTime}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.4} />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: chartColors.axis }} />
                            <YAxis tick={{ fontSize: 11, fill: chartColors.axis }} domain={[30, 60]} label={{ value: "%", angle: -90, position: "insideLeft", fill: chartColors.axis }} />
                            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            {visibleModels.map((m) => (
                                <Line key={m} type="monotone" dataKey={m} stroke={colorFor(m)} strokeWidth={2} dot={false} />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                )}

                {activeTab === "resulttype" && resultTypeBreakdown.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={resultTypeBreakdown}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.4} />
                            <XAxis dataKey="model" tick={{ fontSize: 11, fill: chartColors.axis }} angle={-20} textAnchor="end" height={70} />
                            <YAxis tick={{ fontSize: 11, fill: chartColors.axis }} domain={[0, 100]} label={{ value: "%", angle: -90, position: "insideLeft", fill: chartColors.axis }} />
                            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="HOME" fill="#10b981" />
                            <Bar dataKey="DRAW" fill="#f59e0b" />
                            <Bar dataKey="AWAY" fill="#3b82f6" />
                        </BarChart>
                    </ResponsiveContainer>
                )}

                {activeTab === "efficiency" && brierSorted.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={brierSorted.map((r) => ({
                                model: r.model,
                                [t("chart_brier")]: r.brierScore,
                            }))}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.4} />
                            <XAxis dataKey="model" tick={{ fontSize: 11, fill: chartColors.axis }} angle={-20} textAnchor="end" height={70} />
                            <YAxis tick={{ fontSize: 11, fill: chartColors.axis }} domain={["auto", "auto"]} />
                            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar
                                dataKey={t("chart_brier")}
                                shape={(props: BarShapeProps) => {
                                    const payload = props.payload as { model?: string } | undefined;
                                    const model = typeof payload?.model === "string" ? payload.model : "";
                                    const { isActive: _a, option: _o, ...rectProps } = props;
                                    return <Rectangle {...rectProps} fill={colorFor(model)} />;
                                }}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-center">
                {t("chart_hint")}
            </p>
        </div>
    );
}
