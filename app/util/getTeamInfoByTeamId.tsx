import "server-only";
import { Team } from "@/types";
import { getStandings } from "@/app/util/fetchData";

export default async function getTeamInfoByTeamId(id: number, season: number) : Promise<Team | undefined> {
    try {
        const standings = await getStandings(season);
        for (const league of standings) {
            for (const standing of league.league.standings) {
                if (Array.isArray(standing)) {
                    const team = standing.find((team) => team.team.id === id);
                    if (team) {
                        return team;
                    }
                }
            }
        }

        return undefined;
    }
    catch (error) {
        console.error("Error while fetching team info by id", error);
        throw error;
    }
}