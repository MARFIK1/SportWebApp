import { formationRows, lineupPlayerLabel, parseFormation } from "@/app/match/[id]/lineupLayout";
import type { MatchLineupPlayer } from "@/types/matchLineups";

function player(name: string, position: string, id: number): MatchLineupPlayer {
    return { id, name, position, jersey_number: String(id) };
}

describe("lineup layout", () => {
    it("accepts formations only when they cover every outfield player", () => {
        expect(parseFormation("4-2-3-1", 10)).toEqual([4, 2, 3, 1]);
        expect(parseFormation("4-4-2", 9)).toBeNull();
        expect(parseFormation("invalid", 10)).toBeNull();
    });

    it("keeps the goalkeeper separate and follows the supplied formation", () => {
        const starters = [
            player("Goalkeeper", "G", 1),
            ...Array.from({ length: 4 }, (_, index) => player("Defender " + index, "D", index + 2)),
            ...Array.from({ length: 5 }, (_, index) => player("Midfielder " + index, "M", index + 6)),
            player("Forward", "F", 11),
        ];

        const rows = formationRows(starters, "4-2-3-1");

        expect(rows.map((row) => row.length)).toEqual([1, 4, 2, 3, 1]);
        expect(rows[0][0].name).toBe("Goalkeeper");
        expect(rows[4][0].name).toBe("Forward");
    });

    it("falls back to position groups when formation metadata is unavailable", () => {
        const starters = [
            player("Forward", "F", 9),
            player("Goalkeeper", "G", 1),
            player("Defender", "D", 4),
            player("Midfielder", "M", 8),
        ];

        const rows = formationRows(starters, undefined);

        expect(rows.map((row) => row.map((item) => item.name))).toEqual([
            ["Goalkeeper"],
            ["Defender"],
            ["Midfielder"],
            ["Forward"],
        ]);
    });

    it("shortens long display names without losing the surname", () => {
        expect(lineupPlayerLabel({ name: "Aleksander Verylongsurname" })).toBe("A. Verylongsurn...");
        expect(lineupPlayerLabel({ name: "Jan Kowalski", short_name: "J. Kowalski" })).toBe("J. Kowalski");
    });
});
