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

export default function MainPage({ standingsData, filteredFixtures } : { standingsData: Standing[], filteredFixtures: AllFixtures[] }) {
    const menuItems = ["Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1", "UEFA Champions League", "UEFA Europa League", "UEFA Conference League"];
    const [activeTab, setActiveTab] = useState(0);
    const [previousTab, setPreviousTab] = useState(0);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    
    const handleTabClick = (index: number) => {
        setPreviousTab(activeTab);
        setActiveTab(index);
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
                <div className="flex justify-center items-center w-full sm:w-[90%] md:w-[70%] lg:w-[30%] xl:w-[25%] p-4 ml-[250px]">
                    <div className="flex flex-col justify-start items-center bg-gradient-to-b from-black/40 w-full text-neutral-100 rounded-3xl h-full">
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
                <div className="flex justify-center items-center w-full sm:w-[90%] md:w-[70%] lg:w-[50%] xl:w-[45%] max-w-[1000px] p-4">
                    <div
                        className="flex flex-col justify-start items-center bg-gradient-to-b from-black/40 w-full text-neutral-100 rounded-3xl h-full"
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
                                                                width={25}
                                                                height={25}
                                                                className="object-contain"
                                                                style={{ width: "25px", height: "25px" }}
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
            </div>
        </div>
    )
}