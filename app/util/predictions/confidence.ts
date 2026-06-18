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
