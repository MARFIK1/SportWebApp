import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { getCurrentSeason } from "@/app/util/league/season";
import { UserProvider } from "@/app/util/UserContext";
import getSearchData from "./util/dataFetch/getSearchData";
import Navbar from "./components/common/Navbar";

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
    title: "SportWebApp",
    description: "SportWebApp"
}

export default async function RootLayout({ children } : { children: React.ReactNode }) {
    const season = getCurrentSeason();
    const { teams, players } = await getSearchData(season);

    return (
        <html lang="en">
            <body className={`${inter.className}`}>
                <UserProvider>
                    <div className="flex h-screen">
                        <div className="flex flex-col flex-1">
                            <header className="bg-gray-800 w-full p-3">
                                <Navbar
                                    teamsData={teams}
                                    playersData={players}
                                />
                            </header>
                            <main className="bg-gray-800 flex-1">
                                {children}
                            </main>
                        </div>
                    </div>
                </UserProvider>
            </body>
        </html>
    )
}