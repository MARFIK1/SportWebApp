function utcTodayYmd(): string {
    return new Date().toISOString().slice(0, 10);
}

function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
    const [y, m, d] = ymd.split("-").map(Number);
    const t = Date.UTC(y, m - 1, d);
    return new Date(t + deltaDays * 864e5).toISOString().slice(0, 10);
}

export function filterReportDatesByWindow(dates: string[]): string[] {
    const disabled = process.env.REPORT_WINDOW_DISABLED === "1" || process.env.REPORT_WINDOW_DISABLED === "true";
    if (disabled) return dates;

    const past = Math.max(0, parseInt(process.env.REPORT_DAYS_PAST ?? "14", 10));
    const future = Math.max(0, parseInt(process.env.REPORT_DAYS_FUTURE ?? "14", 10));
    const today = utcTodayYmd();
    const minYmd = addCalendarDaysYmd(today, -past);
    const maxYmd = addCalendarDaysYmd(today, future);

    return dates.filter((d) => d >= minYmd && d <= maxYmd);
}
