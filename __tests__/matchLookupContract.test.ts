jest.mock("fs");
import fs from "fs";
import { buildMatchLookupMaps } from "@/app/util/data/dataService";
import type { Competition } from "@/app/util/league/leagueRegistry";
import type { SofascoreMatch, SofascoreUpcomingMatch } from "@/types/sofascore";

const mockedFs = fs as jest.Mocked<typeof fs>;

const competition: Competition = {
    slug: "test-league",
    name: "Test League",
    country: "test",
    compType: "league",
    tournamentId: 1,
    dataPath: "league/test/league",
    priority: 1,
};

function finishedMatch(overrides: Partial<SofascoreMatch> = {}): SofascoreMatch {
    return {
        event_id: 100,
        date: "2026-05-01T18:00:00+00:00",
        round: 1,
        home_team_id: 1,
        home_team: "Old Home",
        away_team_id: 2,
        away_team: "Old Away",
        home_score: 1,
        away_score: 0,
        home_score_ht: null,
        away_score_ht: null,
        status: "finished",
        season: "2025/2026",
        ...overrides,
    } as SofascoreMatch;
}

function upcomingMatch(overrides: Partial<SofascoreUpcomingMatch> = {}): SofascoreUpcomingMatch {
    return {
        event_id: 999,
        status: "notstarted",
        date: "2026-05-07T20:00:00+00:00",
        time: "20:00",
        round: 2,
        home_team_id: 11,
        home_team: "Future Home",
        away_team_id: 22,
        away_team: "Future Away",
        home_score: null,
        away_score: null,
        home_score_ht: null,
        away_score_ht: null,
        odds_home_win: 2.1,
        odds_draw: 3.2,
        odds_away_win: 3.6,
        ...overrides,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readdirSync.mockImplementation(() => ["future.json"] as unknown as ReturnType<typeof fs.readdirSync>);
    mockedFs.readFileSync.mockImplementation((filePath: unknown) => {
        const pathText = String(filePath);
        if (pathText.endsWith("all_seasons.json")) {
            return JSON.stringify({ matches: [finishedMatch()] });
        }
        if (pathText.endsWith("future.json")) {
            return JSON.stringify({ matches: [upcomingMatch()] });
        }
        throw new Error(`Unexpected read: ${pathText}`);
    });
});

describe("match lookup data contract", () => {
    it("includes upcoming fixtures so fresh future matches can link to their event page", () => {
        const maps = buildMatchLookupMaps([competition]);

        expect(maps.eventIds["Future Home_vs_Future Away_2026-05-07"]).toBe(999);
        expect(maps.teamIds["Future Home"]).toBe(11);
        expect(maps.teamIds["Future Away"]).toBe(22);
    });
});
