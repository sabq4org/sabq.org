import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { IFoxLayout } from "@/components/admin/ifox/IFoxLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import mascotImage from "@assets/sabq_ai_mascot_1_1_1763712965053.png";
import {
  Settings,
  Brain,
  Sparkles,
  Zap,
  Bell,
  Palette,
  Globe,
  Shield,
  Database,
  Code,
  Image,
  FileText,
  Mail,
  MessageSquare,
  Cpu,
  Activity,
  Clock,
  Users,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
  X,
  Check,
  AlertTriangle,
  Info
} from "lucide-react";

interface IFoxSettings {
  ai: {
    provider: "openai" | "anthropic" | "gemini";
    model: string;
    temperature: number;
    maxTokens: number;
    autoClassification: boolean;
    autoSEO: boolean;
    autoSummary: boolean;
    contentAnalysis: boolean;
  };
  publishing: {
    autoPublish: boolean;
    requireReview: boolean;
    defaultStatus: "draft" | "published" | "scheduled";
    allowScheduling: boolean;
    maxScheduleDays: number;
    enableVersioning: boolean;
  };
  notifications: {
    emailNotifications: boolean;
    pushNotifications: boolean;
    notifyOnPublish: boolean;
    notifyOnComment: boolean;
    notifyOnMention: boolean;
    digestFrequency: "daily" | "weekly" | "never";
  };
  appearance: {
    theme: "dark" | "light" | "auto";
    accentColor: string;
    fontSize: "small" | "medium" | "large";
    rtlSupport: boolean;
    showAnimations: boolean;
    compactMode: boolean;
  };
  media: {
    maxFileSize: number;
    allowedFormats: string[];
    autoOptimize: boolean;
    generateThumbnails: boolean;
    watermark: boolean;
    watermarkText: string;
  };
  security: {
    twoFactorAuth: boolean;
    sessionTimeout: number;
    ipWhitelist: string[];
    loginAttempts: number;
    passwordExpiry: number;
  };
}

