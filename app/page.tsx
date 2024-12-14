import { getCurrentSeason } from "@/app/util/season";
import { getStandings, getFixtures, getTopScorers, getTopAssistants } from "@/app/util/fetchData";
import MainPage from "./components/home/MainPage";

export default async function Home() {
    const season = getCurrentSeason();
    const standingsData = await getStandings(season);
    const filteredFixtures = await getFixtures(season);

    const topScorersData = await Promise.all(
        standingsData.map(async (standing) => {
            const leagueId = standing.league.id;
            return {
                leagueId,
                topScorers: await getTopScorers(leagueId, season)
            };
        })
    )

    const topAssistantsData = await Promise.all(
        standingsData.map(async (standing) => {
            const leagueId = standing.league.id;
            return {
                leagueId,
                topAssistants: await getTopAssistants(leagueId, season)
            };
        })
    )

    return (
        <div className="flex flex-col w-full justify-center items-center md:p-10">
            <MainPage
                standingsData={standingsData}
                filteredFixtures={filteredFixtures}
                topScorersData={topScorersData}
                topAssistantsData={topAssistantsData}
            />
        </div>
    )
}