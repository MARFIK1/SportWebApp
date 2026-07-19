const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_REPORT_TIME_ZONE = "Europe/Warsaw";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isValidYmdDate(value: unknown): value is string {
    if (typeof value !== "string" || !YMD_RE.test(value)) return false;

    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));

    return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
    );
}

export function normalizeReportDate(value: unknown): string | null {
    return isValidYmdDate(value) ? value : null;
}

export function expandYmdDateRange(dates: string[]): string[] {
    const sortedDates = Array.from(new Set(dates.filter(isValidYmdDate))).sort((a, b) => a.localeCompare(b));
    if (sortedDates.length < 2) return sortedDates;

    const startTime = Date.parse(sortedDates[0] + "T12:00:00Z");
    const endTime = Date.parse(sortedDates[sortedDates.length - 1] + "T12:00:00Z");
    const expandedDates: string[] = [];

    for (let time = startTime; time <= endTime; time += MS_PER_DAY) {
        expandedDates.push(new Date(time).toISOString().slice(0, 10));
    }

    return expandedDates;
}

export function todayYmd(date: Date = new Date(), timeZone = DEFAULT_REPORT_TIME_ZONE): string {
    try {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(date);

        const year = parts.find((part) => part.type === "year")?.value;
        const month = parts.find((part) => part.type === "month")?.value;
        const day = parts.find((part) => part.type === "day")?.value;

        if (year && month && day) return `${year}-${month}-${day}`;
    } catch {
        
    }

    return date.toISOString().slice(0, 10);
}
