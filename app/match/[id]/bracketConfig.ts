import { resolveSofascoreMatchResult } from "@/app/util/predictions/matchResult";
import type { SofascoreMatch } from "@/types/sofascore";

export type WorldCupStage = "R32" | "R16" | "QF" | "SF" | "THIRD_PLACE" | "FINAL";

export interface KnockoutRoundWithMatches {
    stage: WorldCupStage;
    labelKey: string;
    matches: SofascoreMatch[];
}

export interface TournamentFormat {
    key: "world-cup-48" | "world-cup-32";
    teamCount: 32 | 48;
    groupStageMatchCount: number;
    leafStage: WorldCupStage;
    leafTeamSlots: number;
    finalSlot: number;
    thirdPlaceSlot: number;
    children: Record<number, [number, number]>;
    leafSlots: number[];
    treeStages: WorldCupStage[];
    stageOrder: WorldCupStage[];
    stageSlots: Partial<Record<WorldCupStage, number[]>>;
    stageBySlot: Record<number, WorldCupStage>;
    stageRadii: Partial<Record<WorldCupStage, number>>;
    stageRoundNumbers: Partial<Record<WorldCupStage, number[]>>;
}

const STAGE_LABEL_KEYS: Record<WorldCupStage, string> = {
    R32: "round_of_32",
    R16: "round_of_16",
    QF: "quarter_finals",
    SF: "semi_finals",
    THIRD_PLACE: "third_place",
    FINAL: "final",
};

const WORLD_CUP_48_CHILDREN: Record<number, [number, number]> = {
    89: [73, 75],
    90: [74, 77],
    91: [76, 78],
    92: [79, 80],
    93: [83, 84],
    94: [81, 82],
    95: [86, 88],
    96: [85, 87],
    97: [89, 90],
    98: [93, 94],
    99: [91, 92],
    100: [95, 96],
    101: [97, 98],
    102: [99, 100],
    104: [101, 102],
};

const WORLD_CUP_32_CHILDREN: Record<number, [number, number]> = {
    9: [1, 2],
    10: [3, 4],
    11: [5, 6],
    12: [7, 8],
    13: [9, 10],
    14: [11, 12],
    15: [13, 14],
};

const WORLD_CUP_48_STAGE_SLOTS: Partial<Record<WorldCupStage, number[]>> = {
    R32: [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88],
    R16: [89, 90, 91, 92, 93, 94, 95, 96],
    QF: [97, 98, 99, 100],
    SF: [101, 102],
    THIRD_PLACE: [103],
    FINAL: [104],
};

const WORLD_CUP_32_STAGE_SLOTS: Partial<Record<WorldCupStage, number[]>> = {
    R16: [1, 2, 3, 4, 5, 6, 7, 8],
    QF: [9, 10, 11, 12],
    SF: [13, 14],
    THIRD_PLACE: [16],
    FINAL: [15],
};

const R32_SLOT_DEFINITION: [number, string[]][] = [
    [73, ["2A", "2B"]],
    [74, ["1E"]],
    [75, ["1F", "2C"]],
    [76, ["1C", "2F"]],
    [77, ["1I"]],
    [78, ["2E", "2I"]],
    [79, ["1A"]],
    [80, ["1L"]],
    [81, ["1D"]],
    [82, ["1G"]],
    [83, ["2K", "2L"]],
    [84, ["1H", "2J"]],
    [85, ["1B"]],
    [86, ["1J", "2H"]],
    [87, ["1K"]],
    [88, ["2D", "2G"]],
];

const SLOT_BY_DEFINITE_CODE: Record<string, number> = {};
for (const [slot, codes] of R32_SLOT_DEFINITION) {
    for (const code of codes) SLOT_BY_DEFINITE_CODE[code] = slot;
}

function buildStageBySlot(stageSlots: Partial<Record<WorldCupStage, number[]>>): Record<number, WorldCupStage> {
    const stageBySlot: Record<number, WorldCupStage> = {};
    for (const [stage, slots] of Object.entries(stageSlots) as [WorldCupStage, number[]][]) {
        for (const slot of slots) stageBySlot[slot] = stage;
    }
    return stageBySlot;
}

