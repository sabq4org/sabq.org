import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Settings, 
  Save, 
  Loader2, 
  Image as ImageIcon,
  Wand2,
  Check,
  X,
  Plus,
  Zap,
  Palette,
  FileType,
  FolderX,
  Sparkles
} from "lucide-react";
import type { Category } from "@shared/schema";

interface AutoImageSettings {
  enabled: boolean;
  articleTypes: string[];
  skipCategories: string[];
  defaultStyle: string;
  provider: string;
  autoPublish: boolean;
  generateOnSave: boolean;
  imagePromptTemplate?: string;
  maxMonthlyGenerations?: number;
  currentMonthGenerations?: number;
}

const SectionHeader = ({ title, color }: { title: string; color: string }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className={`h-8 w-1 ${color} rounded-full`}></div>
    <h3 className="text-lg font-bold text-foreground">{title}</h3>
  </div>
);

export default function AutoImageSettingsPage() {
  const [settings, setSettings] = useState<AutoImageSettings>({
    enabled: false,
    articleTypes: ["news", "analysis"],
    skipCategories: ["opinion", "columns"],
    defaultStyle: "photorealistic",
    provider: "nano-banana",
    autoPublish: false,
    generateOnSave: false,
    imagePromptTemplate: "",
    maxMonthlyGenerations: 100,
    currentMonthGenerations: 0
  });

  const [newCategory, setNewCategory] = useState("");

  // Fetch categories
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: true
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Fetch settings
  const { data, isLoading } = useQuery<AutoImageSettings>({
    queryKey: ["/api/auto-image/settings"]
  });
  
  // Update local settings when data is fetched
  useEffect(() => {
    if (data) {
      setSettings(data);
    }
  }, [data]);

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (updatedSettings: AutoImageSettings) => {
      return await apiRequest<{ success: boolean }>("/api/auto-image/settings", {
        method: "PUT",
        body: JSON.stringify(updatedSettings)
      });
    },
    onSuccess: () => {
      toast({
        title: "تم حفظ الإعدادات",
        description: "تم تحديث إعدادات التوليد التلقائي بنجاح"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auto-image/settings"] });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في حفظ الإعدادات",
        description: error.message || "حدث خطأ أثناء حفظ الإعدادات",
        variant: "destructive"
      });
    }
  });

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate(settings);
  };

  const addSkipCategory = () => {
    if (newCategory && !settings.skipCategories.includes(newCategory)) {
      setSettings({
        ...settings,
        skipCategories: [...settings.skipCategories, newCategory]
      });
      setNewCategory("");
    }
  };

  const removeSkipCategory = (category: string) => {
    setSettings({
      ...settings,
      skipCategories: settings.skipCategories.filter(c => c !== category)
    });
  };

  const toggleArticleType = (type: string) => {
    if (settings.articleTypes.includes(type)) {
      setSettings({
        ...settings,
        articleTypes: settings.articleTypes.filter(t => t !== type)
      });
    } else {
      setSettings({
        ...settings,
        articleTypes: [...settings.articleTypes, type]
      });
    }
  };

  const articleTypeOptions = [
    { value: "news", label: "أخبار" },
    { value: "analysis", label: "تحليلات" },
    { value: "column", label: "أعمدة" },
    { value: "opinion", label: "آراء" }
  ];

  const styleOptions = [
    { value: "photorealistic", label: "واقعي" },
    { value: "illustration", label: "رسم توضيحي" },
    { value: "abstract", label: "تجريدي" },
    { value: "minimalist", label: "بسيط" },
    { value: "modern", label: "عصري" }
  ];

  const providerOptions = [
    { value: "nano-banana", label: "Nano Banana Pro" },
    { value: "gemini", label: "Google Gemini" },
    { value: "dall-e", label: "DALL-E 3" }
  ];

  const usagePercentage = settings.maxMonthlyGenerations 
    ? Math.round(((settings.currentMonthGenerations || 0) / settings.maxMonthlyGenerations) * 100)
    : 0;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6" dir="rtl">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-950/50">
              <Wand2 className="h-8 w-8 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="text-page-title">
                إعدادات التوليد التلقائي للصور
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                تحكم في إعدادات توليد الصور بالذكاء الاصطناعي للمقالات
              </p>
            </div>
          </div>
          <Button
            onClick={handleSaveSettings}
            disabled={updateSettingsMutation.isPending}
            size="lg"
            className="gap-2"
            data-testid="button-save-settings"
          >
            {updateSettingsMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                حفظ الإعدادات
              </>
            )}
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="hover-elevate active-elevate-2 transition-all bg-purple-50 dark:bg-purple-950/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">صور الشهر</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {settings.currentMonthGenerations || 0}
                  </p>
                </div>
                <div className="p-2 rounded-md bg-purple-500/20">
                  <ImageIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate active-elevate-2 transition-all bg-blue-50 dark:bg-blue-950/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">الحد الأقصى</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {settings.maxMonthlyGenerations || 100}
                  </p>
                </div>
                <div className="p-2 rounded-md bg-blue-500/20">
                  <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate active-elevate-2 transition-all bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">نسبة الاستخدام</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {usagePercentage}%
                  </p>
                </div>
                <div className="p-2 rounded-md bg-amber-500/20">
                  <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={`hover-elevate active-elevate-2 transition-all ${
            settings.enabled 
              ? 'bg-green-50 dark:bg-green-950/30' 
              : 'bg-gray-50 dark:bg-gray-950/30'
          }`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">الحالة</p>
                  <p className={`text-2xl font-bold ${
                    settings.enabled 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    {settings.enabled ? 'مفعّل' : 'معطّل'}
                  </p>
                </div>
                <div className={`p-2 rounded-md ${
                  settings.enabled 
                    ? 'bg-green-500/20' 
                    : 'bg-gray-500/20'
                }`}>
                  <Settings className={`h-5 w-5 ${
                    settings.enabled 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-gray-600 dark:text-gray-400'
                  }`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Usage Progress */}
        {settings.maxMonthlyGenerations && (
          <Card className="hover-elevate transition-all bg-gradient-to-l from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">استخدام الشهر الحالي</span>
                <span className="text-sm text-muted-foreground">
                  {settings.currentMonthGenerations || 0} / {settings.maxMonthlyGenerations} صورة
                </span>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all rounded-full ${
                    usagePercentage > 80 
                      ? 'bg-red-500' 
                      : usagePercentage > 50 
                        ? 'bg-amber-500' 
                        : 'bg-green-500'
                  }`}
                  style={{ width: `${usagePercentage}%` }}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Settings */}
        <Card className="hover-elevate transition-all bg-violet-50 dark:bg-violet-950/30">
          <CardContent className="p-6">
            <SectionHeader title="الإعدادات الرئيسية" color="bg-violet-500" />
            
            <div className="space-y-6">
              {/* Enable/Disable Toggle */}
              <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-black/20 rounded-lg">
                <div>
                  <Label htmlFor="enabled" className="text-base font-medium">
                    تفعيل التوليد التلقائي
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    توليد صور تلقائياً للمقالات التي لا تحتوي على صور
                  </p>
                </div>
                <Switch
                  id="enabled"
                  checked={settings.enabled}
                  onCheckedChange={(checked) => 
                    setSettings({ ...settings, enabled: checked })
                  }
                  data-testid="switch-enabled"
                />
              </div>

              <Separator />

              {/* Provider Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-violet-500" />
                  مزود خدمة التوليد
                </Label>
                <Select
                  value={settings.provider}
                  onValueChange={(value) => 
                    setSettings({ ...settings, provider: value })
                  }
                >
                  <SelectTrigger data-testid="select-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providerOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  اختر مزود الخدمة المفضل لتوليد الصور
                </p>
              </div>

              {/* Default Style */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-violet-500" />
                  النمط الافتراضي للصور
                </Label>
                <Select
                  value={settings.defaultStyle}
                  onValueChange={(value) => 
                    setSettings({ ...settings, defaultStyle: value })
                  }
                >
                  <SelectTrigger data-testid="select-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {styleOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Auto Generation Options */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-black/20 rounded-lg">
                  <div>
                    <Label htmlFor="generateOnSave">
                      توليد عند الحفظ
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      توليد صورة تلقائياً عند حفظ المقال بدون صورة
                    </p>
                  </div>
                  <Switch
                    id="generateOnSave"
                    checked={settings.generateOnSave}
                    onCheckedChange={(checked) => 
                      setSettings({ ...settings, generateOnSave: checked })
                    }
                    data-testid="switch-generate-on-save"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-black/20 rounded-lg">
                  <div>
                    <Label htmlFor="autoPublish">
                      النشر التلقائي للصور
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      نشر الصور المُولّدة تلقائياً دون الحاجة لموافقة
                    </p>
                  </div>
                  <Switch
                    id="autoPublish"
                    checked={settings.autoPublish}
                    onCheckedChange={(checked) => 
                      setSettings({ ...settings, autoPublish: checked })
                    }
                    data-testid="switch-auto-publish"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Article Types Settings */}
        <Card className="hover-elevate transition-all bg-blue-50 dark:bg-blue-950/30">
          <CardContent className="p-6">
            <SectionHeader title="أنواع المقالات" color="bg-blue-500" />
            <p className="text-sm text-muted-foreground mb-4">
              اختر أنواع المقالات التي سيتم توليد صور لها تلقائياً
            </p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {articleTypeOptions.map(type => (
                <div
                  key={type.value}
                  className={`
                    p-4 rounded-lg border-2 cursor-pointer transition-all hover-elevate
                    ${settings.articleTypes.includes(type.value)
                      ? "border-blue-500 bg-blue-100 dark:bg-blue-900/50"
                      : "border-muted bg-white/50 dark:bg-black/20 hover:border-blue-300"}
                  `}
                  onClick={() => toggleArticleType(type.value)}
                  data-testid={`toggle-type-${type.value}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileType className={`h-4 w-4 ${
                        settings.articleTypes.includes(type.value)
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-muted-foreground'
                      }`} />
                      <span className="font-medium">{type.label}</span>
                    </div>
                    {settings.articleTypes.includes(type.value) ? (
                      <Check className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <X className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Skip Categories Settings */}
        <Card className="hover-elevate transition-all bg-orange-50 dark:bg-orange-950/30">
          <CardContent className="p-6">
            <SectionHeader title="الفئات المستثناة" color="bg-orange-500" />
            <p className="text-sm text-muted-foreground mb-4">
              الفئات التي لن يتم توليد صور لها تلقائياً
            </p>
            
            <div className="space-y-4">
              <div className="flex gap-2">
                <Select
                  value={newCategory}
                  onValueChange={setNewCategory}
                >
                  <SelectTrigger className="flex-1" data-testid="select-skip-category">
                    <SelectValue placeholder="اختر فئة لاستثنائها" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories
                      .filter(cat => !settings.skipCategories.includes(cat.nameAr))
                      .map(cat => (
                        <SelectItem key={cat.id} value={cat.nameAr}>
                          {cat.nameAr}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
                <Button
                  onClick={addSkipCategory}
                  disabled={!newCategory}
                  data-testid="button-add-skip-category"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {settings.skipCategories.map(category => (
                  <Badge
                    key={category}
                    variant="secondary"
                    className="px-3 py-1.5 flex items-center gap-2 bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300"
                  >
                    <FolderX className="h-3 w-3" />
                    {category}
                    <button
                      onClick={() => removeSkipCategory(category)}
                      className="hover:text-destructive transition-colors"
                      data-testid={`button-remove-category-${category}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {settings.skipCategories.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    لا توجد فئات مستثناة
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Advanced Settings */}
        <Card className="hover-elevate transition-all bg-slate-50 dark:bg-slate-950/30">
          <CardContent className="p-6">
            <SectionHeader title="إعدادات متقدمة" color="bg-slate-500" />
            
            <div className="space-y-6">
              {/* Prompt Template */}
              <div className="space-y-2">
                <Label htmlFor="promptTemplate" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-slate-500" />
                  قالب التوليد (اختياري)
                </Label>
                <textarea
                  id="promptTemplate"
                  className="w-full min-h-[100px] p-3 rounded-md border bg-white dark:bg-black/20 resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="أدخل قالب التوليد المخصص... يمكنك استخدام {title} و {category} كمتغيرات"
                  value={settings.imagePromptTemplate || ""}
                  onChange={(e) => 
                    setSettings({ ...settings, imagePromptTemplate: e.target.value })
                  }
                  data-testid="textarea-prompt-template"
                />
                <p className="text-xs text-muted-foreground">
                  استخدم {"{title}"} للعنوان و {"{category}"} للفئة في القالب
                </p>
              </div>

              {/* Monthly Limit */}
              <div className="space-y-2">
                <Label htmlFor="maxMonthly" className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-slate-500" />
                  الحد الأقصى الشهري
                </Label>
                <Input
                  id="maxMonthly"
                  type="number"
                  min="0"
                  max="10000"
                  value={settings.maxMonthlyGenerations || 100}
                  onChange={(e) => 
                    setSettings({ 
                      ...settings, 
                      maxMonthlyGenerations: parseInt(e.target.value) || 100
                    })
                  }
                  className="max-w-xs"
                  data-testid="input-max-monthly"
                />
                <p className="text-xs text-muted-foreground">
                  الحد الأقصى لعدد الصور المُولّدة شهرياً
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
