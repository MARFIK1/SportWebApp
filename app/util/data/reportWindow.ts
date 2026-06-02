import { isValidYmdDate, todayYmd } from "./dateUtils";

function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
    const [y, m, d] = ymd.split("-").map(Number);
    const t = Date.UTC(y, m - 1, d);
    return new Date(t + deltaDays * 864e5).toISOString().slice(0, 10);
}

export function filterReportDatesByWindow(dates: string[]): string[] {
    const disabled = process.env.REPORT_WINDOW_DISABLED === "1" || process.env.REPORT_WINDOW_DISABLED === "true";
    const validDates = dates.filter(isValidYmdDate);
    if (disabled) return validDates;

    const past = Math.max(0, parseInt(process.env.REPORT_DAYS_PAST ?? "30", 10));
    const future = Math.max(0, parseInt(process.env.REPORT_DAYS_FUTURE ?? "1", 10));
    const today = todayYmd();
    const minYmd = addCalendarDaysYmd(today, -past);
    const maxYmd = addCalendarDaysYmd(today, future);

    return validDates.filter((d) => d >= minYmd && d <= maxYmd);
}
