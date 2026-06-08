import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, Tag, Newspaper, Flame, Zap, User, BookOpen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import type { UrSmartBlock } from "@shared/schema";
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
  excerpt?: string | null;
  newsType?: string | null;
  articleType?: string | null;
  views?: number;
  imageFocalPoint?: { x: number; y: number } | null;
  category?: {
    name: string;
    slug: string;
    color: string | null;
    icon?: string | null;
  } | null;
  author?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    bio: string | null;
  } | null;
}

interface UrduSmartNewsBlockProps {
  config: UrSmartBlock;
}

export function UrduSmartNewsBlock({ config }: UrduSmartNewsBlockProps) {
  const { data: articles, isLoading } = useQuery<ArticleResult[]>({
    queryKey: ['/api/ur/smart-blocks/query/articles', config.keyword, config.limitCount],
    queryFn: async () => {
      const params = new URLSearchParams({
        keyword: config.keyword,
        limit: config.limitCount.toString(),
      });
      const res = await fetch(`/api/ur/smart-blocks/query/articles?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch articles');
      const data = await res.json();
      return data.items || [];
    },
  });

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
        <p>کوئی مضامین نہیں ملے "{config.title}"</p>
      </div>
    );
  }

  return (
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
            مطلوبہ الفاظ: {config.keyword}
          </span>
        </div>
      </div>

      {config.layoutStyle === 'grid' && <GridLayout articles={articles} blockId={config.id} />}
      {config.layoutStyle === 'list' && <ListLayout articles={articles} blockId={config.id} />}
      {config.layoutStyle === 'featured' && <FeaturedLayout articles={articles} blockId={config.id} />}
    </section>
  );
}

function GridLayout({ articles, blockId }: { articles: ArticleResult[]; blockId: string }) {
  return (
    <>
      {/* Mobile View: Vertical List */}
      <Card className="overflow-hidden lg:hidden border-0 dark:border dark:border-card-border" data-testid={`smart-block-mobile-card-${blockId}`}>
        <CardContent className="p-0">
          <div className="divide-y dark:divide-y">
            {articles.map((article) => {
              const timeAgo = article.publishedAt
                ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true, locale: arSA })
                : null;

              return (
                <Link key={article.id} href={`/ur/article/${article.englishSlug || article.slug}`}>
                  <div 
                    className="block group cursor-pointer"
                    data-testid={`link-smart-article-mobile-${article.id}`}
                  >
                    <div className="p-4 hover-elevate active-elevate-2 transition-all">
                      <div className="flex gap-3">
                        {/* Image */}
                        {article.imageUrl && (
                          <div className="relative flex-shrink-0 w-24 h-20 rounded-lg overflow-hidden">
                            <img
                              src={article.imageUrl}
                              alt={article.title}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                              loading="lazy"
                            />
                          </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-2">
                           {/* Breaking/New/Category/Opinion Badge */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {article.newsType === "breaking" ? (
                              <Badge 
                                variant="destructive" 
                                className="text-xs h-5 gap-1"
                                data-testid={`badge-smart-mobile-breaking-${article.id}`}
                              >
                                <Zap className="h-3 w-3" />
                                تازہ خبر
                              </Badge>
                            ) : (article.articleType === 'opinion' || article.articleType === 'column') ? (
                              <Badge 
                                className="text-xs h-5 gap-1 bg-amber-600 hover:bg-amber-700 text-white border-0 font-medium"
                                data-testid={`badge-smart-mobile-opinion-${article.id}`}
                              >
                                <BookOpen className="h-3 w-3" aria-hidden="true" />
                                رائے
                              </Badge>
                            ) : article.category ? (
                              <Badge 
                                variant="outline" 
                                className="text-xs h-5"
                                data-testid={`badge-smart-mobile-category-${article.id}`}
                              >
                                {article.category.icon} {article.category.name}
                              </Badge>
                            ) : null}

                            {isNewArticle(article.publishedAt) && (
                              <Badge 
                                className="text-xs h-5 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 animate-pulse"
                                data-testid={`badge-smart-mobile-new-${article.id}`}
                              >
                                <Flame className="h-3 w-3" />
                                نیا
                              </Badge>
                            )}
                          </div>

                          {/* Title */}
                          <h4 className={`font-bold text-sm line-clamp-2 leading-snug transition-colors ${
                            article.newsType === "breaking"
                              ? "text-destructive"
                              : "group-hover:text-primary"
                          }`} data-testid={`text-smart-mobile-title-${article.id}`}>
                            {article.title}
                          </h4>

                          {/* Meta Info */}
                          {timeAgo && (
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {timeAgo}
                              </span>
                            </div>
                          )}
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
        {articles.map((article) => {
          const timeAgo = article.publishedAt
            ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true, locale: arSA })
            : null;

          return (
            <Link key={article.id} href={`/ur/article/${article.englishSlug || article.slug}`}>
              <Card 
                className={`hover-elevate active-elevate-2 cursor-pointer h-full overflow-hidden group border-0 dark:border dark:border-card-border ${
                  article.newsType === "breaking" ? "bg-destructive/5" : ""
                }`}
                data-testid={`card-smart-article-${article.id}`}
              >
                {article.imageUrl && (
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={article.imageUrl}
                      alt={article.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                )}
                <CardContent className="p-5 space-y-3">
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
                  {timeAgo && (
                    <div className="flex flex-col gap-2 pt-2 border-t">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{timeAgo}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function ListLayout({ articles, blockId }: { articles: ArticleResult[]; blockId: string }) {
  return (
    <div className="space-y-3">
      {articles.map((article) => {
        const timeAgo = article.publishedAt
          ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true, locale: arSA })
          : null;

        return (
          <Link key={article.id} href={`/ur/article/${article.englishSlug || article.slug}`}>
            <Card className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden group" data-testid={`card-list-smart-article-${article.id}`}>
              <CardContent className="p-4">
                <div className="flex gap-4">
                  {article.imageUrl && (
                    <div className="relative flex-shrink-0 w-32 h-24 rounded overflow-hidden">
                      <img
                        src={article.imageUrl}
                        alt={article.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {article.articleType === 'opinion' || article.articleType === 'column' ? (
                        <Badge 
                          className="text-xs bg-amber-600 hover:bg-amber-700 text-white border-0 font-medium"
                        >
                          <BookOpen className="h-3 w-3 mr-1" aria-hidden="true" />
                          رائے
                        </Badge>
                      ) : article.category ? (
                        <Badge 
                          variant="outline" 
                          className="text-xs"
                          style={{ 
                            borderColor: article.category.color || undefined,
                            color: article.category.color || undefined,
                          }}
                        >
                          {article.category.name}
                        </Badge>
                      ) : null}

                      {isNewArticle(article.publishedAt) && (
                        <Badge 
                          className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 animate-pulse"
                        >
                          نیا
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-bold text-base line-clamp-2 group-hover:text-primary transition-colors">
                      {article.title}
                    </h3>
                    <div className="flex flex-col gap-1">
                      {article.author && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span className="font-medium">
                            {article.author.firstName && article.author.lastName
                              ? `${article.author.firstName} ${article.author.lastName}`
                              : article.author.email}
                          </span>
                        </div>
                      )}
                      {timeAgo && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {timeAgo}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function FeaturedLayout({ articles, blockId }: { articles: ArticleResult[]; blockId: string }) {
  if (articles.length === 0) return null;

  const [featured, ...rest] = articles;
  const sideArticles = rest.slice(0, 4);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-1" data-testid={`smart-block-featured-${blockId}`}>
      <Link href={`/ur/article/${featured.englishSlug || featured.slug}`} className="lg:col-span-3">
        <Card 
          className="group cursor-pointer overflow-hidden h-full hover-elevate active-elevate-2 relative border-0"
          data-testid={`card-smart-article-featured-main-${featured.id}`}
        >
          <div className="relative h-80 md:h-96 overflow-hidden bg-muted">
            {featured.imageUrl ? (
              <img
                src={featured.imageUrl}
                alt={featured.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
                style={{
                  objectPosition: getObjectPosition(featured)
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
                <Newspaper className="h-16 w-16 text-muted-foreground/30" />
              </div>
            )}
            
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent flex flex-col justify-end p-6 md:p-8">
              <h3 className="font-bold text-2xl md:text-3xl lg:text-4xl leading-tight text-white mb-4" data-testid={`text-smart-article-featured-title-${featured.id}`}>
                {featured.title}
              </h3>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                {featured.publishedAt && (
                  <div className="flex items-center gap-1.5 text-white/90">
                    <Clock className="h-4 w-4" />
                    <span>
                      {formatDistanceToNow(new Date(featured.publishedAt), {
                        addSuffix: true,
                        locale: arSA,
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      </Link>

      {sideArticles.length > 0 && (
        <div className="lg:col-span-2 grid grid-cols-2 gap-1">
          {sideArticles.map((article) => (
            <Link key={article.id} href={`/ur/article/${article.englishSlug || article.slug}`} className="col-span-1">
              <Card 
                className="group cursor-pointer overflow-hidden hover-elevate active-elevate-2 relative border-0"
                data-testid={`card-smart-article-featured-${article.id}`}
              >
                <div className="relative aspect-[4/3] md:aspect-auto md:h-48 lg:h-[11.5rem] overflow-hidden bg-muted">
                  {article.imageUrl ? (
                    <img
                      src={article.imageUrl}
                      alt={article.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      loading="lazy"
                      style={{
                        objectPosition: getObjectPosition(article)
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
                      <Newspaper className="h-6 w-6 md:h-8 md:w-8 text-muted-foreground/30" />
                    </div>
                  )}
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent flex flex-col justify-end p-2 sm:p-3 lg:p-4">
                    <h4 className="font-bold text-sm md:text-base lg:text-lg leading-tight text-white line-clamp-2 lg:line-clamp-3" data-testid={`text-smart-article-featured-sub-title-${article.id}`}>
                      {article.title}
                    </h4>
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
