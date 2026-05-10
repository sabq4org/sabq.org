import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Sparkles, BookOpen } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

type TopicWithAngle = {
  id: string;
  title: string;
  excerpt?: string | null;
  slug: string;
  heroImageUrl?: string | null;
  publishedAt?: string | null;
  angle: {
    id: string;
    name: string;
    slug: string;
    icon?: string | null;
    colorHex?: string | null;
  };
};

function getIconComponent(iconKey: string) {
  const iconName = iconKey as keyof typeof LucideIcons;
  const IconComponent = LucideIcons[iconName];
  if (IconComponent && typeof IconComponent === 'function') {
    return IconComponent as React.ComponentType<{ className?: string }>;
  }
  return Sparkles;
}

interface MuqtarabHomeBlockProps {
  enabled?: boolean;
}

export function MuqtarabHomeBlock({ enabled = true }: MuqtarabHomeBlockProps) {
  const { data, isLoading } = useQuery<{ topics: TopicWithAngle[] }>({
    queryKey: ["/api/muqtarab/latest-topics"],
    queryFn: async () => {
      const res = await fetch("/api/muqtarab/latest-topics?limit=3", {
        credentials: "include",
      });
      if (!res.ok) return { topics: [] };
      return await res.json();
    },
    enabled,
  });

  if (isLoading) {
    return (
      <section className="py-8" dir="rtl">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl md:text-3xl font-bold">مُقترب</h2>
                <p className="text-sm text-muted-foreground">زوايا متعمقة ومنظورات فريدة</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="relative rounded-2xl overflow-hidden">
                <Skeleton className="h-64 w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!data || data.topics.length === 0) {
    return null;
  }

  return (
    <section className="py-8" dir="rtl" data-testid="section-muqtarab-home">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold">مُقترب</h2>
              <p className="text-sm text-muted-foreground">زوايا متعمقة ومنظورات فريدة</p>
            </div>
          </div>
          <Link href="/muqtarab">
            <Button variant="ghost" className="gap-2" data-testid="button-view-all-muqtarab">
              عرض الكل
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {data?.topics?.map((topic) => {
            const IconComponent = topic.angle.icon ? getIconComponent(topic.angle.icon) : BookOpen;
            const angleColor = topic.angle.colorHex || "#6366f1";

            return (
              <Link key={topic.id} href={`/muqtarab/${topic.angle.slug}/topic/${topic.slug}`}>
                <div
                  className="group relative rounded-2xl overflow-hidden hover-elevate active-elevate-2 cursor-pointer h-64"
                  data-testid={`muqtarab-topic-${topic.id}`}
                >
                  {topic.heroImageUrl ? (
                    <img
                      src={topic.heroImageUrl}
                      alt={topic.title}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(135deg, ${angleColor}15 0%, ${angleColor}30 50%, ${angleColor}50 100%)`,
                      }}
                    />
                  )}

                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(to top, ${angleColor}ee 0%, ${angleColor}99 40%, transparent 100%)`,
                    }}
                  />

                  <div className="absolute inset-0 flex flex-col justify-end p-5">
                    <Badge
                      variant="secondary"
                      className="self-start mb-3 gap-1.5 backdrop-blur-sm"
                      style={{
                        backgroundColor: `${angleColor}40`,
                        color: 'white',
                        borderColor: `${angleColor}60`,
                      }}
                    >
                      <IconComponent className="h-3.5 w-3.5" />
                      {topic.angle.name}
                    </Badge>

                    <h3 className="text-lg font-bold text-white line-clamp-2 leading-tight mb-2 group-hover:underline decoration-2 underline-offset-2">
                      {topic.title}
                    </h3>

                    {topic.excerpt && (
                      <p className="text-sm text-white/80 line-clamp-2 leading-relaxed mb-3">
                        {topic.excerpt}
                      </p>
                    )}

                    {topic.publishedAt && (
                      <span className="text-xs text-white/70">
                        {formatDistanceToNow(new Date(topic.publishedAt), {
                          addSuffix: true,
                          locale: ar,
                        })}
                      </span>
                    )}
                  </div>

                  <div
                    className="absolute top-4 left-4 h-12 w-12 rounded-xl flex items-center justify-center backdrop-blur-md transition-transform duration-300 group-hover:scale-110"
                    style={{
                      backgroundColor: `${angleColor}30`,
                      borderColor: `${angleColor}50`,
                    }}
                  >
                    <IconComponent className="h-6 w-6 text-white" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
