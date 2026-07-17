import { deduplicateMatchesByEventId } from "@/app/util/data/matchDeduplication";
import type { SofascoreMatch } from "@/types/sofascore";

const GROUP_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export interface TournamentGroup {
    letter: string;
    teamIds: number[];
    teamNames: Map<number, string>;
    matches: SofascoreMatch[];
}

interface GroupStageFormat {
    groupStageMatchCount: number;
}

function validTeamId(teamId: number): boolean {
    return Number.isFinite(teamId) && teamId > 0;
}

export function sortTournamentMatches(a: SofascoreMatch, b: SofascoreMatch): number {
    const dateCompare = String(a.date ?? "").localeCompare(String(b.date ?? ""));
    if (dateCompare !== 0) return dateCompare;
    return a.event_id - b.event_id;
}

export function deduplicateTournamentMatches(matches: SofascoreMatch[]): SofascoreMatch[] {
    return deduplicateMatchesByEventId(matches).sort(sortTournamentMatches);
}

export function buildGroupStageEventIds(matches: SofascoreMatch[], format: GroupStageFormat): Set<number> {
    const uniqueMatches = deduplicateTournamentMatches(matches);
    const groupRoundMatches = uniqueMatches.filter((match) => Number(match.round) >= 1 && Number(match.round) <= 3);
    const groupStageMatches = groupRoundMatches.length === format.groupStageMatchCount
        ? groupRoundMatches
        : uniqueMatches.slice(0, format.groupStageMatchCount);
    return new Set(
        groupStageMatches.map((match) => match.event_id),
    );
}

export function isGroupStageMatch(match: SofascoreMatch, groupStageEventIds: Set<number>): boolean {
    return groupStageEventIds.has(match.event_id) && validTeamId(match.home_team_id) && validTeamId(match.away_team_id);
}

export function detectTournamentGroups(matches: SofascoreMatch[], groupStageEventIds: Set<number>): TournamentGroup[] {
    const groupMatches = deduplicateTournamentMatches(matches).filter((match) => isGroupStageMatch(match, groupStageEventIds));
    if (groupMatches.length === 0) return [];

    const parent = new Map<number, number>();
    const teamNames = new Map<number, string>();

    function find(teamId: number): number {
        const currentParent = parent.get(teamId);
        if (currentParent == null) {
            parent.set(teamId, teamId);
            return teamId;
        }
        if (currentParent === teamId) return teamId;
        const root = find(currentParent);
        parent.set(teamId, root);
        return root;
    }

    function union(a: number, b: number) {
        const rootA = find(a);
        const rootB = find(b);
        if (rootA !== rootB) parent.set(rootB, rootA);
    }

    for (const match of groupMatches) {
        parent.set(match.home_team_id, parent.get(match.home_team_id) ?? match.home_team_id);
        parent.set(match.away_team_id, parent.get(match.away_team_id) ?? match.away_team_id);
        teamNames.set(match.home_team_id, match.home_team);
        teamNames.set(match.away_team_id, match.away_team);
        union(match.home_team_id, match.away_team_id);
    }

    const teamGroups = new Map<number, Set<number>>();
    for (const teamId of parent.keys()) {
        const root = find(teamId);
        const group = teamGroups.get(root) ?? new Set<number>();
        group.add(teamId);
        teamGroups.set(root, group);
    }

    return Array.from(teamGroups.values())
        .map((teamSet) => {
            const ids = Array.from(teamSet);
            const groupSet = new Set(ids);
            const matchesForGroup = groupMatches.filter(
                (match) => groupSet.has(match.home_team_id) && groupSet.has(match.away_team_id),
            );
            return { ids, matches: matchesForGroup };
        })
        .filter((group) => group.ids.length >= 3 && group.matches.length > 0)
        .sort((a, b) => sortTournamentMatches(a.matches[0], b.matches[0]))
        .map((group, index) => ({
            letter: GROUP_LETTERS[index] ?? String(index + 1),
            teamIds: group.ids.sort((a, b) => (teamNames.get(a) ?? "").localeCompare(teamNames.get(b) ?? "")),
            teamNames,
            matches: group.matches,
        }));
}

export function partitionTournamentMatches(matches: SofascoreMatch[], format: GroupStageFormat) {
    const uniqueMatches = deduplicateTournamentMatches(matches);
    const groupStageEventIds = buildGroupStageEventIds(uniqueMatches, format);
    return {
        matches: uniqueMatches,
        groupStageEventIds,
        groupMatches: uniqueMatches.filter((match) => groupStageEventIds.has(match.event_id)),
        playoffMatches: uniqueMatches.filter((match) => !groupStageEventIds.has(match.event_id)),
    };
}
