"use client";

import { useMemo } from "react";
import { useLanguage } from "@/app/components/common/LanguageProvider";
import type { MatchResult, ModelPrediction } from "@/types/predictions";
import { useOptionalMatchPredictionVariant } from "./MatchPredictionVariantProvider";

interface PredictionTriangleProps {
    homeTeam: string;
    awayTeam: string;
    actualResult: MatchResult | null;
}

interface TrianglePoint {
    x: number;
    y: number;
}

const WIDTH = 420;
const HEIGHT = 320;
const VERTICES: Record<MatchResult, TrianglePoint> = {
    HOME: { x: 70, y: 54 },
    DRAW: { x: 210, y: 274 },
    AWAY: { x: 350, y: 54 },
};

const MODEL_COLORS = ["#34d399", "#60a5fa", "#f59e0b", "#f472b6", "#22d3ee", "#a78bfa", "#f87171", "#84cc16", "#fb923c"];

function clampProbability(value: number | null | undefined): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function probabilityToPoint(probabilities: Partial<Record<MatchResult, number>> | null | undefined): TrianglePoint {
    const home = clampProbability(probabilities?.HOME);
    const draw = clampProbability(probabilities?.DRAW);
    const away = clampProbability(probabilities?.AWAY);
    const total = home + draw + away || 1;

    return {
        x: (home * VERTICES.HOME.x + draw * VERTICES.DRAW.x + away * VERTICES.AWAY.x) / total,
        y: (home * VERTICES.HOME.y + draw * VERTICES.DRAW.y + away * VERTICES.AWAY.y) / total,
    };
}

function outcomeLabel(outcome: MatchResult, homeTeam: string, awayTeam: string, t: (key: string) => string): string {
    if (outcome === "HOME") return homeTeam;
    if (outcome === "AWAY") return awayTeam;
    return t("draw");
}

function modelConfidence(model: ModelPrediction): number {
    if (model.confidence != null) return model.confidence;
    if (!model.prediction) return 0;
    return model.probabilities?.[model.prediction] ?? 0;
}

