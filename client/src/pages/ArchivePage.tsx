import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Archive, Home, Newspaper, ArrowRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Category } from "@shared/schema";

export default function ArchivePage() {
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const { data: latestArticles } = useQuery<any[]>({
    queryKey: ["/api/articles/latest"],
  });

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <div className="mb-8">
            <div className="w-24 h-24 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-6">
              <Archive className="w-12 h-12 text-primary" />
            </div>
            
            <h1 className="text-3xl font-bold mb-4">
              من الأرشيف
            </h1>
            
            <p className="text-xl text-muted-foreground mb-2">
              هذا المحتوى من أرشيف سبق
            </p>
            
            <p className="text-muted-foreground">
              نعمل على معالجته وسيكون متاحاً قريباً إن شاء الله
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-8">
            <Clock className="w-4 h-4" />
            <span>قريباً</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button asChild size="lg" className="gap-2">
              <Link href="/">
                <Home className="w-5 h-5" />
                الصفحة الرئيسية
              </Link>
            </Button>
            
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link href="/news">
                <Newspaper className="w-5 h-5" />
                آخر الأخبار
              </Link>
            </Button>
          </div>

          {categories && categories.length > 0 && (
            <div className="mb-12">
              <h2 className="text-lg font-semibold mb-4">تصفح الأقسام</h2>
              <div className="flex flex-wrap justify-center gap-2">
                {categories.slice(0, 8).map((category) => (
                  <Button
                    key={category.id}
                    asChild
                    variant="secondary"
                    size="sm"
                  >
                    <Link href={`/category/${category.slug}`}>
                      {category.nameAr}
                    </Link>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {latestArticles && latestArticles.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">أحدث الأخبار</h2>
              <div className="space-y-3">
                {latestArticles.slice(0, 5).map((article: any) => (
                  <Card key={article.id} className="hover-elevate">
                    <CardContent className="p-4">
                      <Link 
                        href={`/article/${article.englishSlug || article.slug}`}
                        className="flex items-center justify-between gap-4"
                      >
                        <span className="text-right font-medium line-clamp-1">
                          {article.title}
                        </span>
                        <ArrowRight className="w-4 h-4 shrink-0 rotate-180" />
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
