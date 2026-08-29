export type CanonicalMatchStatus =
    | "finished"
    | "inprogress"
    | "upcoming"
    | "postponed"
    | "canceled"
    | "unknown";

function statusValue(status: unknown): unknown {
    if (status && typeof status === "object" && "type" in status) {
        return (status as { type?: unknown }).type;
    }
    return status;
}

export function normalizeMatchStatus(status: unknown): CanonicalMatchStatus {
    const normalized = String(statusValue(status) ?? "").trim().toLowerCase();

    if (normalized === "cancelled") return "canceled";
    if (normalized === "notstarted" || normalized === "scheduled") return "upcoming";

    switch (normalized) {
        case "finished":
        case "inprogress":
        case "upcoming":
        case "postponed":
        case "canceled":
            return normalized;
        default:
            return "unknown";
    }
}

export function isFinishedMatchStatus(status: unknown): boolean {
    return normalizeMatchStatus(status) === "finished";
}

export function isLiveMatchStatus(status: unknown): boolean {
    return normalizeMatchStatus(status) === "inprogress";
}

export function isUpcomingMatchStatus(status: unknown): boolean {
    return normalizeMatchStatus(status) === "upcoming";
}

export function isInactiveMatchStatus(status: unknown): boolean {
    const normalized = normalizeMatchStatus(status);
    return normalized === "postponed" || normalized === "canceled";
}

export function matchStatusPriority(status: unknown): number {
    const normalized = normalizeMatchStatus(status);
    if (isInactiveMatchStatus(normalized)) return 5;
    if (normalized === "finished") return 4;
    if (normalized === "inprogress") return 3;
    if (normalized === "upcoming") return 2;
    return 1;
}
