import { parseScorePair, resultFromScorePair } from "@/app/util/predictions/matchResult";
import type {
    ConsensusPrediction,
    MarketPrediction,
    MatchResult,
    PredictionMatch,
} from "@/types/predictions";

export type MarketSettlementKey =
    | "result"
    | "btts"
    | "over_1_5"
    | "over_2_5"
    | "corners_over_8_5"
    | "cards_over_3_5";

export type MarketSettlementStatus = "correct" | "incorrect" | "unavailable";

export interface MarketSettlement {
    key: MarketSettlementKey;
    prediction: string | null;
    probability: number | null;
    actualOutcome: string | null;
    actualValue: string | number | null;
    status: MarketSettlementStatus;
}

interface MarketSettlementInput {
    match: PredictionMatch;
    consensus?: ConsensusPrediction;
    marketPredictions?: PredictionMatch["market_predictions"];
}

function normalizedLabel(value: string | number | null | undefined): string | null {
    if (value == null) return null;
    const label = String(value).trim().toUpperCase();
    return label || null;
}

function finiteNumber(value: number | null | undefined): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function selectedProbability(
    prediction: string | null,
    probabilities: Record<string, number> | undefined,
): number | null {
    if (!prediction || !probabilities) return null;

    const entry = Object.entries(probabilities).find(
        ([key]) => normalizedLabel(key) === prediction,
    );
    const probability = finiteNumber(entry?.[1]);
    if (probability == null) return null;

    const finiteProbabilities = Object.values(probabilities).filter(
        (value): value is number => typeof value === "number" && Number.isFinite(value),
    );
    const scale = finiteProbabilities.length > 0 && Math.max(...finiteProbabilities) <= 1 ? 100 : 1;
    return probability * scale;
}

function settlement(
    key: MarketSettlementKey,
    prediction: string | number | null | undefined,
    probabilities: Record<string, number> | undefined,
    actualOutcome: string | null,
    actualValue: string | number | null,
): MarketSettlement {
    const normalizedPrediction = normalizedLabel(prediction);
    const probability = selectedProbability(normalizedPrediction, probabilities);
    const status = normalizedPrediction == null || actualOutcome == null
        ? "unavailable"
        : normalizedPrediction === actualOutcome
            ? "correct"
            : "incorrect";

    return {
        key,
        prediction: normalizedPrediction,
        probability,
        actualOutcome,
        actualValue,
        status,
    };
}

function marketSettlement(
    key: Exclude<MarketSettlementKey, "result">,
    market: MarketPrediction | undefined,
    actualOutcome: string | null,
    actualValue: string | number | null,
): MarketSettlement {
    return settlement(
        key,
        market?.consensus.prediction,
        market?.consensus.avg_probabilities,
        actualOutcome,
        actualValue,
    );
}

export function buildMarketSettlements({
    match,
    consensus,
    marketPredictions,
}: MarketSettlementInput): MarketSettlement[] {
    const isFinished = match.status === "finished";
    const score = isFinished ? parseScorePair(match.actual_score) : null;
    const totalGoals = score ? score.home + score.away : null;
    const actualResult: MatchResult | null = isFinished
        ? match.actual_result ?? resultFromScorePair(score)
        : null;
    const actualBtts = score ? (score.home > 0 && score.away > 0 ? "YES" : "NO") : null;
    const actualOver15 = totalGoals == null ? null : totalGoals > 1.5 ? "OVER" : "UNDER";
    const actualOver25 = totalGoals == null ? null : totalGoals > 2.5 ? "OVER" : "UNDER";
    const actualCorners = isFinished ? finiteNumber(match.actual_corners) : null;
    const actualCards = isFinished ? finiteNumber(match.actual_cards) : null;

    return [
        settlement(
            "result",
            consensus?.prediction,
            consensus?.avg_probabilities,
            actualResult,
            actualResult,
        ),
        marketSettlement("btts", marketPredictions?.btts, actualBtts, actualBtts),
        marketSettlement("over_1_5", marketPredictions?.over_1_5, actualOver15, totalGoals),
        marketSettlement("over_2_5", marketPredictions?.over_2_5, actualOver25, totalGoals),
        marketSettlement(
            "corners_over_8_5",
            marketPredictions?.corners_over_8_5,
            actualCorners == null ? null : actualCorners > 8.5 ? "OVER" : "UNDER",
            actualCorners,
        ),
        marketSettlement(
            "cards_over_3_5",
            marketPredictions?.cards_over_3_5,
            actualCards == null ? null : actualCards > 3.5 ? "OVER" : "UNDER",
            actualCards,
        ),
    ];
}
