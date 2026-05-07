import { getMatchPrediction } from "@/app/util/data/predictionService";
import type { MatchResult, PredictionMatch, PredictionReport } from "@/types/predictions";
import type { SofascoreMatch } from "@/types/sofascore";

export interface MatchDisplayState {
    displayStatus: string;
    displayHomeScore: number | null;
    displayAwayScore: number | null;
    actualResult: MatchResult | null;
    isFinished: boolean;
}

export function findPredictionMatch(
    report: PredictionReport,
    eventId: number,
    homeTeam: string,
    awayTeam: string
): PredictionMatch | undefined {
    return getMatchPrediction(report, eventId) ?? report.matches.find((m) => m.home_team === homeTeam && m.away_team === awayTeam);
}

export function parseActualScore(score: string | null | undefined): { home: number; away: number } | null {
    const match = score?.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
    if (!match) return null;
    return { home: Number(match[1]), away: Number(match[2]) };
}

export function resultFromScore(home: number | null | undefined, away: number | null | undefined): MatchResult | null {
    if (home == null || away == null) return null;
    if (home > away) return "HOME";
    if (away > home) return "AWAY";
    return "DRAW";
}

export function resolveMatchDisplayState(match: SofascoreMatch, predMatch: PredictionMatch | null | undefined): MatchDisplayState {
    const reportScore = parseActualScore(predMatch?.actual_score);
    const reportFinished = predMatch?.status === "finished" && reportScore !== null;
    const displayStatus = reportFinished ? "finished" : match.status;
    const displayHomeScore = reportFinished && reportScore ? reportScore.home : match.home_score;
    const displayAwayScore = reportFinished && reportScore ? reportScore.away : match.away_score;
    const actualResult = predMatch?.actual_result ?? resultFromScore(displayHomeScore, displayAwayScore);
    const isFinished = displayStatus === "finished" && actualResult !== null;

    return {
        displayStatus,
        displayHomeScore,
        displayAwayScore,
        actualResult,
        isFinished,
    };
}
