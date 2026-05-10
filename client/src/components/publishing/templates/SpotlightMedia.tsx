import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Clock, MessageSquare, Play } from "lucide-react";
import type { SpotlightTemplateProps } from "@/lib/publishing/types";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

export default function SpotlightMedia({
  item,
  accent = "hsl(var(--primary))",
  className,
  onView,
}: SpotlightTemplateProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  if (!item) return null;

  const handlePlayClick = () => {
    setIsPlaying(true);
    onView?.();
  };

  // Extract YouTube video ID if it's a YouTube URL
  const getYouTubeEmbedUrl = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    const videoId = match && match[2].length === 11 ? match[2] : null;
    return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : url;
  };

  return (
    <motion.article
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className={`group overflow-hidden rounded-2xl border bg-card shadow-lg ${className || ""}`}
      dir="rtl"
      role="article"
      aria-label={item.title}
      data-testid="template-spotlight-media"
    >
      {/* Video Player / Thumbnail */}
      <div className="relative aspect-[16/9] bg-black">
        {isPlaying && item.videoUrl ? (
          <iframe
            src={getYouTubeEmbedUrl(item.videoUrl)}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={item.title}
          />
        ) : (
          <>
            {/* Thumbnail */}
            {item.image ? (
              <img
                src={item.image}
                alt={item.title}
                className="w-full h-full object-cover"
                loading="eager"
              />
            ) : (
              <div className="w-full h-full bg-muted" />
            )}

            {/* Play Button Overlay */}
            {item.videoUrl && (
              <button
                onClick={handlePlayClick}
                className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/50 transition-all group"
                aria-label="تشغيل الفيديو"
                data-testid="play-button"
              >
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center justify-center w-20 h-20 rounded-full bg-white/90 hover:bg-white transition-colors"
                >
                  <Play className="w-10 h-10 text-destructive fill-destructive mr-1" />
                </motion.div>
              </button>
            )}

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
          </>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Category and Breaking Badge */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* Breaking News Badge */}
          {item.newsType === "breaking" && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-destructive text-destructive-foreground animate-pulse">
              عاجل
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
            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-3 line-clamp-2 hover:underline decoration-2 underline-offset-4">
              {item.title}
            </h2>
          </a>
        </Link>

        {/* Excerpt */}
        {item.excerpt && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {item.excerpt}
          </p>
        )}

        {/* Meta Information */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground py-3 border-t">
          {item.publishedAt && (
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: ar })}</span>
            </div>
          )}
          {typeof item.commentsCount === "number" && (
            <div className="flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{item.commentsCount.toLocaleString("ar")}</span>
            </div>
          )}
        </div>

        {/* Author/Reporter */}
        {(item.author || item.reporter) && (
          <div className="flex items-center gap-3 pt-3 border-t">
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
    </motion.article>
  );
}
