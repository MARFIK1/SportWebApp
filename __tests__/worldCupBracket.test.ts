import {
    buildWorldCupKnockoutRounds,
    computeWorldCupBracketSlots,
    detectWorldCupFormat,
    WORLD_CUP_32_FORMAT,
    WORLD_CUP_48_FORMAT,
    type WorldCupStage,
} from "@/app/match/[id]/bracketConfig";
import {
    buildWorldCupSlotCandidatePairs,
    candidatePairForLoserPlaceholder,
    candidatePairForWinnerPlaceholder,
    formatWorldCupSlotCandidatePair,
    resolveWorldCupPredictionMatches,
} from "@/app/util/predictions/worldCupSlotResolver";
import type { PredictionMatch } from "@/types/predictions";
import type { SofascoreMatch } from "@/types/sofascore";

function match(overrides: Partial<SofascoreMatch>): SofascoreMatch {
    return {
        event_id: 1,
        date: "2022-12-03",
        round: 5,
        home_team_id: 1,
        home_team: "Home",
        away_team_id: 2,
        away_team: "Away",
        home_score: 1,
        away_score: 0,
        home_score_ht: null,
        away_score_ht: null,
        status: "finished",
        season: "2022",
        ...overrides,
    } as SofascoreMatch;
}

function roundsByStage(matches: SofascoreMatch[]) {
    const format = detectWorldCupFormat(matches[matches.length - 1], matches);
    return new Map<WorldCupStage, SofascoreMatch[]>(
        buildWorldCupKnockoutRounds(matches, format).map((round) => [round.stage, round.matches]),
    );
}

function worldCup2022Knockout(): SofascoreMatch[] {
    return [
        match({ event_id: 10230638, date: "2022-12-03", home_team_id: 101, home_team: "Netherlands", away_team_id: 102, away_team: "USA", home_score: 3, away_score: 1 }),
        match({ event_id: 10230641, date: "2022-12-03", home_team_id: 103, home_team: "Argentina", away_team_id: 104, away_team: "Australia", home_score: 2, away_score: 1 }),
        match({ event_id: 10230579, date: "2022-12-04", home_team_id: 105, home_team: "France", away_team_id: 106, away_team: "Poland", home_score: 3, away_score: 1 }),
        match({ event_id: 10230632, date: "2022-12-04", home_team_id: 107, home_team: "England", away_team_id: 108, away_team: "Senegal", home_score: 3, away_score: 0 }),
        match({ event_id: 10230582, date: "2022-12-05", home_team_id: 109, home_team: "Japan", away_team_id: 110, away_team: "Croatia", home_score: 1, away_score: 1, home_score_pen: 1, away_score_pen: 3 }),
        match({ event_id: 10230633, date: "2022-12-05", home_team_id: 111, home_team: "Brazil", away_team_id: 112, away_team: "South Korea", home_score: 4, away_score: 1 }),
        match({ event_id: 10230631, date: "2022-12-06", home_team_id: 113, home_team: "Portugal", away_team_id: 114, away_team: "Switzerland", home_score: 6, away_score: 1 }),
        match({ event_id: 10230636, date: "2022-12-06", home_team_id: 115, home_team: "Morocco", away_team_id: 116, away_team: "Spain", home_score: 3, away_score: 0, home_score_pen: 3, away_score_pen: 0 }),
        match({ event_id: 10230639, date: "2022-12-09", round: 27, home_team_id: 101, home_team: "Netherlands", away_team_id: 103, away_team: "Argentina", home_score: 2, away_score: 2, home_score_pen: 3, away_score_pen: 4 }),
        match({ event_id: 10230640, date: "2022-12-09", round: 27, home_team_id: 110, home_team: "Croatia", away_team_id: 111, away_team: "Brazil", home_score: 1, away_score: 1, home_score_pen: 4, away_score_pen: 2 }),
        match({ event_id: 10230581, date: "2022-12-10", round: 27, home_team_id: 115, home_team: "Morocco", away_team_id: 113, away_team: "Portugal", home_score: 1, away_score: 0 }),
        match({ event_id: 10230634, date: "2022-12-10", round: 27, home_team_id: 107, home_team: "England", away_team_id: 105, away_team: "France", home_score: 1, away_score: 2 }),
        match({ event_id: 10230580, date: "2022-12-13", round: 28, home_team_id: 103, home_team: "Argentina", away_team_id: 110, away_team: "Croatia", home_score: 3, away_score: 0 }),
        match({ event_id: 10230578, date: "2022-12-14", round: 28, home_team_id: 105, home_team: "France", away_team_id: 115, away_team: "Morocco", home_score: 2, away_score: 0 }),
        match({ event_id: 10230637, date: "2022-12-17", round: 50, home_team_id: 110, home_team: "Croatia", away_team_id: 115, away_team: "Morocco", home_score: 2, away_score: 1 }),
        match({ event_id: 10230635, date: "2022-12-18", round: 29, home_team_id: 103, home_team: "Argentina", away_team_id: 105, away_team: "France", home_score: 3, away_score: 3, home_score_pen: 4, away_score_pen: 2 }),
    ];
}

