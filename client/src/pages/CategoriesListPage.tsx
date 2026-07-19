import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { CategoriesDirectory } from "@/components/CategoriesDirectory";
import { apiUrl } from "@/lib/queryClient";
import type { CategoryWithStats } from "@shared/schema";

export default function CategoriesListPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: categoriesRaw, isLoading } = useQuery<CategoryWithStats[]>({
    queryKey: ["/api/categories", "withStats"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/categories?withStats=true"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const visibleCategories = useMemo(() => {
    return categories
      .filter((category) => category.status === "visible" && category.type === "core")
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }, [categories]);

  const filteredCategories = useMemo(() => {
    return visibleCategories.filter((category) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        category.nameAr.toLowerCase().includes(query) ||
        category.nameEn?.toLowerCase().includes(query) ||
        category.description?.toLowerCase().includes(query)
      );
    });
  }, [visibleCategories, searchQuery]);

  const totalArticles = useMemo(() => {
    return visibleCategories.reduce((sum, category) => sum + (category.articleCount || 0), 0);
  }, [visibleCategories]);

  useEffect(() => {
    document.title = "التصنيفات | سبق";
    return () => {
      document.title = "سبق - صحيفة إلكترونية سعودية";
    };
  }, []);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user} />
      <main>
        <CategoriesDirectory
          categories={visibleCategories}
          filteredCategories={filteredCategories}
          isLoading={isLoading}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          totalArticles={totalArticles}
        />
      </main>
    </div>
  );
}
