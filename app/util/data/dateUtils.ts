const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_REPORT_TIME_ZONE = "Europe/Warsaw";

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
