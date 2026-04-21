"use client";
import { useRouter } from "next/navigation";
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

    const handleDateClick = (date: string) => {
        router.push(`${basePath}?date=${date}`);
    };

    const dateLocale = locale === "pl" ? "pl-PL" : "en-US";

    const formatDay = (dateStr: string) => {
        if (dateStr === todayIso) return { label: t("today"), weekday: "" };

        const date = new Date(dateStr + "T12:00:00Z");
        const weekday = date.toLocaleDateString(dateLocale, { weekday: "short", timeZone: "UTC" }).toUpperCase();
        const dayMonth = date.toLocaleDateString(dateLocale, { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();
        return { label: dayMonth, weekday };
    };

    const selectedIdx = dates.indexOf(selectedDate);
    const start = Math.max(0, selectedIdx - 2);
    const end = Math.min(dates.length, start + 5);
    const visibleDates = dates.slice(start, end);

    return (
        <div className="mx-auto w-full max-w-3xl overflow-x-auto pb-1">
            <div className="flex min-w-max items-center justify-start gap-2 rounded-2xl border border-gray-200 bg-white/85 px-3 py-3 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-gray-700/70 dark:bg-gray-900/65 dark:shadow-black/10 sm:justify-center">
            {start > 0 && (
                <button
                    onClick={() => handleDateClick(dates[start - 1])}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-lg text-gray-500 transition-colors hover:border-emerald-400/50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-emerald-500/40 dark:hover:text-white"
                    aria-label={t("previous_dates")}
                >
                    <span aria-hidden="true">&lt;</span>
                </button>
            )}
            {visibleDates.map((date) => {
                const { label, weekday } = formatDay(date);
                const isSelected = date === selectedDate;
                const isToday = date === todayIso;
                return (
                    <button
                        key={date}
                        onClick={() => handleDateClick(date)}
                        aria-pressed={isSelected}
                        className={`flex min-w-[72px] flex-col items-center rounded-xl border px-3 py-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:min-w-[88px] sm:px-4 ${
                            isSelected
                                ? "border-emerald-500 bg-emerald-600 text-white shadow-lg shadow-emerald-950/20 dark:shadow-emerald-950/30"
                                : isToday
                                    ? "border-emerald-300 bg-emerald-50 text-gray-900 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-white dark:hover:bg-emerald-500/15"
                                    : "border-transparent text-gray-500 hover:border-gray-200 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
                        }`}
                    >
                        {weekday && <span className={`text-[11px] tracking-[0.18em] ${isSelected ? "text-white/80" : "text-gray-400 dark:text-gray-500"}`}>{weekday}</span>}
                        <span className="text-sm font-bold">{label}</span>
                    </button>
                );
            })}
            {end < dates.length && (
                <button
                    onClick={() => handleDateClick(dates[end])}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-lg text-gray-500 transition-colors hover:border-emerald-400/50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-emerald-500/40 dark:hover:text-white"
                    aria-label={t("next_dates")}
                >
                    <span aria-hidden="true">&gt;</span>
                </button>
            )}
            </div>
        </div>
    );
}
