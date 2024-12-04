"use client"
import { Fixture } from "@/types"
import moment from "moment"
import Link from "next/link"

type PageProps = {
    fixturesByTeamId: Fixture[];
    teamId: number;
}

export default function Fixtures({
    fixturesByTeamId,
    teamId
}: PageProps) {

    const today = moment().format("YYYY-MM-DD");
    const fixturesDone = fixturesByTeamId.filter(fixture => {
        const fixtureDate = moment(fixture.fixture.date).format("YYYY-MM-DD");
        return fixtureDate < today;
    })

    const fixturesToday = fixturesByTeamId.filter(fixture => {
        const fixtureDate = moment(fixture.fixture.date).format("YYYY-MM-DD");
        return fixtureDate === today;
    })

    const fixturesFuture = fixturesByTeamId.filter(fixture => {
        const fixtureDate = moment(fixture.fixture.date).format("YYYY-MM-DD");
        return fixtureDate > today;
    })

    const firstItemsFixturesFuture = fixturesFuture.slice(0, 5);

    return (
        <div className="flex flex-col w-full justify-center items-center text-neutral-100">
            <div className="flex flex-col w-full justify-center items-center">
                <div className="flex w-full justify-center items-center p-2 bg-gradient-to-b from-gray-700/80 to-black/50">
                    Upcoming Matches
                </div>
                <div className="flex items-center justify-center relative overflow-hidden w-full">
                    <button
                        className="absolute left-0 top-1/2 transform -translate-y-1/2 p-2 z-10"
                    >

                    </button>
                    <div className="flex-transition-transform duration-500 w-full">
                        {
                            firstItemsFixturesFuture.map((fixture, i) => (
                                <Link
                                    href={`/match/${fixture.fixture.id}`}
                                    key={fixture.fixture.id}
                                    className="w-full flex-shrink-0 flex text-neutral-100 items-center h-36 bg-gradient-to-r from-black/90 to-black/40 hover:bg-gray-500"
                                >
                                    <div className="flex flex-col justify-center items-center w-3/12"></div>
                                    <div className="flex flex-col justify-center items-center w-1/2"></div>
                                    <div className="flex flex-col justify-center items-center w-3/12"></div>
                                </Link>
                            ))
                        }
                    </div>
                    <button
                        className="absolute right-0 top-1/2 transform -translate-y-1/2 p-2 z-10"
                    >

                    </button>
                </div>
            </div>
            <div className="flex flex-col w-full justify-center items-center"></div>
        </div>
    )
}