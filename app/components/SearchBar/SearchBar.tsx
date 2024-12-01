import getTeams from "@/app/util/getTeams";
import SearchBarForm from "./SearchBarForm";
import { Team } from "@/types";

export default async function SearchBar() {
    let teamsData: Team[] = await getTeams();

    return (
        <div className="flex justify-center items-center w-full p-3 bg-gray/40">
            <div className="w-1/6 flex justify-center items-center text-neutral-100">
                <a
                    href={"/"}
                    className="flex justify-center items-center"
                >
                    <img
                        src="/logo.png"
                        alt="logo"
                        className="w-24 object-cover rounded-full"
                    />
                    <div className="px-2 md:block hidden font-bold text-xl">
                        FootballTennisApp
                    </div>
                </a>
            </div>
            <div className="w-4/6 flex justify-center items-center">
                <SearchBarForm teamsData={teamsData} />
            </div>
            <div className="w-1/6"></div>
        </div>
    )
}