import { resolveCompetitionTableSections } from "@/app/util/league/competitionTableView";
import type { SofascoreMatch } from "@/types/sofascore";

function match(overrides: Partial<SofascoreMatch>): SofascoreMatch {
    return {
        event_id: 1,
        date: "2026-07-18",
        round: 1,
        home_team_id: 1,
        home_team: "Home",
        away_team_id: 2,
        away_team: "Away",
        home_score: 1,
        away_score: 0,
        home_score_ht: 0,
        away_score_ht: 0,
        status: "finished",
        season: "2026/27",
        ...overrides,
    } as SofascoreMatch;
}

const incompleteSeason = [
    match({ event_id: 1, home_team_id: 1, away_team_id: 2 }),
    match({ event_id: 2, home_team_id: 2, away_team_id: 3 }),
    match({ event_id: 3, home_team_id: 3, away_team_id: 1 }),
    match({ event_id: 4, home_team_id: 4, away_team_id: 5 }),
    match({ event_id: 5, home_team_id: 5, away_team_id: 6 }),
    match({ event_id: 6, home_team_id: 6, away_team_id: 4 }),
];

describe("competition table presentation", () => {
    it("keeps an incomplete round-robin league in one table", () => {
        const sections = resolveCompetitionTableSections(incompleteSeason, "league");

        expect(sections.groups).toBeNull();
        expect(sections.playoffMatches).toEqual([]);
    });

    it("still detects disconnected groups for tournament competitions", () => {
        const sections = resolveCompetitionTableSections(incompleteSeason, "international");

        expect(sections.groups).toHaveLength(2);
    });
});