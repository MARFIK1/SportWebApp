import Link from "next/link";
import TeamLogo from "../components/common/TeamLogo";
import { getAgreementCount, getConsensusConfidence, getPredictionStrength } from "../util/predictions/confidence";
import { getDrawWatchSignalFromPredictions } from "../util/predictions/drawWatch";
import { resolvePredictionMatchResult } from "../util/predictions/matchResult";
import type { ConsensusPrediction, MatchResult, PredictionMatch } from "@/types/predictions";

interface DailyHighlightsProps {
    matches: PredictionMatch[];
    selectedDate: string;
    teamIds: Record<string, number>;
    t: (key: string) => string;
}

interface HighlightMatch {
    match: PredictionMatch;
    consensus: ConsensusPrediction;
    confidence: number;
    agreementCount: number;
    drawProbability?: number;
    gapToBest?: number;
}

function predictionLabel(outcome: MatchResult | null, t: (key: string) => string): string {
    if (outcome === "HOME") return t("home_win");
    if (outcome === "AWAY") return t("away_win");
    if (outcome === "DRAW") return t("draw");
    return t("empty_placeholder");
}

function predictionTone(outcome: MatchResult | null): string {
    if (outcome === "HOME") return "text-emerald-400";
    if (outcome === "AWAY") return "text-blue-400";
    return "text-amber-400";
}

function collectHighlights(matches: PredictionMatch[]) {
    const eligible = matches.flatMap<HighlightMatch>((match) => {
        const consensus = match.predictions.consensus;
        if (!consensus?.prediction) return [];
        const strength = getPredictionStrength(consensus);

        return [{
            match,
            consensus,
            confidence: strength.confidence,
            agreementCount: strength.agreementCount,
        }];
    });

    const highConfidence = [...eligible]
        .filter((item) => getPredictionStrength(item.consensus).tier === "strong")
        .sort((a, b) => b.confidence - a.confidence || b.agreementCount - a.agreementCount)
        .slice(0, 4);

    const drawWatch = matches.flatMap<HighlightMatch>((match) => {
        const signal = getDrawWatchSignalFromPredictions(match.predictions);
        const consensus = match.predictions.consensus;
        if (!signal || !consensus?.prediction) return [];

        return [{
            match,
            consensus,
            confidence: getConsensusConfidence(consensus),
            agreementCount: getAgreementCount(consensus.agreement),
            drawProbability: signal.drawProbability,
            gapToBest: signal.gapToBest,
        }];
    })
        .sort((a, b) => (b.drawProbability ?? 0) - (a.drawProbability ?? 0) || (a.gapToBest ?? 0) - (b.gapToBest ?? 0))
        .slice(0, 4);

    return { highConfidence, drawWatch };
}

function TeamBadge({
    name,
    teamId,
    align = "left",
}: {
    name: string;
    teamId?: number;
    align?: "left" | "right";
}) {
    const justify = align === "right" ? "justify-end text-right" : "justify-start";
    const logo = teamId ? (
        <TeamLogo
            teamId={teamId}
            alt={name}
            size={28}
            className="h-7 w-7 shrink-0 object-contain"
        />
    ) : null;

    return (
        <div className={`flex min-w-0 items-center gap-2 ${justify}`}>
            {align === "left" && logo}
            <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">{name}</span>
            {align === "right" && logo}
        </div>
    );
}

