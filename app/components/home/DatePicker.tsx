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
        <div className="flex items-center justify-center gap-1 py-4">
            {start > 0 && (
                <button
                    onClick={() => handleDateClick(dates[start - 1])}
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-2 text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                    aria-label="Previous dates"
                >
                    <span aria-hidden="true">&lt;</span>
                </button>
            )}
            {visibleDates.map((date) => {
                const { label, weekday } = formatDay(date);
                const isSelected = date === selectedDate;
                return (
                    <button
                        key={date}
                        onClick={() => handleDateClick(date)}
                        aria-pressed={isSelected}
                        className={`flex flex-col items-center px-4 py-2 rounded-lg min-w-[80px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                            isSelected
                                ? "bg-emerald-600 text-white"
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                    >
                        {weekday && <span className="text-xs">{weekday}</span>}
                        <span className="text-sm font-bold">{label}</span>
                    </button>
                );
            })}
            {end < dates.length && (
                <button
                    onClick={() => handleDateClick(dates[end])}
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-2 text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                    aria-label="Next dates"
                >
                    <span aria-hidden="true">&gt;</span>
                </button>
            )}
        </div>
    );
}
