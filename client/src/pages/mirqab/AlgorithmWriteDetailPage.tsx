import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Brain, Calendar, Eye, ArrowLeft, Share2, Twitter, Facebook, Linkedin, CheckCircle2, User, FileText } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { MirqabEntryWithDetails } from "@shared/schema";

export default function AlgorithmWriteDetailPage() {
  const { user } = useAuth();

  const [, params] = useRoute("/mirqab/algorithm-writes/:slug");
  const slug = params?.slug;

  const { data: entry, isLoading } = useQuery<MirqabEntryWithDetails>({
    queryKey: [`/api/mirqab/entries/slug/${slug}`],
    enabled: !!slug,
  });

  const getAnalysisTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      opinion: 'رأي',
      analysis: 'تحليل',
      forecast: 'توقعات',
    };
    return labels[type] || type;
  };

  const shareOnTwitter = () => {
    const url = window.location.href;
    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(entry?.title || '')}`, '_blank');
  };

  const shareOnFacebook = () => {
    const url = window.location.href;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
  };

  const shareOnLinkedIn = () => {
    const url = window.location.href;
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
  };

  if (isLoading || !entry) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={user || undefined} />
        <div className="container mx-auto px-4 max-w-4xl py-12">
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="h-6 w-1/2 mb-8" />
          <Skeleton className="h-96 w-full mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const algorithmArticle = entry.algorithmArticle;
  if (!algorithmArticle) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={user || undefined} />
        <div className="container mx-auto px-4 max-w-4xl py-12 text-center">
          <h2 className="text-2xl font-bold">المقال غير متاح</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user || undefined} />
      
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-green-600 via-emerald-600 to-teal-600 dark:from-green-900 dark:via-emerald-900 dark:to-teal-900 text-white py-16">
        <div className="absolute inset-0 bg-black/20 dark:bg-black/40"></div>
        <div className="relative container mx-auto px-4 max-w-4xl">
          <div className="flex items-center gap-3 mb-6">
            <Link href="/mirqab/algorithm-writes">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <Badge variant="secondary" data-testid="badge-analysis-type">
              {getAnalysisTypeLabel(algorithmArticle.analysisType)}
            </Badge>
          </div>
          <h1 className="text-4xl font-bold mb-4" data-testid="heading-title">
            {entry.title}
          </h1>
          <div className="flex items-center gap-4 text-white/80">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span data-testid="text-date">
                {entry.publishedAt && format(new Date(entry.publishedAt), 'dd MMMM yyyy', { locale: ar })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              <span data-testid="text-views">{entry.views || 0}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-4xl py-12 space-y-8">
        {/* Transparency Box */}
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20" data-testid="card-transparency">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              معلومات الشفافية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-background/50 rounded-md">
              <Brain className="w-8 h-8 text-primary" />
              <div className="flex-1">
                <p className="font-semibold text-lg">مكتوب بواسطة الذكاء الاصطناعي</p>
                <p className="text-sm text-muted-foreground">
                  هذا المحتوى تم إنشاؤه باستخدام نموذج الذكاء الاصطناعي بشفافية كاملة
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-background/50 rounded-md">
                <p className="text-sm text-muted-foreground mb-1">النموذج المستخدم</p>
<p className="font-semibold" data-testid="text-model">
                  {algorithmArticle.aiModel}
                </p>
              </div>
              <div className="p-3 bg-background/50 rounded-md">
                <p className="text-sm text-muted-foreground mb-1">نسبة محتوى AI</p>
                <p className="font-semibold" data-testid="text-ai-percentage">
                  {algorithmArticle.aiPercentage}%
                </p>
              </div>
            </div>

            <div className="p-3 bg-background/50 rounded-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  <p className="font-semibold">مراجعة بشرية</p>
                </div>
                {algorithmArticle.humanReviewed ? (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <span data-testid="text-reviewed">نعم</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground" data-testid="text-not-reviewed">لا</span>
                )}
              </div>
              {algorithmArticle.humanReviewed && entry.editor && (
                <p className="text-sm text-muted-foreground mt-2" data-testid="text-reviewer">
                  المراجع: {entry.editor.firstName} {entry.editor.lastName}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Content */}
        <Card data-testid="card-content">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              المحتوى
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-lg dark:prose-invert max-w-none" data-testid="text-content">
              {algorithmArticle.content.split('\n').map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Reviewer Notes */}
        {algorithmArticle.reviewerNotes && (
          <Card data-testid="card-reviewer-notes">
            <CardHeader>
              <CardTitle>ملاحظات المراجع</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground" data-testid="text-reviewer-notes">
                {algorithmArticle.reviewerNotes.split('\n').map((paragraph, idx) => (
                  <p key={idx} className="mb-2">{paragraph}</p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Share Buttons */}
        <div className="flex items-center justify-center gap-4" data-testid="share-container">
          <span className="text-muted-foreground">مشاركة:</span>
          <Button
            variant="outline"
            size="icon"
            onClick={shareOnTwitter}
            data-testid="button-share-twitter"
          >
            <Twitter className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={shareOnFacebook}
            data-testid="button-share-facebook"
          >
            <Facebook className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={shareOnLinkedIn}
            data-testid="button-share-linkedin"
          >
            <Linkedin className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
