import "server-only";
import { Fixture } from "@/types";
import { getFixtures } from "@/app/util/fetchData";

export default async function getFixtureByFixtureId(id: number, season: number) : Promise<Fixture | undefined> {
    try {
        const allFixturesByLeague = await getFixtures(season);
        for (const league of allFixturesByLeague) {
            for (const fixture of league.fixtures) {
                if (fixture.fixture.id === id) {
                    return fixture;
                }
            }
        }

        return undefined;
    }
    catch (error) {
        console.error("Error while fetching fixture by id", error);
    }
}