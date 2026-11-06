import { useState, useEffect, useCallback, useMemo } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Volume2, TrendingUp, Bell, Zap, Star, Flame, Brain, Camera, Clock, BookOpen } from "lucide-react";
import { OptimizedImage } from "./OptimizedImage";
import { HERO_SIZES_ATTR } from "@/lib/cdnImage";
import type { ArticleWithDetails } from "@shared/schema";

// Hero LCP image tuning. `sizes` MUST match the <link rel=preload imagesizes>
// emitted by useHeroPreload (HERO_SIZES_ATTR) so the browser selects the same
// srcset candidate for the preload and the rendered <img> — otherwise it
// downloads the hero twice. Quality 72 keeps the largest contentful paint
// light without a visible drop on the gradient-overlaid hero.
const HERO_QUALITY = 72;
import { formatArticleTimestamp, formatDateOnly } from "@/lib/formatTime";
import { getObjectPosition, getArticleDisplayImageUrl, getImageFocus } from "@/lib/imageUtils";
import { HERO_CAPTION_TOP_MOBILE, heroCaptionShouldMoveBelow, type ImageFocusData } from "@shared/imageFocus";
import { useIsMobile } from "@/hooks/use-mobile";

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
  focus: ImageFocusData | null;
  displayImage: string | null;
}

// نسبة إطار البارزة على سطح المكتب (ثلثا الحاوية × 420px) وعلى الجوال، لقرار
// «العنوان تحت الصورة». ثابتة عمدًا حتى لا يتذبذب الشكل مع تغيّر المقاس.
const HERO_DESKTOP_RATIO = 2.1;
const HERO_MOBILE_RATIO = 16 / 9;

interface HeroCarouselProps {
  articles: ArticleWithDetails[];
}

