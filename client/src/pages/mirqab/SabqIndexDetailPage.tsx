import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, TrendingDown, Minus, Calendar, Eye, ArrowLeft, Share2, Twitter, Facebook, Linkedin } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import type { MirqabEntryWithDetails } from "@shared/schema";

export default function SabqIndexDetailPage() {
  const { user } = useAuth();

  const [, params] = useRoute("/mirqab/sabq-index/:slug");
  const slug = params?.slug;

  const { data: entry, isLoading } = useQuery<MirqabEntryWithDetails>({
    queryKey: [`/api/mirqab/entries/slug/${slug}`],
    enabled: !!slug,
  });

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      economic: 'اقتصادي',
      political: 'سياسي',
      social: 'اجتماعي',
      technology: 'تقني',
    };
    return labels[category] || category;
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="w-6 h-6" />;
    if (trend === 'down') return <TrendingDown className="w-6 h-6" />;
    return <Minus className="w-6 h-6" />;
  };

  const getTrendColor = (trend: string) => {
    if (trend === 'up') return 'text-green-600 dark:text-green-400';
    if (trend === 'down') return 'text-red-600 dark:text-red-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  const getTrendLabel = (trend: string) => {
    if (trend === 'up') return 'في تصاعد';
    if (trend === 'down') return 'في تراجع';
    return 'مستقر';
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

  const sabqIndex = entry.sabqIndex;
  if (!sabqIndex) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={user || undefined} />
        <div className="container mx-auto px-4 max-w-4xl py-12 text-center">
          <h2 className="text-2xl font-bold">المؤشر غير متاح</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user || undefined} />
      
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-900 dark:via-purple-900 dark:to-pink-900 text-white py-16">
        <div className="absolute inset-0 bg-black/20 dark:bg-black/40"></div>
        <div className="relative container mx-auto px-4 max-w-4xl">
          <div className="flex items-center gap-3 mb-6">
            <Link href="/mirqab/sabq-index">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <Badge variant="secondary" data-testid="badge-category">
              {getCategoryLabel(sabqIndex.indexCategory)}
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
        {/* Value Card */}
        <Card data-testid="card-value">
          <CardContent className="pt-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="text-6xl font-bold text-primary mb-2" data-testid="text-index-value">
                  {sabqIndex.indexValue}
                </div>
                <div className="text-lg text-muted-foreground">
                  من {sabqIndex.maxValue}
                </div>
              </div>
              <div className={`flex items-center gap-3 ${getTrendColor(sabqIndex.trend)}`}>
                {getTrendIcon(sabqIndex.trend)}
                <span className="text-2xl font-semibold" data-testid="text-trend">
                  {getTrendLabel(sabqIndex.trend)}
                </span>
              </div>
            </div>
            <div className="text-sm text-muted-foreground" data-testid="text-period">
              الفترة: {sabqIndex.period}
            </div>
          </CardContent>
        </Card>

        {/* Chart */}
        {sabqIndex.chartData && sabqIndex.chartData.length > 0 && (
          <Card data-testid="card-chart">
            <CardHeader>
              <CardTitle>مسار المؤشر</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={sabqIndex.chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: 'currentColor' }}
                    tickFormatter={(value) => {
                      try {
                        return format(new Date(value), 'dd/MM', { locale: ar });
                      } catch {
                        return value;
                      }
                    }}
                  />
                  <YAxis tick={{ fill: 'currentColor' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--background)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Analysis */}
        <Card data-testid="card-analysis">
          <CardHeader>
            <CardTitle>التحليل</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-lg dark:prose-invert max-w-none" data-testid="text-analysis">
              {sabqIndex.analysis.split('\n').map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Methodology */}
        {sabqIndex.methodology && (
          <Card data-testid="card-methodology">
            <CardHeader>
              <CardTitle>المنهجية</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground" data-testid="text-methodology">
                {sabqIndex.methodology.split('\n').map((paragraph, idx) => (
                  <p key={idx} className="mb-2">{paragraph}</p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data Sources */}
        {sabqIndex.dataSources && sabqIndex.dataSources.length > 0 && (
          <Card data-testid="card-sources">
            <CardHeader>
              <CardTitle>مصادر البيانات</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-2">
                {sabqIndex?.dataSources?.map((source, idx) => (
                  <li key={idx} className="text-muted-foreground" data-testid={`text-source-${idx}`}>
                    {source}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Share */}
        <Card data-testid="card-share">
          <CardHeader>
            <CardTitle>شارك المؤشر</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="sm"
                onClick={shareOnTwitter}
                data-testid="button-share-twitter"
              >
                <Twitter className="w-4 h-4 ml-2" />
                تويتر
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={shareOnFacebook}
                data-testid="button-share-facebook"
              >
                <Facebook className="w-4 h-4 ml-2" />
                فيسبوك
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={shareOnLinkedIn}
                data-testid="button-share-linkedin"
              >
                <Linkedin className="w-4 h-4 ml-2" />
                لينكد إن
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
