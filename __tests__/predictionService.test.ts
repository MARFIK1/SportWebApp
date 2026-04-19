jest.mock("fs");
import fs from "fs";
import {
    aggregateAccuracy,
    computeAccuracyOverTime,
    computeConsensusAccuracy,
    computeResultTypeAccuracy,
    getMatchPrediction,
    loadPredictionReport,
    loadComparisonSummary,
} from "@/app/util/data/predictionService";
import type { MatchResult, ModelAccuracy, PredictionMatch, PredictionReport } from "@/types/predictions";

const mockedFs = fs as jest.Mocked<typeof fs>;

interface TestPredictionReport {
    date: string;
    status: string;
    generated_at: string;
    updated_at: string;
    summary: {
        total_matches: number;
        finished_matches: number;
        postponed_matches: number;
        inprogress_matches: number;
        unknown_matches: number;
        pending_matches: number;
        model_accuracy: Record<string, ModelAccuracy>;
    };
    matches: Array<{
        id: string;
        league: string;
        comp_type: string;
        home_team: string;
        away_team: string;
        start_time: string;
        status: string;
        actual_result: MatchResult;
        actual_score: null;
        actual_cards: null;
        actual_corners: null;
        event_id?: number | null;
        referee_name: null;
        predictions: Record<string, unknown>;
        consensus: unknown;
        market_predictions: Record<string, unknown>;
    }>;
}

function report(date: string, accuracy: Record<string, ModelAccuracy>, matches: Array<{ actual: MatchResult; predictions: Record<string, string> }> = []): TestPredictionReport {
    return {
        date,
        status: "ok",
        generated_at: "",
        updated_at: "",
        summary: {
            total_matches: matches.length,
            finished_matches: matches.length,
            postponed_matches: 0,
            inprogress_matches: 0,
            unknown_matches: 0,
            pending_matches: 0,
            model_accuracy: accuracy,
        },
        matches: matches.map((m, i) => ({
            id: `m${i}`,
            league: "test",
            comp_type: "league",
            home_team: "A",
            away_team: "B",
            start_time: "",
            status: "finished",
            actual_result: m.actual,
            actual_score: null,
            actual_cards: null,
            actual_corners: null,
            referee_name: null,
            predictions: Object.fromEntries(
                Object.entries(m.predictions).map(([model, pred]) => [
                    model,
                    { prediction: pred, prediction_int: 0, model, probabilities: {}, confidence: 0.5, correct: pred === m.actual },
                ])
            ),
            consensus: {},
            market_predictions: {},
        })),
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockedFs.existsSync.mockReturnValue(true);
});

describe("aggregateAccuracy", () => {
    it("sums correct/incorrect/total across dates and recomputes pct", () => {
        const r1 = report("2025-01-01", {
            LightGBM: { correct: 5, incorrect: 5, total: 10, accuracy_pct: 50 },
        });
        const r2 = report("2025-01-02", {
            LightGBM: { correct: 8, incorrect: 2, total: 10, accuracy_pct: 80 },
        });
        mockedFs.readFileSync.mockImplementation((fp: unknown) => {
            const s = String(fp);
            if (s.includes("2025-01-01")) return JSON.stringify(r1);
            if (s.includes("2025-01-02")) return JSON.stringify(r2);
            throw new Error("unknown " + s);
        });

        const result = aggregateAccuracy(["2025-01-01", "2025-01-02"]);
        expect(result.LightGBM.correct).toBe(13);
        expect(result.LightGBM.incorrect).toBe(7);
        expect(result.LightGBM.total).toBe(20);
        expect(result.LightGBM.accuracy_pct).toBe(65);
    });

    it("ignores dates with no report", () => {
        mockedFs.readFileSync.mockImplementation(() => { throw new Error("not found"); });
        const result = aggregateAccuracy(["2025-01-01"]);
        expect(Object.keys(result)).toHaveLength(0);
    });
});

describe("computeAccuracyOverTime", () => {
    it("returns cumulative accuracy per model per date", () => {
        const r1 = report("2025-01-01", {
            LightGBM: { correct: 5, incorrect: 5, total: 10, accuracy_pct: 50 },
        });
        const r2 = report("2025-01-02", {
            LightGBM: { correct: 10, incorrect: 0, total: 10, accuracy_pct: 100 },
        });
        mockedFs.readFileSync.mockImplementation((fp: unknown) => {
            const s = String(fp);
            if (s.includes("2025-01-01")) return JSON.stringify(r1);
            if (s.includes("2025-01-02")) return JSON.stringify(r2);
            throw new Error("unknown");
        });

        const result = computeAccuracyOverTime(["2025-01-01", "2025-01-02"]);
        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ date: "2025-01-01", LightGBM: 50 });
        expect(result[1]).toMatchObject({ date: "2025-01-02", LightGBM: 75 });
    });
});

