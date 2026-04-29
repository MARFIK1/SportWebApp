const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

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
