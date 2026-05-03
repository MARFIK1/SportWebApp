"use client";

import { useMemo } from "react";
import { useLanguage } from "@/app/components/common/LanguageProvider";
import type { AnalysisMatch } from "@/types/predictions";

interface TeamRadarProps {
    analysis: AnalysisMatch | null;
    homeTeam: string;
    awayTeam: string;
}

interface RadarMetric {
    key: string;
    label: string;
    homeRaw: number;
    awayRaw: number;
    homeScore: number;
    awayScore: number;
    format: (value: number) => string;
}

const SIZE = 380;
const CENTER = 190;
const RADIUS = 136;

function clamp(value: number, min = 8, max = 100): number {
    return Math.max(min, Math.min(max, value));
}

function relativeHigher(home: number | null | undefined, away: number | null | undefined): { home: number; away: number } | null {
    if (typeof home !== "number" || typeof away !== "number" || !Number.isFinite(home) || !Number.isFinite(away)) return null;
    const denominator = Math.abs(home) + Math.abs(away);
    if (denominator <= 0) return { home: 50, away: 50 };
    const delta = ((home - away) / denominator) * 50;
    return { home: clamp(50 + delta), away: clamp(50 - delta) };
}

function relativeLower(home: number | null | undefined, away: number | null | undefined): { home: number; away: number } | null {
    const scores = relativeHigher(home, away);
    return scores ? { home: scores.away, away: scores.home } : null;
}

function formPoints(form: string | null | undefined): number {
    if (!form) return 0;
    return form.split("").reduce((sum, item) => sum + (item === "W" ? 3 : item === "D" ? 1 : 0), 0);
}

function pointFor(score: number, index: number, total: number): { x: number; y: number } {
    const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
    const radius = (score / 100) * RADIUS;
    return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius };
}

function polygonPoints(metrics: RadarMetric[], side: "home" | "away"): string {
    return metrics
        .map((metric, index) => {
            const point = pointFor(side === "home" ? metric.homeScore : metric.awayScore, index, metrics.length);
            return `${point.x},${point.y}`;
        })
        .join(" ");
}

