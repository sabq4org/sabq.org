import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import {
  Bell,
  Mail,
  MessageSquare,
  Save,
  Send,
  Loader2,
  CheckCircle2,
  Settings,
  Phone,
  AlertCircle,
  Plus,
  Trash2
} from "lucide-react";

interface EditorAlertSettings {
  enabled: boolean;
  email?: string;
  whatsappNumber?: string;
  whatsappNumbers?: string[];
  emailEnabled: boolean;
  whatsappEnabled: boolean;
}

const SectionHeader = ({ title, color }: { title: string; color: string }) => (
  <div className="flex items-center gap-3 px-1">
    <div className={`h-8 w-1 ${color} rounded-full`}></div>
    <h3 className="text-lg font-bold text-foreground">{title}</h3>
  </div>
);

export default function EditorAlertsSettings() {
  useRoleProtection('admin');
  const { toast } = useToast();
  
  const [settings, setSettings] = useState<EditorAlertSettings>({
    enabled: false,
    email: "",
    whatsappNumbers: [],
    emailEnabled: true,
    whatsappEnabled: true,
  });
  
  const [newNumber, setNewNumber] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  const { data: serverSettings, isLoading } = useQuery<EditorAlertSettings>({
    queryKey: ["/api/admin/editor-alerts/settings"],
  });

  useEffect(() => {
    if (serverSettings) {
      const numbers = serverSettings.whatsappNumbers || 
        (serverSettings.whatsappNumber ? [serverSettings.whatsappNumber] : []);
      setSettings({
        ...serverSettings,
        whatsappNumbers: numbers,
      });
    }
  }, [serverSettings]);

  const saveMutation = useMutation({
    mutationFn: async (data: EditorAlertSettings) => {
      return await apiRequest('/api/admin/editor-alerts/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/editor-alerts/settings"] });
      setHasChanges(false);
      toast({
        title: "تم الحفظ",
        description: "تم حفظ إعدادات التنبيهات بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في حفظ الإعدادات",
        variant: "destructive",
      });
    }
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/editor-alerts/test', {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      if (data.success) {
        const whatsappCount = data.whatsappSentCount || (data.whatsappSent ? 1 : 0);
        toast({
          title: "تم الإرسال",
          description: `تم إرسال رسالة التجربة${data.emailSent ? " (بريد)" : ""}${whatsappCount > 0 ? ` (واتساب: ${whatsappCount} رسالة)` : ""}`,
        });
      } else {
        toast({
          title: "تحذير",
          description: data.errors?.join(", ") || "فشل في إرسال الرسالة",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في إرسال رسالة التجربة",
        variant: "destructive",
      });
    }
  });

  const handleChange = (key: keyof EditorAlertSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const addWhatsAppNumber = () => {
    const trimmed = newNumber.trim();
    if (!trimmed) return;
    
    if (!trimmed.startsWith('+')) {
      toast({
        title: "تنبيه",
        description: "يجب أن يبدأ الرقم بـ + (مثال: +966500000000)",
        variant: "destructive",
      });
      return;
    }
    
    const currentNumbers = settings.whatsappNumbers || [];
    if (currentNumbers.includes(trimmed)) {
      toast({
        title: "تنبيه",
        description: "هذا الرقم مضاف مسبقاً",
        variant: "destructive",
      });
      return;
    }
    
    handleChange("whatsappNumbers", [...currentNumbers, trimmed]);
    setNewNumber("");
  };

  const removeWhatsAppNumber = (numberToRemove: string) => {
    const currentNumbers = settings.whatsappNumbers || [];
    handleChange("whatsappNumbers", currentNumbers.filter(n => n !== numberToRemove));
  };

  const handleSave = () => {
    if (settings.enabled) {
      const hasEmailChannel = settings.emailEnabled && settings.email;
      const hasWhatsAppChannel = settings.whatsappEnabled && (settings.whatsappNumbers?.length || 0) > 0;
      if (!hasEmailChannel && !hasWhatsAppChannel) {
        toast({
          title: "تحذير",
          description: "يجب تفعيل قناة واحدة على الأقل (بريد أو واتساب) مع إدخال البيانات",
          variant: "destructive",
        });
        return;
      }
    }
    saveMutation.mutate(settings);
  };

  const handleTest = () => {
    testMutation.mutate();
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  const whatsappNumbers = settings.whatsappNumbers || [];

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6" dir="rtl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-950/50">
              <Bell className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">تنبيهات رئيس التحرير</h1>
              <p className="text-muted-foreground text-sm mt-1">
                إرسال إشعارات فورية عند نشر الأخبار الجديدة
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saveMutation.isPending}
              className="gap-2"
              data-testid="button-save"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              حفظ الإعدادات
            </Button>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={!settings.enabled || testMutation.isPending}
              className="gap-2"
              data-testid="button-test"
            >
              {testMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              تجربة
            </Button>
          </div>
        </div>

        <Card className="hover-elevate transition-all bg-slate-50 dark:bg-card">
          <CardContent className="p-6">
            <SectionHeader title="الإعدادات العامة" color="bg-amber-500" />
            
            <div className="mt-6 flex items-center justify-between p-4 rounded-lg bg-background border">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-md bg-amber-500/20">
                  <Settings className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <Label className="text-base font-medium">تفعيل التنبيهات</Label>
                  <p className="text-sm text-muted-foreground">
                    إرسال تنبيهات تلقائية عند نشر أي خبر جديد
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) => handleChange("enabled", checked)}
                data-testid="switch-alerts-enabled"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-all bg-blue-50 dark:bg-card">
          <CardContent className="p-6">
            <SectionHeader title="قناة البريد الإلكتروني" color="bg-blue-500" />
            
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-background border">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-md bg-blue-500/20">
                    <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <Label className="text-base font-medium">تفعيل البريد الإلكتروني</Label>
                    <p className="text-sm text-muted-foreground">
                      إرسال إشعارات عبر البريد الإلكتروني
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.emailEnabled}
                  onCheckedChange={(checked) => handleChange("emailEnabled", checked)}
                  data-testid="switch-email-enabled"
                />
              </div>
              
              <div className="px-4">
                <Label className="text-sm font-medium mb-2 block">عنوان البريد الإلكتروني</Label>
                <Input
                  type="email"
                  placeholder="editor@example.com"
                  value={settings.email || ""}
                  onChange={(e) => handleChange("email", e.target.value)}
                  disabled={!settings.emailEnabled}
                  className="max-w-md"
                  dir="ltr"
                  data-testid="input-email"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-all bg-green-50 dark:bg-card">
          <CardContent className="p-6">
            <SectionHeader title="قناة واتساب" color="bg-green-500" />
            
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-background border">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-md bg-green-500/20">
                    <Phone className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <Label className="text-base font-medium">تفعيل واتساب</Label>
                    <p className="text-sm text-muted-foreground">
                      إرسال إشعارات عبر واتساب لأرقام متعددة
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.whatsappEnabled}
                  onCheckedChange={(checked) => handleChange("whatsappEnabled", checked)}
                  data-testid="switch-whatsapp-enabled"
                />
              </div>
              
              <div className="px-4 space-y-3">
                <Label className="text-sm font-medium block">أرقام واتساب</Label>
                
                {whatsappNumbers.length > 0 && (
                  <div className="space-y-2">
                    {whatsappNumbers.map((number, index) => (
                      <div 
                        key={number} 
                        className="flex items-center gap-2 p-2 rounded-md bg-background border max-w-md"
                        data-testid={`whatsapp-number-${index}`}
                      >
                        <MessageSquare className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span dir="ltr" className="flex-1 text-sm font-mono">{number}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeWhatsAppNumber(number)}
                          disabled={!settings.whatsappEnabled}
                          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
                          data-testid={`button-remove-whatsapp-${index}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex gap-2 max-w-md">
                  <Input
                    type="tel"
                    placeholder="+966500000000"
                    value={newNumber}
                    onChange={(e) => setNewNumber(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addWhatsAppNumber()}
                    disabled={!settings.whatsappEnabled}
                    dir="ltr"
                    data-testid="input-new-whatsapp"
                  />
                  <Button
                    variant="outline"
                    onClick={addWhatsAppNumber}
                    disabled={!settings.whatsappEnabled || !newNumber.trim()}
                    className="gap-1 flex-shrink-0"
                    data-testid="button-add-whatsapp"
                  >
                    <Plus className="h-4 w-4" />
                    إضافة
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  الرقم بصيغة دولية مع رمز الدولة (مثال: +966564255999)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {settings.enabled && (
          <Card className="hover-elevate transition-all bg-emerald-50 dark:bg-card border-emerald-200 dark:border-border">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-md bg-emerald-500/20">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-emerald-700 dark:text-emerald-300">التنبيهات مفعّلة</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    سيتم إرسال تنبيه تلقائي عند نشر أي خبر جديد إلى:
                  </p>
                  <ul className="mt-3 space-y-2">
                    {settings.emailEnabled && settings.email && (
                      <li className="flex items-center gap-2 text-sm bg-background rounded-md p-2 border">
                        <Mail className="h-4 w-4 text-blue-500" />
                        <span dir="ltr">{settings.email}</span>
                      </li>
                    )}
                    {settings.whatsappEnabled && whatsappNumbers.map((number, index) => (
                      <li key={number} className="flex items-center gap-2 text-sm bg-background rounded-md p-2 border">
                        <MessageSquare className="h-4 w-4 text-green-500" />
                        <span dir="ltr">{number}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!settings.enabled && (
          <Card className="hover-elevate transition-all bg-orange-50 dark:bg-card border-orange-200 dark:border-border">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-md bg-orange-500/20">
                  <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h3 className="font-bold text-orange-700 dark:text-orange-300">التنبيهات معطّلة</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    لن يتم إرسال أي تنبيهات عند نشر الأخبار الجديدة. قم بتفعيل التنبيهات من الأعلى.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
