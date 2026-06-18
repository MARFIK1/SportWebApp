"use client";

import Link from "next/link";
import { StarIcon as StarOutlineIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { PredictionMatch, ConsensusPrediction } from "@/types/predictions";
import { useLanguage } from "@/app/components/common/LanguageProvider";
import TeamLogo from "@/app/components/common/TeamLogo";
import { getDrawWatchSignalFromPredictions } from "@/app/util/predictions/drawWatch";
import { getPredictionStrength, type PredictionStrengthTier } from "@/app/util/predictions/confidence";
import { predictionCorrectness, resolvePredictionMatchResult } from "@/app/util/predictions/matchResult";

interface MatchCardProps {
    match: PredictionMatch;
    homeTeamId: number | null;
    awayTeamId: number | null;
    eventId: number | null;
    date: string;
    homeTeamFavorite: boolean;
    awayTeamFavorite: boolean;
    onToggleHomeTeamFavorite: () => void;
    onToggleAwayTeamFavorite: () => void;
}

function getPredictionColor(prediction: string): string {
    if (prediction === "HOME") return "text-emerald-400";
    if (prediction === "AWAY") return "text-rose-400";
    return "text-yellow-400";
}

function getPredictionBarColor(prediction: string): string {
    if (prediction === "HOME") return "bg-emerald-400";
    if (prediction === "AWAY") return "bg-rose-400";
    return "bg-amber-400";
}

function getPredictionLabel(match: PredictionMatch, t: (key: string) => string): { text: string; color: string; barColor: string; probability: number; agreement: string | null; strength: PredictionStrengthTier } | null {
    const consensus = match.predictions.consensus as ConsensusPrediction;
    if (!consensus?.prediction) return null;

    const pred = consensus.prediction;
    const prob = consensus.avg_probabilities?.[pred] ?? 0;
    const strength = getPredictionStrength(consensus);

    let label = "";
    if (pred === "HOME") label = `${t("home_win")} (${prob.toFixed(0)}%)`;
    else if (pred === "AWAY") label = `${t("away_win")} (${prob.toFixed(0)}%)`;
    else label = `${t("draw")} (${prob.toFixed(0)}%)`;

    return { text: label, color: getPredictionColor(pred), barColor: getPredictionBarColor(pred), probability: prob, agreement: consensus.agreement, strength: strength.tier };
}

function FavoriteTeamButton({
    active,
    label,
    onToggle,
}: {
    active: boolean;
    label: string;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggle();
            }}
            className={`pointer-events-auto absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                active
                    ? "border-amber-400/70 bg-amber-400 text-gray-950"
                    : "border-gray-200 bg-white/90 text-gray-400 hover:border-amber-400/60 hover:text-amber-500 dark:border-white/10 dark:bg-gray-950/90 dark:text-gray-500 dark:hover:text-amber-300"
            }`}
            aria-pressed={active}
            aria-label={label}
            title={label}
        >
            {active ? <StarSolidIcon className="h-4 w-4" aria-hidden="true" /> : <StarOutlineIcon className="h-4 w-4" aria-hidden="true" />}
        </button>
    );
}