export default function TeamRadar({ analysis, homeTeam, awayTeam }: TeamRadarProps) {
    const { t } = useLanguage();

    const metrics = useMemo<RadarMetric[]>(() => {
        if (!analysis) return [];

        const candidates = [
            {
                key: "xg_for",
                label: t("xg_for"),
                home: analysis.goals?.home?.avg_xg_for,
                away: analysis.goals?.away?.avg_xg_for,
                scores: relativeHigher(analysis.goals?.home?.avg_xg_for, analysis.goals?.away?.avg_xg_for),
                format: (value: number) => value.toFixed(1),
            },
            {
                key: "defensive_xg",
                label: t("defensive_xg"),
                home: analysis.goals?.home?.avg_xg_against,
                away: analysis.goals?.away?.avg_xg_against,
                scores: relativeLower(analysis.goals?.home?.avg_xg_against, analysis.goals?.away?.avg_xg_against),
                format: (value: number) => value.toFixed(1),
            },
            {
                key: "shots_on_target",
                label: t("avg_shots_on_target"),
                home: analysis.shots?.home?.avg_shots_on_target,
                away: analysis.shots?.away?.avg_shots_on_target,
                scores: relativeHigher(analysis.shots?.home?.avg_shots_on_target, analysis.shots?.away?.avg_shots_on_target),
                format: (value: number) => value.toFixed(1),
            },
            {
                key: "big_chances",
                label: t("avg_big_chances"),
                home: analysis.shots?.home?.avg_big_chances,
                away: analysis.shots?.away?.avg_big_chances,
                scores: relativeHigher(analysis.shots?.home?.avg_big_chances, analysis.shots?.away?.avg_big_chances),
                format: (value: number) => value.toFixed(1),
            },
            {
                key: "possession",
                label: t("avg_possession"),
                home: analysis.shots?.home?.avg_possession,
                away: analysis.shots?.away?.avg_possession,
                scores: relativeHigher(analysis.shots?.home?.avg_possession, analysis.shots?.away?.avg_possession),
                format: (value: number) => `${value.toFixed(0)}%`,
            },
            {
                key: "form",
                label: t("form_score"),
                home: formPoints(analysis.form?.home),
                away: formPoints(analysis.form?.away),
                scores: relativeHigher(formPoints(analysis.form?.home), formPoints(analysis.form?.away)),
                format: (value: number) => value.toFixed(0),
            },
        ];

        return candidates
            .filter((metric): metric is typeof metric & { home: number; away: number; scores: { home: number; away: number } } =>
                typeof metric.home === "number" &&
                typeof metric.away === "number" &&
                Number.isFinite(metric.home) &&
                Number.isFinite(metric.away) &&
                metric.scores !== null
            )
            .map((metric) => ({
                key: metric.key,
                label: metric.label,
                homeRaw: metric.home,
                awayRaw: metric.away,
                homeScore: metric.scores.home,
                awayScore: metric.scores.away,
                format: metric.format,
            }));
    }, [analysis, t]);

    if (metrics.length < 3) return null;

    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-gray-900/50">
            <div className="mb-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-400">{t("team_style_profile")}</p>
                <h3 className="mt-1 text-xl font-black text-gray-900 dark:text-white">{t("matchup_radar")}</h3>
            </div>
            <div className="grid items-center gap-6 lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)]">
                <div className="min-w-0">
                    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={t("matchup_radar")} className="mx-auto h-auto w-full max-w-[400px]">
                        {[0.25, 0.5, 0.75, 1].map((level) => (
                            <polygon key={level} points={metrics.map((_, index) => {
                                const point = pointFor(level * 100, index, metrics.length);
                                return `${point.x},${point.y}`;
                            }).join(" ")} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
                        ))}
                        {metrics.map((metric, index) => {
                            const outer = pointFor(108, index, metrics.length);
                            const inner = pointFor(0, index, metrics.length);
                            return (
                                <g key={metric.key}>
                                    <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="rgba(148,163,184,0.14)" />
                                    <circle cx={outer.x} cy={outer.y} r="12" fill="rgba(15,23,42,0.88)" stroke="rgba(148,163,184,0.35)" />
                                    <text x={outer.x} y={outer.y} textAnchor="middle" dominantBaseline="middle" className="fill-gray-100 text-[11px] font-black">
                                        {index + 1}
                                    </text>
                                </g>
                            );
                        })}
                        <polygon points={polygonPoints(metrics, "away")} fill="rgba(59,130,246,0.22)" stroke="#60a5fa" strokeWidth="2.5" />
                        <polygon points={polygonPoints(metrics, "home")} fill="rgba(16,185,129,0.24)" stroke="#34d399" strokeWidth="2.5" />
                        {metrics.map((metric, index) => {
                            const homePoint = pointFor(metric.homeScore, index, metrics.length);
                            const awayPoint = pointFor(metric.awayScore, index, metrics.length);
                            return (
                                <g key={`${metric.key}-points`}>
                                    <circle cx={awayPoint.x} cy={awayPoint.y} r="4" fill="#60a5fa" />
                                    <circle cx={homePoint.x} cy={homePoint.y} r="4" fill="#34d399" />
                                </g>
                            );
                        })}
                    </svg>
                    <div className="mt-3 flex flex-wrap justify-center gap-4 text-sm font-semibold text-gray-600 dark:text-gray-300">
                        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-400" />{homeTeam}</div>
                        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-blue-400" />{awayTeam}</div>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    {metrics.map((metric, index) => (
                        <div key={metric.key} className="rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-gray-800/50">
                            <div className="mb-2 flex items-center gap-2">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-black text-gray-600 dark:bg-gray-700 dark:text-gray-200">{index + 1}</span>
                                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{metric.label}</span>
                            </div>
                            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 text-xs">
                                <div className="min-w-0">
                                    <div className="truncate text-gray-500 dark:text-gray-400">{homeTeam}</div>
                                    <div className="text-xl font-black text-emerald-400">{metric.format(metric.homeRaw)}</div>
                                </div>
                                <span className="text-gray-400 dark:text-gray-600">vs</span>
                                <div className="min-w-0 text-right">
                                    <div className="truncate text-gray-500 dark:text-gray-400">{awayTeam}</div>
                                    <div className="text-xl font-black text-blue-400">{metric.format(metric.awayRaw)}</div>
                                </div>
                            </div>
                            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                <div className="bg-emerald-400" style={{ width: `${metric.homeScore}%` }} />
                                <div className="bg-blue-400" style={{ width: `${metric.awayScore}%` }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