describe("computeResultTypeAccuracy", () => {
    it("breaks down accuracy per actual result type", () => {
        const r1 = report("2025-01-01", { LightGBM: { correct: 0, incorrect: 0, total: 0, accuracy_pct: 0 } }, [
            { actual: "HOME", predictions: { LightGBM: "HOME" } },
            { actual: "HOME", predictions: { LightGBM: "DRAW" } },
            { actual: "DRAW", predictions: { LightGBM: "DRAW" } },
            { actual: "AWAY", predictions: { LightGBM: "HOME" } },
        ]);
        mockedFs.readFileSync.mockReturnValue(JSON.stringify(r1));

        const result = computeResultTypeAccuracy(["2025-01-01"]);
        const lgbm = result.find((r) => r.model === "LightGBM")!;
        expect(lgbm.HOME).toBe(50);
        expect(lgbm.DRAW).toBe(100);
        expect(lgbm.AWAY).toBe(0);
    });

    it("skips consensus model", () => {
        const r1 = report("2025-01-01", { consensus: { correct: 0, incorrect: 0, total: 0, accuracy_pct: 0 } }, [
            { actual: "HOME", predictions: { consensus: "HOME" } },
        ]);
        mockedFs.readFileSync.mockReturnValue(JSON.stringify(r1));

        const result = computeResultTypeAccuracy(["2025-01-01"]);
        expect(result.find((r) => r.model === "consensus")).toBeUndefined();
    });
});

describe("prediction report normalization", () => {
    it("moves top-level consensus into predictions when loading a report", () => {
        const r1 = report("2025-01-01", {}, [
            { actual: "HOME", predictions: { LightGBM: "HOME" } },
        ]);
        r1.matches[0].consensus = {
            prediction: "HOME",
            agreement: "1/1",
            agreement_pct: 100,
            votes: { HOME: 1, DRAW: 0, AWAY: 0 },
            avg_probabilities: { HOME: 72, DRAW: 18, AWAY: 10 },
            correct: true,
        };
        mockedFs.readFileSync.mockReturnValue(JSON.stringify(r1));

        const loaded = loadPredictionReport("2025-01-01");

        expect(loaded?.matches[0].predictions.consensus).toMatchObject({
            prediction: "HOME",
            agreement: "1/1",
        });
    });

    it("finds a match by event_id before falling back to the report id", () => {
        const r1 = report("2025-01-01", {}, [
            { actual: "HOME", predictions: { LightGBM: "HOME" } },
            { actual: "AWAY", predictions: { LightGBM: "AWAY" } },
        ]);
        r1.matches[0].id = "legacy-id";
        r1.matches[0].event_id = 12345;
        r1.matches[1].id = "12345";
        r1.matches[1].event_id = 67890;

        const byEventId = getMatchPrediction(r1 as unknown as PredictionReport, 12345);
        const byLegacyId = getMatchPrediction(r1 as unknown as PredictionReport, "legacy-id");

        expect(byEventId?.event_id).toBe(12345);
        expect(byLegacyId?.id).toBe("legacy-id");
    });
});

describe("computeConsensusAccuracy", () => {
    it("derives correctness from actual result instead of trusting report flag", () => {
        const r1 = report("2025-01-01", {}, [
            { actual: "HOME", predictions: { LightGBM: "HOME" } },
            { actual: "AWAY", predictions: { LightGBM: "HOME" } },
            { actual: "DRAW", predictions: { LightGBM: "DRAW" } },
        ]);
        r1.matches[0].predictions.consensus = {
            prediction: "HOME",
            agreement: "1/1",
            agreement_pct: 100,
            votes: { HOME: 1, DRAW: 0, AWAY: 0 },
            avg_probabilities: { HOME: 70, DRAW: 20, AWAY: 10 },
            correct: false,
        };
        r1.matches[1].predictions.consensus = {
            prediction: "HOME",
            agreement: "1/1",
            agreement_pct: 100,
            votes: { HOME: 1, DRAW: 0, AWAY: 0 },
            avg_probabilities: { HOME: 60, DRAW: 25, AWAY: 15 },
            correct: true,
        };
        r1.matches[2].predictions.consensus = {
            prediction: "DRAW",
            agreement: "1/1",
            agreement_pct: 100,
            votes: { HOME: 0, DRAW: 1, AWAY: 0 },
            avg_probabilities: { HOME: 20, DRAW: 55, AWAY: 25 },
            correct: true,
        };

        const result = computeConsensusAccuracy(r1.matches as unknown as PredictionMatch[]);

        expect(result).toEqual({
            correct: 2,
            incorrect: 1,
            total: 3,
            accuracy_pct: 66.7,
        });
    });
});

describe("loadComparisonSummary", () => {
    it("parses CSV rows into typed objects", () => {
        const csv = [
            "Model,Test Accuracy,Test F1,Live Accuracy,Live Matches,Brier Score,Train Time (s),Predict Time (ms),Memory (MB),Model Size (KB)",
            "LightGBM,0.5089,0.4327,0.5109,916,0.6085,3.55,35.51,22.9,1383.1",
            "MLP,0.5036,0.4268,0.5087,916,0.6151,4.3,12.34,3.1,414.7",
        ].join("\n");
        mockedFs.readFileSync.mockReturnValue(csv);

        const rows = loadComparisonSummary();
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            model: "LightGBM",
            testAccuracy: 0.5089,
            liveAccuracy: 0.5109,
            liveMatches: 916,
            brierScore: 0.6085,
        });
        expect(rows[1].model).toBe("MLP");
    });

    it("returns empty array when file missing", () => {
        mockedFs.existsSync.mockReturnValue(false);
        const rows = loadComparisonSummary();
        expect(rows).toEqual([]);
    });
});
