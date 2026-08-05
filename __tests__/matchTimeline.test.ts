import { groupTimelineEvents, timelineMinuteLabel, visibleTimelineEvents } from "@/app/match/[id]/MatchTimeline";
import type { MatchTimelineEvent } from "@/types/matchEvents";

function event(overrides: Partial<MatchTimelineEvent>): MatchTimelineEvent {
    return {
        id: "event",
        type: "goal",
        source_type: "goal",
        ...overrides,
    };
}

describe("match timeline helpers", () => {
    it("sorts events from newest to oldest and formats added time", () => {
        const result = visibleTimelineEvents([
            event({ id: "first", minute: 12 }),
            event({ id: "latest", minute: 90, added_time: 4 }),
            event({ id: "middle", minute: 67 }),
        ]);

        expect(result.map((item) => item.id)).toEqual(["latest", "middle", "first"]);
        expect(timelineMinuteLabel(result[0])).toBe("90+4'");
    });

    it("ignores period sentinel added time and keeps half time in chronological order", () => {
        const halfTime = event({
            id: "half-time",
            type: "period",
            source_type: "period",
            minute: 45,
            added_time: 999,
            text: "HT",
        });
        const result = visibleTimelineEvents([
            event({ id: "second-half", minute: 49 }),
            halfTime,
            event({ id: "stoppage", minute: 45, added_time: 1 }),
        ]);

        expect(result.map((item) => item.id)).toEqual(["second-half", "half-time", "stoppage"]);
        expect(timelineMinuteLabel(halfTime)).toBe("45'");
    });

    it("keeps substitutions visible and groups both teams by match moment", () => {
        const result = groupTimelineEvents([
            event({ id: "goal", minute: 50 }),
            event({
                id: "home-sub",
                type: "substitution",
                source_type: "substitution",
                minute: 60,
                is_home: true,
            }),
            event({
                id: "away-sub",
                type: "substitution",
                source_type: "substitution",
                minute: 60,
                is_home: false,
            }),
            event({
                id: "earlier-sub",
                type: "substitution",
                source_type: "substitution",
                minute: 55,
                is_home: true,
            }),
        ]);

        expect(result.map((group) => group.kind)).toEqual([
            "substitutions",
            "substitutions",
            "event",
        ]);
        expect(result[0].events.map((item) => item.id)).toEqual(["away-sub", "home-sub"]);
        expect(result[1].events.map((item) => item.id)).toEqual(["earlier-sub"]);
    });

    it("keeps unknown events only when they contain readable details", () => {
        const result = visibleTimelineEvents([
            event({ id: "empty", type: "unknown", source_type: "break" }),
            event({
                id: "readable",
                type: "unknown",
                source_type: "coolingBreak",
                text: "Cooling break",
                minute: 30,
            }),
        ]);

        expect(result.map((item) => item.id)).toEqual(["readable"]);
    });
});

