import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OptimizedImage } from "@/components/OptimizedImage";
import { getCacheBustedImageUrl, getObjectPosition } from "@/lib/imageUtils";
import { cn } from "@/lib/utils";
import type { ArticleWithDetails } from "@shared/schema";

interface RelatedInfographicsRailProps {
  articles: ArticleWithDetails[];
  currentArticleId: string;
  className?: string;
}

const cardVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

const hoverVariants = {
  rest: { scale: 1 },
  hover: { 
    scale: 1.03,
    transition: { duration: 0.3, ease: "easeOut" }
  },
};

export function RelatedInfographicsRail({
  articles,
  currentArticleId,
  className,
}: RelatedInfographicsRailProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  const filteredArticles = articles.filter(
    (article) => article.id !== currentArticleId
  );

  const checkScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    const maxScrollDistance = scrollWidth - clientWidth;
    const threshold = 10;
    
    // Normalize scroll position for RTL across browsers:
    // - Firefox RTL: scrollLeft starts at 0, goes to -maxScrollDistance (negative values)
    // - Chrome RTL: scrollLeft starts at maxScrollDistance, goes to 0 (positive values)
    // We normalize to: 0 = at visual start (right side), maxScrollDistance = at visual end (left side)
    let normalizedPosition: number;
    if (scrollLeft < 0) {
      // Firefox RTL: -scrollLeft gives us 0 to maxScrollDistance
      normalizedPosition = -scrollLeft;
    } else {
      // Chrome RTL: maxScrollDistance - scrollLeft gives us 0 to maxScrollDistance
      normalizedPosition = maxScrollDistance - scrollLeft;
    }
    
    // In RTL: visual right side is the start, visual left side has more content
    // Show left arrow when there's more content on the left (we've scrolled away from start)
    setShowLeftArrow(normalizedPosition > threshold);
    // Show right arrow when there's content on the right (we're not at the start)
    setShowRightArrow(normalizedPosition < maxScrollDistance - threshold);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    checkScrollPosition();
    container.addEventListener("scroll", checkScrollPosition);
    window.addEventListener("resize", checkScrollPosition);

    return () => {
      container.removeEventListener("scroll", checkScrollPosition);
      window.removeEventListener("resize", checkScrollPosition);
    };
  }, [checkScrollPosition, filteredArticles.length]);

  const scroll = useCallback((direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.8;
    const scrollDirection = direction === "left" ? scrollAmount : -scrollAmount;
    
    container.scrollBy({
      left: scrollDirection,
      behavior: "smooth",
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        scroll("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        scroll("right");
      }
    },
    [scroll]
  );

  if (filteredArticles.length === 0) {
    return null;
  }

  return (
    <section
      className={cn("relative py-8", className)}
      dir="rtl"
      data-testid="section-related-infographics-rail"
    >
      <div className="mb-6 px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3"
        >
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 backdrop-blur-sm border border-indigo-500/20">
            <BarChart3 className="h-5 w-5 text-indigo-400" />
          </div>
          <h2
            className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent"
            data-testid="text-rail-title"
          >
            إنفوجرافيك ذات صلة
          </h2>
        </motion.div>
      </div>

      <div
        className="relative group"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-16 sm:w-24 z-10 pointer-events-none",
            "bg-gradient-to-r from-background via-background/80 to-transparent",
            "dark:from-background dark:via-background/80"
          )}
          style={{ opacity: showLeftArrow ? 1 : 0, transition: "opacity 0.3s" }}
        />
        <div
          className={cn(
            "absolute right-0 top-0 bottom-0 w-16 sm:w-24 z-10 pointer-events-none",
            "bg-gradient-to-l from-background via-background/80 to-transparent",
            "dark:from-background dark:via-background/80"
          )}
          style={{ opacity: showRightArrow ? 1 : 0, transition: "opacity 0.3s" }}
        />

        <AnimatePresence>
          {isHovered && showLeftArrow && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20"
            >
              <Button
                variant="outline"
                size="icon"
                onClick={() => scroll("left")}
                className={cn(
                  "h-10 w-10 sm:h-12 sm:w-12 rounded-full",
                  "bg-white/90 dark:bg-black/80 backdrop-blur-xl",
                  "border-white/30 dark:border-white/20",
                  "shadow-xl shadow-black/20",
                  "hover:bg-white dark:hover:bg-black/90",
                  "hover:scale-110 transition-all duration-300"
                )}
                data-testid="button-scroll-left"
              >
                <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isHovered && showRightArrow && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20"
            >
              <Button
                variant="outline"
                size="icon"
                onClick={() => scroll("right")}
                className={cn(
                  "h-10 w-10 sm:h-12 sm:w-12 rounded-full",
                  "bg-white/90 dark:bg-black/80 backdrop-blur-xl",
                  "border-white/30 dark:border-white/20",
                  "shadow-xl shadow-black/20",
                  "hover:bg-white dark:hover:bg-black/90",
                  "hover:scale-110 transition-all duration-300"
                )}
                data-testid="button-scroll-right"
              >
                <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          ref={scrollContainerRef}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="region"
          aria-label="Related Infographics Carousel"
          className={cn(
            "flex gap-4 sm:gap-6 overflow-x-auto scrollbar-hide",
            "px-4 sm:px-6 lg:px-8 py-2",
            "scroll-smooth snap-x snap-mandatory",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 rounded-lg"
          )}
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
          data-testid="container-rail-scroll"
        >
          {filteredArticles.map((article, index) => (
            <InfographicCard
              key={article.id}
              article={article}
              index={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

interface InfographicCardProps {
  article: ArticleWithDetails;
  index: number;
}

function InfographicCard({ article, index }: InfographicCardProps) {
  // For infographics in the rail, prefer the horizontal banner (16:9) for card display
  const bannerUrl = article.articleType === 'infographic' && (article as any).infographicBannerUrl
    ? getCacheBustedImageUrl((article as any).infographicBannerUrl, article.updatedAt)
    : null;
  const fallbackUrl = getCacheBustedImageUrl(article.imageUrl || article.thumbnailUrl, article.updatedAt);
  const imageUrl = bannerUrl || fallbackUrl;

  return (
    <motion.div
      variants={cardVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="flex-shrink-0 snap-start"
    >
      <Link href={`/ar/ifox/${article.slug}`}>
        <motion.div
          variants={hoverVariants}
          initial="rest"
          whileHover="hover"
          className={cn(
            "relative w-40 sm:w-48 md:w-56 cursor-pointer",
            "rounded-2xl overflow-hidden",
            "bg-gradient-to-br from-indigo-950/50 via-purple-950/50 to-violet-950/50",
            "dark:from-indigo-950 dark:via-purple-950 dark:to-violet-950",
            "border border-white/10 dark:border-white/5",
            "shadow-lg shadow-indigo-500/10 dark:shadow-indigo-500/5",
            "group"
          )}
          data-testid={`card-infographic-${index}`}
        >
          <div className="aspect-[9/16] relative overflow-hidden">
            {imageUrl ? (
              <OptimizedImage
                src={imageUrl}
                alt={article.title}
                className={cn(
                  "w-full h-full object-cover",
                  "transition-transform duration-500 ease-out",
                  "group-hover:scale-110"
                )}
                objectPosition={getObjectPosition(article)}
                data-testid={`image-infographic-${index}`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-800/50 to-violet-800/50">
                <BarChart3 className="h-12 w-12 text-white/30" />
              </div>
            )}

            <div
              className={cn(
                "absolute inset-0",
                "bg-gradient-to-t from-black/90 via-black/40 to-transparent",
                "opacity-80 group-hover:opacity-90 transition-opacity duration-300"
              )}
            />

            <motion.div
              initial={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              className={cn(
                "absolute inset-0",
                "bg-gradient-to-t from-indigo-600/30 via-transparent to-transparent",
                "pointer-events-none"
              )}
            />

            <div
              className={cn(
                "absolute inset-0 opacity-0 group-hover:opacity-100",
                "transition-opacity duration-300",
                "shadow-[inset_0_0_30px_rgba(99,102,241,0.3)]",
                "pointer-events-none"
              )}
            />
          </div>

          <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
            {article.category && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mb-2"
              >
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5",
                    "text-[10px] sm:text-xs font-medium",
                    "bg-white/20 backdrop-blur-sm rounded-full",
                    "text-white/90 border border-white/10"
                  )}
                  data-testid={`badge-category-${article.id}`}
                >
                  {article.category.icon} {article.category.nameAr}
                </span>
              </motion.div>
            )}

            <h3
              className={cn(
                "text-sm sm:text-base font-bold text-white",
                "line-clamp-3 leading-tight",
                "group-hover:text-indigo-200 transition-colors duration-300"
              )}
              data-testid={`text-title-${index}`}
            >
              {article.title}
            </h3>
          </div>

          <div
            className={cn(
              "absolute top-2 left-2 sm:top-3 sm:left-3",
              "flex items-center gap-1 px-2 py-1",
              "bg-gradient-to-r from-indigo-600/90 to-violet-600/90 backdrop-blur-sm",
              "rounded-full text-[10px] sm:text-xs font-medium text-white",
              "border border-white/20"
            )}
          >
            <BarChart3 className="h-3 w-3" />
            <span className="hidden sm:inline">إنفوجرافيك</span>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

export default RelatedInfographicsRail;
