import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Search,
  Home,
  Loader2,
  ChevronLeft,
  TrendingUp,
  Clock,
  LayoutGrid,
  Newspaper
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Category } from "@shared/schema";

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  imageUrl?: string;
  publishedAt?: string;
  categoryName?: string;
  views?: number;
  matchType: "title" | "content";
}

interface SearchResponse {
  results: SearchResult[];
  query: string;
  titleMatches: number;
  contentMatches: number;
}

interface LiteSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function LiteSidebar({ open, onClose }: LiteSidebarProps) {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
    if (!open) {
      setSearchQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const { data: searchData, isLoading: isSearching } = useQuery<SearchResponse>({
    queryKey: ["/api/search", { q: debouncedQuery }],
    enabled: debouncedQuery.length >= 2,
  });

  const activeCategories = categories
    .filter((cat) => cat.status === "active" && cat.type === "core")
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  const handleNavigate = (path: string) => {
    onClose();
    setLocation(path);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) return "منذ دقائق";
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "أمس";
    if (diffDays < 7) return `منذ ${diffDays} أيام`;
    return date.toLocaleDateString("ar-SA-u-ca-gregory", { month: "short", day: "numeric" });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 w-[85%] max-w-sm bg-zinc-900 z-[101] flex flex-col"
            dir="rtl"
          >
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-white font-bold text-lg">القائمة</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-white hover:bg-white/10"
                data-testid="button-close-sidebar"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="p-4">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/50" />
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="ابحث في الأخبار..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pr-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 text-base h-12 font-medium"
                  data-testid="input-lite-search"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSearchQuery("")}
                    className="absolute left-1 top-1/2 -translate-y-1/2 text-white/50 hover:text-white hover:bg-white/10 h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1">
              {debouncedQuery.length >= 2 ? (
                <div className="px-4 pb-4">
                  {isSearching ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </div>
                  ) : searchData?.results.length === 0 ? (
                    <div className="text-center py-8">
                      <Search className="h-10 w-10 text-white/30 mx-auto mb-2" />
                      <p className="text-white/50">لا توجد نتائج</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-white/50 text-xs mb-2">
                        {searchData?.results.length} نتيجة
                      </p>
                      {searchData?.results.map((result) => (
                        <div
                          key={result.id}
                          onClick={() => handleNavigate(`/article/${result.englishSlug || result.slug}`)}
                          className="flex gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                          data-testid={`lite-search-result-${result.id}`}
                        >
                          {result.imageUrl && (
                            <div className="shrink-0 w-14 h-14 rounded-md overflow-hidden">
                              <img
                                src={result.imageUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-white text-sm font-medium line-clamp-2 mb-1">
                              {result.title}
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-white/50">
                              {result.categoryName && (
                                <span>{result.categoryName}</span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDate(result.publishedAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-4 pb-4 space-y-6">
                  <div className="space-y-1">
                    <div
                      onClick={() => handleNavigate("/")}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
                      data-testid="link-lite-home"
                    >
                      <Home className="h-5 w-5 text-primary" />
                      <span className="text-white font-medium">الرئيسية</span>
                    </div>
                    <div
                      onClick={() => handleNavigate("/")}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
                      data-testid="link-lite-full-version"
                    >
                      <LayoutGrid className="h-5 w-5 text-primary" />
                      <span className="text-white font-medium">النسخة الكاملة</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-white/50 text-xs font-medium uppercase tracking-wider mb-2 px-3">
                      التصنيفات
                    </h3>
                    <div className="space-y-1">
                      {activeCategories.map((category) => (
                        <div
                          key={category.id}
                          onClick={() => handleNavigate(`/category/${category.slug}`)}
                          className="flex items-center justify-between p-3 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
                          data-testid={`link-lite-category-${category.slug}`}
                        >
                          <div className="flex items-center gap-3">
                            <Newspaper className="h-4 w-4 text-white/50" />
                            <span className="text-white">{category.nameAr}</span>
                          </div>
                          <ChevronLeft className="h-4 w-4 text-white/30" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </ScrollArea>

            <div className="p-4 border-t border-white/10">
              <p className="text-white/30 text-xs text-center">
                سبق - نسخة التصفح السريع
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
