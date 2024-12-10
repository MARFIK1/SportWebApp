import "server-only";
import moment from "moment";

import { Fixture } from "@/types";
import { getFixtures } from "@/app/util/fetchData";

export default async function getFixturesByTeamId(id: number, season: number) : Promise<Fixture[]> {
    try {
        const allFixturesByLeague = await getFixtures(season);
        const fixturesByTeamId: Fixture[] = [];
        for (const league of allFixturesByLeague) {
            for (const fixture of league.fixtures) {
                if (fixture.teams.home.id === id || fixture.teams.away.id === id) {
                    fixturesByTeamId.push(fixture);
                }
            }
        }

        const fixturesByTeamIdSorted: Fixture[] = fixturesByTeamId.sort((a, b) => {
            const time1 = moment(a.fixture.date);
            const time2 = moment(b.fixture.date);
            if (time1.isBefore(time2)) {
                return -1;
            }
            else if (time1.isAfter(time2)) {
                return 1;
            }
            else {
                return 0;
            }
        })

        return fixturesByTeamIdSorted;
    }
    catch (error) {
        console.error("Error occured while fetching fixtures by team id", error);
        throw error;
    }
}