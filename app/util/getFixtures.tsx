import { AllFixtures, Fixture } from "@/types";
import { USE_SAMPLE } from "../sampleData/useSample";
import moment from "moment";
import getFixturesSample from "../sampleData/getFixturesSample";

const API_KEY = process.env.API_KEY as string;

const leagues = [
    {league: 39, name: "Premier League"},
    {league: 140, name: "La Liga"},
    {league: 78, name: "Bundesliga"},
    {league: 135, name: "Serie A"},
    {league: 61, name: "Ligue 1"},
    {league: 2, name: "UEFA Champions League"},
    {league: 3, name: "UEFA Europa League"},
    {league: 848, name: "UEFA Conference League"},
    {league: 531, name: "UEFA Super Cup"},
    {league: 15, name: "Fifa Club World Cup"},
    {league: 45, name: "FA Cup"},
    {league: 48, name: "Carribao Cup"},
    {league: 528, name: "Community Shield"},
    {league: 143, name: "Copa del Rey"},
    {league: 556, name: "Super Cup La Liga"},
    {league: 529, name: "Super Cup Bundesliga"},
    {league: 547, name: "Super Cup Serie A"},
    {league: 137, name: "Coppa Italia"},
    {league: 65, name: "Coupe de la Ligue"},
    {league: 66, name: "Coupe de France"},
    {league: 526, name: "Trophee des Champions"},
]

async function fetchFixturesByLeague(year: number, league: number): Promise<Fixture[]> {

    const url = `https://api-football-v1.p.rapidapi.com/v3/fixtures?league=${league}&season=${year}`;
    const options = {
        method: 'GET',
        headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'api-football-v1.p.rapidapi.com'
        },
        next: {
            revalidate: 60 * 60 * 24
        }
    }

    await fetch(url, options)
        .then(response => response.json())
        .then(data => {
            const fixtures: Fixture[] = data.response;
            if (fixtures === null || fixtures === undefined) {
                return [];
            }
            else {
                return fixtures;
            }
        })
        .catch(error => {
            console.error(`Error fetching ${league} fixtures on year ${year}: ${error}`);
        });
    return [];
}

export default async function getFixtures(): Promise<AllFixtures[]> {

    if (USE_SAMPLE) {
        return getFixturesSample();
    }

    try {
        const currentTime = moment();
        const year = currentTime.year();
        const month = currentTime.month();

        const allFixturesByLeague: AllFixtures[] = [];
        
        for (const league of leagues) {
            if (month <= 5) {
                allFixturesByLeague.push({
                    name: league.name,
                    fixtures: await fetchFixturesByLeague(year - 1, league.league)
                });
            }
            else if (month >= 8) {
                allFixturesByLeague.push({
                    name: league.name,
                    fixtures: await fetchFixturesByLeague(year, league.league)
                });
            }
            else {
                allFixturesByLeague.push({
                    name: league.name,
                    fixtures: await fetchFixturesByLeague(year - 1, league.league)
                });
                const existingData = allFixturesByLeague.find((data) => data.name === league.name);
                if (existingData) {
                    existingData.fixtures.push(...(await fetchFixturesByLeague(year, league.league)));
                }
                else {
                    allFixturesByLeague.push({
                        name: league.name,
                        fixtures: await fetchFixturesByLeague(year, league.league)
                    })
                }
            }
        }
        return allFixturesByLeague;
    }
    catch (error) {
        console.error("Error while fetching fixtures: ", error);
        throw error;
    }
}
