import type {
    ConsensusPrediction,
    MatchResult,
    ModelPrediction,
    PredictionMatch,
    PredictionVariant,
} from "@/types/predictions";
import type { SofascoreMatch } from "@/types/sofascore";

export interface ScorePair {
    home: number;
    away: number;
}

export interface ResolvedMatchResult {
    displayStatus: string;
    regularScore: ScorePair | null;
    normalTimeScore: ScorePair | null;
    extraTimeScore: ScorePair | null;
    penaltyScore: ScorePair | null;
    wentToExtraTime: boolean;
    decidedByPenalties: boolean;
    actualResult: MatchResult | null;
    isFinished: boolean;
}

function scoreNumber(value: number | string | null | undefined): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

export function scorePairFromValues(
    home: number | string | null | undefined,
    away: number | string | null | undefined,
): ScorePair | null {
    const homeScore = scoreNumber(home);
    const awayScore = scoreNumber(away);
    if (homeScore == null || awayScore == null) return null;
    return { home: homeScore, away: awayScore };
}

export function parseScorePair(score: string | null | undefined): ScorePair | null {
    const match = score?.match(/^\s*(\d+)\s*[-:]\s*(\d+)\s*$/);
    if (!match) return null;
    return { home: Number(match[1]), away: Number(match[2]) };
}

export function formatScorePair(score: ScorePair): string {
    return `${score.home}-${score.away}`;
}

function subtractScorePair(score: ScorePair | null, subtract: ScorePair | null): ScorePair | null {
    if (!score || !subtract) return null;
    if (score.home < subtract.home || score.away < subtract.away) return null;
    return { home: score.home - subtract.home, away: score.away - subtract.away };
}

export function resultFromScorePair(score: ScorePair | null): MatchResult | null {
    if (!score) return null;
    if (score.home > score.away) return "HOME";
    if (score.away > score.home) return "AWAY";
    return "DRAW";
}

function hasPenaltyShootoutScore(score: ScorePair | null): boolean {
    return Boolean(score && (score.home !== 0 || score.away !== 0));
}

function penaltyWinner(score: ScorePair | null): MatchResult | null {
    if (!hasPenaltyShootoutScore(score)) return null;
    const result = resultFromScorePair(score);
    return result === "DRAW" ? null : result;
}

export function deriveRegularScore(score: ScorePair | null, penaltyScore: ScorePair | null): ScorePair | null {
    if (!score) return null;
    if (
        hasPenaltyShootoutScore(penaltyScore) &&
        penaltyScore &&
        score.home >= penaltyScore.home &&
        score.away >= penaltyScore.away
    ) {
        return {
            home: score.home - penaltyScore.home,
            away: score.away - penaltyScore.away,
        };
    }
    return score;
}

export function resolvePredictionMatchResult(match: PredictionMatch): ResolvedMatchResult {
    const penaltyScore = parseScorePair(match.actual_penalty_score);
    const regularScore = deriveRegularScore(parseScorePair(match.actual_score), penaltyScore);
    const extraTimeScore = parseScorePair(match.actual_extra_time_score)
        ?? scorePairFromValues(match.home_score_et, match.away_score_et);
    const normalTimeScore = parseScorePair(match.actual_normal_time_score)
        ?? subtractScorePair(regularScore, extraTimeScore);
    const wentToExtraTime = extraTimeScore !== null;
    const decidedByPenalties = Boolean(match.decided_by_penalties || penaltyWinner(penaltyScore));
    const actualResult = (decidedByPenalties ? penaltyWinner(penaltyScore) : null)
        ?? match.actual_result
        ?? resultFromScorePair(regularScore);
    const isFinished = match.status === "finished" && actualResult !== null;

    return {
        displayStatus: match.status,
        regularScore,
        normalTimeScore,
        extraTimeScore,
        penaltyScore,
        wentToExtraTime,
        decidedByPenalties,
        actualResult,
        isFinished,
    };
}

