import Link from "next/link";
import Image from "next/image";

import { getCurrentSeason } from "@/app/util/league/season";
import { getFixtureByFixtureId } from "@/app/util/dataFetch/getFixtureByFixtureId";
import LocalTime from "@/app/components/common/LocalTime";
import ScrollToTop from "@/app/components/common/ScrollToTop";
import CountdownTimer from "@/app/components/common/CountdownTimer";
import MatchDetails from "../MatchDetails";

type PageProps = {
    params: {
        id: string
    }
}

function formatStatName(statName: string) : string {
    return statName
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderLineup(lineup: any, teamId: number) {
    const formation = lineup.formation || "Unknown";
    const players = lineup.startXI;
    const coach = lineup.coach;
    if (!players || players.length === 0) {
        return <p className="text-white">No lineup available.</p>;
    }

    const goalkeeper = players[0];
    const fieldPlayers = players.slice(1);
    const rows = formation.split("-").map(Number);
    let startIndex = 0;

    return (
        <div className="flex flex-col items-center space-y-6">
            <div className="flex flex-col items-center mb-6">
                {
                    coach?.photo && (
                        <Image
                            src={coach.photo}
                            alt={coach.name}
                            width={64}
                            height={64}
                            className="rounded-full object-cover mb-2"
                            style={{ width: "64px", height: "64px" }}
                        />
                    )
                }
                <span className="text-white text-lg">
                    {coach?.name || "Unknown Coach"}
                </span>
            </div>
            <p className="text-gray-400 text-lg mb-4">
                Formation: {formation}
            </p>
            <div className="flex flex-col items-center mb-6">
                <Link href={`/player/${goalkeeper.player.id}`}>
                    <Image
                        src={goalkeeper.player.photo || "/default-player.png"}
                        alt={goalkeeper.player.name}
                        title={goalkeeper.player.name}
                        width={64}
                        height={64}
                        className="rounded-full object-cover"
                        style={{ width: "64px", height: "64px" }}
                    />
                </Link>
                <span
                    className="text-white text-sm text-center mt-2 truncate"
                    style={{ width: "80px" }}
                >
                    {goalkeeper.player.name}
                </span>
            </div>
            {
                rows.map((count: number, rowIndex: number) => {
                    const playersInRow = fieldPlayers.slice(startIndex, startIndex + count);
                    startIndex += count;

                    return (
                        <div
                            key={rowIndex}
                            className="flex justify-center gap-x-4 mt-4"
                            style={{ width: "100%", justifyContent: "space-evenly" }}
                        >
                            {
                                playersInRow.map((player: any) => (
                                    <div
                                        key={player.player.id}
                                        className="flex flex-col items-center"
                                        style={{ width: "80px", alignItems: "center" }}
                                    >
                                        <Link href={`/player/${player.player.id}`}>
                                            <Image
                                                src={player.player.photo || "/default-player.png"}
                                                alt={player.player.name}
                                                title={player.player.name}
                                                width={64}
                                                height={64}
                                                className="rounded-full object-cover"
                                                style={{ width: "64px", height: "64px" }}
                                            />
                                        </Link>
                                        <span
                                            className="text-white text-sm text-center mt-2 truncate"
                                            style={{ width: "80px" }}
                                        >
                                            {player.player.name}
                                        </span>
                                    </div>
                                ))
                            }
                        </div>
                    )
                })
            }
        </div>
    )
}

export default async function Match({ params } : PageProps) {
    const season = getCurrentSeason();
    const fixtureByFixtureId = await getFixtureByFixtureId(parseInt(params.id), season);
    if (!fixtureByFixtureId) {
        return (
            <div className="flex w-full justify-center items-center py-5">
                <div className="flex max-w-7xl p-5 w-full md:flex-row justify-center items-center text-neutral-100">
                    No fixture found
                </div>
            </div>
        )
    }

    const { teams, fixture, score, statistics, lineups, events } = fixtureByFixtureId;
    const extraTimeScore = score.extratime && (score.extratime.home !== null || score.extratime.away !== null) ? `${score.extratime.home ?? "-"} - ${score.extratime.away ?? "-"}` : "-";

    return (
        <div className="flex flex-col w-full justify-center items-center py-10 md:p-10 text-neutral-100">
            <ScrollToTop />
                <div className="flex w-full max-w-7xl items-center justify-center perspective pb-10 md:pb-20">
                    <div
                        className={`w-1/3 flex justify-center rounded-full ${fixture.status.long === "Match Finished" ? teams.home.winner ? "logo-shadow-green" : teams.away.winner ? "logo-shadow-red" : "logo-shadow-yellow" : "logo-shadow"} animate-logo-pop-left`}
                    >
                        <Link href={`../team/${teams.home.id}`}>
                            <Image
                                src={teams.home.logo}
                                alt={`${teams.home.name} Logo`}
                                width={250}
                                height={250}
                                className="object-contain"
                                style={{ width: "250px", height: "250px" }}
                            />
                        </Link>
                    </div>
                    <div className="w-1/3 flex justify-center items-center flex-col h-56">
                        <div className="flex flex-row justify-center items-center text-sm md:text-xl text-center space-x-2">
                            <span>
                                <LocalTime fixture={fixtureByFixtureId}/>
                            </span>
                            <span>
                                - {fixtureByFixtureId.league.name}
                            </span>
                        </div>
                        {
                            fixture.status.long !== 'Match Finished' && (
                                <div className="text-center text-lg mt-4 text-yellow-400">
                                    <CountdownTimer startTime={fixture.date} />
                                </div>
                            )
                        }
                        <div className="text-center text-sm md:text-lg font-semibold mt-2">
                            <span
                                className={`${fixture.status.long === "Match Finished" ? teams.home.winner? "text-green-500" : teams.away.winner ? "text-red-500" : "text-yellow-500" : "text-gray-300"}`}
                            >
                                {teams.home.name}
                            </span>
                            <span className="text-gray-300"> - </span>
                            <span
                                className={`${fixture.status.long === "Match Finished" ? teams.away.winner ? "text-green-500" : teams.home.winner ? "text-red-500" : "text-yellow-500" : "text-gray-300"}`}
                            >
                                {teams.away.name}
                            </span>
                        </div>
                        <div className="h-3/5 flex justify-center items-center md:text-5xl text-2xl mt-2">
                            <div className="flex flex-col justify-center items-center">
                                {score.fulltime.home}
                            </div>
                            <div> - </div>
                            <div className="flex flex-col justify-center items-center">
                                {score.fulltime.away}
                            </div>
                        </div>
                        {
                            extraTimeScore && fixture.status.long === "Match Finished" ? (
                                <div className="text-center text-gray-300 mt-2 text-sm">
                                    <p>
                                        Extra Time: {extraTimeScore}
                                    </p>
                                </div>
                            ) : (
                                fixture.status.long !== "Match Finished" && (
                                    <div className="text-center text-gray-300 mt-2 text-sm">
                                        <p>
                                            Extra Time: -
                                        </p>
                                    </div>
                                )
                            )
                        }
                        {
                            score.penalties && (
                                <div className="text-center text-gray-300 mt-2 text-sm">
                                    <p>
                                        Penalties: {score.penalties.home} - {score.penalties.away}
                                    </p>
                                </div>
                            )
                        }
                        <div className="text-center text-gray-300 mt-4">
                            <p>
                                Referee: {fixture.referee || "Unknown"}
                            </p>
                            <p>
                                Stadium: {fixture.venue?.name || "Unknown"}, {fixture.venue?.city || "Unknown"}
                            </p>
                        </div>
                    </div>
                    <div
                        className={`w-1/3 flex justify-center rounded-full ${fixture.status.long === "Match Finished" ? teams.away.winner ? "logo-shadow-green" : teams.home.winner ? "logo-shadow-red" : "logo-shadow-yellow" : "logo-shadow"} animate-logo-pop-right`}
                    >
                        <Link href={`../team/${teams.away.id}`}>
                            <Image
                                src={teams.away.logo}
                                alt={`${teams.away.name} Logo`}
                                width={250}
                                height={250}
                                className="object-contain"
                                style={{ width: "250px", height: "250px" }}
                            />
                        </Link>
                    </div>
                </div>

                <MatchDetails fixtureDate={fixture.date}>
                    <div className="flex flex-col w-full max-w-2xl bg-gray-800 rounded-lg p-6 mb-10 mx-auto">
                        <h3 className="text-xl text-center text-white mb-4">
                            Match Events
                        </h3>
                        {
                            ["First Half", "Second Half", "First Half Extra Time", "Second Half Extra Time", "Penalties"].map((period) => {
                                const periodEvents = events?.filter((event) => {
                                    if (period === "First Half") {
                                        return event.time.elapsed <= 45;
                                    }
                                    if (period === "Second Half") {
                                        return event.time.elapsed > 45 && event.time.elapsed <= 90;
                                    }
                                    if (period === "First Half Extra Time") {
                                        return event.time.elapsed > 90 && event.time.elapsed <= 105;
                                    }
                                    if (period === "Second Half Extra Time") {
                                        return event.time.elapsed > 105 && event.time.elapsed <= 120 && !event.detail?.includes("Penalty");
                                    }
                                    if (period === "Penalties") {
                                        return event.detail?.includes("Penalty");
                                    }
                                    return false;
                                });

                                return (
                                    <div
                                        key={period}
                                        className="mb-6"
                                    >
                                        <h4 className="text-lg text-center text-gray-400 mb-4">
                                            {period}
                                        </h4>
                                        <ul className="text-white text-sm space-y-4">
                                            {
                                                periodEvents && periodEvents.length === 0 ? (
                                                    <li className="text-center text-gray-500">
                                                        Nothing happened.
                                                    </li>
                                                ) : period === "Penalties" ? (
                                                        periodEvents?.map((event, index) => {
                                                            const homeEvents = periodEvents.filter((e) => e.team.id === teams.home.id);
                                                            const awayEvents = periodEvents.filter((e) => e.team.id === teams.away.id);
                                                            const alternatingEvent = index % 2 === 0 ? homeEvents[Math.floor(index / 2)] : awayEvents[Math.floor(index / 2)];
                                                            if (!alternatingEvent) {
                                                                return null;
                                                            }

                                                            const penaltyResult = alternatingEvent.detail?.includes("Missed") ? "❌" : "✔";
                                                            const isAlternatingHomeTeam = alternatingEvent.team.id === teams.home.id;

                                                            return (
                                                                <li
                                                                    key={index}
                                                                    className={`flex ${isAlternatingHomeTeam ? "justify-start" : "justify-end"}`}
                                                                >
                                                                    <span className="text-gray-300">
                                                                        {alternatingEvent.time.elapsed}'
                                                                    </span>
                                                                    <div className={`flex items-center ${isAlternatingHomeTeam ? "ml-4 text-left" : "mr-4 text-right"}`}>
                                                                        <span className={`mx-2 ${penaltyResult === "✔" ? "text-green-500" : "text-red-500"}`}>
                                                                            {penaltyResult}
                                                                        </span>
                                                                        <span>
                                                                            {alternatingEvent.player.name}
                                                                        </span>
                                                                    </div>
                                                                </li>
                                                            )
                                                        }).reverse()
                                                    ) : (
                                                        periodEvents?.map((event, index) => {
                                                            const isHomeTeam = event.team.id === teams.home.id;

                                                            return (
                                                                <li
                                                                    key={index}
                                                                    className={`flex ${isHomeTeam ? "justify-start" : "justify-end"}`}
                                                                >
                                                                    <span className="text-gray-300">
                                                                        {event.time.elapsed}'
                                                                    </span>
                                                                    <div className={`flex items-center ${isHomeTeam ? "ml-4 text-left" : "mr-4 text-right"}`}>
                                                                        {event.type === "Goal" && <span className="text-green-500 mx-2">⚽</span>}
                                                                        {event.type === "Card" && (
                                                                            <span className={`mx-2 ${event.detail === "Red Card" ? "text-red-500" : "text-yellow-500"}`}>
                                                                                {event.detail === "Red Card" ? "🟥" : "🟨"}
                                                                            </span>
                                                                        )}
                                                                        {event.type === "subst" && <span className="text-blue-500 mx-2">🔄</span>}
                                                                        <span>
                                                                            {event.type === "Goal" && `${event.player.name} ${event.assist?.name ? `(Assist: ${event.assist.name})` : ""}`}
                                                                            {event.type === "Card" && `${event.player.name}`}
                                                                            {event.type === "subst" && `Out: ${event.player.name}, In: ${event.assist?.name || "Unknown"}`}
                                                                        </span>
                                                                    </div>
                                                                </li>
                                                            )
                                                        })
                                                    )
                                            }
                                        </ul>
                                    </div>
                                )
                            })
                        }
                    </div>
                    <div className="flex w-full max-w-7xl justify-between mt-10 gap-x-12">
                        <div className="flex flex-col w-1/2 items-center">
                            <h3 className="text-lg text-center text-green-400 mb-4">
                                {teams.home.name} Formation
                            </h3>
                            {lineups?.[0] ? renderLineup(lineups[0], teams.home.id) : <p className="text-white">No lineup available.</p>}
                        </div>
                        <div className="flex flex-col w-1/2 items-center">
                            <h3 className="text-lg text-center text-blue-400 mb-4">
                                {teams.away.name} Formation
                            </h3>
                            {lineups?.[1] ? renderLineup(lineups[1], teams.away.id) : <p className="text-white">No lineup available.</p>}
                        </div>
                    </div>
                    <div className="flex w-full max-w-5xl justify-center mt-16">
                        <div className="w-full bg-gray-800 rounded-lg p-6">
                            <h3 className="text-xl text-center text-white mb-4">
                                Statistics
                            </h3>
                            {
                                statistics && statistics[0]?.statistics?.length > 0 ? (
                                    <div className="space-y-8">
                                        {
                                            statistics[0].statistics.map((stat, index) => {
                                                const homeValue = parseInt(stat.value?.toString() || "0");
                                                const awayValue = parseInt(statistics[1]?.statistics[index]?.value?.toString() || "0");
                                                const homePercentage = (homeValue / (homeValue + awayValue)) * 100 || 0;
                                                const awayPercentage = (awayValue / (homeValue + awayValue)) * 100 || 0;

                                                return (
                                                    <div
                                                        key={index}
                                                        className="flex items-center justify-between w-full"
                                                    >
                                                        <div className="relative flex items-center h-6 w-1/2 pr-12">
                                                            <div
                                                                className={`absolute right-0 top-0 h-full ${homeValue > awayValue ? "bg-green-500" : "bg-red-500"}`}
                                                                style={{ width: `${homePercentage}%` }}
                                                            >
                                                            </div>
                                                            <span className="absolute right-0 transform translate-x-20 text-white text-sm">
                                                                {homeValue}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-center items-center w-80 text-center text-white text-sm px-24">
                                                            {formatStatName(stat.type)}
                                                        </div>
                                                        <div className="relative flex items-center h-6 w-1/2 pl-12">
                                                            <div
                                                                className={`absolute left-0 top-0 h-full ${awayValue > homeValue ? "bg-green-500" : "bg-red-500"}`}
                                                                style={{ width: `${awayPercentage}%` }}
                                                            >
                                                            </div>
                                                            <span className="absolute left-0 transform -translate-x-20 text-white text-sm">
                                                                {awayValue}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )
                                            })
                                        }
                                    </div>
                                ) : (
                                    <p className="text-center text-gray-400 text-sm mt-4">
                                        Statistics not available
                                    </p>
                                    )
                            }
                        </div>
                    </div>
                </MatchDetails>
        </div>
    )
}