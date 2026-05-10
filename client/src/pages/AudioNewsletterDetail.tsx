import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Clock, Headphones, Share2, ChevronDown, ChevronUp, ArrowLeft, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { AudioPlayer } from "@/components/AudioPlayer";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Article {
  id: string;
  title: string;
  excerpt: string | null;
  slug: string;
  englishSlug: string | null;
  category?: {
    nameAr: string;
    color: string;
  };
}

interface AudioNewsletter {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  coverImageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  totalListens: number;
  publishedAt: string;
  articles: Article[];
}

export default function AudioNewsletterDetail() {
  const [, params] = useRoute("/audio-newsletters/:slug");
  const { toast } = useToast();
  const { user } = useAuth();
  const [isArticlesExpanded, setIsArticlesExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const { data: newsletter, isLoading } = useQuery<AudioNewsletter>({
    queryKey: ["/api/audio-newsletters", params?.slug],
    enabled: !!params?.slug,
  });

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setIsCopied(true);
      toast({
        title: "تم النسخ",
        description: "تم نسخ الرابط إلى الحافظة",
      });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل نسخ الرابط",
        variant: "destructive",
      });
    }
  };

  const shareOnTwitter = () => {
    const text = `استمع إلى: ${newsletter?.title}`;
    const url = window.location.href;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank");
  };

  const shareOnWhatsApp = () => {
    const text = `استمع إلى: ${newsletter?.title} ${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col" dir="rtl">
        <Header user={user} />
        <main className="flex-1 bg-background">
          <div className="container mx-auto px-4 py-8">
            <Skeleton className="h-96 w-full mb-8" />
            <Skeleton className="h-32 w-full" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!newsletter) {
    return (
      <div className="min-h-screen flex flex-col" dir="rtl">
        <Header user={user} />
        <main className="flex-1 bg-background flex items-center justify-center">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle data-testid="heading-not-found">النشرة غير موجودة</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                عذراً، النشرة الصوتية التي تبحث عنها غير موجودة
              </p>
              <Button asChild data-testid="button-back-archive">
                <Link href="/audio-newsletters">
                  <ArrowLeft className="h-4 w-4 ml-2" />
                  العودة للأرشيف
                </Link>
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Header user={user} />

      <main className="flex-1 bg-background">
        <article className="container mx-auto px-4 py-8 max-w-4xl space-y-8">
          {/* Back Button */}
          <Button variant="ghost" asChild data-testid="button-back">
            <Link href="/audio-newsletters">
              <ArrowLeft className="h-4 w-4 ml-2" />
              العودة للأرشيف
            </Link>
          </Button>

          {/* Cover Image */}
          {newsletter.coverImageUrl && (
            <div className="relative h-64 md:h-96 rounded-lg overflow-hidden">
              <img
                src={newsletter.coverImageUrl}
                alt={newsletter.title}
                className="w-full h-full object-cover"
                data-testid="img-cover"
              />
            </div>
          )}

          {/* Header */}
          <div className="space-y-4">
            <h1 className="text-3xl md:text-4xl font-bold" data-testid="heading-title">
              {newsletter.title}
            </h1>

            {newsletter.description && (
              <p className="text-lg text-muted-foreground" data-testid="text-description">
                {newsletter.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {newsletter.duration && (
                <div className="flex items-center gap-1" data-testid="text-duration">
                  <Clock className="h-4 w-4" />
                  {formatDuration(newsletter.duration)}
                </div>
              )}
              <div className="flex items-center gap-1" data-testid="text-listens">
                <Headphones className="h-4 w-4" />
                استمع إليها {newsletter.totalListens.toLocaleString("ar-EG")} شخص
              </div>
              <div data-testid="text-published">
                {formatDistanceToNow(new Date(newsletter.publishedAt), {
                  addSuffix: true,
                  locale: arSA,
                })}
              </div>
            </div>
          </div>

          {/* Audio Player - Sticky */}
          {newsletter.audioUrl && (
            <div className="sticky top-20 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 rounded-lg shadow-lg">
              <AudioPlayer
                newsletterId={newsletter.id}
                audioUrl={newsletter.audioUrl}
                title={newsletter.title}
                duration={newsletter.duration || undefined}
                className="border-2"
              />
            </div>
          )}

          {/* Share Buttons */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Share2 className="h-5 w-5" />
                مشاركة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={copyShareLink}
                  className="gap-2"
                  data-testid="button-copy-link"
                >
                  {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  نسخ الرابط
                </Button>
                <Button
                  variant="outline"
                  onClick={shareOnTwitter}
                  className="gap-2"
                  data-testid="button-share-twitter"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  مشاركة على X
                </Button>
                <Button
                  variant="outline"
                  onClick={shareOnWhatsApp}
                  className="gap-2"
                  data-testid="button-share-whatsapp"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                  </svg>
                  واتساب
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Articles List */}
          {newsletter.articles && newsletter.articles.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>
                    المقالات المضمنة ({newsletter.articles.length})
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsArticlesExpanded(!isArticlesExpanded)}
                    data-testid="button-toggle-articles"
                  >
                    {isArticlesExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              {isArticlesExpanded && (
                <CardContent>
                  <div className="space-y-4">
                    {newsletter?.articles?.map((article, index) => (
                      <div key={article.id}>
                        {index > 0 && <Separator className="my-4" />}
                        <Link
                          href={`/article/${article.englishSlug || article.slug}`}
                          className="block space-y-2 hover-elevate p-3 rounded-lg transition-all"
                          data-testid={`link-article-${article.id}`}
                        >
                          <div className="flex items-start gap-2">
                            <Badge variant="outline" className="mt-1">
                              {index + 1}
                            </Badge>
                            <div className="flex-1 space-y-1">
                              <h3 className="font-semibold hover:text-primary transition-colors">
                                {article.title}
                              </h3>
                              {article.excerpt && (
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                  {article.excerpt}
                                </p>
                              )}
                              {article.category && (
                                <Badge
                                  variant="secondary"
                                  style={{ backgroundColor: `${article.category.color}20` }}
                                >
                                  {article.category.nameAr}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </article>
      </main>

      <Footer />
    </div>
  );
}
