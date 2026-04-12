"use client";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/components/common/LanguageProvider";

interface DatePickerProps {
    dates: string[];
    selectedDate: string;
    basePath?: string;
}

export default function DatePicker({ dates, selectedDate, basePath = "/" }: DatePickerProps) {
    const router = useRouter();
    const { locale, t } = useLanguage();

    const handleDateClick = (date: string) => {
        router.push(`${basePath}?date=${date}`);
    };

    const dateLocale = locale === "pl" ? "pl-PL" : "en-US";

    const formatDay = (dateStr: string) => {
        const date = new Date(dateStr + "T12:00:00");
        const today = new Date();
        today.setHours(12, 0, 0, 0);

        const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return { label: t("today"), weekday: "" };

        const weekday = date.toLocaleDateString(dateLocale, { weekday: "short" }).toUpperCase();
        const dayMonth = date.toLocaleDateString(dateLocale, { month: "short", day: "numeric" }).toUpperCase();
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
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-2 text-lg"
                >
                    &lt;
                </button>
            )}
            {visibleDates.map((date) => {
                const { label, weekday } = formatDay(date);
                const isSelected = date === selectedDate;
                return (
                    <button
                        key={date}
                        onClick={() => handleDateClick(date)}
                        className={`flex flex-col items-center px-4 py-2 rounded-lg min-w-[80px] transition-colors ${
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
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-2 text-lg"
                >
                    &gt;
                </button>
            )}
        </div>
    );
}
