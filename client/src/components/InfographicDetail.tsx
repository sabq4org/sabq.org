import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { 
  Heart, 
  Bookmark, 
  Share2, 
  Clock, 
  Sparkles, 
  Download,
  Maximize2,
  BarChart3,
  CheckCircle2,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { getCacheBustedImageUrl, getObjectPosition } from "@/lib/imageUtils";
import { OptimizedImage } from "@/components/OptimizedImage";
import { SocialShareBar } from "@/components/SocialShareBar";
import type { ArticleWithDetails } from "@shared/schema";
import DOMPurify from "isomorphic-dompurify";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";

import { InfographicViewerDialog } from "@/components/infographic/InfographicViewerDialog";

interface InfographicDetailProps {
  article: ArticleWithDetails;
  onReact?: () => void;
  onBookmark?: () => void;
  hasReacted?: boolean;
  isBookmarked?: boolean;
  shortLink?: { shortCode: string } | null;
}

function getInitials(firstName?: string | null, lastName?: string | null, email?: string | null): string {
  if (firstName && lastName) {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  }
  if (email) {
    return email.charAt(0).toUpperCase();
  }
  return "س";
}

export function InfographicDetail({
  article,
  onReact,
  onBookmark,
  hasReacted,
  isBookmarked,
  shortLink,
}: InfographicDetailProps) {
  const { toast } = useToast();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLoadingShortLink] = useState(false);

  const { data: relatedInfographics, isLoading: loadingRelated } = useQuery<
    ArticleWithDetails[]
  >({
    queryKey: [`/api/articles/${article.slug}/infographics`],
    enabled: !!article.slug,
  });

  const handleShare = async () => {
    const shareUrl = shortLink
      ? `https://sabq.me/${shortLink.shortCode}`
      : window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title: article.title,
          text: article.excerpt || article.aiSummary || "",
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({
          title: "تم النسخ",
          description: "تم نسخ رابط المقال",
        });
      }
    } catch (error) {
      console.error("Share failed:", error);
    }
  };

  const handleDownload = async () => {
    if (article.imageUrl) {
      try {
        const response = await fetch(article.imageUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${article.slug || "infographic"}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast({
          title: "تم التحميل",
          description: "تم تحميل الإنفوجرافيك بنجاح",
        });
      } catch (error) {
        window.open(article.imageUrl, "_blank");
      }
    }
  };

  const sanitizedContent = article.content
    ? DOMPurify.sanitize(article.content, {
        ADD_TAGS: ["iframe"],
        ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling"],
      })
    : "";

  const imageUrl = getCacheBustedImageUrl(article.imageUrl, article.updatedAt);
  const keywords: string[] = article.seo?.keywords || [];

  const resolvedAuthor = article.articleType === 'opinion' ? article.opinionAuthor : article.author;
  const authorName = resolvedAuthor?.firstName && resolvedAuthor?.lastName
    ? `${resolvedAuthor.firstName} ${resolvedAuthor.lastName}`
    : resolvedAuthor?.email || "سبق";

  const timeAgo = article.publishedAt
    ? formatDistanceToNow(new Date(article.publishedAt), {
        locale: arSA,
        addSuffix: true,
      })
    : null;

  return (
    <>
      {/* Breadcrumbs - Same as ArticleDetail */}
      <div className="border-t border-b bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors font-medium" data-testid="link-breadcrumb-home">
              الرئيسية
            </Link>
            <span className="text-muted-foreground/50">|</span>
            {article.category && (
              <>
                <Link href={`/category/${article.category.slug}`} className="hover:text-foreground transition-colors font-medium" data-testid="link-breadcrumb-category">
                  {article.category.nameAr}
                </Link>
                <span className="text-muted-foreground/50">|</span>
              </>
            )}
            <span className="text-foreground line-clamp-1">{article.title}</span>
          </div>
        </div>
      </div>

      {/* Main Content - Same layout as ArticleDetail */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content Column */}
          <article className="lg:col-span-2 space-y-6" data-testid="article-infographic-detail">
            {/* Article Header Card - Same as ArticleDetail */}
            <div className="bg-card border rounded-lg p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {/* Infographic Type Badge */}
                <Badge 
                  variant="outline" 
                  className="bg-primary/5 border-primary/30 gap-1"
                  data-testid="badge-infographic-type"
                >
                  <BarChart3 className="h-3 w-3" />
                  إنفوجرافيك
                </Badge>
                
                {article.category && (
                  <Badge variant="outline" className="bg-muted/50 gap-1" data-testid="badge-article-category">
                    {article.category.icon} {article.category.nameAr}
                  </Badge>
                )}
                
                {article.aiGenerated && (
                  <Badge variant="secondary" className="gap-1" data-testid="badge-article-ai">
                    <Sparkles className="h-3 w-3" />
                    محتوى مُنشأ بالذكاء الاصطناعي
                  </Badge>
                )}
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight" data-testid="text-article-title">
                {article.title}
              </h1>

              {/* Author Card - Compact Lite Version (Same as ArticleDetail) */}
              {resolvedAuthor && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Avatar className="h-8 w-8 border border-primary/20">
                    <AvatarImage 
                      src={resolvedAuthor?.profileImageUrl || ""} 
                      alt={authorName}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                      {getInitials(resolvedAuthor?.firstName, resolvedAuthor?.lastName, resolvedAuthor?.email)}
                    </AvatarFallback>
                  </Avatar>
                  
                  {article.staff ? (
                    <Link 
                      href={`/reporter/${article.staff.slug}`} 
                      className="text-sm font-semibold hover:text-primary transition-colors flex items-center gap-1" 
                      data-testid="link-reporter-profile"
                    >
                      <span data-testid="text-author-name">{authorName}</span>
                      {article.staff.isVerified && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold" data-testid="text-author-name">
                      {authorName}
                    </span>
                  )}

                  <span className="text-muted-foreground">•</span>
                  
                  {timeAgo && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {timeAgo}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Infographic Image - Clickable to open lightbox */}
            {imageUrl && (
              <div className="bg-card border rounded-lg overflow-hidden">
                <div 
                  className="relative cursor-pointer group"
                  onClick={() => setViewerOpen(true)}
                  data-testid="button-open-infographic-viewer"
                >
                  <OptimizedImage
                    src={imageUrl}
                    alt={article.title}
                    className="w-full h-auto object-contain"
                    priority={true}
                    preferSize="large"
                    data-testid="image-infographic-main"
                  />
                  
                  {/* Hover overlay with zoom icon */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-black/80 rounded-full p-3 shadow-lg">
                      <Maximize2 className="h-6 w-6 text-foreground" />
                    </div>
                  </div>
                  
                  {/* AI Generated indicator */}
                  {(article.isAiGeneratedThumbnail || article.isAiGeneratedImage) && (
                    <div className="absolute top-3 right-3">
                      <Badge variant="secondary" className="bg-white/90 dark:bg-black/80 gap-1 text-xs">
                        <Sparkles className="h-3 w-3" />
                        AI
                      </Badge>
                    </div>
                  )}
                </div>
                
                {/* Image actions bar */}
                <div className="p-3 border-t bg-muted/30 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    اضغط على الصورة لعرضها بالحجم الكامل
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewerOpen(true);
                      }}
                      className="gap-1 h-8"
                      data-testid="button-expand-infographic"
                    >
                      <Maximize2 className="h-4 w-4" />
                      <span className="hidden sm:inline">تكبير</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload();
                      }}
                      className="gap-1 h-8"
                      data-testid="button-download-infographic"
                    >
                      <Download className="h-4 w-4" />
                      <span className="hidden sm:inline">تحميل</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Smart Summary - Compact (Same pattern as ArticleDetail) */}
            {(article.aiSummary || article.excerpt) && (
              <div className="bg-muted/30 border rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="h-3 w-3 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold mb-2">الموجز الذكي</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-ai-summary">
                      {article.aiSummary || article.excerpt}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Article Content */}
            {sanitizedContent && (
              <div className="bg-card border rounded-lg p-6">
                <div 
                  className="prose prose-lg dark:prose-invert max-w-none leading-loose"
                  dangerouslySetInnerHTML={{ __html: sanitizedContent }}
                  data-testid="content-article-body"
                />
              </div>
            )}

            {/* Keywords Section */}
            {keywords.length > 0 && (
              <div className="bg-card border rounded-lg p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3">
                  الكلمات المفتاحية
                </p>
                <div className="flex flex-wrap gap-2">
                  {keywords.map((keyword, index) => (
                    <Link
                      key={index}
                      href={`/keyword/${encodeURIComponent(keyword)}`}
                    >
                      <Badge
                        variant="secondary"
                        className="cursor-pointer hover-elevate active-elevate-2 transition-all duration-300 hover:scale-105"
                        data-testid={`badge-keyword-${index}`}
                      >
                        {keyword}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Engagement & Share Section - Combined (Same as ArticleDetail) */}
            <div className="bg-card border rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  {isLoadingShortLink ? (
                    <Loader2 className="h-5 w-5 animate-spin text-green-500" />
                  ) : (
                    <Share2 className="h-5 w-5 text-green-500" />
                  )}
                </div>
                <h3 className="text-lg font-bold">شارك الإنفوجرافيك</h3>
              </div>
              
              {/* Engagement Actions */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={hasReacted ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={onReact}
                  data-testid="button-infographic-react"
                >
                  <Heart className={cn("h-4 w-4", hasReacted && "fill-current")} />
                  <span>إعجاب ({article.reactionsCount || 0})</span>
                </Button>

                <Button
                  variant={isBookmarked ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={onBookmark}
                  data-testid="button-infographic-bookmark"
                >
                  <Bookmark className={cn("h-4 w-4", isBookmarked && "fill-current")} />
                  <span>حفظ</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleDownload}
                  data-testid="button-infographic-download"
                >
                  <Download className="h-4 w-4" />
                  <span>تحميل</span>
                </Button>
              </div>

              {/* Social Share */}
              <SocialShareBar
                title={article.title}
                url={shortLink?.shortCode ? `https://sabq.org/s/${shortLink.shortCode}` : `https://sabq.org/article/${article.englishSlug || article.slug}`}
                description={article.excerpt || ""}
                articleId={article.id}
              />
            </div>
          </article>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Related Infographics - Visual Card Display */}
            <div className="bg-card border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-base">إنفوجرافيك ذات صلة</h3>
              </div>
              
              {loadingRelated ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="w-20 h-16 rounded-lg flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : relatedInfographics && relatedInfographics.filter(inf => inf.id !== article.id).length > 0 ? (
                <div className="space-y-3">
                  {relatedInfographics
                    .filter(inf => inf.id !== article.id)
                    .slice(0, 5)
                    .map((inf) => (
                      <Link
                        key={inf.id}
                        href={`/article/${inf.englishSlug || inf.slug}`}
                        className="flex gap-3 p-2 rounded-lg hover-elevate active-elevate-2 transition-all bg-muted/30 group"
                        data-testid={`link-related-infographic-${inf.id}`}
                      >
                        {/* Thumbnail - prioritize infographicBannerUrl for 16:9 display */}
                        <div className="w-20 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                          {(() => {
                            const displayUrl = (inf as any).infographicBannerUrl || inf.imageUrl || inf.thumbnailUrl;
                            return displayUrl ? (
                              <OptimizedImage
                                src={getCacheBustedImageUrl(displayUrl)}
                                alt={inf.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                objectPosition={getObjectPosition(inf)}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <BarChart3 className="h-6 w-6 text-muted-foreground/50" />
                              </div>
                            );
                          })()}
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
                            {inf.title}
                          </h4>
                        </div>
                      </Link>
                    ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    لا توجد إنفوجرافيكات ذات صلة حالياً
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* Infographic Viewer Dialog - Uses inset-4 md:inset-8 */}
      <AnimatePresence>
        {viewerOpen && imageUrl && (
          <InfographicViewerDialog
            isOpen={viewerOpen}
            onClose={() => setViewerOpen(false)}
            imageUrl={imageUrl}
            title={article.title}
            onDownload={handleDownload}
          />
        )}
      </AnimatePresence>
    </>
  );
}
