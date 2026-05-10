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
    <div className="space-y-4 mb-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="ابحث في الأخبار..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pr-10"
          data-testid="input-search-news"
        />
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Sort Dropdown */}
        <Select value={sortOption} onValueChange={onSortChange}>
          <SelectTrigger className="w-[180px]" data-testid="select-sort">
            <SelectValue placeholder="ترتيب حسب" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">الترتيب الافتراضي</SelectItem>
            <SelectItem value="newest">الأحدث</SelectItem>
            <SelectItem value="oldest">الأقدم</SelectItem>
            <SelectItem value="most-viewed">الأكثر مشاهدة</SelectItem>
            <SelectItem value="most-commented">الأكثر تعليقاً</SelectItem>
          </SelectContent>
        </Select>

        {/* Time Range */}
        <Select value={timeRange} onValueChange={onTimeRangeChange}>
          <SelectTrigger className="w-[150px]" data-testid="select-time-range">
            <SelectValue placeholder="الوقت" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأوقات</SelectItem>
            <SelectItem value="today">اليوم</SelectItem>
            <SelectItem value="week">هذا الأسبوع</SelectItem>
            <SelectItem value="month">هذا الشهر</SelectItem>
          </SelectContent>
        </Select>

        {/* Category Filter */}
        <Select value={selectedCategory} onValueChange={onCategoryChange}>
          <SelectTrigger className="w-[150px]" data-testid="select-category">
            <SelectValue placeholder="الفئة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفئات</SelectItem>
            {(categories || []).map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.nameAr}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* View Mode Toggle */}
        <div className="mr-auto flex gap-1 border rounded-md p-1">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('grid')}
            className="h-8 w-8 p-0"
            data-testid="button-view-grid"
            aria-label="عرض شبكي"
          >
            <Grid3x3 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('list')}
            className="h-8 w-8 p-0"
            data-testid="button-view-list"
            aria-label="عرض قائمة"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'compact' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('compact')}
            className="h-8 w-8 p-0"
            data-testid="button-view-compact"
            aria-label="عرض مضغوط"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Active Filters Badge */}
      {(searchQuery || timeRange !== 'all' || selectedCategory !== 'all') && (
        <div className="flex items-center gap-2 flex-wrap">
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
