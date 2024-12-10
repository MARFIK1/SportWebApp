import "server-only";
import { getStandings } from "@/app/util/fetchData";
import { Standing, Team } from "@/types";

export default async function getTeams(season: number) : Promise<Team[]> {
    try {
        const standings: Standing[] = await getStandings(season);
        const teams: Team[] = [];
        for (const league of standings) {
            for (const standing of league.league.standings) {
                if (Array.isArray(standing)) {
                    for (const team of standing) {
                        teams.push(team);
                    }
                }
                else {
                    throw new Error("Invalid standings data");
                }
            }
        }
        return teams;
    }
    catch (error) {
        console.error("Error fetching teams: ", error);
        throw error;
    }
}