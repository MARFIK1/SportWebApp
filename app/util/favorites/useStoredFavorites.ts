"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
    EMPTY_FAVORITES,
    type FavoriteState,
    readFavoritesFromStorage,
    writeFavoritesToStorage,
} from "./favorites";

export function useStoredFavorites(): [FavoriteState, Dispatch<SetStateAction<FavoriteState>>] {
    const [favorites, setFavorites] = useState<FavoriteState>(EMPTY_FAVORITES);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setFavorites(readFavoritesFromStorage(window.localStorage));
            setLoaded(true);
        }, 0);

        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (loaded) {
            writeFavoritesToStorage(window.localStorage, favorites);
        }
    }, [favorites, loaded]);

    return [favorites, setFavorites];
}
