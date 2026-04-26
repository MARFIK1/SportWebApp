"use client";
import Image from "next/image";
import Link from "next/link";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";
import type { SearchTeam, SearchPlayer } from "@/app/util/data/dataService";
import SearchBarForm from "./SearchBarForm";
import { useLanguage } from "./LanguageProvider";
import { useTheme } from "./ThemeProvider";

export default function Navbar({ teamsData, playersData }: { teamsData: SearchTeam[]; playersData: SearchPlayer[] }) {
    const { locale, setLocale, t } = useLanguage();
    const { theme, toggle } = useTheme();

    return (
        <div className="flex justify-between items-center w-full">
            <div className="flex items-center">
                <Link href="/" className="flex items-center">
                    <Image
                        src="/logo.png"
                        alt="SportWebApp logo"
                        width={56}
                        height={56}
                        className="h-12 w-12 object-contain"
                    />
                </Link>
            </div>
            <div className="flex-1 mx-4">
                <SearchBarForm teamsData={teamsData} playersData={playersData} />
            </div>
            <div className="flex items-center gap-3">
                <Link href="/predictions" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                    {t("predictions")}
                </Link>
                <button
                    onClick={() => setLocale(locale === "en" ? "pl" : "en")}
                    className="px-2 py-1 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    title={locale === "en" ? "Zmień na polski" : "Switch to English"}
                >
                    {locale === "en" ? "PL" : "EN"}
                </button>
                <button
                    onClick={toggle}
                    className="p-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    title={theme === "dark" ? "Light mode" : "Dark mode"}
                >
                    {theme === "dark" ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
                </button>
            </div>
        </div>
    );
}