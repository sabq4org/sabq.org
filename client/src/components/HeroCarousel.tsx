import { useState, useEffect, useCallback, useMemo } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Volume2, TrendingUp, Bell, Zap, Star, Flame, Brain, Camera, Clock } from "lucide-react";
import { OptimizedImage } from "./OptimizedImage";
import type { ArticleWithDetails } from "@shared/schema";
import { formatArticleTimestamp, formatDateOnly } from "@/lib/formatTime";
import { getObjectPosition } from "@/lib/imageUtils";

// Detect iOS Safari to use simplified carousel (prevents zoom bug)
const isIOSSafari = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  return isIOS && isSafari;
};

// Helper function to check if article is new (published within last 30 minutes)
const isNewArticle = (publishedAt: Date | string | null | undefined) => {
  if (!publishedAt) return false;
  const published = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  const now = new Date();
  const diffInMinutes = (now.getTime() - published.getTime()) / (1000 * 60);
  return diffInMinutes <= 30;
};

const formatPublishedDate = (date: Date | string | null) => {
  if (!date) return "";
  return formatDateOnly(date, 'ar');
};

interface ProcessedHeroArticle extends ArticleWithDetails {
  isNew: boolean;
  formattedDate: string;
  objectPosition: string;
  displayImage: string | null;
}

interface HeroCarouselProps {
  articles: ArticleWithDetails[];
}

