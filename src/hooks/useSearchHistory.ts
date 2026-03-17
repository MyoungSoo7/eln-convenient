import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY_RECENT = "labnote-search-recent";
const STORAGE_KEY_FAVORITES = "labnote-search-favorites";
const MAX_RECENT = 20;

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/** 최근 검색 + 즐겨찾기 (localStorage 연동) */
export function useSearchHistory() {
  const [recent, setRecent] = useState<string[]>(() => loadJson(STORAGE_KEY_RECENT, []));
  const [favorites, setFavorites] = useState<string[]>(() => loadJson(STORAGE_KEY_FAVORITES, []));

  useEffect(() => {
    saveJson(STORAGE_KEY_RECENT, recent);
  }, [recent]);

  useEffect(() => {
    saveJson(STORAGE_KEY_FAVORITES, favorites);
  }, [favorites]);

  const addRecentSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setRecent((prev) => {
      const next = [trimmed, ...prev.filter((x) => x !== trimmed)].slice(0, MAX_RECENT);
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => setRecent([]), []);

  const addFavorite = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setFavorites((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  }, []);

  const removeFavorite = useCallback((q: string) => {
    setFavorites((prev) => prev.filter((x) => x !== q.trim()));
  }, []);

  const isFavorite = useCallback(
    (q: string) => favorites.includes(q.trim()),
    [favorites]
  );

  const toggleFavorite = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      if (favorites.includes(trimmed)) removeFavorite(trimmed);
      else addFavorite(trimmed);
    },
    [favorites, addFavorite, removeFavorite]
  );

  return {
    recentSearches: recent,
    addRecentSearch,
    clearRecent,
    favoriteSearches: favorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    toggleFavorite,
  };
}
