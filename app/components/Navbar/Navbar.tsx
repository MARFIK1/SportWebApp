import { Team } from "@/types";
import SearchBarForm from "./SearchBarForm";

export default function Navbar({ teamsData } : { teamsData: Team[] }) {
    return (
        <div className="flex justify-between items-center w-full">
            <div className="flex items-center">
                <a
                    href="/"
                    className="flex items-center"
                >
                    <img
                        src="/logo.png"
                        alt="logo"
                        className="w-24 object-cover rounded-full"
                    />
                </a>
            </div>
            <div className="flex-1 mx-4">
                <SearchBarForm 
                    teamsData={teamsData}
                />
            </div>
        </div>
    )
}