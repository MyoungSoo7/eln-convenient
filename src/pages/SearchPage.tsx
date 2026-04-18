import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search as SearchIcon,
  FileText,
  BookOpen,
  Package,
  Clock,
  Star,
  Loader2,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { HelpTooltip } from "@/components/HelpTooltip";
import { search as searchFn, type SearchResult } from "@/api/search";
const searchApi = { search: searchFn };
import { useSearchHistory } from "@/hooks/useSearchHistory";

const DEBOUNCE_MS = 300;

/** 하이라이트된 텍스트 또는 기본 snippet 표시 */
function Snippet({ result }: { result: SearchResult }) {
  const parts =
    result.highlight?.content ??
    result.highlight?.title ??
    result.highlight?.name ??
    result.highlight?.description;
  const text = parts?.[0] ?? result.snippet;
  if (!text) return null;
  const isHighlight = Boolean(parts?.[0]);
  return (
    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
      {isHighlight ? <span dangerouslySetInnerHTML={{ __html: text.replace(/<(?!\/?(em)>)[^>]*>/gi, '') }} /> : text}
    </p>
  );
}

export default function SearchPage() {
  const { t } = useTranslation('searchPage');
  const { t: tc } = useTranslation('common');

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const {
    recentSearches,
    addRecentSearch,
    clearRecent,
    favoriteSearches,
    removeFavorite,
    isFavorite,
    toggleFavorite,
  } = useSearchHistory();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const hasQuery = debouncedQuery.length > 0;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: async () => {
      const res = await searchApi.search(debouncedQuery, undefined, 1, 20);
      if (!res.ok) throw new Error(res.error ?? t('searchFailed'));
      return res.data;
    },
    enabled: hasQuery,
  });

  // 검색 성공 시 최근 검색에 추가
  useEffect(() => {
    if (hasQuery && data && !isLoading && !isError) {
      addRecentSearch(debouncedQuery);
    }
  }, [hasQuery, debouncedQuery, data, isLoading, isError, addRecentSearch]);

  const notes = data?.notes ?? [];
  const protocols = data?.protocols ?? [];
  const inventory = data?.inventory ?? [];
  const total = data?.total ?? 0;
  const currentIsFavorite = isFavorite(debouncedQuery || query.trim());

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          {t('title')}
          <HelpTooltip text={t('titleTooltip')} />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('subtitle')}
        </p>
      </div>

      <div className="max-w-2xl space-y-2">
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder={t('placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-12 h-12 text-base shadow-card"
              autoFocus
            />
          </div>
          {(query.trim() || debouncedQuery) && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-12 w-12 shrink-0"
              title={currentIsFavorite ? t('removeFavorite') : t('addFavorite')}
              onClick={() => toggleFavorite(query.trim() || debouncedQuery)}
            >
              <Star
                className={`h-5 w-5 ${currentIsFavorite ? "fill-amber-500 text-amber-500" : ""}`}
              />
            </Button>
          )}
        </div>
        {hasQuery && (
          <p className="text-xs text-muted-foreground">
            {currentIsFavorite
              ? t('isFavoriteHint')
              : t('notFavoriteHint')}
          </p>
        )}
      </div>

      {!hasQuery ? (
        <div className="max-w-2xl space-y-6">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" /> {t('recentSearches')}
                <HelpTooltip text={t('recentTooltip')} />
              </h3>
              {recentSearches.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-8"
                  onClick={clearRecent}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> {t('clearRecent')}
                </Button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {recentSearches.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('noRecent')}</p>
              ) : (
                recentSearches.map((s) => (
                  <Badge
                    key={s}
                    variant="secondary"
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => setQuery(s)}
                  >
                    {s}
                  </Badge>
                ))
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
              <Star className="h-4 w-4 text-amber-500" /> {t('favorites')}
              <HelpTooltip text={t('favoritesTooltip')} />
            </h3>
            <div className="flex gap-2 flex-wrap">
              {favoriteSearches.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('noFavorites')}</p>
              ) : (
                favoriteSearches.map((s) => (
                  <Badge
                    key={s}
                    variant="secondary"
                    className="cursor-pointer hover:bg-accent gap-1 pr-1"
                    onClick={() => setQuery(s)}
                  >
                    {s}
                    <button
                      type="button"
                      className="ml-0.5 rounded p-0.5 hover:bg-muted"
                      aria-label={`${s} ${t('removeFavorite')}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFavorite(s);
                      }}
                    >
                      ×
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{t('searching')}</span>
            </div>
          )}
          {isError && (
            <p className="text-sm text-destructive py-4">
              {(error as Error)?.message ?? t('searchError')}
            </p>
          )}
          {!isLoading && !isError && (
            <Tabs defaultValue="notes" className="max-w-4xl">
              <TabsList>
                <TabsTrigger value="notes" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> {t('tab.notes')} ({notes.length})
                </TabsTrigger>
                <TabsTrigger value="protocols" className="gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" /> {t('tab.protocols')} ({protocols.length})
                </TabsTrigger>
                <TabsTrigger value="inventory" className="gap-1.5">
                  <Package className="h-3.5 w-3.5" /> {t('tab.inventory')} ({inventory.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="notes" className="space-y-3 mt-4">
                {notes.map((r) => (
                  <Link key={`note-${r.id}`} to={`/notes/${r.id}`}>
                    <Card className="shadow-card hover:shadow-elevated transition-all cursor-pointer">
                      <CardContent className="p-4">
                        <h3 className="font-medium">{r.title}</h3>
                        <Snippet result={r} />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
                {notes.length === 0 && (
                  <p className="text-sm text-muted-foreground py-8 text-center">{t('noResults')}</p>
                )}
              </TabsContent>

              <TabsContent value="protocols" className="space-y-3 mt-4">
                {protocols.map((r) => (
                  <Link key={`protocol-${r.id}`} to={`/protocols`}>
                    <Card className="shadow-card hover:shadow-elevated transition-all cursor-pointer">
                      <CardContent className="p-4">
                        <h3 className="font-medium">{r.title}</h3>
                        <Snippet result={r} />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
                {protocols.length === 0 && (
                  <p className="text-sm text-muted-foreground py-8 text-center">{t('noResults')}</p>
                )}
              </TabsContent>

              <TabsContent value="inventory" className="space-y-3 mt-4">
                {inventory.map((r) => (
                  <Link key={`inventory-${r.id}`} to={`/inventory`}>
                    <Card className="shadow-card hover:shadow-elevated transition-all cursor-pointer">
                      <CardContent className="p-4">
                        <h3 className="font-medium">{r.title}</h3>
                        <Snippet result={r} />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
                {inventory.length === 0 && (
                  <p className="text-sm text-muted-foreground py-8 text-center">{t('noResults')}</p>
                )}
              </TabsContent>
            </Tabs>
          )}
          {!isLoading && !isError && total > 0 && (
            <p className="text-xs text-muted-foreground">{t('total', { total })}</p>
          )}
        </>
      )}
    </div>
  );
}
