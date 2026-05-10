import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, Tag, Newspaper, Flame, Zap, Brain, Camera, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { formatArticleTimestamp } from "@/lib/formatTime";
import type { SmartBlock } from "@shared/schema";
import { OptimizedImage } from "./OptimizedImage";
import { getObjectPosition } from "@/lib/imageUtils";

// Helper function to check if article is new (published within last 30 minutes)
const isNewArticle = (publishedAt: Date | string | null | undefined) => {
  if (!publishedAt) return false;
  const now = new Date();
  const published = new Date(publishedAt);
  const diffInMinutes = (now.getTime() - published.getTime()) / (1000 * 60);
  return diffInMinutes <= 30;
};

interface ArticleResult {
  id: string;
  title: string;
  slug: string;
  englishSlug?: string | null;
  publishedAt: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  infographicBannerUrl?: string | null;
  excerpt?: string | null;
  newsType?: string | null;
  views?: number;
  aiGenerated?: boolean | null;
  isAiGeneratedThumbnail?: boolean | null;
  articleType?: string | null;
  imageFocalPoint?: { x: number; y: number } | null;
  category?: {
    nameAr: string;
    slug: string;
    englishSlug?: string | null;
    color: string | null;
    icon?: string | null;
  } | null;
}

interface ProcessedArticle extends ArticleResult {
  isNew: boolean;
  timeAgo: string | null;
  displayImageUrl: string | null;
}

// Helper function to get display image URL for articles
// If infographicBannerUrl exists, always use it - it's the 16:9 horizontal banner
const getArticleDisplayImageUrl = (article: ArticleResult): string | null => {
  // Prioritize banner URL - if it exists, it's specifically made for card display
  if (article.infographicBannerUrl) {
    return article.infographicBannerUrl;
  }
  return article.imageUrl || article.thumbnailUrl || null;
};

interface SmartNewsBlockProps {
  config: SmartBlock;
}

