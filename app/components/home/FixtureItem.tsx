"use client";
import moment from "moment";
import Link from "next/link";
import Image from "next/image";

import { Fixture } from "@/types";
import LocalTime from "../LocalTime";

type PageProps = {
    match: Fixture,
    index: number
}

export default function FixtureItem({ match, index } : PageProps) {
    const today = moment();
    const matchDate = moment(match.fixture.date);

    if (today.isAfter(matchDate)) {
        return null;
    }

    return (
        <Link
            href={`/match/${match.fixture.id}`}
            key={match.fixture.id}
            className={`flex w-full p-4 justify-between items-center h-32 hover:bg-blue-800/50 ${index % 2 === 0 ? "bg-black/40" : ""} animated-div`}
        >
            <div className="flex-1 flex flex-col justify-center items-center text-center">
                <div className="w-20 h-20 flex justify-center items-center overflow-hidden">
                    <Image
                        src={match.teams.home.logo}
                        alt="HomeLogo"
                        width={70}
                        height={70}
                        className="object-contain"
                        style={{ width: "70px", height: "70px" }}
                    />
                </div>
                <span>
                    {match.teams.home.name}
                </span>
            </div>
            <div className="flex-1 flex flex-col justify-center items-center h-full">
                <div className="h-1/3 text-xs text-center">
                    <LocalTime 
                        fixture={match}
                    />
                </div>
                <div className="h-1/3 text-center">
                    vs
                </div>
                <div className="h-1/3"></div>
            </div>
            <div className="flex-1 flex flex-col justify-center items-center text-center">
                <div className="w-20 h-20 flex justify-center items-center overflow-hidden">
                    <Image
                        src={match.teams.away.logo}
                        alt="AwayLogo"
                        width={70}
                        height={70}
                        className="object-contain"
                        style={{ width: "70px", height: "70px" }}
                    />
                </div>
                <span>
                    {match.teams.away.name}
                </span>
            </div>
        </Link>
    )
}