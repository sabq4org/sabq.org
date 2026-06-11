import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { motion } from "framer-motion";
import { Clock, Newspaper } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { MatchVisual, type WcNewsItem } from "./WorldCupNewsBlock";

/**
 * «آخر أخبار المونديال» داخل صفحة /world-cup — يقرأ من /api/world-cup/news
 * (المواد المولّدة من بيانات المباريات + مواد غرفة الأخبار عن المونديال)
 * بدل البحث النصي الذي كان يعتمد على فهرسة search_vector غير المضمونة.
 */
export function NewsSection() {
  const { data } = useQuery<{ news: WcNewsItem[] }>({
    queryKey: ["/api/world-cup/news", { limit: 9 }],
    staleTime: 2 * 60 * 1000,
  });

  const articles = Array.isArray(data?.news) ? data.news : [];
  if (articles.length === 0) return null;

  return (
    <section dir="rtl" className="py-10 bg-muted/30" id="news">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Newspaper className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">آخر أخبار المونديال</h2>
            <p className="text-sm text-muted-foreground">تغطيات سبق وتحليلاتها لكأس العالم</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {articles.map((article, index) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: Math.min(index * 0.05, 0.3), duration: 0.3 }}
            >
              <Link href={`/article/${article.slug}`}>
                <Card className="group h-full overflow-hidden border-0 dark:border dark:border-card-border hover-elevate active-elevate-2 cursor-pointer transition-all duration-300">
                  <MatchVisual item={article} />
                  <CardContent className="p-3 space-y-2">
                    <h3 className="font-bold text-sm leading-relaxed line-clamp-2 group-hover:text-primary transition-colors">
                      {article.title}
                    </h3>
                    {article.excerpt && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {article.excerpt}
                      </p>
                    )}
                    {article.publishedAt && (
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDistanceToNow(new Date(article.publishedAt), {
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
      </div>
    </section>
  );
}