export function resolveSofascoreMatchResult(
    match: SofascoreMatch,
    predictionMatch: PredictionMatch | null | undefined,
): ResolvedMatchResult {
    const predictionState = predictionMatch ? resolvePredictionMatchResult(predictionMatch) : null;
    const rawPenaltyScore = scorePairFromValues(match.home_score_pen, match.away_score_pen);
    const penaltyScore = predictionState?.penaltyScore ?? rawPenaltyScore;
    const rawExtraTimeScore = scorePairFromValues(match.home_score_et, match.away_score_et);
    const extraTimeScore = predictionState?.extraTimeScore ?? rawExtraTimeScore;
    const rawScore = scorePairFromValues(match.home_score, match.away_score);
    const regularScore = deriveRegularScore(predictionState?.regularScore ?? rawScore, penaltyScore);
    const normalTimeScore = predictionState?.normalTimeScore ?? subtractScorePair(regularScore, extraTimeScore);
    const wentToExtraTime = Boolean(predictionState?.wentToExtraTime || extraTimeScore);
    const reportFinished = predictionMatch?.status === "finished" && regularScore !== null;
    const displayStatus = reportFinished ? "finished" : match.status;
    const decidedByPenalties = Boolean(
        predictionMatch?.decided_by_penalties ||
        penaltyWinner(penaltyScore),
    );
    const actualResult = (decidedByPenalties ? penaltyWinner(penaltyScore) : null)
        ?? predictionState?.actualResult
        ?? resultFromScorePair(regularScore);
    const isFinished = displayStatus === "finished" && actualResult !== null;

    return {
        displayStatus,
        regularScore,
        normalTimeScore,
        extraTimeScore,
        penaltyScore,
        wentToExtraTime,
        decidedByPenalties,
        actualResult,
        isFinished,
    };
}

export function resolvedWinnerName(
    state: ResolvedMatchResult,
    homeTeam: string,
    awayTeam: string,
): string | null {
    if (!state.actualResult) return null;
    if (state.actualResult === "HOME") return homeTeam;
    if (state.actualResult === "AWAY") return awayTeam;
    return null;
}

export function penaltyAdvancer(
    state: ResolvedMatchResult,
    homeTeam: string,
    awayTeam: string,
): string | null {
    if (!state.decidedByPenalties) return null;
    return resolvedWinnerName(state, homeTeam, awayTeam);
}

function resolvedCorrectness(
    prediction: MatchResult | null | undefined,
    state: ResolvedMatchResult,
): boolean | null {
    if (!state.isFinished || !state.actualResult || !prediction) return null;
    return prediction === state.actualResult;
}

function normalizeModelPrediction(prediction: ModelPrediction, state: ResolvedMatchResult): ModelPrediction {
    return {
        ...prediction,
        correct: resolvedCorrectness(prediction.prediction, state),
    };
}

function normalizeConsensusPrediction(
    prediction: ConsensusPrediction,
    state: ResolvedMatchResult,
): ConsensusPrediction {
    return {
        ...prediction,
        correct: resolvedCorrectness(prediction.prediction, state),
    };
}

function normalizePredictionVariant(variant: PredictionVariant, state: ResolvedMatchResult): PredictionVariant {
    const predictions = Object.fromEntries(
        Object.entries(variant.predictions).map(([model, prediction]) => [
            model,
            normalizeModelPrediction(prediction, state),
        ]),
    ) as PredictionVariant["predictions"];

    return {
        ...variant,
        predictions,
        consensus: normalizeConsensusPrediction(variant.consensus, state),
    };
}

export function normalizePredictionMatchResult(match: PredictionMatch): PredictionMatch {
    const state = resolvePredictionMatchResult(match);
    const predictions = { ...match.predictions } as PredictionMatch["predictions"];

    for (const [model, prediction] of Object.entries(match.predictions)) {
        if (model === "consensus") continue;
        predictions[model] = normalizeModelPrediction(prediction as ModelPrediction, state);
    }
    predictions.consensus = normalizeConsensusPrediction(match.predictions.consensus, state);

    const predictionVariants = match.prediction_variants
        ? (Object.fromEntries(
            Object.entries(match.prediction_variants).map(([variant, data]) => [
                variant,
                data ? normalizePredictionVariant(data, state) : data,
            ]),
        ) as PredictionMatch["prediction_variants"])
        : undefined;

    return {
        ...match,
        actual_result: state.actualResult,
        actual_score: state.regularScore ? formatScorePair(state.regularScore) : match.actual_score,
        actual_penalty_score: state.penaltyScore ? formatScorePair(state.penaltyScore) : match.actual_penalty_score ?? null,
        actual_extra_time_score: state.extraTimeScore ? formatScorePair(state.extraTimeScore) : match.actual_extra_time_score ?? null,
        actual_normal_time_score: state.normalTimeScore ? formatScorePair(state.normalTimeScore) : match.actual_normal_time_score ?? null,
        decided_by_penalties: state.decidedByPenalties,
        predictions,
        prediction_variants: predictionVariants,
    };
}

export function predictionCorrectness(
    prediction: MatchResult | null | undefined,
    match: PredictionMatch,
): boolean | null {
    return resolvedCorrectness(prediction, resolvePredictionMatchResult(match));
}
