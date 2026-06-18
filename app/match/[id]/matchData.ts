import { getMatchPrediction } from "@/app/util/data/predictionService";
import { resolveSofascoreMatchResult } from "@/app/util/predictions/matchResult";
import type { AnalysisGoalsSide, AnalysisMatch, MatchResult, PredictionMatch, PredictionReport } from "@/types/predictions";
import type { SofascoreMatch } from "@/types/sofascore";

export interface MatchDisplayState {
    displayStatus: string;
    displayHomeScore: number | null;
    displayAwayScore: number | null;
    penaltyScore: { home: number; away: number } | null;
    decidedByPenalties: boolean;
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

export function resolveMatchDisplayState(match: SofascoreMatch, predMatch: PredictionMatch | null | undefined): MatchDisplayState {
    const state = resolveSofascoreMatchResult(match, predMatch);

    return {
        displayStatus: state.displayStatus,
        displayHomeScore: state.regularScore?.home ?? null,
        displayAwayScore: state.regularScore?.away ?? null,
        penaltyScore: state.penaltyScore,
        decidedByPenalties: state.decidedByPenalties,
        actualResult: state.actualResult,
        isFinished: state.isFinished,
    };
}

type AnalysisCornerSide = AnalysisMatch["corners"]["home"];
type AnalysisCardSide = AnalysisMatch["cards"]["home"];
type AnalysisShotsSide = AnalysisMatch["shots"]["home"];

interface RecentTeamAnalysis {
    goals: AnalysisGoalsSide;
    corners: AnalysisCornerSide;
    cards: AnalysisCardSide;
    shots: AnalysisShotsSide;
    form: string;
    formCount: number;
}

interface AverageAccumulator {
    total: number;
    count: number;
}

const RECENT_ANALYSIS_LIMIT = 8;
const FORM_LIMIT = 5;

function averageAccumulator(): AverageAccumulator {
    return { total: 0, count: 0 };
}

function addAverage(accumulator: AverageAccumulator, value: number | null): void {
    if (typeof value === "number" && Number.isFinite(value)) {
        accumulator.total += value;
        accumulator.count += 1;
    }
}

function average(accumulator: AverageAccumulator, decimals: number): number {
    if (accumulator.count === 0) return 0;
    const scale = 10 ** decimals;
    return Math.round((accumulator.total / accumulator.count) * scale) / scale;
}

function roundNumber(value: number, decimals: number): number {
    const scale = 10 ** decimals;
    return Math.round(value * scale) / scale;
}

function readNumber(match: SofascoreMatch, keys: string[]): number | null {
    const raw = match as unknown as Record<string, unknown>;
    for (const key of keys) {
        const value = raw[key];
        if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return null;
}

function readSideNumber(match: SofascoreMatch, isHome: boolean, homeKeys: string[], awayKeys: string[]): number | null {
    return readNumber(match, isHome ? homeKeys : awayKeys);
}

function hasAnalysisMatchShape(analysis: AnalysisMatch | null | undefined): analysis is AnalysisMatch {
    const candidate = analysis as Partial<AnalysisMatch> | null | undefined;
    return Boolean(
        candidate?.goals?.home &&
        candidate.goals.away &&
        candidate.corners?.home &&
        candidate.corners.away &&
        candidate.cards?.home &&
        candidate.cards.away &&
        candidate.shots?.home &&
        candidate.shots.away &&
        candidate.form &&
        typeof candidate.form.home === "string" &&
        typeof candidate.form.away === "string"
    );
}

function resultLetter(goalsFor: number, goalsAgainst: number): "W" | "D" | "L" {
    if (goalsFor > goalsAgainst) return "W";
    if (goalsFor < goalsAgainst) return "L";
    return "D";
}

function buildRecentTeamAnalysis(teamId: number, matches: SofascoreMatch[]): RecentTeamAnalysis {
    const scored: number[] = [];
    const conceded: number[] = [];
    const form: Array<"W" | "D" | "L"> = [];
    const xgFor = averageAccumulator();
    const xgAgainst = averageAccumulator();
    const cornersFor = averageAccumulator();
    const cornersAgainst = averageAccumulator();
    const cards = averageAccumulator();
    const shots = averageAccumulator();
    const shotsOnTarget = averageAccumulator();
    const bigChances = averageAccumulator();
    const possession = averageAccumulator();

    for (const match of matches.slice(0, RECENT_ANALYSIS_LIMIT)) {
        const isHome = match.home_team_id === teamId;
        const isAway = match.away_team_id === teamId;
        if (!isHome && !isAway) continue;

        const result = resolveSofascoreMatchResult(match, null);
        const goalsFor = isHome ? result.regularScore?.home : result.regularScore?.away;
        const goalsAgainst = isHome ? result.regularScore?.away : result.regularScore?.home;
        if (goalsFor == null || goalsAgainst == null) continue;

        scored.push(goalsFor);
        conceded.push(goalsAgainst);
        if (form.length < FORM_LIMIT) form.push(resultLetter(goalsFor, goalsAgainst));

        addAverage(xgFor, readSideNumber(match, isHome, ["home_expectedgoals", "home_xg"], ["away_expectedgoals", "away_xg"]));
        addAverage(xgAgainst, readSideNumber(match, isHome, ["away_expectedgoals", "away_xg"], ["home_expectedgoals", "home_xg"]));
        addAverage(cornersFor, readSideNumber(match, isHome, ["home_cornerkicks"], ["away_cornerkicks"]));
        addAverage(cornersAgainst, readSideNumber(match, isHome, ["away_cornerkicks"], ["home_cornerkicks"]));
        addAverage(cards, readSideNumber(
            match,
            isHome,
            ["home_yellow_cards_calc", "home_yellowcards"],
            ["away_yellow_cards_calc", "away_yellowcards"]
        ));
        addAverage(shots, readSideNumber(match, isHome, ["home_totalshotsongoal", "home_shotsongoal"], ["away_totalshotsongoal", "away_shotsongoal"]));
        addAverage(shotsOnTarget, readSideNumber(match, isHome, ["home_shotsongoal"], ["away_shotsongoal"]));
        addAverage(bigChances, readSideNumber(match, isHome, ["home_bigchancecreated"], ["away_bigchancecreated"]));
        addAverage(possession, readSideNumber(match, isHome, ["home_ballpossession"], ["away_ballpossession"]));
    }

    const matchCount = scored.length;

    return {
        goals: {
            avg_scored: average({ total: scored.reduce((sum, value) => sum + value, 0), count: matchCount }, 2),
            avg_conceded: average({ total: conceded.reduce((sum, value) => sum + value, 0), count: matchCount }, 2),
            clean_sheets: conceded.filter((value) => value === 0).length,
            failed_to_score: scored.filter((value) => value === 0).length,
            score_pct: matchCount > 0 ? roundNumber((scored.filter((value) => value > 0).length / matchCount) * 100, 1) : 0,
            avg_xg_for: average(xgFor, 2),
            avg_xg_against: average(xgAgainst, 2),
            n: matchCount,
            xg_n: xgFor.count,
        },
        corners: {
            avg_for: average(cornersFor, 1),
            avg_against: average(cornersAgainst, 1),
            n: cornersFor.count,
        },
        cards: {
            avg_team: average(cards, 1),
            n: cards.count,
        },
        shots: {
            avg_shots: average(shots, 1),
            avg_shots_on_target: average(shotsOnTarget, 1),
            avg_big_chances: average(bigChances, 1),
            avg_possession: average(possession, 1),
            n: shots.count,
        },
        form: form.join(""),
        formCount: form.length,
    };
}

function shouldUseRecentGoals(current: AnalysisGoalsSide, recent: AnalysisGoalsSide): boolean {
    if (recent.n === 0) return false;
    const currentN = current.n ?? 0;
    const fillsMissingXg = recent.avg_xg_for > 0 && (current.avg_xg_for ?? 0) === 0;
    const fillsMissingDefensiveXg = recent.avg_xg_against > 0 && (current.avg_xg_against ?? 0) === 0;
    return recent.n > currentN && (currentN < 3 || fillsMissingXg || fillsMissingDefensiveXg);
}

function shouldUseRecentCorners(current: AnalysisCornerSide, recent: AnalysisCornerSide): boolean {
    if (recent.n === 0) return false;
    const currentN = current.n ?? 0;
    return recent.n > currentN && (currentN < 3 || ((current.avg_for ?? 0) === 0 && recent.avg_for > 0));
}

function shouldUseRecentCards(current: AnalysisCardSide, recent: AnalysisCardSide): boolean {
    if (recent.n === 0) return false;
    const currentN = current.n ?? 0;
    return recent.n > currentN && (currentN < 3 || ((current.avg_team ?? 0) === 0 && recent.avg_team > 0));
}

function shouldUseRecentShots(current: AnalysisShotsSide, recent: AnalysisShotsSide): boolean {
    if (recent.n === 0) return false;
    const currentN = current.n ?? 0;
    return recent.n > currentN && (
        currentN < 3 ||
        ((current.avg_shots_on_target ?? 0) === 0 && recent.avg_shots_on_target > 0) ||
        ((current.avg_possession ?? 0) === 0 && recent.avg_possession > 0)
    );
}

function factorial(value: number): number {
    let result = 1;
    for (let i = 2; i <= value; i += 1) result *= i;
    return result;
}

function poissonOver(expected: number, threshold: number): number {
    if (expected <= 0) return 0;
    const max = Math.floor(threshold);
    let cdf = 0;
    for (let i = 0; i <= max; i += 1) {
        cdf += ((expected ** i) * Math.exp(-expected)) / factorial(i);
    }
    return roundNumber((1 - cdf) * 100, 1);
}

function rebuildGoalsSection(goals: AnalysisMatch["goals"], home: AnalysisGoalsSide, away: AnalysisGoalsSide): AnalysisMatch["goals"] {
    const expectedHome = home.avg_xg_for > 0 ? home.avg_xg_for : home.avg_scored;
    const expectedAway = away.avg_xg_for > 0 ? away.avg_xg_for : away.avg_scored;
    const expectedTotal = roundNumber(expectedHome + expectedAway, 2);

    return {
        ...goals,
        home,
        away,
        expected_goals_home: roundNumber(expectedHome, 2),
        expected_goals_away: roundNumber(expectedAway, 2),
        expected_total: expectedTotal,
        btts_pct: roundNumber((home.score_pct / 100) * (away.score_pct / 100) * 100, 1),
        over_1_5_pct: poissonOver(expectedTotal, 1.5),
        over_2_5_pct: poissonOver(expectedTotal, 2.5),
        over_3_5_pct: poissonOver(expectedTotal, 3.5),
    };
}

function rebuildCornersSection(corners: AnalysisMatch["corners"], home: AnalysisCornerSide, away: AnalysisCornerSide): AnalysisMatch["corners"] {
    const expectedTotal = roundNumber(home.avg_for + away.avg_for, 1);
    return {
        ...corners,
        home,
        away,
        expected_total: expectedTotal,
        over_8_5_pct: poissonOver(expectedTotal, 8.5),
        over_10_5_pct: poissonOver(expectedTotal, 10.5),
    };
}

function rebuildCardsSection(cards: AnalysisMatch["cards"], home: AnalysisCardSide, away: AnalysisCardSide): AnalysisMatch["cards"] {
    const expectedTotal = roundNumber(home.avg_team + away.avg_team, 1);
    return {
        ...cards,
        home,
        away,
        expected_total: expectedTotal,
        over_3_5_pct: poissonOver(expectedTotal, 3.5),
        over_4_5_pct: poissonOver(expectedTotal, 4.5),
    };
}

export function repairMatchAnalysis(
    analysis: AnalysisMatch | null,
    match: SofascoreMatch,
    homeRecent: SofascoreMatch[],
    awayRecent: SofascoreMatch[]
): AnalysisMatch | null {
    if (!hasAnalysisMatchShape(analysis)) return null;

    const homeRecentAnalysis = buildRecentTeamAnalysis(match.home_team_id, homeRecent);
    const awayRecentAnalysis = buildRecentTeamAnalysis(match.away_team_id, awayRecent);

    const homeGoals = shouldUseRecentGoals(analysis.goals.home, homeRecentAnalysis.goals) ? homeRecentAnalysis.goals : analysis.goals.home;
    const awayGoals = shouldUseRecentGoals(analysis.goals.away, awayRecentAnalysis.goals) ? awayRecentAnalysis.goals : analysis.goals.away;
    const homeCorners = shouldUseRecentCorners(analysis.corners.home, homeRecentAnalysis.corners) ? homeRecentAnalysis.corners : analysis.corners.home;
    const awayCorners = shouldUseRecentCorners(analysis.corners.away, awayRecentAnalysis.corners) ? awayRecentAnalysis.corners : analysis.corners.away;
    const homeCards = shouldUseRecentCards(analysis.cards.home, homeRecentAnalysis.cards) ? homeRecentAnalysis.cards : analysis.cards.home;
    const awayCards = shouldUseRecentCards(analysis.cards.away, awayRecentAnalysis.cards) ? awayRecentAnalysis.cards : analysis.cards.away;
    const homeShots = shouldUseRecentShots(analysis.shots.home, homeRecentAnalysis.shots) ? homeRecentAnalysis.shots : analysis.shots.home;
    const awayShots = shouldUseRecentShots(analysis.shots.away, awayRecentAnalysis.shots) ? awayRecentAnalysis.shots : analysis.shots.away;
    const homeForm = homeRecentAnalysis.formCount > (analysis.form.home_n ?? 0) && homeRecentAnalysis.form.length > analysis.form.home.length
        ? homeRecentAnalysis.form
        : analysis.form.home;
    const awayForm = awayRecentAnalysis.formCount > (analysis.form.away_n ?? 0) && awayRecentAnalysis.form.length > analysis.form.away.length
        ? awayRecentAnalysis.form
        : analysis.form.away;
    const homeFormCount = homeForm === homeRecentAnalysis.form ? homeRecentAnalysis.formCount : analysis.form.home_n;
    const awayFormCount = awayForm === awayRecentAnalysis.form ? awayRecentAnalysis.formCount : analysis.form.away_n;
    const goals = homeGoals !== analysis.goals.home || awayGoals !== analysis.goals.away
        ? rebuildGoalsSection(analysis.goals, homeGoals, awayGoals)
        : analysis.goals;
    const goalsSource = (homeGoals.xg_n ?? 0) > 0 && (awayGoals.xg_n ?? 0) > 0 ? "xg" : "scoreline";

    return {
        ...analysis,
        goals,
        corners: homeCorners !== analysis.corners.home || awayCorners !== analysis.corners.away
            ? rebuildCornersSection(analysis.corners, homeCorners, awayCorners)
            : analysis.corners,
        cards: homeCards !== analysis.cards.home || awayCards !== analysis.cards.away
            ? rebuildCardsSection(analysis.cards, homeCards, awayCards)
            : analysis.cards,
        shots: {
            home: homeShots,
            away: awayShots,
        },
        form: {
            home: homeForm,
            away: awayForm,
            home_n: homeFormCount,
            away_n: awayFormCount,
        },
        data_quality: {
            ...analysis.data_quality,
            goals_source: goalsSource,
            home_history_n: homeGoals.n,
            away_history_n: awayGoals.n,
            home_xg_n: homeGoals.xg_n ?? 0,
            away_xg_n: awayGoals.xg_n ?? 0,
        },
    };
}
