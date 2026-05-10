import { Link } from "wouter";
import { motion } from "framer-motion";
import { Clock, MessageSquare, BookOpen, Flame } from "lucide-react";
import type { SpotlightTemplateProps } from "@/lib/publishing/types";
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

export default function SpotlightCard({
  item,
  accent = "hsl(var(--primary))",
  className,
  onView,
}: SpotlightTemplateProps) {
  if (!item) return null;

  return (
    <motion.article
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className={`group overflow-hidden rounded-2xl border bg-card shadow-lg hover-elevate active-elevate-2 transition-all ${className || ""}`}
      dir="rtl"
      role="article"
      aria-label={item.title}
      data-testid="template-spotlight-card"
    >
      {/* Image */}
      {item.image && (
        <Link href={`/${item.slug}`}>
          <a onClick={onView}>
            <div className="relative aspect-[16/9] overflow-hidden">
              <img
                src={item.image}
                alt={item.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </div>
          </a>
        </Link>
      )}

      {/* Content */}
      <div className="p-6">
        {/* Category and Breaking/New Badges */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
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

          {/* Category */}
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
        <Link href={`/${item.slug}`}>
          <a onClick={onView}>
            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-3 line-clamp-3 hover:underline decoration-2 underline-offset-4">
              {item.title}
            </h2>
          </a>
        </Link>

        {/* Excerpt */}
        {item.excerpt && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
            {item.excerpt}
          </p>
        )}

        {/* Meta Grid */}
        <div className="grid grid-cols-2 gap-3 py-3 border-t border-b my-4">
          {typeof item.commentsCount === "number" && (
            <div className="flex items-center gap-2 text-sm">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground font-medium">{item.commentsCount.toLocaleString("ar")}</span>
              <span className="text-muted-foreground text-xs">تعليق</span>
            </div>
          )}
          {typeof item.readingTime === "number" && (
            <div className="flex items-center gap-2 text-sm">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground font-medium">{item.readingTime}</span>
              <span className="text-muted-foreground text-xs">دقيقة</span>
            </div>
          )}
          {item.publishedAt && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground text-xs">
                {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: ar })}
              </span>
            </div>
          )}
        </div>

        {/* Author/Reporter */}
        {(item.author || item.reporter) && (
          <div className="flex items-center gap-3">
            {(item.reporter || item.author)?.avatar && (
              <img
                src={(item.reporter || item.author)!.avatar!}
                alt={(item.reporter || item.author)!.name}
                className="w-12 h-12 rounded-full object-cover"
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
    </motion.article>
  );
}