export function SmartNewsBlock({ config }: SmartNewsBlockProps) {
  const { data: articles, isLoading } = useQuery<ArticleResult[]>({
    queryKey: ['/api/smart-blocks/query/articles', config.keyword, config.limitCount],
    queryFn: async () => {
      const params = new URLSearchParams({
        keyword: config.keyword,
        limit: config.limitCount.toString(),
      });
      const res = await fetch(`/api/smart-blocks/query/articles?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch articles');
      const data = await res.json();
      return data.items || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: [],
  });
  
  const processedArticles = useMemo(() => {
    if (!articles) return [];
    return articles.map(article => ({
      ...article,
      isNew: isNewArticle(article.publishedAt),
      timeAgo: article.publishedAt
        ? formatArticleTimestamp(article.publishedAt)
        : null,
      displayImageUrl: getArticleDisplayImageUrl(article),
    }));
  }, [articles]);

  if (isLoading) {
    return (
      <div className="space-y-4" dir="rtl" data-testid={`smart-block-loading-${config.id}`}>
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className={config.layoutStyle === 'list' ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className={config.layoutStyle === 'list' ? 'h-32' : 'h-48'} />
          ))}
        </div>
      </div>
    );
  }

  if (!articles || articles.length === 0) {
    return (
      <div 
        className="text-center py-8 text-muted-foreground" 
        dir="rtl"
        data-testid={`smart-block-empty-${config.id}`}
      >
        <Tag className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>لا توجد مقالات متاحة لـ "{config.title}"</p>
      </div>
    );
  }

  const sectionContent = (
    <section className="space-y-4" dir="rtl" data-testid={`smart-block-${config.id}`}>
      <div className="grid grid-cols-[auto,1fr] gap-2">
        <div 
          className="flex items-center justify-center w-6 h-6 rounded-full"
          style={{ backgroundColor: config.color }}
        >
          <Tag className="h-3.5 w-3.5 text-white" />
        </div>
        
        <h2 
          className="text-2xl md:text-3xl font-bold" 
          style={{ color: config.color }}
          data-testid={`heading-smart-block-${config.id}`}
        >
          {config.title}
        </h2>
        
        <div className="col-start-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Tag className="h-3.5 w-3.5" />
          <span data-testid={`text-smart-block-keyword-${config.id}`}>
            الكلمة المفتاحية: {config.keyword}
          </span>
        </div>
      </div>

      {config.layoutStyle === 'grid' && <GridLayout articles={processedArticles} blockId={config.id} />}
      {config.layoutStyle === 'list' && <ListLayout articles={processedArticles} blockId={config.id} />}
      {config.layoutStyle === 'featured' && <FeaturedLayout articles={processedArticles} blockId={config.id} />}
      {config.layoutStyle === 'carousel' && <CarouselLayout articles={processedArticles} blockId={config.id} config={config} />}
    </section>
  );

  if (config.backgroundColor) {
    return (
      <div 
        className="w-screen relative -mx-4 md:-mx-8 px-4 md:px-8 py-6"
        style={{ backgroundColor: config.backgroundColor }}
        data-testid={`smart-block-bg-wrapper-${config.id}`}
      >
        {sectionContent}
      </div>
    );
  }

  return sectionContent;
}

function GridLayout({ articles, blockId }: { articles: ProcessedArticle[]; blockId: string }) {
  return (
    <>
      {/* Mobile View: Vertical List */}
      <Card className="overflow-hidden lg:hidden border-0 dark:border dark:border-card-border" data-testid={`smart-block-mobile-card-${blockId}`}>
        <CardContent className="p-0">
          <div className="divide-y dark:divide-y">
            {articles.map((article) => (
                <Link key={article.id} href={`/article/${article.englishSlug || article.slug}`}>
                  <div 
                    className="block group cursor-pointer"
                    data-testid={`link-smart-article-mobile-${article.id}`}
                  >
                    <div className="p-4 hover-elevate active-elevate-2 transition-all">
                      <div className="flex gap-3">
                        {/* Image with AI badge */}
                        {article.displayImageUrl && (
                          <div className="relative flex-shrink-0 w-24 h-20 rounded-lg overflow-hidden">
                            <OptimizedImage
                              src={article.displayImageUrl}
                              alt={article.title}
                              className="w-full h-full object-cover rounded-lg transition-transform duration-500 group-hover:scale-110"
                              priority={false}
                              objectPosition={getObjectPosition(article)}
                            />
                            {/* AI Generated Image Badge (Featured or Thumbnail) */}
                            {(article.isAiGeneratedThumbnail || (article as any).isAiGeneratedImage) && (
                              <Badge 
                                className="absolute -top-1 -right-1 z-20 gap-0.5 px-1 py-0 h-4 text-[9px] bg-violet-500/90 hover:bg-violet-600 text-white border-0 backdrop-blur-sm shadow-md"
                                data-testid={`badge-smart-mobile-ai-image-${article.id}`}
                              >
                                <Brain className="h-2 w-2" aria-hidden="true" />
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {/* Badges above title - side by side */}
                          <div className="flex items-center gap-1.5">
                            {article.newsType === "breaking" ? (
                              <Badge 
                                variant="destructive" 
                                className="text-[10px] h-4 gap-0.5 shrink-0"
                                data-testid={`badge-smart-mobile-breaking-${article.id}`}
                              >
                                <Zap className="h-2 w-2" />
                                عاجل
                              </Badge>
                            ) : article.isNew ? (
                              <Badge 
                                className="text-[10px] h-4 gap-0.5 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 shrink-0"
                                data-testid={`badge-smart-mobile-new-${article.id}`}
                              >
                                <Flame className="h-2 w-2" />
                                جديد
                              </Badge>
                            ) : article.articleType === 'weekly_photos' ? (
                              <Badge 
                                className="text-[10px] h-4 gap-0.5 bg-orange-500/90 hover:bg-orange-600 text-white border-0 shrink-0"
                                data-testid={`badge-smart-mobile-photos-${article.id}`}
                              >
                                <Camera className="h-2 w-2" />
                                صور
                              </Badge>
                            ) : article.category ? (
                              <Badge 
                                variant="secondary"
                                className="text-[10px] h-4 shrink-0 text-black"
                                style={{ borderRight: `3px solid ${article.category.color || 'hsl(var(--primary))'}`, backgroundColor: '#e5e5e6' }}
                                data-testid={`badge-smart-mobile-category-${article.id}`}
                              >
                                {article.category.nameAr}
                              </Badge>
                            ) : null}
                            {/* AI Generated Content Badge */}
                            {article.aiGenerated && (
                              <Badge 
                                className="text-[10px] h-4 gap-0.5 bg-violet-500/90 hover:bg-violet-600 text-white border-0 shrink-0"
                                data-testid={`badge-smart-mobile-ai-content-${article.id}`}
                              >
                                <Brain className="h-2 w-2" aria-hidden="true" />
                                AI
                              </Badge>
                            )}
                          </div>

                          {/* Title */}
                          <h4 className={`font-bold text-sm line-clamp-2 leading-relaxed transition-colors ${
                            article.newsType === "breaking"
                              ? "text-destructive"
                              : "group-hover:text-primary"
                          }`} data-testid={`text-smart-mobile-title-${article.id}`}>
                            {article.title}
                          </h4>

                          {/* Meta Info */}
                          {article.timeAgo && (
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                منذ {article.timeAgo}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Desktop View: Grid */}
      <div className="hidden lg:grid grid-cols-4 gap-6">
        {articles.map((article) => (
            <Link key={article.id} href={`/article/${article.englishSlug || article.slug}`}>
              <Card className={`hover-elevate active-elevate-2 h-full cursor-pointer group border-0 dark:border dark:border-card-border ${
                article.newsType === "breaking" ? "bg-destructive/5" : ""
              }`} data-testid={`card-smart-article-${article.id}`}>
                {article.displayImageUrl && (
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <OptimizedImage
                      src={article.displayImageUrl}
                      alt={article.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      priority={false}
                      objectPosition={getObjectPosition(article)}
                    />
                    {/* AI Generated Image Badge (Featured or Thumbnail) */}
                    {(article.isAiGeneratedThumbnail || (article as any).isAiGeneratedImage) && (
                      <Badge 
                        className="absolute top-2 right-2 z-20 gap-1 bg-violet-500/90 hover:bg-violet-600 text-white border-0 text-xs backdrop-blur-sm shadow-lg"
                        data-testid={`badge-smart-ai-image-${article.id}`}
                      >
                        الصورة
                        <Brain className="h-3 w-3" aria-hidden="true" />
                      </Badge>
                    )}
                  </div>
                )}
                <CardContent className="p-5 space-y-3">
                  {/* Badges above title - side by side */}
                  <div className="flex items-center gap-2">
                    {article.newsType === "breaking" ? (
                      <Badge 
                        variant="destructive" 
                        className="text-xs h-5 gap-1 shrink-0" 
                        data-testid={`badge-smart-breaking-${article.id}`}
                      >
                        <Zap className="h-2.5 w-2.5" />
                        عاجل
                      </Badge>
                    ) : article.isNew ? (
                      <Badge 
                        className="text-xs h-5 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 shrink-0" 
                        data-testid={`badge-smart-new-${article.id}`}
                      >
                        <Flame className="h-2.5 w-2.5" />
                        جديد
                      </Badge>
                    ) : article.articleType === 'weekly_photos' ? (
                      <Badge 
                        className="text-xs h-5 gap-1 bg-orange-500/90 hover:bg-orange-600 text-white border-0 shrink-0" 
                        data-testid={`badge-smart-photos-${article.id}`}
                      >
                        <Camera className="h-2.5 w-2.5" />
                        صور
                      </Badge>
                    ) : article.category ? (
                      <Badge 
                        variant="secondary"
                        className="text-xs h-5 shrink-0 text-black" 
                        style={{ borderRight: `3px solid ${article.category.color || 'hsl(var(--primary))'}`, backgroundColor: '#e5e5e6' }}
                        data-testid={`badge-smart-category-${article.id}`}
                      >
                        {article.category.nameAr}
                      </Badge>
                    ) : null}
                    {/* AI Generated Content Badge */}
                    {article.aiGenerated && (
                      <Badge 
                        className="text-xs h-5 gap-1 bg-violet-500/90 hover:bg-violet-600 text-white border-0 shrink-0"
                        data-testid={`badge-smart-ai-content-${article.id}`}
                      >
                        <Brain className="h-2.5 w-2.5" aria-hidden="true" />
                        محتوى AI
                      </Badge>
                    )}
                  </div>
                  
                  <h3 className={`text-lg font-bold line-clamp-2 transition-colors ${
                    article.newsType === "breaking"
                      ? "text-destructive"
                      : "group-hover:text-primary"
                  }`} data-testid={`text-smart-article-title-${article.id}`}>
                    {article.title}
                  </h3>
                  {article.excerpt && (
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {article.excerpt}
                    </p>
                  )}
                  {article.timeAgo && (
                    <div className="flex flex-col gap-2 pt-2 border-t">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>منذ {article.timeAgo}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
      </div>
    </>
  );
}

function ListLayout({ articles, blockId }: { articles: ProcessedArticle[]; blockId: string }) {
  return (
    <div className="space-y-4" data-testid={`smart-block-list-${blockId}`}>
      {articles.map((article, index) => (
          <Link key={article.id} href={`/article/${article.englishSlug || article.slug}`}>
            <div 
              className="group cursor-pointer rounded-xl overflow-hidden bg-gradient-to-l from-slate-900/95 via-slate-800/90 to-slate-900/95 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 shadow-lg hover:shadow-xl transition-all duration-300 border border-slate-700/30"
              data-testid={`card-smart-article-list-${article.id}`}
            >
              <div className="flex flex-col md:flex-row-reverse">
                {/* Image Section - Right side for RTL */}
                {article.displayImageUrl && (
                  <div className="relative flex-shrink-0 w-full md:w-72 lg:w-80 aspect-[16/9] md:aspect-auto md:h-48 overflow-hidden">
                    <OptimizedImage
                      src={article.displayImageUrl}
                      alt={article.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      priority={index === 0}
                      objectPosition={getObjectPosition(article)}
                    />
                    {/* Gradient overlay for depth */}
                    <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-slate-900/60 md:block hidden" />
                    
                    {/* Breaking news ribbon */}
                    {article.newsType === "breaking" && (
                      <div className="absolute top-0 right-0 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg shadow-lg">
                        <span className="flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          عاجل
                        </span>
                      </div>
                    )}
                    
                    {/* AI Generated Image Badge */}
                    {(article.isAiGeneratedThumbnail || (article as any).isAiGeneratedImage) && (
                      <Badge 
                        className="absolute bottom-2 right-2 z-20 gap-1 text-xs bg-violet-500/90 hover:bg-violet-600 text-white border-0 backdrop-blur-sm shadow-lg"
                        data-testid={`badge-smart-list-ai-image-${article.id}`}
                      >
                        <Brain className="h-3 w-3" aria-hidden="true" />
                      </Badge>
                    )}
                  </div>
                )}

                {/* Content Section - Left side for RTL */}
                <div className="flex-1 min-w-0 p-5 md:p-6 flex flex-col justify-center gap-3">
                  {/* Category & AI badges row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {article.category && (
                      <Badge 
                        variant="secondary"
                        className="text-xs font-medium px-3 py-1 shadow-sm text-black"
                        style={{ borderRight: `3px solid ${article.category.color || 'hsl(var(--primary))'}`, backgroundColor: '#e5e5e6' }}
                        data-testid={`badge-smart-article-list-category-${article.id}`}
                      >
                        {article.category.nameAr}
                      </Badge>
                    )}
                    {article.aiGenerated && (
                      <Badge 
                        className="text-xs bg-violet-500/20 text-violet-300 border-0 gap-1 px-2 py-1 rounded-full"
                        data-testid={`badge-smart-list-ai-content-${article.id}`}
                      >
                        <Brain className="h-3 w-3" aria-hidden="true" />
                        AI
                      </Badge>
                    )}
                  </div>

                  {/* Title */}
                  <h3 
                    className="font-bold text-xl md:text-2xl lg:text-3xl line-clamp-2 leading-relaxed text-white group-hover:text-blue-400 transition-colors duration-300" 
                    data-testid={`text-smart-article-list-title-${article.id}`}
                  >
                    {article.title}
                  </h3>

                  {/* Metadata row */}
                  {article.timeAgo && (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Clock className="h-4 w-4" />
                      <span>منذ {article.timeAgo}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))}
    </div>
  );
}

function FeaturedLayout({ articles, blockId }: { articles: ProcessedArticle[]; blockId: string }) {
  if (articles.length === 0) return null;

  const [featured, ...rest] = articles;
  const sideArticles = rest.slice(0, 4);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-1" data-testid={`smart-block-featured-${blockId}`}>
      <Link href={`/article/${featured.englishSlug || featured.slug}`} className="lg:col-span-3">
        <Card 
          className="group cursor-pointer overflow-hidden h-full hover-elevate active-elevate-2 relative border-0"
          data-testid={`card-smart-article-featured-main-${featured.id}`}
        >
          <div className="relative h-80 md:h-96 overflow-hidden bg-muted">
            {featured.displayImageUrl ? (
              <OptimizedImage
                src={featured.displayImageUrl}
                alt={featured.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                priority={true}
                objectPosition={getObjectPosition(featured)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
                <Newspaper className="h-16 w-16 text-muted-foreground/30" />
              </div>
            )}
            
            {/* AI Generated Image Badge (Featured or Thumbnail) - Top Right */}
            {(featured.isAiGeneratedThumbnail || (featured as any).isAiGeneratedImage) && (
              <Badge 
                className="absolute top-4 right-4 z-20 gap-1.5 bg-orange-500/90 hover:bg-orange-600 text-white border-0 backdrop-blur-sm shadow-lg"
                data-testid={`badge-featured-ai-image-${featured.id}`}
              >
                الصورة
                <Brain className="h-3 w-3" aria-hidden="true" />
              </Badge>
            )}
            
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent flex flex-col justify-end p-6 md:p-8">
              {featured.category && (
                <Badge 
                  variant="secondary"
                  className="text-xs mb-3 w-fit text-black"
                  style={{ borderRight: `3px solid ${featured.category.color || 'hsl(var(--primary))'}`, backgroundColor: '#e5e5e6' }}
                  data-testid={`badge-smart-article-featured-category-${featured.id}`}
                >
                  {featured.category.nameAr}
                </Badge>
              )}
              <h3 className="font-bold text-2xl md:text-3xl lg:text-4xl leading-tight text-white mb-4" data-testid={`text-smart-article-featured-title-${featured.id}`}>
                {featured.title}
              </h3>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                {/* AI Generated Content Badge */}
                {featured.aiGenerated && (
                  <Badge 
                    className="bg-violet-500/90 hover:bg-violet-600 text-white border-0 gap-1 backdrop-blur-sm"
                    data-testid={`badge-featured-ai-content-${featured.id}`}
                  >
                    <Brain className="h-3 w-3" aria-hidden="true" />
                    محتوى AI
                  </Badge>
                )}
                
                {featured.timeAgo && (
                  <div className="flex items-center gap-1.5 text-white/90">
                    <Clock className="h-4 w-4" />
                    <span>{featured.timeAgo}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      </Link>

      {sideArticles.length > 0 && (
        <div className="lg:col-span-2 h-80 md:h-96 grid grid-cols-2 grid-rows-2 gap-0.5">
          {sideArticles.map((article) => (
            <Link key={article.id} href={`/article/${article.englishSlug || article.slug}`} className="col-span-1 row-span-1 h-full">
              <Card 
                className="group cursor-pointer overflow-hidden hover-elevate active-elevate-2 relative border-0 h-full"
                data-testid={`card-smart-article-featured-${article.id}`}
              >
                <div className="relative h-full overflow-hidden bg-muted">
                  {article.displayImageUrl ? (
                    <OptimizedImage
                      src={article.displayImageUrl}
                      alt={article.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      priority={false}
                      objectPosition={getObjectPosition(article)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
                      <Newspaper className="h-6 w-6 md:h-8 md:w-8 text-muted-foreground/30" />
                    </div>
                  )}
                  
                  {/* AI Generated Image Badge (Featured or Thumbnail) */}
                  {(article.isAiGeneratedThumbnail || (article as any).isAiGeneratedImage) && (
                    <Badge 
                      className="absolute top-2 right-2 z-20 gap-0.5 px-1.5 py-0.5 text-[10px] bg-orange-500/90 hover:bg-orange-600 text-white border-0 backdrop-blur-sm shadow-lg"
                      data-testid={`badge-featured-side-ai-image-${article.id}`}
                    >
                      الصورة
                      <Brain className="h-2.5 w-2.5" aria-hidden="true" />
                    </Badge>
                  )}
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent flex flex-col justify-end p-2 sm:p-3 lg:p-4">
                    {/* Category Badge + AI Badge + Title */}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1">
                        {article.category && (
                          <Badge 
                            variant="secondary"
                            className="text-[9px] h-4 text-black"
                            style={{ borderRight: `3px solid ${article.category.color || 'hsl(var(--primary))'}`, backgroundColor: '#e5e5e6' }}
                            data-testid={`badge-featured-side-category-${article.id}`}
                          >
                            {article.category.nameAr}
                          </Badge>
                        )}
                        {article.aiGenerated && (
                          <Badge 
                            className="text-[9px] h-4 gap-0.5 bg-violet-500/90 hover:bg-violet-600 text-white border-0 backdrop-blur-sm"
                            data-testid={`badge-featured-side-ai-content-${article.id}`}
                          >
                            <Brain className="h-2 w-2" aria-hidden="true" />
                            AI
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-bold text-sm md:text-base lg:text-lg leading-tight text-white line-clamp-2 lg:line-clamp-3" data-testid={`text-smart-article-featured-sub-title-${article.id}`}>
                        {article.title}
                      </h4>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CarouselLayout({ articles, blockId, config }: { articles: ProcessedArticle[]; blockId: string; config: SmartBlock }) {
  return (
    <section className="py-2" data-testid={`smart-block-carousel-${blockId}`}>
      <div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {articles.map((article) => (
              <Link key={article.id} href={`/article/${article.englishSlug || article.slug}`}>
                <Card 
                  className="group overflow-hidden border-0 dark:border dark:border-card-border cursor-pointer hover-elevate active-elevate-2 transition-all bg-card h-full"
                  data-testid={`card-carousel-article-${article.id}`}
                >
                  <div className="relative aspect-[4/3] overflow-hidden rounded-t-lg">
                    {article.displayImageUrl ? (
                      <OptimizedImage
                        src={article.displayImageUrl}
                        alt={article.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        priority={false}
                        objectPosition={getObjectPosition(article)}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/20 to-primary/10 flex items-center justify-center">
                        <Newspaper className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  
                  <CardContent className="p-3 space-y-2">
                    {article.category && (
                      <Badge 
                        variant="secondary"
                        className="text-[10px] shadow-sm text-black"
                        style={{ borderRight: `3px solid ${article.category.color || 'hsl(var(--primary))'}`, backgroundColor: '#e5e5e6' }}
                        data-testid={`badge-carousel-category-${article.id}`}
                      >
                        {article.category.nameAr}
                      </Badge>
                    )}
                    <h3 
                      className="font-bold text-sm leading-relaxed line-clamp-2 group-hover:text-primary transition-colors"
                      data-testid={`text-carousel-title-${article.id}`}
                    >
                      {article.title}
                    </h3>

                    {article.timeAgo && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        منذ {article.timeAgo}
                      </span>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
        </div>
      </div>
    </section>
  );
}