// Simple fade carousel for iOS Safari (no transforms)
function SafariHeroCarousel({ articles }: HeroCarouselProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const processedArticles = useMemo((): ProcessedHeroArticle[] => {
    const processed = articles.map(article => ({
      ...article,
      isNew: isNewArticle(article.publishedAt),
      formattedDate: formatPublishedDate(article.publishedAt),
      objectPosition: getObjectPosition(article),
      displayImage: article.imageUrl || article.thumbnailUrl || null,
    }));
    
    // Sort so breaking news comes first (hero position)
    return processed.sort((a, b) => {
      if (a.newsType === 'breaking' && b.newsType !== 'breaking') return -1;
      if (a.newsType !== 'breaking' && b.newsType === 'breaking') return 1;
      return 0;
    });
  }, [articles]);

  if (!processedArticles || processedArticles.length === 0) return null;

  // Get hero article and secondary articles (2 for mobile, 4 for desktop)
  const heroArticle = processedArticles[0];
  const mobileSecondaryArticles = processedArticles.slice(1, 3);
  const desktopSecondaryArticles = processedArticles.slice(1, 5);

  return (
    <>
      {/* Mobile: Hero + 2 Secondary Articles Layout */}
      <div className="md:hidden space-y-2" dir="rtl">
        {/* Main Hero Article */}
        <Link href={`/article/${heroArticle.englishSlug || heroArticle.slug}`}>
          <article className="relative cursor-pointer group" role="article" aria-label={heroArticle.title}>
            <div className="relative aspect-[16/9] rounded-lg overflow-hidden">
              {heroArticle.displayImage ? (
                <OptimizedImage
                  src={heroArticle.displayImage}
                  alt={heroArticle.title}
                  className="w-full h-full object-cover"
                  objectPosition={heroArticle.objectPosition}
                  priority={true}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
              )}
              
              {/* Bottom Gradient Overlay - Red for breaking, Black for normal */}
              <div className={`absolute inset-0 bg-gradient-to-t ${
                heroArticle.newsType === "breaking" 
                  ? "from-red-900/85 via-red-800/50 to-transparent" 
                  : "from-black/80 via-black/40 to-transparent"
              }`} />
              
              {/* Content Overlay at Bottom */}
              <div className="absolute bottom-0 left-0 right-0 p-4">
                {/* Breaking/New Badge only */}
                {heroArticle.newsType === "breaking" && (
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="destructive" className="shrink-0 text-xs gap-1">
                      <Zap className="h-3 w-3" />
                      عاجل
                    </Badge>
                  </div>
                )}
                {heroArticle.newsType !== "breaking" && heroArticle.isNew && (
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 text-xs gap-1">
                      <Flame className="h-3 w-3" />
                      جديد
                    </Badge>
                  </div>
                )}
                
                {/* Title */}
                <h1 className="text-lg font-bold line-clamp-2 text-white drop-shadow-lg">
                  {heroArticle.title}
                </h1>
                {/* Category and Date */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {heroArticle.category && (
                    <Badge 
                      variant="outline" 
                      className="text-[10px] px-2 py-0.5 border-white/40 text-white/90 bg-black/20 backdrop-blur-sm"
                    >
                      {heroArticle.category.nameAr}
                    </Badge>
                  )}
                  {heroArticle.formattedDate && (
                    <span className="flex items-center gap-1 text-[10px] text-white/80">
                      <Clock className="h-3 w-3" />
                      {heroArticle.formattedDate}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </article>
        </Link>

        {/* Two Secondary Articles - Horizontal Layout (like Smart News cards) */}
        {mobileSecondaryArticles.length > 0 && (
          <div className="space-y-2">
            {mobileSecondaryArticles.map((art) => (
              <Link key={art.id} href={`/article/${art.englishSlug || art.slug}`}>
                <article 
                  className={`cursor-pointer group rounded-lg overflow-hidden ${
                    art.newsType === "breaking" ? "bg-destructive/5" : "bg-card"
                  }`} 
                  role="article" 
                  aria-label={art.title}
                >
                  <div className="p-3 hover-elevate active-elevate-2 transition-all">
                    <div className="flex gap-3">
                      {/* Image - Larger size with 16:9 aspect ratio to show full image */}
                      <div className="relative flex-shrink-0 w-36 aspect-video rounded-lg overflow-hidden">
                        {art.displayImage ? (
                          <OptimizedImage
                            src={art.displayImage}
                            alt={art.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            objectPosition={art.objectPosition}
                            priority={true}
                            preferSize="small"
                            aspectRatio="16/9"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/20 to-primary/10" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {art.newsType === "breaking" ? (
                            <Badge variant="destructive" className="text-[10px] h-4 gap-0.5">
                              <Zap className="h-2 w-2" />
                              عاجل
                            </Badge>
                          ) : art.isNew ? (
                            <Badge className="text-[10px] h-4 gap-0.5 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600">
                              <Flame className="h-2 w-2" />
                              جديد
                            </Badge>
                          ) : art.category ? (
                            <Badge 
                              variant="secondary"
                              className="text-[10px] h-4 text-black"
                              style={{ borderRight: `3px solid ${art.category.color || 'hsl(var(--primary))'}`, backgroundColor: '#e5e5e6' }}
                            >
                              {art.category.nameAr}
                            </Badge>
                          ) : null}
                        </div>

                        {/* Title */}
                        <h2 className={`font-bold text-sm line-clamp-2 leading-snug transition-colors ${
                          art.newsType === "breaking"
                            ? "text-destructive"
                            : "group-hover:text-primary"
                        }`}>
                          {art.title}
                        </h2>

                        {/* Date */}
                        {art.formattedDate && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {art.formattedDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: Hero + 4 Secondary Articles Layout */}
      <div className="hidden md:flex gap-1.5 h-[420px]" dir="rtl">
        {/* Main Hero Article - 2/3 width */}
        <Link href={`/article/${heroArticle.englishSlug || heroArticle.slug}`} className="w-2/3 h-full">
          <article className="relative cursor-pointer group h-full" role="article" aria-label={heroArticle.title}>
            <div className="relative h-full rounded-lg overflow-hidden">
              {heroArticle.displayImage ? (
                <OptimizedImage
                  src={heroArticle.displayImage}
                  alt={heroArticle.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  objectPosition={heroArticle.objectPosition}
                  priority={true}
                  preferSize="large"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
              )}
              
              {/* Bottom Gradient Overlay */}
              <div className={`absolute inset-0 bg-gradient-to-t ${
                heroArticle.newsType === "breaking" 
                  ? "from-red-900/90 via-red-800/40 to-transparent" 
                  : "from-black/85 via-black/35 to-transparent"
              }`} />
              
              {/* Content Overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {heroArticle.newsType === "breaking" && (
                    <Badge variant="destructive" className="shrink-0 gap-1">
                      <Zap className="h-3 w-3" />
                      عاجل
                    </Badge>
                  )}
                  {heroArticle.newsType !== "breaking" && heroArticle.isNew && (
                    <Badge className="shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 gap-1">
                      <Flame className="h-3 w-3" />
                      جديد
                    </Badge>
                  )}
                </div>
                
                <h1 className="text-2xl lg:text-3xl font-bold line-clamp-3 text-white drop-shadow-lg">
                  {heroArticle.title}
                </h1>
                
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {heroArticle.category && (
                    <Badge 
                      variant="outline" 
                      className="text-xs px-2 py-0.5 border-white/40 text-white/90 bg-black/20 backdrop-blur-sm"
                    >
                      {heroArticle.category.nameAr}
                    </Badge>
                  )}
                  {heroArticle.formattedDate && (
                    <span className="flex items-center gap-1 text-xs text-white/80">
                      <Clock className="h-3 w-3" />
                      {heroArticle.formattedDate}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </article>
        </Link>

        {/* Four Secondary Articles - 1/3 width - Horizontal card style */}
        {desktopSecondaryArticles.length > 0 && (
          <div className="w-1/3 h-full flex flex-col gap-1.5">
            {desktopSecondaryArticles.map((article) => (
              <Link key={article.id} href={`/article/${article.englishSlug || article.slug}`} className="flex-1 min-h-0">
                <article 
                  className={`cursor-pointer group rounded-lg overflow-hidden h-full ${
                    article.newsType === "breaking" ? "bg-destructive/5" : "bg-card"
                  }`} 
                  role="article" 
                  aria-label={article.title}
                >
                  <div className="p-2 hover-elevate active-elevate-2 transition-all h-full">
                    <div className="flex gap-3 h-full">
                      {/* Image - wider with landscape aspect ratio matching mobile */}
                      <div className="relative flex-shrink-0 w-36 aspect-video rounded-lg overflow-hidden">
                        {article.displayImage ? (
                          <OptimizedImage
                            src={article.displayImage}
                            alt={article.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            objectPosition={article.objectPosition || "center top"}
                            priority={true}
                            preferSize="small"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/20 to-primary/10" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                        {/* Badges */}
                        <div className="flex items-center gap-1 flex-wrap">
                          {article.newsType === "breaking" ? (
                            <Badge variant="destructive" className="text-[10px] h-4 gap-0.5">
                              <Zap className="h-2.5 w-2.5" />
                              عاجل
                            </Badge>
                          ) : article.isNew ? (
                            <Badge className="text-[10px] h-4 gap-0.5 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600">
                              <Flame className="h-2.5 w-2.5" />
                              جديد
                            </Badge>
                          ) : article.category ? (
                            <Badge 
                              variant="secondary"
                              className="text-[10px] h-4 text-black"
                              style={{ borderRight: `2px solid ${article.category.color || 'hsl(var(--primary))'}`, backgroundColor: '#e5e5e6' }}
                            >
                              {article.category.nameAr}
                            </Badge>
                          ) : null}
                        </div>

                        {/* Title */}
                        <h2 className={`font-bold text-sm line-clamp-2 leading-snug transition-colors ${
                          article.newsType === "breaking"
                            ? "text-destructive"
                            : "group-hover:text-primary"
                        }`}>
                          {article.title}
                        </h2>

                        {/* Date */}
                        {article.formattedDate && (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {article.formattedDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// Wrapper component that decides which carousel to render before any hooks
export function HeroCarousel({ articles }: HeroCarouselProps) {
  const [isSafariIOS] = useState(() => isIOSSafari());

  if (isSafariIOS) {
    return <SafariHeroCarousel articles={articles} />;
  }

  return <EmblaHeroCarousel articles={articles} />;
}

// Standard Embla carousel for non-Safari browsers
function EmblaHeroCarousel({ articles }: HeroCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ 
    loop: true, 
    direction: "rtl",
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);

    const interval = setInterval(() => {
      emblaApi.scrollNext();
    }, 5000);

    return () => {
      clearInterval(interval);
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  const processedArticles = useMemo((): ProcessedHeroArticle[] => {
    const processed = articles.map(article => ({
      ...article,
      isNew: isNewArticle(article.publishedAt),
      formattedDate: formatPublishedDate(article.publishedAt),
      objectPosition: getObjectPosition(article),
      displayImage: article.imageUrl || article.thumbnailUrl || null,
    }));
    
    // Sort so breaking news comes first (hero position)
    return processed.sort((a, b) => {
      if (a.newsType === 'breaking' && b.newsType !== 'breaking') return -1;
      if (a.newsType !== 'breaking' && b.newsType === 'breaking') return 1;
      return 0;
    });
  }, [articles]);

  if (!processedArticles || processedArticles.length === 0) return null;

  // Get hero article and secondary articles (2 for mobile, 4 for desktop)
  const heroArticle = processedArticles[0];
  const mobileSecondaryArticles = processedArticles.slice(1, 3);
  const desktopSecondaryArticles = processedArticles.slice(1, 5);

  return (
    <>
      {/* Mobile: Hero + 2 Secondary Articles Layout */}
      <div className="md:hidden space-y-2" dir="rtl">
        {/* Main Hero Article */}
        <Link href={`/article/${heroArticle.englishSlug || heroArticle.slug}`}>
          <article className="relative cursor-pointer group" role="article" aria-label={heroArticle.title}>
            <div className="relative aspect-[16/9] rounded-lg overflow-hidden">
              {heroArticle.displayImage ? (
                <OptimizedImage
                  src={heroArticle.displayImage}
                  alt={heroArticle.title}
                  className="w-full h-full object-cover"
                  objectPosition={heroArticle.objectPosition}
                  priority={true}
                  preferSize="medium"
                  aspectRatio="16/9"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
              )}
              
              {/* Bottom Gradient Overlay - Red for breaking, Black for normal */}
              <div className={`absolute inset-0 bg-gradient-to-t ${
                heroArticle.newsType === "breaking" 
                  ? "from-red-900/85 via-red-800/50 to-transparent" 
                  : "from-black/80 via-black/40 to-transparent"
              }`} />
              
              {/* Content Overlay at Bottom */}
              <div className="absolute bottom-0 left-0 right-0 p-4">
                {/* Breaking/New Badge only */}
                {heroArticle.newsType === "breaking" && (
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="destructive" className="shrink-0 text-xs gap-1">
                      <Zap className="h-3 w-3" />
                      عاجل
                    </Badge>
                  </div>
                )}
                {heroArticle.newsType !== "breaking" && heroArticle.isNew && (
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 text-xs gap-1">
                      <Flame className="h-3 w-3" />
                      جديد
                    </Badge>
                  </div>
                )}
                
                {/* Title */}
                <h1 className="text-lg font-bold line-clamp-2 text-white drop-shadow-lg">
                  {heroArticle.title}
                </h1>
                {/* Category and Date */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {heroArticle.category && (
                    <Badge 
                      variant="outline" 
                      className="text-[10px] px-2 py-0.5 border-white/40 text-white/90 bg-black/20 backdrop-blur-sm"
                    >
                      {heroArticle.category.nameAr}
                    </Badge>
                  )}
                  {heroArticle.formattedDate && (
                    <span className="flex items-center gap-1 text-[10px] text-white/80">
                      <Clock className="h-3 w-3" />
                      {heroArticle.formattedDate}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </article>
        </Link>

        {/* Two Secondary Articles - Horizontal Layout (like Smart News cards) */}
        {mobileSecondaryArticles.length > 0 && (
          <div className="space-y-2">
            {mobileSecondaryArticles.map((article) => (
              <Link key={article.id} href={`/article/${article.englishSlug || article.slug}`}>
                <article 
                  className={`cursor-pointer group rounded-lg overflow-hidden ${
                    article.newsType === "breaking" ? "bg-destructive/5" : "bg-card"
                  }`} 
                  role="article" 
                  aria-label={article.title}
                >
                  <div className="p-3 hover-elevate active-elevate-2 transition-all">
                    <div className="flex gap-3">
                      {/* Image - Larger size with 16:9 aspect ratio to show full image */}
                      <div className="relative flex-shrink-0 w-36 aspect-video rounded-lg overflow-hidden">
                        {article.displayImage ? (
                          <OptimizedImage
                            src={article.displayImage}
                            alt={article.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            objectPosition={article.objectPosition}
                            priority={true}
                            preferSize="small"
                            aspectRatio="16/9"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/20 to-primary/10" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {article.newsType === "breaking" ? (
                            <Badge variant="destructive" className="text-[10px] h-4 gap-0.5">
                              <Zap className="h-2 w-2" />
                              عاجل
                            </Badge>
                          ) : article.isNew ? (
                            <Badge className="text-[10px] h-4 gap-0.5 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600">
                              <Flame className="h-2 w-2" />
                              جديد
                            </Badge>
                          ) : article.category ? (
                            <Badge 
                              variant="secondary"
                              className="text-[10px] h-4 text-black"
                              style={{ borderRight: `3px solid ${article.category.color || 'hsl(var(--primary))'}`, backgroundColor: '#e5e5e6' }}
                            >
                              {article.category.nameAr}
                            </Badge>
                          ) : null}
                        </div>

                        {/* Title */}
                        <h2 className={`font-bold text-sm line-clamp-2 leading-snug transition-colors ${
                          article.newsType === "breaking"
                            ? "text-destructive"
                            : "group-hover:text-primary"
                        }`}>
                          {article.title}
                        </h2>

                        {/* Date */}
                        {article.formattedDate && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {article.formattedDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: Hero + 4 Secondary Articles Layout (like mobile but horizontal) */}
      <div className="hidden md:flex gap-1.5 h-[420px]" dir="rtl">
        {/* Main Hero Article - 2/3 width */}
        <Link href={`/article/${heroArticle.englishSlug || heroArticle.slug}`} className="w-2/3 h-full">
          <article className="relative cursor-pointer group h-full" role="article" aria-label={heroArticle.title}>
            <div className="relative h-full rounded-lg overflow-hidden">
              {heroArticle.displayImage ? (
                <OptimizedImage
                  src={heroArticle.displayImage}
                  alt={heroArticle.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  objectPosition={heroArticle.objectPosition}
                  priority={true}
                  preferSize="large"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
              )}
              
              {/* Bottom Gradient Overlay */}
              <div className={`absolute inset-0 bg-gradient-to-t ${
                heroArticle.newsType === "breaking" 
                  ? "from-red-900/95 via-red-800/60 via-30% to-transparent" 
                  : "from-black/95 via-black/50 via-35% to-transparent"
              }`} />
              
              {/* Content Overlay at Bottom */}
              <div className="absolute bottom-0 left-0 right-0 p-6">
                {/* Badges */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {(heroArticle.isAiGeneratedThumbnail || heroArticle.isAiGeneratedImage) && (
                    <Badge className="shrink-0 gap-1.5 bg-violet-500/90 hover:bg-violet-600 text-white border-0">
                      الصورة
                      <Brain className="h-3.5 w-3.5" />
                    </Badge>
                  )}
                  {heroArticle.newsType === "breaking" && (
                    <Badge variant="destructive" className="shrink-0 gap-1">
                      <Zap className="h-3 w-3" />
                      عاجل
                    </Badge>
                  )}
                  {heroArticle.newsType !== "breaking" && heroArticle.isNew && (
                    <Badge className="shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 gap-1">
                      <Flame className="h-3 w-3" />
                      جديد
                    </Badge>
                  )}
                  {heroArticle.articleType === 'weekly_photos' && (
                    <Badge className="shrink-0 bg-orange-500/90 hover:bg-orange-600 text-white border-0 gap-1">
                      <Camera className="h-3 w-3" />
                      صور
                    </Badge>
                  )}
                  {heroArticle.aiGenerated && (
                    <Badge className="shrink-0 bg-violet-500/90 hover:bg-violet-600 text-white border-0 gap-1">
                      <Brain className="h-3 w-3" />
                      محتوى AI
                    </Badge>
                  )}
                </div>
                
                {/* Title */}
                <h1 className="text-2xl lg:text-3xl font-bold line-clamp-3 text-white drop-shadow-lg mb-2">
                  {heroArticle.title}
                </h1>
                
                {/* Category and Date */}
                <div className="flex items-center gap-2 flex-wrap">
                  {heroArticle.category && (
                    <Badge 
                      variant="outline" 
                      className="text-xs px-2 py-0.5 border-white/40 text-white/90 bg-black/20 backdrop-blur-sm"
                    >
                      {heroArticle.category.nameAr}
                    </Badge>
                  )}
                  {heroArticle.formattedDate && (
                    <span className="flex items-center gap-1 text-xs text-white/70">
                      <Clock className="h-3 w-3" />
                      {heroArticle.formattedDate}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </article>
        </Link>

        {/* Four Secondary Articles - 1/3 width - Horizontal card style like mobile */}
        {desktopSecondaryArticles.length > 0 && (
          <div className="w-1/3 h-full flex flex-col gap-1.5">
            {desktopSecondaryArticles.map((article) => (
              <Link key={article.id} href={`/article/${article.englishSlug || article.slug}`} className="flex-1 min-h-0">
                <article 
                  className={`cursor-pointer group rounded-lg overflow-hidden h-full ${
                    article.newsType === "breaking" ? "bg-destructive/5" : "bg-card"
                  }`} 
                  role="article" 
                  aria-label={article.title}
                >
                  <div className="p-2 hover-elevate active-elevate-2 transition-all h-full">
                    <div className="flex gap-3 h-full">
                      {/* Image - wider with landscape aspect ratio matching mobile */}
                      <div className="relative flex-shrink-0 w-36 aspect-video rounded-lg overflow-hidden">
                        {article.displayImage ? (
                          <OptimizedImage
                            src={article.displayImage}
                            alt={article.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            objectPosition={article.objectPosition || "center top"}
                            priority={true}
                            preferSize="small"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/20 to-primary/10" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                        {/* Badges */}
                        <div className="flex items-center gap-1 flex-wrap">
                          {article.newsType === "breaking" ? (
                            <Badge variant="destructive" className="text-[10px] h-4 gap-0.5">
                              <Zap className="h-2.5 w-2.5" />
                              عاجل
                            </Badge>
                          ) : article.isNew ? (
                            <Badge className="text-[10px] h-4 gap-0.5 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600">
                              <Flame className="h-2.5 w-2.5" />
                              جديد
                            </Badge>
                          ) : article.category ? (
                            <Badge 
                              variant="secondary"
                              className="text-[10px] h-4 text-black"
                              style={{ borderRight: `2px solid ${article.category.color || 'hsl(var(--primary))'}`, backgroundColor: '#e5e5e6' }}
                            >
                              {article.category.nameAr}
                            </Badge>
                          ) : null}
                        </div>

                        {/* Title */}
                        <h2 className={`font-bold text-sm line-clamp-2 leading-snug transition-colors ${
                          article.newsType === "breaking"
                            ? "text-destructive"
                            : "group-hover:text-primary"
                        }`}>
                          {article.title}
                        </h2>

                        {/* Date */}
                        {article.formattedDate && (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {article.formattedDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
