import { AllFixtures } from "@/types";
import getFixtures from "./getFixtures";
import moment from "moment";

export default async function getFixturesForFiveLeagues(): Promise<AllFixtures[]> {
    try {
        const allFixturesByLeague = await getFixtures();
        const fixturesForFiveLeagues: AllFixtures[] = [];
        for (const league of allFixturesByLeague) {
            if (
                league.name === "Premier League" ||
                league.name === "La Liga" ||
                league.name === "Bundesliga" ||
                league.name === "Serie A" ||
                league.name === "Ligue 1"
            ) {
                fixturesForFiveLeagues.push(league);
            }
        }

        const filteredFixtures: AllFixtures[] = fixturesForFiveLeagues.filter((league) => {
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