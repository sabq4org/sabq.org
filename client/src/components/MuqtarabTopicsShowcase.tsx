import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OptimizedImage } from "./OptimizedImage";
import { ArrowLeft, Sparkles, Calendar, ChevronLeft, ChevronRight, PenLine, Circle } from "lucide-react";
import { getLucideIcon } from "@/lib/lucideIconMap";
import { useRef, useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import type { Topic, Angle } from "@shared/schema";

function getIconComponent(iconKey: string) {
  return getLucideIcon(iconKey, Circle);
}

interface TopicWithAngle extends Topic {
  angle?: Angle;
}

interface MuqtarabTopicsShowcaseProps {
  enabled?: boolean;
}

export function MuqtarabTopicsShowcase({ enabled = true }: MuqtarabTopicsShowcaseProps) {
  const { data: topics, isLoading } = useQuery<TopicWithAngle[]>({
    queryKey: ["/api/muqtarab/topics/featured"],
    queryFn: async () => {
      const res = await fetch("/api/muqtarab/topics/featured?limit=8", {
        credentials: "include",
      });
      if (!res.ok) return [];
      return await res.json();
    },
    enabled,
  });

  if (isLoading) {
    return (
      <section className="py-4 relative" dir="rtl">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-br from-primary to-primary/80 p-1.5 rounded-lg">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <h2 className="text-base sm:text-lg font-bold">من مُقترب</h2>
            </div>
          </div>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0 divide-y divide-border/50">
              {[1, 2, 3].map((i) => (
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
      </section>
    );
  }

  if (!topics || topics.length === 0) {
    return null;
  }

  return (
    <section className="py-4 relative" dir="rtl">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full" />
              <div className="relative bg-gradient-to-br from-primary to-primary/80 p-1.5 sm:p-2 rounded-lg shadow-sm">
                <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary-foreground" />
              </div>
            </div>
            <h2 className="text-base sm:text-lg font-bold">من مُقترب</h2>
          </div>
          
          <div className="flex items-center gap-1">
            <Link href="/muqtarab">
              <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2" data-testid="button-view-all-muqtarab">
                المزيد
                <ArrowLeft className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Mobile: List View (like أخبارك الذكية) */}
        <Card className="lg:hidden border-0 shadow-sm overflow-hidden">
          <CardContent className="p-0 divide-y divide-border/50">
            {topics.slice(0, 5).map((topic) => {
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
                    data-testid={`link-muqtarab-topic-mobile-${topic.id}`}
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
            })}
          </CardContent>
        </Card>

        {/* Desktop: Grid of 2 rows and 4 columns */}
        <div 
          className="hidden lg:grid lg:grid-cols-4 lg:gap-4 pb-2"
        >
          {topics.slice(0, 8).map((topic) => {
            const angle = topic.angle;
            const angleColor = angle?.colorHex || '#6366f1';
            const Icon = angle ? getIconComponent(angle.iconKey || 'Circle') : Sparkles;
            
            return (
              <Link 
                key={topic.id} 
                href={`/muqtarab/${angle?.slug || 'general'}/topic/${topic.slug}`}
                className="w-full"
              >
                <Card 
                  className="group h-full overflow-hidden border-0 shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer"
                  style={{
                    background: `linear-gradient(135deg, ${angleColor}10 0%, ${angleColor}05 100%)`,
                  }}
                  data-testid={`muqtarab-topic-card-${topic.id}`}
                >
                  <div className="relative">
                    {topic.heroImageUrl ? (
                      <div className="relative h-32 overflow-hidden">
                        <OptimizedImage
                          src={topic.heroImageUrl}
                          alt={topic.title}
                          width={480}
                          wrapperClassName="w-full h-full"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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
          })}
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
                  data-testid="button-suggest-angle"
                >
                  اقترح زاويتك
                  <ArrowLeft className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}
