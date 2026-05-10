import { useState } from "react";
import { Eye, Type, Waves, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { Separator } from "@/components/ui/separator";

type AccessibilitySettingsProps = {
  variant?: 'mobile' | 'desktop';
};

export function AccessibilitySettings({ variant }: AccessibilitySettingsProps = {}) {
  const [open, setOpen] = useState(false);
  const {
    settings,
    setFontSize,
    setHighContrast,
    setReduceMotion,
    setReadingMode,
    resetSettings,
  } = useAccessibility();

  const fontSizeOptions = [
    { value: "normal", label: "عادي" },
    { value: "large", label: "كبير" },
    { value: "x-large", label: "كبير جداً" },
  ];

  const testId = variant ? `button-accessibility-settings-${variant}` : "button-accessibility-settings";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hover-elevate active-elevate-2"
          data-testid={testId}
          aria-label="إعدادات الوصول"
        >
          <Eye className="h-5 w-5" />
          <span className="sr-only">إعدادات الوصول</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-accessibility-settings">
        <DialogHeader>
          <DialogTitle className="text-right">إعدادات الوصول</DialogTitle>
          <DialogDescription className="text-right">
            قم بتخصيص تجربة القراءة والتصفح لتناسب احتياجاتك
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Font Size Setting */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Type className="h-5 w-5 text-muted-foreground" />
              <Label htmlFor="font-size" className="text-base font-medium">
                حجم الخط
              </Label>
            </div>
            <Select
              value={settings.fontSize}
              onValueChange={(value) => setFontSize(value as "normal" | "large" | "x-large")}
            >
              <SelectTrigger
                id="font-size"
                className="w-full"
                data-testid="select-font-size"
                aria-label="اختر حجم الخط"
              >
                <SelectValue placeholder="اختر حجم الخط" />
              </SelectTrigger>
              <SelectContent>
                {fontSizeOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    data-testid={`option-font-size-${option.value}`}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground text-right">
              اختر حجم الخط المناسب لراحة القراءة
            </p>
          </div>

          <Separator />

          {/* High Contrast Setting */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <Eye className="h-5 w-5 text-muted-foreground" />
                <div className="space-y-1 flex-1">
                  <Label htmlFor="high-contrast" className="text-base font-medium cursor-pointer">
                    التباين العالي
                  </Label>
                  <p className="text-sm text-muted-foreground text-right">
                    زيادة التباين بين النصوص والخلفية لتحسين الوضوح
                  </p>
                </div>
              </div>
              <Switch
                id="high-contrast"
                checked={settings.highContrast}
                onCheckedChange={setHighContrast}
                data-testid="switch-high-contrast"
                aria-label="تفعيل التباين العالي"
              />
            </div>
          </div>

          <Separator />

          {/* Reduce Motion Setting */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <Waves className="h-5 w-5 text-muted-foreground" />
                <div className="space-y-1 flex-1">
                  <Label htmlFor="reduce-motion" className="text-base font-medium cursor-pointer">
                    تقليل الحركة
                  </Label>
                  <p className="text-sm text-muted-foreground text-right">
                    تقليل الحركات والتأثيرات المتحركة في الواجهة
                  </p>
                </div>
              </div>
              <Switch
                id="reduce-motion"
                checked={settings.reduceMotion}
                onCheckedChange={setReduceMotion}
                data-testid="switch-reduce-motion"
                aria-label="تفعيل تقليل الحركة"
              />
            </div>
          </div>

          <Separator />

          {/* Reading Mode Setting */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <BookOpen className="h-5 w-5 text-muted-foreground" />
                <div className="space-y-1 flex-1">
                  <Label htmlFor="reading-mode" className="text-base font-medium cursor-pointer">
                    وضع القراءة المحسّن
                  </Label>
                  <p className="text-sm text-muted-foreground text-right">
                    خط وتباعد محسّن لذوي صعوبات القراءة والديسلكسيا
                  </p>
                </div>
              </div>
              <Switch
                id="reading-mode"
                checked={settings.readingMode}
                onCheckedChange={setReadingMode}
                data-testid="switch-reading-mode"
                aria-label="تفعيل وضع القراءة المحسّن"
              />
            </div>
          </div>

          <Separator />

          {/* Reset Button */}
          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              onClick={resetSettings}
              data-testid="button-reset-accessibility"
              className="hover-elevate active-elevate-2"
            >
              إعادة تعيين
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
