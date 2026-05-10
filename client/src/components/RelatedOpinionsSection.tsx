import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, User, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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
}

function OpinionCard({ article, categoryColor }: { article: OpinionArticle; categoryColor?: string }) {
  const authorName = article.author
    ? `${article.author.firstName || ""} ${article.author.lastName || ""}`.trim() || "كاتب"
    : "كاتب";

  return (
    <Link href={`/opinion/${article.slug}`}>
      <Card 
        className="hover-elevate active-elevate-2 overflow-hidden group"
        data-testid={`related-opinion-${article.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {article.author?.profileImageUrl ? (
              <img
                src={article.author.profileImageUrl}
                alt={authorName}
                className="h-10 w-10 rounded-full object-cover ring-2 ring-offset-2 flex-shrink-0"
                style={{ ['--tw-ring-color' as any]: categoryColor || 'var(--primary)' }}
              />
            ) : (
              <div 
                className="h-10 w-10 rounded-full flex items-center justify-center ring-2 ring-offset-2 flex-shrink-0"
                style={{ 
                  backgroundColor: categoryColor ? `${categoryColor}20` : 'var(--muted)',
                  ['--tw-ring-color' as any]: categoryColor || 'var(--primary)'
                }}
              >
                <User className="h-5 w-5" style={{ color: categoryColor || 'var(--muted-foreground)' }} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-muted-foreground mb-1">{authorName}</p>
              <h3 className="font-bold text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                {article.title}
              </h3>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
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
}: RelatedOpinionsSectionProps) {
  const { data, isLoading } = useQuery<{ articles: OpinionArticle[]; total: number }>({
    queryKey: ["/api/opinion/related/category", categoryId, { excludeId: excludeArticleId, limit }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        ...(excludeArticleId && { excludeId: excludeArticleId }),
      });
      const res = await fetch(`/api/opinion/related/category/${categoryId}?${params}`, {
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
        {/* Header */}
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

        {/* Vertical List */}
        <div className="space-y-3">
          {data?.articles?.map((article, index) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <OpinionCard article={article} categoryColor={categoryColor} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
