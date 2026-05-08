"use client";
import Image from "next/image";
import Link from "next/link";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";
import SearchBarForm from "./SearchBarForm";
import { useLanguage } from "./LanguageProvider";
import { useTheme } from "./ThemeProvider";

export default function Navbar() {
    const { locale, setLocale, t } = useLanguage();
    const { theme, toggle } = useTheme();
    const languageLabel = locale === "en" ? "Zmień na polski" : "Switch to English";
    const themeLabel = theme === "dark" ? "Light mode" : "Dark mode";

    const actions = (
        <>
            <Link href="/predictions" prefetch={false} className="text-sm text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                {t("predictions")}
            </Link>
            <button
                onClick={() => setLocale(locale === "en" ? "pl" : "en")}
                className="rounded-lg px-2 py-1 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                title={languageLabel}
                aria-label={languageLabel}
            >
                {locale === "en" ? "PL" : "EN"}
            </button>
            <button
                onClick={toggle}
                className="rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                title={themeLabel}
                aria-label={themeLabel}
            >
                {theme === "dark" ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
            </button>
        </>
    );

    return (
        <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-start">
                <Link href="/" prefetch={false} className="flex items-center" aria-label="SportWebApp home">
                    <Image
                        src="/logo.png"
                        alt="SportWebApp logo"
                        width={56}
                        height={56}
                        className="h-12 w-12 object-contain"
                    />
                </Link>
                <div className="flex min-w-0 items-center gap-2 sm:hidden">
                    {actions}
                </div>
            </div>
            <div className="min-w-0 flex-1 sm:mx-4">
                <SearchBarForm />
            </div>
            <div className="hidden items-center gap-3 sm:flex">
                {actions}
            </div>
        </div>
    );
}