jest.mock("fs");
import fs from "fs";
import {
    aggregateAccuracy,
    computeAccuracyOverTime,
    computeConsensusAccuracy,
    findPlayerInLineupReports,
    computeResultTypeAccuracy,
    getMatchPrediction,
    loadMatchEventSnapshot,
    loadMatchLineupSnapshot,
    loadPredictionReport,
    loadComparisonSummary,
} from "@/app/util/data/predictionService";
import type { MatchResult, ModelAccuracy, PredictionMatch, PredictionReport } from "@/types/predictions";

const mockedFs = fs as jest.Mocked<typeof fs>;
const originalDataCutoff = process.env.APP_DATA_CUTOFF;

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
        actual_score: string;
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
    const scoreForResult = (result: MatchResult): string => {
        if (result === "HOME") return "1-0";
        if (result === "AWAY") return "0-1";
        return "0-0";
    };

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
            actual_score: scoreForResult(m.actual),
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

function modelResultMatches(model: string, correct: number, total: number): Array<{ actual: MatchResult; predictions: Record<string, string> }> {
    return Array.from({ length: total }, (_, index) => ({
        actual: "HOME" as MatchResult,
        predictions: { [model]: index < correct ? "HOME" : "AWAY" },
    }));
}

beforeEach(() => {
    jest.resetAllMocks();
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.statSync.mockReturnValue({
        isDirectory: () => true,
        mtimeMs: 1,
    } as fs.Stats);
});

afterEach(() => {
    if (originalDataCutoff === undefined) delete process.env.APP_DATA_CUTOFF;
    else process.env.APP_DATA_CUTOFF = originalDataCutoff;
});

describe("frozen report boundary", () => {
    it("does not read a report after the configured cutoff", () => {
        process.env.APP_DATA_CUTOFF = "2026-07-19";

        expect(loadPredictionReport("2099-01-01")).toBeNull();
        expect(mockedFs.readFileSync).not.toHaveBeenCalled();
    });
});

describe("aggregateAccuracy", () => {
    it("sums correct/incorrect/total across dates and recomputes pct", () => {
        const r1 = report("2025-01-01", {
            LightGBM: { correct: 5, incorrect: 5, total: 10, accuracy_pct: 50 },
        }, modelResultMatches("LightGBM", 5, 10));
        const r2 = report("2025-01-02", {
            LightGBM: { correct: 8, incorrect: 2, total: 10, accuracy_pct: 80 },
        }, modelResultMatches("LightGBM", 8, 10));
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
        mockedFs.readFileSync.mockImplementation(() => {
            const error = new Error("not found") as NodeJS.ErrnoException;
            error.code = "ENOENT";
            throw error;
        });
        const result = aggregateAccuracy(["2025-01-01"]);
        expect(Object.keys(result)).toHaveLength(0);
    });

    it("uses compact accuracy history for all-time totals when dates are omitted", () => {
        mockedFs.readFileSync.mockImplementation((fp: unknown) => {
            const s = String(fp);
            if (s.includes("accuracy_history.json")) {
                return JSON.stringify({
                    dates: [
                        { date: "2025-01-01", models: { LightGBM: { correct: 5, incorrect: 5, total: 10 } } },
                        { date: "2025-01-02", models: { LightGBM: { correct: 10, incorrect: 0, total: 10 } } },
                    ],
                });
            }
            throw new Error("reports should not be read");
        });

        const result = aggregateAccuracy();
        expect(result.LightGBM).toMatchObject({
            correct: 15,
            incorrect: 5,
            total: 20,
            accuracy_pct: 75,
        });
    });
});

