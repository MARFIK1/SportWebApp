import { findPredictionMatch, resolveMatchDisplayState } from "@/app/match/[id]/matchData";
import type { ConsensusPrediction, ModelPrediction, PredictionMatch, PredictionReport } from "@/types/predictions";
import type { SofascoreMatch } from "@/types/sofascore";

function modelPrediction(prediction: "HOME" | "DRAW" | "AWAY"): ModelPrediction {
    return {
        prediction,
        prediction_int: 0,
        model: "LightGBM",
        probabilities: { HOME: 60, DRAW: 25, AWAY: 15 },
        confidence: 0.6,
        correct: null,
    };
}

function consensus(prediction: "HOME" | "DRAW" | "AWAY"): ConsensusPrediction {
    return {
        prediction,
        agreement: "1/1",
        agreement_pct: 100,
        votes: { HOME: prediction === "HOME" ? 1 : 0, DRAW: prediction === "DRAW" ? 1 : 0, AWAY: prediction === "AWAY" ? 1 : 0 },
        avg_probabilities: { HOME: 60, DRAW: 25, AWAY: 15 },
        correct: null,
    };
}

function sofascoreMatch(overrides: Partial<SofascoreMatch> = {}): SofascoreMatch {
    return {
        event_id: 1001,
        date: "2026-05-07T18:00:00+00:00",
        round: 1,
        home_team_id: 10,
        home_team: "Home FC",
        away_team_id: 20,
        away_team: "Away FC",
        home_score: null,
        away_score: null,
        home_score_ht: null,
        away_score_ht: null,
        status: "notstarted",
        season: "2025/2026",
        ...overrides,
    } as SofascoreMatch;
}

function predictionMatch(overrides: Partial<PredictionMatch> = {}): PredictionMatch {
    return {
        id: "p1",
        event_id: 1001,
        league: "Test League",
        comp_type: "league",
        home_team: "Home FC",
        away_team: "Away FC",
        start_time: "2026-05-07T18:00:00+00:00",
        status: "notstarted",
        actual_result: null,
        actual_score: null,
        actual_cards: null,
        actual_corners: null,
        referee_name: null,
        predictions: {
            LightGBM: modelPrediction("HOME"),
            consensus: consensus("HOME"),
        } as unknown as PredictionMatch["predictions"],
        market_predictions: {},
        ...overrides,
    };
}

function predictionReport(matches: PredictionMatch[]): PredictionReport {
    return {
        date: "2026-05-07",
        status: "ok",
        generated_at: "",
        updated_at: "",
        summary: {
            total_matches: matches.length,
            finished_matches: 0,
            postponed_matches: 0,
            inprogress_matches: 0,
            unknown_matches: 0,
            pending_matches: matches.length,
            model_accuracy: {},
        },
        matches,
    };
}

describe("match page data contracts", () => {
    it("uses the prediction report result for a finished match when the source dataset is stale", () => {
        const sourceMatch = sofascoreMatch({
            status: "notstarted",
            home_score: null,
            away_score: null,
        });
        const reportMatch = predictionMatch({
            status: "finished",
            actual_score: "2 - 1",
            actual_result: "HOME",
        });

        const display = resolveMatchDisplayState(sourceMatch, reportMatch);

        expect(display).toEqual({
            displayStatus: "finished",
            displayHomeScore: 2,
            displayAwayScore: 1,
            actualResult: "HOME",
            isFinished: true,
        });
    });

    it("does not mark a match finished when the report score is missing or malformed", () => {
        const display = resolveMatchDisplayState(
            sofascoreMatch({ status: "notstarted", home_score: null, away_score: null }),
            predictionMatch({ status: "finished", actual_score: "pending", actual_result: "HOME" })
        );

        expect(display).toMatchObject({
            displayStatus: "notstarted",
            displayHomeScore: null,
            displayAwayScore: null,
            isFinished: false,
        });
    });

    it("finds report matches by event_id before falling back to home and away team names", () => {
        const byTeams = predictionMatch({ id: "team-fallback", event_id: null });
        const byEvent = predictionMatch({
            id: "event-match",
            event_id: 1001,
            home_team: "Different Home",
            away_team: "Different Away",
        });

        const found = findPredictionMatch(predictionReport([byTeams, byEvent]), 1001, "Home FC", "Away FC");

        expect(found?.id).toBe("event-match");
    });
});
