import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useState, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Clock, Tag, Flame, Zap, Eye, BarChart3,
  Bell, BellOff, Filter, SortDesc, Newspaper, FileText,
  PenTool, Brain, Sparkles
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import type { ArticleWithDetails } from "@shared/schema";
import { Header } from "@/components/Header";
import { OptimizedImage } from "@/components/OptimizedImage";

// Format numbers with commas (English numerals)
const formatNumber = (num: number): string => {
  return num.toLocaleString('en-US');
};
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

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
      const res = await fetch(`/api/keyword/${encodeURIComponent(keyword)}`, {
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
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Header user={user} />

      <main className="flex-1">
        {/* Hero Section - Clean & Simple */}
        <div className="border-b bg-card/50">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              {/* Keyword Info */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Tag className="h-5 w-5 text-primary" />
                  </div>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="text-keyword-title">
                    {keyword}
                  </h1>
                </div>
                
                {/* Stats - Inline */}
                {!isLoading && (
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Newspaper className="h-4 w-4" />
                      <strong className="text-foreground">{formatNumber(stats.articleCount)}</strong> مقال
                    </span>
                    {stats.topicCount > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4" />
                        <strong className="text-foreground">{formatNumber(stats.topicCount)}</strong> موضوع مُقترب
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Eye className="h-4 w-4" />
                      <strong className="text-foreground">{formatNumber(stats.views)}</strong> مشاهدة
                    </span>
                    {stats.breaking > 0 && (
                      <span className="flex items-center gap-1.5 text-destructive">
                        <Zap className="h-4 w-4" />
                        <strong>{formatNumber(stats.breaking)}</strong> عاجل
                      </span>
                    )}
                    {stats.latest && (
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        آخر تحديث: {formatDistanceToNow(new Date(stats.latest), { addSuffix: true, locale: arSA })}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Follow Button */}
              {user && (
                <Button
                  size="default"
                  variant={isFollowing ? "outline" : "default"}
                  onClick={() => isFollowing ? unfollowMutation.mutate() : followMutation.mutate()}
                  disabled={followMutation.isPending || unfollowMutation.isPending}
                  className="gap-2"
                  data-testid="button-follow-keyword"
                >
                  {isFollowing ? (
                    <>
                      <BellOff className="h-4 w-4" />
                      إلغاء المتابعة
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
          </div>
        </div>

        {/* Filter & Sort Bar */}
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Filter Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {(Object.keys(filterLabels) as FilterOption[]).map((filter) => {
                  const { label, icon: Icon } = filterLabels[filter];
                  const count = filter === 'all' ? stats.total : (articleTypeCounts[filter] || 0);
                  if (filter !== 'all' && count === 0) return null;
                  
                  return (
                    <Button
                      key={filter}
                      size="sm"
                      variant={filterBy === filter ? "default" : "outline"}
                      onClick={() => setFilterBy(filter)}
                      className="gap-1.5 whitespace-nowrap"
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
              </div>

              {/* Sort Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2" data-testid="button-sort">
                    <SortDesc className="h-4 w-4" />
                    {sortLabels[sortBy]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>ترتيب حسب</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(Object.keys(sortLabels) as SortOption[]).map((sort) => (
                    <DropdownMenuItem
                      key={sort}
                      onClick={() => setSortBy(sort)}
                      className={sortBy === sort ? "bg-accent" : ""}
                      data-testid={`menu-sort-${sort}`}
                    >
                      {sortLabels[sort]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Loading State */}
          {isLoading && (
            <div className="space-y-8">
              <Skeleton className="aspect-[21/9] w-full rounded-2xl" />
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
              {/* Mobile View: Vertical List */}
              <Card className="overflow-hidden lg:hidden border-0 dark:border dark:border-card-border" data-testid="keyword-articles-mobile">
                <CardContent className="p-0">
                  <div className="divide-y dark:divide-y">
                    {filteredAndSortedArticles.map((article) => {
                      const timeAgo = article.publishedAt
                        ? formatDistanceToNow(new Date(article.publishedAt), {
                            addSuffix: true,
                            locale: arSA,
                          })
                        : null;
                      const displayImage = (article as any).infographicBannerUrl || article.imageUrl || article.thumbnailUrl;

                      return (
                        <Link key={article.id} href={`/article/${article.englishSlug || article.slug}`}>
                          <div 
                            className="block group cursor-pointer"
                            data-testid={`link-keyword-article-mobile-${article.id}`}
                          >
                            <div className="p-4 hover-elevate active-elevate-2 transition-all">
                              <div className="flex gap-3">
                                {/* Image */}
                                {displayImage && (
                                  <div className="relative flex-shrink-0 w-24 h-20 rounded-lg overflow-hidden">
                                    <OptimizedImage
                                      src={displayImage}
                                      alt={article.title}
                                      className="w-full h-full object-cover rounded-lg transition-transform duration-500 group-hover:scale-110"
                                      wrapperClassName="w-full h-full"
                                      priority={false}
                                    />
                                  </div>
                                )}

                                {/* Content */}
                                <div className="flex-1 min-w-0 space-y-1.5">
                                  {/* Badges */}
                                  <div className="flex items-center gap-1.5">
                                    {article.newsType === "breaking" ? (
                                      <Badge 
                                        variant="destructive" 
                                        className="text-[10px] h-4 gap-0.5 shrink-0"
                                        data-testid={`badge-keyword-mobile-breaking-${article.id}`}
                                      >
                                        <Zap className="h-2 w-2" />
                                        عاجل
                                      </Badge>
                                    ) : isNewArticle(article.publishedAt) ? (
                                      <Badge 
                                        className="text-[10px] h-4 gap-0.5 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 shrink-0"
                                        data-testid={`badge-keyword-mobile-new-${article.id}`}
                                      >
                                        <Flame className="h-2 w-2" />
                                        جديد
                                      </Badge>
                                    ) : article.category ? (
                                      <Badge 
                                        variant="secondary"
                                        className="text-[10px] h-4 shrink-0 text-black"
                                        style={{ borderRight: `3px solid ${article.category.color || 'hsl(var(--primary))'}`, backgroundColor: '#e5e5e6' }}
                                        data-testid={`badge-keyword-mobile-category-${article.id}`}
                                      >
                                        {article.category.nameAr}
                                      </Badge>
                                    ) : null}
                                    {/* AI Generated Content Badge */}
                                    {(article as any).aiGenerated && (
                                      <Badge 
                                        className="text-[10px] h-4 gap-0.5 bg-violet-500/90 hover:bg-violet-600 text-white border-0 shrink-0"
                                        data-testid={`badge-keyword-mobile-ai-${article.id}`}
                                      >
                                        <Brain className="h-2 w-2" aria-hidden="true" />
                                        AI
                                      </Badge>
                                    )}
                                  </div>

                                  {/* Title */}
                                  <h4 className={`font-bold text-sm line-clamp-2 leading-snug transition-colors ${
                                    article.newsType === "breaking"
                                      ? "text-destructive"
                                      : "group-hover:text-primary"
                                  }`} data-testid={`text-keyword-mobile-title-${article.id}`}>
                                    {article.title}
                                  </h4>

                                  {/* Meta Info */}
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                    {timeAgo && (
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {timeAgo}
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1">
                                      <Eye className="h-3 w-3" />
                                      {formatNumber(article.views || 0)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Desktop View: Grid */}
              <div className="hidden lg:grid grid-cols-4 gap-6">
                {filteredAndSortedArticles.map((article) => {
                  const timeAgo = article.publishedAt
                    ? formatDistanceToNow(new Date(article.publishedAt), {
                        addSuffix: true,
                        locale: arSA,
                      })
                    : null;
                  const displayImage = (article as any).infographicBannerUrl || article.imageUrl || article.thumbnailUrl;

                  return (
                    <Link key={article.id} href={`/article/${article.englishSlug || article.slug}`}>
                      <Card className={`hover-elevate active-elevate-2 h-full cursor-pointer group border-0 dark:border dark:border-card-border ${
                        article.newsType === "breaking" ? "bg-destructive/5" : ""
                      }`} data-testid={`card-keyword-article-${article.id}`}>
                        {displayImage && (
                          <div className="relative aspect-[16/9] overflow-hidden">
                            <OptimizedImage
                              src={displayImage}
                              alt={article.title}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              priority={false}
                            />
                          </div>
                        )}
                        <CardContent className="p-5 space-y-3">
                          {/* Badges */}
                          <div className="flex items-center gap-2">
                            {article.newsType === "breaking" ? (
                              <Badge 
                                variant="destructive" 
                                className="text-xs h-5 gap-1 shrink-0" 
                                data-testid={`badge-keyword-breaking-${article.id}`}
                              >
                                <Zap className="h-2.5 w-2.5" />
                                عاجل
                              </Badge>
                            ) : isNewArticle(article.publishedAt) ? (
                              <Badge 
                                className="text-xs h-5 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 shrink-0" 
                                data-testid={`badge-keyword-new-${article.id}`}
                              >
                                <Flame className="h-2.5 w-2.5" />
                                جديد
                              </Badge>
                            ) : article.category ? (
                              <Badge 
                                variant="secondary"
                                className="text-xs h-5 shrink-0 text-black" 
                                style={{ borderRight: `3px solid ${article.category.color || 'hsl(var(--primary))'}`, backgroundColor: '#e5e5e6' }}
                                data-testid={`badge-keyword-category-${article.id}`}
                              >
                                {article.category.nameAr}
                              </Badge>
                            ) : null}
                            {/* AI Generated Content Badge */}
                            {(article as any).aiGenerated && (
                              <Badge 
                                className="text-xs h-5 gap-1 bg-violet-500/90 hover:bg-violet-600 text-white border-0 shrink-0"
                                data-testid={`badge-keyword-ai-${article.id}`}
                              >
                                <Brain className="h-2.5 w-2.5" aria-hidden="true" />
                                محتوى AI
                              </Badge>
                            )}
                          </div>
                          
                          {/* Title */}
                          <h3 className={`text-lg font-bold line-clamp-2 transition-colors ${
                            article.newsType === "breaking"
                              ? "text-destructive"
                              : "group-hover:text-primary"
                          }`} data-testid={`text-keyword-article-title-${article.id}`}>
                            {article.title}
                          </h3>
                          
                          {/* Excerpt */}
                          {article.excerpt && (
                            <p className="text-sm text-muted-foreground line-clamp-3">
                              {article.excerpt}
                            </p>
                          )}
                          
                          {/* Meta */}
                          <div className="flex flex-col gap-2 pt-2 border-t">
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              {timeAgo && (
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{timeAgo}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                <span>{formatNumber(article.views || 0)}</span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
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
                            <p className="text-sm text-muted-foreground line-clamp-3">
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
