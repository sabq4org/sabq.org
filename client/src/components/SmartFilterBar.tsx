import { motion } from "framer-motion";
import { useState } from "react";
import { Filter, Calendar, Tag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TimeRange = 'today' | 'week' | 'month' | 'all';
type Mood = 'all' | 'trending' | 'calm' | 'hot';

interface SmartFilterBarProps {
  onTimeRangeChange?: (range: TimeRange) => void;
  onMoodChange?: (mood: Mood) => void;
  onCategoryChange?: (categoryId: string) => void;
  categories?: Array<{ id: string; nameAr: string; icon?: string }>;
}

export function SmartFilterBar({ 
  onTimeRangeChange, 
  onMoodChange, 
  onCategoryChange,
  categories = [] 
}: SmartFilterBarProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [mood, setMood] = useState<Mood>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range);
    onTimeRangeChange?.(range);
  };

  const handleMoodChange = (newMood: Mood) => {
    setMood(newMood);
    onMoodChange?.(newMood);
  };

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
    onCategoryChange?.(categoryId);
  };

  const moodOptions = [
    { value: 'all', label: 'الكل' },
    { value: 'trending', label: 'الأكثر تداولاً' },
    { value: 'calm', label: 'هادئة' },
    { value: 'hot', label: 'ساخنة' },
  ];

  const timeRangeOptions = [
    { value: 'today', label: 'اليوم' },
    { value: 'week', label: 'هذا الأسبوع' },
    { value: 'month', label: 'هذا الشهر' },
    { value: 'all', label: 'جميع الفترات' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 p-4 rounded-lg border bg-card"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Filter className="h-4 w-4 text-primary" />
        </div>
        <h3 className="font-semibold">تصفية ذكية</h3>
        <Badge variant="secondary" className="text-xs">
          <Sparkles className="h-3 w-3 ml-1" />
          AI
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Time Range Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            الفترة الزمنية
          </label>
          <div className="flex flex-wrap gap-2">
            {timeRangeOptions.map((option) => (
              <Button
                key={option.value}
                variant={timeRange === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => handleTimeRangeChange(option.value as TimeRange)}
                data-testid={`filter-time-${option.value}`}
                className="text-xs"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Mood Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            المزاج
          </label>
          <div className="flex flex-wrap gap-2">
            {moodOptions.map((option) => (
              <Button
                key={option.value}
                variant={mood === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => handleMoodChange(option.value as Mood)}
                data-testid={`filter-mood-${option.value}`}
                className="text-xs"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Tag className="h-4 w-4" />
              التصنيف
            </label>
            <Select value={selectedCategory} onValueChange={handleCategoryChange}>
              <SelectTrigger data-testid="filter-category">
                <SelectValue placeholder="اختر تصنيفاً" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع التصنيفات</SelectItem>
                {(categories || []).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.icon} {category.nameAr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* AI Suggestions */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-muted-foreground mb-2">اقتراحات ذكية:</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="hover-elevate cursor-pointer" data-testid="suggestion-most-read">
            <Sparkles className="h-3 w-3 ml-1" />
            الأكثر قراءة اليوم
          </Badge>
          <Badge variant="outline" className="hover-elevate cursor-pointer" data-testid="suggestion-personalized">
            <Sparkles className="h-3 w-3 ml-1" />
            مخصص لك
          </Badge>
          <Badge variant="outline" className="hover-elevate cursor-pointer" data-testid="suggestion-breaking">
            <Sparkles className="h-3 w-3 ml-1" />
            الأخبار العاجلة
          </Badge>
        </div>
      </div>
    </motion.div>
  );
}
