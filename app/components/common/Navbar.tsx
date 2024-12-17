"use client";
import { useRouter } from "next/navigation";

import { Team, Player } from "@/types";
import SearchBarForm from "./SearchBarForm";

export default function Navbar({ teamsData, playersData } : { teamsData: Team[], playersData: Player[] }) {
    const router = useRouter();

    const handleLoginClick = () => {
        router.push("/user/login");
    }

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
                    playersData={playersData}
                />
            </div>
            <div className="flex items-center">
                <button
                    onClick={handleLoginClick}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg"
                >
                    Log in
                </button>
            </div>
        </div>
    )
}