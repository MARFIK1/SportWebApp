import {
    getConsensusConfidence,
    getPredictionSignals,
    getPredictionStrength,
} from "@/app/util/predictions/confidence";
import type { ConsensusPrediction, PredictionMatch } from "@/types/predictions";

function consensus(
    prediction: "HOME" | "DRAW" | "AWAY",
    probabilities: ConsensusPrediction["avg_probabilities"],
    agreement = "6/9",
): ConsensusPrediction {
    return {
        prediction,
        agreement,
        agreement_pct: 66.7,
        votes: { HOME: 1, DRAW: 6, AWAY: 2 },
        avg_probabilities: probabilities,
        correct: null,
    };
}

describe("prediction confidence", () => {
    it("uses the selected outcome probability when a decision policy changes the argmax class", () => {
        const drawConsensus = consensus("DRAW", { HOME: 39.5, DRAW: 28.3, AWAY: 32.2 });

        expect(getConsensusConfidence(drawConsensus)).toBeCloseTo(28.3);
        expect(getPredictionStrength(drawConsensus)).toMatchObject({
            tier: "low",
            confidence: 28.3,
        });
    });

    it("builds signals from the active prediction variant", () => {
        const rootConsensus = consensus("HOME", { HOME: 60, DRAW: 20, AWAY: 20 }, "8/9");
        const activeConsensus = consensus("DRAW", { HOME: 39.5, DRAW: 28.3, AWAY: 32.2 });
        const match = {
            comp_type: "international",
            predictions: { consensus: rootConsensus },
        } as unknown as PredictionMatch;

        const signalTypes = getPredictionSignals(match, { consensus: activeConsensus }).map((signal) => signal.type);

        expect(signalTypes).toContain("low_confidence");
        expect(signalTypes).toContain("neutral_international");
    });
});
