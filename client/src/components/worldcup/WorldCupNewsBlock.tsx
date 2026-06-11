import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { motion } from "framer-motion";
import { ChevronLeft, Clock, Newspaper } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import worldCupEmblem from "@assets/world-cup-2026-emblem.png";

/**
 * «أخبار المونديال» — بلوك الصفحة الرئيسية أسفل شريط مباراة اليوم.
 *
 * يعرض آخر المواد المولّدة آليًا من بيانات المباريات (معاينات وتقارير)
 * المنشورة في قسم الرياضة. لا صور مباريات مرخصة لدينا، فرأس البطاقة
 * يُرسم بشعاري المنتخبين على خلفية ملعبية — هوية بصرية مقصودة لا بديل نقص.
 *
 * يختفي كليًا عندما لا توجد أخبار منشورة — نفس فلسفة WorldCupHomeStrip.
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

export function MatchVisual({ item }: { item: WcNewsItem }) {
  // المواد التحريرية اليدوية تأتي بصورة حقيقية — تُعرض كما هي؛
  // المولّدة من بيانات المباريات تُرسم بشعاري المنتخبين
  if (item.imageUrl) {
    return (
      <div className="relative aspect-[16/9] overflow-hidden">
        <img
          src={item.imageUrl}
          alt={item.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <Badge className="absolute top-2 right-2 bg-emerald-400 text-emerald-950 border-0 text-[10px] font-bold px-2 py-0">
          {KIND_LABEL[item.kind]}
        </Badge>
      </div>
    );
  }
  return (
    <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-bl from-emerald-950 via-[#04261b] to-[#063828]">
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
        <div className="relative h-full flex items-center justify-center gap-4 sm:gap-6 px-4">
          {[item.home, item.away].map((team, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 min-w-0">
              <span className="h-14 w-14 rounded-full bg-white p-1.5 ring-2 ring-white/15 shadow-lg">
                <img
                  src={team.logo}
                  alt={team.name}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              </span>
              <span className="text-[11px] font-bold text-white/90 truncate max-w-20">
                {team.name}
              </span>
            </div>
          ))}
          <span className="absolute text-emerald-300/70 font-black text-sm select-none">×</span>
        </div>
      ) : (
        <div className="relative h-full flex items-center justify-center">
          <img
            src={worldCupEmblem}
            alt="كأس العالم 2026"
            className="h-16 w-auto object-contain opacity-90"
            loading="lazy"
          />
        </div>
      )}

      <Badge className="absolute top-2 right-2 bg-emerald-400 text-emerald-950 border-0 text-[10px] font-bold px-2 py-0">
        {KIND_LABEL[item.kind]}
      </Badge>
    </div>
  );
}

export default function WorldCupNewsBlock() {
  const { data } = useQuery<{ news: WcNewsItem[] }>({
    queryKey: ["/api/world-cup/news", { limit: 6 }],
    staleTime: 2 * 60 * 1000,
  });

  const items = Array.isArray(data?.news) ? data.news : [];
  if (items.length === 0) return null;

  return (
    <section dir="rtl" aria-label="أخبار كأس العالم 2026" data-testid="section-worldcup-news">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Newspaper className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">أخبار المونديال</h2>
            <p className="text-sm text-muted-foreground">
              معاينات وتقارير مباريات كأس العالم 2026
            </p>
          </div>
        </div>
        <Link href="/world-cup#news">
          <span className="flex items-center gap-1 text-sm font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-600 cursor-pointer">
            مركز المونديال
            <ChevronLeft className="h-4 w-4" />
          </span>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: Math.min(index * 0.05, 0.3), duration: 0.3 }}
          >
            <Link href={`/article/${item.slug}`}>
              <Card className="group h-full overflow-hidden border-0 dark:border dark:border-card-border hover-elevate active-elevate-2 cursor-pointer transition-all duration-300">
                <MatchVisual item={item} />
                <CardContent className="p-3 space-y-2">
                  <h3 className="font-bold text-sm leading-relaxed line-clamp-2 group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  {item.excerpt && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {item.excerpt}
                    </p>
                  )}
                  {item.publishedAt && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" />
                      {formatDistanceToNow(new Date(item.publishedAt), {
                        addSuffix: true,
                        locale: arSA,
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
