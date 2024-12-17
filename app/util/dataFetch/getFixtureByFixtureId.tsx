import "server-only";

import { Fixture, Player } from "@/types";
import { getFixtureDetails, fetchTeamSquad } from "@/app/util/dataFetch/fetchData";

export async function getFixtureByFixtureId(id: number, season: number) : Promise<Fixture | undefined> {
    try {
        const fixtureDetails = await getFixtureDetails(id);
        if (!fixtureDetails) {
            return undefined;
        }

        const homeTeamSquad = await fetchTeamSquad(fixtureDetails.teams.home.id);
        const awayTeamSquad = await fetchTeamSquad(fixtureDetails.teams.away.id);
        const mapPhotosToLineup = (lineup: any, squad: Player[]) => lineup?.startXI?.map((player: any) => {
            const matchingPlayer = squad.find((s) => s.id === player.player.id);
            return {
                ...player,
                player: {
                    ...player.player,
                    photo: matchingPlayer?.photo || "/default-player.png"
                }
            };
        }) || [];

        return {
            ...fixtureDetails,
            lineups: fixtureDetails.lineups?.map((lineup, index) => ({
                ...lineup,
                startXI: mapPhotosToLineup(lineup, index === 0 ? homeTeamSquad : awayTeamSquad)
            }))
        };
    }
    catch (error) {
        console.error("Error while fetching fixture by id", error);
        return undefined;
    }
}