export const WORLD_CUP_48_FORMAT: TournamentFormat = {
    key: "world-cup-48",
    teamCount: 48,
    groupStageMatchCount: 72,
    leafStage: "R32",
    leafTeamSlots: 32,
    finalSlot: 104,
    thirdPlaceSlot: 103,
    children: WORLD_CUP_48_CHILDREN,
    leafSlots: WORLD_CUP_48_STAGE_SLOTS.R32 ?? [],
    treeStages: ["R32", "R16", "QF", "SF", "FINAL"],
    stageOrder: ["R32", "R16", "QF", "SF", "THIRD_PLACE", "FINAL"],
    stageSlots: WORLD_CUP_48_STAGE_SLOTS,
    stageBySlot: buildStageBySlot(WORLD_CUP_48_STAGE_SLOTS),
    stageRadii: { R32: 392, R16: 304, QF: 212, SF: 118, FINAL: 0 },
    stageRoundNumbers: { R32: [6], R16: [5], QF: [27], SF: [28], THIRD_PLACE: [50], FINAL: [29] },
};

export const WORLD_CUP_32_FORMAT: TournamentFormat = {
    key: "world-cup-32",
    teamCount: 32,
    groupStageMatchCount: 48,
    leafStage: "R16",
    leafTeamSlots: 16,
    finalSlot: 15,
    thirdPlaceSlot: 16,
    children: WORLD_CUP_32_CHILDREN,
    leafSlots: WORLD_CUP_32_STAGE_SLOTS.R16 ?? [],
    treeStages: ["R16", "QF", "SF", "FINAL"],
    stageOrder: ["R16", "QF", "SF", "THIRD_PLACE", "FINAL"],
    stageSlots: WORLD_CUP_32_STAGE_SLOTS,
    stageBySlot: buildStageBySlot(WORLD_CUP_32_STAGE_SLOTS),
    stageRadii: { R16: 392, QF: 260, SF: 128, FINAL: 0 },
    stageRoundNumbers: {},
};

function normalizeGroupCode(code: string): string {
    const value = (code ?? "").trim().toUpperCase();
    const swapped = /^([A-Z])([12])$/.exec(value);
    if (swapped) return `${swapped[2]}${swapped[1]}`;
    return value;
}

function r32SlotFromCodes(home: string, away: string): number | null {
    for (const code of [home, away]) {
        const slot = SLOT_BY_DEFINITE_CODE[normalizeGroupCode(code)];
        if (slot) return slot;
    }
    return null;
}

function matchNumberFromCode(code: string): number | null {
    const match = /^[WL](\d+)$/i.exec((code ?? "").trim());
    return match ? Number(match[1]) : null;
}

function childSlotsFromCodes(home: string, away: string): [number, number] | null {
    const a = matchNumberFromCode(home);
    const b = matchNumberFromCode(away);
    if (a != null && b != null) return [a, b];
    return null;
}

function numberByChildren(children: Record<number, [number, number]>): Map<string, number> {
    const map = new Map<string, number>();
    for (const [parent, kids] of Object.entries(children)) {
        map.set([...kids].sort((a, b) => a - b).join(","), Number(parent));
    }
    return map;
}

function sortMatches(a: SofascoreMatch, b: SofascoreMatch): number {
    const byDate = String(a.date ?? "").localeCompare(String(b.date ?? ""));
    if (byDate !== 0) return byDate;
    return a.event_id - b.event_id;
}

function extractSeasonYear(value: unknown): number | null {
    const match = String(value ?? "").match(/\b(?:19|20)\d{2}\b/);
    if (!match) return null;
    const year = Number(match[0]);
    return Number.isFinite(year) ? year : null;
}

export function detectWorldCupFormat(match: SofascoreMatch, matches: SofascoreMatch[]): TournamentFormat {
    const currentYear = extractSeasonYear(match.season) ?? extractSeasonYear(match.date);
    if (currentYear != null && currentYear >= 2026) return WORLD_CUP_48_FORMAT;
    if (matches.some((item) => Number(item.round) === 6) || matches.length > 80) return WORLD_CUP_48_FORMAT;
    return WORLD_CUP_32_FORMAT;
}

function isThirdPlaceMatch(match: SofascoreMatch): boolean {
    const round = Number(match.round);
    return round === 50 || round === 20;
}

