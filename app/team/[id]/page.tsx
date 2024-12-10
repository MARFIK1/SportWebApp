import moment from "moment";
import Image from "next/image";

import type { Team, Player } from "@/types";
import { fetchTeamSquad, getFixtures } from "@/app/util/fetchData";
import { getCurrentSeason } from "@/app/util/season";
import getTeamInfoByTeamId from "@/app/util/getTeamInfoByTeamId";
import Fixtures from "./components/Fixtures";
import Players from "./components/Players";

type PageProps = {
    params: {
        id: string
    }
}

export default async function Team({ params } : PageProps) {
    const teamId = parseInt(params.id);
    const season = getCurrentSeason();
    const teamInfo: Team | undefined = await getTeamInfoByTeamId(teamId, season);
    const teamPlayers: Player[] = await fetchTeamSquad(teamId);
    const fixturesByLeague = await getFixtures(season);

    const allFixtures = fixturesByLeague
        .flatMap((league) => league.fixtures)
        .filter((fixture) => fixture?.teams?.home?.id === teamId || fixture?.teams?.away?.id === teamId)
        .sort((a, b) => moment(a.fixture.date).diff(moment(b.fixture.date)));

    const teamFixtures = {
        past: allFixtures
            .filter((fixture) => moment(fixture.fixture.date).isBefore(moment(), "day"))
            .sort((a, b) => moment(b.fixture.date).diff(moment(a.fixture.date))),
        future: allFixtures
            .filter((fixture) => moment(fixture.fixture.date).isSameOrAfter(moment(), "day"))
            .sort((a, b) => moment(a.fixture.date).diff(moment(b.fixture.date)))
    }        

    if (!teamInfo) {
        return (
            <div className="flex w-full justify-center items-center py-5">
                <div className="text-neutral-100">
                    Info about team not found
                </div>
            </div>
        )
    }

    return (
        <div className="flex justify-center items-center min-h-screen text-neutral-100 py-5">
            <div className="flex max-w-7xl w-full flex-col md:flex-row">
                <div className="flex flex-col w-full md:w-4/7 p-5">
                    <div className="bg-gradient-to-b from-gray-900/100 to-black/50 p-6 rounded-lg mb-6 text-center">
                        <div className="flex flex-col items-center mb-6">
                            <Image
                                src={teamInfo.team.logo}
                                alt="Team Logo"
                                width={120}
                                height={120}
                                className="mb-4"
                            />
                            <div className="text-3xl font-bold">
                                {teamInfo.team.name}
                            </div>
                        </div>
                        <div className="grid grid-cols-4 gap-6 mb-8">
                            <div className="flex flex-col items-center">
                                <p className="text-sm text-gray-400">
                                    Rank
                                </p>
                                <p className="text-2xl font-bold text-yellow-400">
                                    #{teamInfo.rank}
                                </p>
                            </div>
                            <div className="flex flex-col items-center">
                                <p className="text-sm text-gray-400">
                                    Played
                                </p>
                                <p className="text-2xl font-bold text-green-400">
                                    {teamInfo.all.played}
                                </p>
                            </div>
                            <div className="flex flex-col items-center">
                                <p className="text-sm text-gray-400">
                                    League
                                </p>
                                <p className="text-xl font-semibold">
                                    {teamInfo.group}
                                </p>
                            </div>
                            <div className="flex flex-col items-center">
                                <p className="text-sm text-gray-400">
                                    Form
                                </p>
                                <div className="flex gap-1">
                                    {
                                        teamInfo.form?.split("").map((char, i) => (
                                            <span
                                                key={i}
                                                className={`w-4 h-4 rounded-full ${char === "W" ? "bg-green-500" : char === "D" ? "bg-gray-500" : "bg-red-500"}`}
                                            >
                                            </span>
                                        ))
                                    }
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-6 mb-8">
                            <div className="flex flex-col items-center">
                                <p className="text-sm text-gray-400">
                                    Wins
                                </p>
                                <p className="text-3xl font-bold text-blue-400">
                                    {teamInfo.all.win}
                                </p>
                            </div>
                            <div className="flex flex-col items-center">
                                <p className="text-sm text-gray-400">
                                    Draws
                                </p>
                                <p className="text-3xl font-bold text-yellow-400">
                                    {teamInfo.all.draw}
                                </p>
                            </div>
                            <div className="flex flex-col items-center">
                                <p className="text-sm text-gray-400">
                                    Losses
                                </p>
                                <p className="text-3xl font-bold text-red-400">
                                    {teamInfo.all.lose}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-6">
                            <div className="flex flex-col items-center">
                                <p className="text-sm text-gray-400">
                                    Goals For
                                </p>
                                <p className="text-3xl font-bold text-purple-400">
                                    {teamInfo.all.goals.for}
                                </p>
                            </div>
                            <div className="flex flex-col items-center">
                                <p className="text-sm text-gray-400">
                                    Goals Against
                                </p>
                                <p className="text-3xl font-bold text-orange-400">
                                    {teamInfo.all.goals.against}
                                </p>
                            </div>
                            <div className="flex flex-col items-center">
                                <p className="text-sm text-gray-400">
                                    GD
                                </p>
                                <p className="text-3xl font-bold text-teal-400">
                                    {teamInfo.goalsDiff}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gradient-to-b from-gray-900/100 to-black/50 p-6 rounded-lg">
                        <Players 
                            players={teamPlayers}
                        />
                    </div>
                </div>
                <div className="flex flex-col w-full md:w-3/7 p-5">
                    <Fixtures
                        fixturesByTeamId={teamFixtures.future}
                        pastFixtures={teamFixtures.past}
                        teamId={teamId}
                        showFullNames={true}
                    />
                </div>
            </div>
        </div>
    )
}