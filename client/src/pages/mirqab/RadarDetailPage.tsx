import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Radar, Calendar, Eye, ArrowLeft, Share2, Twitter, Facebook, Linkedin, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { MirqabEntryWithDetails } from "@shared/schema";

export default function RadarDetailPage() {
  const { user } = useAuth();

  const [, params] = useRoute("/mirqab/radar/:slug");
  const slug = params?.slug;

  const { data: entry, isLoading } = useQuery<MirqabEntryWithDetails>({
    queryKey: [`/api/mirqab/entries/slug/${slug}`],
    enabled: !!slug,
  });

  const getImportanceIcon = (importance: string) => {
    if (importance === 'high') return <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />;
    if (importance === 'medium') return <AlertCircle className="w-6 h-6 text-orange-600 dark:text-orange-400" />;
    return <Info className="w-6 h-6 text-blue-600 dark:text-blue-400" />;
  };

  const getImportanceLabel = (importance: string) => {
    if (importance === 'high') return 'عالي';
    if (importance === 'medium') return 'متوسط';
    return 'منخفض';
  };

  const getImportanceVariant = (importance: string): "destructive" | "default" | "secondary" => {
    if (importance === 'high') return 'destructive';
    if (importance === 'medium') return 'default';
    return 'secondary';
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

  const radarAlert = entry.radarAlert;
  if (!radarAlert) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={user || undefined} />
        <div className="container mx-auto px-4 max-w-4xl py-12 text-center">
          <h2 className="text-2xl font-bold">التقرير غير متاح</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user || undefined} />
      
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-cyan-600 via-blue-600 to-indigo-600 dark:from-cyan-900 dark:via-blue-900 dark:to-indigo-900 text-white py-16">
        <div className="absolute inset-0 bg-black/20 dark:bg-black/40"></div>
        <div className="relative container mx-auto px-4 max-w-4xl">
          <div className="flex items-center gap-3 mb-6">
            <Link href="/mirqab/radar">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <Badge variant="secondary" data-testid="badge-date">
              <Calendar className="w-3 h-3 ml-1" />
              {format(new Date(radarAlert.reportDate), 'dd MMMM yyyy', { locale: ar })}
            </Badge>
          </div>
          <h1 className="text-4xl font-bold mb-4" data-testid="heading-title">
            {entry.title}
          </h1>
          <div className="flex items-center gap-4 text-white/80">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              <span data-testid="text-views">{entry.views || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span data-testid="text-alerts-count">{radarAlert.alerts?.length || 0} تنبيهات</span>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-4xl py-12 space-y-8">
        {/* Summary Card */}
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20" data-testid="card-summary">
          <CardHeader>
            <CardTitle>ملخص اليوم</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg leading-relaxed" data-testid="text-summary">
              {radarAlert.summary}
            </p>
          </CardContent>
        </Card>

        {/* Alerts List */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold" data-testid="heading-alerts">
            التنبيهات ({radarAlert.alerts?.length || 0})
          </h2>
          
          {radarAlert.alerts && radarAlert.alerts.length > 0 ? (
            radarAlert.alerts.map((alert, idx) => (
              <Card key={idx} className="hover-elevate" data-testid={`card-alert-${idx}`}>
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="mt-1" data-testid={`icon-importance-${idx}`}>
                      {getImportanceIcon(alert.importance)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <CardTitle className="text-xl" data-testid={`text-alert-title-${idx}`}>
                          {alert.title}
                        </CardTitle>
                        <Badge 
                          variant={getImportanceVariant(alert.importance)}
                          data-testid={`badge-importance-${idx}`}
                        >
                          {getImportanceLabel(alert.importance)}
                        </Badge>
                      </div>
                      {alert.category && (
                        <Badge variant="outline" className="mt-1" data-testid={`badge-category-${idx}`}>
                          {alert.category}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground leading-relaxed" data-testid={`text-alert-description-${idx}`}>
                    {alert.description}
                  </p>
                  
                  {alert.data && Object.keys(alert.data).length > 0 && (
                    <div className="bg-secondary/20 p-4 rounded-md" data-testid={`data-container-${idx}`}>
                      <h4 className="font-semibold mb-2">البيانات الداعمة:</h4>
                      <div className="space-y-1 text-sm">
                        {Object.entries(alert.data).map(([key, value], dataIdx) => (
                          <div key={dataIdx} className="flex justify-between" data-testid={`data-item-${idx}-${dataIdx}`}>
                            <span className="text-muted-foreground">{key}:</span>
                            <span className="font-medium">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                لا توجد تنبيهات في هذا التقرير
              </CardContent>
            </Card>
          )}
        </div>

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
