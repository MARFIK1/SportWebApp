import "./globals.css"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import SearchBar from "./components/SearchBar/SearchBar"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
    title: "FootballTennisApp",
    description: "FootballTennisApp",
}

export default function RootLayout ({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <body className={`${inter.className} bg-white`}>
                <div className="relative">
                    <div className="relative bg-gray-800">
                        <SearchBar />
                        {children}
                    </div>
                </div>
            </body>
        </html>
    )
}