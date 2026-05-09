"use client";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/app/components/common/LanguageProvider";

interface DatePickerProps {
    dates: string[];
    selectedDate: string;
    todayIso: string;
    basePath?: string;
}

export default function DatePicker({ dates, selectedDate, todayIso, basePath = "/" }: DatePickerProps) {
    const router = useRouter();
    const { locale, t } = useLanguage();
    const [isCompact, setIsCompact] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 639px)");

        const syncCompactMode = () => {
            setIsCompact(mediaQuery.matches);
        };

        syncCompactMode();
        mediaQuery.addEventListener("change", syncCompactMode);

        return () => {
            mediaQuery.removeEventListener("change", syncCompactMode);
        };
    }, []);

    const handleDateClick = (date: string) => {
        router.push(`${basePath}?date=${date}`);
    };

    const dateLocale = locale === "pl" ? "pl-PL" : "en-US";

    const formatDay = (dateStr: string) => {
        const date = new Date(dateStr + "T12:00:00Z");
        const weekday = date.toLocaleDateString(dateLocale, { weekday: "short", timeZone: "UTC" }).toUpperCase();
        const dayMonth = date.toLocaleDateString(dateLocale, { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();
        if (dateStr === todayIso) return { label: dayMonth, weekday: t("today").toUpperCase() };
        return { label: dayMonth, weekday };
    };

    const visibleDateCount = isCompact ? 3 : 5;
    const selectedIdx = Math.max(0, dates.indexOf(selectedDate));
    const selectedOffset = Math.floor(visibleDateCount / 2);
    const rawStart = Math.max(0, selectedIdx - selectedOffset);
    const end = Math.min(dates.length, rawStart + visibleDateCount);
    const start = Math.max(0, end - visibleDateCount);
    const visibleDates = dates.slice(start, end);
    const canGoBack = start > 0;
    const canGoForward = end < dates.length;

    const arrowButtonClassName =
        "flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-lg text-gray-500 transition-colors hover:border-emerald-400/50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-emerald-500/40 dark:hover:text-white";

    return (
        <div className="mx-auto w-full max-w-3xl">
            <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 rounded-2xl border border-gray-200 bg-white/85 px-3 py-3 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-gray-700/70 dark:bg-gray-900/65 dark:shadow-black/10">
                <button
                    onClick={() => canGoBack && handleDateClick(dates[start - 1])}
                    disabled={!canGoBack}
                    className={`${arrowButtonClassName} ${canGoBack ? "" : "invisible pointer-events-none"}`}
                    aria-label={t("previous_dates")}
                >
                    <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                </button>

                <div
                    className="grid min-w-0 gap-1.5 sm:gap-2"
                    style={{ gridTemplateColumns: `repeat(${visibleDates.length}, minmax(0, 1fr))` }}
                >
                    {visibleDates.map((date) => {
                        const { label, weekday } = formatDay(date);
                        const isSelected = date === selectedDate;
                        const isToday = date === todayIso;
                        return (
                            <button
                                key={date}
                                onClick={() => handleDateClick(date)}
                                aria-pressed={isSelected}
                                className={`flex h-14 min-w-0 flex-col items-center justify-center rounded-xl border px-1 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:px-3 ${
                                    isSelected
                                        ? "border-emerald-500 bg-emerald-600 text-white shadow-lg shadow-emerald-950/20 dark:shadow-emerald-950/30"
                                        : isToday
                                            ? "border-emerald-300 bg-emerald-50 text-gray-900 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-white dark:hover:bg-emerald-500/15"
                                            : "border-transparent text-gray-500 hover:border-gray-200 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
                                }`}
                            >
                                <span className={`text-[10px] font-bold uppercase sm:text-[11px] ${isSelected ? "text-white/80" : "text-gray-400 dark:text-gray-500"}`}>{weekday}</span>
                                <span className="text-xs font-bold sm:text-sm">{label}</span>
                            </button>
                        );
                    })}
                </div>

                <button
                    onClick={() => canGoForward && handleDateClick(dates[end])}
                    disabled={!canGoForward}
                    className={`${arrowButtonClassName} ${canGoForward ? "" : "invisible pointer-events-none"}`}
                    aria-label={t("next_dates")}
                >
                    <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
