import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Grid3x3, List, ListOrdered } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Category } from "@shared/schema";

type TimeRange = 'today' | 'week' | 'month' | 'all';
type SortOption = 'default' | 'newest' | 'oldest' | 'most-viewed' | 'most-commented';
type ViewMode = 'grid' | 'list' | 'compact';

interface EnhancedFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortOption: SortOption;
  onSortChange: (sort: SortOption) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  selectedCategory: string;
  onCategoryChange: (categoryId: string) => void;
  categories: Category[];
}

export function NewsEnhancedFilterBar({
  searchQuery,
  onSearchChange,
  sortOption,
  onSortChange,
  viewMode,
  onViewModeChange,
  timeRange,
  onTimeRangeChange,
  selectedCategory,
  onCategoryChange,
  categories,
}: EnhancedFilterBarProps) {
  return (
    <div className="news-filters mb-4 space-y-3" data-testid="news-filter-bar" role="search" aria-label="البحث وتصفية الأخبار">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="ابحث في الأخبار"
          enterKeyHint="search"
          placeholder="ابحث في الأخبار..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="min-h-11 pr-10 text-base md:text-base"
          data-testid="input-search-news"
        />
      </div>

      <div className="news-filter-controls">
        <Select dir="rtl" value={sortOption} onValueChange={onSortChange}>
          <SelectTrigger className="news-filter-select" aria-label="ترتيب الأخبار" data-testid="select-sort">
            <SelectValue placeholder="ترتيب حسب" />
          </SelectTrigger>
          <SelectContent className="news-filter-menu">
            <SelectItem value="default">الترتيب الافتراضي</SelectItem>
            <SelectItem value="newest">الأحدث</SelectItem>
            <SelectItem value="oldest">الأقدم</SelectItem>
            <SelectItem value="most-viewed">الأكثر مشاهدة</SelectItem>
            <SelectItem value="most-commented">الأكثر تعليقاً</SelectItem>
          </SelectContent>
        </Select>

        <Select dir="rtl" value={timeRange} onValueChange={onTimeRangeChange}>
          <SelectTrigger className="news-filter-select" aria-label="الفترة الزمنية" data-testid="select-time-range">
            <SelectValue placeholder="الوقت" />
          </SelectTrigger>
          <SelectContent className="news-filter-menu">
            <SelectItem value="all">كل الأوقات</SelectItem>
            <SelectItem value="today">اليوم</SelectItem>
            <SelectItem value="week">هذا الأسبوع</SelectItem>
            <SelectItem value="month">هذا الشهر</SelectItem>
          </SelectContent>
        </Select>

        <Select dir="rtl" value={selectedCategory} onValueChange={onCategoryChange}>
          <SelectTrigger className="news-filter-select" aria-label="تصنيف الأخبار" data-testid="select-category">
            <SelectValue placeholder="الفئة" />
          </SelectTrigger>
          <SelectContent className="news-filter-menu">
            <SelectItem value="all">كل الفئات</SelectItem>
            {(categories || []).map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.nameAr}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="news-view-controls flex gap-1 rounded-md border p-0.5" role="group" aria-label="طريقة عرض الأخبار">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('grid')}
            className="h-11 w-11 p-0"
            data-testid="button-view-grid"
            aria-label="عرض شبكي"
            aria-pressed={viewMode === 'grid'}
          >
            <Grid3x3 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('list')}
            className="h-11 w-11 p-0"
            data-testid="button-view-list"
            aria-label="عرض قائمة"
            aria-pressed={viewMode === 'list'}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'compact' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('compact')}
            className="h-11 w-11 p-0"
            data-testid="button-view-compact"
            aria-label="عرض مضغوط"
            aria-pressed={viewMode === 'compact'}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Active Filters Badge */}
      {(searchQuery || timeRange !== 'all' || selectedCategory !== 'all') && (
        <div className="news-active-filters flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">الفلاتر النشطة:</span>
          {searchQuery && (
            <Badge variant="secondary" className="gap-1">
              بحث: {searchQuery}
            </Badge>
          )}
          {timeRange !== 'all' && (
            <Badge variant="secondary">
              {timeRange === 'today' ? 'اليوم' : 
               timeRange === 'week' ? 'هذا الأسبوع' :
               'هذا الشهر'}
            </Badge>
          )}
          {selectedCategory !== 'all' && (
            <Badge variant="secondary">
              {categories.find(c => c.id === selectedCategory)?.nameAr}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
