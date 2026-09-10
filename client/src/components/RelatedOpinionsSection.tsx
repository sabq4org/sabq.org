import { ArticleSidebarHeading } from "./ArticleSidebarHeading";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/lib/queryClient";
import { OpinionCard } from "@/components/public/OpinionCard";

interface OpinionArticle {
  id: string;
  title: string;
  excerpt?: string;
  slug: string;
  imageUrl?: string;
  publishedAt?: string;
  views: number;
  author?: {
    id: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
    bio?: string;
  };
  category?: {
    id: string;
    nameAr: string;
    nameEn: string;
    slug: string;
    color?: string;
    icon?: string;
  };
}

interface RelatedOpinionsSectionProps {
  categoryId: string;
  categoryName: string;
  categoryColor?: string;
  excludeArticleId?: string;
  limit?: number;
  editorial?: boolean;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 p-4 border rounded-lg">
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RelatedOpinionsSection({
  categoryId,
  categoryName,
  categoryColor,
  excludeArticleId,
  limit = 5,
  editorial = false,
}: RelatedOpinionsSectionProps) {
  const { data, isLoading } = useQuery<{ articles: OpinionArticle[]; total: number }>({
    queryKey: ["/api/opinion/related/category", categoryId, { excludeId: excludeArticleId, limit }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        ...(excludeArticleId && { excludeId: excludeArticleId }),
      });
      const res = await fetch(apiUrl(`/api/opinion/related/category/${categoryId}?${params}`), {
        credentials: "include",
      });
      if (!res.ok) return { articles: [], total: 0 };
      return await res.json();
    },
  });

  if (isLoading) {
    return (
      <section className="py-8" dir="rtl">
        <LoadingSkeleton />
      </section>
    );
  }

  if (!data || data.articles.length === 0) {
    return null;
  }

  return (
    <section className="py-8" dir="rtl">
      <div className="space-y-6">
        {editorial ? (
          <ArticleSidebarHeading title="مقالات رأي مرتبطة" description={`من تصنيف «${categoryName}»`} icon={BookOpen}
            action={<Link href={`/opinion?category=${categoryId}`} data-testid="button-view-more-opinions">عرض المزيد <ArrowLeft aria-hidden="true" /></Link>}
          />
        ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-1 h-8 rounded-full"
              style={{ backgroundColor: categoryColor || 'var(--primary)' }}
            />
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <BookOpen className="h-5 w-5" style={{ color: categoryColor }} />
                مقالات رأي مرتبطة
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                من تصنيف "{categoryName}"
              </p>
            </div>
          </div>
          <Link href={`/opinion?category=${categoryId}`}>
            <Button 
              variant="ghost" 
              className="gap-2 hidden md:flex" 
              data-testid="button-view-more-opinions"
            >
              عرض المزيد
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        )}

        {/* Vertical List */}
        <div className="space-y-3">
          {data?.articles?.map((article, index) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <OpinionCard article={article} variant="sidebar" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
