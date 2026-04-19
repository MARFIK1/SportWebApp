import { computeStandings } from "@/app/util/data/dataService";
import type { SofascoreMatch } from "@/types/sofascore";

function makeMatch(overrides: Partial<SofascoreMatch>): SofascoreMatch {
    return {
        event_id: 1,
        home_team: "Home",
        away_team: "Away",
        home_team_id: 1,
        away_team_id: 2,
        home_score: 0,
        away_score: 0,
        status: "finished",
        date: "2025-01-01",
        season: "2024-25",
        ...overrides,
    } as SofascoreMatch;
}

describe("computeStandings", () => {
    it("returns empty array when no matches", () => {
        expect(computeStandings([])).toEqual([]);
    });

    it("ignores unfinished matches", () => {
        const matches = [
            makeMatch({ event_id: 1, home_team_id: 1, away_team_id: 2, home_score: null as unknown as number, away_score: null as unknown as number, status: "notstarted" }),
        ];
        expect(computeStandings(matches)).toEqual([]);
    });

    it("awards 3 points for a win, 0 for a loss", () => {
        const matches = [
            makeMatch({ event_id: 1, home_team: "A", away_team: "B", home_team_id: 1, away_team_id: 2, home_score: 2, away_score: 0 }),
        ];
        const standings = computeStandings(matches);
        expect(standings).toHaveLength(2);
        expect(standings[0]).toMatchObject({ position: 1, teamName: "A", won: 1, lost: 0, points: 3, goalsFor: 2, goalsAgainst: 0, goalDifference: 2 });
        expect(standings[1]).toMatchObject({ position: 2, teamName: "B", won: 0, lost: 1, points: 0, goalsFor: 0, goalsAgainst: 2, goalDifference: -2 });
    });

    it("awards 1 point to each team on a draw", () => {
        const matches = [
            makeMatch({ home_team: "A", away_team: "B", home_team_id: 1, away_team_id: 2, home_score: 1, away_score: 1 }),
        ];
        const standings = computeStandings(matches);
        expect(standings[0].points).toBe(1);
        expect(standings[1].points).toBe(1);
        expect(standings[0].drawn).toBe(1);
        expect(standings[1].drawn).toBe(1);
    });

    it("sorts by points descending, then goal difference, then goals for", () => {
        const matches = [
            // A: 3 pts, GD +2 (2-0 vs C)
            makeMatch({ event_id: 1, home_team: "A", away_team: "C", home_team_id: 1, away_team_id: 3, home_score: 2, away_score: 0 }),
            // B: 3 pts, GD +5 (5-0 vs D) - better GD, should rank higher than A
            makeMatch({ event_id: 2, home_team: "B", away_team: "D", home_team_id: 2, away_team_id: 4, home_score: 5, away_score: 0 }),
        ];
        const standings = computeStandings(matches);
        expect(standings[0].teamName).toBe("B");
        expect(standings[1].teamName).toBe("A");
    });

    it("tracks form, keeping only the last 5 results", () => {
        const matches: SofascoreMatch[] = [];
        for (let i = 0; i < 7; i++) {
            matches.push(makeMatch({
                event_id: i,
                home_team: "A",
                away_team: `Opp${i}`,
                home_team_id: 1,
                away_team_id: 100 + i,
                home_score: 1,
                away_score: 0,
            }));
        }
        const standings = computeStandings(matches);
        const teamA = standings.find((s) => s.teamName === "A")!;
        expect(teamA.form).toHaveLength(5);
        expect(teamA.form).toEqual(["W", "W", "W", "W", "W"]);
    });

    it("aggregates stats across multiple matches for same team", () => {
        const matches = [
            // A beats B 3-1
            makeMatch({ event_id: 1, home_team: "A", away_team: "B", home_team_id: 1, away_team_id: 2, home_score: 3, away_score: 1 }),
            // A loses to C 0-2
            makeMatch({ event_id: 2, home_team: "A", away_team: "C", home_team_id: 1, away_team_id: 3, home_score: 0, away_score: 2 }),
            // A draws with D 1-1
            makeMatch({ event_id: 3, home_team: "D", away_team: "A", home_team_id: 4, away_team_id: 1, home_score: 1, away_score: 1 }),
        ];
        const standings = computeStandings(matches);
        const teamA = standings.find((s) => s.teamName === "A")!;
        expect(teamA.played).toBe(3);
        expect(teamA.won).toBe(1);
        expect(teamA.drawn).toBe(1);
        expect(teamA.lost).toBe(1);
        expect(teamA.goalsFor).toBe(4);
        expect(teamA.goalsAgainst).toBe(4);
        expect(teamA.points).toBe(4);
        expect(teamA.form).toEqual(["W", "L", "D"]);
    });

    it("orders form chronologically regardless of input order", () => {
        // Input in reverse chronological order - form should still reflect real chronology
        const matches = [
            makeMatch({ event_id: 3, date: "2025-03-01", home_team: "A", away_team: "X", home_team_id: 1, away_team_id: 9, home_score: 0, away_score: 1 }), // L
            makeMatch({ event_id: 2, date: "2025-02-01", home_team: "A", away_team: "Y", home_team_id: 1, away_team_id: 10, home_score: 1, away_score: 1 }), // D
            makeMatch({ event_id: 1, date: "2025-01-01", home_team: "A", away_team: "Z", home_team_id: 1, away_team_id: 11, home_score: 2, away_score: 0 }), // W
        ];
        const standings = computeStandings(matches);
        const teamA = standings.find((s) => s.teamName === "A")!;
        expect(teamA.form).toEqual(["W", "D", "L"]);
    });

    it("assigns sequential positions starting from 1", () => {
        const matches = [
            makeMatch({ event_id: 1, home_team: "A", away_team: "B", home_team_id: 1, away_team_id: 2, home_score: 1, away_score: 0 }),
            makeMatch({ event_id: 2, home_team: "C", away_team: "D", home_team_id: 3, away_team_id: 4, home_score: 2, away_score: 1 }),
        ];
        const standings = computeStandings(matches);
        expect(standings.map((s) => s.position)).toEqual([1, 2, 3, 4]);
    });
});
