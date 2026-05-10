import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Calendar, Eye, ArrowLeft, Share2, Twitter, Facebook, Linkedin, Clock, Tag, Database, Brain, FileText } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { MirqabEntryWithDetails } from "@shared/schema";

export default function NextStoryDetailPage() {
  const { user } = useAuth();

  const [, params] = useRoute("/mirqab/next-stories/:slug");
  const slug = params?.slug;

  const { data: entry, isLoading } = useQuery<MirqabEntryWithDetails>({
    queryKey: [`/api/mirqab/entries/slug/${slug}`],
    enabled: !!slug,
  });

  const getTimingLabel = (timing: string) => {
    const labels: Record<string, string> = {
      week: 'خلال أسبوع',
      month: 'خلال شهر',
      quarter: 'خلال ربع سنة',
      year: 'خلال سنة',
    };
    return labels[timing] || timing;
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

  const nextStory = entry.nextStory;
  if (!nextStory) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={user || undefined} />
        <div className="container mx-auto px-4 max-w-4xl py-12 text-center">
          <h2 className="text-2xl font-bold">القصة غير متاحة</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user || undefined} />
      
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600 dark:from-violet-900 dark:via-fuchsia-900 dark:to-pink-900 text-white py-16">
        <div className="absolute inset-0 bg-black/20 dark:bg-black/40"></div>
        <div className="relative container mx-auto px-4 max-w-4xl">
          <div className="flex items-center gap-3 mb-6">
            <Link href="/mirqab/next-stories">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <Badge variant="secondary" className="flex items-center gap-1" data-testid="badge-timing">
              <Clock className="w-3 h-3" />
              {getTimingLabel(nextStory.expectedTiming)}
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
            {nextStory.expectedDate && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span data-testid="text-expected-date">
                  متوقع: {format(new Date(nextStory.expectedDate), 'dd MMMM yyyy', { locale: ar })}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-4xl py-12 space-y-8">
        {/* Confidence Level Card */}
        <Card data-testid="card-confidence">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              مستوى الثقة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">مستوى الثقة بحدوث هذا السيناريو</span>
              <span className="text-3xl font-bold text-primary" data-testid="text-confidence-value">
                {nextStory.confidenceLevel}%
              </span>
            </div>
            <Progress 
              value={nextStory.confidenceLevel} 
              className="h-3"
              data-testid="progress-confidence"
            />
          </CardContent>
        </Card>

        {/* Executive Summary */}
        <Card data-testid="card-executive-summary">
          <CardHeader>
            <CardTitle>الملخص التنفيذي</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg leading-relaxed" data-testid="text-executive-summary">
              {nextStory.executiveSummary}
            </p>
          </CardContent>
        </Card>

        {/* Full Content */}
        <Card data-testid="card-content">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              التحليل الكامل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-lg dark:prose-invert max-w-none" data-testid="text-content">
              {nextStory.content.split('\n').map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Keywords */}
        {nextStory.keywords && nextStory.keywords.length > 0 && (
          <Card data-testid="card-keywords">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="w-5 h-5" />
                الكلمات المفتاحية
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {nextStory.keywords.map((keyword, idx) => (
                  <Badge key={idx} variant="secondary" data-testid={`badge-keyword-${idx}`}>
                    {keyword}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data Sources */}
        {nextStory.dataSources && nextStory.dataSources.length > 0 && (
          <Card data-testid="card-data-sources">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                المصادر والبيانات الداعمة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-2">
                {nextStory?.dataSources?.map((source, idx) => (
                  <li key={idx} className="text-muted-foreground" data-testid={`text-source-${idx}`}>
                    {source}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* AI Analysis */}
        {nextStory.aiAnalysis && (
          <Card data-testid="card-ai-analysis">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                التحليل الذكي
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground" data-testid="text-ai-analysis">
                {nextStory.aiAnalysis.split('\n').map((paragraph, idx) => (
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
