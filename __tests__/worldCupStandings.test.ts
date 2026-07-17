import { WORLD_CUP_32_FORMAT, WORLD_CUP_48_FORMAT } from "@/app/match/[id]/bracketConfig";
import { resolveSeasonSelection } from "@/app/util/league/seasonResolver";
import { detectTournamentGroups, partitionTournamentMatches } from "@/app/util/tournament/tournamentGroups";
import type { SofascoreMatch } from "@/types/sofascore";

function match(overrides: Partial<SofascoreMatch>): SofascoreMatch {
    return {
        event_id: 1,
        date: "2022-11-20",
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
        season: "World Cup 2022",
        ...overrides,
    } as SofascoreMatch;
}

function dateFor(year: number, index: number): string {
    return new Date(Date.UTC(year, 5, 1 + Math.floor(index / 4))).toISOString().slice(0, 10);
}

function groupStage(year: number, season: string, groupCount: number): SofascoreMatch[] {
    const matches: SofascoreMatch[] = [];
    let eventId = year * 1000;

    for (let group = 0; group < groupCount; group += 1) {
        const teamIds = Array.from({ length: 4 }, (_, index) => group * 10 + index + 1);
        for (let home = 0; home < teamIds.length; home += 1) {
            for (let away = home + 1; away < teamIds.length; away += 1) {
                matches.push(match({
                    event_id: eventId,
                    date: dateFor(year, matches.length),
                    round: (matches.length % 3) + 1,
                    season,
                    home_team_id: teamIds[home],
                    home_team: `Team ${teamIds[home]}`,
                    away_team_id: teamIds[away],
                    away_team: `Team ${teamIds[away]}`,
                }));
                eventId += 1;
            }
        }
    }

    return matches;
}

function knockoutStage(
    year: number,
    season: string,
    startIndex: number,
    rounds: number[],
): SofascoreMatch[] {
    return rounds.map((round, index) => match({
        event_id: year * 1000 + startIndex + index,
        date: dateFor(year, startIndex + index),
        round,
        season,
        home_team_id: (index % 16) * 10 + 1,
        home_team: `Knockout home ${index}`,
        away_team_id: ((index + 1) % 16) * 10 + 1,
        away_team: `Knockout away ${index}`,
    }));
}

describe("World Cup league standings contracts", () => {
    it("selects 2026 by default even when its source season is blank", () => {
        const matches = [
            match({ event_id: 2018, date: "2018-06-14", season: "World Cup 2018" }),
            match({ event_id: 2022, date: "2022-11-20", season: "World Cup 2022" }),
            match({ event_id: 2026, date: "2026-06-11", season: "", status: "finished" }),
            match({ event_id: 2026, date: "2026-06-11", season: "2026", status: "upcoming" }),
        ];

        const selection = resolveSeasonSelection(matches);

        expect(selection.seasons).toEqual(["World Cup 2018", "World Cup 2022", "2026"]);
        expect(selection.selectedSeason).toBe("2026");
        expect(selection.matches).toHaveLength(1);
        expect(selection.matches[0].status).toBe("finished");
    });

    it("matches a year-only query to a descriptive historical season", () => {
        const matches = [
            match({ event_id: 2018, date: "2018-06-14", season: "World Cup 2018" }),
            match({ event_id: 2022, date: "2022-11-20", season: "World Cup 2022" }),
            match({ event_id: 2026, date: "2026-06-11", season: "" }),
        ];

        const selection = resolveSeasonSelection(matches, "2022");

        expect(selection.selectedSeason).toBe("World Cup 2022");
        expect(selection.matches.map((item) => item.event_id)).toEqual([2022]);
    });

    it.each([
        {
            year: 2018,
            season: "World Cup 2018",
            rounds: [4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 50, 1],
        },
        {
            year: 2022,
            season: "World Cup 2022",
            rounds: [5, 5, 5, 5, 5, 5, 5, 5, 27, 27, 27, 27, 28, 28, 50, 29],
        },
    ])("keeps $year knockout matches out of the eight historical groups", ({ year, season, rounds }) => {
        const groupMatches = groupStage(year, season, 8);
        const matches = [...groupMatches, ...knockoutStage(year, season, groupMatches.length, rounds)];
        const partition = partitionTournamentMatches(matches, WORLD_CUP_32_FORMAT);
        const groups = detectTournamentGroups(partition.matches, partition.groupStageEventIds);

        expect(partition.groupMatches).toHaveLength(48);
        expect(partition.playoffMatches).toHaveLength(16);
        expect(groups).toHaveLength(8);
        expect(groups.every((group) => group.teamIds.length === 4 && group.matches.length === 6)).toBe(true);
    });

    it("builds twelve groups and a 32-match knockout stage for 2026", () => {
        const groupMatches = groupStage(2026, "", 12);
        const rounds = [
            ...Array(16).fill(6),
            ...Array(8).fill(5),
            ...Array(4).fill(27),
            ...Array(2).fill(28),
            50,
            29,
        ];
        const matches = [...groupMatches, ...knockoutStage(2026, "", groupMatches.length, rounds)];
        const partition = partitionTournamentMatches(matches, WORLD_CUP_48_FORMAT);
        const groups = detectTournamentGroups(partition.matches, partition.groupStageEventIds);

        expect(partition.groupMatches).toHaveLength(72);
        expect(partition.playoffMatches).toHaveLength(32);
        expect(groups).toHaveLength(12);
        expect(groups.every((group) => group.teamIds.length === 4 && group.matches.length === 6)).toBe(true);
    });
});
