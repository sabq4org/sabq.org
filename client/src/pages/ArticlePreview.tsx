import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ImageWithCaption } from "@/components/ImageWithCaption";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Clock, 
  Sparkles, 
  Zap, 
  Eye,
  ArrowRight,
  Edit,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { formatArticleTimestamp } from "@/lib/formatTime";
import type { ArticleWithDetails } from "@shared/schema";
import { useEffect } from "react";
import DOMPurify from "isomorphic-dompurify";

export default function ArticlePreview() {
  const { id } = useParams<{ id: string }>();

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: article, isLoading, error } = useQuery<ArticleWithDetails & { isPreview?: boolean }>({
    queryKey: [`/api/articles/${id}/preview`],
    enabled: !!id,
  });

  useEffect(() => {
    document.documentElement.dir = "rtl";
    document.documentElement.lang = "ar";
    
    return () => {
      document.documentElement.dir = "ltr";
      document.documentElement.lang = "en";
    };
  }, []);

  useEffect(() => {
    if (article?.title) {
      document.title = `معاينة: ${article.title} | سبق`;
    }
    return () => {
      document.title = 'سبق - صحيفة إلكترونية سعودية';
    };
  }, [article?.title]);

  const resolvedAuthor = article?.articleType === 'opinion'
    ? article?.opinionAuthor
    : article?.author;

  const getInitials = (firstName?: string | null, lastName?: string | null, email?: string | null) => {
    if (firstName && lastName) {
      return `${firstName?.[0]}${lastName?.[0]}`.toUpperCase();
    }
    if (firstName) return firstName?.[0].toUpperCase();
    if (email) return email[0].toUpperCase();
    return 'م';
  };

  const estimateReadingTime = (content: string): number => {
    const wordsPerMinute = 200;
    const words = content.split(/\s+/).length;
    const minutes = Math.ceil(words / wordsPerMinute);
    return minutes || 1;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background/95 relative z-10">
        <Header user={user} />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-4xl mx-auto">
            <Skeleton className="h-8 w-3/4 mb-4" />
            <Skeleton className="h-4 w-1/2 mb-8" />
            <Skeleton className="w-full aspect-[16/9] mb-8" />
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="min-h-screen bg-background/95 relative z-10">
        <Header user={user} />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4">المقال غير موجود</h1>
            <p className="text-muted-foreground mb-8">
              عذراً، لم نتمكن من العثور على المقال المطلوب أو ليس لديك صلاحية لمعاينته
            </p>
            <Button asChild>
              <Link href="/dashboard/articles">
                العودة لإدارة المقالات
              </Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const timeAgo = article.publishedAt
    ? formatArticleTimestamp(article.publishedAt, { format: 'relative', locale: 'ar' })
    : null;

  const readingTime = article.content ? estimateReadingTime(article.content) : 1;

  return (
    <div className="min-h-screen bg-background/95 relative z-10" dir="rtl">
      <Header user={user} />

      {/* Preview Mode Banner */}
      <div className="bg-amber-500 dark:bg-card text-black dark:text-foreground py-3 px-4 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            <span className="font-bold text-lg">وضع المعاينة</span>
            <Badge variant="secondary" className="bg-black/20 text-black border-black/30 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30">
              {article.status === 'draft' ? 'مسودة' : article.status === 'published' ? 'منشور' : article.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-white/90 hover:bg-white text-black border-black/30 gap-1.5"
              asChild
            >
              <Link href={`/dashboard/articles/${id}/edit`}>
                <Edit className="h-4 w-4" />
                تحرير المقال
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/90 hover:bg-white text-black border-black/30 gap-1.5"
              asChild
            >
              <Link href="/dashboard/articles">
                <ArrowRight className="h-4 w-4" />
                العودة للمحرر
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Preview Notice */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-4 max-w-7xl">
        <div className="bg-amber-50 dark:bg-card border border-amber-200 dark:border-border rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>هذه معاينة للمقال.</strong> المحتوى الظاهر هنا هو كيف سيبدو المقال للقراء بعد النشر.
              لن يتم احتساب هذه الزيارة ضمن إحصائيات المشاهدات.
            </p>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
        <div className="max-w-4xl mx-auto">
          <article className="space-y-6">
            {/* Article Header Card */}
            <div className="bg-card border rounded-lg p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {article.category && (
                  <Badge 
                    variant="secondary" 
                    className="gap-1 text-black"
                    style={{ borderRight: `3px solid ${article.category.color || 'hsl(var(--primary))'}`, backgroundColor: '#e5e5e6' }}
                    data-testid="badge-article-category"
                  >
                    {article.category.icon} {article.category.nameAr}
                  </Badge>
                )}
                {article.newsType === 'breaking' && (
                  <Badge className="bg-red-600 hover:bg-red-700 text-white border-red-600 gap-1" data-testid="badge-article-urgent">
                    <Zap className="h-3 w-3" />
                    عاجل
                  </Badge>
                )}
                {article.aiGenerated && (
                  <Badge variant="secondary" className="gap-1" data-testid="badge-article-ai">
                    <Sparkles className="h-3 w-3" />
                    محتوى مُنشأ بالذكاء الاصطناعي
                  </Badge>
                )}
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-snug" data-testid="text-article-title">
                {article.title}
              </h1>

              {/* Author Byline */}
              {resolvedAuthor && (
                <div className="flex items-center gap-3 flex-wrap">
                  <Avatar className="h-10 w-10 border border-primary/20 shrink-0">
                    <AvatarImage 
                      src={resolvedAuthor?.profileImageUrl || ""} 
                      alt={`${resolvedAuthor?.firstName || ""} ${resolvedAuthor?.lastName || ""}`.trim() || resolvedAuthor?.email || ""}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                      {getInitials(resolvedAuthor?.firstName, resolvedAuthor?.lastName, resolvedAuthor?.email)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="min-w-0">
                    <span className="text-sm font-bold flex items-center gap-1" data-testid="text-author-name">
                      {resolvedAuthor?.firstName && resolvedAuthor?.lastName
                        ? `${resolvedAuthor.firstName} ${resolvedAuthor.lastName}`
                        : resolvedAuthor?.email}
                      {article.staff?.isVerified && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                    </span>
                    {(article.staff as any)?.title && (
                      <span className="text-xs text-muted-foreground block">
                        {(article.staff as any).title}
                      </span>
                    )}
                  </div>

                  <span className="text-muted-foreground/40 hidden sm:inline">|</span>
                  
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {timeAgo && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 opacity-70" />
                        {timeAgo}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3 opacity-70" />
                      {readingTime} د قراءة
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Featured Image */}
            {article.imageUrl && (
              <ImageWithCaption
                imageUrl={article.imageUrl}
                altText={article.title}
                isAiGenerated={(article as any).isAiGeneratedImage || false}
                aiModel={(article as any).aiImageModel}
                priority={true}
                className=""
              />
            )}

            {/* Smart Summary */}
            {(article.aiSummary || article.excerpt) && (
              <div className="bg-muted/30 border rounded-lg p-3 sm:p-4">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="h-3 w-3 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold mb-1">الموجز الذكي</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {article.aiSummary || article.excerpt}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Article Content */}
            <div className="bg-card border rounded-lg p-6">
              <div 
                className="prose prose-lg dark:prose-invert max-w-none article-content"
                dangerouslySetInnerHTML={{ 
                  __html: DOMPurify.sanitize(article.content || '', {
                    ADD_TAGS: ['iframe', 'blockquote'],
                    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'class', 'data-theme'],
                  }) 
                }}
                data-testid="article-content"
              />
            </div>
          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
}
