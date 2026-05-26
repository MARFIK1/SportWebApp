"use client";

import { PredictionMatch, ConsensusPrediction } from "@/types/predictions";
import MatchCard from "./MatchCard";
import LeagueSectionToggle from "./LeagueSectionToggle";
import { useLanguage } from "@/app/components/common/LanguageProvider";
import { getTeamFavoriteKey } from "@/app/util/favorites/favorites";

interface LeagueSectionProps {
    leagueName: string;
    slug: string;
    matches: PredictionMatch[];
    teamIds: Record<string, number>;
    eventIds: Record<string, number>;
    selectedDate: string;
    defaultOpen: boolean;
    isFavorite: boolean;
    favoriteTeamKeys: Set<string>;
    onToggleLeagueFavorite: (slug: string) => void;
    onToggleTeamFavorite: (teamKey: string) => void;
}

function getLeagueAccuracy(matches: PredictionMatch[]): { correct: number; total: number } | null {
    const finished = matches.filter((m) => m.status === "finished" && m.actual_result);
    if (finished.length === 0) return null;

    let correct = 0;
    for (const m of finished) {
        const consensus = m.predictions.consensus as ConsensusPrediction;
        if (consensus?.prediction === m.actual_result) correct++;
    }

    return { correct, total: finished.length };
}

function startTimeRank(match: PredictionMatch): number {
    const matchTime = match.start_time?.match(/^(\d{1,2}):(\d{2})/);
    if (!matchTime) return Number.MAX_SAFE_INTEGER;
    return Number(matchTime[1]) * 60 + Number(matchTime[2]);
}

function sortMatchesByKickoff(matches: PredictionMatch[]): PredictionMatch[] {
    return [...matches].sort((a, b) => {
        const timeDiff = startTimeRank(a) - startTimeRank(b);
        if (timeDiff !== 0) return timeDiff;
        return `${a.home_team} ${a.away_team}`.localeCompare(`${b.home_team} ${b.away_team}`);
    });
}

export default function LeagueSection({
    leagueName,
    slug,
    matches,
    teamIds,
    eventIds,
    selectedDate,
    defaultOpen,
    isFavorite,
    favoriteTeamKeys,
    onToggleLeagueFavorite,
    onToggleTeamFavorite,
}: LeagueSectionProps) {
    const { t } = useLanguage();
    const accuracy = getLeagueAccuracy(matches);

    const finished = sortMatchesByKickoff(matches.filter((m) => m.status === "finished"));
    const scheduled = sortMatchesByKickoff(matches.filter((m) => m.status !== "finished"));

    function renderMatchList(list: PredictionMatch[]) {
        return (
            <div className="grid gap-4 pb-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {list.map((match) => (
                    (() => {
                        const homeTeamId = teamIds[match.home_team] ?? null;
                        const awayTeamId = teamIds[match.away_team] ?? null;
                        const homeFavoriteKey = getTeamFavoriteKey(homeTeamId, match.home_team);
                        const awayFavoriteKey = getTeamFavoriteKey(awayTeamId, match.away_team);

                        return (
                            <MatchCard
                                key={match.id}
                                match={match}
                                homeTeamId={homeTeamId}
                                awayTeamId={awayTeamId}
                                eventId={match.event_id ?? eventIds[`${match.home_team}_vs_${match.away_team}_${selectedDate}`] ?? null}
                                date={selectedDate}
                                homeTeamFavorite={favoriteTeamKeys.has(homeFavoriteKey)}
                                awayTeamFavorite={favoriteTeamKeys.has(awayFavoriteKey)}
                                onToggleHomeTeamFavorite={() => onToggleTeamFavorite(homeFavoriteKey)}
                                onToggleAwayTeamFavorite={() => onToggleTeamFavorite(awayFavoriteKey)}
                            />
                        );
                    })()
                ))}
            </div>
        );
    }

    return (
        <LeagueSectionToggle
            leagueName={leagueName}
            slug={slug}
            matchCount={matches.length}
            statusText={finished.length > 0 ? `${finished.length} ${t("finished")}` : `${scheduled.length} ${t("scheduled")}`}
            accuracy={accuracy}
            defaultOpen={defaultOpen}
            isFavorite={isFavorite}
            onToggleFavorite={() => onToggleLeagueFavorite(slug)}
            labels={{
                matchesCount: t("matches_count"),
                accuracy: t("accuracy"),
                viewStandings: t("view_standings"),
                expandLeague: t("expand_league"),
                collapseLeague: t("collapse_league"),
                favoriteLeague: t("favorite_league"),
                unfavoriteLeague: t("unfavorite_league"),
            }}
        >

            {finished.length > 0 && renderMatchList(finished)}

            {finished.length > 0 && scheduled.length > 0 && (
                <div className="flex items-center gap-3 py-3 px-2">
                    <div className="flex-1 border-t border-gray-300 dark:border-gray-600" />
                    <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">{t("scheduled")}</span>
                    <div className="flex-1 border-t border-gray-300 dark:border-gray-600" />
                </div>
            )}

            {scheduled.length > 0 && renderMatchList(scheduled)}
        </LeagueSectionToggle>
    );
}
