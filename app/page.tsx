import { getCurrentSeason } from "@/app/util/season";
import { getStandings, getFixtures } from "@/app/util/fetchData";
import MainPage from "./components/home/MainPage";

export default async function Home() {
    const season = getCurrentSeason();
    const standingsData = await getStandings(season);
    const filteredFixtures = await getFixtures(season);

    return (
        <div className="flex flex-col w-full justify-center items-center md:p-10">
            <MainPage
                standingsData={standingsData} 
                filteredFixtures={filteredFixtures} 
            />
        </div>
    )
}