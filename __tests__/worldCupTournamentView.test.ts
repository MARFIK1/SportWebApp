import { computeStandings } from "@/app/util/data/dataService";
import { buildGroupStageEventIds } from "@/app/util/tournament/tournamentGroups";
import {
    isUpcomingTournamentMatch,
    normalizeWorldCupTournamentMatches,
} from "@/app/util/tournament/worldCupTournamentView";
import type { PredictionMatch } from "@/types/predictions";
import type { SofascoreMatch } from "@/types/sofascore";

function match(overrides: Partial<SofascoreMatch>): SofascoreMatch {
    return {
        event_id: 1,
        date: "2026-06-19",
        round: 1,
        home_team_id: 1,
        home_team: "Home",
        away_team_id: 2,
        away_team: "Away",
        home_score: null,
        away_score: null,
        home_score_ht: null,
        away_score_ht: null,
        status: "upcoming",
        season: "2026",
        ...overrides,
    } as SofascoreMatch;
}

function report(overrides: Partial<PredictionMatch>): PredictionMatch {
    return {
        id: "match",
        event_id: 1,
        league: "world_cup",
        comp_type: "international",
        home_team: "Home",
        away_team: "Away",
        start_time: "20:00",
        status: "finished",
        actual_result: "HOME",
        actual_score: "1-0",
        actual_cards: null,
        actual_corners: null,
        referee_name: null,
        predictions: {},
        ...overrides,
    } as PredictionMatch;
}

describe("World Cup tournament view normalization", () => {
    it("keeps a same-day knockout fixture out of the group stage", () => {
        const matches = [
            match({ event_id: 20, date: "2026-06-28", round: 3, home_team: "Group C", away_team: "Group D" }),
            match({ event_id: 5, date: "2026-06-28", round: 6, home_team: "2A", away_team: "2B" }),
            match({ event_id: 10, date: "2026-06-27", round: 3, home_team: "Group A", away_team: "Group B" }),
        ];

        const eventIds = buildGroupStageEventIds(matches, { groupStageMatchCount: 2 });

        expect(Array.from(eventIds).sort((a, b) => a - b)).toEqual([10, 20]);
        expect(eventIds.has(5)).toBe(false);
    });

    it("uses a finished prediction report to complete stale group standings", () => {
        const sources = [
            match({
                event_id: 15186878,
                home_team_id: 4724,
                home_team: "USA",
                away_team_id: 4741,
                away_team: "Australia",
            }),
        ];
        const reports = [
            report({
                event_id: 15186878,
                home_team: "USA",
                away_team: "Australia",
                actual_score: "2-0",
            }),
        ];

        const [normalized] = normalizeWorldCupTournamentMatches(sources, reports);
        const standings = computeStandings([normalized]);

        expect(normalized).toMatchObject({ status: "finished", home_score: 2, away_score: 0 });
        expect(standings.map((row) => [row.teamName, row.played, row.points])).toEqual([
            ["USA", 1, 3],
            ["Australia", 1, 0],
        ]);
    });

    it("resolves semifinal winners and losers in the final fixtures", () => {
        const sources = [
            match({ event_id: 1, date: "2026-06-10", home_team_id: 10, home_team: "France", away_team_id: 11, away_team: "Spain" }),
            match({ event_id: 2, date: "2026-06-11", home_team_id: 12, home_team: "England", away_team_id: 13, away_team: "Argentina" }),
            match({ event_id: 101, date: "2026-07-14", round: 28, home_team_id: 901, home_team: "W97", away_team_id: 902, away_team: "W98", status: "finished", home_score: 0, away_score: 2 }),
            match({ event_id: 102, date: "2026-07-15", round: 28, home_team_id: 903, home_team: "W99", away_team_id: 904, away_team: "W100", status: "finished", home_score: 1, away_score: 2 }),
            match({ event_id: 103, date: "2026-07-18", round: 50, home_team_id: 905, home_team: "L101", away_team_id: 906, away_team: "L102" }),
            match({ event_id: 104, date: "2026-07-19", round: 29, home_team_id: 907, home_team: "W101", away_team_id: 908, away_team: "W102" }),
        ];
        const reports = [
            report({ event_id: 101, home_team: "France", away_team: "Spain", actual_result: "AWAY", actual_score: "0-2" }),
            report({ event_id: 102, home_team: "England", away_team: "Argentina", actual_result: "AWAY", actual_score: "1-2" }),
        ];

        const normalized = normalizeWorldCupTournamentMatches(sources, reports);
        const thirdPlace = normalized.find((item) => item.event_id === 103);
        const final = normalized.find((item) => item.event_id === 104);

        expect(thirdPlace).toMatchObject({
            home_team: "France",
            home_team_id: 10,
            away_team: "England",
            away_team_id: 12,
        });
        expect(final).toMatchObject({
            home_team: "Spain",
            home_team_id: 11,
            away_team: "Argentina",
            away_team_id: 13,
        });
    });

    it("does not classify an unresolved past fixture as upcoming", () => {
        const stale = match({ date: "2026-06-19", status: "upcoming" });
        const future = match({ date: "2026-07-18", status: "upcoming" });

        expect(isUpcomingTournamentMatch(stale, "2026-07-16")).toBe(false);
        expect(isUpcomingTournamentMatch(future, "2026-07-16")).toBe(true);
    });
});
