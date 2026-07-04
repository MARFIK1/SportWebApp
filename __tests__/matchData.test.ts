import { findPredictionMatch, repairMatchAnalysis, resolveMatchDisplayState } from "@/app/match/[id]/matchData";
import type { AnalysisMatch, ConsensusPrediction, ModelPrediction, PredictionMatch, PredictionReport } from "@/types/predictions";
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

function sparseAnalysis(): AnalysisMatch {
    return {
        goals: {
            home: {
                avg_scored: 2,
                avg_conceded: 3,
                clean_sheets: 0,
                failed_to_score: 0,
                score_pct: 100,
                avg_xg_for: 0,
                avg_xg_against: 0,
                n: 1,
            },
            away: {
                avg_scored: 0.75,
                avg_conceded: 2.12,
                clean_sheets: 0,
                failed_to_score: 5,
                score_pct: 37.5,
                avg_xg_for: 1.44,
                avg_xg_against: 1.31,
                n: 8,
            },
            expected_goals_home: 2,
            expected_goals_away: 1.44,
            expected_total: 3.44,
            btts_pct: 37.5,
            over_1_5_pct: 85.8,
            over_2_5_pct: 66.8,
            over_3_5_pct: 45,
        },
        corners: {
            home: { avg_for: 0, avg_against: 0, n: 0 },
            away: { avg_for: 7.3, avg_against: 4.4, n: 7 },
            expected_total: 7.3,
            over_8_5_pct: 29.6,
            over_10_5_pct: 12.7,
        },
        cards: {
            home: { avg_team: 0, n: 0 },
            away: { avg_team: 2.1, n: 7 },
            expected_total: 2.1,
            over_3_5_pct: 16.0,
            over_4_5_pct: 6.2,
        },
        shots: {
            home: { avg_shots: 0, avg_shots_on_target: 0, avg_big_chances: 0, avg_possession: 0, n: 0 },
            away: { avg_shots: 11.3, avg_shots_on_target: 3.4, avg_big_chances: 1.9, avg_possession: 56, n: 7 },
        },
        form: {
            home: "L",
            away: "LLLLL",
            home_n: 1,
            away_n: 8,
        },
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
            normalTimeScore: null,
            extraTimeScore: null,
            penaltyScore: null,
            wentToExtraTime: false,
            decidedByPenalties: false,
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

    it("repairs sparse analysis from recent matches matched by team id", () => {
        const match = sofascoreMatch({
            event_id: 14024024,
            home_team_id: 44,
            home_team: "Liverpool FC",
            away_team_id: 38,
            away_team: "Chelsea",
        });
        const homeRecent = [
            sofascoreMatch({
                event_id: 1,
                date: "2026-04-25",
                status: "finished",
                home_team_id: 44,
                home_team: "Liverpool",
                away_team_id: 77,
                away_team: "Crystal Palace",
                home_score: 3,
                away_score: 1,
                home_expectedgoals: 1.2,
                away_expectedgoals: 0.8,
                home_cornerkicks: 6,
                away_cornerkicks: 4,
                home_yellowcards: 1,
                away_yellowcards: 2,
                home_totalshotsongoal: 10,
                home_shotsongoal: 5,
                home_bigchancecreated: 3,
                home_ballpossession: 60,
            }),
            sofascoreMatch({
                event_id: 2,
                date: "2026-04-19",
                status: "finished",
                home_team_id: 88,
                home_team: "Everton",
                away_team_id: 44,
                away_team: "Liverpool",
                home_score: 1,
                away_score: 2,
                home_expectedgoals: 0.7,
                away_expectedgoals: 1.8,
                home_cornerkicks: 1,
                away_cornerkicks: 5,
                home_yellowcards: 2,
                away_yellowcards: 0,
                away_totalshotsongoal: 11,
                away_shotsongoal: 6,
                away_bigchancecreated: 2,
                away_ballpossession: 54,
            }),
        ];

        const repaired = repairMatchAnalysis(sparseAnalysis(), match, homeRecent, []);

        expect(repaired?.goals.home.n).toBe(2);
        expect(repaired?.goals.home.avg_xg_for).toBeCloseTo(1.5);
        expect(repaired?.goals.home.avg_xg_against).toBeCloseTo(0.75);
        expect(repaired?.goals.expected_goals_home).toBeCloseTo(1.5);
        expect(repaired?.corners.home.avg_for).toBeCloseTo(5.5);
        expect(repaired?.corners.expected_total).toBeCloseTo(12.8);
        expect(repaired?.cards.home.avg_team).toBeCloseTo(0.5);
        expect(repaired?.shots.home.avg_shots_on_target).toBeCloseTo(5.5);
        expect(repaired?.shots.home.avg_possession).toBeCloseTo(57);
        expect(repaired?.form.home).toBe("WW");
    });

    it("ignores empty analysis objects from generated reports", () => {
        const repaired = repairMatchAnalysis({} as AnalysisMatch, sofascoreMatch(), [], []);

        expect(repaired).toBeNull();
    });
});
