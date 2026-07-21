import type { ConsensusPrediction, MatchResult, PredictionMatch } from "@/types/predictions";

export type PredictionStrengthTier = "strong" | "lean" | "low";

export interface PredictionStrength {
    tier: PredictionStrengthTier;
    confidence: number;
    agreementCount: number;
    margin: number;
}

export const OUTCOMES: MatchResult[] = ["HOME", "DRAW", "AWAY"];
export const STRONG_CONFIDENCE_THRESHOLD = 55;
export const STRONG_AGREEMENT_THRESHOLD = 7;
export const STRONG_MARGIN_THRESHOLD = 8;
export const LEAN_CONFIDENCE_THRESHOLD = 45;
export const LEAN_AGREEMENT_THRESHOLD = 5;

export function getProbabilityScale(probabilities: Partial<Record<MatchResult, number>> | undefined): number {
    if (!probabilities) return 1;
    return Math.max(...OUTCOMES.map((outcome) => probabilities[outcome] ?? 0)) <= 1 ? 100 : 1;
}

export function getConsensusConfidence(consensus: ConsensusPrediction | null | undefined): number {
    if (!consensus?.prediction) return 0;
    const scale = getProbabilityScale(consensus.avg_probabilities);
    return (consensus.avg_probabilities?.[consensus.prediction] ?? 0) * scale;
}

export function getConsensusMargin(consensus: ConsensusPrediction | null | undefined): number {
    if (!consensus?.prediction) return 0;
    const scale = getProbabilityScale(consensus.avg_probabilities);
    const selected = (consensus.avg_probabilities?.[consensus.prediction] ?? 0) * scale;
    const nextBest = Math.max(
        ...OUTCOMES
            .filter((outcome) => outcome !== consensus.prediction)
            .map((outcome) => (consensus.avg_probabilities?.[outcome] ?? 0) * scale),
    );
    return Math.max(0, selected - nextBest);
}

export function getAgreementCount(agreement: string | null | undefined): number {
    if (!agreement) return 0;
    const parsed = Number.parseInt(agreement.split("/")[0] ?? "0", 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function getPredictionStrength(consensus: ConsensusPrediction | null | undefined): PredictionStrength {
    const confidence = getConsensusConfidence(consensus);
    const agreementCount = getAgreementCount(consensus?.agreement);
    const margin = getConsensusMargin(consensus);

    if (
        confidence >= STRONG_CONFIDENCE_THRESHOLD &&
        agreementCount >= STRONG_AGREEMENT_THRESHOLD &&
        margin >= STRONG_MARGIN_THRESHOLD
    ) {
        return { tier: "strong", confidence, agreementCount, margin };
    }

    if (confidence >= LEAN_CONFIDENCE_THRESHOLD && agreementCount >= LEAN_AGREEMENT_THRESHOLD) {
        return { tier: "lean", confidence, agreementCount, margin };
    }

    return { tier: "low", confidence, agreementCount, margin };
}

export function getMatchConsensus(match: PredictionMatch): ConsensusPrediction | null {
    return match.predictions.consensus ?? null;
}

export function getMatchConsensusConfidence(match: PredictionMatch): number {
    return getConsensusConfidence(getMatchConsensus(match));
}

export function getMatchAgreementCount(match: PredictionMatch): number {
    return getAgreementCount(getMatchConsensus(match)?.agreement);
}

export function isHighConfidenceMatch(match: PredictionMatch): boolean {
    return getPredictionStrength(getMatchConsensus(match)).tier === "strong";
}
export type PredictionSignalType = "low_confidence" | "model_split" | "close_call" | "neutral_international";

export interface PredictionSignal {
    type: PredictionSignalType;
    severity: "info" | "warning";
}

function pushSignal(signals: PredictionSignal[], signal: PredictionSignal): void {
    if (!signals.some((item) => item.type === signal.type)) {
        signals.push(signal);
    }
}

export function getPredictionSignals(
    match: PredictionMatch,
    options: { isInternationalMatch?: boolean; consensus?: ConsensusPrediction | null } = {},
): PredictionSignal[] {
    const consensus = options.consensus === undefined ? getMatchConsensus(match) : options.consensus;
    if (!consensus?.prediction) return [];

    const strength = getPredictionStrength(consensus);
    const signals: PredictionSignal[] = [];

    if (strength.tier === "low") {
        pushSignal(signals, { type: "low_confidence", severity: "warning" });
    }

    const modelPredictions = Object.entries(match.predictions)
        .filter(([name]) => name !== "consensus")
        .map(([, prediction]) => prediction.prediction)
        .filter((prediction): prediction is MatchResult => Boolean(prediction));

    if (modelPredictions.length >= 5) {
        const consensusVotes = modelPredictions.filter((prediction) => prediction === consensus.prediction).length;
        if (consensusVotes / modelPredictions.length < 0.6) {
            pushSignal(signals, { type: "model_split", severity: "warning" });
        }
    }

    if (strength.margin > 0 && strength.margin < 4) {
        pushSignal(signals, { type: "close_call", severity: "info" });
    }

    const isInternationalMatch = options.isInternationalMatch ?? match.comp_type === "international";
    if (isInternationalMatch && strength.confidence < 50) {
        pushSignal(signals, { type: "neutral_international", severity: "info" });
    }

    return signals;
}