function worldCup2018Knockout(): SofascoreMatch[] {
    return [
        match({ event_id: 7665828, date: "2018-06-30", round: 4, season: "2018", home_team_id: 201, home_team: "France", away_team_id: 202, away_team: "Argentina", home_score: 4, away_score: 3 }),
        match({ event_id: 7665827, date: "2018-06-30", round: 4, season: "2018", home_team_id: 203, home_team: "Uruguay", away_team_id: 204, away_team: "Portugal", home_score: 2, away_score: 1 }),
        match({ event_id: 7665825, date: "2018-07-02", round: 4, season: "2018", home_team_id: 205, home_team: "Brazil", away_team_id: 206, away_team: "Mexico", home_score: 2, away_score: 0 }),
        match({ event_id: 7665826, date: "2018-07-02", round: 4, season: "2018", home_team_id: 207, home_team: "Belgium", away_team_id: 208, away_team: "Japan", home_score: 3, away_score: 2 }),
        match({ event_id: 7665831, date: "2018-07-03", round: 4, season: "2018", home_team_id: 209, home_team: "Sweden", away_team_id: 210, away_team: "Switzerland", home_score: 1, away_score: 0 }),
        match({ event_id: 7665830, date: "2018-07-03", round: 4, season: "2018", home_team_id: 211, home_team: "Colombia", away_team_id: 212, away_team: "England", home_score: 1, away_score: 1, home_score_pen: 3, away_score_pen: 4 }),
        match({ event_id: 7665829, date: "2018-07-01", round: 4, season: "2018", home_team_id: 213, home_team: "Croatia", away_team_id: 214, away_team: "Denmark", home_score: 1, away_score: 1, home_score_pen: 3, away_score_pen: 2 }),
        match({ event_id: 7665832, date: "2018-07-01", round: 4, season: "2018", home_team_id: 215, home_team: "Spain", away_team_id: 216, away_team: "Russia", home_score: 1, away_score: 1, home_score_pen: 3, away_score_pen: 4 }),
        match({ event_id: 7693129, date: "2018-07-06", round: 3, season: "2018", home_team_id: 203, home_team: "Uruguay", away_team_id: 201, away_team: "France", home_score: 0, away_score: 2 }),
        match({ event_id: 7693128, date: "2018-07-06", round: 3, season: "2018", home_team_id: 205, home_team: "Brazil", away_team_id: 207, away_team: "Belgium", home_score: 1, away_score: 2 }),
        match({ event_id: 7693130, date: "2018-07-07", round: 3, season: "2018", home_team_id: 209, home_team: "Sweden", away_team_id: 212, away_team: "England", home_score: 0, away_score: 2 }),
        match({ event_id: 7693127, date: "2018-07-07", round: 3, season: "2018", home_team_id: 216, home_team: "Russia", away_team_id: 213, away_team: "Croatia", home_score: 2, away_score: 2, home_score_pen: 3, away_score_pen: 4 }),
        match({ event_id: 7693134, date: "2018-07-10", round: 2, season: "2018", home_team_id: 201, home_team: "France", away_team_id: 207, away_team: "Belgium", home_score: 1, away_score: 0 }),
        match({ event_id: 7693132, date: "2018-07-11", round: 2, season: "2018", home_team_id: 212, home_team: "England", away_team_id: 213, away_team: "Croatia", home_score: 1, away_score: 2 }),
        match({ event_id: 7693133, date: "2018-07-14", round: 50, season: "2018", home_team_id: 207, home_team: "Belgium", away_team_id: 212, away_team: "England", home_score: 2, away_score: 0 }),
        match({ event_id: 7693131, date: "2018-07-15", round: 1, season: "2018", home_team_id: 201, home_team: "France", away_team_id: 213, away_team: "Croatia", home_score: 4, away_score: 2 }),
    ];
}

