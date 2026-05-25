export interface FavoriteState {
    leagues: string[];
    teams: string[];
}

export const EMPTY_FAVORITES: FavoriteState = {
    leagues: [],
    teams: [],
};

export const FAVORITES_STORAGE_KEY = "sportwebapp.favorites.v1";

export function parseFavoriteState(raw: string | null): FavoriteState {
    if (!raw) return EMPTY_FAVORITES;

    try {
        const parsed = JSON.parse(raw) as Partial<FavoriteState>;
        return {
            leagues: Array.isArray(parsed.leagues) ? parsed.leagues.filter((item) => typeof item === "string") : [],
            teams: Array.isArray(parsed.teams) ? parsed.teams.filter((item) => typeof item === "string") : [],
        };
    } catch {
        return EMPTY_FAVORITES;
    }
}

export function readFavoritesFromStorage(storage: Pick<Storage, "getItem">): FavoriteState {
    return parseFavoriteState(storage.getItem(FAVORITES_STORAGE_KEY));
}

export function writeFavoritesToStorage(storage: Pick<Storage, "setItem">, favorites: FavoriteState) {
    storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
}

export function getTeamFavoriteKey(teamId: number | null, teamName: string): string {
    return teamId ? `id:${teamId}` : `name:${teamName.trim().toLowerCase()}`;
}

export function toggleFavoriteValue(values: string[], value: string): string[] {
    return values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value].sort((a, b) => a.localeCompare(b));
}
