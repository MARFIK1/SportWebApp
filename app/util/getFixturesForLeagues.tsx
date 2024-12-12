import moment from "moment";

import { AllFixtures } from "@/types";
import { getFixtures } from "@/app/util/fetchData";

export default async function getFixturesForLeagues(season: number) : Promise<AllFixtures[]> {
    try {
        const allFixturesByLeague = await getFixtures(season);
        const fixturesForLeagues: AllFixtures[] = [];
        for (const league of allFixturesByLeague) {
            if (
                league.name === "Premier League" ||
                league.name === "La Liga" ||
                league.name === "Bundesliga" ||
                league.name === "Serie A" ||
                league.name === "Ligue 1" ||
                league.name === "UEFA Champions League" ||
                league.name === "UEFA Europa League" ||
                league.name === "UEFA Conference League"
            ) {
                fixturesForLeagues.push(league);
            }
        }
        
        const filteredFixtures: AllFixtures[] = fixturesForLeagues.filter((league) => {
            league.fixtures = league.fixtures.filter((fixture) => {
                return moment(fixture.fixture.date).isAfter(moment().subtract(1, "day"), "day");
            }).slice(0, 7);

            return league.fixtures.length > 0;
        })

        return filteredFixtures;
    }
    catch (error) {
        console.error("Error while fetching fixtures: ", error);
        throw error;
    }
}