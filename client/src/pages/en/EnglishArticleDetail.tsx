import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, lazy, Suspense } from "react";
import { EnglishLayout } from "@/components/en/EnglishLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useCanonical } from "@/hooks/useCanonical";
import { apiRequest, queryClient, apiUrl } from "@/lib/queryClient";
import {
  Heart,
  Bookmark,
  Share2,
  Clock,
  Eye,
  Sparkles,
  User,
  Volume2,
  VolumeX,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { EnArticleWithDetails } from "@shared/schema";
import DOMPurify from "isomorphic-dompurify";
const EnAiArticleStats = lazy(() => 
  import("@/components/en/EnAiArticleStats").then(module => ({ default: module.EnAiArticleStats }))
);
import { EnglishRecommendationsWidget } from "@/components/EnglishRecommendationsWidget";
import { EnglishFooter } from "@/components/en/EnglishFooter";
import { ImageWithCaption } from "@/components/ImageWithCaption";
import { DigitalPassportButton } from "@/components/passport/DigitalPassportButton";
import { FocusReader, FocusReaderTrigger } from "@/components/FocusReader";
import { PassportTrustBadge } from "@/components/passport/PassportTrustBadge";

export default function EnglishArticleDetail() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);

  const { data: user } = useQuery<{ id: string; name?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: article, isLoading } = useQuery<EnArticleWithDetails>({
    queryKey: ["/api/en/articles", params.slug],
    enabled: !!params.slug,
    // Editorial credibility: override global 5min staleTime so corrections
    // surface instantly when the editor verifies or readers return to tab.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: relatedArticlesRaw } = useQuery<any[]>({
    queryKey: [`/api/en/articles/${params.slug}/related`],
    enabled: !!params.slug,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const relatedArticles = Array.isArray(relatedArticlesRaw) ? relatedArticlesRaw : [];

  const { data: mediaAssets } = useQuery<any[]>({
    queryKey: ["/api/en/articles", article?.id, "media-assets"],
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
      return await apiRequest<{ hasReacted: boolean }>(`/api/en/articles/${article.id}/react`, {
        method: "POST",
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/en/articles", params.slug] });
      toast({
        title: data?.hasReacted ? "Article liked!" : "Reaction removed",
        description: data?.hasReacted ? "Thank you for your feedback" : "Your reaction has been removed",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to react to article",
      });
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: async () => {
      if (!article) return;
      return await apiRequest<{ isBookmarked: boolean }>(`/api/en/articles/${article.id}/bookmark`, {
        method: "POST",
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/en/articles", params.slug] });
      toast({
        title: data?.isBookmarked ? "Article saved!" : "Bookmark removed",
        description: data?.isBookmarked ? "Added to your bookmarks" : "Removed from your bookmarks",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to bookmark article",
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
      } catch {
        // User dismissed the native share sheet — not an error.
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Link copied!",
        description: "Article link copied to clipboard",
      });
    }
  };

  // Ensure LTR direction is applied for English content
  useEffect(() => {
    const previousDir = document.documentElement.dir;
    const previousLang = document.documentElement.lang;
    
    document.documentElement.dir = "ltr";
    document.documentElement.lang = "en";
    
    // Cleanup: restore previous values when unmounting (default to LTR if not set)
    return () => {
      document.documentElement.dir = previousDir || "ltr";
      document.documentElement.lang = previousLang || "en";
    };
  }, []);

  // Track article view via POST request (works even when GET is cached by CDN)
  useEffect(() => {
    if (article?.id) {
      fetch(apiUrl(`/api/en/articles/${article.id}/view`), { method: 'POST' }).catch(() => {});
    }
  }, [article?.id]);

  // Update document.title for SEO (GA4 auto-tracks page views)
  useEffect(() => {
    if (article?.title) {
      document.title = `${article.title} | Sabq`;
    }
    return () => {
      document.title = 'Sabq - Saudi Electronic Newspaper';
    };
  }, [article?.title]);

  useCanonical(article ? `https://sabq.org/en/article/${article.englishSlug || params.slug}` : null);

  if (isLoading) {
    return (
      <EnglishLayout>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Skeleton className="h-8 w-24 mb-6" />
          <Skeleton className="h-12 w-full mb-4" />
          <Skeleton className="h-6 w-3/4 mb-8" />
          <Skeleton className="h-96 w-full mb-8" />
          <Skeleton className="h-64 w-full" />
        </div>
      </EnglishLayout>
    );
  }

  if (!article) {
    return (
      <EnglishLayout>
        <div className="container mx-auto px-4 py-12 max-w-2xl text-center">
          <h2 className="text-2xl font-bold mb-4">Article Not Found</h2>
          <p className="text-muted-foreground mb-6">
            The article you're looking for doesn't exist or has been removed.
          </p>
          <Link href="/en">
            <Button data-testid="button-back-home">
              Back to Home
            </Button>
          </Link>
        </div>
      </EnglishLayout>
    );
  }

  // Sanitize HTML content with XSS protection
  const sanitizedContent = DOMPurify.sanitize(article.content, {
    ADD_TAGS: ['iframe', 'blockquote', 'img', 'figure', 'figcaption'],
    ADD_ATTR: [
      'allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src',
      'class', 'data-align', 'data-width', 'data-caption', 'style',
      'alt', 'title', 'loading', 'width', 'height', 'srcset', 'sizes',
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });

  return (
    <EnglishLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 max-w-7xl mx-auto">
          {/* Main Content */}
          <article>
            {/* Breadcrumb / Category Badge */}
            {article.category && (
              <div className="mb-6">
                <Badge variant="secondary" data-testid="badge-category">
                  {article.category.name}
                </Badge>
              </div>
            )}

            {/* Title Section */}
            <header className="mb-8">
              <h1 className="text-3xl md:text-4xl font-bold mb-4 leading-tight" data-testid="text-article-title">
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
                      {article.author.firstNameEn && article.author.lastNameEn
                        ? `${article.author.firstNameEn} ${article.author.lastNameEn}`
                        : article.author.firstName && article.author.lastName
                          ? `${article.author.firstName} ${article.author.lastName}`
                          : "Sabq"}
                    </p>
                    <p className="text-xs">Reporter</p>
                  </div>
                </div>
              )}
              
              <Separator orientation="vertical" className="h-10" />
              
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {article.publishedAt ? (
                  <time dateTime={article.publishedAt.toString()} data-testid="text-publish-date">
                    {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
                  </time>
                ) : (
                  <span>Draft</span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                <span data-testid="text-views">{article.views || 0} views</span>
              </div>

              <FocusReaderTrigger language="en" onClick={() => setFocusOpen(true)} />
              {/* Verified trust chip → links to Content Passport */}
              <PassportTrustBadge slug={params.slug!} language="en" />

              {/* Primary article action: Content Passport above the fold */}
              <DigitalPassportButton slug={params.slug!} language="en" />
            </div>

            {/* Focus mode overlay (Task #80) */}
            <FocusReader
              open={focusOpen}
              onClose={() => setFocusOpen(false)}
              articleId={article.id}
              language="en"
              isLoggedIn={!!user}
              title={article.title}
              subtitle={article.subtitle || article.excerpt || null}
              contentHtml={article.content}
              authorName={article.author
                ? (article.author.firstNameEn && article.author.lastNameEn
                  ? `${article.author.firstNameEn} ${article.author.lastNameEn}`
                  : article.author.firstName && article.author.lastName
                    ? `${article.author.firstName} ${article.author.lastName}`
                    : "Sabq")
                : null}
              publishedAt={article.publishedAt}
              articleSlug={params.slug}
              articleImageUrl={article.imageUrl}
              categoryName={article.category?.name || null}
            />

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
                    <h3 className="font-bold text-base text-primary">Smart Summary</h3>
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
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 mr-1" />
                        Read more
                      </>
                    )}
                  </Button>
                </div>
                <p 
                  className={`text-foreground/90 leading-relaxed text-sm ${!isSummaryExpanded ? 'line-clamp-3' : ''}`} 
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
                  <h3 className="text-lg font-bold mb-6">Gallery</h3>
                  <div className="space-y-8">
                    {mediaAdditionalImages.map((asset: any, index: number) => (
                      <ImageWithCaption
                        key={asset.id || `media-${index}`}
                        imageUrl={asset.url}
                        altText={asset.altText || `Image ${index + 1}`}
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
                        altText={`Image ${mediaAdditionalImages.length + index + 1}`}
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
                {article.hasReacted ? 'Liked' : 'Like'}
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
                {article.isBookmarked ? 'Saved' : 'Save'}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                data-testid="button-share"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            </div>

            {/* Keywords/Tags - from SEO field OR article_tags table */}
            {((article.seo?.keywords && article.seo.keywords.length > 0) || articleTags.length > 0) && (
              <div className="pt-8 border-t">
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                  Related Topics
                </h3>
                <div className="flex flex-wrap gap-2">
                  {/* Display article tags first (from article_tags table - WhatsApp/Email) */}
                  {articleTags.map((tag, index) => (
                    <Badge
                      key={`tag-${tag.id}`}
                      variant="secondary"
                      className="cursor-pointer hover-elevate active-elevate-2 transition-all duration-300"
                      onClick={() => setLocation(`/en/keyword/${encodeURIComponent(tag.nameEn || tag.nameAr)}`)}
                      data-testid={`badge-tag-${index}`}
                    >
                      {tag.nameEn || tag.nameAr}
                    </Badge>
                  ))}
                  {/* Display SEO keywords if no article tags */}
                  {articleTags.length === 0 && article.seo?.keywords?.map((keyword, index) => (
                    <Badge
                      key={`seo-${index}`}
                      variant="secondary"
                      className="cursor-pointer hover-elevate active-elevate-2 transition-all duration-300"
                      onClick={() => setLocation(`/en/keyword/${encodeURIComponent(keyword)}`)}
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
              <EnAiArticleStats slug={params.slug || ""} />
            </Suspense>

            {/* Related Articles */}
            {relatedArticles.length > 0 && (
              <EnglishRecommendationsWidget
                articles={relatedArticles}
                title="Related Articles"
                reason="You might also like"
              />
            )}
          </aside>
        </div>
      </div>
      <EnglishFooter />
    </EnglishLayout>
  );
}
