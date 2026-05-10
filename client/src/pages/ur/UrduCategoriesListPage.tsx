import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Heart, Bookmark, FileText } from "lucide-react";
import { Link } from "wouter";
import { UrduLayout } from "@/components/ur/UrduLayout";
import type { EnCategory } from "@shared/schema";

interface UrduCategoryWithStats extends EnCategory {
  articleCount: number;
  totalViews: number;
  totalLikes: number;
  totalBookmarks: number;
}

export default function UrduCategoriesListPage() {
  const { data: categoriesRaw, isLoading } = useQuery<UrduCategoryWithStats[]>({
    queryKey: ["/api/ur/categories", "withStats"],
    queryFn: async () => {
      const res = await fetch("/api/ur/categories?withStats=true", { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  return (
    <UrduLayout>
      <main className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2" data-testid="heading-categories">
            تمام زمرے
          </h1>
          <p className="text-muted-foreground">
            تمام زمرے براؤز کریں
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <Skeleton className="w-full h-48" />
                <CardContent className="p-6 space-y-3">
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-4 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">
              کوئی زمرے دستیاب نہیں
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories
              .filter((cat) => cat.status === "visible")
              .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
              .map((category) => (
                <Link key={category.id} href={`/ur/category/${category.slug}`}>
                  <Card 
                    className="hover-elevate active-elevate-2 cursor-pointer h-full overflow-hidden group"
                    data-testid={`card-category-${category.id}`}
                  >
                    {/* Hero Image */}
                    {category.heroImageUrl && (
                      <div className="relative h-48 overflow-hidden">
                        <img
                          src={category.heroImageUrl}
                          alt={category.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      </div>
                    )}

                    {/* No Image - Show Color Gradient */}
                    {!category.heroImageUrl && (
                      <div 
                        className="relative h-48 flex items-center justify-center"
                        style={{
                          background: category.color 
                            ? `linear-gradient(135deg, ${category.color}15 0%, ${category.color}05 100%)`
                            : 'linear-gradient(135deg, hsl(var(--primary) / 0.15) 0%, hsl(var(--primary) / 0.05) 100%)'
                        }}
                      >
                        <FileText className="h-16 w-16" style={{ color: category.color || 'hsl(var(--primary))' }} />
                      </div>
                    )}
                    
                    <CardContent className="p-6 space-y-4">
                      {/* Category Name */}
                      <div className="flex items-center gap-3">
                        <h3 
                          className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors flex-1"
                          data-testid={`text-category-name-${category.id}`}
                        >
                          {category.name}
                        </h3>
                      </div>
                      
                      {/* Description */}
                      {category.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {category.description}
                        </p>
                      )}

                      {/* Statistics Grid */}
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                        {/* Articles Count */}
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <FileText className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">مضامین</p>
                            <p className="text-lg font-bold" data-testid={`stat-articles-${category.id}`}>
                              {(category.articleCount || 0).toLocaleString('en-US')}
                            </p>
                          </div>
                        </div>

                        {/* Views Count */}
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-blue-500/10">
                            <Eye className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">ملاحظات</p>
                            <p className="text-lg font-bold" data-testid={`stat-views-${category.id}`}>
                              {(category.totalViews || 0).toLocaleString('en-US')}
                            </p>
                          </div>
                        </div>

                        {/* Likes Count */}
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-red-500/10">
                            <Heart className="h-4 w-4 text-red-600" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">پسند</p>
                            <p className="text-lg font-bold" data-testid={`stat-likes-${category.id}`}>
                              {(category.totalLikes || 0).toLocaleString('en-US')}
                            </p>
                          </div>
                        </div>

                        {/* Bookmarks Count */}
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-amber-500/10">
                            <Bookmark className="h-4 w-4 text-amber-600" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">نشانات</p>
                            <p className="text-lg font-bold" data-testid={`stat-bookmarks-${category.id}`}>
                              {(category.totalBookmarks || 0).toLocaleString('en-US')}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
          </div>
        )}
      </main>
    </UrduLayout>
  );
}
