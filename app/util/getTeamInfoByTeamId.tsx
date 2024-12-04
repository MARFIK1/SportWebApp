import "server-only";
import { Team } from "@/types";
import getTeams from "./getTeams";

export default async function getTeamInfoByTeamId(id: number): Promise<Team | undefined> {
    try {
        const teams: Team[] = await getTeams();

        for (const team of teams) {
            if (team.team.id === id) {
                return team;
            }
        }

        return undefined;
    }
    catch (error) {
        console.error("Error while fetching team info by id", error);
        throw error;
    }
}