function buildFortyEightStageGroups(matches: SofascoreMatch[], format: TournamentFormat): Map<WorldCupStage, SofascoreMatch[]> {
    const groups = new Map<WorldCupStage, SofascoreMatch[]>();
    for (const stage of format.stageOrder) {
        const roundNumbers = format.stageRoundNumbers[stage] ?? [];
        if (roundNumbers.length === 0) continue;
        const roundSet = new Set(roundNumbers);
        const stageMatches = matches.filter((match) => roundSet.has(Number(match.round))).sort(sortMatches);
        if (stageMatches.length > 0) groups.set(stage, stageMatches);
    }
    return groups;
}

function buildHistoricalStageGroups(matches: SofascoreMatch[]): Map<WorldCupStage, SofascoreMatch[]> {
    const groups = new Map<WorldCupStage, SofascoreMatch[]>();
    const sorted = [...matches].sort(sortMatches);
    const thirdPlaceMatches = sorted.filter(isThirdPlaceMatch);
    const mainKnockout = sorted.filter((match) => !isThirdPlaceMatch(match)).slice(-15);

    if (mainKnockout.length < 15) return groups;

    groups.set("R16", mainKnockout.slice(0, 8));
    groups.set("QF", mainKnockout.slice(8, 12));
    groups.set("SF", mainKnockout.slice(12, 14));
    groups.set("FINAL", mainKnockout.slice(14, 15));
    if (thirdPlaceMatches.length > 0) groups.set("THIRD_PLACE", [thirdPlaceMatches[thirdPlaceMatches.length - 1]]);
    return groups;
}

function buildStageGroups(matches: SofascoreMatch[], format: TournamentFormat): Map<WorldCupStage, SofascoreMatch[]> {
    if (format.key === "world-cup-48") return buildFortyEightStageGroups(matches, format);
    return buildHistoricalStageGroups(matches);
}

export function buildWorldCupKnockoutRounds(matches: SofascoreMatch[], format: TournamentFormat): KnockoutRoundWithMatches[] {
    const groups = buildStageGroups(matches, format);
    return format.stageOrder
        .map((stage) => ({
            stage,
            labelKey: STAGE_LABEL_KEYS[stage],
            matches: groups.get(stage) ?? [],
        }))
        .filter((round) => round.matches.length > 0);
}

function computeScheduledFortyEightSlots(rawMatches: SofascoreMatch[], format: TournamentFormat): Map<number, number> {
    const slotByEventId = new Map<number, number>();
    const usedSlots = new Set<number>();
    const numberForChildren = numberByChildren(format.children);
    const r32 = rawMatches.filter((match) => Number(match.round) === 6);
    const unmatchedR32: SofascoreMatch[] = [];

    for (const match of r32) {
        const slot = r32SlotFromCodes(match.home_team, match.away_team);
        if (slot != null && !usedSlots.has(slot)) {
            slotByEventId.set(match.event_id, slot);
            usedSlots.add(slot);
        } else {
            unmatchedR32.push(match);
        }
    }

    if (unmatchedR32.length > 0) {
        const freeSlots = [...format.leafSlots].filter((slot) => !usedSlots.has(slot)).sort((a, b) => a - b);
        unmatchedR32.sort(sortMatches).forEach((match, index) => {
            const slot = freeSlots[index];
            if (slot != null) slotByEventId.set(match.event_id, slot);
        });
    }

    for (const match of rawMatches) {
        const round = Number(match.round);
        if (round === 6) continue;
        if (round === 50) {
            slotByEventId.set(match.event_id, format.thirdPlaceSlot);
            continue;
        }
        const kids = childSlotsFromCodes(match.home_team, match.away_team);
        if (!kids) continue;
        const slot = numberForChildren.get([...kids].sort((a, b) => a - b).join(","));
        if (slot != null) slotByEventId.set(match.event_id, slot);
    }

    return slotByEventId;
}

function validTeamId(teamId: number): boolean {
    return Number.isFinite(teamId) && teamId > 0;
}

function normalizeTeamName(name: string): string {
    return name.trim().toLowerCase();
}

