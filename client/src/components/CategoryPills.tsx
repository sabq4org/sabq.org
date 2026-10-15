import { LayoutGrid } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import type { CategoryWithStats } from "@shared/schema";
import "@/styles/category-navigation.css";

interface CategoryPillsProps {
  categories: CategoryWithStats[];
  selectedCategory?: string;
}

export function CategoryPills({
  categories,
  selectedCategory,
}: CategoryPillsProps) {
  return (
    <nav className="category-navigation" aria-label="تصنيفات الأخبار" dir="rtl">
      <div className="category-navigation-inner container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="category-navigation-scroll">
          <div className="category-navigation-items">
            {(categories || []).map((category) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className={cn("category-navigation-link", selectedCategory === category.id && "is-active")}
                aria-current={selectedCategory === category.id ? "page" : undefined}
                data-testid={`badge-category-${category.slug}`}
              >
                {category.nameAr}
              </Link>
            ))}
          </div>
        </div>
        <Link
          href="/categories"
          className="category-navigation-all"
          aria-label="جميع التصنيفات"
          data-testid="badge-category-all"
        >
          <LayoutGrid aria-hidden="true" />
          <span className="hidden sm:inline">جميع التصنيفات</span>
          <span className="sm:hidden">التصنيفات</span>
        </Link>
      </div>
    </nav>
  );
}
