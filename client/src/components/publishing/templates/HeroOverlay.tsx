import { Link } from "wouter";
import { motion } from "framer-motion";
import { Clock, MessageSquare, Flame } from "lucide-react";
import type { HeroTemplateProps } from "@/lib/publishing/types";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

// Helper function to check if article is new (published within last 30 minutes)
const isNewArticle = (publishedAt: Date | string | null | undefined) => {
  if (!publishedAt) return false;
  const published = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  const now = new Date();
  const diffInMinutes = (now.getTime() - published.getTime()) / (1000 * 60);
  return diffInMinutes <= 30;
};

export default function HeroOverlay({ item, accent = "hsl(var(--primary))", className, onView }: HeroTemplateProps) {
  if (!item) return null;

  const handleClick = () => {
    onView?.();
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`group relative overflow-hidden rounded-2xl shadow-lg ${className || ""}`}
      dir="rtl"
      role="article"
      aria-label={item.title}
      data-testid="template-hero-overlay"
    >
      <Link href={`/${item.slug}`} onClick={handleClick}>
        <a className="relative block aspect-[21/9] overflow-hidden">
          {/* Background Image */}
          {item.image ? (
            <img
              src={item.image}
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="eager"
            />
          ) : (
            <div className="w-full h-full bg-muted" />
          )}

          {/* Gradient Overlay for High Contrast (7:1) */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/30" />

          {/* Content Overlay */}
          <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-10 lg:p-12">
            {/* Category and Breaking/New Badges */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {/* Breaking News Badge */}
              {item.newsType === "breaking" && (
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold bg-destructive text-destructive-foreground animate-pulse">
                  عاجل
                </span>
              )}
              
              {/* New Article Badge */}
              {isNewArticle(item.publishedAt) && item.newsType !== "breaking" && (
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold bg-emerald-500 text-white">
                  <Flame className="h-4 w-4" />
                  جديد
                </span>
              )}

              {/* Category Badge */}
              {item.category && (
                <span
                  className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: item.category.color || accent }}
                >
                  {item.category.name}
                </span>
              )}
            </div>

            {/* Title - High Contrast White Text */}
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 line-clamp-3 hover:underline decoration-2 underline-offset-4">
              {item.title}
            </h1>

            {/* Excerpt */}
            {item.excerpt && (
              <p className="text-white/90 text-base md:text-lg mb-6 line-clamp-2 max-w-4xl">
                {item.excerpt}
              </p>
            )}

            {/* Meta Information */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
              {item.publishedAt && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>{formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: ar })}</span>
                </div>
              )}
              {typeof item.commentsCount === "number" && (
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4" />
                  <span>{item.commentsCount.toLocaleString("ar")}</span>
                </div>
              )}
              {(item.author || item.reporter) && (
                <div className="flex items-center gap-2">
                  {(item.reporter || item.author)?.avatar && (
                    <img
                      src={(item.reporter || item.author)!.avatar!}
                      alt={(item.reporter || item.author)!.name}
                      className="w-8 h-8 rounded-full object-cover border-2 border-white/50"
                    />
                  )}
                  <span className="font-medium">{(item.reporter || item.author)?.name}</span>
                </div>
              )}
            </div>
          </div>
        </a>
      </Link>
    </motion.article>
  );
}
