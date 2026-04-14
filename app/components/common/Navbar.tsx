"use client";
import Link from "next/link";
import type { SearchTeam, SearchPlayer } from "@/app/util/data/dataService";
import SearchBarForm from "./SearchBarForm";
import { useLanguage } from "./LanguageProvider";

export default function Navbar({ teamsData, playersData }: { teamsData: SearchTeam[]; playersData: SearchPlayer[] }) {
    const { locale, setLocale, t } = useLanguage();

    return (
        <div className="flex justify-between items-center w-full">
            <div className="flex items-center">
                <Link href="/" className="flex items-center">
                    <img
                        src="/logo.png"
                        alt="logo"
                        className="w-24 object-cover rounded-full"
                    />
                </Link>
            </div>
            <div className="flex items-center gap-4">
                <Link href="/predictions" className="text-sm text-gray-400 hover:text-white transition-colors">
                    {t("predictions")}
                </Link>
                <button
                    onClick={() => setLocale(locale === "en" ? "pl" : "en")}
                    className="px-2 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                    title={locale === "en" ? "Zmie\u0144 na polski" : "Switch to English"}
                >
                    {locale === "en" ? "PL" : "EN"}
                </button>
            </div>
            <div className="flex-1 mx-4">
                <SearchBarForm teamsData={teamsData} playersData={playersData} />
            </div>
        </div>
    );
}