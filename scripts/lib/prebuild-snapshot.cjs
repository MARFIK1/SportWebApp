function isValidYmd(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day;
}

function parseOptionalYmd(value, name) {
    const normalized = value?.trim();
    if (!normalized) return null;
    if (!isValidYmd(normalized)) {
        throw new Error(`${name} must use a valid YYYY-MM-DD date, got: ${normalized}`);
    }
    return normalized;
}

function matchYmd(match, context) {
    const value = typeof match?.date === "string" ? match.date.slice(0, 10) : "";
    if (!isValidYmd(value)) {
        throw new Error(`invalid or missing match date in ${context}`);
    }
    return value;
}

function filterMatchesByCutoff(matches, cutoff, context) {
    if (!cutoff) return { matches, removed: 0 };
    const retained = [];
    let removed = 0;
    for (const match of matches) {
        if (matchYmd(match, context) <= cutoff) retained.push(match);
        else removed++;
    }
    return { matches: retained, removed };
}

function seasonEndYear(value) {
    const text = String(value || "");
    const fullYears = Array.from(text.matchAll(/\b(20\d{2})\b/g), (match) => Number(match[1]));
    if (fullYears.length > 0) return Math.max(...fullYears);
    const shortSeason = text.match(/(?:^|\D)(\d{2})[\/_-](\d{2})(?:\D|$)/);
    if (!shortSeason) return null;
    const end = Number(shortSeason[2]);
    return end >= 70 ? 1900 + end : 2000 + end;
}

function selectLatestPlayerCandidate(candidates, latestMatchYear) {
    return candidates
        .filter((candidate) => candidate.year !== null && candidate.year <= latestMatchYear)
        .sort((left, right) => left.year - right.year || left.fileName.localeCompare(right.fileName))
        .at(-1)?.fileName ?? null;
}

function addCalendarDaysYmd(ymd, deltaDays) {
    const [year, month, day] = ymd.split("-").map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    return new Date(timestamp + deltaDays * 864e5).toISOString().slice(0, 10);
}

function resolveReportBounds({ copyAll, past, future, today, cutoff, start }) {
    const referenceDate = cutoff || today;
    const windowMin = copyAll ? null : addCalendarDaysYmd(referenceDate, -past);
    const windowMax = copyAll || future === null ? null : addCalendarDaysYmd(referenceDate, future);
    const minYmd = [start, windowMin].filter(Boolean).sort().at(-1) ?? null;
    const maxYmd = [cutoff, windowMax].filter(Boolean).sort().at(0) ?? null;
    if (minYmd && maxYmd && minYmd > maxYmd) {
        throw new Error(`report range is empty: ${minYmd} .. ${maxYmd}`);
    }
    return { minYmd, maxYmd };
}

function isYmdWithinBounds(value, minYmd, maxYmd) {
    return (!minYmd || value >= minYmd) && (!maxYmd || value <= maxYmd);
}

function sanitizeExportMetadata(value) {
    if (Array.isArray(value)) return value.map(sanitizeExportMetadata);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, sanitizeExportMetadata(item)]),
        );
    }
    if (typeof value !== "string") return value;

    const normalized = value.replace(/\\/g, "/");
    const isHostPath = /^[A-Za-z]:\//.test(normalized) || /^\/(?:home|Users)\//.test(normalized);
    if (!isHostPath) return value;
    const fileName = normalized.split("/").filter(Boolean).at(-1) || "path";
    return `<external>/${fileName}`;
}

module.exports = {
    filterMatchesByCutoff,
    isValidYmd,
    isYmdWithinBounds,
    matchYmd,
    parseOptionalYmd,
    resolveReportBounds,
    sanitizeExportMetadata,
    seasonEndYear,
    selectLatestPlayerCandidate,
};
