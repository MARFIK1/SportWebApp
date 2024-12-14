"use client";
import { useState, useRef, useEffect } from "react";
import { ChevronDoubleRightIcon } from "@heroicons/react/20/solid";
import moment from "moment";
import Link from "next/link";
import Image from "next/image";

import { AllFixtures, Standing } from "@/types";
import { getRowClass, getLegend } from "../../util/leagueRules";
import FixturesByLeague from "./FixturesByLeague";
import LeagueMenu from "./LeagueMenu";

export default function MainPage({ standingsData, filteredFixtures, topScorersData, topAssistantsData } : { standingsData: Standing[], filteredFixtures: AllFixtures[], topScorersData: any[], topAssistantsData: any[] }) {
    const menuItems = ["Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1", "UEFA Champions League", "UEFA Europa League", "UEFA Conference League"];
    const [activeTab, setActiveTab] = useState(0);
    const [previousTab, setPreviousTab] = useState(0);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [animate, setAnimate] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    
    const handleTabClick = (index: number) => {
        if (index !== activeTab) {
            setPreviousTab(activeTab);
            setActiveTab(index);
            setAnimate(true);
            setTimeout(() => setAnimate(false), 500);
        }
    }

    const toggleMenu = () => {
        setIsMenuOpen(!isMenuOpen);
    }

    useEffect(() => {
        const handleWheel = (event: WheelEvent) => {
            if (event.shiftKey) {
                event.preventDefault();
            }
        }
        const container = menuRef.current;
        if (container) {
            container.addEventListener("wheel", handleWheel, { passive: false });
        }

        return () => {
            if (container) {
                container.removeEventListener("wheel", handleWheel);
            }
        };
    }, [])

    const activeLeagueId = standingsData[activeTab]?.league.id;
    const topScorers = topScorersData.find(data => data.leagueId === activeLeagueId)?.topScorers || [];
    const topAssistants = topAssistantsData.find(data => data.leagueId === activeLeagueId)?.topAssistants || [];

    return (
        <div className="w-full flex flex-row ml-auto h-full">
            <div
                className={`fixed top-[120px] left-0 h-full bg-gray-800 text-white p-6 transition-transform duration-300 ${isMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
                style={{ zIndex: 50, width: "250px" }}
            >
                <div>
                    <LeagueMenu
                        menuItems={menuItems}
                        activeTab={activeTab}
                        onTabClick={handleTabClick}
                    />
                </div>
                <div className="mt-4">
                    <div className="flex flex-col justify-center items-center text-lg p-2 font-bold">
                        Legend
                    </div>
                    {
                        getLegend(standingsData[activeTab]?.league.id).map((item, index) => (
                            <div
                                key={index}
                                className="flex items-center mb-1"
                            >
                                <div
                                    className={`flex-shrink-0 w-4 h-4 rounded-full mr-2 ${item.color}`}
                                    style={{ minWidth: "16px", minHeight: "16px" }}
                                >
                                </div>
                                <span>
                                    {item.description}
                                </span>
                            </div>
                        ))
                    }
                </div>
            </div>
            <button
                className={`fixed top-1/2 transform -translate-y-1/2 z-50 bg-blue-600 text-white px-3 py-2 rounded-r ${isMenuOpen ? "left-[250px]" : "left-0"} transition-all duration-300`}
                onClick={toggleMenu}
            >
                <ChevronDoubleRightIcon
                    className={`h-6 w-6 transform ${isMenuOpen ? "rotate-180" : ""} transition-transform duration-300`}
                />
            </button>
            <div className="w-full flex flex-col lg:flex-row ml-auto">
                <div className={`flex justify-center items-start w-full sm:w-[90%] md:w-[70%] lg:w-[35%] xl:w-[30%] p-4 ml-[250px] ${animate ? "animated-div" : ""}`}>
                    <div className="flex flex-col justify-start items-center bg-gradient-to-b from-black/40 w-full text-neutral-100 rounded-3xl rounded-b-3xl">
                        <div className="w-full text-center p-2 font-bold text-lg h-[50px] flex items-center justify-center">
                            Upcoming Matches
                        </div>
                        <div className="flex flex-col w-full justify-start items-center pb-5">
                            {
                                filteredFixtures
                                    .filter((league) => league.name === menuItems[activeTab])
                                    .map((league) => {
                                        const upcomingMatches = league.fixtures.filter((fixture) => 
                                            moment(fixture.fixture.date).isSameOrAfter(moment(), 'day')
                                        )
                                        return (
                                            <FixturesByLeague
                                                fixturesData={upcomingMatches.slice(0, 7)}
                                                key={league.name}
                                            />
                                        )
                                    })
                            }
                        </div>
                    </div>
                </div>
                <div className={`flex justify-center items-start w-full sm:w-[90%] md:w-[70%] lg:w-[50%] xl:w-[45%] max-w-[1000px] p-4 ${animate ? "animated-div" : ""}`}>
                    <div
                        className="flex flex-col justify-start items-center bg-gradient-to-b from-black/40 w-full text-neutral-100 rounded-3xl rounded-b-3xl"
                        style={{ maxWidth: "100%" }}
                    >
                        <div className="p-2 font-bold text-lg text-center flex items-center justify-center">
                            {standingsData[activeTab]?.league.name} Table
                        </div>
                        <div
                            ref={menuRef}
                            className="league-scroll-container w-full flex overflow-x-auto snap-x scrollbar-none text-xs md:text-sm"
                            style={{ maxWidth: "100%" }}
                        >
                            {
                                standingsData.map((responseData, index) => (
                                    <div
                                        key={responseData.league.id}
                                        className={`flex-shrink-0 w-full snap-center flex flex-col justify-start items-center ${activeTab === index ? (index > previousTab ? "slide-in-left" : "slide-in-right") : ""}`}
                                        style={{ display: activeTab === index ? "block" : "none" }}
                                    >
                                        <div
                                            className="flex flex-col w-full"
                                            style={{ width: "100%", borderSpacing: "0", margin: "0", padding: "0", backgroundColor: "transparent" }}
                                        >
                                            <div className="flex w-full p-1">
                                                <div className="w-1/12 text-center font-bold">
                                                    Rank
                                                </div>
                                                <div className="w-3/12 text-left pl-2 font-bold">
                                                    Club
                                                </div>
                                                <div className="w-6/12 flex justify-evenly">
                                                    <div className="w-full text-center">
                                                        M
                                                    </div>
                                                    <div className="w-full text-center">
                                                        W
                                                    </div>
                                                    <div className="w-full text-center">
                                                        D
                                                    </div>
                                                    <div className="w-full text-center">
                                                        L
                                                    </div>
                                                    <div className="w-full text-center font-bold">
                                                        P
                                                    </div>
                                                    <div className="w-full text-center">
                                                        GF
                                                    </div>
                                                    <div className="w-full text-center">
                                                        GA
                                                    </div>
                                                    <div className="w-full text-center">
                                                        GD
                                                    </div>
                                                </div>
                                                <div className="w-2/12 text-center">
                                                    Form
                                                </div>
                                            </div>
                                            {
                                                responseData.league.standings[0].map((team, j) => (
                                                    <Link
                                                        href={`/team/${team.team.id}`}
                                                        key={j + team.team.name}
                                                        className={`flex w-full h-12 hover:bg-blue-800/50 ${getRowClass(responseData.league.id, j + 1)}`}
                                                        style={{ width: "100%", margin: "0", padding: "0", backgroundClip: "padding-box" }}
                                                    >
                                                        <div className="w-1/12 flex px-2 justify-center items-center">
                                                            {j + 1}
                                                        </div>
                                                        <div className="w-3/12 flex text-xs items-center">
                                                            <Image
                                                                src={team.team.logo}
                                                                alt={team.team.name}
                                                                width={30}
                                                                height={30}
                                                                className="object-contain"
                                                                style={{ width: "30px", height: "30px" }}
                                                            />
                                                            <span className="ml-1">
                                                                {team.team.name}
                                                            </span>
                                                        </div>
                                                        <div className="w-6/12 flex justify-center items-center">
                                                            <div className="w-full text-center">
                                                                {team.all.played}
                                                            </div>
                                                            <div className="w-full text-center">
                                                                {team.all.win}
                                                            </div>
                                                            <div className="w-full text-center">
                                                                {team.all.draw}
                                                            </div>
                                                            <div className="w-full text-center">
                                                                {team.all.lose}
                                                            </div>
                                                            <div className="w-full text-center font-bold">
                                                                {team.points}
                                                            </div>
                                                            <div className="w-full text-center">
                                                                {team.all.goals.for}
                                                            </div>
                                                            <div className="w-full text-center">
                                                                {team.all.goals.against}
                                                            </div>
                                                            <div className="w-full text-center">
                                                                {team.goalsDiff}
                                                            </div>
                                                        </div>
                                                        <div className="w-2/12 flex justify-center items-center">
                                                            {
                                                                team.form?.split("").map((char, i) => (
                                                                    <div
                                                                        key={char + i}
                                                                        className={`w-3 h-3 m-[1px] rounded-full ${char === "L" ? "bg-red-500" : char === "D" ? "bg-gray-500" : "bg-green-500"}`}
                                                                    >
                                                                    </div>
                                                                ))
                                                            }
                                                        </div>
                                                    </Link>
                                                ))
                                            }
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                </div>
                <div className={`flex flex-col justify-start items-center w-full sm:w-[90%] md:w-[70%] lg:w-[30%] xl:w-[25%] max-w-[1000px] p-4 ${animate ? "animated-div" : ""}`}>
                    <div className="flex flex-col justify-start items-center bg-gradient-to-b from-black/40 w-full text-neutral-100 rounded-3xl mb-4">
                        <div className="p-2 font-bold text-lg text-center flex items-center justify-center">
                            Top Scorers
                        </div>
                        <div className="flex w-full items-center p-2 gap-x-4">
                            <div className="w-[10%] text-center font-bold text-lg">
                                #
                            </div>
                            <div className="w-[13%] text-center font-bold text-lg">
                                Photo
                            </div>
                            <div className="w-[55%] text-left font-bold text-lg">
                                Player
                            </div>
                            <div className="w-[20%] text-center font-bold text-lg">
                                Goals
                            </div>
                        </div>
                        <div className="w-full flex flex-col items-center gap-y-2">
                            {
                                topScorers.map((player: any, index: number) => (
                                    <Link
                                        href={`/player/${player.player.id}`}
                                        key={index}
                                        className="flex w-full justify-between items-center p-2 gap-x-4 hover:bg-gray-700/50 rounded-lg"
                                    >
                                        <span className="w-[10%] text-center">
                                            {index + 1}
                                        </span>
                                        <div className="w-[15%] flex justify-center">
                                            <Image
                                                src={player.player.photo}
                                                alt={player.player.name}
                                                width={64}
                                                height={64}
                                                className="rounded-full"
                                            />
                                        </div>
                                        <div className="w-[55%] text-left flex flex-col">
                                            <span className="font-semibold">
                                                {player.player.name}
                                            </span>
                                            <span className="text-sm text-gray-400">
                                                {player.statistics[0].team.name}
                                            </span>
                                        </div>
                                        <span className="w-[20%] text-center font-semibold">
                                            {player.statistics[0].goals.total}
                                        </span>
                                    </Link>
                                ))
                            }
                        </div>
                    </div>
                    <div className="flex flex-col justify-start items-center bg-gradient-to-b from-black/40 w-full text-neutral-100 rounded-3xl mt-4">
                        <div className="p-2 font-bold text-lg text-center flex items-center justify-center">
                            Top Assistants
                        </div>
                        <div className="flex w-full items-center p-2 gap-x-4">
                            <div className="w-[10%] text-center font-bold text-lg">
                                #
                            </div>
                            <div className="w-[13%] text-center font-bold text-lg">
                                Photo
                            </div>
                            <div className="w-[55%] text-left font-bold text-lg">
                                Player
                            </div>
                            <div className="w-[20%] text-center font-bold text-lg">
                                Assists
                            </div>
                        </div>
                        <div className="w-full flex flex-col items-center gap-y-2">
                            {
                                topAssistants.map((player: any, index: number) => (
                                    <Link
                                        href={`/player/${player.player.id}`}
                                        key={index}
                                        className="flex w-full justify-between items-center p-2 gap-x-4 hover:bg-gray-700/50 rounded-lg"
                                    >
                                        <span className="w-[10%] text-center">
                                            {index + 1}
                                        </span>
                                        <div className="w-[15%] flex justify-center">
                                            <Image
                                                src={player.player.photo}
                                                alt={player.player.name}
                                                width={64}
                                                height={64}
                                                className="rounded-full"
                                            />
                                        </div>
                                        <div className="w-[55%] text-left flex flex-col">
                                            <span className="font-semibold">
                                                {player.player.name}
                                            </span>
                                            <span className="text-sm text-gray-400">
                                                {player.statistics[0].team.name}
                                            </span>
                                        </div>
                                        <span className="w-[20%] text-center font-semibold">
                                            {player.statistics[0].goals.assists}
                                        </span>
                                    </Link>
                                ))
                            }
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}