export default function IFoxSettings() {
  useRoleProtection('admin');
  const { toast } = useToast();
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch current settings
  const { data: settings, isLoading } = useQuery<IFoxSettings>({
    queryKey: ["/api/admin/ifox/settings"]
  });

  const [localSettings, setLocalSettings] = useState<IFoxSettings | null>(null);

  // Initialize local settings when data loads
  if (settings && !localSettings) {
    setLocalSettings(settings);
  }

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: async (data: IFoxSettings) => {
      return await apiRequest('/api/admin/ifox/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/settings"] });
      toast({
        title: "تم الحفظ بنجاح",
        description: "تم حفظ الإعدادات بنجاح",
      });
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل حفظ الإعدادات",
        variant: "destructive"
      });
    }
  });

  const handleSave = () => {
    if (localSettings) {
      saveMutation.mutate(localSettings);
    }
  };

  const handleReset = () => {
    setLocalSettings(settings || null);
    setHasChanges(false);
    toast({
      title: "تم الإلغاء",
      description: "تم إلغاء التغييرات",
    });
  };

  const updateSetting = (path: string[], value: any) => {
    if (!localSettings) return;
    
    const newSettings = { ...localSettings };
    let current: any = newSettings;
    
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    
    current[path[path.length - 1]] = value;
    setLocalSettings(newSettings);
    setHasChanges(true);
  };

  if (isLoading || !localSettings) {
    return (
      <IFoxLayout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <RefreshCw className="w-12 h-12 text-[hsl(var(--ifox-accent-primary))] animate-spin mx-auto mb-4" />
            <p className="text-[hsl(var(--ifox-text-primary))]">جاري تحميل الإعدادات...</p>
          </div>
        </div>
      </IFoxLayout>
    );
  }

  return (
    <IFoxLayout>
      <ScrollArea className="h-full">
        <div className="flex h-full flex-col">
          <div className="p-6 space-y-6" dir="rtl">
            {/* Header */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                {/* Animated AI Mascot */}
                <motion.div
                  className="relative"
                  animate={{
                    y: [0, -8, 0],
                    rotate: [0, 2, -2, 0],
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <motion.div
                    className="absolute inset-0 rounded-full blur-xl opacity-60"
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.4, 0.7, 0.4],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    style={{
                      background: "radial-gradient(circle, hsl(var(--ifox-accent-glow) / 0.6), hsl(var(--ifox-accent-glow-secondary) / 0.6))",
                    }}
                  />
                  <img 
                    src={mascotImage} 
                    alt="iFox AI Mascot" 
                    className="w-16 h-16 relative z-10"
                    style={{ filter: 'drop-shadow(0 25px 50px hsl(var(--ifox-surface-overlay) / 0.2))' }}
                  />
                </motion.div>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)] bg-clip-text text-transparent" data-testid="text-page-title">
                    إعدادات آي فوكس
                  </h1>
                  <p className="text-[hsl(var(--ifox-text-primary))] text-lg" data-testid="text-page-description">
                    تخصيص وإدارة إعدادات النظام
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              {hasChanges && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-2"
                >
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.6)]"
                    data-testid="button-reset"
                  >
                    <X className="w-4 h-4 ml-2" />
                    إلغاء
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)] hover:from-[hsl(var(--ifox-accent-primary)/1)] hover:to-[hsl(var(--ifox-accent-secondary)/1)] text-[hsl(var(--ifox-text-primary))]"
                    data-testid="button-save"
                  >
                    {saveMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 ml-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 ml-2" />
                    )}
                    حفظ التغييرات
                  </Button>
                </motion.div>
              )}
            </motion.div>

            {/* Settings Tabs */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Tabs defaultValue="ai" className="space-y-6">
                <TabsList className="bg-[hsl(var(--ifox-surface-muted)/.7)] border border-[hsl(var(--ifox-surface-overlay))] p-1">
                  <TabsTrigger value="ai" className="data-[state=active]:bg-[hsl(var(--ifox-accent-primary)/.3)]">
                    <Brain className="w-4 h-4 ml-2" />
                    الذكاء الاصطناعي
                  </TabsTrigger>
                  <TabsTrigger value="publishing" className="data-[state=active]:bg-[hsl(var(--ifox-accent-primary)/.3)]">
                    <FileText className="w-4 h-4 ml-2" />
                    النشر
                  </TabsTrigger>
                  <TabsTrigger value="notifications" className="data-[state=active]:bg-[hsl(var(--ifox-accent-primary)/.3)]">
                    <Bell className="w-4 h-4 ml-2" />
                    الإشعارات
                  </TabsTrigger>
                  <TabsTrigger value="appearance" className="data-[state=active]:bg-[hsl(var(--ifox-accent-primary)/.3)]">
                    <Palette className="w-4 h-4 ml-2" />
                    المظهر
                  </TabsTrigger>
                  <TabsTrigger value="media" className="data-[state=active]:bg-[hsl(var(--ifox-accent-primary)/.3)]">
                    <Image className="w-4 h-4 ml-2" />
                    الوسائط
                  </TabsTrigger>
                  <TabsTrigger value="security" className="data-[state=active]:bg-[hsl(var(--ifox-accent-primary)/.3)]">
                    <Shield className="w-4 h-4 ml-2" />
                    الأمان
                  </TabsTrigger>
                </TabsList>

                {/* AI Settings */}
                <TabsContent value="ai">
                  <div className="grid gap-6">
                    <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-[hsl(var(--ifox-text-primary))]">
                          <Cpu className="w-5 h-5 text-[hsl(var(--ifox-accent-primary))]" />
                          إعدادات الذكاء الاصطناعي
                        </CardTitle>
                        <CardDescription className="text-[hsl(var(--ifox-text-primary))]">
                          تخصيص سلوك AI في معالجة المحتوى
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label className="text-[hsl(var(--ifox-text-primary))]">مزود الذكاء الاصطناعي</Label>
                            <Select 
                              value={localSettings.ai.provider}
                              onValueChange={(v: any) => updateSetting(['ai', 'provider'], v)}
                            >
                              <SelectTrigger className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]" data-testid="select-ai-provider">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="openai">OpenAI GPT</SelectItem>
                                <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                                <SelectItem value="gemini">Google Gemini</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-[hsl(var(--ifox-text-primary))]">النموذج</Label>
                            <Input
                              value={localSettings.ai.model}
                              onChange={(e) => updateSetting(['ai', 'model'], e.target.value)}
                              placeholder="gpt-4, claude-3, gemini-pro"
                              className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]"
                              data-testid="input-ai-model"
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-[hsl(var(--ifox-text-primary))]">الإبداع (Temperature)</Label>
                              <Badge variant="outline" className="text-[hsl(var(--ifox-accent-primary))] border-[hsl(var(--ifox-accent-primary)/.4)]">
                                {localSettings.ai.temperature}
                              </Badge>
                            </div>
                            <Slider
                              value={[localSettings.ai.temperature]}
                              onValueChange={(v) => updateSetting(['ai', 'temperature'], v[0])}
                              min={0}
                              max={2}
                              step={0.1}
                              className="py-4"
                            />
                            <p className="text-xs text-[hsl(var(--ifox-text-primary))]">
                              قيم أعلى = محتوى أكثر إبداعاً، قيم أقل = محتوى أكثر دقة
                            </p>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-[hsl(var(--ifox-text-primary))]">الحد الأقصى للكلمات</Label>
                              <Badge variant="outline" className="text-[hsl(var(--ifox-accent-primary))] border-[hsl(var(--ifox-accent-primary)/.4)]">
                                {localSettings.ai.maxTokens}
                              </Badge>
                            </div>
                            <Slider
                              value={[localSettings.ai.maxTokens]}
                              onValueChange={(v) => updateSetting(['ai', 'maxTokens'], v[0])}
                              min={500}
                              max={4000}
                              step={100}
                              className="py-4"
                            />
                          </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-[hsl(var(--ifox-surface-overlay)/.2)]">
                          <h3 className="font-semibold text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                            <Zap className="w-4 h-4 text-[hsl(var(--ifox-warning))]" />
                            الميزات التلقائية
                          </h3>
                          
                          <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                              <div>
                                <Label className="text-[hsl(var(--ifox-text-primary))]">التصنيف التلقائي</Label>
                                <p className="text-xs text-[hsl(var(--ifox-text-primary))]">تصنيف المقالات تلقائياً بالذكاء الاصطناعي</p>
                              </div>
                              <Switch
                                checked={localSettings.ai.autoClassification}
                                onCheckedChange={(v) => updateSetting(['ai', 'autoClassification'], v)}
                                data-testid="switch-auto-classification"
                              />
                            </div>

                            <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                              <div>
                                <Label className="text-[hsl(var(--ifox-text-primary))]">SEO التلقائي</Label>
                                <p className="text-xs text-[hsl(var(--ifox-text-primary))]">توليد بيانات SEO تلقائياً</p>
                              </div>
                              <Switch
                                checked={localSettings.ai.autoSEO}
                                onCheckedChange={(v) => updateSetting(['ai', 'autoSEO'], v)}
                                data-testid="switch-auto-seo"
                              />
                            </div>

                            <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                              <div>
                                <Label className="text-[hsl(var(--ifox-text-primary))]">الملخص التلقائي</Label>
                                <p className="text-xs text-[hsl(var(--ifox-text-primary))]">إنشاء ملخص تلقائي للمقالات</p>
                              </div>
                              <Switch
                                checked={localSettings.ai.autoSummary}
                                onCheckedChange={(v) => updateSetting(['ai', 'autoSummary'], v)}
                                data-testid="switch-auto-summary"
                              />
                            </div>

                            <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                              <div>
                                <Label className="text-[hsl(var(--ifox-text-primary))]">تحليل المحتوى</Label>
                                <p className="text-xs text-[hsl(var(--ifox-text-primary))]">تحليل جودة المحتوى تلقائياً</p>
                              </div>
                              <Switch
                                checked={localSettings.ai.contentAnalysis}
                                onCheckedChange={(v) => updateSetting(['ai', 'contentAnalysis'], v)}
                                data-testid="switch-content-analysis"
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Publishing Settings */}
                <TabsContent value="publishing">
                  <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-[hsl(var(--ifox-text-primary))]">
                        <FileText className="w-5 h-5 text-[hsl(var(--ifox-info))]" />
                        إعدادات النشر
                      </CardTitle>
                      <CardDescription className="text-[hsl(var(--ifox-text-primary))]">
                        تحكم في عملية نشر المحتوى
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                        <div>
                          <Label className="text-[hsl(var(--ifox-text-primary))]">النشر التلقائي</Label>
                          <p className="text-xs text-[hsl(var(--ifox-text-primary))]">نشر المقالات تلقائياً بعد الإنشاء</p>
                        </div>
                        <Switch
                          checked={localSettings.publishing.autoPublish}
                          onCheckedChange={(v) => updateSetting(['publishing', 'autoPublish'], v)}
                          data-testid="switch-auto-publish"
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                        <div>
                          <Label className="text-[hsl(var(--ifox-text-primary))]">المراجعة المطلوبة</Label>
                          <p className="text-xs text-[hsl(var(--ifox-text-primary))]">يتطلب مراجعة قبل النشر</p>
                        </div>
                        <Switch
                          checked={localSettings.publishing.requireReview}
                          onCheckedChange={(v) => updateSetting(['publishing', 'requireReview'], v)}
                          data-testid="switch-require-review"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[hsl(var(--ifox-text-primary))]">الحالة الافتراضية</Label>
                        <Select 
                          value={localSettings.publishing.defaultStatus}
                          onValueChange={(v: any) => updateSetting(['publishing', 'defaultStatus'], v)}
                        >
                          <SelectTrigger className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]" data-testid="select-default-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">مسودة</SelectItem>
                            <SelectItem value="published">منشور</SelectItem>
                            <SelectItem value="scheduled">مجدول</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                        <div>
                          <Label className="text-[hsl(var(--ifox-text-primary))]">السماح بالجدولة</Label>
                          <p className="text-xs text-[hsl(var(--ifox-text-primary))]">تمكين جدولة المقالات</p>
                        </div>
                        <Switch
                          checked={localSettings.publishing.allowScheduling}
                          onCheckedChange={(v) => updateSetting(['publishing', 'allowScheduling'], v)}
                          data-testid="switch-allow-scheduling"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[hsl(var(--ifox-text-primary))]">الحد الأقصى لأيام الجدولة</Label>
                        <Input
                          type="number"
                          value={localSettings.publishing.maxScheduleDays}
                          onChange={(e) => updateSetting(['publishing', 'maxScheduleDays'], parseInt(e.target.value))}
                          className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]"
                          data-testid="input-max-schedule-days"
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                        <div>
                          <Label className="text-[hsl(var(--ifox-text-primary))]">تمكين الإصدارات</Label>
                          <p className="text-xs text-[hsl(var(--ifox-text-primary))]">حفظ إصدارات متعددة من المقالات</p>
                        </div>
                        <Switch
                          checked={localSettings.publishing.enableVersioning}
                          onCheckedChange={(v) => updateSetting(['publishing', 'enableVersioning'], v)}
                          data-testid="switch-enable-versioning"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Notifications Settings */}
                <TabsContent value="notifications">
                  <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-[hsl(var(--ifox-text-primary))]">
                        <Bell className="w-5 h-5 text-[hsl(var(--ifox-warning))]" />
                        إعدادات الإشعارات
                      </CardTitle>
                      <CardDescription className="text-[hsl(var(--ifox-text-primary))]">
                        تخصيص تلقي الإشعارات
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                        <div>
                          <Label className="text-[hsl(var(--ifox-text-primary))]">إشعارات البريد الإلكتروني</Label>
                          <p className="text-xs text-[hsl(var(--ifox-text-primary))]">استلام إشعارات عبر البريد</p>
                        </div>
                        <Switch
                          checked={localSettings.notifications.emailNotifications}
                          onCheckedChange={(v) => updateSetting(['notifications', 'emailNotifications'], v)}
                          data-testid="switch-email-notifications"
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                        <div>
                          <Label className="text-[hsl(var(--ifox-text-primary))]">الإشعارات الفورية</Label>
                          <p className="text-xs text-[hsl(var(--ifox-text-primary))]">استلام إشعارات فورية في المتصفح</p>
                        </div>
                        <Switch
                          checked={localSettings.notifications.pushNotifications}
                          onCheckedChange={(v) => updateSetting(['notifications', 'pushNotifications'], v)}
                          data-testid="switch-push-notifications"
                        />
                      </div>

                      <div className="space-y-3 pt-4 border-t border-[hsl(var(--ifox-surface-overlay)/.2)]">
                        <h3 className="font-semibold text-[hsl(var(--ifox-text-primary))]">أنواع الإشعارات</h3>
                        
                        <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                          <Label className="text-[hsl(var(--ifox-text-primary))]">عند النشر</Label>
                          <Switch
                            checked={localSettings.notifications.notifyOnPublish}
                            onCheckedChange={(v) => updateSetting(['notifications', 'notifyOnPublish'], v)}
                          />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                          <Label className="text-[hsl(var(--ifox-text-primary))]">عند التعليق</Label>
                          <Switch
                            checked={localSettings.notifications.notifyOnComment}
                            onCheckedChange={(v) => updateSetting(['notifications', 'notifyOnComment'], v)}
                          />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                          <Label className="text-[hsl(var(--ifox-text-primary))]">عند الإشارة</Label>
                          <Switch
                            checked={localSettings.notifications.notifyOnMention}
                            onCheckedChange={(v) => updateSetting(['notifications', 'notifyOnMention'], v)}
                          />
                        </div>
                      </div>

                      <div className="space-y-2 pt-4 border-t border-[hsl(var(--ifox-surface-overlay)/.2)]">
                        <Label className="text-[hsl(var(--ifox-text-primary))]">تكرار الملخص</Label>
                        <Select 
                          value={localSettings.notifications.digestFrequency}
                          onValueChange={(v: any) => updateSetting(['notifications', 'digestFrequency'], v)}
                        >
                          <SelectTrigger className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]" data-testid="select-digest-frequency">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">يومي</SelectItem>
                            <SelectItem value="weekly">أسبوعي</SelectItem>
                            <SelectItem value="never">أبداً</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Appearance Settings */}
                <TabsContent value="appearance">
                  <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-[hsl(var(--ifox-text-primary))]">
                        <Palette className="w-5 h-5 text-[hsl(var(--ifox-accent-primary))]" />
                        إعدادات المظهر
                      </CardTitle>
                      <CardDescription className="text-[hsl(var(--ifox-text-primary))]">
                        تخصيص شكل الواجهة
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-[hsl(var(--ifox-text-primary))]">السمة</Label>
                        <Select 
                          value={localSettings.appearance.theme}
                          onValueChange={(v: any) => updateSetting(['appearance', 'theme'], v)}
                        >
                          <SelectTrigger className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]" data-testid="select-theme">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="dark">داكن</SelectItem>
                            <SelectItem value="light">فاتح</SelectItem>
                            <SelectItem value="auto">تلقائي</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[hsl(var(--ifox-text-primary))]">حجم الخط</Label>
                        <Select 
                          value={localSettings.appearance.fontSize}
                          onValueChange={(v: any) => updateSetting(['appearance', 'fontSize'], v)}
                        >
                          <SelectTrigger className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]" data-testid="select-font-size">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="small">صغير</SelectItem>
                            <SelectItem value="medium">متوسط</SelectItem>
                            <SelectItem value="large">كبير</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                        <div>
                          <Label className="text-[hsl(var(--ifox-text-primary))]">دعم RTL</Label>
                          <p className="text-xs text-[hsl(var(--ifox-text-primary))]">دعم الاتجاه من اليمين لليسار</p>
                        </div>
                        <Switch
                          checked={localSettings.appearance.rtlSupport}
                          onCheckedChange={(v) => updateSetting(['appearance', 'rtlSupport'], v)}
                          data-testid="switch-rtl-support"
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                        <div>
                          <Label className="text-[hsl(var(--ifox-text-primary))]">إظهار الحركات</Label>
                          <p className="text-xs text-[hsl(var(--ifox-text-primary))]">تفعيل الرسوم المتحركة</p>
                        </div>
                        <Switch
                          checked={localSettings.appearance.showAnimations}
                          onCheckedChange={(v) => updateSetting(['appearance', 'showAnimations'], v)}
                          data-testid="switch-show-animations"
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                        <div>
                          <Label className="text-[hsl(var(--ifox-text-primary))]">الوضع المضغوط</Label>
                          <p className="text-xs text-[hsl(var(--ifox-text-primary))]">عرض أكثر كثافة للمحتوى</p>
                        </div>
                        <Switch
                          checked={localSettings.appearance.compactMode}
                          onCheckedChange={(v) => updateSetting(['appearance', 'compactMode'], v)}
                          data-testid="switch-compact-mode"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Media Settings */}
                <TabsContent value="media">
                  <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-[hsl(var(--ifox-text-primary))]">
                        <Image className="w-5 h-5 text-[hsl(var(--ifox-success))]" />
                        إعدادات الوسائط
                      </CardTitle>
                      <CardDescription className="text-[hsl(var(--ifox-text-primary))]">
                        إدارة رفع ومعالجة الملفات
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-[hsl(var(--ifox-text-primary))]">الحد الأقصى لحجم الملف (MB)</Label>
                        <Input
                          type="number"
                          value={localSettings.media.maxFileSize}
                          onChange={(e) => updateSetting(['media', 'maxFileSize'], parseInt(e.target.value))}
                          className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]"
                          data-testid="input-max-file-size"
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                        <div>
                          <Label className="text-[hsl(var(--ifox-text-primary))]">التحسين التلقائي</Label>
                          <p className="text-xs text-[hsl(var(--ifox-text-primary))]">ضغط وتحسين الصور تلقائياً</p>
                        </div>
                        <Switch
                          checked={localSettings.media.autoOptimize}
                          onCheckedChange={(v) => updateSetting(['media', 'autoOptimize'], v)}
                          data-testid="switch-auto-optimize"
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                        <div>
                          <Label className="text-[hsl(var(--ifox-text-primary))]">إنشاء الصور المصغرة</Label>
                          <p className="text-xs text-[hsl(var(--ifox-text-primary))]">توليد نسخ مصغرة تلقائياً</p>
                        </div>
                        <Switch
                          checked={localSettings.media.generateThumbnails}
                          onCheckedChange={(v) => updateSetting(['media', 'generateThumbnails'], v)}
                          data-testid="switch-generate-thumbnails"
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                        <div>
                          <Label className="text-[hsl(var(--ifox-text-primary))]">العلامة المائية</Label>
                          <p className="text-xs text-[hsl(var(--ifox-text-primary))]">إضافة علامة مائية للصور</p>
                        </div>
                        <Switch
                          checked={localSettings.media.watermark}
                          onCheckedChange={(v) => updateSetting(['media', 'watermark'], v)}
                          data-testid="switch-watermark"
                        />
                      </div>

                      {localSettings.media.watermark && (
                        <div className="space-y-2">
                          <Label className="text-[hsl(var(--ifox-text-primary))]">نص العلامة المائية</Label>
                          <Input
                            value={localSettings.media.watermarkText}
                            onChange={(e) => updateSetting(['media', 'watermarkText'], e.target.value)}
                            placeholder="سبق آي فوكس"
                            className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]"
                            data-testid="input-watermark-text"
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Security Settings */}
                <TabsContent value="security">
                  <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-[hsl(var(--ifox-text-primary))]">
                        <Shield className="w-5 h-5 text-[hsl(var(--ifox-error))]" />
                        إعدادات الأمان
                      </CardTitle>
                      <CardDescription className="text-[hsl(var(--ifox-text-primary))]">
                        تأمين الحساب والوصول
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.5)]">
                        <div>
                          <Label className="text-[hsl(var(--ifox-text-primary))]">المصادقة الثنائية</Label>
                          <p className="text-xs text-[hsl(var(--ifox-text-primary))]">طبقة أمان إضافية لتسجيل الدخول</p>
                        </div>
                        <Switch
                          checked={localSettings.security.twoFactorAuth}
                          onCheckedChange={(v) => updateSetting(['security', 'twoFactorAuth'], v)}
                          data-testid="switch-2fa"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[hsl(var(--ifox-text-primary))]">مهلة الجلسة (دقيقة)</Label>
                        <Input
                          type="number"
                          value={localSettings.security.sessionTimeout}
                          onChange={(e) => updateSetting(['security', 'sessionTimeout'], parseInt(e.target.value))}
                          className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]"
                          data-testid="input-session-timeout"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[hsl(var(--ifox-text-primary))]">محاولات تسجيل الدخول</Label>
                        <Input
                          type="number"
                          value={localSettings.security.loginAttempts}
                          onChange={(e) => updateSetting(['security', 'loginAttempts'], parseInt(e.target.value))}
                          className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]"
                          data-testid="input-login-attempts"
                        />
                        <p className="text-xs text-[hsl(var(--ifox-text-primary))]">عدد المحاولات قبل الحظر</p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[hsl(var(--ifox-text-primary))]">انتهاء صلاحية كلمة المرور (يوم)</Label>
                        <Input
                          type="number"
                          value={localSettings.security.passwordExpiry}
                          onChange={(e) => updateSetting(['security', 'passwordExpiry'], parseInt(e.target.value))}
                          className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]"
                          data-testid="input-password-expiry"
                        />
                      </div>

                      <div className="p-4 rounded-lg bg-[hsl(var(--ifox-warning)/.1)] border border-[hsl(var(--ifox-warning)/.3)]">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-[hsl(var(--ifox-warning))] flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-[hsl(var(--ifox-warning))]">تحذير أمني</p>
                            <p className="text-xs text-[hsl(var(--ifox-text-primary))] mt-1">
                              تأكد من تفعيل المصادقة الثنائية وتحديث كلمة المرور بانتظام لحماية حسابك
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </motion.div>
          </div>
      </div>
      </ScrollArea>
    </IFoxLayout>
  );
}
