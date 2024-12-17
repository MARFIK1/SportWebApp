import "server-only";
import { getStandings, getPlayers } from "@/app/util/dataFetch/fetchData";
import { Standing, Team, Player } from "@/types";

export default async function getSearchData(season: number) : Promise<{ teams: Team[], players: Player[] }> {
    try {
        const standings: Standing[] = await getStandings(season);
        const playersData = await getPlayers(season);

        const teams = standings.flatMap(league =>
            league.league.standings.flatMap(standing =>
                Array.isArray(standing) ? standing : []
            )
        )

        const uniqueTeams = Array.from(new Map(teams.map(team => [team.team.id, team])).values());
        const players = playersData.flatMap(league => 
            league.teams.flatMap(team => team.players)
        )

        const uniquePlayers = Array.from(new Map(players.map(player => [player.id, player])).values());

        return { teams: uniqueTeams, players: uniquePlayers };
    }
    catch (error) {
        console.error(`Error fetching data for season ${season}:`, error);
        throw error;
    }
}