import { motion } from "framer-motion";
import { formatDistanceToNow, format } from "date-fns";
import { arSA } from "date-fns/locale";
import { 
  Eye, 
  Calendar,
  Tag,
  Share2,
  Link2,
  Check,
  User
} from "lucide-react";
import { SiX, SiFacebook, SiWhatsapp } from "react-icons/si";
import { useState } from "react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ArticleWithDetails } from "@shared/schema";

interface InfographicMetaPanelProps {
  article: ArticleWithDetails;
  className?: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.4, ease: "easeOut" }
  },
};

export function InfographicMetaPanel({ article, className }: InfographicMetaPanelProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const author = article.articleType === 'opinion' ? article.opinionAuthor : article.author;
  const authorName = author?.firstName && author?.lastName 
    ? `${author.firstName} ${author.lastName}`
    : author?.email || 'سبق';

  const formatDate = (date: string | Date | null) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diffInHours = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return formatDistanceToNow(d, { locale: arSA, addSuffix: true });
    }
    return format(d, 'dd MMMM yyyy', { locale: arSA });
  };

  const publishedDate = formatDate(article.publishedAt);

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareTitle = article.title;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "تم النسخ",
        description: "تم نسخ رابط المقال"
      });
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  const handleShareTwitter = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`,
      '_blank',
      'width=550,height=420'
    );
  };

  const handleShareFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      '_blank',
      'width=550,height=420'
    );
  };

  const handleShareWhatsApp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${shareTitle} ${shareUrl}`)}`,
      '_blank'
    );
  };

  const keywords: string[] = article.seo?.keywords || [];

  return (
    <motion.aside
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      dir="rtl"
      className={cn(
        "sticky top-20 z-40",
        "backdrop-blur-xl bg-white/10 dark:bg-black/20",
        "border border-white/20 dark:border-white/10",
        "rounded-2xl shadow-2xl shadow-indigo-500/10",
        "p-5 space-y-5",
        className
      )}
      data-testid="panel-infographic-meta"
    >
      {/* Author Section */}
      {author && (
        <motion.div variants={itemVariants}>
          <Link href={article.staff?.slug ? `/reporter/${article.staff.slug}` : `/profile/${author.id}`}>
            <div 
              className="flex items-center gap-3 p-3 -m-3 rounded-xl hover:bg-white/10 dark:hover:bg-white/5 transition-colors cursor-pointer"
              data-testid="link-author-profile"
            >
              <Avatar className="h-12 w-12 border-2 border-indigo-500/30 shadow-lg shadow-indigo-500/20">
                <AvatarImage src={author.profileImageUrl || ""} alt={authorName} />
                <AvatarFallback className="bg-gradient-to-br from-indigo-600 to-violet-600 text-white font-bold">
                  {authorName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate" data-testid="text-author-name">
                  {authorName}
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  المحرر
                </p>
              </div>
            </div>
          </Link>
        </motion.div>
      )}

      <Separator className="bg-white/10 dark:bg-white/5" />

      {/* Date & Views */}
      <motion.div variants={itemVariants} className="space-y-3">
        {publishedDate && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-publish-date">
            <Calendar className="h-4 w-4 text-indigo-400" />
            <span>{publishedDate}</span>
          </div>
        )}
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-views-count">
          <Eye className="h-4 w-4 text-violet-400" />
          <span>{(article.views || 0).toLocaleString('ar-SA')} مشاهدة</span>
        </div>
      </motion.div>

      {/* Category */}
      {article.category && (
        <>
          <Separator className="bg-white/10 dark:bg-white/5" />
          <motion.div variants={itemVariants}>
            <Link href={`/category/${article.category.slug}`}>
              <Badge 
                variant="outline"
                className={cn(
                  "gap-1.5 px-3 py-1.5 cursor-pointer",
                  "bg-gradient-to-r from-indigo-500/20 to-violet-500/20",
                  "border-indigo-500/30 dark:border-violet-500/30",
                  "text-foreground hover:from-indigo-500/30 hover:to-violet-500/30",
                  "transition-all duration-300"
                )}
                data-testid="badge-category"
              >
                <Tag className="h-3 w-3" />
                {article.category.icon} {article.category.nameAr}
              </Badge>
            </Link>
          </motion.div>
        </>
      )}

      {/* Keywords/Tags */}
      {keywords.length > 0 && (
        <>
          <Separator className="bg-white/10 dark:bg-white/5" />
          <motion.div variants={itemVariants} className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground mb-2">الكلمات المفتاحية</p>
            <div className="flex flex-wrap gap-2" data-testid="container-keywords">
              {keywords.slice(0, 6).map((keyword, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className={cn(
                    "text-xs px-2 py-1",
                    "bg-white/10 dark:bg-white/5",
                    "border border-white/10 dark:border-white/5",
                    "text-muted-foreground hover:text-foreground",
                    "transition-colors"
                  )}
                  data-testid={`badge-keyword-${index}`}
                >
                  {keyword}
                </Badge>
              ))}
            </div>
          </motion.div>
        </>
      )}

      <Separator className="bg-white/10 dark:bg-white/5" />

      {/* Social Share Buttons */}
      <motion.div variants={itemVariants} className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Share2 className="h-3 w-3" />
          مشاركة
        </p>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleShareTwitter}
            className={cn(
              "bg-white/10 dark:bg-white/5 border-white/20 dark:border-white/10",
              "hover:bg-sky-500/20 hover:border-sky-500/30 hover:text-sky-400",
              "transition-all duration-300"
            )}
            data-testid="button-share-twitter"
          >
            <SiX className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={handleShareFacebook}
            className={cn(
              "bg-white/10 dark:bg-white/5 border-white/20 dark:border-white/10",
              "hover:bg-blue-500/20 hover:border-blue-500/30 hover:text-blue-400",
              "transition-all duration-300"
            )}
            data-testid="button-share-facebook"
          >
            <SiFacebook className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={handleShareWhatsApp}
            className={cn(
              "bg-white/10 dark:bg-white/5 border-white/20 dark:border-white/10",
              "hover:bg-green-500/20 hover:border-green-500/30 hover:text-green-400",
              "transition-all duration-300"
            )}
            data-testid="button-share-whatsapp"
          >
            <SiWhatsapp className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={handleCopyLink}
            className={cn(
              "bg-white/10 dark:bg-white/5 border-white/20 dark:border-white/10",
              copied 
                ? "bg-green-500/20 border-green-500/30 text-green-400"
                : "hover:bg-indigo-500/20 hover:border-indigo-500/30 hover:text-indigo-400",
              "transition-all duration-300"
            )}
            data-testid="button-copy-link"
          >
            {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
          </Button>
        </div>
      </motion.div>
    </motion.aside>
  );
}

export default InfographicMetaPanel;
