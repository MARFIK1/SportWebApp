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
        Number(squadNumber)
    )

    const clubStats = player.statistics.filter((stat) => stat.team?.id && stat.league.country !== "World" || ["UEFA Champions League", "UEFA Europa League", "UEFA Europa Conference League", "Friendlies Clubs", "Premier League International Cup"].includes(stat.league.name));
    const nationalTeamStats = player.statistics.filter((stat) => stat.league.country === "World" && !["UEFA Champions League", "UEFA Europa League", "UEFA Europa Conference League", "Friendlies Clubs", "Premier League International Cup"].includes(stat.league.name));             
    const uniqueClubStats = Array.from(new Map(clubStats.map(stat => [stat.league.id, stat])).values());
    const uniqueNationalTeamStats = Array.from(new Map(nationalTeamStats.map(stat => [stat.league.id, stat])).values());

    const filterStatsByPosition = (position: string, stat: any) => {
        const formatValue = (value: any): any => {
            if (typeof value === "string") {
                return value !== "N/A" ? value : 0;
            }
            return value !== undefined && value !== null ? value : 0;
        }
    
        if (position === "Goalkeeper") {
            return {
                GoalSaves: formatValue(stat.goals.saves),
                GoalsConceded: formatValue(stat.goals.conceded),
                PenaltySaved: formatValue(stat.penalty.saved)
            };
        }
        if (position === "Defender") {
            return {
                TotalTackles: formatValue(stat.tackles.total),
                TotalBlocks: formatValue(stat.tackles.blocks),
                Interceptions: formatValue(stat.tackles.interceptions),
                TotalDuels: formatValue(stat.duels.total),
                DuelsWon: formatValue(stat.duels.won),
                PenaltyCommited: formatValue(stat.penalty.commited)
            };
        }
        if (position === "Midfielder") {
            return {
                TotalPasses: formatValue(stat.passes.total),
                KeyPasses: formatValue(stat.passes.key),
                PassAccuracy: stat.passes.accuracy && stat.passes.accuracy > 0 ? `${stat.passes.accuracy}%` : "N/A",
                TotalDribbles: formatValue(stat.dribbles.attempts),
                DribblesSuccess: formatValue(stat.dribbles.success),
                DribblesPast: formatValue(stat.dribbles.past)
            };
        }
        if (position === "Attacker") {
            return {
                TotalShots: formatValue(stat.shots.total),
                ShotsOnTarget: formatValue(stat.shots.on),
                PenaltyScored: formatValue(stat.penalty.scored),
                PenaltyMissed: formatValue(stat.penalty.missed),
                TotalDribbles: formatValue(stat.dribbles.attempts),
                DribblesSuccess: formatValue(stat.dribbles.success)
            };
        }
        return {
            null: 0,
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
                                width={178}
                                height={178}
                                className="rounded-full object-contain w-1/3"
                            />
                            <div className="text-3xl font-bold mt-4 text-gray-300">
                                {`${player.firstname} ${player.lastname}`}
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-6 items-center">
                            <div className="flex flex-col items-center">
                                <Image
                                    src={player.statistics[0]?.team.logo}
                                    alt={`${player.statistics[0]?.team.name || "Club"} logo`}
                                    width={50}
                                    height={50}
                                    className="object-contain"
                                    style={{ width: "50px", height: "50px" }}
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
                            uniqueClubStats.map((stat, index) => (
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
                                                    value: stat.games.rating && !isNaN(parseFloat(stat.games.rating)) ? parseFloat(stat.games.rating).toFixed(2) : "N/A",
                                                    className: getRatingColor(parseFloat(stat.games.rating || "0")),
                                                }
                                            ].map((detail, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex flex-col items-center"
                                                >
                                                    <p className="text-sm text-gray-400">
                                                        {detail.label}
                                                    </p>
                                                    <p className={`text-xl font-bold ${detail.className || "text-red-400"}`}>
                                                        {detail.value || "0"}
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
                                            ].map((detail, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex flex-col items-center"
                                                >
                                                    <p className="text-sm text-gray-400">
                                                        {detail.label}
                                                    </p>
                                                    <p className="text-xl font-bold text-yellow-400">
                                                        {detail.value || "0"}
                                                    </p>
                                                </div>
                                            ))
                                        }
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        {
                                            [
                                                { label: "Fouls Drawn", value: stat.fouls.drawn },
                                                { label: "Fouls Committed", value: stat.fouls.committed }
                                            ].map((detail, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex flex-col items-center"
                                                >
                                                    <p className="text-sm text-gray-400">
                                                        {detail.label}
                                                    </p>
                                                    <p className="text-xl font-bold text-cyan-400">
                                                        {detail.value || "0"}
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
                                                { label: "Red Cards", value: stat.cards.red }
                                            ].map((detail, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex flex-col items-center"
                                                >
                                                    <p className="text-sm text-gray-400">
                                                        {detail.label}
                                                    </p>
                                                    <p className="text-xl font-bold text-cyan-400">
                                                        {detail.value || "0"}
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
                                                        {value !== "N/A" ? value : "0"}
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
                            uniqueNationalTeamStats.map((stat, index) => (
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
                                                    value: stat.games.rating && !isNaN(parseFloat(stat.games.rating)) ? parseFloat(stat.games.rating).toFixed(2) : "N/A",
                                                    className: getRatingColor(parseFloat(stat.games.rating || "0")),
                                                }
                                            ].map((statDetail, idx) => {
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="flex flex-col items-center"
                                                    >
                                                        <p className="text-sm text-gray-400">
                                                            {statDetail.label}
                                                        </p>
                                                        <p className={`text-xl font-bold ${statDetail.className || "text-red-400"}`}>
                                                            {statDetail.value || "0"}
                                                        </p>
                                                    </div>
                                                );
                                            })
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
                                                <div
                                                    key={index}
                                                    className="flex flex-col items-center"
                                                >
                                                    <p className="text-sm text-gray-400">
                                                        {stat.label}
                                                    </p>
                                                    <p className="text-xl font-bold text-yellow-400">
                                                        {stat.value || "0"}
                                                    </p>
                                                </div>
                                            ))
                                        }
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        {
                                            [
                                                { label: "Fouls Drawn", value: stat.fouls.drawn },
                                                { label: "Fouls Committed", value: stat.fouls.committed }
                                            ].map((stat, index) => (
                                                <div
                                                    key={index}
                                                    className="flex flex-col items-center"
                                                >
                                                    <p className="text-sm text-gray-400">
                                                        {stat.label}
                                                    </p>
                                                    <p className="text-xl font-bold text-cyan-400">
                                                        {stat.value || "0"}
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
                                                { label: "Red Cards", value: stat.cards.red }
                                            ].map((stat, index) => (
                                                <div
                                                    key={index}
                                                    className="flex flex-col items-center"
                                                >
                                                    <p className="text-sm text-gray-400">
                                                        {stat.label}
                                                    </p>
                                                    <p className="text-xl font-bold text-cyan-400">
                                                        {stat.value || "0"}
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