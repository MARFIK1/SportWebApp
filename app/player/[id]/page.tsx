import Image from "next/image";

import { fetchPlayerDetails } from "@/app/util/fetchData";
import { getCurrentSeason } from "@/app/util/season";
import type { PlayerExtended } from "@/types";
import FlagImage from "@/app/components/FlagImage";
import ScrollToTop from "@/app/components/ScrollToTop";

type PageProps = {
    params: {
        id: string
    }
    searchParams: {
        number?: string
    }
}

function getRatingColor(rating: number): string {
    if (rating >= 9.0) return "text-green-500";
    if (rating >= 8.0) return "text-green-400";
    if (rating >= 7.0) return "text-yellow-400";
    if (rating >= 6.0) return "text-yellow-500";
    if (rating >= 5.0) return "text-orange-400";
    return "text-red-500";
}

export default async function PlayerPage({ params, searchParams } : PageProps) {
    const playerId = params.id;
    const squadNumber = searchParams.number;
    const season = getCurrentSeason();

    const player: PlayerExtended = await fetchPlayerDetails(
        playerId,
        season,
        Number(squadNumber),
    )

    const clubStats = player.statistics.filter((stat) => stat.league.country !== "World" || ["UEFA Champions League", "UEFA Europa League", "UEFA Europa Conference League", "Friendlies Clubs", "Premier League International Cup"].includes(stat.league.name));
    const nationalTeamStats = player.statistics.filter((stat) => stat.league.country === "World" && !["UEFA Champions League", "UEFA Europa League", "UEFA Europa Conference League", "Friendlies Clubs", "Premier League International Cup"].includes(stat.league.name));          

    const filterStatsByPosition = (position: string, stat: any) => {
        if (position === "Goalkeeper") {
            return {
                saves: stat.goals.saves,
                conceded: stat.goals.conceded,
                minutes: stat.games.minutes,
                appearances: stat.games.appearences,
                rating: stat.games.rating,
            };
        }
        if (position === "Defender") {
            return {
                tackles: stat.tackles.total,
                interceptions: stat.tackles.interceptions,
                blocks: stat.tackles.blocks,
                duelsWon: stat.duels.won,
                appearances: stat.games.appearences,
                minutes: stat.games.minutes,
            };
        }
        if (position === "Midfielder") {
            return {
                assists: stat.goals.assists,
                keyPasses: stat.passes.key,
                totalPasses: stat.passes.total,
                duelsWon: stat.duels.won,
                appearances: stat.games.appearences,
                minutes: stat.games.minutes,
            };
        }
        if (position === "Attacker") {
            return {
                goals: stat.goals.total,
                shotsOnTarget: stat.shots.on,
                dribbles: stat.dribbles.success,
                totalShots: stat.shots.total,
                appearances: stat.games.appearences,
                minutes: stat.games.minutes,
            };
        }
        return {
            appearances: stat.games.appearences,
            minutes: stat.games.minutes,
            rating: stat.games.rating,
        };
    }

    return (
        <div className="flex flex-col items-center min-h-screen text-neutral-100 py-5">
            <ScrollToTop />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-9xl w-full px-10">
                    <div className="bg-gradient-to-b from-gray-900/100 to-black/50 p-10 rounded-lg custom-width text-center">
                        <div className="flex flex-col items-center mb-6">
                            <Image
                                src={player.photo}
                                alt={`${player.firstname} ${player.lastname} photo`}
                                width={200}
                                height={200}
                                className="rounded-full"
                            />
                            <div className="text-3xl font-bold mt-4 text-gray-300">
                                {`${player.firstname} ${player.lastname}`}
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-6 items-center">
                            <div className="flex flex-col items-center">
                                <Image
                                    src={player.statistics[0]?.team.logo || "/default-logo.png"}
                                    alt={`${player.statistics[0]?.team.name || "Club"} logo`}
                                    width={50}
                                    height={50}
                                    className="object-contain"
                                />
                                <p className="text-lg font-bold text-yellow-400 text-center">
                                    {player.statistics[0]?.team.name || "Unknown"}
                                </p>
                            </div>
                            <div className="flex flex-col items-center">
                                <FlagImage
                                    countryCode={player.nationality?.toLowerCase() || "default"}
                                    alt={`${player.nationality || "Unknown"} flag`}
                                />
                                <p className="text-lg text-gray-400">
                                    {player.nationality}
                                </p>
                            </div>
                            <div className="flex flex-col items-center">
                                <p className="text-sm text-gray-400">
                                    Birthplace
                                </p>
                                <p className="text-lg text-center text-gray-300">
                                    {`${player.birth.place || "Unknown"}, ${player.birth.country || "Unknown"}`}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                                <p className="text-sm text-gray-400">
                                    Age
                                </p>
                                <p className="text-xl font-bold text-green-400">
                                    {player.age}
                                </p>
                                <p className="text-sm text-gray-400">
                                    ({player.birth.date})
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-400">
                                    Height
                                </p>
                                <p className="text-xl font-bold text-blue-400">
                                    {player.height || "N/A"}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-400">
                                    Weight
                                </p>
                                <p className="text-xl font-bold text-purple-400">
                                    {player.weight || "N/A"}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                                <p className="text-sm text-gray-400">
                                    Injured
                                </p>
                                <p className="text-xl font-bold text-red-400">
                                    {player.injured ? "Yes" : "No"}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-400">
                                    Number
                                </p>
                                <p className="text-xl font-bold text-yellow-400">
                                    {player.number || "N/A"}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-400">
                                    Position
                                </p>
                                <p className="text-xl font-bold text-teal-400">
                                    {player.position || "N/A"}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gradient-to-b from-gray-900/100 to-black/50 p-10 rounded-lg custom-width">
                        <h2 className="text-2xl font-bold mb-4 text-center text-gray-300">
                            Club Statistics
                        </h2>
                        {
                            clubStats.map((stat, index) => (
                                <div 
                                    key={index}
                                    className="mb-6 text-center"
                                >
                                    <div className="flex items-center justify-center mb-6">
                                        <Image
                                            src={stat.league.logo}
                                            alt={`${stat.league.name} logo`}
                                            width={30}
                                            height={30}
                                            className="mr-2"
                                        />
                                        <h3 className="text-lg font-bold text-yellow-400">
                                            {stat.league.name}
                                        </h3>
                                    </div>
                                    <div className="grid grid-cols-4 gap-4">
                                        {
                                            Object.entries(filterStatsByPosition(player.position, stat)).map(([key, value]) => (
                                                <div 
                                                    key={key}
                                                >
                                                    <p className="text-sm text-gray-400">
                                                        {key.replace(/([A-Z])/g, " $1")}
                                                    </p>
                                                    <p className="text-xl font-bold text-green-400">
                                                        {value}
                                                    </p>
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                    <div className="bg-gradient-to-b from-gray-900/100 to-black/50 p-10 rounded-lg custom-width">
                        <h2 className="text-2xl font-bold mb-4 text-center text-gray-300">
                            National Team Statistics
                        </h2>
                        {
                            nationalTeamStats.map((stat, index) => (
                                <div 
                                    key={index}
                                    className="mb-6 text-center"
                                >
                                    <div className="flex items-center justify-center mb-6">
                                        <Image
                                            src={stat.league.logo}
                                            alt={`${stat.league.name} logo`}
                                            width={30}
                                            height={30}
                                            className="mr-2"
                                        />
                                        <h3 className="text-lg font-bold text-yellow-400">
                                            {stat.league.name}
                                        </h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        {
                                            Object.entries(filterStatsByPosition(player.position, stat)).map(([key, value]) => (
                                                <div 
                                                    key={key}
                                                >
                                                    <p className="text-sm text-gray-400">
                                                        {key.replace(/([A-Z])/g, " $1")}
                                                    </p>
                                                    <p className="text-xl font-bold text-green-400">
                                                        {value}
                                                    </p>
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </div>
        </div>
    )
}