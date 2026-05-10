import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { Header } from "@/components/Header";
import { useMuqtarabAngles } from "@/lib/muqtarab";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import * as LucideIcons from "lucide-react";
import { Circle, ArrowLeft, Sparkles, Calendar, ChevronLeft, ChevronRight, PenLine, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import type { Topic, Angle } from "@shared/schema";

function getIconComponent(iconKey: string) {
  const iconName = iconKey as keyof typeof LucideIcons;
  const IconComponent = LucideIcons[iconName];
  if (IconComponent && typeof IconComponent === 'function') {
    return IconComponent as React.ComponentType<{ className?: string }>;
  }
  return Circle;
}

interface TopicWithAngle extends Topic {
  angle?: Angle;
}

export default function Muqtarab() {
  useAdTracking('مُقترب');
  
  const { toast } = useToast();
  const [selectedAngle, setSelectedAngle] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  
  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: angles, isLoading: anglesLoading, error } = useMuqtarabAngles("muqtarab");

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

  const checkScrollButtons = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScrollButtons();
    const scrollEl = scrollRef.current;
    if (scrollEl) {
      scrollEl.addEventListener('scroll', checkScrollButtons);
      return () => scrollEl.removeEventListener('scroll', checkScrollButtons);
    }
  }, [allTopics]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({
        left: direction === 'right' ? scrollAmount : -scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Filter topics by selected angle
  const filteredTopics = selectedAngle 
    ? allTopics?.filter(t => t.angleId === selectedAngle) 
    : allTopics;

  const isLoading = anglesLoading || topicsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={user} />
        <main className="container max-w-7xl mx-auto px-4 py-6">
          <div className="space-y-6">
            {/* Angles skeleton */}
            <div className="flex gap-3 overflow-hidden">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-32 rounded-xl flex-shrink-0" />
              ))}
            </div>
            {/* Topics skeleton */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-0 divide-y divide-border/50">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="p-3 flex gap-3">
                    <Skeleton className="w-24 h-16 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
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

        {/* DMS Ads */}
        <div className="container max-w-7xl mx-auto px-4">
          <DmsLeaderboardAd />
          <DmsMpuAd />
        </div>

        <div className="container max-w-7xl mx-auto px-4 py-6">
        <div className="space-y-6">

          {/* Angles Row */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-muted-foreground">الزوايا</h2>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
              {/* All Topics button */}
              <Button
                variant={selectedAngle === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedAngle(null)}
                className="flex-shrink-0 gap-1.5"
                data-testid="button-all-angles"
              >
                <Sparkles className="h-3.5 w-3.5" />
                الكل
              </Button>
              
              {angles.map((angle) => {
                const Icon = getIconComponent(angle.iconKey || 'Circle');
                const isSelected = selectedAngle === angle.id;
                return (
                  <Button
                    key={angle.id}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedAngle(angle.id)}
                    className="flex-shrink-0 gap-1.5"
                    style={isSelected ? { 
                      backgroundColor: angle.colorHex,
                      borderColor: angle.colorHex
                    } : undefined}
                    data-testid={`button-angle-${angle.id}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {angle.nameAr}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Topics Section - Same design as homepage */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-muted-foreground">
                {selectedAngle 
                  ? `مواضيع ${angles.find(a => a.id === selectedAngle)?.nameAr}`
                  : 'جميع المواضيع'
                }
              </h2>
              <div className="hidden md:flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => scroll('right')}
                  disabled={!canScrollRight}
                  data-testid="button-scroll-right"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => scroll('left')}
                  disabled={!canScrollLeft}
                  data-testid="button-scroll-left"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Mobile: List View */}
            <Card className="lg:hidden border-0 shadow-sm overflow-hidden">
              <CardContent className="p-0 divide-y divide-border/50">
                {filteredTopics && filteredTopics.length > 0 ? (
                  filteredTopics.map((topic) => {
                    const angle = topic.angle;
                    const angleColor = angle?.colorHex || '#6366f1';
                    const Icon = angle ? getIconComponent(angle.iconKey || 'Circle') : Sparkles;
                    
                    return (
                      <Link 
                        key={topic.id} 
                        href={`/muqtarab/${angle?.slug || 'general'}/topic/${topic.slug}`}
                      >
                        <div 
                          className="block group cursor-pointer"
                          data-testid={`link-topic-mobile-${topic.id}`}
                        >
                          <div className="p-3 hover-elevate active-elevate-2 transition-all">
                            <div className="flex gap-3">
                              {/* Image */}
                              <div className="relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden">
                                {topic.heroImageUrl ? (
                                  <img
                                    src={topic.heroImageUrl}
                                    alt={topic.title}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div 
                                    className="w-full h-full flex items-center justify-center"
                                    style={{ background: `linear-gradient(135deg, ${angleColor}40 0%, ${angleColor}20 100%)` }}
                                  >
                                    <Icon className="h-6 w-6" style={{ color: angleColor }} />
                                  </div>
                                )}
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0 space-y-1">
                                {/* Badge */}
                                <Badge 
                                  variant="secondary"
                                  className="text-[10px] h-4 text-black gap-0.5"
                                  style={{ 
                                    borderRight: `3px solid ${angleColor}`, 
                                    backgroundColor: '#e5e5e6' 
                                  }}
                                  data-testid={`badge-angle-${topic.id}`}
                                >
                                  <Icon className="h-2 w-2" style={{ color: angleColor }} />
                                  {angle?.nameAr || 'مُقترب'}
                                </Badge>

                                {/* Title */}
                                <h4 className="font-bold text-sm line-clamp-2 leading-snug group-hover:text-primary transition-colors" data-testid={`text-topic-title-${topic.id}`}>
                                  {topic.title}
                                </h4>

                                {/* Meta */}
                                {topic.publishedAt && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    <span>
                                      {formatDistanceToNow(new Date(topic.publishedAt), {
                                        addSuffix: true,
                                        locale: ar,
                                      })}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">لا توجد مواضيع في هذه الزاوية</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Desktop: Horizontal Scroll Cards */}
            <div 
              ref={scrollRef}
              className="hidden lg:flex gap-4 overflow-x-auto scrollbar-hide pb-2 snap-x snap-mandatory"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {filteredTopics && filteredTopics.length > 0 ? (
                filteredTopics.map((topic) => {
                  const angle = topic.angle;
                  const angleColor = angle?.colorHex || '#6366f1';
                  const Icon = angle ? getIconComponent(angle.iconKey || 'Circle') : Sparkles;
                  
                  return (
                    <Link 
                      key={topic.id} 
                      href={`/muqtarab/${angle?.slug || 'general'}/topic/${topic.slug}`}
                      className="flex-shrink-0 w-72 snap-start"
                    >
                      <Card 
                        className="group h-full overflow-hidden border-0 shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer"
                        style={{
                          background: `linear-gradient(135deg, ${angleColor}10 0%, ${angleColor}05 100%)`,
                        }}
                        data-testid={`topic-card-${topic.id}`}
                      >
                        <div className="relative">
                          {topic.heroImageUrl ? (
                            <div className="relative h-32 overflow-hidden">
                              <img 
                                src={topic.heroImageUrl} 
                                alt={topic.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                loading="lazy"
                              />
                              <div 
                                className="absolute inset-0"
                                style={{
                                  background: `linear-gradient(to top, ${angleColor}cc 0%, ${angleColor}40 50%, transparent 100%)`
                                }}
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
                              className="h-32 flex items-center justify-center"
                              style={{
                                background: `linear-gradient(135deg, ${angleColor}40 0%, ${angleColor}20 100%)`
                              }}
                            >
                              <div 
                                className="p-3 rounded-xl"
                                style={{ backgroundColor: `${angleColor}30` }}
                              >
                                <Icon className="h-8 w-8" style={{ color: angleColor }} />
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <CardContent className="p-3 space-y-2">
                          <h3 className="font-bold text-sm line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                            {topic.title}
                          </h3>
                          
                          {topic.excerpt && (
                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                              {topic.excerpt}
                            </p>
                          )}
                          
                          <div className="flex items-center justify-between pt-2 border-t border-border/50">
                            {topic.publishedAt && (
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Calendar className="h-2.5 w-2.5" />
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
                              style={{ 
                                backgroundColor: `${angleColor}15`,
                                color: angleColor 
                              }}
                            >
                              اقرأ
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })
              ) : (
                <div className="w-full py-12 text-center text-muted-foreground">
                  <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>لا توجد مواضيع في هذه الزاوية</p>
                </div>
              )}
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
