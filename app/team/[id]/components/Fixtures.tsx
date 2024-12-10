"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

import { Fixture } from "@/types";
import LocalTime from "@/app/components/LocalTime";

type PageProps = {
    fixturesByTeamId: Fixture[],
    pastFixtures: Fixture[],
    teamId: number,
    showFullNames?: boolean
};

export default function Fixtures({ fixturesByTeamId, pastFixtures, showFullNames = false } : PageProps) {
    const [visibleMatchResultsCount, setVisibleMatchResultsCount] = useState(5);
    const maxFixtures = 7;
    const upcomingFixtures = fixturesByTeamId.slice(0, maxFixtures);
    const visibleMatchResults = pastFixtures.slice(0, visibleMatchResultsCount);

    const handleShowMoreResults = () => {
        setVisibleMatchResultsCount((prevCount) => prevCount + 5);
    }

    return (
        <div className="flex flex-col w-full justify-start items-center text-neutral-100">
            <div className="flex flex-col w-full bg-gradient-to-b from-gray-900/100 to-black/50 rounded-3xl p-4 mb-4">
                <div className="w-full text-center p-2 font-bold text-lg">
                    Upcoming Matches
                </div>
                <div className="flex flex-col w-full">
                    {
                        upcomingFixtures.map((fixture) => (
                            <Link
                                href={`/match/${fixture.fixture.id}`}
                                key={fixture.fixture.id}
                                className="flex items-center justify-between w-full h-20 p-3 bg-gradient-to-b from-gray-700/50 to-black/25 hover:bg-blue-800/50 rounded-md mb-2"
                            >
                                <div className="flex items-center w-1/3">
                                    <Image
                                        src={fixture.teams.home.logo}
                                        alt={`${fixture.teams.home.name} Logo`}
                                        width={40}
                                        height={40}
                                        className="w-[40px] h-[40px] object-contain"
                                    />
                                    <span className={`ml-3 text-sm ${showFullNames ? "" : "truncate max-w-[100px]"}`}>
                                        {fixture.teams.home.name}
                                    </span>
                                </div>
                                <div className="w-1/3 text-center text-sm">
                                    <div className="text-xs text-gray-400">
                                        {fixture.league.name}
                                    </div>
                                    <LocalTime
                                        fixture={fixture}
                                    />
                                </div>
                                <div className="flex items-center w-1/3 justify-end">
                                    <span className={`mr-3 text-sm ${showFullNames ? "" : "truncate max-w-[100px]"} text-right`}>
                                        {fixture.teams.away.name}
                                    </span>
                                    <Image
                                        src={fixture.teams.away.logo}
                                        alt={`${fixture.teams.away.name} Logo`}
                                        width={40}
                                        height={40}
                                        className="w-[40px] h-[40px] object-contain"
                                    />
                                </div>
                            </Link>
                        ))
                    }
                </div>
            </div>
            <div className="flex flex-col w-full bg-gradient-to-b from-gray-900/100 to-black/50 rounded-3xl p-4">
                <div className="w-full text-center p-2 font-bold text-lg">
                    Match Results
                </div>
                <div className="flex flex-col w-full">
                    {
                        visibleMatchResults.map((fixture) => (
                            <Link
                                href={`/match/${fixture.fixture.id}`}
                                key={fixture.fixture.id}
                                className="flex items-center justify-between w-full h-20 p-3 bg-gradient-to-b from-gray-700/50 to-black/25 hover:bg-blue-800/50 rounded-md mb-2"
                            >
                                <div className="flex items-center w-1/3">
                                    <Image
                                        src={fixture.teams.home.logo}
                                        alt={`${fixture.teams.home.name} Logo`}
                                        width={40}
                                        height={40}
                                        className="w-[40px] h-[40px] object-contain"
                                    />
                                    <span className={`ml-3 text-sm ${showFullNames ? "" : "truncate max-w-[100px]"}`}>
                                        {fixture.teams.home.name}
                                    </span>
                                </div>
                                <div className="w-1/3 text-center text-sm">
                                    <div className="text-xs text-gray-400">
                                        {fixture.league.name}
                                    </div>
                                    {fixture.score.fulltime.home} - {fixture.score.fulltime.away}
                                </div>
                                <div className="flex items-center w-1/3 justify-end">
                                    <span className={`mr-3 text-sm ${showFullNames ? "" : "truncate max-w-[100px]"} text-right`}>
                                        {fixture.teams.away.name}
                                    </span>
                                    <Image
                                        src={fixture.teams.away.logo}
                                        alt={`${fixture.teams.away.name} Logo`}
                                        width={40}
                                        height={40}
                                        className="w-[40px] h-[40px] object-contain"
                                    />
                                </div>
                            </Link>
                        ))
                    }
                </div>
                {
                    visibleMatchResultsCount < pastFixtures.length && (
                        <div className="flex justify-center mt-4">
                            <button
                                onClick={handleShowMoreResults}
                                className="bg-gradient-to-b from-gray-800/100 to-black/25 p-2 px-4 rounded-lg hover:bg-blue-800/50"
                            >
                                Show More
                            </button>
                        </div>
                    )
                }
            </div>
        </div>
    )
}