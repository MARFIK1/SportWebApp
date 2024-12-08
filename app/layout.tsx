import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Navbar from "./components/Navbar/Navbar";

const inter = Inter( {
    subsets: ["latin"]
})

export const metadata: Metadata = {
    title: "FootballTennisApp",
    description: "FootballTennisApp",
}

export default function RootLayout( {
    children,
} : {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <body className={`${inter.className}`}>
                <div className="relative">
                    <Navbar />
                    <main className="bg-gray-800 relative">
                        {children}
                    </main>
                </div>
            </body>
        </html>
    )
}