import { computeStandings } from "@/app/util/data/dataService";
import { resolveSeasonSelection } from "@/app/util/league/seasonResolver";
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
        home_score_ht: null,
        away_score_ht: null,
        status: "finished",
        season: "Ekstraklasa 26/27",
        ...overrides,
    } as SofascoreMatch;
}

describe("league season rollover", () => {
    const previousSeason = Array.from({ length: 30 }, (_, index) => match({
        event_id: 1000 + index,
        date: `2026-05-${String((index % 28) + 1).padStart(2, "0")}`,
        season: "Ekstraklasa 25/26",
    }));
    const currentSeason = [
        match({ event_id: 2001, date: "2026-07-18", season: "Ekstraklasa 26/27" }),
        match({ event_id: 2002, date: "2026-07-25", season: "Ekstraklasa 26/27", home_score: 2, away_score: 2 }),
    ];
    const allMatches = [...previousSeason, ...currentSeason];

    it("selects only the newest season by default", () => {
        const selection = resolveSeasonSelection(allMatches);
        const standings = computeStandings(selection.matches);

        expect(selection.seasons).toEqual(["Ekstraklasa 25/26", "Ekstraklasa 26/27"]);
        expect(selection.selectedSeason).toBe("Ekstraklasa 26/27");
        expect(selection.matches.map((item) => item.event_id)).toEqual([2001, 2002]);
        expect(standings.every((row) => row.played === 2)).toBe(true);
    });

    it.each(["26/27", "2026/27", "2026/2027", "Ekstraklasa 26/27"])(
        "matches the %s query to the current season",
        (requestedSeason) => {
            const selection = resolveSeasonSelection(allMatches, requestedSeason);

            expect(selection.selectedSeason).toBe("Ekstraklasa 26/27");
            expect(selection.matches.map((item) => item.event_id)).toEqual([2001, 2002]);
        },
    );

    it.each([
        ["Premier League 2025/26", "Premier League 2026/27"],
        ["MLS 2025", "MLS 2026"],
    ])("selects the newest season for %s and %s labels", (previousLabel, currentLabel) => {
        const selection = resolveSeasonSelection([
            match({ event_id: 3001, season: previousLabel }),
            match({ event_id: 3002, season: currentLabel }),
        ]);

        expect(selection.selectedSeason).toBe(currentLabel);
        expect(selection.matches.map((item) => item.event_id)).toEqual([3002]);
    });
});