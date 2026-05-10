import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Save, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Provider = "openai" | "elevenlabs" | "google";

interface Voice {
  voice_id: string;
  name: string;
  description?: string;
}

interface ProvidersResponse {
  providers: Array<{ name: Provider; configured: boolean; charLimit: number | null; costPer1MChars: number | null }>;
  settings: {
    primaryProvider: Provider;
    fallbackProviders: Provider[];
    defaultVoices: { ar?: string; en?: string; ur?: string };
    defaultTone?: string;
  };
}

const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI (gpt-4o-mini-tts)",
  elevenlabs: "ElevenLabs",
  google: "Google Cloud TTS",
};

function VoicePicker({
  language,
  voiceId,
  onChange,
}: {
  language: "ar" | "en" | "ur";
  voiceId: string | undefined;
  onChange: (v: string) => void;
}) {
  const { data: openaiVoices } = useQuery<{ voices: Voice[] }>({
    queryKey: ["/api/audio-newsletters/voices", { provider: "openai" }],
  });
  const { data: elevenVoices } = useQuery<{ voices: Voice[] }>({
    queryKey: ["/api/audio-newsletters/voices", { provider: "elevenlabs" }],
  });
  const { data: googleVoices } = useQuery<{ voices: Voice[] }>({
    queryKey: ["/api/audio-newsletters/voices", { provider: "google" }],
  });

  const all = [
    ...(openaiVoices?.voices || []).map(v => ({ ...v, provider: "OpenAI" as const })),
    ...(elevenVoices?.voices || []).map(v => ({ ...v, provider: "ElevenLabs" as const })),
    ...(googleVoices?.voices || []).map(v => ({ ...v, provider: "Google" as const })),
  ];

  return (
    <Select value={voiceId} onValueChange={onChange}>
      <SelectTrigger data-testid={`select-default-voice-${language}`}>
        <SelectValue placeholder="اختر صوتاً افتراضياً" />
      </SelectTrigger>
      <SelectContent className="max-h-[400px]">
        {all.map(v => (
          <SelectItem key={`${v.provider}-${v.voice_id}`} value={v.voice_id}>
            <span className="font-medium">{v.name}</span>
            <span className="text-xs text-muted-foreground mr-2">({v.provider})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function AudioNewsletterTtsSettings() {
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  const { data, isLoading } = useQuery<ProvidersResponse>({
    queryKey: ["/api/audio-newsletters/providers"],
  });

  const [primaryProvider, setPrimaryProvider] = useState<Provider>("elevenlabs");
  const [fallbackProviders, setFallbackProviders] = useState<Provider[]>(["openai", "google"]);
  const [defaultVoices, setDefaultVoices] = useState<{ ar?: string; en?: string; ur?: string }>({});
  const [defaultTone, setDefaultTone] = useState("");

  useEffect(() => {
    if (data?.settings) {
      setPrimaryProvider(data.settings.primaryProvider);
      setFallbackProviders(data.settings.fallbackProviders || []);
      setDefaultVoices(data.settings.defaultVoices || {});
      setDefaultTone(data.settings.defaultTone || "");
    }
  }, [data?.settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/audio-newsletters/tts-settings", {
        method: "PATCH",
        body: JSON.stringify({
          primaryProvider,
          fallbackProviders: fallbackProviders.filter(p => p !== primaryProvider),
          defaultVoices,
          defaultTone: defaultTone || undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audio-newsletters/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audio-newsletters/tts-settings"] });
      toast({ title: "تم الحفظ", description: "تم تحديث إعدادات TTS" });
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message || "فشل الحفظ", variant: "destructive" });
    },
  });

  if (isUserLoading || !user) {
    return <DashboardLayout><Skeleton className="h-96" /></DashboardLayout>;
  }
  if (!hasRole(user, "admin", "system_admin")) {
    return (
      <DashboardLayout>
        <Card><CardHeader><CardTitle>غير مصرح</CardTitle></CardHeader>
          <CardContent>هذه الصفحة متاحة للمدراء فقط.</CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const allProviders: Provider[] = ["openai", "elevenlabs", "google"];

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold" data-testid="heading-tts-settings">إعدادات نظام TTS</h1>
            <p className="text-sm text-muted-foreground mt-1">
              تحديد المزود الأساسي ومزودي الاحتياط والأصوات الافتراضية لكل لغة
            </p>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-96" />
        ) : (
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>حالة المزودين</CardTitle>
                <CardDescription>المزودون المتاحون حالياً في النظام</CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-4">
                {data?.providers.map(p => (
                  <div key={p.name} className="border rounded-md p-4 space-y-2" data-testid={`card-provider-${p.name}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{PROVIDER_LABELS[p.name]}</span>
                      <Badge variant={p.configured ? "default" : "outline"}>
                        {p.configured ? "مفعّل" : "غير مفعّل"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      حد الأحرف: {p.charLimit ?? "—"} • التكلفة: ${p.costPer1MChars?.toFixed(2) ?? "—"} / مليون حرف
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>المزود الأساسي ومزودي الاحتياط</CardTitle>
                <CardDescription>
                  يُجرَّب الأساسي أولاً؛ في حال الفشل يتم التحول إلى مزود الاحتياط بالترتيب.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>المزود الأساسي</Label>
                  <Select value={primaryProvider} onValueChange={(v: Provider) => setPrimaryProvider(v)}>
                    <SelectTrigger data-testid="select-primary-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allProviders.map(p => (
                        <SelectItem key={p} value={p}>{PROVIDER_LABELS[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label>مزودو الاحتياط (بالترتيب)</Label>
                  <div className="space-y-2">
                    {allProviders.filter(p => p !== primaryProvider).map(p => (
                      <label key={p} className="flex items-center gap-3 border rounded-md p-3 hover-elevate cursor-pointer">
                        <Checkbox
                          checked={fallbackProviders.includes(p)}
                          onCheckedChange={(checked) => {
                            setFallbackProviders(prev =>
                              checked ? [...prev.filter(x => x !== p), p] : prev.filter(x => x !== p)
                            );
                          }}
                          data-testid={`checkbox-fallback-${p}`}
                        />
                        <span>{PROVIDER_LABELS[p]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>الأصوات الافتراضية لكل لغة</CardTitle>
                <CardDescription>
                  تُستخدم عند إنشاء نشرة جديدة دون اختيار صوت محدد
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(["ar", "en", "ur"] as const).map(lang => (
                  <div key={lang} className="space-y-2">
                    <Label>
                      {lang === "ar" ? "العربية" : lang === "en" ? "الإنجليزية" : "الأردية"}
                    </Label>
                    <VoicePicker
                      language={lang}
                      voiceId={defaultVoices[lang]}
                      onChange={(v) => setDefaultVoices(prev => ({ ...prev, [lang]: v }))}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>نبرة الصوت الافتراضية (OpenAI فقط)</CardTitle>
                <CardDescription>
                  يمكن تمرير تعليمات نبرة افتراضية لمزود OpenAI، مثل "اقرأ بصوت جدّي ومحايد".
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={defaultTone}
                  onChange={(e) => setDefaultTone(e.target.value)}
                  placeholder="مثال: اقرأ النشرة بصوت إخباري واضح ومحايد..."
                  rows={3}
                  data-testid="input-default-tone"
                />
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                data-testid="button-save-tts-settings"
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Save className="h-4 w-4 ml-2" />}
                حفظ الإعدادات
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
