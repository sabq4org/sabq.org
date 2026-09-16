import { Eye, MonitorCog, Type, Waves, BookOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { useTheme, type ThemePreference } from "@/components/ThemeProvider";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { VariantSwitcher } from "@/components/VariantSwitcher";

export function AppearanceSection() {
  const { themePreference, setTheme } = useTheme();
  const {
    settings,
    setFontSize,
    setHighContrast,
    setReduceMotion,
    setReadingMode,
    resetSettings,
  } = useAccessibility();

  return (
    <div className="space-y-6" data-testid="appearance-section">
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <MonitorCog className="h-5 w-5" />
            المظهر
          </CardTitle>
          <CardDescription>الوضع الليلي والنمط البصري</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="settings-theme">السمة</Label>
            <Select
              value={themePreference}
              onValueChange={(v) => setTheme(v as ThemePreference)}
            >
              <SelectTrigger id="settings-theme" data-testid="select-settings-theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">فاتح</SelectItem>
                <SelectItem value="dark">داكن</SelectItem>
                <SelectItem value="system">حسب النظام</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-2 block">النمط البصري</Label>
            <VariantSwitcher inline />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>اللغة</CardTitle>
          <CardDescription>تبديل لغة واجهة الموقع</CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageSwitcher />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <Eye className="h-5 w-5" />
            إعدادات الوصول
          </CardTitle>
          <CardDescription>حجم الخط والتباين والحركة ووضع القراءة</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 max-w-xs">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-muted-foreground" />
              <Label>حجم الخط</Label>
            </div>
            <Select
              value={settings.fontSize}
              onValueChange={(v) => setFontSize(v as "normal" | "large" | "x-large")}
            >
              <SelectTrigger data-testid="select-settings-font-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">عادي</SelectItem>
                <SelectItem value="large">كبير</SelectItem>
                <SelectItem value="x-large">كبير جدًا</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="high-contrast">تباين عالٍ</Label>
                <p className="text-xs text-muted-foreground">يزيد وضوح النصوص والحدود</p>
              </div>
            </div>
            <Switch
              id="high-contrast"
              checked={settings.highContrast}
              onCheckedChange={setHighContrast}
              data-testid="switch-high-contrast"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Waves className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="reduce-motion">تقليل الحركة</Label>
                <p className="text-xs text-muted-foreground">يقلّل الرسوم المتحركة</p>
              </div>
            </div>
            <Switch
              id="reduce-motion"
              checked={settings.reduceMotion}
              onCheckedChange={setReduceMotion}
              data-testid="switch-reduce-motion"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="reading-mode">وضع القراءة</Label>
                <p className="text-xs text-muted-foreground">يبسّط الصفحة للتركيز على النص</p>
              </div>
            </div>
            <Switch
              id="reading-mode"
              checked={settings.readingMode}
              onCheckedChange={setReadingMode}
              data-testid="switch-reading-mode"
            />
          </div>

          <Button variant="outline" size="sm" onClick={resetSettings} data-testid="button-reset-a11y">
            استعادة الافتراضي
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
