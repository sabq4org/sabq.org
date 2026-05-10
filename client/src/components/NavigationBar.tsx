import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "wouter";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { Category } from "@shared/schema";
import { filterAICategories } from "@/utils/filterAICategories";

const CATEGORY_COLORS = [
  "bg-rose-500",
  "bg-sky-500", 
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-indigo-500",
  "bg-lime-500",
];

export function NavigationBar() {
  const { data: allCoreCategoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories/smart", "core", "active"],
    queryFn: async () => {
      const params = new URLSearchParams({ type: "core", status: "active" });
      const res = await fetch(`/api/categories/smart?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return await res.json();
    },
  });
  const allCoreCategories = Array.isArray(allCoreCategoriesRaw) ? allCoreCategoriesRaw : [];

  const coreCategories = useMemo(() => filterAICategories(allCoreCategories), [allCoreCategories]);

  return (
    <div className="w-full border-b bg-background hidden md:block">
      {coreCategories.length > 0 && (
        <div className="sticky top-16 z-40 bg-background/95 backdrop-blur-sm border-b border-border/30">
          <div className="container mx-auto px-3 sm:px-6 lg:px-8">
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-4 sm:gap-6 py-2.5 sm:py-3" dir="rtl">
                {coreCategories.map((category, index) => (
                  <Link key={category.id} href={`/category/${category.englishSlug || category.slug}`}>
                    <span
                      className="group cursor-pointer flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 whitespace-nowrap"
                      data-testid={`nav-category-${category.slug}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_COLORS[index % CATEGORY_COLORS.length]} group-hover:scale-125 transition-transform duration-200`} />
                      <span>{category.nameAr}</span>
                    </span>
                  </Link>
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="h-1" />
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