export default function PredictionTriangle({ homeTeam, awayTeam, actualResult }: PredictionTriangleProps) {
    const { t } = useLanguage();
    const bundle = useOptionalMatchPredictionVariant()?.bundle;

    const plottedModels = useMemo(() => {
        return (bundle?.models ?? [])
            .filter(([, model]) => model.probabilities)
            .map(([name, model], index) => ({
                name,
                model,
                color: MODEL_COLORS[index % MODEL_COLORS.length],
                point: probabilityToPoint(model.probabilities),
                confidence: modelConfidence(model),
            }));
    }, [bundle?.models]);

    if (!bundle || plottedModels.length === 0) return null;

    const consensusPoint = probabilityToPoint(bundle.consensus?.avg_probabilities);
    const consensusPrediction = bundle.consensus?.prediction ?? null;
    const consensusProbabilities = bundle.consensus?.avg_probabilities ?? null;
    const actualPoint = actualResult ? VERTICES[actualResult] : null;

    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-gray-900/50 sm:p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-400">{t("model_probability_map")}</p>
                    <h3 className="mt-1 text-lg font-black text-gray-900 dark:text-white sm:text-xl">{t("prediction_triangle")}</h3>
                </div>
                {consensusPrediction && (
                    <div className="min-w-0 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-left sm:text-right">
                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400">{t("consensus")}</div>
                        <div className="line-clamp-2 text-sm font-black text-gray-900 dark:text-white">{outcomeLabel(consensusPrediction, homeTeam, awayTeam, t)}</div>
                    </div>
                )}
            </div>

            <div className="grid items-center gap-6 2xl:grid-cols-[minmax(300px,440px)_minmax(0,1fr)]">
                <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t("prediction_triangle")} className="mx-auto h-auto w-full max-w-[320px] sm:max-w-[440px]">
                    <defs>
                        <linearGradient id="prediction-triangle-surface" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
                            <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.16" />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.28" />
                        </linearGradient>
                    </defs>
                    <polygon
                        points={`${VERTICES.HOME.x},${VERTICES.HOME.y} ${VERTICES.AWAY.x},${VERTICES.AWAY.y} ${VERTICES.DRAW.x},${VERTICES.DRAW.y}`}
                        fill="url(#prediction-triangle-surface)"
                        stroke="rgba(148,163,184,0.35)"
                        strokeWidth="2"
                    />
                    {[0.25, 0.5, 0.75].map((step) => {
                        const left = {
                            x: VERTICES.HOME.x + (VERTICES.DRAW.x - VERTICES.HOME.x) * step,
                            y: VERTICES.HOME.y + (VERTICES.DRAW.y - VERTICES.HOME.y) * step,
                        };
                        const right = {
                            x: VERTICES.AWAY.x + (VERTICES.DRAW.x - VERTICES.AWAY.x) * step,
                            y: VERTICES.AWAY.y + (VERTICES.DRAW.y - VERTICES.AWAY.y) * step,
                        };
                        return <line key={step} x1={left.x} y1={left.y} x2={right.x} y2={right.y} stroke="rgba(148,163,184,0.16)" strokeWidth="1.2" />;
                    })}
                    {actualPoint && <circle cx={actualPoint.x} cy={actualPoint.y} r="22" fill="none" stroke="#facc15" strokeWidth="3" strokeDasharray="5 5" />}
                    {plottedModels.map(({ name, model, point, color, confidence }) => (
                        <circle key={name} cx={point.x} cy={point.y} r="8" fill={color} stroke="rgba(15,23,42,0.9)" strokeWidth="2.5">
                            <title>{`${name}: ${model.prediction ?? "-"} ${confidence.toFixed(1)}%`}</title>
                        </circle>
                    ))}
                    <circle cx={consensusPoint.x} cy={consensusPoint.y} r="12" fill="#10b981" stroke="#ecfeff" strokeWidth="3.5">
                        <title>{t("consensus_point")}</title>
                    </circle>
                    <text x={VERTICES.HOME.x} y={VERTICES.HOME.y - 24} textAnchor="middle" className="fill-emerald-400 text-[13px] font-black uppercase">{t("home_short")}</text>
                    <text x={VERTICES.AWAY.x} y={VERTICES.AWAY.y - 24} textAnchor="middle" className="fill-blue-400 text-[13px] font-black uppercase">{t("away_short")}</text>
                    <text x={VERTICES.DRAW.x} y={VERTICES.DRAW.y + 28} textAnchor="middle" className="fill-amber-300 text-[13px] font-black uppercase">{t("draw_short")}</text>
                </svg>

                <div className="min-w-0 space-y-4">
                    {consensusProbabilities && (
                        <div className="grid grid-cols-3 gap-2">
                            {(["HOME", "DRAW", "AWAY"] as MatchResult[]).map((outcome) => (
                                <div key={outcome} className="min-w-0 rounded-xl bg-gray-50 p-2.5 dark:bg-gray-800/50 sm:p-3">
                                    <div className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400 sm:text-[10px] sm:tracking-[0.16em]">{outcomeLabel(outcome, homeTeam, awayTeam, t)}</div>
                                    <div className={`mt-1 text-xl font-black sm:text-2xl ${outcome === "HOME" ? "text-emerald-400" : outcome === "AWAY" ? "text-blue-400" : "text-amber-300"}`}>
                                        {(consensusProbabilities[outcome] ?? 0).toFixed(0)}%
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-gray-50 p-3 dark:bg-gray-800/50">
                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-gray-900" />
                            {t("consensus_point")}
                        </div>
                        {actualResult && (
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                                <span className="h-3 w-3 rounded-full border-2 border-dashed border-yellow-300" />
                                {t("actual_result_marker")}
                            </div>
                        )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {plottedModels.map(({ name, color, confidence }) => (
                            <div key={name} className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-sm dark:bg-gray-800/50">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                                    <span className="truncate font-bold text-gray-800 dark:text-gray-100">{name}</span>
                                </div>
                                <span className="font-black text-gray-600 dark:text-gray-200">{confidence.toFixed(0)}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
