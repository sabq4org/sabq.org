import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Header } from "@/components/Header";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Circle, ArrowLeft, ArrowUpLeft, Sparkles, Calendar, PenLine, BookOpen, FileText } from "lucide-react";
import { getLucideIcon } from "@/lib/lucideIconMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { angleTheme } from "@/lib/angleTheme";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import type { Topic, Angle } from "@shared/schema";

function getIconComponent(iconKey: string) {
  return getLucideIcon(iconKey, Circle);
}

interface TopicWithAngle extends Topic {
  angle?: Angle;
}

type AngleWithStats = Angle & {
  topicCount?: number;
  writerName?: string | null;
  writerAvatar?: string | null;
};

export default function Muqtarab() {
  const { toast } = useToast();

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: angles, isLoading: anglesLoading, error } = useQuery<AngleWithStats[]>({
    queryKey: ["/api/muqtarab/angles?active=true&withStats=1"],
    staleTime: 5 * 60 * 1000,
  });

  // Fetch featured topics
  const { data: allTopics, isLoading: topicsLoading } = useQuery<TopicWithAngle[]>({
    queryKey: ["/api/muqtarab/topics/featured", 50],
    queryFn: async () => {
      const res = await fetch("/api/muqtarab/topics/featured?limit=50", {
        credentials: "include",
      });
      if (!res.ok) return [];
      return await res.json();
    },
  });

  // الأحدث أولاً — نقطة /featured لا تضمن الترتيب الزمني
  const sortedTopics = (Array.isArray(allTopics) ? [...allTopics] : []).sort((a, b) => {
    const tA = new Date(a.publishedAt ?? a.createdAt).getTime();
    const tB = new Date(b.publishedAt ?? b.createdAt).getTime();
    return tB - tA;
  });

  useEffect(() => {
    if (error) {
      toast({
        title: "خطأ في تحميل الزوايا",
        description: error instanceof Error ? error.message : "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  useEffect(() => {
    document.title = "مُقترب - سبق | زوايا متنوعة للأحداث والقضايا";
    
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'استكشف زوايا مُقترب المتنوعة - تحليلات عميقة ومنظورات فريدة للأحداث والقضايا المهمة');
    }
  }, []);

  const isLoading = anglesLoading || topicsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={user} />
        <main className="container max-w-7xl mx-auto px-4 py-6">
          <div className="space-y-8">
            {/* Topics skeleton */}
            <div className="space-y-4">
              <Skeleton className="h-6 w-40 rounded-lg" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-64 rounded-xl" />
                ))}
              </div>
            </div>
            {/* Angles skeleton */}
            <div className="space-y-4">
              <Skeleton className="h-6 w-32 rounded-lg" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-52 rounded-xl" />
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !angles || angles.length === 0) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={user} />
        <main className="container mx-auto px-4 py-20 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-3">لا توجد زوايا متاحة</h2>
            <p className="text-muted-foreground">سيتم إضافة زوايا جديدة قريباً</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user} />

      <main className="relative overflow-hidden">
        {/* Hero Section with big centered title */}
        <section className="relative pt-16 pb-8 px-4" data-testid="section-hero">
          <div className="absolute inset-0 h-[50vh]">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
            <div className="absolute top-20 right-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
            <div className="absolute bottom-20 left-10 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
          </div>
          
          <div className="container max-w-4xl mx-auto text-center relative">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              <span>محتوى حصري ومتعمق</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-black mb-6 bg-gradient-to-l from-foreground via-foreground to-muted-foreground bg-clip-text" data-testid="heading-title">
              مُقترب
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-6" data-testid="text-tagline">
              زوايا فريدة تأخذك إلى أعماق القصص والأحداث
            </p>
            
            <Link href="/muqtarab/submit">
              <Button size="lg" className="gap-2" data-testid="button-submit-angle">
                <PenLine className="w-5 h-5" />
                اقترح زاويتك
              </Button>
            </Link>
          </div>
        </section>

        <div className="container max-w-7xl mx-auto px-4 py-6">
        <div className="space-y-6">

          {/* Recent Topics — global feed across all angles */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-br from-primary to-primary/80 p-1.5 rounded-lg shadow-sm">
                <BookOpen className="h-4 w-4 text-primary-foreground" />
              </div>
              <h2 className="text-lg font-bold">أحدث المواضيع</h2>
            </div>

            {sortedTopics.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedTopics.map((topic) => {
                  const angle = topic.angle;
                  const angleColor = angle?.colorHex || '#6366f1';
                  const Icon = angle ? getIconComponent(angle.iconKey || 'Circle') : Sparkles;

                  return (
                    <Link
                      key={topic.id}
                      href={`/muqtarab/${angle?.slug || 'general'}/topic/${topic.slug}`}
                      className="group"
                    >
                      <Card
                        className="h-full overflow-hidden border border-border/60 shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer group-hover:-translate-y-0.5"
                        data-testid={`topic-card-${topic.id}`}
                      >
                        <div className="relative">
                          {topic.heroImageUrl ? (
                            <div className="relative h-40 overflow-hidden">
                              <img
                                src={topic.heroImageUrl}
                                alt={topic.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                loading="lazy"
                              />
                              <div
                                className="absolute inset-0"
                                style={{ background: `linear-gradient(to top, ${angleColor}cc 0%, ${angleColor}30 50%, transparent 100%)` }}
                              />
                              <div className="absolute bottom-2 right-2">
                                <div
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[10px] font-medium backdrop-blur-md"
                                  style={{ backgroundColor: `${angleColor}cc` }}
                                >
                                  <Icon className="h-2.5 w-2.5" />
                                  <span>{angle?.nameAr || 'مُقترب'}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="relative h-40 flex items-center justify-center angle-animated-cover"
                              style={angleTheme(angleColor).vars}
                            >
                              <div className="p-3 rounded-2xl" style={{ backgroundColor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}>
                                <Icon className="h-8 w-8 text-white" />
                              </div>
                              <div className="absolute bottom-2 right-2">
                                <div
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[10px] font-medium backdrop-blur-md"
                                  style={{ backgroundColor: `${angleColor}cc` }}
                                >
                                  <Icon className="h-2.5 w-2.5" />
                                  <span>{angle?.nameAr || 'مُقترب'}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <CardContent className="p-3 space-y-2">
                          <h3 className="font-bold text-base line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                            {topic.title}
                          </h3>

                          {topic.excerpt && (
                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                              {topic.excerpt}
                            </p>
                          )}

                          <div className="flex items-center justify-between pt-2 border-t border-border/50">
                            {topic.publishedAt && (
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                <span>
                                  {formatDistanceToNow(new Date(topic.publishedAt), {
                                    addSuffix: true,
                                    locale: ar,
                                  })}
                                </span>
                              </div>
                            )}
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: `${angleColor}15`, color: angleColor }}
                            >
                              اقرأ
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="w-full py-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>لا توجد مواضيع منشورة بعد</p>
              </div>
            )}
          </div>

          {/* Angles Showcase — bto3atu rich destination cards */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-br from-primary to-primary/80 p-1.5 rounded-lg shadow-sm">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <h2 className="text-lg font-bold">الزوايا</h2>
              <span className="text-xs text-muted-foreground">— اختر زاوية وادخل عالم كاتبها</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {angles.map((angle) => {
                const Icon = getIconComponent(angle.iconKey || 'Circle');
                const theme = angleTheme(angle.colorHex);
                const topicCount = angle.topicCount ?? 0;
                return (
                  <Link
                    key={angle.id}
                    href={`/muqtarab/${angle.slug}`}
                    className="group"
                    data-testid={`card-angle-${angle.id}`}
                  >
                    <Card
                      className="h-full overflow-hidden border border-border/60 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group-hover:-translate-y-0.5"
                      style={theme.vars}
                    >
                      {/* Cover */}
                      <div className={`relative h-24 sm:h-28 overflow-hidden${angle.coverImageUrl ? '' : ' angle-animated-cover'}`}>
                        {angle.coverImageUrl && (
                          <>
                            <img
                              src={angle.coverImageUrl}
                              alt={angle.nameAr}
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                              loading="lazy"
                            />
                            <div
                              className="absolute inset-0"
                              style={{ background: `linear-gradient(to top, ${angle.colorHex}cc 0%, ${angle.colorHex}40 60%, transparent 100%)` }}
                            />
                          </>
                        )}
                        {/* Icon badge */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div
                            className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-md"
                            style={{ backgroundColor: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)' }}
                          >
                            <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-white drop-shadow" />
                          </div>
                        </div>
                        {/* Topic count chip */}
                        <div className="absolute top-2 left-2">
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 text-white text-[10px] font-medium backdrop-blur-md">
                            <FileText className="h-2.5 w-2.5" />
                            <span>{topicCount} موضوعاً</span>
                          </div>
                        </div>
                      </div>

                      <CardContent className="p-3 space-y-1.5">
                        <h3 className="font-bold text-sm sm:text-base leading-snug line-clamp-1 group-hover:text-[color:var(--angle)] transition-colors">
                          {angle.nameAr}
                        </h3>
                        {angle.nameEn && (
                          <p className="text-[11px] text-muted-foreground/80 line-clamp-1 uppercase tracking-wide">
                            {angle.nameEn}
                          </p>
                        )}
                        {angle.shortDesc && (
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed min-h-[2.2rem]">
                            {angle.shortDesc}
                          </p>
                        )}

                        <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/50">
                          {angle.writerName ? (
                            <div className="flex items-center gap-1.5 min-w-0">
                              {angle.writerAvatar ? (
                                <img src={angle.writerAvatar} alt={angle.writerName} className="w-5 h-5 rounded-full object-cover" loading="lazy" />
                              ) : (
                                <div
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                                  style={{ backgroundColor: angle.colorHex }}
                                >
                                  {angle.writerName.charAt(0)}
                                </div>
                              )}
                              <span className="text-[11px] text-muted-foreground truncate">{angle.writerName}</span>
                            </div>
                          ) : <span />}
                          <ArrowUpLeft className="h-3.5 w-3.5 text-muted-foreground group-hover:text-[color:var(--angle)] transition-colors flex-shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Invitation Banner */}
          <div className="mt-4">
            <Link href="/muqtarab/submit">
              <div 
                className="group relative overflow-hidden rounded-xl p-4 cursor-pointer hover-elevate active-elevate-2 transition-all"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary) / 0.08) 0%, hsl(var(--primary) / 0.03) 100%)',
                  border: '1px solid hsl(var(--primary) / 0.15)'
                }}
                data-testid="banner-suggest-angle"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary/20 blur-md rounded-full" />
                      <div className="relative bg-gradient-to-br from-primary to-primary/80 p-2 rounded-lg shadow-sm">
                        <PenLine className="h-4 w-4 text-primary-foreground" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-sm group-hover:text-primary transition-colors">
                        هل لديك قلم يستحق زاوية؟
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        قدّم نفسك ككاتب وأطلق زاويتك الخاصة في مُقترب
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="gap-1 whitespace-nowrap"
                    data-testid="button-suggest-angle-banner"
                  >
                    اقترح زاويتك
                    <ArrowLeft className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </Link>
          </div>
        </div>
        </div>
      </main>
    </div>
  );
}