describe("computeAccuracyOverTime", () => {
    it("returns cumulative accuracy per model per date", () => {
        const r1 = report("2025-01-01", {
            LightGBM: { correct: 5, incorrect: 5, total: 10, accuracy_pct: 50 },
        }, modelResultMatches("LightGBM", 5, 10));
        const r2 = report("2025-01-02", {
            LightGBM: { correct: 10, incorrect: 0, total: 10, accuracy_pct: 100 },
        }, modelResultMatches("LightGBM", 10, 10));
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

    it("uses compact accuracy history when dates are omitted", () => {
        mockedFs.readFileSync.mockImplementation((fp: unknown) => {
            const s = String(fp);
            if (s.includes("accuracy_history.json")) {
                return JSON.stringify({
                    dates: [
                        { date: "2025-01-01", models: { LightGBM: { correct: 5, incorrect: 5, total: 10 } } },
                        { date: "2025-01-02", models: { LightGBM: { correct: 10, incorrect: 0, total: 10 } } },
                    ],
                });
            }
            throw new Error("reports should not be read");
        });

        const result = computeAccuracyOverTime();
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
    it("rejects invalid report dates before building filesystem paths", () => {
        const loaded = loadPredictionReport("../2025-01-01");

        expect(loaded).toBeNull();
        expect(mockedFs.readFileSync).not.toHaveBeenCalled();
    });

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

    it("preserves with_odds prediction variants when loading a report", () => {
        const r1 = report("2025-01-01", {}, [
            { actual: "HOME", predictions: { LightGBM: "HOME" } },
        ]);
        const basePrediction = {
            prediction: "HOME",
            prediction_int: 0,
            model: "LightGBM",
            probabilities: { HOME: 70, DRAW: 20, AWAY: 10 },
            confidence: 0.7,
            correct: null,
        };
        const baseConsensus = {
            prediction: "HOME",
            agreement: "1/1",
            agreement_pct: 100,
            votes: { HOME: 1, DRAW: 0, AWAY: 0 },
            avg_probabilities: { HOME: 70, DRAW: 20, AWAY: 10 },
            correct: null,
        };
        Object.assign(r1.matches[0], {
            default_prediction_variant: "with_odds",
            prediction_variants: {
                without_odds: {
                    predictions: { LightGBM: basePrediction },
                    consensus: baseConsensus,
                    odds_used: false,
                },
                with_odds: {
                    predictions: { LightGBM: basePrediction },
                    consensus: baseConsensus,
                    market_predictions: {
                        btts: {
                            models: {},
                            consensus: {
                                prediction: "yes",
                                agreement: "1/1",
                                agreement_pct: 100,
                                avg_probabilities: { yes: 62, no: 38 },
                            },
                        },
                    },
                    odds_used: true,
                },
            },
        });
        mockedFs.readFileSync.mockReturnValue(JSON.stringify(r1));

        const loaded = loadPredictionReport("2025-01-01");

        expect(loaded?.matches[0].default_prediction_variant).toBe("with_odds");
        expect(loaded?.matches[0].prediction_variants?.with_odds).toMatchObject({
            odds_used: true,
            consensus: { prediction: "HOME" },
        });
        expect(loaded?.matches[0].prediction_variants?.with_odds?.market_predictions?.btts?.consensus.prediction).toBe("yes");
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

describe("match event snapshots", () => {
    it("rejects invalid dates before reading the sidecar", () => {
        const loaded = loadMatchEventSnapshot("../2026-07-25", 16316943);

        expect(loaded).toBeNull();
        expect(mockedFs.readFileSync).not.toHaveBeenCalled();
    });

    it("loads the selected match and removes malformed events", () => {
        mockedFs.readFileSync.mockReturnValue(JSON.stringify({
            schema_version: 1,
            date: "2026-07-25",
            updated_at: "2026-07-26 00:10:00",
            matches: {
                "16316943": {
                    event_id: 16316943,
                    status: "finished",
                    home_team: "Jagiellonia Bialystok",
                    away_team: "MKS Korona Kielce",
                    updated_at: "2026-07-26 00:10:00",
                    events: [
                        {
                            id: "goal-1",
                            type: "goal",
                            source_type: "goal",
                            minute: 89,
                            is_home: true,
                        },
                        {
                            id: "broken",
                            type: "advertisement",
                        },
                    ],
                },
            },
        }));

        const loaded = loadMatchEventSnapshot("2026-07-25", 16316943);

        expect(loaded).toMatchObject({
            event_id: 16316943,
            status: "finished",
        });
        expect(loaded?.events).toEqual([
            expect.objectContaining({ id: "goal-1", type: "goal", minute: 89 }),
        ]);
    });
});

describe("match lineup snapshots", () => {
    it("rejects invalid dates before reading the sidecar", () => {
        const loaded = loadMatchLineupSnapshot("../2026-07-27", 16316950);

        expect(loaded).toBeNull();
        expect(mockedFs.readFileSync).not.toHaveBeenCalled();
    });

    it("loads valid lineups and removes malformed players", () => {
        mockedFs.readFileSync.mockReturnValue(JSON.stringify({
            schema_version: 1,
            date: "2026-07-27",
            updated_at: "2026-07-28 00:10:00",
            matches: {
                "16316950": {
                    event_id: 16316950,
                    status: "finished",
                    home_team: "Zaglebie Lubin",
                    away_team: "Piast Gliwice",
                    updated_at: "2026-07-28 00:10:00",
                    confirmed: true,
                    home: {
                        formation: "4-2-3-1",
                        starters: [
                            { id: 1, name: "Home Goalkeeper", position: "G", rating: 7.1 },
                            { id: 2, position: "D" },
                        ],
                        substitutes: [],
                    },
                    away: {
                        formation: "4-4-2",
                        starters: [
                            { id: 3, name: "Away Forward", position: "F", rating: 8.2 },
                        ],
                        substitutes: [
                            { id: 4, name: "Away Substitute", position: "M" },
                        ],
                    },
                    player_of_the_match: {
                        id: 1,
                        name: "Home Goalkeeper",
                        position: "G",
                        rating: 7.1,
                        team_side: "home",
                        selection_method: "official",
                    },
                    top_rated_player: {
                        id: 3,
                        name: "Away Forward",
                        position: "F",
                        rating: 8.2,
                        team_side: "away",
                        selection_method: "highest_rating",
                    },
                },
            },
        }));

        const loaded = loadMatchLineupSnapshot("2026-07-27", 16316950);

        expect(loaded).toMatchObject({
            event_id: 16316950,
            confirmed: true,
            home: { formation: "4-2-3-1" },
            away: { formation: "4-4-2" },
            player_of_the_match: {
                name: "Home Goalkeeper",
                team_side: "home",
                selection_method: "official",
            },
            top_rated_player: {
                name: "Away Forward",
                rating: 8.2,
                team_side: "away",
            },
        });
        expect(loaded?.home.starters).toHaveLength(1);
        expect(loaded?.away.substitutes).toEqual([
            expect.objectContaining({ name: "Away Substitute" }),
        ]);
    });

    it("ignores malformed top-rated metadata", () => {
        mockedFs.readFileSync.mockReturnValue(JSON.stringify({
            schema_version: 1,
            matches: {
                "99": {
                    event_id: 99,
                    status: "finished",
                    updated_at: "2026-07-28 00:10:00",
                    confirmed: false,
                    home: { starters: [{ name: "Home Player" }], substitutes: [] },
                    away: { starters: [{ name: "Away Player" }], substitutes: [] },
                    top_rated_player: {
                        name: "Invalid Team Side",
                        team_side: "neutral",
                        selection_method: "highest_rating",
                    },
                },
            },
        }));

        expect(loadMatchLineupSnapshot("2026-07-28", 99)?.top_rated_player).toBeUndefined();
    });

    it("finds a player in the newest lineup report", () => {
        mockedFs.readdirSync.mockReturnValue(["2026-07-27", "2026-07-28"] as never);
        mockedFs.readFileSync.mockImplementation((filePath: unknown) => {
            const reportDate = String(filePath).includes("2026-07-28") ? "2026-07-28" : "2026-07-27";
            return JSON.stringify({
                schema_version: 1,
                matches: {
                    "123": {
                        event_id: 123,
                        status: "finished",
                        home_team: reportDate === "2026-07-28" ? "Current Team" : "Previous Team",
                        away_team: "Away Team",
                        updated_at: reportDate,
                        confirmed: true,
                        home: {
                            starters: [{
                                id: 55,
                                name: "Current Player",
                                short_name: "C. Player",
                                position: "D",
                                jersey_number: "5",
                            }],
                            substitutes: [],
                        },
                        away: {
                            starters: [{ id: 77, name: "Away Player", position: "F" }],
                            substitutes: [],
                        },
                    },
                },
            });
        });

        expect(findPlayerInLineupReports(55)).toEqual({
            player: expect.objectContaining({
                id: 55,
                name: "Current Player",
                position: "D",
            }),
            teamName: "Current Team",
            reportDate: "2026-07-28",
            eventId: 123,
        });
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

    it("parses quoted CSV fields", () => {
        const csv = [
            "Model,Test Accuracy,Test F1,Live Accuracy,Live Matches,Brier Score,Train Time (s),Predict Time (ms),Memory (MB),Model Size (KB)",
            "\"Model, With Comma\",0.5,0.4,0.6,10,0.7,1,2,3,4",
        ].join("\n");
        mockedFs.readFileSync.mockReturnValue(csv);

        const rows = loadComparisonSummary();
        expect(rows).toHaveLength(1);
        expect(rows[0].model).toBe("Model, With Comma");
        expect(rows[0].liveAccuracy).toBe(0.6);
    });

    it("returns empty array when file missing", () => {
        mockedFs.existsSync.mockReturnValue(false);
        const rows = loadComparisonSummary();
        expect(rows).toEqual([]);
    });
});
