"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowPathIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import type { SearchTeam, SearchPlayer } from "@/app/util/data/dataService";
import { playerImageUrl } from "@/app/util/urls";
import { useLanguage } from "./LanguageProvider";
import TeamLogo from "./TeamLogo";

type SearchStatus = "idle" | "loading" | "success" | "error";

export default function SearchBarForm() {
    const router = useRouter();
    const { t } = useLanguage();
    const [searchTerm, setSearchTerm] = useState("");
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [showFilteredBox, setShowFilteredBox] = useState(false);
    const [teamsData, setTeamsData] = useState<SearchTeam[]>([]);
    const [playersData, setPlayersData] = useState<SearchPlayer[]>([]);
    const [status, setStatus] = useState<SearchStatus>("idle");
    const [retryVersion, setRetryVersion] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    const listboxId = useId();
    const panelId = `${listboxId}-panel`;

    const queryIsReady = searchTerm.trim().length >= 2;
    const filteredTeams = queryIsReady ? teamsData : [];
    const filteredPlayers = queryIsReady ? playersData : [];
    const totalResults = filteredTeams.length + filteredPlayers.length;
    const showSearchPanel = queryIsReady && showFilteredBox;
    const showResults = status === "success" && totalResults > 0;

    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextTerm = event.target.value;
        const nextQueryIsReady = nextTerm.trim().length >= 2;

        setSearchTerm(nextTerm);
        setFocusedIndex(-1);
        setShowFilteredBox(true);
        setStatus(nextQueryIsReady ? "loading" : "idle");

        if (!nextQueryIsReady) {
            setTeamsData([]);
            setPlayersData([]);
        }
    };

    const retrySearch = () => {
        setFocusedIndex(-1);
        setStatus("loading");
        setRetryVersion((version) => version + 1);
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

    useEffect(() => {
        const q = searchTerm.trim();
        if (q.length < 2) {
            return;
        }

        const controller = new AbortController();
        const timeout = window.setTimeout(async () => {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
                    signal: controller.signal,
                });
                if (!res.ok) {
                    throw new Error(`Search request failed with status ${res.status}`);
                }

                const data = await res.json() as { teams?: SearchTeam[]; players?: SearchPlayer[] };
                setTeamsData(data.teams ?? []);
                setPlayersData(data.players ?? []);
                setStatus("success");
            } catch (error) {
                if ((error as Error).name !== "AbortError") {
                    setTeamsData([]);
                    setPlayersData([]);
                    setStatus("error");
                }
            }
        }, 180);

        return () => {
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [retryVersion, searchTerm]);

    return (
        <div className="relative flex w-full max-w-lg items-center justify-center" ref={listRef}>
            <input
                type="text"
                value={searchTerm}
                onChange={handleSearchChange}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                    if (queryIsReady) setShowFilteredBox(true);
                }}
                placeholder={t("search_placeholder")}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showSearchPanel}
                aria-controls={showSearchPanel ? (showResults ? listboxId : panelId) : undefined}
                aria-activedescendant={showResults && focusedIndex >= 0 ? `${listboxId}-option-${focusedIndex}` : undefined}
                aria-busy={status === "loading"}
                className="w-full rounded-xl border border-gray-200 bg-gray-100 px-3 py-2.5 text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            {showSearchPanel && (
                <div
                    id={panelId}
                    className="absolute left-0 top-full z-[100] mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl shadow-slate-900/10 dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/30"
                >
                    {status === "loading" && (
                        <div role="status" className="flex min-h-16 items-center gap-3 px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-500 dark:border-gray-700 dark:border-t-emerald-400" aria-hidden="true" />
                            <span>{t("search_loading")}</span>
                        </div>
                    )}

                    {status === "error" && (
                        <div role="alert" className="flex min-h-16 items-center justify-between gap-3 px-4 py-3">
                            <span className="min-w-0 text-sm text-rose-600 dark:text-rose-300">{t("search_error")}</span>
                            <button
                                type="button"
                                onClick={retrySearch}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-emerald-500/50 hover:text-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-gray-700 dark:text-gray-400"
                                title={t("retry_search")}
                                aria-label={t("retry_search")}
                            >
                                <ArrowPathIcon className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>
                    )}

                    {status === "success" && totalResults === 0 && (
                        <div role="status" className="flex min-h-16 items-center gap-3 px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            <MagnifyingGlassIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                            <span>{t("search_empty")}</span>
                        </div>
                    )}

                    {showResults && (
                        <div id={listboxId} role="listbox">
                            {filteredTeams.length > 0 && (
                                <div className="px-3 pb-1 pt-2 text-xs uppercase tracking-wider text-gray-500">{t("teams")}</div>
                            )}
                            {filteredTeams.map((team, i) => (
                                <Link
                                    href={`/team/${team.id}`}
                                    prefetch={false}
                                    key={team.id}
                                    id={`${listboxId}-option-${i}`}
                                    role="option"
                                    aria-selected={i === focusedIndex}
                                    className={`flex items-center gap-2 px-3 py-2 text-gray-900 transition-colors hover:bg-gray-100 dark:text-white dark:hover:bg-gray-800 ${i === focusedIndex ? "bg-gray-100 dark:bg-gray-800" : ""}`}
                                    onClick={() => {
                                        setSearchTerm("");
                                        setShowFilteredBox(false);
                                        setStatus("idle");
                                    }}
                                >
                                    <TeamLogo teamId={team.id} alt={team.name} size={24} className="object-contain" style={{ width: "24px", height: "24px" }} />
                                    <span className="min-w-0 truncate text-sm">{team.name}</span>
                                </Link>
                            ))}
                            {filteredPlayers.length > 0 && (
                                <div className="px-3 pb-1 pt-2 text-xs uppercase tracking-wider text-gray-500">{t("players")}</div>
                            )}
                            {filteredPlayers.map((player, i) => (
                                <Link
                                    href={`/player/${player.id}`}
                                    prefetch={false}
                                    key={player.id}
                                    id={`${listboxId}-option-${i + filteredTeams.length}`}
                                    role="option"
                                    aria-selected={i + filteredTeams.length === focusedIndex}
                                    className={`flex items-center gap-2 px-3 py-2 text-gray-900 transition-colors hover:bg-gray-100 dark:text-white dark:hover:bg-gray-800 ${i + filteredTeams.length === focusedIndex ? "bg-gray-100 dark:bg-gray-800" : ""}`}
                                    onClick={() => {
                                        setSearchTerm("");
                                        setShowFilteredBox(false);
                                        setStatus("idle");
                                    }}
                                >
                                    <Image src={playerImageUrl(player.id)} alt={player.name} width={24} height={24} className="rounded-full object-contain" style={{ width: "24px", height: "24px" }} />
                                    <div className="flex min-w-0 flex-col">
                                        <span className="truncate text-sm">{player.name}</span>
                                        <span className="truncate text-xs text-gray-500">{player.team}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}