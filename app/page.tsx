import Image from "next/image";
import { Standing } from "@/types";
import getStandings from "./util/getStandings";
import StandingsAndFixtures from "./components/home/StandingsAndFixtures";

export default async function Home() {

    const standingsData: Standing[] = await getStandings();

    return (
        <div className="flex flex-col w-full justify-center items-center md:p-10">
            <StandingsAndFixtures standingsData={standingsData}/>
        </div>
    )
}
