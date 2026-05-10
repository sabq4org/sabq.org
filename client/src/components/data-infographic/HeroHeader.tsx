import { motion } from "framer-motion";
import { Calendar, Eye, Share2, Bookmark, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface HeroHeaderProps {
  title: string;
  subtitle?: string;
  keyInsight?: string;
  category?: string;
  date?: Date | string;
  views?: number;
  onShare?: () => void;
  onBookmark?: () => void;
  onReact?: () => void;
  hasReacted?: boolean;
  isBookmarked?: boolean;
  className?: string;
}

export function HeroHeader({
  title,
  subtitle,
  keyInsight,
  category,
  date,
  views,
  onShare,
  onBookmark,
  onReact,
  hasReacted,
  isBookmarked,
  className,
}: HeroHeaderProps) {
  const formattedDate = date
    ? format(new Date(date), "d MMMM yyyy", { locale: ar })
    : null;

  return (
    <motion.header
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className={cn(
        "relative overflow-hidden",
        "bg-primary",
        "text-primary-foreground py-16 md:py-24 px-6 md:px-12",
        className
      )}
      data-testid="infographic-hero-header"
    >
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            x: [0, 30, 0],
            y: [0, -20, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-0 left-0 w-96 h-96 bg-primary-foreground/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            x: [0, -40, 0],
            y: [0, 30, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-primary-foreground/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            x: [0, 20, 0],
            y: [0, 40, 0],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/2 left-1/3 w-64 h-64 bg-primary-foreground/5 rounded-full blur-2xl"
        />
      </div>

      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: "50px 50px",
        }}
      />

      <div className="relative max-w-5xl mx-auto">
        {/* Category and meta */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap items-center gap-4 mb-8"
        >
          {category && (
            <Badge 
              className="bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30 hover:bg-primary-foreground/30"
            >
              {category}
            </Badge>
          )}
          
          <div className="flex items-center gap-4 text-sm text-primary-foreground/60">
            {formattedDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {formattedDate}
              </span>
            )}
            {views !== undefined && (
              <span className="flex items-center gap-1.5">
                <Eye className="w-4 h-4" />
                {views.toLocaleString("ar-SA")} مشاهدة
              </span>
            )}
          </div>
        </motion.div>

        {/* Main title */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6"
        >
          {title}
        </motion.h1>

        {/* Subtitle */}
        {subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-lg md:text-xl text-primary-foreground/70 max-w-3xl mb-8"
          >
            {subtitle}
          </motion.p>
        )}

        {/* Key Insight Box */}
        {keyInsight && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="relative rounded-2xl p-6 mb-10 overflow-hidden"
          >
            <div className="absolute inset-0 bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/10 rounded-2xl" />
            <div className="relative">
              <span className="text-xs font-semibold text-primary-foreground/80 uppercase tracking-wider mb-2 block">
                الخلاصة البصرية
              </span>
              <p className="text-lg md:text-xl font-medium text-primary-foreground">
                {keyInsight}
              </p>
            </div>
          </motion.div>
        )}

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-wrap gap-3"
        >
          {onShare && (
            <Button
              variant="outline"
              size="sm"
              onClick={onShare}
              className="bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20"
              data-testid="button-share"
            >
              <Share2 className="w-4 h-4 ml-2" />
              مشاركة
            </Button>
          )}
          {onBookmark && (
            <Button
              variant="outline"
              size="sm"
              onClick={onBookmark}
              className={cn(
                "bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20",
                isBookmarked && "bg-warning/20 border-warning/30"
              )}
              data-testid="button-bookmark"
            >
              <Bookmark className={cn("w-4 h-4 ml-2", isBookmarked && "fill-warning text-warning")} />
              {isBookmarked ? "محفوظ" : "حفظ"}
            </Button>
          )}
          {onReact && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReact}
              className={cn(
                "bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20",
                hasReacted && "bg-destructive/20 border-destructive/30"
              )}
              data-testid="button-react"
            >
              <Heart className={cn("w-4 h-4 ml-2", hasReacted && "fill-destructive text-destructive")} />
              إعجاب
            </Button>
          )}
        </motion.div>
      </div>
    </motion.header>
  );
}
