import type { SofascoreMatch } from "@/types/sofascore";
import {
    isInactiveMatchStatus,
    matchStatusPriority,
    normalizeMatchStatus,
} from "@/app/util/data/matchStatus";

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

function matchQuality(match: SofascoreMatch): number {
    const completeFields = COMPLETENESS_FIELDS.reduce(
        (total, field) => total + (match[field] == null ? 0 : 1),
        0,
    );
    return matchStatusPriority(match.status) * 100 + completeFields;
}

function normalizeMatch(match: SofascoreMatch): SofascoreMatch {
    const status = normalizeMatchStatus(match.status);
    if (!isInactiveMatchStatus(status)) return { ...match, status };

    return {
        ...match,
        status,
        home_score: null,
        away_score: null,
        home_score_ht: null,
        away_score_ht: null,
        home_score_et: null,
        away_score_et: null,
        home_score_pen: null,
        away_score_pen: null,
    };
}

export function deduplicateMatchesByEventId(matches: SofascoreMatch[]): SofascoreMatch[] {
    const selected = new Map<number, { match: SofascoreMatch; quality: number }>();

    for (const sourceMatch of matches) {
        const match = normalizeMatch(sourceMatch);
        const quality = matchQuality(match);
        const current = selected.get(match.event_id);
        if (!current || quality >= current.quality) {
            selected.set(match.event_id, { match, quality });
        }
    }

    return Array.from(selected.values(), ({ match }) => match);
}
