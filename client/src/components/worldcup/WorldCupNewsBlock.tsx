import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Clock, Flame, Newspaper } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatArticleTimestamp } from "@/lib/formatTime";
import { prefetchArticle } from "@/lib/prefetchRoute";
import { cn } from "@/lib/utils";
import worldCupEmblem from "@assets/world-cup-2026-emblem.png";

/**
 * «أخبار المونديال» — بلوك الصفحة الرئيسية أسفل شريط مباراة اليوم.
 *
 * تصميم البطاقات مطابق لبطاقات «أخبارك الذكية» (PersonalizedFeed):
 * صورة 16/9 ثم شارة تصنيف بشريط جانبي ملون ثم عنوان كبير ثم مقتطف ثم
 * الوقت. 8 بطاقات = صفّان × 4 أعمدة على الشاشات الكبيرة، وقائمة مدمجة
 * على الجوال — نفس سلوك «أخبارك الذكية» تمامًا.
 *
 * لا صور مباريات مرخصة للمواد المولّدة، فبطاقتها تُرسم بشعاري المنتخبين
 * على خلفية ملعبية؛ وعندما يضيف المحرر صورة حقيقية من اللوحة تظهر بدلها
 * تلقائيًا. يختفي البلوك كليًا عندما لا توجد أخبار منشورة.
 */

export interface WcNewsItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  kind: "preview" | "report" | "news";
  home: { name: string; logo: string } | null;
  away: { name: string; logo: string } | null;
}

const KIND_LABEL: Record<WcNewsItem["kind"], string> = {
  preview: "ما قبل المباراة",
  report: "تقرير المباراة",
  news: "مونديال 2026",
};

const EMERALD = "#059669";

// نفس قاعدة «أخبارك الذكية»: المنشور خلال آخر 30 دقيقة يحمل شارة «جديد»
const isNewArticle = (publishedAt: string | null) => {
  if (!publishedAt) return false;
  return (Date.now() - new Date(publishedAt).getTime()) / 60000 <= 30;
};

export function MatchVisual({
  item,
  showBadge = true,
  compact = false,
  className,
}: {
  item: WcNewsItem;
  showBadge?: boolean;
  /** مصغّرة قائمة الجوال: شعارات أصغر بلا أسماء */
  compact?: boolean;
  className?: string;
}) {
  // المواد التحريرية اليدوية تأتي بصورة حقيقية — تُعرض كما هي؛
  // المولّدة من بيانات المباريات تُرسم بشعاري المنتخبين
  if (item.imageUrl) {
    return (
      <div className={cn("relative aspect-[16/9] overflow-hidden", className)}>
        <img
          src={item.imageUrl}
          alt={item.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {showBadge && (
          <Badge className="absolute top-2 right-2 bg-emerald-400 text-emerald-950 border-0 text-[10px] font-bold px-2 py-0">
            {KIND_LABEL[item.kind]}
          </Badge>
        )}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "relative aspect-[16/9] overflow-hidden bg-gradient-to-bl from-emerald-950 via-[#04261b] to-[#063828]",
        className
      )}
    >
      {/* ملمس العشب — نفس خامة شريط المونديال */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.6) 0 40px, transparent 40px 80px)",
        }}
      />
      <div className="absolute -top-10 -right-8 h-28 w-28 rounded-full bg-emerald-400/15 blur-2xl" />

      {item.home && item.away ? (
        <div
          className={cn(
            "relative h-full flex items-center justify-center px-4",
            compact ? "gap-2" : "gap-4 sm:gap-6"
          )}
        >
          {[item.home, item.away].map((team, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 min-w-0">
              <span
                className={cn(
                  "rounded-full bg-white ring-2 ring-white/15 shadow-lg",
                  compact ? "h-9 w-9 p-1" : "h-14 w-14 p-1.5"
                )}
              >
                <img
                  src={team.logo}
                  alt={team.name}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              </span>
              {!compact && (
                <span className="text-[11px] font-bold text-white/90 truncate max-w-20">
                  {team.name}
                </span>
              )}
            </div>
          ))}
          {!compact && (
            <span className="absolute text-emerald-300/70 font-black text-sm select-none">×</span>
          )}
        </div>
      ) : (
        <div className="relative h-full flex items-center justify-center">
          <img
            src={worldCupEmblem}
            alt="كأس العالم 2026"
            className={cn("w-auto object-contain opacity-90", compact ? "h-10" : "h-16")}
            loading="lazy"
          />
        </div>
      )}

      {showBadge && (
        <Badge className="absolute top-2 right-2 bg-emerald-400 text-emerald-950 border-0 text-[10px] font-bold px-2 py-0">
          {KIND_LABEL[item.kind]}
        </Badge>
      )}
    </div>
  );
}

