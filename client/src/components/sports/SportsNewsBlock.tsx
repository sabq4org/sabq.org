/**
 * بلوك «أخبار النادي / أخبار اللاعب» للبوابة الرياضية.
 *
 * يبحث في الأخبار المنشورة بالكلمة المفتاحية (اسم النادي/اللاعب) عبر
 * /api/articles/search-simple ويعرض أحدث المطابقات. يتدهور بسلاسة: لا نتائج
 * أو خطأ → لا يُعرض البلوك إطلاقًا (بلا حالة فارغة مزعجة).
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Newspaper } from "lucide-react";
import { Card } from "@/components/ui/card";

interface NewsHit {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
}

export function SportsNewsBlock({
  query,
  title,
  limit = 6,
}: {
  query: string;
  title: string;
  limit?: number;
}) {
  const trimmed = (query || "").trim();
  const { data: raw } = useQuery<NewsHit[]>({
    queryKey: ["/api/articles/search-simple", { q: trimmed }],
    enabled: trimmed.length >= 2,
    staleTime: 5 * 60_000,
  });
  const items = Array.isArray(raw) ? raw.slice(0, limit) : [];
  if (items.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Newspaper className="w-5 h-5 text-primary" />
        <h2 className="font-bold text-lg">{title}</h2>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {items.map((a) => (
          <Link
            key={a.id}
            href={`/article/${a.slug}`}
            className="group flex items-center gap-3 rounded-xl border border-border p-2.5 hover:bg-muted/50 transition-colors"
          >
            {a.imageUrl ? (
              <img
                src={a.imageUrl}
                alt=""
                className="w-16 h-16 rounded-lg object-cover bg-muted shrink-0"
                loading="lazy"
              />
            ) : (
              <span className="w-16 h-16 rounded-lg bg-muted shrink-0" />
            )}
            <span className="text-sm font-semibold text-foreground line-clamp-3 group-hover:text-primary transition-colors">
              {a.title}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
