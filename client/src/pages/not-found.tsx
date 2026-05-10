import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { Home, Search, Newspaper, FolderOpen, ArrowLeft, TrendingUp, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";

interface TrendingArticle {
  id: number;
  title: string;
  slug: string | null;
  canonicalPath: string;
  views: number;
}

interface TrendingResponse {
  trending: TrendingArticle[];
}

function Hero404() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="text-center space-y-6"
    >
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
        <MapPin className="w-10 h-10 text-primary" />
      </div>
      
      <div className="space-y-3">
        <h1 
          className="text-6xl md:text-7xl font-bold text-primary" 
          data-testid="text-404-title"
        >
          404
        </h1>
        <h2 
          className="text-2xl md:text-3xl font-bold text-foreground" 
          data-testid="text-page-not-found"
        >
          الصفحة غير موجودة
        </h2>
        <p className="text-muted-foreground text-base md:text-lg max-w-md mx-auto">
          عذراً، الصفحة التي تبحث عنها غير متوفرة. قد تكون قد نُقلت أو حُذفت.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
        <Button
          size="lg"
          className="gap-2"
          data-testid="button-home-404"
          asChild
        >
          <Link href="/">
            <Home className="w-5 h-5" />
            الصفحة الرئيسية
          </Link>
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="gap-2"
          data-testid="button-news-404"
          asChild
        >
          <Link href="/news">
            <Newspaper className="w-5 h-5" />
            آخر الأخبار
          </Link>
        </Button>
      </div>
    </motion.div>
  );
}

function SearchPanel({ onSearch }: { onSearch: (query: string) => void }) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim());
    }
  };

  const quickLinks = [
    { href: "/categories", label: "الأقسام", icon: FolderOpen },
    { href: "/mirqab", label: "مرقاب", icon: TrendingUp },
    { href: "/opinion", label: "الرأي", icon: Newspaper },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">ابحث في الموقع</h3>
              <form onSubmit={handleSubmit} className="relative">
                <Input
                  type="text"
                  placeholder="اكتب كلمة البحث..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-12 h-12 border-2 border-border hover:border-primary/40 focus:border-primary"
                  data-testid="input-search-404"
                />
                <Button
                  type="submit"
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  data-testid="button-search-submit-404"
                >
                  <Search className="w-5 h-5 text-muted-foreground" />
                </Button>
              </form>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">روابط سريعة</h3>
              <div className="flex flex-wrap gap-2">
                {quickLinks.map((link) => (
                  <Button
                    key={link.href}
                    variant="secondary"
                    size="sm"
                    className="gap-2"
                    data-testid={`link-quick-${link.href.replace('/', '')}`}
                    asChild
                  >
                    <Link href={link.href}>
                      <link.icon className="w-4 h-4" />
                      {link.label}
                    </Link>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function TrendingPanel({ articles, isLoading }: { articles: TrendingArticle[]; isLoading: boolean }) {
  const validArticles = articles.filter(article => article.canonicalPath || article.id);
  
  if (!isLoading && validArticles.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">الأخبار الرائجة</h3>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton 
                  key={i} 
                  className="h-12 w-full" 
                  data-testid={`skeleton-trending-${i}`}
                />
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {validArticles.slice(0, 4).map((article, index) => (
                <motion.div
                  key={article.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 + index * 0.05 }}
                >
                  <Link href={`/${article.canonicalPath}`}>
                    <div 
                      className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/50 hover:border-primary/30 transition-colors cursor-pointer group"
                      data-testid={`link-trending-${article.id}`}
                    >
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center">
                        {index + 1}
                      </span>
                      <span className="flex-1 text-sm font-medium line-clamp-2 text-foreground group-hover:text-primary transition-colors">
                        {article.title}
                      </span>
                      <ArrowLeft className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function NotFound() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'page_view', {
        page_title: '404 - Page Not Found',
        page_location: window.location.href,
        page_path: window.location.pathname,
        error_type: '404'
      });
      (window as any).gtag('event', '404_error', {
        page_url: window.location.pathname,
        referrer: document.referrer || 'direct'
      });
    }
  }, []);

  const { data, isLoading } = useQuery<TrendingResponse>({
    queryKey: ['/api/recommendations/trending'],
    queryFn: async () => {
      const response = await fetch('/api/recommendations/trending?limit=4');
      if (!response.ok) throw new Error('Failed to fetch trending articles');
      return response.json();
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const trendingArticles = data?.trending || [];

  const handleSearch = (query: string) => {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'search_from_404', {
        search_term: query
      });
    }
    setLocation(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <div 
      dir="rtl"
      className="min-h-screen bg-background flex flex-col"
    >
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl space-y-8">
          <Hero404 />
          
          <Separator className="my-8" />
          
          <SearchPanel onSearch={handleSearch} />
          
          <TrendingPanel articles={trendingArticles} isLoading={isLoading} />
          
          <div className="text-center pt-4">
            <p className="text-sm text-muted-foreground">
              إذا كنت تعتقد أن هذا خطأ، يرجى{" "}
              <Link href="/contact" className="text-primary hover:underline" data-testid="link-contact-404">
                التواصل معنا
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
