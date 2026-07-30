import { buildMarketSettlements } from "@/app/util/predictions/marketSettlement";
import type {
    ConsensusPrediction,
    MarketPrediction,
    ModelPrediction,
    PredictionMatch,
} from "@/types/predictions";

function consensus(
    prediction: "HOME" | "DRAW" | "AWAY",
    probabilities: Record<"HOME" | "DRAW" | "AWAY", number>,
): ConsensusPrediction & ModelPrediction {
    return {
        prediction,
        agreement: "6/9",
        agreement_pct: 66.7,
        votes: { HOME: 6, DRAW: 2, AWAY: 1 },
        avg_probabilities: probabilities,
        probabilities,
        confidence: Math.max(...Object.values(probabilities)),
        correct: null,
    };
}

function market(prediction: string, probabilities: Record<string, number>): MarketPrediction {
    return {
        models: {},
        consensus: {
            prediction,
            agreement: "6/9",
            agreement_pct: 66.7,
            avg_probabilities: probabilities,
        },
    };
}

function match(overrides: Partial<PredictionMatch> = {}): PredictionMatch {
    const resultConsensus = consensus("HOME", { HOME: 55, DRAW: 25, AWAY: 20 });
    return {
        id: "match",
        event_id: 1,
        league: "poland/ekstraklasa",
        comp_type: "league",
        home_team: "Home",
        away_team: "Away",
        start_time: "18:00",
        status: "finished",
        actual_result: "HOME",
        actual_score: "2-1",
        actual_cards: 4,
        actual_corners: 9,
        referee_name: null,
        predictions: {
            consensus: resultConsensus,
        },
        market_predictions: {
            btts: market("YES", { YES: 0.62, NO: 0.38 }),
            over_1_5: market("OVER", { OVER: 70, UNDER: 30 }),
            over_2_5: market("UNDER", { OVER: 48, UNDER: 52 }),
            corners_over_8_5: market("OVER", { OVER: 56, UNDER: 44 }),
            cards_over_3_5: market("UNDER", { OVER: 49, UNDER: 51 }),
        },
        ...overrides,
    };
}

describe("market settlement", () => {
    it("settles 1X2, goals, corners and cards against final values", () => {
        const source = match();
        const result = buildMarketSettlements({
            match: source,
            consensus: source.predictions.consensus,
            marketPredictions: source.market_predictions,
        });

        expect(result.map(({ key, status }) => [key, status])).toEqual([
            ["result", "correct"],
            ["btts", "correct"],
            ["over_1_5", "correct"],
            ["over_2_5", "incorrect"],
            ["corners_over_8_5", "correct"],
            ["cards_over_3_5", "incorrect"],
        ]);
        expect(result[1].probability).toBeCloseTo(62);
        expect(result[4].actualValue).toBe(9);
        expect(result[5].actualValue).toBe(4);
    });

    it("keeps score markets available when cards and corners are missing", () => {
        const source = match({ actual_cards: null, actual_corners: null });
        const result = buildMarketSettlements({
            match: source,
            consensus: source.predictions.consensus,
            marketPredictions: source.market_predictions,
        });

        expect(result.find(({ key }) => key === "btts")?.status).toBe("correct");
        expect(result.find(({ key }) => key === "corners_over_8_5")?.status).toBe("unavailable");
        expect(result.find(({ key }) => key === "cards_over_3_5")?.status).toBe("unavailable");
    });

    it("uses the 1X2 result contract for matches decided on penalties", () => {
        const source = match({
            actual_result: "DRAW",
            actual_score: "1-1",
            actual_penalty_score: "4-3",
            decided_by_penalties: true,
        });
        const drawConsensus = consensus("DRAW", { HOME: 30, DRAW: 40, AWAY: 30 });
        const result = buildMarketSettlements({
            match: source,
            consensus: drawConsensus,
            marketPredictions: source.market_predictions,
        });

        expect(result[0]).toMatchObject({
            prediction: "DRAW",
            actualOutcome: "DRAW",
            actualValue: "DRAW",
            status: "correct",
        });
        expect(result.find(({ key }) => key === "over_1_5")?.actualValue).toBe(2);
    });
});
