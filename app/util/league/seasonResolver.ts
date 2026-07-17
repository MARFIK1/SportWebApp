import { deduplicateMatchesByEventId } from "@/app/util/data/matchDeduplication";
import type { SofascoreMatch } from "@/types/sofascore";

function extractSeasonYear(value: unknown): number | null {
    const years = Array.from(String(value ?? "").matchAll(/\b(?:19|20)\d{2}\b/g), (match) => Number(match[0]));
    if (years.length === 0) return null;
    return Math.max(...years.filter(Number.isFinite));
}

function seasonIdentity(value: string): string {
    const year = extractSeasonYear(value);
    return year == null ? `label:${value.trim().toLowerCase()}` : `year:${year}`;
}

function matchSeasonLabel(match: SofascoreMatch): string {
    const declaredSeason = String(match.season ?? "").trim();
    if (declaredSeason) return declaredSeason;
    return String(extractSeasonYear(match.date) ?? "");
}

function preferSeasonLabel(current: string | undefined, candidate: string): string {
    if (!current) return candidate;
    const currentIsYear = /^\d{4}$/.test(current);
    const candidateIsYear = /^\d{4}$/.test(candidate);
    if (currentIsYear !== candidateIsYear) return candidateIsYear ? current : candidate;
    return candidate.length > current.length ? candidate : current;
}

export function compareSeasonLabels(a: string, b: string): number {
    const aYear = extractSeasonYear(a);
    const bYear = extractSeasonYear(b);
    if (aYear != null && bYear != null && aYear !== bYear) return aYear - bYear;
    if (aYear != null && bYear == null) return 1;
    if (aYear == null && bYear != null) return -1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export interface SeasonSelection {
    seasons: string[];
    selectedSeason: string;
    matches: SofascoreMatch[];
}

export function resolveSeasonSelection(matches: SofascoreMatch[], requestedSeason?: string): SeasonSelection {
    const labelsByIdentity = new Map<string, string>();
    for (const match of matches) {
        const label = matchSeasonLabel(match);
        if (!label) continue;
        const identity = seasonIdentity(label);
        labelsByIdentity.set(identity, preferSeasonLabel(labelsByIdentity.get(identity), label));
    }

    const seasons = Array.from(labelsByIdentity.values()).sort(compareSeasonLabels);
    const requestedIdentity = requestedSeason?.trim() ? seasonIdentity(requestedSeason) : null;
    const selectedIdentity = requestedIdentity && labelsByIdentity.has(requestedIdentity)
        ? requestedIdentity
        : seasons.length > 0
            ? seasonIdentity(seasons[seasons.length - 1])
            : null;
    const selectedSeason = selectedIdentity ? (labelsByIdentity.get(selectedIdentity) ?? "") : "";
    const selectedMatches = selectedIdentity
        ? matches.filter((match) => seasonIdentity(matchSeasonLabel(match)) === selectedIdentity)
        : matches;

    return {
        seasons,
        selectedSeason,
        matches: deduplicateMatchesByEventId(selectedMatches),
    };
}
