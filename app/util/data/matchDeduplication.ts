import type { SofascoreMatch } from "@/types/sofascore";

const COMPLETENESS_FIELDS: Array<keyof SofascoreMatch> = [
    "home_score",
    "away_score",
    "home_score_ht",
    "away_score_ht",
    "home_score_et",
    "away_score_et",
    "home_score_pen",
    "away_score_pen",
    "home_expectedgoals",
    "away_expectedgoals",
    "home_ballpossession",
    "away_ballpossession",
];

function statusRank(status: string): number {
    const normalized = String(status ?? "").trim().toLowerCase();
    if (normalized === "finished") return 4;
    if (normalized === "inprogress") return 3;
    if (normalized === "postponed" || normalized === "cancelled") return 2;
    return 1;
}

function matchQuality(match: SofascoreMatch): number {
    const completeFields = COMPLETENESS_FIELDS.reduce(
        (total, field) => total + (match[field] == null ? 0 : 1),
        0,
    );
    return statusRank(match.status) * 100 + completeFields;
}

export function deduplicateMatchesByEventId(matches: SofascoreMatch[]): SofascoreMatch[] {
    const selected = new Map<number, { match: SofascoreMatch; quality: number }>();

    for (const match of matches) {
        const quality = matchQuality(match);
        const current = selected.get(match.event_id);
        if (!current || quality >= current.quality) {
            selected.set(match.event_id, { match, quality });
        }
    }

    return Array.from(selected.values(), ({ match }) => match);
}
