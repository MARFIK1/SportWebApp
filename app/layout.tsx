import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getLeagues } from "@/app/util/league/leagueRegistry";
import { buildSearchData } from "./util/data/dataService";
import Navbar from "./components/common/Navbar";
import ThemeProvider from "./components/common/ThemeProvider";
import LanguageProvider from "./components/common/LanguageProvider";
import { getServerLocale } from "@/app/util/i18n/getLocale";
import { getServerTheme } from "@/app/util/i18n/getTheme";

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        default: "SportWebApp | Football Results & ML Predictions",
        template: "%s | SportWebApp",
    },
    description: "Football results and ML-driven match predictions across 44 competitions. Compare 9 machine learning models with live accuracy tracking.",
    keywords: ["football", "soccer", "predictions", "machine learning", "sofascore", "standings", "xg"],
    openGraph: {
        title: "SportWebApp",
        description: "Football results and ML match predictions",
        type: "website",
        url: SITE_URL,
    },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const leagues = getLeagues();
    const { teams, players } = buildSearchData(leagues);
    const locale = await getServerLocale();
    const theme = await getServerTheme();

    return (
        <html lang={locale} className={theme === "dark" ? "dark" : ""}>
            <body className={`${inter.className}`}>
                <ThemeProvider initial={theme}>
                    <LanguageProvider initial={locale}>
                        <div className="flex h-screen">
                            <div className="flex flex-col flex-1">
                                <header className="bg-white dark:bg-gray-800 w-full p-3 border-b border-gray-200 dark:border-transparent">
                                    <Navbar teamsData={teams} playersData={players} />
                                </header>
                                <main className="bg-gray-100 dark:bg-gray-800 flex-1 overflow-y-auto">
                                    {children}
                                </main>
                            </div>
                        </div>
                    </LanguageProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}