// Simple fade carousel for iOS Safari (no transforms)
function SafariHeroCarousel({ articles }: HeroCarouselProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Only the visible layout's hero image should load eagerly. On a phone the
  // desktop hero (960px) is display:none but an eager <img> would still
  // download; gating priority by viewport keeps the lazy+hidden image from
  // ever fetching, so the device downloads exactly one hero image.
  const isMobile = useIsMobile();

  const processedArticles = useMemo((): ProcessedHeroArticle[] => {
    const processed = articles.map(article => ({
      ...article,
      isNew: isNewArticle(article.publishedAt),
      formattedDate: formatPublishedDate(article.publishedAt),
      objectPosition: getObjectPosition(article),
      focus: getImageFocus(article),
      displayImage: getArticleDisplayImageUrl(article),
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
  // الوجه سيقع تحت العنوان: نعرض العنوان على شريط فاتح تحت الصورة بدل فوقها.
  const heroBelowMobile = heroCaptionShouldMoveBelow(heroArticle.focus, HERO_MOBILE_RATIO, HERO_CAPTION_TOP_MOBILE);
  const heroBelowDesktop = heroCaptionShouldMoveBelow(heroArticle.focus, HERO_DESKTOP_RATIO);
  const mobileSecondaryArticles = processedArticles.slice(1, 3);
  const desktopSecondaryArticles = processedArticles.slice(1, 5);

  return (
    <>
      {/* Mobile: Hero + 2 Secondary Articles Layout */}
      <div className="md:hidden space-y-2" dir="rtl">
        {/* Main Hero Article */}
        <Link href={`/article/${heroArticle.englishSlug || heroArticle.slug}`}>
          <article className="relative cursor-pointer group" role="article" aria-label={heroArticle.title}>
            <div className={`relative ${heroBelowMobile ? "aspect-[16/14] bg-card border border-border" : "aspect-[16/9]"} rounded-lg overflow-hidden`}>
              {heroArticle.displayImage ? (
                <OptimizedImage
                  src={heroArticle.displayImage}
                  alt={heroArticle.title}
                  className="w-full h-full object-cover"
                  focus={heroArticle.focus}
                  focusMode="hero"
                  wrapperClassName={`!absolute inset-x-0 top-0 ${heroBelowMobile ? "bottom-[35.7%]" : "bottom-0"}`}
                  priority={isMobile}
                  sizes={HERO_SIZES_ATTR}
                  quality={HERO_QUALITY}
                />
              ) : (
                <div className={`absolute inset-x-0 top-0 ${heroBelowMobile ? "bottom-[35.7%]" : "bottom-0"} bg-gradient-to-br from-primary/20 to-primary/5`} />
              )}
              
              {/* Bottom Gradient Overlay - Red for breaking, Black for normal */}
              <div className={`absolute inset-0 bg-gradient-to-t ${heroBelowMobile ? "hidden" : ""} ${
                heroArticle.newsType === "breaking" 
                  ? "from-red-900/85 via-red-800/50 via-35% to-transparent to-60%" 
                  : "from-black/80 via-black/40 via-35% to-transparent to-60%"
              }`} />
              
              {/* Content Overlay at Bottom */}
              <div className={`absolute bottom-0 left-0 right-0 ${heroBelowMobile ? "h-[35.7%] px-4 py-2 flex flex-col justify-center" : "p-4"}`}>
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
                <h1 className={`text-lg font-bold ${heroBelowMobile ? "text-foreground line-clamp-2" : "text-white drop-shadow-lg line-clamp-2"}`}>
                  {heroArticle.title}
                </h1>
                {/* Category and Date */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {heroArticle.category && (
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] px-2 py-0.5 ${heroBelowMobile ? "border-border text-muted-foreground" : "border-white/40 text-white/90 bg-black/20 backdrop-blur-sm"}`}
                    >
                      {heroArticle.category.nameAr}
                    </Badge>
                  )}
                  {heroArticle.isReading && (
                    <Badge 
                      className="text-[10px] px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-1 font-medium shadow-sm"
                    >
                      <BookOpen className="h-2.5 w-2.5" />
                      قراءة
                    </Badge>
                  )}
                  {heroArticle.formattedDate && (
                    <span className={`flex items-center gap-1 text-[10px] ${heroBelowMobile ? "text-muted-foreground" : "text-white/80"}`}>
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
                      <div className="relative flex-shrink-0 w-36 md:max-lg:w-24 aspect-video rounded-lg overflow-hidden">
                        {art.displayImage ? (
                          <OptimizedImage
                            src={art.displayImage}
                            alt={art.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            focus={art.focus}
                            wrapperClassName="h-full w-full"
                            priority={false}
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

                          {art.isReading && (
                            <Badge 
                              className="text-[10px] h-4 gap-0.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0 font-medium shrink-0"
                            >
                              <BookOpen className="h-2 w-2" />
                              قراءة
                            </Badge>
                          )}
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
                          <span className="flex items-center gap-1 text-xs font-medium text-foreground/65">
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
            <div className={`relative h-full rounded-lg overflow-hidden ${heroBelowDesktop ? "bg-card border border-border" : ""}`}>
              {heroArticle.displayImage ? (
                <OptimizedImage
                  src={heroArticle.displayImage}
                  alt={heroArticle.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  focus={heroArticle.focus}
                  focusMode="hero"
                  wrapperClassName={`!absolute inset-x-0 top-0 ${heroBelowDesktop ? "bottom-[38%]" : "bottom-0"}`}
                  priority={!isMobile}
                  preferSize="large"
                  sizes={HERO_SIZES_ATTR}
                  quality={HERO_QUALITY}
                />
              ) : (
                <div className={`absolute inset-x-0 top-0 ${heroBelowDesktop ? "bottom-[38%]" : "bottom-0"} bg-gradient-to-br from-primary/20 to-primary/5`} />
              )}
              
              {/* Bottom Gradient Overlay */}
              <div className={`absolute inset-0 bg-gradient-to-t ${heroBelowDesktop ? "hidden" : ""} ${
                heroArticle.newsType === "breaking" 
                  ? "from-red-900/90 via-red-800/40 via-35% to-transparent to-60%" 
                  : "from-black/85 via-black/35 via-35% to-transparent to-60%"
              }`} />
              
              {/* Content Overlay */}
              <div className={`absolute bottom-0 left-0 right-0 ${heroBelowDesktop ? "h-[38%] px-6 py-3 flex flex-col justify-center" : "p-6"}`}>
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
                
                <h1 className={`text-2xl lg:text-3xl font-bold ${heroBelowDesktop ? "text-foreground line-clamp-2" : "text-white drop-shadow-lg line-clamp-3"}`}>
                  {heroArticle.title}
                </h1>
                
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {heroArticle.category && (
                    <Badge 
                      variant="outline" 
                      className={`text-xs px-2 py-0.5 ${heroBelowDesktop ? "border-border text-muted-foreground" : "border-white/40 text-white/90 bg-black/20 backdrop-blur-sm"}`}
                    >
                      {heroArticle.category.nameAr}
                    </Badge>
                  )}
                  {heroArticle.isReading && (
                    <Badge 
                      className="text-xs px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-1.5 font-medium shadow-sm"
                    >
                      <BookOpen className="h-3 w-3" />
                      قراءة
                    </Badge>
                  )}
                  {heroArticle.formattedDate && (
                    <span className={`flex items-center gap-1 text-xs ${heroBelowDesktop ? "text-muted-foreground" : "text-white/80"}`}>
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
          <div className="w-1/3 md:max-lg:w-2/5 h-full flex flex-col gap-1.5">
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
                      <div className="relative flex-shrink-0 w-36 md:max-lg:w-24 aspect-video rounded-lg overflow-hidden">
                        {article.displayImage ? (
                          <OptimizedImage
                            src={article.displayImage}
                            alt={article.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            focus={article.focus}
                            wrapperClassName="h-full w-full"
                            priority={false}
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

                          {article.isReading && (
                            <Badge 
                              className="text-[10px] h-4 gap-0.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0 font-medium shrink-0"
                            >
                              <BookOpen className="h-2 w-2" />
                              قراءة
                            </Badge>
                          )}
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
                          <span className="flex items-center gap-1 text-[10px] font-medium text-foreground/65">
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
  // See SafariHeroCarousel: gate hero image eager-loading by viewport so the
  // hidden layout's hero never downloads.
  const isMobile = useIsMobile();

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
      focus: getImageFocus(article),
      displayImage: getArticleDisplayImageUrl(article),
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
  // الوجه سيقع تحت العنوان: نعرض العنوان على شريط فاتح تحت الصورة بدل فوقها.
  const heroBelowMobile = heroCaptionShouldMoveBelow(heroArticle.focus, HERO_MOBILE_RATIO, HERO_CAPTION_TOP_MOBILE);
  const heroBelowDesktop = heroCaptionShouldMoveBelow(heroArticle.focus, HERO_DESKTOP_RATIO);
  const mobileSecondaryArticles = processedArticles.slice(1, 3);
  const desktopSecondaryArticles = processedArticles.slice(1, 5);

  return (
    <>
      {/* Mobile: Hero + 2 Secondary Articles Layout */}
      <div className="md:hidden space-y-2" dir="rtl">
        {/* Main Hero Article */}
        <Link href={`/article/${heroArticle.englishSlug || heroArticle.slug}`}>
          <article className="relative cursor-pointer group" role="article" aria-label={heroArticle.title}>
            <div className={`relative ${heroBelowMobile ? "aspect-[16/14] bg-card border border-border" : "aspect-[16/9]"} rounded-lg overflow-hidden`}>
              {heroArticle.displayImage ? (
                <OptimizedImage
                  src={heroArticle.displayImage}
                  alt={heroArticle.title}
                  className="w-full h-full object-cover"
                  focus={heroArticle.focus}
                  focusMode="hero"
                  wrapperClassName={`!absolute inset-x-0 top-0 ${heroBelowMobile ? "bottom-[35.7%]" : "bottom-0"}`}
                  priority={isMobile}
                  preferSize="medium"
                  aspectRatio="16/9"
                  sizes={HERO_SIZES_ATTR}
                  quality={HERO_QUALITY}
                />
              ) : (
                <div className={`absolute inset-x-0 top-0 ${heroBelowMobile ? "bottom-[35.7%]" : "bottom-0"} bg-gradient-to-br from-primary/20 to-primary/5`} />
              )}
              
              {/* Bottom Gradient Overlay - Red for breaking, Black for normal */}
              <div className={`absolute inset-0 bg-gradient-to-t ${heroBelowMobile ? "hidden" : ""} ${
                heroArticle.newsType === "breaking" 
                  ? "from-red-900/85 via-red-800/50 via-35% to-transparent to-60%" 
                  : "from-black/80 via-black/40 via-35% to-transparent to-60%"
              }`} />
              
              {/* Content Overlay at Bottom */}
              <div className={`absolute bottom-0 left-0 right-0 ${heroBelowMobile ? "h-[35.7%] px-4 py-2 flex flex-col justify-center" : "p-4"}`}>
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
                <h1 className={`text-lg font-bold ${heroBelowMobile ? "text-foreground line-clamp-2" : "text-white drop-shadow-lg line-clamp-2"}`}>
                  {heroArticle.title}
                </h1>
                {/* Category and Date */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {heroArticle.category && (
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] px-2 py-0.5 ${heroBelowMobile ? "border-border text-muted-foreground" : "border-white/40 text-white/90 bg-black/20 backdrop-blur-sm"}`}
                    >
                      {heroArticle.category.nameAr}
                    </Badge>
                  )}
                  {heroArticle.isReading && (
                    <Badge 
                      className="text-[10px] px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-1 font-medium shadow-sm"
                    >
                      <BookOpen className="h-2.5 w-2.5" />
                      قراءة
                    </Badge>
                  )}
                  {heroArticle.formattedDate && (
                    <span className={`flex items-center gap-1 text-[10px] ${heroBelowMobile ? "text-muted-foreground" : "text-white/80"}`}>
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
                      <div className="relative flex-shrink-0 w-36 md:max-lg:w-24 aspect-video rounded-lg overflow-hidden">
                        {article.displayImage ? (
                          <OptimizedImage
                            src={article.displayImage}
                            alt={article.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            focus={article.focus}
                            wrapperClassName="h-full w-full"
                            priority={false}
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

                          {article.isReading && (
                            <Badge 
                              className="text-[10px] h-4 gap-0.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0 font-medium shrink-0"
                            >
                              <BookOpen className="h-2 w-2" />
                              قراءة
                            </Badge>
                          )}
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
                          <span className="flex items-center gap-1 text-xs font-medium text-foreground/65">
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
            <div className={`relative h-full rounded-lg overflow-hidden ${heroBelowDesktop ? "bg-card border border-border" : ""}`}>
              {heroArticle.displayImage ? (
                <OptimizedImage
                  src={heroArticle.displayImage}
                  alt={heroArticle.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  focus={heroArticle.focus}
                  focusMode="hero"
                  wrapperClassName={`!absolute inset-x-0 top-0 ${heroBelowDesktop ? "bottom-[38%]" : "bottom-0"}`}
                  priority={!isMobile}
                  preferSize="large"
                  sizes={HERO_SIZES_ATTR}
                  quality={HERO_QUALITY}
                />
              ) : (
                <div className={`absolute inset-x-0 top-0 ${heroBelowDesktop ? "bottom-[38%]" : "bottom-0"} bg-gradient-to-br from-primary/20 to-primary/5`} />
              )}
              
              {/* Bottom Gradient Overlay */}
              <div className={`absolute inset-0 bg-gradient-to-t ${heroBelowDesktop ? "hidden" : ""} ${
                heroArticle.newsType === "breaking" 
                  ? "from-red-900/95 via-red-800/60 via-35% to-transparent to-60%" 
                  : "from-black/95 via-black/50 via-35% to-transparent to-60%"
              }`} />
              
              {/* Content Overlay at Bottom */}
              <div className={`absolute bottom-0 left-0 right-0 ${heroBelowDesktop ? "h-[38%] px-6 py-3 flex flex-col justify-center" : "p-6"}`}>
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
                <h1 className={`text-2xl lg:text-3xl font-bold mb-2 ${heroBelowDesktop ? "text-foreground line-clamp-2" : "text-white drop-shadow-lg line-clamp-3"}`}>
                  {heroArticle.title}
                </h1>
                
                {/* Category and Date */}
                <div className="flex items-center gap-2 flex-wrap">
                  {heroArticle.category && (
                    <Badge 
                      variant="outline" 
                      className={`text-xs px-2 py-0.5 ${heroBelowDesktop ? "border-border text-muted-foreground" : "border-white/40 text-white/90 bg-black/20 backdrop-blur-sm"}`}
                    >
                      {heroArticle.category.nameAr}
                    </Badge>
                  )}
                  {heroArticle.isReading && (
                    <Badge 
                      className="text-xs px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-1.5 font-medium shadow-sm"
                    >
                      <BookOpen className="h-3 w-3" />
                      قراءة
                    </Badge>
                  )}
                  {heroArticle.formattedDate && (
                    <span className={`flex items-center gap-1 text-xs ${heroBelowDesktop ? "text-muted-foreground" : "text-white/70"}`}>
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
          <div className="w-1/3 md:max-lg:w-2/5 h-full flex flex-col gap-1.5">
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
                      <div className="relative flex-shrink-0 w-36 md:max-lg:w-24 aspect-video rounded-lg overflow-hidden">
                        {article.displayImage ? (
                          <OptimizedImage
                            src={article.displayImage}
                            alt={article.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            focus={article.focus}
                            wrapperClassName="h-full w-full"
                            priority={false}
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

                          {article.isReading && (
                            <Badge 
                              className="text-[10px] h-4 gap-0.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0 font-medium shrink-0"
                            >
                              <BookOpen className="h-2 w-2" />
                              قراءة
                            </Badge>
                          )}
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
                          <span className="flex items-center gap-1 text-[10px] font-medium text-foreground/65">
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
