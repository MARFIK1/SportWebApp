import "server-only";
import { getStandings } from "@/app/util/fetchData";
import { Standing, Team } from "@/types";

export default async function getSearchData(season: number) : Promise<Team[]> {
    try {
        const standings: Standing[] = await getStandings(season);

        const teams = standings.flatMap(league =>
            league.league.standings.flatMap(standing =>
                Array.isArray(standing) ? standing : []
            )
        )

        const uniqueTeams = Array.from(new Map(teams.map(team => [team.team.id, team])).values());

        return uniqueTeams;
    }
    catch (error) {
        console.error(`Error fetching teams for season ${season}:`, error);
        throw error;
    }
}