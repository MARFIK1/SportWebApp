import type { MatchResult, ModelPrediction, PredictionMatch } from "@/types/predictions";

const OUTCOMES: MatchResult[] = ["HOME", "DRAW", "AWAY"];

export const DRAW_WATCH_MODEL = "LightGBM";
export const DRAW_WATCH_THRESHOLD = 26;
export const DRAW_WATCH_MAX_GAP_TO_BEST = 10;

export interface DrawWatchSignal {
    model: string;
    modelPrediction: MatchResult | null;
    drawProbability: number;
    bestOutcome: MatchResult;
    bestProbability: number;
    gapToBest: number;
    threshold: number;
    maxGapToBest: number;
}

function roundOne(value: number): number {
    return Math.round(value * 10) / 10;
}

function getProbabilityScale(prediction: ModelPrediction): number {
    const maxValue = Math.max(...OUTCOMES.map((outcome) => prediction.probabilities?.[outcome] ?? 0));
    return maxValue <= 1 ? 100 : 1;
}

function buildDrawWatchSignal(model: string, prediction: ModelPrediction | undefined): DrawWatchSignal | null {
    if (!prediction?.probabilities) return null;

    const scale = getProbabilityScale(prediction);
    const probabilities = OUTCOMES.reduce<Record<MatchResult, number>>((acc, outcome) => {
        acc[outcome] = (prediction.probabilities[outcome] ?? 0) * scale;
        return acc;
    }, { HOME: 0, DRAW: 0, AWAY: 0 });

    const bestOutcome = OUTCOMES.reduce((best, outcome) => (
        probabilities[outcome] > probabilities[best] ? outcome : best
    ), "HOME" as MatchResult);
    const drawProbability = probabilities.DRAW;
    const bestProbability = probabilities[bestOutcome];
    const gapToBest = Math.max(0, bestProbability - drawProbability);

    if (drawProbability < DRAW_WATCH_THRESHOLD || gapToBest > DRAW_WATCH_MAX_GAP_TO_BEST) {
        return null;
    }

    return {
        model,
        modelPrediction: prediction.prediction,
        drawProbability: roundOne(drawProbability),
        bestOutcome,
        bestProbability: roundOne(bestProbability),
        gapToBest: roundOne(gapToBest),
        threshold: DRAW_WATCH_THRESHOLD,
        maxGapToBest: DRAW_WATCH_MAX_GAP_TO_BEST,
    };
}

export function getDrawWatchSignalFromPredictions(predictions: PredictionMatch["predictions"] | undefined): DrawWatchSignal | null {
    return buildDrawWatchSignal(DRAW_WATCH_MODEL, predictions?.[DRAW_WATCH_MODEL]);
}

export function getDrawWatchSignalFromModels(models: [string, ModelPrediction][] | undefined): DrawWatchSignal | null {
    const entry = models?.find(([model]) => model === DRAW_WATCH_MODEL);
    return buildDrawWatchSignal(entry?.[0] ?? DRAW_WATCH_MODEL, entry?.[1]);
}
