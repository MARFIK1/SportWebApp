import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { getCurrentSeason } from "@/app/util/season";
import getTeams from "@/app/util/getTeams";
import Navbar from "./components/Navbar/Navbar";

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
    title: "SportWebApp",
    description: "SportWebApp"
}

export default async function RootLayout({ children } : { children: React.ReactNode }) {
    const season = getCurrentSeason();
    const teamsData = await getTeams(season);

    return (
        <html lang="en">
            <body className={`${inter.className}`}>
                <div className="flex h-screen">
                    <div className="flex flex-col flex-1">
                        <header className="bg-gray-800 w-full p-3">
                            <Navbar
                                teamsData={teamsData}
                            />
                        </header>
                        <main className="bg-gray-800 flex-1">
                            {children}
                        </main>
                    </div>
                </div>
            </body>
        </html>
    )
}