function HighlightCard({
    item,
    selectedDate,
    teamIds,
    t,
    variant,
}: {
    item: HighlightMatch;
    selectedDate: string;
    teamIds: Record<string, number>;
    t: (key: string) => string;
    variant: "confidence" | "draw";
}) {
    const { match, consensus, confidence } = item;
    const href = match.event_id ? `/match/${match.event_id}?date=${selectedDate}` : null;
    const resultState = resolvePredictionMatchResult(match);
    const score = resultState.regularScore;
    const penaltyScore = resultState.penaltyScore;
    const isFinished = resultState.isFinished;
    const metricLabel = variant === "draw" ? t("daily_draw_probability") : t("confidence");
    const metricValue = variant === "draw" ? item.drawProbability ?? 0 : confidence;
    const metricTone = variant === "draw" ? "text-amber-400" : predictionTone(consensus.prediction);

    const content = (
        <>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                <TeamBadge name={match.home_team} teamId={teamIds[match.home_team]} />
                <div className="flex min-w-[56px] flex-col items-center justify-center gap-1">
                    {isFinished && score ? (
                        <>
                            <span className="rounded-xl bg-gray-950 px-2.5 py-1.5 text-sm font-black text-white dark:bg-black/60">
                                {score.home} - {score.away}
                            </span>
                            {penaltyScore && (
                                <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                                    {t("penalties")} {penaltyScore.home} - {penaltyScore.away}
                                </span>
                            )}
                        </>
                    ) : (
                        <span className="text-sm font-black uppercase text-gray-400 dark:text-gray-500">vs</span>
                    )}
                </div>
                <TeamBadge name={match.away_team} teamId={teamIds[match.away_team]} align="right" />
            </div>

            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                        {t("prediction")}
                    </div>
                    <div className={`mt-1 truncate text-sm font-black ${predictionTone(consensus.prediction)}`}>
                        {predictionLabel(consensus.prediction, t)}
                    </div>
                    {consensus.agreement && (
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {t("agreement")}: {consensus.agreement}
                        </div>
                    )}
                </div>
                <div className="text-right">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                        {metricLabel}
                    </div>
                    <div className={`mt-1 text-2xl font-black ${metricTone}`}>
                        {metricValue.toFixed(0)}%
                    </div>
                    {variant === "draw" && item.gapToBest !== undefined && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                            {t("gap_to_best")}: {item.gapToBest.toFixed(1)}pp
                        </div>
                    )}
                </div>
            </div>
        </>
    );

    const className = "block min-w-0 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 transition-colors dark:border-gray-800 dark:bg-black/20";

    if (!href) {
        return <div className={className}>{content}</div>;
    }

    return (
        <Link href={href} prefetch={false} className={`${className} hover:border-emerald-400/50 hover:bg-gray-100/80 dark:hover:bg-gray-800/50`}>
            {content}
        </Link>
    );
}

function HighlightColumn({
    title,
    subtitle,
    items,
    selectedDate,
    teamIds,
    t,
    variant,
}: {
    title: string;
    subtitle: string;
    items: HighlightMatch[];
    selectedDate: string;
    teamIds: Record<string, number>;
    t: (key: string) => string;
    variant: "confidence" | "draw";
}) {
    return (
        <div className="min-w-0">
            <div className="mb-3">
                <h3 className="text-sm font-black uppercase tracking-[0.16em] text-gray-700 dark:text-gray-200">{title}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
            </div>
            <div className="grid gap-3">
                {items.length ? items.map((item) => (
                    <HighlightCard
                        key={item.match.id}
                        item={item}
                        selectedDate={selectedDate}
                        teamIds={teamIds}
                        t={t}
                        variant={variant}
                    />
                )) : (
                    <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                        {t("daily_highlights_empty")}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function DailyHighlights({
    matches,
    selectedDate,
    teamIds,
    t,
}: DailyHighlightsProps) {
    const { highConfidence, drawWatch } = collectHighlights(matches);

    if (!highConfidence.length && !drawWatch.length) return null;

    return (
        <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-gray-800 dark:bg-gray-900/50 dark:shadow-black/10 sm:p-5">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-xl font-black text-gray-900 dark:text-white sm:text-2xl">{t("daily_highlights_title")}</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("daily_highlights_subtitle")}</p>
                </div>
                <span className="w-fit rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-500 dark:text-emerald-400">
                    {selectedDate}
                </span>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
                <HighlightColumn
                    title={t("daily_high_confidence")}
                    subtitle={t("daily_high_confidence_subtitle")}
                    items={highConfidence}
                    selectedDate={selectedDate}
                    teamIds={teamIds}
                    t={t}
                    variant="confidence"
                />
                <HighlightColumn
                    title={t("daily_draw_watch")}
                    subtitle={t("daily_draw_watch_subtitle")}
                    items={drawWatch}
                    selectedDate={selectedDate}
                    teamIds={teamIds}
                    t={t}
                    variant="draw"
                />
            </div>
        </section>
    );
}
