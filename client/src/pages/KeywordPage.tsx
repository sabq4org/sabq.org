import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useState, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Clock, Tag, Zap, Eye, BarChart3,
  Bell, BellOff, Filter, Newspaper, FileText,
  PenTool, Sparkles, Home,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import type { ArticleWithDetails } from "@shared/schema";
import { Header } from "@/components/Header";
import { OptimizedImage } from "@/components/OptimizedImage";
import { NewsArticleCard } from "@/components/NewsArticleCard";
import { queryClient, apiRequest, apiUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const isNewArticle = (publishedAt: Date | string | null | undefined) => {
  if (!publishedAt) return false;
  const published = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  const now = new Date();
  const diffInHours = (now.getTime() - published.getTime()) / (1000 * 60 * 60);
  return diffInHours <= 3;
};

type SortOption = 'newest' | 'oldest' | 'views' | 'comments';
type FilterOption = 'all' | 'news' | 'opinion' | 'analysis' | 'infographic';

type MuqtarabKeywordTopic = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  heroImageUrl: string | null;
  publishedAt: string | null;
  viewCount: number;
  angleSlug: string;
  angleNameAr: string;
  angleColorHex: string | null;
};

type KeywordResponse = {
  articles: ArticleWithDetails[];
  muqtarabTopics: MuqtarabKeywordTopic[];
};