export default function MatchCard({
    match,
    homeTeamId,
    awayTeamId,
    eventId,
    date,
    homeTeamFavorite,
    awayTeamFavorite,
    onToggleHomeTeamFavorite,
    onToggleAwayTeamFavorite,
}: MatchCardProps) {
    const { t } = useLanguage();
    const resultState = resolvePredictionMatchResult(match);
    const isFinished = resultState.isFinished;
    const prediction = getPredictionLabel(match, t);
    const drawWatch = getDrawWatchSignalFromPredictions(match.predictions);
    const score = resultState.regularScore;
    const penaltyScore = resultState.penaltyScore;
    const consensus = match.predictions.consensus as ConsensusPrediction;
    const correct = predictionCorrectness(consensus?.prediction, match);

    const borderColor = correct === null
        ? "border-gray-200 dark:border-gray-700"
        : correct
            ? "border-emerald-500/60"
            : "border-red-500/60";

    const href = eventId ? `/match/${eventId}?date=${date}` : null;
    const statusTone = correct === null
        ? "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-300"
        : correct
            ? "bg-emerald-500/15 text-emerald-500"
            : "bg-rose-500/15 text-rose-400";
    const hoverClassName = !href
        ? "cursor-not-allowed opacity-80"
        : correct === true
            ? "hover:-translate-y-1 hover:border-emerald-400/50 hover:shadow-xl hover:shadow-emerald-950/10 dark:hover:bg-gray-900"
            : correct === false
                ? "hover:-translate-y-1 hover:border-red-400/60 hover:shadow-xl hover:shadow-red-950/10 dark:hover:bg-gray-900"
                : "hover:-translate-y-1 hover:border-gray-400/60 hover:shadow-xl hover:shadow-slate-900/10 dark:hover:bg-gray-900";

    const cardClassName = `group relative flex min-h-[190px] w-full flex-col overflow-hidden rounded-3xl border ${borderColor} bg-white/90 p-4 shadow-sm shadow-slate-900/5 transition-all dark:bg-gray-900/70 dark:shadow-black/10 ${
        hoverClassName
    }`;

    const content = (
        <>
            <div className="mb-4 flex items-center justify-between">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${statusTone}`}>
                    {isFinished ? t("ft") : resultState.displayStatus === "postponed" ? t("postponed") : match.start_time || "TBD"}
                </span>
                {correct !== null && (
                    <span className={`text-xs font-bold ${correct ? "text-emerald-400" : "text-rose-400"}`}>
                        {correct ? t("correct") : t("incorrect")}
                    </span>
                )}
            </div>

            <div className="flex flex-1 items-center justify-between gap-3">
                <div className="flex flex-col items-center gap-1 flex-1">
                    <div className="relative">
                        {homeTeamId ? (
                            <TeamLogo
                                teamId={homeTeamId}
                                alt={match.home_team}
                                size={40}
                                className="object-contain"
                                style={{ width: "40px", height: "40px" }}
                            />
                        ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-gray-700 dark:bg-gray-700 dark:text-gray-200" aria-hidden="true">
                                {match.home_team.slice(0, 2).toUpperCase()}
                            </div>
                        )}
                        <FavoriteTeamButton
                            active={homeTeamFavorite}
                            label={`${homeTeamFavorite ? t("unfavorite_team") : t("favorite_team")}: ${match.home_team}`}
                            onToggle={onToggleHomeTeamFavorite}
                        />
                    </div>
                    <span className="line-clamp-2 text-center text-sm font-semibold leading-tight text-gray-800 dark:text-gray-100">
                        {match.home_team}
                    </span>
                </div>

                <div className="flex min-w-[68px] flex-col items-center gap-1">
                    {isFinished && score ? (
                        <>
                            <span className="rounded-2xl bg-gray-950 px-3 py-2 text-xl font-black text-white dark:bg-black/60">
                                {score.home} - {score.away}
                            </span>
                            {penaltyScore && (
                                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                                    {t("penalties")} {penaltyScore.home} - {penaltyScore.away}
                                </span>
                            )}
                        </>
                    ) : resultState.displayStatus === "postponed" ? (
                        <>
                            <span className="text-sm font-semibold text-amber-400">
                                {t("postponed")}
                            </span>
                        </>
                    ) : (
                        <>
                            <span className="text-2xl font-black text-gray-300 dark:text-gray-500">
                                vs
                            </span>
                        </>
                    )}
                </div>

                <div className="flex flex-col items-center gap-1 flex-1">
                    <div className="relative">
                        {awayTeamId ? (
                            <TeamLogo
                                teamId={awayTeamId}
                                alt={match.away_team}
                                size={40}
                                className="object-contain"
                                style={{ width: "40px", height: "40px" }}
                            />
                        ) : (
                            <div className="w-10 h-10 bg-gray-300 dark:bg-gray-700 rounded-full flex items-center justify-center text-xs font-bold text-gray-700 dark:text-gray-200" aria-hidden="true">
                                {match.away_team.slice(0, 2).toUpperCase()}
                            </div>
                        )}
                        <FavoriteTeamButton
                            active={awayTeamFavorite}
                            label={`${awayTeamFavorite ? t("unfavorite_team") : t("favorite_team")}: ${match.away_team}`}
                            onToggle={onToggleAwayTeamFavorite}
                        />
                    </div>
                    <span className="line-clamp-2 text-center text-sm font-semibold leading-tight text-gray-800 dark:text-gray-100">
                        {match.away_team}
                    </span>
                </div>
            </div>

            {prediction && (
                <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50/80 p-3 dark:border-white/10 dark:bg-black/20">
                    <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                        <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">{t("ml_prediction")}</span>
                        <div className="min-w-0 text-right">
                            <span className={`block break-words text-xs font-semibold leading-tight ${prediction.color}`}>
                                {prediction.text}
                            </span>
                            {prediction.strength !== "strong" && (
                                <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
                                    {t(`prediction_strength_${prediction.strength}`)}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                        <div
                            className={`h-full rounded-full transition-all ${prediction.barColor}`}
                            style={{ width: `${Math.max(12, Math.min(100, prediction.probability))}%` }}
                        />
                    </div>
                    {prediction.agreement && (
                        <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500">
                            <span>{t("agreement")}</span>
                            <span className="font-semibold text-gray-500 dark:text-gray-300">{prediction.agreement}</span>
                        </div>
                    )}
                    {drawWatch && (
                        <div
                            className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-2.5 py-2"
                            title={`${t("draw_watch_hint")}: ${drawWatch.drawProbability.toFixed(1)}%, ${t("gap_to_best")}: ${drawWatch.gapToBest.toFixed(1)}pp`}
                        >
                            <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-300">
                                {t("draw_watch")}
                            </span>
                            <span className="shrink-0 text-xs font-black text-amber-600 dark:text-amber-300">
                                {drawWatch.drawProbability.toFixed(0)}%
                            </span>
                        </div>
                    )}
                </div>
            )}
        </>
    );

    if (!href) {
        return (
            <article className={cardClassName}>
                <div className="relative z-10 flex h-full flex-col">
                    {content}
                </div>
            </article>
        );
    }

    return (
        <article className={cardClassName}>
            <Link
                href={href}
                prefetch={false}
                className="absolute inset-0 z-10 rounded-3xl"
                aria-label={`${match.home_team} vs ${match.away_team}`}
            />
            <div className="pointer-events-none relative z-20 flex h-full flex-col">
                {content}
            </div>
        </article>
    );
}
