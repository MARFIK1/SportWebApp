import { deduplicateMatchesByEventId } from "@/app/util/data/matchDeduplication";
import {
    isInactiveMatchStatus,
    matchStatusPriority,
    normalizeMatchStatus,
} from "@/app/util/data/matchStatus";
import type { SofascoreMatch } from "@/types/sofascore";

function match(overrides: Partial<SofascoreMatch> = {}): SofascoreMatch {
    return {
        event_id: 42,
        date: "2026-08-29T18:00:00+00:00",
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
        season: "2026/2027",
        ...overrides,
    } as SofascoreMatch;
}

describe("canonical match status", () => {
    it("normalizes legacy strings and nested Sofascore status objects", () => {
        expect(normalizeMatchStatus("cancelled")).toBe("canceled");
        expect(normalizeMatchStatus("notstarted")).toBe("upcoming");
        expect(normalizeMatchStatus({ type: "scheduled" })).toBe("upcoming");
        expect(normalizeMatchStatus({ type: "postponed" })).toBe("postponed");
        expect(normalizeMatchStatus("unexpected")).toBe("unknown");
        expect(isInactiveMatchStatus("cancelled")).toBe(true);
    });

    it("gives inactive updates precedence over stale final snapshots", () => {
        expect(matchStatusPriority("postponed")).toBeGreaterThan(matchStatusPriority("finished"));

        const [selected] = deduplicateMatchesByEventId([
            match({
                status: "finished",
                home_score: 2,
                away_score: 1,
                home_score_ht: 1,
                away_score_ht: 0,
                home_score_et: 1,
                away_score_et: 0,
                home_score_pen: 4,
                away_score_pen: 3,
            }),
            match({ status: "postponed" }),
        ]);

        expect(selected).toMatchObject({
            status: "postponed",
            home_score: null,
            away_score: null,
            home_score_ht: null,
            away_score_ht: null,
            home_score_et: null,
            away_score_et: null,
            home_score_pen: null,
            away_score_pen: null,
        });
    });
});
