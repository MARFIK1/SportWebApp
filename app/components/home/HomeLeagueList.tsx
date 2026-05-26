"use client";

import { useMemo, useState } from "react";
import { StarIcon } from "@heroicons/react/24/solid";
import type { PredictionMatch } from "@/types/predictions";
import { useLanguage } from "@/app/components/common/LanguageProvider";
import {
    EMPTY_FAVORITES,
    getTeamFavoriteKey,
    toggleFavoriteValue,
} from "@/app/util/favorites/favorites";
import { useStoredFavorites } from "@/app/util/favorites/useStoredFavorites";
import LeagueSection from "./LeagueSection";

interface LeagueSectionData {
    dataPath: string;
    leagueName: string;
    slug: string;
    defaultOpen: boolean;
    matches: PredictionMatch[];
}

interface HomeLeagueListProps {
    sections: LeagueSectionData[];
    teamIds: Record<string, number>;
    eventIds: Record<string, number>;
    selectedDate: string;
}

type ViewMode = "all" | "favorites";

export default function HomeLeagueList({ sections, teamIds, eventIds, selectedDate }: HomeLeagueListProps) {
    const { t } = useLanguage();
    const [viewMode, setViewMode] = useState<ViewMode>("all");
    const [favorites, setFavorites] = useStoredFavorites();

    const favoriteLeagueSlugs = useMemo(() => new Set(favorites.leagues), [favorites.leagues]);
    const favoriteTeamKeys = useMemo(() => new Set(favorites.teams), [favorites.teams]);
    const favoriteCount = favorites.leagues.length + favorites.teams.length;

    const toggleLeagueFavorite = (slug: string) => {
        setFavorites((current) => ({
            ...current,
            leagues: toggleFavoriteValue(current.leagues, slug),
        }));
    };

    const toggleTeamFavorite = (teamKey: string) => {
        setFavorites((current) => ({
            ...current,
            teams: toggleFavoriteValue(current.teams, teamKey),
        }));
    };

    const clearFavorites = () => {
        setFavorites(EMPTY_FAVORITES);
    };

    const visibleSections = useMemo(() => {
        if (viewMode === "all") return sections;

        return sections.flatMap((section) => {
            if (favoriteLeagueSlugs.has(section.slug)) {
                return [{ ...section, defaultOpen: true }];
            }

            const favoriteMatches = section.matches.filter((match) => {
                const homeKey = getTeamFavoriteKey(teamIds[match.home_team] ?? null, match.home_team);
                const awayKey = getTeamFavoriteKey(teamIds[match.away_team] ?? null, match.away_team);
                return favoriteTeamKeys.has(homeKey) || favoriteTeamKeys.has(awayKey);
            });

            return favoriteMatches.length > 0
                ? [{ ...section, matches: favoriteMatches, defaultOpen: true }]
                : [];
        });
    }, [favoriteLeagueSlugs, favoriteTeamKeys, sections, teamIds, viewMode]);

    return (
        <div className="mt-6 space-y-6">
            <div className="flex flex-col gap-3 rounded-3xl border border-gray-200 bg-white/60 p-3 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-white/10 dark:bg-gray-950/20 dark:shadow-black/10 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 px-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                        <StarIcon className="h-5 w-5 text-amber-400" aria-hidden="true" />
                        <span>{t("favorites")}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {favoriteCount > 0
                            ? `${favoriteCount} ${t("favorites_saved")}`
                            : t("favorites_hint")}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-2xl border border-gray-200 bg-white/70 p-1 dark:border-white/10 dark:bg-gray-900/60">
                        {(["all", "favorites"] as const).map((mode) => {
                            const active = viewMode === mode;
                            return (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setViewMode(mode)}
                                    className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                                        active
                                            ? "bg-emerald-500 text-white shadow-sm shadow-emerald-950/20"
                                            : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                                    }`}
                                >
                                    {mode === "all" ? t("filter_all_matches") : t("favorites_only")}
                                </button>
                            );
                        })}
                    </div>

                    {favoriteCount > 0 && (
                        <button
                            type="button"
                            onClick={clearFavorites}
                            className="rounded-2xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-500 transition-colors hover:border-rose-400/40 hover:text-rose-500 dark:border-white/10 dark:text-gray-400 dark:hover:text-rose-300"
                        >
                            {t("clear_favorites")}
                        </button>
                    )}
                </div>
            </div>

            {visibleSections.length > 0 ? (
                visibleSections.map(({ dataPath, leagueName, slug, defaultOpen, matches }) => (
                    <LeagueSection
                        key={dataPath}
                        leagueName={leagueName}
                        slug={slug}
                        matches={matches}
                        teamIds={teamIds}
                        eventIds={eventIds}
                        selectedDate={selectedDate}
                        defaultOpen={defaultOpen}
                        isFavorite={favoriteLeagueSlugs.has(slug)}
                        favoriteTeamKeys={favoriteTeamKeys}
                        onToggleLeagueFavorite={toggleLeagueFavorite}
                        onToggleTeamFavorite={toggleTeamFavorite}
                    />
                ))
            ) : (
                <div className="rounded-3xl border border-dashed border-gray-300 bg-white/50 p-8 text-center dark:border-white/10 dark:bg-gray-950/20">
                    <p className="text-lg font-black text-gray-900 dark:text-white">{t("favorites_empty_title")}</p>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t("favorites_empty_body")}</p>
                </div>
            )}
        </div>
    );
}
