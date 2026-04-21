"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { SearchTeam, SearchPlayer } from "@/app/util/data/dataService";
import { teamLogoUrl, playerImageUrl } from "@/app/util/urls";
import { useLanguage } from "./LanguageProvider";

export default function SearchBarForm({ teamsData, playersData }: { teamsData: SearchTeam[]; playersData: SearchPlayer[] }) {
    const router = useRouter();
    const { t } = useLanguage();
    const [searchTerm, setSearchTerm] = useState("");
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [showFilteredBox, setShowFilteredBox] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const listboxId = useId();

    const filteredTeams = searchTerm ? teamsData.filter((t) => t.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 5) : [];
    const filteredPlayers = searchTerm ? playersData.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 5) : [];

    const totalResults = filteredTeams.length + filteredPlayers.length;
    const showResults = searchTerm.length > 0 && totalResults > 0 && showFilteredBox;

    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(event.target.value);
        setFocusedIndex(-1);
        setShowFilteredBox(true);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setFocusedIndex((prev) => (prev < totalResults - 1 ? prev + 1 : prev));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        } else if (event.key === "Enter" && focusedIndex !== -1) {
            if (focusedIndex < filteredTeams.length) {
                router.push(`/team/${filteredTeams[focusedIndex].id}`);
            } else {
                router.push(`/player/${filteredPlayers[focusedIndex - filteredTeams.length].id}`);
            }
            setSearchTerm("");
            setShowFilteredBox(false);
        } else if (event.key === "Escape") {
            setShowFilteredBox(false);
            setFocusedIndex(-1);
        }
    };

    useEffect(() => {
        const handleOutsideClick = (event: MouseEvent) => {
            if (listRef.current && !listRef.current.contains(event.target as Node)) {
                setShowFilteredBox(false);
            }
        };
        document.addEventListener("click", handleOutsideClick);
        return () => document.removeEventListener("click", handleOutsideClick);
    }, []);

    return (
        <div className="flex justify-center items-center w-full max-w-lg relative" ref={listRef}>
            <input
                type="text"
                value={searchTerm}
                onChange={handleSearchChange}
                onKeyDown={handleKeyDown}
                placeholder={t("search_placeholder")}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showResults}
                aria-controls={showResults ? listboxId : undefined}
                aria-activedescendant={focusedIndex >= 0 ? `${listboxId}-option-${focusedIndex}` : undefined}
                className="w-full bg-gray-200 dark:bg-gray-700 p-2 text-gray-900 dark:text-white rounded-lg outline-none placeholder-gray-400"
            />
            {showResults && (
                <div
                    id={listboxId}
                    role="listbox"
                    className="absolute top-full left-0 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg mt-1 z-[100] overflow-hidden shadow-lg"
                >
                    {filteredTeams.length > 0 && (
                        <div className="text-xs text-gray-500 uppercase tracking-wider px-3 pt-2 pb-1">{t("teams")}</div>
                    )}
                    {filteredTeams.map((team, i) => (
                        <Link
                            href={`/team/${team.id}`}
                            key={team.id}
                            id={`${listboxId}-option-${i}`}
                            role="option"
                            aria-selected={i === focusedIndex}
                            className={`p-2 px-3 flex items-center gap-2 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 ${i === focusedIndex ? "bg-gray-100 dark:bg-gray-800" : ""}`}
                            onClick={() => { setSearchTerm(""); setShowFilteredBox(false); }}
                        >
                            <Image src={teamLogoUrl(team.id)} alt={team.name} width={24} height={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
                            <span className="text-sm">{team.name}</span>
                        </Link>
                    ))}
                    {filteredPlayers.length > 0 && (
                        <div className="text-xs text-gray-500 uppercase tracking-wider px-3 pt-2 pb-1">{t("players")}</div>
                    )}
                    {filteredPlayers.map((player, i) => (
                        <Link
                            href={`/player/${player.id}`}
                            key={player.id}
                            id={`${listboxId}-option-${i + filteredTeams.length}`}
                            role="option"
                            aria-selected={i + filteredTeams.length === focusedIndex}
                            className={`p-2 px-3 flex items-center gap-2 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 ${i + filteredTeams.length === focusedIndex ? "bg-gray-100 dark:bg-gray-800" : ""}`}
                            onClick={() => { setSearchTerm(""); setShowFilteredBox(false); }}
                        >
                            <Image src={playerImageUrl(player.id)} alt={player.name} width={24} height={24} className="rounded-full object-contain" style={{ width: "24px", height: "24px" }} />
                            <div className="flex flex-col">
                                <span className="text-sm">{player.name}</span>
                                <span className="text-xs text-gray-500">{player.team}</span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}