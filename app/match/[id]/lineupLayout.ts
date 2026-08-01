import type { MatchLineupPlayer } from "@/types/matchLineups";

function normalizedPosition(player: MatchLineupPlayer): string {
    return (player.position ?? "").trim().toUpperCase();
}

function positionGroup(player: MatchLineupPlayer): "G" | "D" | "M" | "F" | "U" {
    const position = normalizedPosition(player);
    if (position.startsWith("G")) return "G";
    if (position.startsWith("D")) return "D";
    if (position.startsWith("M")) return "M";
    if (position.startsWith("F") || position.startsWith("A")) return "F";
    return "U";
}

export function parseFormation(formation: string | undefined, outfieldCount: number): number[] | null {
    if (!formation || outfieldCount <= 0) return null;

    const rows = formation
        .split("-")
        .map((value) => Number.parseInt(value.trim(), 10));
    const isValid = (
        rows.length >= 2 &&
        rows.length <= 4 &&
        rows.every((value) => Number.isInteger(value) && value > 0 && value <= 5) &&
        rows.reduce((sum, value) => sum + value, 0) === outfieldCount
    );

    return isValid ? rows : null;
}

function splitByFormation(players: MatchLineupPlayer[], shape: number[]): MatchLineupPlayer[][] {
    const rows: MatchLineupPlayer[][] = [];
    let offset = 0;
    for (const count of shape) {
        rows.push(players.slice(offset, offset + count));
        offset += count;
    }
    return rows;
}

export function formationRows(
    players: MatchLineupPlayer[],
    formation: string | undefined,
): MatchLineupPlayer[][] {
    if (players.length === 0) return [];

    const goalkeeperIndex = players.findIndex((player) => positionGroup(player) === "G");
    const goalkeeper = goalkeeperIndex >= 0 ? players[goalkeeperIndex] : players[0];
    const selectedGoalkeeperIndex = goalkeeperIndex >= 0 ? goalkeeperIndex : 0;
    const outfield = players.filter((_, index) => index !== selectedGoalkeeperIndex);
    const shape = parseFormation(formation, outfield.length);

    if (shape) {
        return [[goalkeeper], ...splitByFormation(outfield, shape)];
    }

    const defenders = outfield.filter((player) => positionGroup(player) === "D");
    const midfielders = outfield.filter((player) => positionGroup(player) === "M");
    const forwards = outfield.filter((player) => positionGroup(player) === "F");
    const unknown = outfield.filter((player) => positionGroup(player) === "U");
    const rows = [defenders, midfielders, forwards];

    for (const player of unknown) {
        const target = rows.reduce((smallest, row) => row.length < smallest.length ? row : smallest, rows[0]);
        target.push(player);
    }

    return [[goalkeeper], ...rows.filter((row) => row.length > 0)];
}

export function lineupPlayerLabel(player: MatchLineupPlayer): string {
    const value = (player.short_name || player.name).trim();
    if (value.length <= 16) return value;

    const parts = value.split(/\s+/);
    if (parts.length <= 1) return value.slice(0, 15) + "...";

    const surname = parts[parts.length - 1];
    const initial = parts[0].charAt(0);
    const shortened = initial + ". " + surname;
    return shortened.length <= 16 ? shortened : shortened.slice(0, 15) + "...";
}
