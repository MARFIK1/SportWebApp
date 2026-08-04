import type { CompetitionType } from "@/app/util/league/leagueRegistry";
import { detectTournamentGroups, type TournamentGroup } from "@/app/util/tournament/tournamentGroups";
import type { SofascoreMatch } from "@/types/sofascore";

export interface CompetitionTableSections {
    groups: TournamentGroup[] | null;
    playoffMatches: SofascoreMatch[];
}

export function resolveCompetitionTableSections(
    matches: SofascoreMatch[],
    competitionType: CompetitionType,
): CompetitionTableSections {
    if (competitionType === "league") {
        return { groups: null, playoffMatches: [] };
    }

    const groupMatches = matches.filter(
        (match) => match.round != null && match.round <= 10 && match.status === "finished",
    );
    const groupEventIds = new Set(groupMatches.map((match) => match.event_id));
    const detectedGroups = detectTournamentGroups(groupMatches, groupEventIds);

    return {
        groups: detectedGroups.length > 1 ? detectedGroups : null,
        playoffMatches: matches.filter((match) => match.round != null && match.round > 10),
    };
}