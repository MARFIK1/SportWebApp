import { deduplicateMatchesByEventId } from "@/app/util/data/matchDeduplication";
import type { SofascoreMatch } from "@/types/sofascore";

function expandSeasonYear(value: number, referenceYear?: number): number {
    if (value >= 100) return value;
    if (referenceYear == null) return 2000 + value;

    const century = Math.floor(referenceYear / 100) * 100;
    const expanded = century + value;
    return expanded < referenceYear ? expanded + 100 : expanded;
}

function extractSeasonYear(value: unknown): number | null {
    const label = String(value ?? "");
    const isIsoDate = /^\d{4}-\d{1,2}-\d{1,2}(?:[T\s]|$)/.test(label.trim());
    const seasonSpan = isIsoDate
        ? null
        : label.match(/\b((?:19|20)\d{2}|\d{2})\s*[/-]\s*((?:19|20)\d{2}|\d{2})\b/);
    if (seasonSpan) {
        const startYear = expandSeasonYear(Number(seasonSpan[1]));
        return expandSeasonYear(Number(seasonSpan[2]), startYear);
    }

    const years = Array.from(label.matchAll(/\b(?:19|20)\d{2}\b/g), (match) => Number(match[0]));
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