describe("World Cup bracket contracts", () => {
    it("maps 2026 scheduled knockout matches through the 48-team bracket config", () => {
        const matches = [
            match({ event_id: 12813001, date: "2026-07-01", round: 6, season: "2026", home_team: "1A", away_team: "1L", home_score: null, away_score: null, status: "notstarted" }),
            match({ event_id: 12813002, date: "2026-07-01", round: 6, season: "2026", home_team: "2A", away_team: "2B", home_score: null, away_score: null, status: "notstarted" }),
            match({ event_id: 12813003, date: "2026-07-02", round: 6, season: "2026", home_team: "1F", away_team: "2C", home_score: null, away_score: null, status: "notstarted" }),
            match({ event_id: 12813004, date: "2026-07-03", round: 5, season: "2026", home_team: "W79", away_team: "W80", home_score: null, away_score: null, status: "notstarted" }),
            match({ event_id: 12813005, date: "2026-07-04", round: 27, season: "2026", home_team: "W91", away_team: "W92", home_score: null, away_score: null, status: "notstarted" }),
            match({ event_id: 12813006, date: "2026-07-08", round: 28, season: "2026", home_team: "W99", away_team: "W100", home_score: null, away_score: null, status: "notstarted" }),
            match({ event_id: 12813007, date: "2026-07-11", round: 29, season: "2026", home_team: "W101", away_team: "W102", home_score: null, away_score: null, status: "notstarted" }),
            match({ event_id: 12813008, date: "2026-07-10", round: 50, season: "2026", home_team: "L101", away_team: "L102", home_score: null, away_score: null, status: "notstarted" }),
        ];
        const format = detectWorldCupFormat(matches[0], matches);
        const rounds = roundsByStage(matches);
        const slots = computeWorldCupBracketSlots(matches, format);

        expect(format.key).toBe(WORLD_CUP_48_FORMAT.key);
        expect(rounds.get("R32")).toHaveLength(3);
        expect(rounds.get("R16")).toHaveLength(1);
        expect(rounds.get("QF")).toHaveLength(1);
        expect(rounds.get("SF")).toHaveLength(1);
        expect(rounds.get("THIRD_PLACE")).toHaveLength(1);
        expect(rounds.get("FINAL")).toHaveLength(1);
        expect(slots.get(12813001)).toBe(79);
        expect(slots.get(12813002)).toBe(73);
        expect(slots.get(12813003)).toBe(75);
        expect(slots.get(12813004)).toBe(92);
        expect(slots.get(12813005)).toBe(99);
        expect(slots.get(12813006)).toBe(102);
        expect(slots.get(12813007)).toBe(WORLD_CUP_48_FORMAT.finalSlot);
        expect(slots.get(12813008)).toBe(WORLD_CUP_48_FORMAT.thirdPlaceSlot);
    });
    it("builds 2022 knockout slots from winners, penalties, and the third-place match", () => {
        const matches = worldCup2022Knockout();
        const format = detectWorldCupFormat(matches[matches.length - 1], matches);

        expect(format.key).toBe(WORLD_CUP_32_FORMAT.key);

        const rounds = roundsByStage(matches);
        expect(rounds.get("R16")).toHaveLength(8);
        expect(rounds.get("QF")).toHaveLength(4);
        expect(rounds.get("SF")).toHaveLength(2);
        expect(rounds.get("THIRD_PLACE")?.[0]?.event_id).toBe(10230637);
        expect(rounds.get("FINAL")?.[0]?.event_id).toBe(10230635);

        const slots = computeWorldCupBracketSlots(matches, format);
        expect(slots.get(10230582)).toBe(3);
        expect(slots.get(10230636)).toBe(7);
        expect(slots.get(10230640)).toBe(10);
        expect(slots.get(10230580)).toBe(13);
        expect(slots.get(10230635)).toBe(15);
        expect(slots.get(10230637)).toBe(16);
    });

    it("keeps the 2018 round-one final in the final slot", () => {
        const matches = worldCup2018Knockout();
        const format = detectWorldCupFormat(matches[matches.length - 1], matches);
        const rounds = roundsByStage(matches);
        const slots = computeWorldCupBracketSlots(matches, format);

        expect(format.key).toBe(WORLD_CUP_32_FORMAT.key);
        expect(rounds.get("FINAL")?.[0]?.event_id).toBe(7693131);
        expect(rounds.get("R16")?.some((item) => item.event_id === 7693131)).toBe(false);
        expect(slots.get(7693131)).toBe(WORLD_CUP_32_FORMAT.finalSlot);
        expect(slots.get(7693133)).toBe(WORLD_CUP_32_FORMAT.thirdPlaceSlot);
    });

    it("collapses a resolved winner placeholder to the winning team", () => {
        const sourceMatch = match({
            event_id: 9001,
            date: "2026-07-05",
            season: "2026",
            home_team_id: 11,
            home_team: "Brazil",
            away_team_id: 12,
            away_team: "Norway",
            home_score: 1,
            away_score: 2,
            status: "finished",
        });
        const pairs = buildWorldCupSlotCandidatePairs([sourceMatch], new Map([[9001, 91]]));
        const pair = candidatePairForWinnerPlaceholder("W91", pairs);

        expect(pair?.winner?.teamName).toBe("Norway");
        expect(formatWorldCupSlotCandidatePair(pair!, " / ")).toBe("Norway");
    });

    it("resolves a loser placeholder for the third-place match", () => {
        const sourceMatch = match({
            event_id: 9010,
            date: "2026-07-14",
            season: "2026",
            home_team_id: 21,
            home_team: "France",
            away_team_id: 22,
            away_team: "Spain",
            home_score: 0,
            away_score: 2,
            status: "finished",
        });
        const pairs = buildWorldCupSlotCandidatePairs([sourceMatch], new Map([[9010, 101]]));
        const pair = candidatePairForLoserPlaceholder("L101", pairs);

        expect(pair?.winner?.teamName).toBe("Spain");
        expect(pair?.loser?.teamName).toBe("France");
    });

    it("resolves semifinal loser slots in the third-place prediction report", () => {
        const sourceMatches = [
            match({
                event_id: 12813008,
                date: "2026-07-14",
                round: 28,
                season: "2026",
                home_team_id: 901,
                home_team: "W97",
                away_team_id: 902,
                away_team: "W98",
                home_score: 0,
                away_score: 2,
                status: "finished",
            }),
            match({
                event_id: 12812996,
                date: "2026-07-15",
                round: 28,
                season: "2026",
                home_team_id: 903,
                home_team: "W99",
                away_team_id: 904,
                away_team: "W100",
                home_score: 1,
                away_score: 2,
                status: "finished",
            }),
            match({
                event_id: 12813003,
                date: "2026-07-18",
                round: 50,
                season: "2026",
                home_team_id: 905,
                home_team: "L101",
                away_team_id: 906,
                away_team: "L102",
                home_score: 4,
                away_score: 6,
                status: "finished",
            }),
        ];
        const reports = [
            {
                event_id: 12813008,
                home_team: "France",
                away_team: "Spain",
                status: "finished",
                actual_result: "AWAY",
                actual_score: "0-2",
            },
            {
                event_id: 12812996,
                home_team: "England",
                away_team: "Argentina",
                status: "finished",
                actual_result: "AWAY",
                actual_score: "1-2",
            },
            {
                event_id: 12813003,
                home_team: "L101",
                away_team: "L102",
                status: "finished",
                actual_result: "AWAY",
                actual_score: "4-6",
            },
        ] as PredictionMatch[];

        const resolved = resolveWorldCupPredictionMatches(reports, sourceMatches);
        const thirdPlace = resolved.find((item) => item.event_id === 12813003);

        expect(thirdPlace).toMatchObject({
            home_team: "France",
            away_team: "England",
        });
    });

    it("keeps unresolved winner placeholders as candidate pairs", () => {
        const sourceMatch = match({
            event_id: 9002,
            date: "2026-07-07",
            season: "2026",
            home_team_id: 13,
            home_team: "Colombia",
            away_team_id: 14,
            away_team: "Ghana",
            home_score: null,
            away_score: null,
            status: "notstarted",
        });
        const pairs = buildWorldCupSlotCandidatePairs([sourceMatch], new Map([[9002, 92]]));
        const pair = candidatePairForWinnerPlaceholder("W92", pairs);

        expect(pair?.winner).toBeUndefined();
        expect(formatWorldCupSlotCandidatePair(pair!, " / ")).toBe("Colombia / Ghana");
    });

    it("collapses a winner placeholder when the result is only available in the prediction report", () => {
        const sourceMatch = match({
            event_id: 9003,
            date: "2026-07-05",
            season: "2026",
            home_team_id: 15,
            home_team: "Brazil",
            away_team_id: 16,
            away_team: "Norway",
            home_score: null,
            away_score: null,
            status: "notstarted",
        });
        const reportMatch = {
            event_id: 9003,
            home_team: "Brazil",
            away_team: "Norway",
            status: "finished",
            actual_result: "AWAY",
            actual_score: "1-2",
        } as PredictionMatch;
        const pairs = buildWorldCupSlotCandidatePairs([sourceMatch], new Map([[9003, 93]]), [reportMatch]);
        const pair = candidatePairForWinnerPlaceholder("W93", pairs);

        expect(pair?.winner?.teamName).toBe("Norway");
        expect(formatWorldCupSlotCandidatePair(pair!, " / ")).toBe("Norway");
    });
});
