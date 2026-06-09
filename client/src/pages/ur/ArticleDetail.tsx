import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, lazy, Suspense } from "react";
import { UrduLayout } from "@/components/ur/UrduLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useCanonical } from "@/hooks/useCanonical";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Heart,
  Bookmark,
  Share2,
  Clock,
  Eye,
  Sparkles,
  User,
  ChevronDown,
  ChevronUp,
  Archive,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import type { UrArticleWithDetails } from "@shared/schema";
import DOMPurify from "isomorphic-dompurify";
const UrAiArticleStats = lazy(() => 
  import("@/components/ur/UrAiArticleStats").then(module => ({ default: module.UrAiArticleStats }))
);
import { UrduRecommendationsWidget } from "@/components/UrduRecommendationsWidget";
import { UrduFooter } from "@/components/ur/UrduFooter";
import { ImageWithCaption } from "@/components/ImageWithCaption";
import { DigitalPassportButton } from "@/components/passport/DigitalPassportButton";
import { FocusReader, FocusReaderTrigger } from "@/components/FocusReader";
import { PassportTrustBadge } from "@/components/passport/PassportTrustBadge";

export default function UrduArticleDetail() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: article, isLoading } = useQuery<UrArticleWithDetails>({
    queryKey: ["/api/ur/articles", params.slug],
    enabled: !!params.slug,
    // Editorial credibility: override global 5min staleTime so corrections
    // surface instantly when the editor verifies or readers return to tab.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: relatedArticlesRaw } = useQuery<any[]>({
    queryKey: [`/api/ur/articles/${params.slug}/related`],
    enabled: !!params.slug,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const relatedArticles = Array.isArray(relatedArticlesRaw) ? relatedArticlesRaw : [];

  const { data: mediaAssets } = useQuery<any[]>({
    queryKey: ["/api/ur/articles", article?.id, "media-assets"],
    enabled: !!article?.id,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: articleTagsRaw } = useQuery<Array<{ id: string; nameAr: string; nameEn: string; slug: string }>>({
    queryKey: ["/api/articles", article?.id, "tags"],
    enabled: !!article?.id,
  });
  const articleTags = Array.isArray(articleTagsRaw) ? articleTagsRaw : [];

  const reactMutation = useMutation({
    mutationFn: async () => {
      if (!article) return;
      return await apiRequest<{ hasReacted: boolean }>(`/api/ur/articles/${article.id}/react`, {
        method: "POST",
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ur/articles", params.slug] });
      toast({
        title: data?.hasReacted ? "مضمون کو پسند کیا گیا!" : "ردعمل ہٹا دیا گیا",
        description: data?.hasReacted ? "آپ کے تاثرات کے لیے شکریہ" : "آپ کا ردعمل ہٹا دیا گیا ہے",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "خرابی",
        description: error.message || "مضمون پر ردعمل دینے میں ناکام",
      });
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: async () => {
      if (!article) return;
      return await apiRequest<{ isBookmarked: boolean }>(`/api/ur/articles/${article.id}/bookmark`, {
        method: "POST",
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ur/articles", params.slug] });
      toast({
        title: data?.isBookmarked ? "مضمون محفوظ ہو گیا!" : "بک مارک ہٹا دیا گیا",
        description: data?.isBookmarked ? "آپ کے بک مارکس میں شامل ہو گیا" : "آپ کے بک مارکس سے ہٹا دیا گیا",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "خرابی",
        description: error.message || "بک مارک کرنے میں ناکام",
      });
    },
  });

  const handleShare = async () => {
    if (navigator.share && article) {
      try {
        await navigator.share({
          title: article.title,
          text: article.excerpt || article.aiSummary || "",
          url: window.location.href,
        });
      } catch (err) {
        console.log("Share cancelled");
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: "لنک کاپی ہو گیا!",
        description: "مضمون کا لنک کلپ بورڈ پر کاپی ہو گیا",
      });
    }
  };

  // Track article view via POST request (works even when GET is cached by CDN)
  useEffect(() => {
    if (article?.id) {
      fetch(`/api/ur/articles/${article.id}/view`, { method: 'POST' }).catch(() => {});
    }
  }, [article?.id]);

  // Update document.title for SEO (GA4 auto-tracks page views)
  useEffect(() => {
    if (article?.title) {
      document.title = `${article.title} | سبق`;
    }
    return () => {
      document.title = 'سبق - سعودی الیکٹرانک اخبار';
    };
  }, [article?.title]);

  useCanonical(article ? `https://sabq.org/ur/article/${article.englishSlug || params.slug}` : null);

  if (isLoading) {
    return (
      <UrduLayout>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Skeleton className="h-8 w-24 mb-6" />
          <Skeleton className="h-12 w-full mb-4" />
          <Skeleton className="h-6 w-3/4 mb-8" />
          <Skeleton className="h-96 w-full mb-8" />
          <Skeleton className="h-64 w-full" />
        </div>
      </UrduLayout>
    );
  }

  if (!article) {
    return (
      <UrduLayout>
        <div className="container mx-auto px-4 py-12 max-w-2xl text-center">
          <h2 className="text-2xl font-bold mb-4">مضمون نہیں ملا</h2>
          <p className="text-muted-foreground mb-6">
            جو مضمون آپ تلاش کر رہے ہیں وہ موجود نہیں ہے یا ہٹا دیا گیا ہے
          </p>
          <Link href="/ur">
            <Button data-testid="button-back-home">
              واپس ہوم پر
            </Button>
          </Link>
        </div>
      </UrduLayout>
    );
  }

  // Sanitize HTML content with XSS protection
  const sanitizedContent = DOMPurify.sanitize(article.content, {
    ADD_TAGS: ['iframe', 'blockquote', 'img'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });

  return (
    <UrduLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 max-w-7xl mx-auto">
          {/* Main Content */}
          <article>
            {/* Breadcrumb / Category Badge */}
            {article.category && (
              <div className="mb-6 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-primary/5 border-primary/30" data-testid="badge-category">
                  {article.category.name}
                </Badge>
                {article.newsType === 'breaking' && (
                  <Badge className="bg-red-600 hover:bg-red-700 text-white border-red-600 gap-1" data-testid="badge-article-urgent">
                    <Zap className="h-3 w-3" />
                    فوری
                  </Badge>
                )}
                {article.status === 'archived' && (user?.role === 'system_admin' || user?.role === 'admin' || user?.role === 'editor') && (
                  <Badge variant="secondary" className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700 gap-1" data-testid="badge-article-archived">
                    <Archive className="h-3 w-3" />
                    آرکائیو شدہ
                  </Badge>
                )}
              </div>
            )}

            {/* Title Section */}
            <header className="mb-8">
              <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-loose" data-testid="text-article-title">
                {article.title}
              </h1>
              {article.subtitle && (
                <p className="text-xl text-muted-foreground leading-relaxed" data-testid="text-article-subtitle">
                  {article.subtitle}
                </p>
              )}
            </header>

            {/* Meta Information */}
            <div className="flex flex-wrap items-center gap-6 mb-8 text-sm text-muted-foreground">
              {article.author && (
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10" data-testid="avatar-author">
                    <AvatarImage src={article.author.profileImageUrl || undefined} />
                    <AvatarFallback>
                      <User className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-foreground" data-testid="text-author-name">
                      {article.author.firstName && article.author.lastName
                        ? `${article.author.firstName} ${article.author.lastName}`
                        : article.author.email}
                    </p>
                    <p className="text-xs">رپورٹر</p>
                  </div>
                </div>
              )}
              
              <Separator orientation="vertical" className="h-10" />
              
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {article.publishedAt ? (
                  <time dateTime={article.publishedAt.toString()} data-testid="text-publish-date">
                    {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true, locale: arSA })}
                  </time>
                ) : (
                  <span>مسودہ</span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                <span data-testid="text-views">{article.views || 0} نظریں</span>
              </div>

              {/* Verified trust chip → links to Content Passport */}
              <PassportTrustBadge slug={params.slug!} language="ur" />

              {/* Primary article action: Content Passport above the fold */}
              <DigitalPassportButton slug={params.slug!} language="ur" />
            </div>

            {/* Featured Image */}
            {article.imageUrl && (() => {
              // Find caption data for hero image (if exists)
              const heroImageAsset = mediaAssets?.find(
                (asset: any) => asset.displayOrder === 0
              );
              
              return (
                <ImageWithCaption
                  imageUrl={article.imageUrl}
                  altText={heroImageAsset?.altText || article.title}
                  captionHtml={heroImageAsset?.captionHtml}
                  captionPlain={heroImageAsset?.captionPlain}
                  sourceName={heroImageAsset?.sourceName}
                  sourceUrl={heroImageAsset?.sourceUrl}
                  relatedArticleSlugs={heroImageAsset?.relatedArticleSlugs}
                  keywordTags={heroImageAsset?.keywordTags}
                  className="mb-8"
                />
              );
            })()}

            {/* AI Summary */}
            {(article.aiSummary || article.excerpt) && (
              <div className="mb-8 bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-base text-primary">سمارٹ خلاصہ</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                    className="h-7 text-xs text-primary hover:text-primary/80"
                    data-testid="button-toggle-summary"
                  >
                    {isSummaryExpanded ? (
                      <>
                        <ChevronUp className="h-3 w-3 mr-1" />
                        کم دکھائیں
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 mr-1" />
                        مزید پڑھیں
                      </>
                    )}
                  </Button>
                </div>
                <p 
                  className={`text-foreground/90 leading-relaxed text-sm ${!isSummaryExpanded ? 'line-clamp-2' : ''}`} 
                  data-testid="text-smart-summary"
                >
                  {article.aiSummary || article.excerpt}
                </p>
              </div>
            )}

            {/* Article Content */}
            <div
              className="prose prose-lg max-w-none dark:prose-invert mb-12 
                         prose-headings:font-bold prose-headings:text-foreground
                         prose-p:text-foreground prose-p:leading-relaxed
                         prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                         prose-strong:text-foreground prose-strong:font-semibold
                         prose-ul:text-foreground prose-ol:text-foreground
                         prose-li:text-foreground prose-li:marker:text-muted-foreground
                         prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground
                         prose-img:rounded-lg"
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
              data-testid="text-article-content"
            />

            {/* Additional Images - from mediaAssets table OR albumImages field */}
            {(() => {
              const mediaAdditionalImages = mediaAssets
                ?.filter((asset: any) => asset.displayOrder !== 0)
                .sort((a: any, b: any) => a.displayOrder - b.displayOrder) || [];
              const albumImages = (article as any).albumImages || [];
              
              if (mediaAdditionalImages.length === 0 && albumImages.length === 0) return null;
              
              return (
                <div className="mb-12 border rounded-lg p-6 bg-card">
                  <h3 className="text-lg font-bold mb-6">تصاویر گیلری</h3>
                  <div className="space-y-8">
                    {mediaAdditionalImages.map((asset: any, index: number) => (
                      <ImageWithCaption
                        key={asset.id || `media-${index}`}
                        imageUrl={asset.url}
                        altText={asset.altText || `تصویر ${index + 1}`}
                        captionHtml={asset.captionHtml}
                        captionPlain={asset.captionPlain}
                        sourceName={asset.sourceName}
                        sourceUrl={asset.sourceUrl}
                        relatedArticleSlugs={asset.relatedArticleSlugs}
                        keywordTags={asset.keywordTags}
                        className="w-full"
                      />
                    ))}
                    {albumImages.map((url: string, index: number) => (
                      <ImageWithCaption
                        key={`album-${index}`}
                        imageUrl={url}
                        altText={`تصویر ${mediaAdditionalImages.length + index + 1}`}
                        className="w-full"
                      />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 border-t pt-6 mb-8">
              <Button
                variant={article.hasReacted ? "default" : "outline"}
                size="sm"
                onClick={() => reactMutation.mutate()}
                disabled={!user || reactMutation.isPending}
                data-testid="button-like"
              >
                <Heart className={`w-4 h-4 mr-2 ${article.hasReacted ? 'fill-current' : ''}`} />
                {article.hasReacted ? 'پسند کیا گیا' : 'پسند کریں'}
                {article.reactionsCount && article.reactionsCount > 0 ? ` (${article.reactionsCount})` : ''}
              </Button>
              
              <Button
                variant={article.isBookmarked ? "default" : "outline"}
                size="sm"
                onClick={() => bookmarkMutation.mutate()}
                disabled={!user || bookmarkMutation.isPending}
                data-testid="button-bookmark"
              >
                <Bookmark className={`w-4 h-4 mr-2 ${article.isBookmarked ? 'fill-current' : ''}`} />
                {article.isBookmarked ? 'محفوظ شدہ' : 'محفوظ کریں'}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                data-testid="button-share"
              >
                <Share2 className="w-4 h-4 mr-2" />
                شیئر کریں
              </Button>

              <FocusReaderTrigger language="ur" onClick={() => setFocusOpen(true)} />
            </div>

            {/* Focus mode overlay (Task #80) */}
            <FocusReader
              open={focusOpen}
              onClose={() => setFocusOpen(false)}
              articleId={article.id}
              language="ur"
              isLoggedIn={!!user}
              title={article.title}
              subtitle={article.subtitle || article.excerpt || null}
              contentHtml={article.content}
              authorName={article.author
                ? (article.author.firstName && article.author.lastName
                  ? `${article.author.firstName} ${article.author.lastName}`
                  : article.author.email)
                : null}
              publishedAt={article.publishedAt}
              articleSlug={params.slug}
              articleImageUrl={article.imageUrl}
              categoryName={article.category?.name || null}
            />

            {/* Keywords/Tags - from SEO field OR article_tags table */}
            {((article.seo?.keywords && article.seo.keywords.length > 0) || articleTags.length > 0) && (
              <div className="pt-8 border-t">
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                  متعلقہ عنوانات
                </h3>
                <div className="flex flex-wrap gap-2">
                  {/* Display article tags first (from article_tags table - WhatsApp/Email) */}
                  {articleTags.map((tag, index) => (
                    <Badge
                      key={`tag-${tag.id}`}
                      variant="secondary"
                      className="cursor-pointer hover-elevate active-elevate-2 transition-all duration-300"
                      onClick={() => setLocation(`/ur/keyword/${encodeURIComponent(tag.nameAr)}`)}
                      data-testid={`badge-tag-${index}`}
                    >
                      {tag.nameAr}
                    </Badge>
                  ))}
                  {/* Display SEO keywords if no article tags */}
                  {articleTags.length === 0 && article.seo?.keywords?.map((keyword, index) => (
                    <Badge
                      key={`seo-${index}`}
                      variant="secondary"
                      className="cursor-pointer hover-elevate active-elevate-2 transition-all duration-300"
                      onClick={() => setLocation(`/ur/keyword/${encodeURIComponent(keyword)}`)}
                      data-testid={`badge-keyword-${index}`}
                    >
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </article>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* AI Article Analytics */}
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <UrAiArticleStats slug={params.slug || ""} />
            </Suspense>

            {/* Related Articles */}
            {relatedArticles.length > 0 && (
              <UrduRecommendationsWidget
                articles={relatedArticles}
                title="متعلقہ مضامین"
                reason="آپ کو یہ بھی پسند آ سکتے ہیں"
              />
            )}
          </aside>
        </div>
      </div>
      <UrduFooter />
    </UrduLayout>
  );
}
