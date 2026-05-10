import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Search,
  Filter,
  CalendarIcon,
  X,
  Laptop,
  Brain,
  Globe,
  BookOpen,
  Gamepad2,
  Heart,
  DollarSign,
  RefreshCw,
  Sparkles
} from "lucide-react";

interface Category {
  id: string;
  label: string;
  icon: any;
  color: string;
  bgColor: string;
}

const categories: Category[] = [
  {
    id: "technology",
    label: "التقنية",
    icon: Laptop,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950"
  },
  {
    id: "ai",
    label: "الذكاء الاصطناعي",
    icon: Brain,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950"
  },
  {
    id: "web",
    label: "الويب",
    icon: Globe,
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-50 dark:bg-cyan-950"
  },
  {
    id: "education",
    label: "التعليم",
    icon: BookOpen,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950"
  },
  {
    id: "gaming",
    label: "الألعاب",
    icon: Gamepad2,
    color: "text-pink-600 dark:text-pink-400",
    bgColor: "bg-pink-50 dark:bg-pink-950"
  },
  {
    id: "health",
    label: "الصحة",
    icon: Heart,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950"
  },
  {
    id: "business",
    label: "الأعمال",
    icon: DollarSign,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950"
  }
];

export interface FilterValues {
  search: string;
  categories: string[];
  status: "all" | "published" | "draft" | "scheduled" | "archived";
  dateFrom?: Date;
  dateTo?: Date;
  aiScoreMin?: number;
  aiScoreMax?: number;
}

interface IFoxArticlesFiltersProps {
  filters: FilterValues;
  onChange: (filters: FilterValues) => void;
  onReset: () => void;
  articleCount?: number;
}

