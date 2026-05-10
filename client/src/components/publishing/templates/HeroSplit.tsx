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

export default function HeroSplit({ item, accent = "hsl(var(--primary))", className, onView }: HeroTemplateProps) {
  if (!item) return null;

  const handleClick = () => {
    onView?.();
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`group relative overflow-hidden rounded-2xl bg-card shadow-lg ${className || ""}`}
      dir="rtl"
      role="article"
      aria-label={item.title}
      data-testid="template-hero-split"
    >
      <div className="grid md:grid-cols-2 gap-0">
        {/* Image Section */}
        <Link href={`/${item.slug}`} onClick={handleClick}>
          <a className="relative block aspect-[16/10] md:aspect-auto md:h-full overflow-hidden">
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
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent md:hidden" />
          </a>
        </Link>

        {/* Content Section */}
        <div className="flex flex-col justify-center p-6 md:p-8 lg:p-10">
          {/* Category and Breaking/New Badges */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {/* Breaking News Badge */}
            {item.newsType === "breaking" && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-destructive text-destructive-foreground animate-pulse">
                عاجل
              </span>
            )}
            
            {/* New Article Badge */}
            {isNewArticle(item.publishedAt) && item.newsType !== "breaking" && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white">
                <Flame className="h-3 w-3" />
                جديد
              </span>
            )}

            {/* Category Badge */}
            {item.category && (
              <span
                className="inline-block px-3 py-1 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: item.category.color || accent }}
              >
                {item.category.name}
              </span>
            )}
          </div>

          {/* Title */}
          <Link href={`/${item.slug}`} onClick={handleClick}>
            <a>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-4 line-clamp-3 hover:underline decoration-2 underline-offset-4">
                {item.title}
              </h1>
            </a>
          </Link>

          {/* Excerpt */}
          {item.excerpt && (
            <p className="text-muted-foreground text-sm md:text-base mb-6 line-clamp-3">
              {item.excerpt}
            </p>
          )}

          {/* Meta Information */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {item.publishedAt && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: ar })}</span>
              </div>
            )}
            {typeof item.commentsCount === "number" && (
              <div className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                <span>{item.commentsCount.toLocaleString("ar")}</span>
              </div>
            )}
          </div>

          {/* Author/Reporter */}
          {(item.author || item.reporter) && (
            <div className="flex items-center gap-2 mt-6 pt-6 border-t">
              {(item.reporter || item.author)?.avatar && (
                <img
                  src={(item.reporter || item.author)!.avatar!}
                  alt={(item.reporter || item.author)!.name}
                  className="w-10 h-10 rounded-full object-cover"
                />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  {(item.reporter || item.author)?.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.reporter ? "مراسل" : "كاتب"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}
