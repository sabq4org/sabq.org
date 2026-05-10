import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { 
  Download, 
  Share2, 
  Maximize2, 
  Bookmark, 
  BookmarkCheck,
  Brain,
  BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OptimizedImage } from "@/components/OptimizedImage";
import { getCacheBustedImageUrl } from "@/lib/imageUtils";
import { cn } from "@/lib/utils";
import type { ArticleWithDetails } from "@shared/schema";

interface InfographicHeroProps {
  article: ArticleWithDetails;
  onZoomClick: () => void;
  onShareClick: () => void;
  onDownloadClick: () => void;
  isBookmarked: boolean;
  onBookmarkToggle: () => void;
}

export function InfographicHero({
  article,
  onZoomClick,
  onShareClick,
  onDownloadClick,
  isBookmarked,
  onBookmarkToggle,
}: InfographicHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const imageY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const overlayOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0.3]);

  const imageUrl = getCacheBustedImageUrl(article.imageUrl, article.updatedAt);
  const isAiGenerated = article.isAiGeneratedThumbnail || article.isAiGeneratedImage;
  const hasImage = !!imageUrl;

  return (
    <section
      ref={containerRef}
      className="relative w-full min-h-[70vh] md:min-h-[85vh] overflow-hidden bg-gradient-to-br from-indigo-950 via-purple-950 to-violet-950 dark:from-indigo-950 dark:via-purple-950 dark:to-violet-950"
      dir="rtl"
      data-testid="section-infographic-hero"
    >
      {/* Background Gradient Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/20 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-violet-500/20 via-transparent to-transparent" />
      </div>

      {/* Parallax Image Container */}
      <motion.div 
        style={{ y: imageY }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <div className="relative w-full h-full flex items-center justify-center p-4 sm:p-8 lg:p-12">
          {imageUrl ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="relative max-w-4xl w-full h-auto"
            >
              <OptimizedImage
                src={imageUrl}
                alt={article.title}
                className="w-full h-auto max-h-[60vh] object-contain rounded-lg shadow-2xl shadow-black/40"
                priority={true}
                preferSize="large"
                data-testid="image-infographic-hero"
              />
              
              {/* Subtle glow effect behind image */}
              <div className="absolute -inset-4 -z-10 bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-violet-500/20 blur-3xl rounded-3xl" />
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center w-full h-64 bg-gradient-to-br from-indigo-800/50 to-violet-800/50 rounded-2xl"
            >
              <BarChart3 className="h-24 w-24 text-white/30" />
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Gradient Overlay for Text Readability */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

      {/* Glassmorphism Content Overlay */}
      <motion.div
        style={{ opacity: overlayOpacity }}
        className="absolute inset-x-0 bottom-0 z-10"
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
          className="mx-4 sm:mx-8 lg:mx-12 mb-6 sm:mb-8 lg:mb-12"
        >
          {/* Glassmorphism Card */}
          <div className="backdrop-blur-xl bg-white/10 dark:bg-black/20 border border-white/20 dark:border-white/10 rounded-2xl p-5 sm:p-6 lg:p-8 shadow-2xl">
            <div className="flex flex-col gap-4">
              
              {/* Badges Row */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="flex flex-wrap items-center gap-2"
              >
                {/* Infographic Type Badge */}
                <Badge 
                  className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-0 gap-1.5 shadow-lg text-xs sm:text-sm px-3 py-1.5"
                  data-testid="badge-infographic-type"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  إنفوجرافيك
                </Badge>

                {/* Category Badge */}
                {article.category && (
                  <Badge 
                    variant="outline"
                    className="bg-white/10 backdrop-blur-sm border-white/30 text-white hover:bg-white/20 text-xs sm:text-sm"
                    data-testid="badge-infographic-category"
                  >
                    {article.category.icon} {article.category.nameAr}
                  </Badge>
                )}

                {/* AI Generated Badge */}
                {isAiGenerated && (
                  <Badge 
                    className="bg-gradient-to-r from-purple-500/80 to-pink-500/80 text-white border-0 gap-1.5 backdrop-blur-sm text-xs"
                    data-testid="badge-ai-generated"
                  >
                    <Brain className="h-3 w-3" />
                    ذكاء اصطناعي
                  </Badge>
                )}
              </motion.div>

              {/* Title */}
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-white leading-tight"
                data-testid="text-infographic-hero-title"
              >
                {article.title}
              </motion.h1>

              {/* Action Rail */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="flex flex-wrap items-center gap-2 sm:gap-3 pt-2"
              >
                {/* Zoom Button */}
                <Button
                  onClick={onZoomClick}
                  disabled={!hasImage}
                  className={cn(
                    "gap-2 bg-gradient-to-r from-indigo-600 to-violet-600",
                    "hover:from-indigo-700 hover:to-violet-700",
                    "text-white shadow-lg shadow-indigo-500/30",
                    "transition-all duration-300",
                    !hasImage && "opacity-50 cursor-not-allowed"
                  )}
                  data-testid="button-hero-zoom"
                >
                  <Maximize2 className="h-4 w-4" />
                  <span className="hidden sm:inline">تكبير</span>
                </Button>

                {/* Download Button */}
                <Button
                  variant="outline"
                  onClick={onDownloadClick}
                  disabled={!hasImage}
                  className={cn(
                    "gap-2 bg-white/10 backdrop-blur-sm border-white/30 text-white hover:bg-white/20 hover:border-white/40",
                    !hasImage && "opacity-50 cursor-not-allowed"
                  )}
                  data-testid="button-hero-download"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">تحميل</span>
                </Button>

                {/* Share Button */}
                <Button
                  variant="outline"
                  onClick={onShareClick}
                  className="gap-2 bg-white/10 backdrop-blur-sm border-white/30 text-white hover:bg-white/20 hover:border-white/40"
                  data-testid="button-hero-share"
                >
                  <Share2 className="h-4 w-4" />
                  <span className="hidden sm:inline">مشاركة</span>
                </Button>

                {/* Bookmark Button */}
                <Button
                  variant="outline"
                  onClick={onBookmarkToggle}
                  className={cn(
                    "gap-2 backdrop-blur-sm border-white/30",
                    isBookmarked 
                      ? "bg-gradient-to-r from-amber-500/90 to-orange-500/90 text-white border-transparent hover:from-amber-600 hover:to-orange-600" 
                      : "bg-white/10 text-white hover:bg-white/20 hover:border-white/40"
                  )}
                  data-testid="button-hero-bookmark"
                >
                  {isBookmarked ? (
                    <BookmarkCheck className="h-4 w-4" />
                  ) : (
                    <Bookmark className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">
                    {isBookmarked ? "تم الحفظ" : "حفظ"}
                  </span>
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Top Gradient for safe area */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/30 to-transparent pointer-events-none" />
    </section>
  );
}

export default InfographicHero;
