import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { NavigationBar } from "@/components/NavigationBar";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, ChevronLeft, ChevronRight, User, BookOpen } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";

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
    queryKey: [`/api/opinion?page=${currentPage}&limit=${limit}`],
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
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user} />
      <NavigationBar />

      <main className="flex-1">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <BookOpen className="h-8 w-8 text-primary" />
              <h1 className="text-4xl font-bold text-foreground" data-testid="text-page-title">
                مقالات الرأي
              </h1>
            </div>
            <p className="text-lg text-muted-foreground">
              آراء وتحليلات من كتّابنا المتميزين
            </p>
          </div>

          {/* DMS Ads - Leaderboard for desktop, MPU for mobile */}
          <DmsLeaderboardAd />
          <DmsMpuAd />

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="h-96 animate-pulse bg-muted/50" />
              ))}
            </div>
          ) : data?.articles && data.articles.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {data.articles.map((article) => {
                  const authorName = article.author
                    ? `${article.author.firstName || ""} ${article.author.lastName || ""}`.trim() || "كاتب غير معروف"
                    : "كاتب غير معروف";

                  return (
                    <Link key={article.id} href={`/opinion/${article.slug}`}>
                      <Card 
                        className="hover-elevate active-elevate-2 cursor-pointer h-full overflow-hidden flex flex-col"
                        data-testid={`card-opinion-${article.id}`}
                      >
                        <CardContent className="p-5 space-y-4 flex-1 flex flex-col">
                          <h3 
                            className="font-bold text-xl line-clamp-3 text-foreground"
                            data-testid={`text-opinion-title-${article.id}`}
                          >
                            {article.title}
                          </h3>

                          <div className="flex items-center gap-3">
                            {article.author?.profileImageUrl ? (
                              <img 
                                src={article.author.profileImageUrl}
                                alt={authorName}
                                className="h-10 w-10 rounded-full object-cover"
                                data-testid={`img-author-${article.id}`}
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                <User className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1">
                              <p className="font-semibold text-sm text-foreground" data-testid={`text-author-${article.id}`}>
                                {authorName}
                              </p>
                              {article.publishedAt && (
                                <p className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(article.publishedAt), {
                                    addSuffix: true,
                                    locale: ar,
                                  })}
                                </p>
                              )}
                            </div>
                          </div>
                          
                          {article.excerpt && (
                            <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
                              {article.excerpt}
                            </p>
                          )}

                          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                            <div className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              <span data-testid={`text-views-${article.id}`}>
                                {article.views.toLocaleString("en-US")}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
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
