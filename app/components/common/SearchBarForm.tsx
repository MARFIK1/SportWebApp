"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import { Team, Player } from "@/types";

export default function SearchBarForm({ teamsData, playersData } : { teamsData: Team[], playersData: Player[] }) {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState("");
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [showFilteredBox, setShowFilteredBox] = useState(false);

    const filteredTeams = teamsData.filter(team => team.team.name.toLowerCase().includes(searchTerm.toLowerCase()));
    const filteredPlayers = playersData.filter(player => player.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(event.target.value);
        setFocusedIndex(-1);
        setShowFilteredBox(true);
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        const totalResults = Math.min(filteredTeams.length + filteredPlayers.length, 10);
        if (event.key === "ArrowDown") {
            setFocusedIndex(prevIndex => prevIndex < totalResults - 1 ? prevIndex + 1 : prevIndex);
        } 
        else if (event.key === "ArrowUp") {
            event.preventDefault();
            setFocusedIndex(prevIndex => prevIndex > 0 ? prevIndex - 1 : prevIndex);
        } 
        else if (event.key === "Enter") {
            if (focusedIndex !== -1) {
                if (focusedIndex < filteredTeams.length) {
                    const teamId = filteredTeams[focusedIndex].team.id;
                    router.push(`/team/${teamId}`);
                }
                else {
                    const playerId = filteredPlayers[focusedIndex - filteredTeams.length].id;
                    router.push(`/player/${playerId}`);
                }
                setSearchTerm("");
            }
        }
    }

    const handleItemClick = () => {
        setSearchTerm("");
    }

    const listRef = useRef<HTMLDivElement>(null);

    const handleOutsideClick = (event: MouseEvent) => {
        if (listRef.current && !listRef.current.contains(event.target as Node)) {
            setShowFilteredBox(false);
        }
    }

    useEffect(() => {
        document.addEventListener("click", handleOutsideClick);

        return () => {
            document.removeEventListener("click", handleOutsideClick);
        };
    }, [])

    const totalResults = Math.min(filteredTeams.length + filteredPlayers.length, 10);
    const displayedTeams = filteredTeams.slice(0, totalResults);
    const displayedPlayers = filteredPlayers.slice(0, totalResults - displayedTeams.length);

    return (
        <div className="flex justify-center items-center w-full max-w-lg relative">
            <input
                type="text"
                value={searchTerm}
                onChange={handleSearchChange}
                onKeyDown={handleKeyDown}
                placeholder="Search"
                className="w-full bg-gray-700 p-2 text-white rounded-lg outline-none placeholder-gray-400"
            />
            {
                searchTerm && (displayedTeams.length > 0 || displayedPlayers.length > 0) && showFilteredBox ? (
                    <div
                        ref={listRef}
                        className="absolute top-full left-2 w-full max-w-md bg-black/80 z-[100] flex flex-col"
                    >
                        {
                            displayedTeams.map((team, i) => (
                                <Link
                                    href={`/team/${team.team.id}`}
                                    key={team.team.id}
                                    className={`p-2 flex items-center text-neutral-100 ${i === focusedIndex ? "bg-neutral-100/40" : ""}`}
                                    onClick={handleItemClick}
                                >
                                    <Image
                                        src={team.team.logo}
                                        alt={`${team.team.name} logo`}
                                        width={25}
                                        height={25}
                                        style={{ width: "25px", height: "25px" }}
                                        className="object-contain rounded-full"
                                    />
                                    <span className="ml-2">
                                        {team.team.name}
                                    </span>
                                </Link>
                            ))
                        }
                        {
                            displayedPlayers.map((player, i) => (
                                <Link
                                    href={`/player/${player.id}`}
                                    key={player.id}
                                    className={`p-2 flex items-center text-neutral-100 ${i + displayedTeams.length === focusedIndex ? "bg-neutral-100/40" : ""}`}
                                    onClick={handleItemClick}
                                >
                                    <Image
                                        src={player.photo}
                                        alt={`${player.name} photo`}
                                        width={25}
                                        height={25}
                                        style={{ width: "25px", height: "25px" }}
                                        className="object-contain rounded-full"
                                    />
                                    <span className="ml-2">
                                        {player.name}
                                    </span>
                                </Link>
                            ))
                        }
                    </div>
                ) : null
            }
        </div>
    )
}