/** شارة النوع بنمط شارات تصنيف «أخبارك الذكية» — رمادية بشريط جانبي ملون */
function KindBadge({ item, compact = false }: { item: WcNewsItem; compact?: boolean }) {
  return (
    <Badge
      variant="secondary"
      className={`${compact ? "text-[10px] h-4" : "text-xs h-5"} text-black`}
      style={{ borderRight: `3px solid ${EMERALD}`, backgroundColor: "#e5e5e6" }}
    >
      {KIND_LABEL[item.kind]}
    </Badge>
  );
}

function NewBadge({ item, compact = false }: { item: WcNewsItem; compact?: boolean }) {
  if (!isNewArticle(item.publishedAt)) return null;
  return (
    <Badge
      className={`${compact ? "text-[10px] h-4 gap-0.5" : "text-xs h-5 gap-1"} bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 animate-pulse`}
    >
      <Flame className={compact ? "h-2 w-2" : "h-2.5 w-2.5"} aria-hidden="true" />
      جديد
    </Badge>
  );
}

export default function WorldCupNewsBlock() {
  const { data } = useQuery<{ news: WcNewsItem[] }>({
    queryKey: ["/api/world-cup/news", { limit: 8 }],
    staleTime: 2 * 60 * 1000,
  });

  const items = Array.isArray(data?.news) ? data.news : [];
  if (items.length === 0) return null;

  return (
    <section
      dir="rtl"
      className="space-y-4"
      aria-label="أخبار كأس العالم 2026"
      data-testid="section-worldcup-news"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Newspaper className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-2xl md:text-3xl font-bold">أخبار المونديال</h2>
        </div>
        <Link href="/world-cup#news">
          <span className="flex items-center gap-1 text-sm font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-600 cursor-pointer">
            مركز المونديال
            <ChevronLeft className="h-4 w-4" />
          </span>
        </Link>
      </div>

      <p className="text-muted-foreground">معاينات وتقارير مباريات كأس العالم 2026 لحظة بلحظة</p>

      {/* الجوال: قائمة مدمجة — نفس بنية «أخبارك الذكية» */}
      <Card className="overflow-hidden lg:hidden border-0 dark:border dark:border-card-border">
        <CardContent className="p-0">
          <div className="dark:divide-y">
            {items.map((item) => (
              <Link key={item.id} href={`/article/${item.slug}`}>
                <div
                  className="block group cursor-pointer"
                  onMouseEnter={() => prefetchArticle(item.slug)}
                  onTouchStart={() => prefetchArticle(item.slug)}
                >
                  <div className="p-4 hover-elevate active-elevate-2 transition-all">
                    <div className="flex gap-3">
                      <div className="relative flex-shrink-0 w-28 h-20 rounded-lg overflow-hidden">
                        <MatchVisual item={item} showBadge={false} compact className="aspect-auto h-full" />
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <KindBadge item={item} compact />
                          <NewBadge item={item} compact />
                        </div>
                        <h4 className="font-bold text-sm line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                          {item.title}
                        </h4>
                        {item.publishedAt && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatArticleTimestamp(item.publishedAt)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* الشاشات الكبيرة: صفّان × 4 أعمدة — نفس شبكة «أخبارك الذكية» */}
      <div className="hidden lg:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {items.map((item) => (
          <Link key={item.id} href={`/article/${item.slug}`}>
            <Card
              className="cursor-pointer h-full overflow-hidden border-0 dark:border dark:border-card-border"
              data-testid={`card-wc-news-${item.id}`}
              onMouseEnter={() => prefetchArticle(item.slug)}
              onTouchStart={() => prefetchArticle(item.slug)}
            >
              <MatchVisual item={item} showBadge={false} />

              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <KindBadge item={item} />
                  <NewBadge item={item} />
                </div>

                <h3 className="font-bold text-lg line-clamp-2 text-foreground">{item.title}</h3>

                {item.excerpt && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{item.excerpt}</p>
                )}

                {item.publishedAt && (
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatArticleTimestamp(item.publishedAt)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* صفّان من الأخبار ثم بوابة القسم الرياضي الكامل */}
      <div className="flex justify-center pt-2">
        <Link href="/category/sports">
          <Button
            variant="outline"
            className="rounded-full px-6 font-bold border-emerald-600/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 gap-1"
          >
            المزيد من أخبار كأس العالم
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </section>
  );
}