function sideKeys(match: SofascoreMatch, side: "HOME" | "AWAY"): string[] {
    const teamId = side === "HOME" ? match.home_team_id : match.away_team_id;
    const teamName = side === "HOME" ? match.home_team : match.away_team;
    const keys: string[] = [];
    if (validTeamId(teamId)) keys.push(`id:${teamId}`);
    const normalizedName = normalizeTeamName(teamName);
    if (normalizedName) keys.push(`name:${normalizedName}`);
    return keys;
}

function winnerKeys(match: SofascoreMatch): string[] {
    const state = resolveSofascoreMatchResult(match, null);
    if (state.actualResult === "HOME") return sideKeys(match, "HOME");
    if (state.actualResult === "AWAY") return sideKeys(match, "AWAY");
    return [];
}

function keysOverlap(keys: string[], targetKeys: Set<string>): boolean {
    for (const key of keys) {
        if (targetKeys.has(key)) return true;
    }
    return false;
}

function findChildMatchForParentSide(
    parentMatch: SofascoreMatch,
    side: "HOME" | "AWAY",
    childMatches: SofascoreMatch[],
    usedChildIds: Set<number>,
): SofascoreMatch | null {
    const targetKeys = new Set(sideKeys(parentMatch, side));
    return childMatches.find((childMatch) => {
        if (usedChildIds.has(childMatch.event_id)) return false;
        return keysOverlap(winnerKeys(childMatch), targetKeys);
    }) ?? null;
}

function assignResolvedChildren(
    parentSlot: number,
    parentMatch: SofascoreMatch,
    childMatches: SofascoreMatch[],
    usedChildIds: Set<number>,
    slotByEventId: Map<number, number>,
    format: TournamentFormat,
) {
    const childSlots = format.children[parentSlot];
    if (!childSlots) return;

    const homeChild = findChildMatchForParentSide(parentMatch, "HOME", childMatches, usedChildIds);
    if (homeChild) {
        slotByEventId.set(homeChild.event_id, childSlots[0]);
        usedChildIds.add(homeChild.event_id);
    }

    const awayChild = findChildMatchForParentSide(parentMatch, "AWAY", childMatches, usedChildIds);
    if (awayChild) {
        slotByEventId.set(awayChild.event_id, childSlots[1]);
        usedChildIds.add(awayChild.event_id);
    }
}

function computeResolvedSlots(
    rawMatches: SofascoreMatch[],
    format: TournamentFormat,
    initialSlots: Map<number, number> = new Map(),
): Map<number, number> {
    const groups = buildStageGroups(rawMatches, format);
    const slotByEventId = new Map(initialSlots);
    const finalMatch = (groups.get("FINAL") ?? [])[0];
    if (finalMatch) slotByEventId.set(finalMatch.event_id, format.finalSlot);

    for (const thirdPlaceMatch of groups.get("THIRD_PLACE") ?? []) {
        slotByEventId.set(thirdPlaceMatch.event_id, format.thirdPlaceSlot);
    }

    const usedByStage = new Map<WorldCupStage, Set<number>>();
    for (let index = format.treeStages.length - 1; index > 0; index -= 1) {
        const parentStage = format.treeStages[index];
        const childStage = format.treeStages[index - 1];
        const parentMatches = groups.get(parentStage) ?? [];
        const childMatches = groups.get(childStage) ?? [];
        const usedChildIds = usedByStage.get(childStage) ?? new Set<number>();
        usedByStage.set(childStage, usedChildIds);

        for (const parentMatch of parentMatches) {
            const parentSlot = slotByEventId.get(parentMatch.event_id);
            if (parentSlot == null) continue;
            assignResolvedChildren(parentSlot, parentMatch, childMatches, usedChildIds, slotByEventId, format);
        }
    }

    return slotByEventId;
}

export function computeWorldCupBracketSlots(rawMatches: SofascoreMatch[], format: TournamentFormat): Map<number, number> {
    const scheduledSlots = format.key === "world-cup-48"
        ? computeScheduledFortyEightSlots(rawMatches, format)
        : new Map<number, number>();
    const slotByEventId = computeResolvedSlots(rawMatches, format, scheduledSlots);

    for (const [eventId, slot] of scheduledSlots) {
        if (!slotByEventId.has(eventId)) slotByEventId.set(eventId, slot);
    }

    return slotByEventId;
}