export default function KeywordPage() {
  const params = useParams();
  const keyword = decodeURIComponent(params.keyword || "");
  const { toast } = useToast();
  
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  const { data: user } = useQuery<{ id: string; name?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: keywordData, isLoading } = useQuery<KeywordResponse>({
    queryKey: ["/api/keyword", keyword],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/keyword/${encodeURIComponent(keyword)}`), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch articles");
      const data = await res.json();
      if (Array.isArray(data)) {
        return { articles: data, muqtarabTopics: [] };
      }
      return {
        articles: Array.isArray(data.articles) ? data.articles : [],
        muqtarabTopics: Array.isArray(data.muqtarabTopics) ? data.muqtarabTopics : [],
      };
    },
  });

  const articles = keywordData?.articles ?? [];
  const muqtarabTopics = keywordData?.muqtarabTopics ?? [];

  const { data: followedKeywords } = useQuery<any[]>({
    queryKey: ["/api/keywords/followed"],
    enabled: !!user,
  });

  const isFollowing = useMemo(() => {
    if (!followedKeywords) return false;
    return followedKeywords.some(f => 
      f.tag?.nameAr?.toLowerCase() === keyword.toLowerCase() ||
      f.tag?.slug === keyword.toLowerCase().replace(/\s+/g, '-')
    );
  }, [followedKeywords, keyword]);

  const followMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/keywords/follow", {
        method: "POST",
        body: JSON.stringify({ keyword }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keywords/followed"] });
      toast({ title: "تمت المتابعة", description: `أنت الآن تتابع "${keyword}"` });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      const followed = followedKeywords?.find(f => 
        f.tag?.nameAr?.toLowerCase() === keyword.toLowerCase()
      );
      if (followed?.tagId) {
        return apiRequest(`/api/keywords/unfollow/${followed.tagId}`, {
          method: "DELETE",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keywords/followed"] });
      toast({ title: "تم إلغاء المتابعة" });
    },
  });

  const stats = useMemo(() => {
    const articleViews = articles.reduce((sum, a) => sum + (a.views || 0), 0);
    const topicViews = muqtarabTopics.reduce((sum, t) => sum + (t.viewCount || 0), 0);
    const latestArticle = articles[0]?.publishedAt;
    const latestTopic = muqtarabTopics[0]?.publishedAt;
    const latest =
      latestArticle && latestTopic
        ? new Date(latestArticle) > new Date(latestTopic)
          ? latestArticle
          : latestTopic
        : latestArticle || latestTopic || null;

    return {
      total: articles.length + muqtarabTopics.length,
      articleCount: articles.length,
      topicCount: muqtarabTopics.length,
      views: articleViews + topicViews,
      latest,
      breaking: articles.filter((a) => a.newsType === "breaking").length,
    };
  }, [articles, muqtarabTopics]);

  const filteredAndSortedArticles = useMemo(() => {
    if (!articles) return [];
    
    let result = [...articles];
    
    if (filterBy !== 'all') {
      result = result.filter(a => a.articleType === filterBy);
    }
    
    result.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.publishedAt || 0).getTime() - new Date(b.publishedAt || 0).getTime();
        case 'views':
          return (b.views || 0) - (a.views || 0);
        case 'comments':
          return (b.commentsCount || 0) - (a.commentsCount || 0);
        case 'newest':
        default:
          return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
      }
    });
    
    return result;
  }, [articles, sortBy, filterBy]);

  const articleTypeCounts = useMemo(() => {
    if (!articles) return {};
    return articles.reduce((acc, a) => {
      const type = a.articleType || 'news';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [articles]);

  const filterLabels: Record<FilterOption, { label: string; icon: typeof Newspaper }> = {
    all: { label: 'الكل', icon: Filter },
    news: { label: 'أخبار', icon: Newspaper },
    opinion: { label: 'رأي', icon: PenTool },
    analysis: { label: 'تحليل', icon: FileText },
    infographic: { label: 'إنفوجرافيك', icon: BarChart3 },
  };

  const sortLabels: Record<SortOption, string> = {
    newest: 'الأحدث',
    oldest: 'الأقدم',
    views: 'الأكثر مشاهدة',
    comments: 'الأكثر تعليقاً',
  };

  return (
    <div className="public-page keyword-listing-page min-h-screen flex flex-col bg-background" dir="rtl">
      <Header user={user} />

      <main className="flex-1">
        <div
          className="public-page-header keyword-page-header relative overflow-hidden border-b border-[#e3ebf2] bg-[#f4f8fb] text-[#10202e] dark:border-border dark:bg-[#171e29] dark:text-foreground"
          data-testid="keyword-header"
        >
          <div className="public-container container relative mx-auto px-4 sm:px-6 lg:px-8">
            <nav
              className="mb-2 flex items-center text-xs text-[#6b7c8a] sm:text-sm dark:text-muted-foreground"
              aria-label="مسار الصفحة"
            >
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 leading-none hover:text-primary transition-colors"
              >
                <Home className="h-3.5 w-3.5" />
                الرئيسية
              </Link>
            </nav>

            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-11 sm:w-11">
                  <Tag className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                </div>
                <h1 className="public-page-title" data-testid="text-keyword-title">
                  {keyword}
                </h1>
              </div>

              {user && (
                <Button
                  size="sm"
                  variant={isFollowing ? "outline" : "default"}
                  onClick={() => isFollowing ? unfollowMutation.mutate() : followMutation.mutate()}
                  disabled={followMutation.isPending || unfollowMutation.isPending}
                  className="h-10 shrink-0 gap-2"
                  data-testid="button-follow-keyword"
                >
                  {isFollowing ? (
                    <>
                      <BellOff className="h-4 w-4" />
                      <span className="hidden sm:inline">إلغاء المتابعة</span>
                      <span className="sm:hidden">إلغاء</span>
                    </>
                  ) : (
                    <>
                      <Bell className="h-4 w-4" />
                      متابعة
                    </>
                  )}
                </Button>
              )}
            </div>

            {!isLoading && (
              <div className="mt-2 flex items-center gap-x-3 gap-y-1 overflow-x-auto text-xs text-[#6b7c8a] sm:mt-3 sm:gap-x-4 sm:text-sm dark:text-muted-foreground [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <span className="flex shrink-0 items-center gap-1.5">
                  <Newspaper className="h-3.5 w-3.5" />
                  <strong className="tabular-nums text-foreground">{formatNumber(stats.articleCount)}</strong> مقال
                </span>
                {stats.topicCount > 0 && (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    <strong className="tabular-nums text-foreground">{formatNumber(stats.topicCount)}</strong> موضوع مُقترب
                  </span>
                )}
                <span className="flex shrink-0 items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  <strong className="tabular-nums text-foreground">{formatNumber(stats.views)}</strong> مشاهدة
                </span>
                {stats.breaking > 0 && (
                  <span className="flex shrink-0 items-center gap-1.5 text-destructive">
                    <Zap className="h-3.5 w-3.5" />
                    <strong className="tabular-nums">{formatNumber(stats.breaking)}</strong> عاجل
                  </span>
                )}
                {stats.latest && (
                  <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                    <Clock className="h-3.5 w-3.5" />
                    آخر تحديث {formatRelativeTime(stats.latest)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="public-container container mx-auto px-4 sm:px-6 lg:px-8 pb-4 pt-3 sm:pt-4">
          <div
            className="flex items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            data-testid="keyword-filter-bar"
          >
            {(Object.keys(filterLabels) as FilterOption[]).map((filter) => {
              const { label, icon: Icon } = filterLabels[filter];
              const count = filter === "all" ? stats.total : (articleTypeCounts[filter] || 0);
              if (filter !== "all" && count === 0) return null;

              return (
                <Button
                  key={filter}
                  size="sm"
                  variant={filterBy === filter ? "default" : "outline"}
                  onClick={() => setFilterBy(filter)}
                  className="h-10 shrink-0 gap-1.5 whitespace-nowrap"
                  data-testid={`button-filter-${filter}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  {count > 0 && (
                    <Badge variant="secondary" className="mr-1 h-5 px-1.5 text-xs">
                      {formatNumber(count)}
                    </Badge>
                  )}
                </Button>
              );
            })}

            <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
              <SelectTrigger className="h-10 w-[9rem] shrink-0" data-testid="button-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(sortLabels) as SortOption[]).map((sort) => (
                  <SelectItem key={sort} value={sort} data-testid={`menu-sort-${sort}`}>
                    {sortLabels[sort]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="public-container container mx-auto px-4 sm:px-6 lg:px-8 pb-8">
          {/* Loading State */}
          {isLoading && (
            <div className="space-y-8">
              <Skeleton className="h-28 w-full rounded-xl" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Card key={i} className="overflow-hidden">
                    <Skeleton className="aspect-[16/10] w-full" />
                    <CardContent className="p-4 space-y-2">
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Articles - Mobile List + Desktop Grid */}
          {!isLoading && filteredAndSortedArticles.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {filteredAndSortedArticles.map((article, index) => (
                  <NewsArticleCard key={article.id} article={article} viewMode="grid" metadata={{ views: true }} priority={index < 4} />
                ))}
              </div>
            </>
          )}

          {/* Muqtarab Topics */}
          {!isLoading && filterBy === "all" && muqtarabTopics.length > 0 && (
            <section className="mt-12" data-testid="keyword-muqtarab-topics">
              <div className="flex items-center gap-2 mb-6">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold">مواضيع مُقترب</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {muqtarabTopics.map((topic) => {
                  const timeAgo = topic.publishedAt
                    ? formatDistanceToNow(new Date(topic.publishedAt), {
                        addSuffix: true,
                        locale: arSA,
                      })
                    : null;

                  return (
                    <Link
                      key={topic.id}
                      href={`/muqtarab/${topic.angleSlug}/topic/${topic.slug}`}
                    >
                      <Card
                        className="h-full hover-elevate active-elevate-2 cursor-pointer group border-0 dark:border dark:border-card-border"
                        data-testid={`card-keyword-muqtarab-${topic.id}`}
                      >
                        {topic.heroImageUrl && (
                          <div className="relative aspect-[16/9] overflow-hidden">
                            <OptimizedImage
                              src={topic.heroImageUrl}
                              alt={topic.title}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              priority={false}
                            />
                          </div>
                        )}
                        <CardContent className="p-5 space-y-3">
                          <Badge
                            variant="secondary"
                            className="text-xs h-5 shrink-0"
                            style={{
                              borderRight: `3px solid ${topic.angleColorHex || "hsl(var(--primary))"}`,
                              backgroundColor: "#e5e5e6",
                            }}
                          >
                            {topic.angleNameAr}
                          </Badge>
                          <h3 className="text-lg font-bold line-clamp-2 group-hover:text-primary transition-colors">
                            {topic.title}
                          </h3>
                          {topic.excerpt && (
                            <p className="hidden text-sm text-muted-foreground line-clamp-3 sm:block">
                              {topic.excerpt}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                            {timeAgo && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {timeAgo}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {formatNumber(topic.viewCount || 0)}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Empty State */}
          {!isLoading && filteredAndSortedArticles.length === 0 && muqtarabTopics.length === 0 && (
            <div className="text-center py-20">
              <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-muted/50 flex items-center justify-center">
                <Tag className="h-12 w-12 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-bold mb-3" data-testid="text-no-articles">
                {filterBy !== 'all' ? 'لا توجد نتائج' : 'لا توجد نتائج'}
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-6">
                {filterBy !== 'all' 
                  ? `لم نجد مقالات من نوع "${filterLabels[filterBy].label}" للكلمة المفتاحية "${keyword}"`
                  : `لم نجد أي مقالات أو مواضيع مُقترب تحتوي على الكلمة المفتاحية "${keyword}"`
                }
              </p>
              {filterBy !== 'all' && (
                <Button variant="outline" onClick={() => setFilterBy('all')}>
                  عرض جميع النتائج
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
