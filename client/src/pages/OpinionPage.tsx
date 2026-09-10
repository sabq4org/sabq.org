import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { NavigationBar } from "@/components/NavigationBar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";
import { OpinionCard } from "@/components/public/OpinionCard";

type OpinionArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  imageUrl?: string;
  publishedAt?: string;
  views: number;
  category?: {
    id: string;
    nameAr: string;
    nameEn: string;
    icon?: string;
    color?: string;
  };
  author?: {
    id: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
    bio?: string;
  };
};

export default function OpinionPage() {
  useAdTracking('رأي');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortMode, setSortMode] = useState<"latest" | "trending">("latest");
  const limit = 12;

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data, isLoading } = useQuery<{
    articles: OpinionArticle[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>({
    queryKey: [
      `/api/opinion?page=${currentPage}&limit=${limit}${
        sortMode === "trending" ? "&sort=trending" : ""
      }`,
    ],
  });

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const getPageNumbers = () => {
    const totalPages = data?.pagination.totalPages || 0;
    const pages: (number | string)[] = [];
    
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-background flex flex-col" dir="rtl">
      <Header user={user} />
      <NavigationBar />

      <main className="flex-1">
        {/* Hero Section — رأس القسم */}
        <section className="public-page-header relative pt-10 pb-8 px-4" data-testid="section-hero">

          <div className="container max-w-4xl mx-auto text-center relative">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <BookOpen className="w-4 h-4" />
              <span>آراء وتحليلات</span>
            </div>

            <h1 className="public-page-title mb-4" data-testid="text-page-title">
              مقالات الرأي
            </h1>

            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-4" data-testid="text-page-tagline">
              آراء وتحليلات من كتّابنا المتميزين
            </p>
          </div>
        </section>

        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8 flex items-center justify-center gap-2">
            <Button
              variant={sortMode === "trending" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSortMode("trending");
                setCurrentPage(1);
              }}
              data-testid="button-opinion-sort-trending"
            >
              الأكثر تداولاً
            </Button>
            <Button
              variant={sortMode === "latest" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSortMode("latest");
                setCurrentPage(1);
              }}
              data-testid="button-opinion-sort-latest"
            >
              الأحدث
            </Button>
          </div>

          <DmsLeaderboardAd />
          <DmsMpuAd topSlot />

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-96 rounded-2xl animate-pulse bg-muted/50" />
              ))}
            </div>
          ) : data?.articles && data.articles.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {data.articles.map((article) => <OpinionCard key={article.id} article={article} variant="grid" />)}
              </div>

              {data.pagination.totalPages > 1 && (
                <div className="mt-12 flex justify-center items-center gap-2" dir="ltr">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    data-testid="button-prev-page"
                    aria-label="الصفحة السابقة"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  {getPageNumbers().map((page, index) => (
                    page === '...' ? (
                      <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                        ...
                      </span>
                    ) : (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="icon"
                        onClick={() => handlePageChange(page as number)}
                        data-testid={`button-page-${page}`}
                        className="min-w-9"
                      >
                        {page}
                      </Button>
                    )
                  ))}

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === data.pagination.totalPages}
                    data-testid="button-next-page"
                    aria-label="الصفحة التالية"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <BookOpen className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-2xl font-bold text-foreground mb-2">
                لا توجد مقالات رأي متاحة حالياً
              </h2>
              <p className="text-muted-foreground">
                تابعنا لقراءة آخر التحليلات والآراء
              </p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
