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
                GoalSaves: stat.goals.saves,
                GoalsConceded: stat.goals.conceded,
                PenaltySaved: stat.penalty.saved,
            };
        }
        if (position === "Defender") {
            return {
                TotalTackles: stat.tackles.total,
                TotalBlocks: stat.tackles.blocks,
                Interceptions: stat.tackles.interceptions,
                TotalDuels: stat.duels.total,
                DuelsWon: stat.duels.won,
                PenaltyCommited: stat.penalty.commited,
            };
        }
        if (position === "Midfielder") {
            return {
                TotalPasses: stat.passes.total,
                KeyPasses: stat.passes.key,
                PassAccuracy: stat.passes.accuracy,
                TotalDribbles: stat.dribbles.attempts,
                DribblesSuccess: stat.dribbles.success,
                DribblesPast: stat.dribbles.past,
            };
        }
        if (position === "Attacker") {
            return {
                TotalShots: stat.shots.total,
                ShotsOnTarget: stat.shots.on,
                PenaltyScored: stat.penalty.scored,
                PenaltyMissed: stat.penalty.missed,
                TotalDribbles: stat.dribbles.attempts,
                DribblesSuccess: stat.dribbles.success,
            };
        }
        return {
            null: "N/A"
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
                                <p className="text-lg font-bold text-gray-300 text-center">
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
                                            [
                                                { label: "Matches", value: player.statistics[0]?.games.appearences },
                                                { label: "Goals", value: player.statistics[0]?.goals.total },
                                                { label: "Assists", value: player.statistics[0]?.goals.assists },
                                                {
                                                    label: "Rating",
                                                    value: player.statistics[0]?.games.rating
                                                        ? parseFloat(String(player.statistics[0]?.games.rating)).toFixed(2)
                                                        : "N/A",
                                                    className: getRatingColor(parseFloat(String(player.statistics[0]?.games.rating || 0))),
                                                }
                                            ].map((stat, index) => (
                                                <div key={index} className="flex flex-col items-center">
                                                    <p className="text-sm text-gray-400">
                                                        {stat.label}
                                                    </p>
                                                    <p className={`text-xl font-bold ${stat.className || "text-red-400"}`}>
                                                        {stat.value || "N/A"}
                                                    </p>
                                                </div>
                                            ))
                                        }
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        {
                                            [
                                                { label: "Appearances", value: player.statistics[0]?.games.appearences },
                                                { label: "Lineups", value: player.statistics[0]?.games.lineups },
                                                { label: "Minutes", value: player.statistics[0]?.games.minutes },
                                                { label: "Substitutes In", value: player.statistics[0]?.substitutes.in },
                                                { label: "Substitutes Out", value: player.statistics[0]?.substitutes.out },
                                                { label: "Bench", value: player.statistics[0]?.substitutes.bench }
                                            ].map((stat, index) => (
                                                <div key={index} className="flex flex-col items-center">
                                                    <p className="text-sm text-gray-400">
                                                        {stat.label}
                                                    </p>
                                                    <p className="text-xl font-bold text-yellow-400">
                                                        {stat.value || "N/A"}
                                                    </p>
                                                </div>
                                            ))
                                        }
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        {
                                            [
                                                { label: "Fouls Drawn", value: player.statistics[0]?.fouls.drawn },
                                                { label: "Fouls Committed", value: player.statistics[0]?.fouls.committed },
                                            ].map((stat, index) => (
                                                <div key={index} className="flex flex-col items-center">
                                                    <p className="text-sm text-gray-400">
                                                        {stat.label}
                                                    </p>
                                                    <p className="text-xl font-bold text-cyan-400">
                                                        {stat.value || "N/A"}
                                                    </p>
                                                </div>
                                            ))
                                        }
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        {
                                            [
                                                { label: "Yellow Cards", value: player.statistics[0]?.cards.yellow },
                                                { label: "Yellow-Red Cards", value: player.statistics[0]?.cards.yellowred },
                                                { label: "Red Cards", value: player.statistics[0]?.cards.red },
                                            ].map((stat, index) => (
                                                <div key={index} className="flex flex-col items-center">
                                                    <p className="text-sm text-gray-400">
                                                        {stat.label}
                                                    </p>
                                                    <p className="text-xl font-bold text-cyan-400">
                                                        {stat.value || "N/A"}
                                                    </p>
                                                </div>
                                            ))
                                        }
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        {
                                            Object.entries(filterStatsByPosition(player.position, player.statistics[0])).map(([key, value], index) => (
                                                <div
                                                    key={index}
                                                    className="flex flex-col items-center"
                                                >
                                                    <p className="text-sm text-gray-400">
                                                        {key.replace(/([A-Z])/g, " $1")}
                                                    </p>
                                                    <p className="text-xl font-bold text-green-400">
                                                        {value || "N/A"}
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
                                    <div className="grid grid-cols-4 gap-4">
                                        {
                                            [
                                                { label: "Matches", value: stat.games.appearences },
                                                { label: "Goals", value: stat.goals.total },
                                                { label: "Assists", value: stat.goals.assists },
                                                {
                                                    label: "Rating",
                                                    value: stat.games.rating
                                                        ? parseFloat(String(stat.games.rating)).toFixed(2)
                                                        : "N/A",
                                                    className: getRatingColor(parseFloat(String(stat.games.rating || 0))),
                                                }
                                            ].map((stat, index) => (
                                                <div key={index} className="flex flex-col items-center">
                                                    <p className="text-sm text-gray-400">
                                                        {stat.label}
                                                    </p>
                                                    <p className={`text-xl font-bold ${stat.className || "text-red-400"}`}>
                                                        {stat.value || "N/A"}
                                                    </p>
                                                </div>
                                            ))
                                        }
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        {
                                            [
                                                { label: "Appearances", value: stat.games.appearences },
                                                { label: "Lineups", value: stat.games.lineups },
                                                { label: "Minutes", value: stat.games.minutes },
                                                { label: "Substitutes In", value: stat.substitutes.in },
                                                { label: "Substitutes Out", value: stat.substitutes.out },
                                                { label: "Bench", value: stat.substitutes.bench }
                                            ].map((stat, index) => (
                                                <div key={index} className="flex flex-col items-center">
                                                    <p className="text-sm text-gray-400">
                                                        {stat.label}
                                                    </p>
                                                    <p className="text-xl font-bold text-yellow-400">
                                                        {stat.value || "N/A"}
                                                    </p>
                                                </div>
                                            ))
                                        }
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        {
                                            [
                                                { label: "Fouls Drawn", value: stat.fouls.drawn },
                                                { label: "Fouls Committed", value: stat.fouls.committed },
                                            ].map((stat, index) => (
                                                <div key={index} className="flex flex-col items-center">
                                                    <p className="text-sm text-gray-400">
                                                        {stat.label}
                                                    </p>
                                                    <p className="text-xl font-bold text-cyan-400">
                                                        {stat.value || "N/A"}
                                                    </p>
                                                </div>
                                            ))
                                        }
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        {
                                            [
                                                { label: "Yellow Cards", value: stat.cards.yellow },
                                                { label: "Yellow-Red Cards", value: stat.cards.yellowred },
                                                { label: "Red Cards", value: stat.cards.red },
                                            ].map((stat, index) => (
                                                <div key={index} className="flex flex-col items-center">
                                                    <p className="text-sm text-gray-400">
                                                        {stat.label}
                                                    </p>
                                                    <p className="text-xl font-bold text-cyan-400">
                                                        {stat.value || "N/A"}
                                                    </p>
                                                </div>
                                            ))
                                        }
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        {
                                            Object.entries(filterStatsByPosition(player.position, stat)).map(([key, value], index) => (
                                                <div
                                                    key={index}
                                                    className="flex flex-col items-center"
                                                >
                                                    <p className="text-sm text-gray-400">
                                                        {key.replace(/([A-Z])/g, " $1")}
                                                    </p>
                                                    <p className="text-xl font-bold text-green-400">
                                                        {value || "N/A"}
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