export function IFoxArticlesFilters({
  filters,
  onChange,
  onReset,
  articleCount = 0
}: IFoxArticlesFiltersProps) {
  const [expandedFilters, setExpandedFilters] = useState(false);

  const handleCategoryToggle = (categoryId: string) => {
    const newCategories = filters.categories.includes(categoryId)
      ? filters.categories.filter(c => c !== categoryId)
      : [...filters.categories, categoryId];
    onChange({ ...filters, categories: newCategories });
  };

  const handleSearchChange = (value: string) => {
    onChange({ ...filters, search: value });
  };

  const handleStatusChange = (status: FilterValues["status"]) => {
    onChange({ ...filters, status });
  };

  const handleDateFromChange = (date: Date | undefined) => {
    onChange({ ...filters, dateFrom: date });
  };

  const handleDateToChange = (date: Date | undefined) => {
    onChange({ ...filters, dateTo: date });
  };

  const handleAIScoreChange = (min: number | undefined, max: number | undefined) => {
    onChange({ ...filters, aiScoreMin: min, aiScoreMax: max });
  };

  const activeFiltersCount = 
    (filters.categories.length > 0 ? 1 : 0) +
    (filters.status !== "all" ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.search ? 1 : 0) +
    (filters.aiScoreMin || filters.aiScoreMax ? 1 : 0);

  return (
    <Card className="bg-gradient-to-br from-background via-background to-primary/5 border-primary/10">
      <CardContent className="p-3 sm:p-4 md:p-6">
        <div className="space-y-3 sm:space-y-4">
          {/* Header with Search */}
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
              <h3 className="text-base sm:text-lg font-semibold truncate">فلاتر البحث</h3>
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {activeFiltersCount} فلاتر نشطة
                </Badge>
              )}
              {articleCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  {articleCount} مقال
                </Badge>
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث في المقالات..."
                  value={filters.search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pr-10 text-xs sm:text-sm"
                  dir="rtl"
                  data-testid="input-search-filter"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setExpandedFilters(!expandedFilters)}
                  data-testid="button-toggle-filters"
                  className="flex-shrink-0"
                >
                  {expandedFilters ? <X className="w-3 h-3 sm:w-4 sm:h-4" /> : <Filter className="w-3 h-3 sm:w-4 sm:h-4" />}
                </Button>
                {activeFiltersCount > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onReset}
                    data-testid="button-reset-filters"
                    className="flex-shrink-0"
                  >
                    <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Categories Selection */}
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm font-medium">التصنيفات</Label>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const Icon = category.icon;
                const isSelected = filters.categories.includes(category.id);
                return (
                  <button
                    key={category.id}
                    onClick={() => handleCategoryToggle(category.id)}
                    className={cn(
                      "flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg transition-all",
                      isSelected
                        ? `${category.bgColor} ${category.color} ring-2 ring-primary`
                        : "bg-muted hover:bg-muted/80"
                    )}
                    data-testid={`button-category-${category.id}`}
                  >
                    <Icon className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="text-xs sm:text-sm font-medium truncate">{category.label}</span>
                    {isSelected && <X className="w-3 h-3 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expanded Filters */}
          {expandedFilters && (
            <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4 border-t animate-in slide-in-from-top-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* Status Filter */}
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm font-medium">حالة المقال</Label>
                  <RadioGroup 
                    value={filters.status} 
                    onValueChange={(value) => handleStatusChange(value as FilterValues["status"])}
                  >
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="all" id="status-all" data-testid="radio-status-all" />
                      <Label htmlFor="status-all" className="text-xs sm:text-sm cursor-pointer">
                        جميع الحالات
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="published" id="status-published" data-testid="radio-status-published" />
                      <Label htmlFor="status-published" className="text-xs sm:text-sm cursor-pointer">
                        منشور
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="draft" id="status-draft" data-testid="radio-status-draft" />
                      <Label htmlFor="status-draft" className="text-xs sm:text-sm cursor-pointer">
                        مسودة
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="scheduled" id="status-scheduled" data-testid="radio-status-scheduled" />
                      <Label htmlFor="status-scheduled" className="text-xs sm:text-sm cursor-pointer">
                        مجدول
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="archived" id="status-archived" data-testid="radio-status-archived" />
                      <Label htmlFor="status-archived" className="text-xs sm:text-sm cursor-pointer">
                        مؤرشف
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Date From */}
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm font-medium">من تاريخ</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-right text-xs sm:text-sm",
                          !filters.dateFrom && "text-muted-foreground"
                        )}
                        data-testid="button-date-from"
                      >
                        <CalendarIcon className="ml-2 w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="truncate">
                          {filters.dateFrom ? (
                            format(filters.dateFrom, "PPP", { locale: ar })
                          ) : (
                            "اختر التاريخ"
                          )}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={filters.dateFrom}
                        onSelect={handleDateFromChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Date To */}
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm font-medium">إلى تاريخ</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-right text-xs sm:text-sm",
                          !filters.dateTo && "text-muted-foreground"
                        )}
                        data-testid="button-date-to"
                      >
                        <CalendarIcon className="ml-2 w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="truncate">
                          {filters.dateTo ? (
                            format(filters.dateTo, "PPP", { locale: ar })
                          ) : (
                            "اختر التاريخ"
                          )}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={filters.dateTo}
                        onSelect={handleDateToChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* AI Score Range */}
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm font-medium flex items-center gap-1">
                    <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-amber-500" />
                    تقييم AI
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="من"
                      value={filters.aiScoreMin || ""}
                      onChange={(e) => handleAIScoreChange(
                        e.target.value ? parseInt(e.target.value) : undefined,
                        filters.aiScoreMax
                      )}
                      min={0}
                      max={100}
                      className="w-16 sm:w-20 text-xs sm:text-sm"
                      data-testid="input-ai-score-min"
                    />
                    <span className="text-xs text-muted-foreground">-</span>
                    <Input
                      type="number"
                      placeholder="إلى"
                      value={filters.aiScoreMax || ""}
                      onChange={(e) => handleAIScoreChange(
                        filters.aiScoreMin,
                        e.target.value ? parseInt(e.target.value) : undefined
                      )}
                      min={0}
                      max={100}
                      className="w-16 sm:w-20 text-xs sm:text-sm"
                      data-testid="input-ai-score-max"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 sm:pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={onReset}
                  className="gap-1.5 sm:gap-2 text-xs sm:text-sm"
                  data-testid="button-clear-filters"
                >
                  <X className="w-3 h-3 sm:w-4 sm:h-4" />
                  مسح الفلاتر
                </Button>
                <Button
                  onClick={() => setExpandedFilters(false)}
                  className="gap-1.5 sm:gap-2 text-xs sm:text-sm"
                  data-testid="button-apply-filters"
                >
                  <Filter className="w-3 h-3 sm:w-4 sm:h-4" />
                  تطبيق الفلاتر
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
