import { timelineMinuteLabel, visibleTimelineEvents } from "@/app/match/[id]/MatchTimeline";
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
        ], false);

        expect(result.map((item) => item.id)).toEqual(["latest", "middle", "first"]);
        expect(timelineMinuteLabel(result[0])).toBe("90+4'");
    });

    it("hides substitutions until the user expands them", () => {
        const events = [
            event({ id: "goal", minute: 50 }),
            event({
                id: "sub",
                type: "substitution",
                source_type: "substitution",
                minute: 60,
            }),
        ];

        expect(visibleTimelineEvents(events, false).map((item) => item.id)).toEqual(["goal"]);
        expect(visibleTimelineEvents(events, true).map((item) => item.id)).toEqual(["sub", "goal"]);
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
        ], false);

        expect(result.map((item) => item.id)).toEqual(["readable"]);
    });
});

