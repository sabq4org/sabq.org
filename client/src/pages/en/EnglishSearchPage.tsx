import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, SearchX, AlertCircle } from "lucide-react";
import { EnglishLayout } from "@/components/en/EnglishLayout";
import { EnglishFooter } from "@/components/en/EnglishFooter";
import { NewsArticleCard } from "@/components/NewsArticleCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalyticsPageMetadata } from "@/hooks/use-analytics";
import type { ArticleWithDetails } from "@shared/schema";
import {
  EN_SEARCH_MAX_QUERY,
  enSearchTotalPages,
  normalizeEnSearchQuery,
  parseEnSearchPage,
  type EnSearchResponse,
} from "@shared/enSearch";

function searchHref(q: string, page: number): string {
  const params = new URLSearchParams({ q });
  if (page > 1) params.set("page", String(page));
  return `/en/search?${params.toString()}`;
}

export default function EnglishSearchPage() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);
  const query = normalizeEnSearchQuery(params.get("q") ?? "");
  const page = parseEnSearchPage(params.get("page") ?? "1");
  const [input, setInput] = useState(query ?? "");

  useEffect(() => {
    setInput(query ?? "");
  }, [query]);

  useAnalyticsPageMetadata(query ? `Search: ${query} | Sabq` : "Search | Sabq");

  const { data, isLoading, isError, refetch } = useQuery<EnSearchResponse | null>({
    queryKey: ["/api/en/search", { q: query ?? "", page }],
    enabled: !!query,
    staleTime: 60_000,
  });
  const articles = Array.isArray(data?.articles) ? data.articles : [];
  const total = typeof data?.total === "number" ? data.total : 0;
  const totalPages = enSearchTotalPages(total);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const next = normalizeEnSearchQuery(input);
    if (next) setLocation(searchHref(next, 1));
  };

  const goToPage = (next: number) => {
    if (!query) return;
    setLocation(searchHref(query, next));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <EnglishLayout>
      <div className="public-page-header bg-gradient-to-br from-primary/10 to-primary/5 py-10 sm:py-14">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="public-page-title text-3xl sm:text-4xl font-bold mb-6">Search</h1>
          <form onSubmit={onSubmit} role="search" className="flex gap-2 max-w-2xl">
            <Input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search English news…"
              aria-label="Search English news"
              maxLength={EN_SEARCH_MAX_QUERY}
              autoFocus={!query}
              className="h-11 text-base"
              data-testid="input-en-search"
            />
            <Button type="submit" className="h-11" disabled={!normalizeEnSearchQuery(input)} data-testid="button-en-search">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </form>
        </div>
      </div>

      <div className="public-container container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {!query ? (
          <p className="text-muted-foreground text-center py-16" data-testid="text-en-search-prompt">
            Type at least two characters to search Sabq's English edition.
          </p>
        ) : isLoading ? (
          <div className="space-y-4" data-testid="state-en-search-loading">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-16" data-testid="state-en-search-error">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4">We couldn't load the results. Please try again.</p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-16" data-testid="state-en-search-empty">
            <SearchX className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-bold mb-2">No results</h2>
            <p className="text-muted-foreground">
              No English articles match “{query}”. Try different or fewer words.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-6" data-testid="text-en-search-count">
              {total.toLocaleString("en-US")} {total === 1 ? "result" : "results"} for “{query}”
            </p>
            <div className="flex flex-col gap-4">
              {articles.map((article, index) => (
                <NewsArticleCard
                  key={article.id}
                  article={article as unknown as ArticleWithDetails}
                  viewMode="list"
                  locale="en"
                  priority={index < 2}
                  href={`/en/article/${article.englishSlug || article.slug}`}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <nav className="flex items-center justify-center gap-4 mt-10" aria-label="Search results pages">
                <Button variant="outline" disabled={page <= 1} onClick={() => goToPage(page - 1)} data-testid="button-en-search-prev">
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button variant="outline" disabled={page >= totalPages} onClick={() => goToPage(page + 1)} data-testid="button-en-search-next">
                  Next
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
      <EnglishFooter />
    </EnglishLayout>
  );
}
