import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2, Save, Settings as SettingsIcon, PlayCircle, CheckCircle2,
  Circle, Search, Volume2, BarChart3, AlertTriangle, Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type Provider = "openai" | "elevenlabs" | "google";
type Lang = "ar" | "en" | "ur";

interface Voice {
  voice_id: string;
  name: string;
  description?: string;
  gender?: string;
  accent?: string;
  age?: string;
  use_case?: string;
  recommended?: boolean;
}

interface ProvidersResponse {
  providers: Array<{
    name: Provider;
    configured: boolean;
    charLimit: number | null;
    costPer1MChars: number | null;
  }>;
  settings: {
    primaryProvider: Provider;
    fallbackProviders: Provider[];
    defaultVoices: { ar?: string; en?: string; ur?: string };
    defaultTone?: string;
  };
}

interface UsageStats {
  days: number;
  byProvider: Array<{
    provider: Provider;
    count: number;
    successCount: number;
    successRate: number;
    totalChars: number;
    estimatedCostUsd: number;
    avgDurationMs: number;
  }>;
  totals: { count: number; totalChars: number; estimatedCostUsd: number };
}

const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI",
  elevenlabs: "ElevenLabs",
  google: "Google Cloud",
};

const PROVIDER_HINTS: Record<Provider, string> = {
  openai: "gpt-4o-mini-tts — متعدد اللغات مع تعليمات نبرة",
  elevenlabs: "أصوات عربية/سعودية بشرية عالية الجودة",
  google: "WaveNet عربي — تكلفة أقل واستقرار عالٍ",
};

const LANG_LABELS: Record<Lang, string> = {
  ar: "العربية",
  en: "الإنجليزية",
  ur: "الأردية",
};

const ACCENT_LABELS: Record<string, string> = {
  saudi: "سعودي",
  gulf: "خليجي",
  msa: "فصحى",
  kuwaiti: "كويتي",
  egyptian: "مصري",
  multilingual: "متعدد",
};

const SAMPLE_TEXT: Record<Lang, string> = {
  ar: "مرحباً بكم في نشرة سبق. نقرأ لكم أبرز الأخبار اليوم بصوت واضح وطبيعي.",
  en: "Welcome to Sabq audio briefing. Here are today's top stories.",
  ur: "سبق کی آڈیو بریفنگ میں خوش آمدید۔ آج کی اہم خبریں یہ ہیں۔",
};

function accentLabel(accent?: string) {
  if (!accent) return null;
  return ACCENT_LABELS[accent] || accent;
}

function genderLabel(gender?: string) {
  if (gender === "male") return "رجالي";
  if (gender === "female") return "نسائي";
  if (gender === "neutral") return "محايد";
  return null;
}

function VoicePicker({
  language,
  voiceId,
  onChange,
  primaryProvider,
}: {
  language: Lang;
  voiceId: string | undefined;
  onChange: (v: string) => void;
  primaryProvider: Provider;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<"all" | Provider>("all");
  const [accentFilter, setAccentFilter] = useState<"all" | "saudi" | "gulf" | "msa" | "other">("all");
  const [testingId, setTestingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: openaiVoices, isLoading: loadingOpenAI } = useQuery<{ voices: Voice[]; configured?: boolean }>({
    queryKey: ["/api/audio-newsletters/voices", { provider: "openai" }],
  });
  const { data: elevenVoices, isLoading: loadingEleven } = useQuery<{ voices: Voice[]; configured?: boolean }>({
    queryKey: ["/api/audio-newsletters/voices", { provider: "elevenlabs" }],
  });
  const { data: googleVoices, isLoading: loadingGoogle } = useQuery<{ voices: Voice[]; configured?: boolean }>({
    queryKey: ["/api/audio-newsletters/voices", { provider: "google" }],
  });

  const isLoading = loadingOpenAI || loadingEleven || loadingGoogle;

  const all = useMemo(() => {
    const rows: Array<Voice & { provider: Provider; providerLabel: string }> = [
      ...(openaiVoices?.voices || []).map(v => ({ ...v, provider: "openai" as const, providerLabel: "OpenAI" })),
      ...(elevenVoices?.voices || []).map(v => ({ ...v, provider: "elevenlabs" as const, providerLabel: "ElevenLabs" })),
      ...(googleVoices?.voices || []).map(v => ({ ...v, provider: "google" as const, providerLabel: "Google" })),
    ];
    // Deduplicate by voice_id (keep first — curated ElevenLabs listed before overlaps)
    const seen = new Set<string>();
    return rows.filter(v => {
      if (!v.voice_id || seen.has(v.voice_id)) return false;
      seen.add(v.voice_id);
      return true;
    });
  }, [openaiVoices, elevenVoices, googleVoices]);

  const selected = all.find(v => v.voice_id === voiceId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(v => {
      if (providerFilter !== "all" && v.provider !== providerFilter) return false;
      if (accentFilter === "saudi" && v.accent !== "saudi") return false;
      if (accentFilter === "gulf" && v.accent !== "gulf" && v.accent !== "kuwaiti") return false;
      if (accentFilter === "msa" && v.accent !== "msa") return false;
      if (accentFilter === "other" && ["saudi", "gulf", "kuwaiti", "msa"].includes(v.accent || "")) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        (v.description || "").toLowerCase().includes(q) ||
        (v.accent || "").toLowerCase().includes(q) ||
        v.providerLabel.toLowerCase().includes(q)
      );
    }).sort((a, b) => {
      // Recommended + matching primary provider first for Arabic
      const score = (v: typeof a) =>
        (v.recommended ? 4 : 0) +
        (v.provider === primaryProvider ? 2 : 0) +
        (v.accent === "saudi" ? 2 : v.accent === "gulf" || v.accent === "kuwaiti" ? 1 : 0);
      return score(b) - score(a);
    });
  }, [all, search, providerFilter, accentFilter, primaryProvider]);

  const testMutation = useMutation({
    mutationFn: async (voice: Voice & { provider: Provider }) => {
      return apiRequest("/api/audio-newsletters/voices/test", {
        method: "POST",
        body: JSON.stringify({
          voiceId: voice.voice_id,
          provider: voice.provider,
          language,
          sampleText: SAMPLE_TEXT[language],
        }),
      });
    },
    onSuccess: (data) => {
      setTestingId(null);
      if (data?.audio) {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        const audio = new Audio(data.audio);
        audioRef.current = audio;
        void audio.play().catch(() => {
          toast({ title: "تعذر التشغيل", description: "تم التوليد لكن المتصفح منع التشغيل التلقائي", variant: "destructive" });
        });
      }
      toast({ title: "تم الاختبار", description: `المزود: ${PROVIDER_LABELS[(data?.provider as Provider) || "elevenlabs"]}` });
    },
    onError: (err: Error) => {
      setTestingId(null);
      toast({ title: "فشل اختبار الصوت", description: err.message || "حاول مرة أخرى", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {selected && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3" data-testid={`selected-voice-${language}`}>
          <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{selected.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selected.providerLabel}
              {accentLabel(selected.accent) ? ` · ${accentLabel(selected.accent)}` : ""}
              {genderLabel(selected.gender) ? ` · ${genderLabel(selected.gender)}` : ""}
            </p>
          </div>
          <Badge variant="default">محدد</Badge>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو اللهجة أو الوصف..."
            className="pr-9"
            data-testid={`input-voice-search-${language}`}
          />
        </div>
        <Select value={providerFilter} onValueChange={(v) => setProviderFilter(v as "all" | Provider)}>
          <SelectTrigger className="w-full sm:w-[160px]" data-testid={`select-provider-filter-${language}`}>
            <SelectValue placeholder="المزود" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المزودين</SelectItem>
            <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="google">Google</SelectItem>
          </SelectContent>
        </Select>
        {language === "ar" && (
          <Select value={accentFilter} onValueChange={(v) => setAccentFilter(v as typeof accentFilter)}>
            <SelectTrigger className="w-full sm:w-[140px]" data-testid={`select-accent-filter-${language}`}>
              <SelectValue placeholder="اللهجة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل اللهجات</SelectItem>
              <SelectItem value="saudi">سعودي</SelectItem>
              <SelectItem value="gulf">خليجي</SelectItem>
              <SelectItem value="msa">فصحى</SelectItem>
              <SelectItem value="other">أخرى</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} صوت
        {language === "ar" ? " — الموصى بها سعودية/خليجية تظهر أولاً" : ""}
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[480px] overflow-y-auto pe-1">
        {filtered.map((voice) => {
          const isSelected = voiceId === voice.voice_id;
          const isTesting = testingId === voice.voice_id;
          return (
            <div
              key={`${voice.provider}-${voice.voice_id}`}
              className={cn(
                "flex flex-col gap-3 p-3 border-2 rounded-lg transition-colors",
                isSelected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30",
              )}
              data-testid={`voice-card-${language}-${voice.voice_id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-sm leading-snug line-clamp-2">{voice.name}</h4>
                  {voice.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{voice.description}</p>
                  )}
                </div>
                {isSelected ? (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px]">{voice.providerLabel}</Badge>
                {voice.recommended && (
                  <Badge className="text-[10px] gap-1">
                    <Sparkles className="h-3 w-3" />
                    موصى به
                  </Badge>
                )}
                {accentLabel(voice.accent) && (
                  <Badge variant="secondary" className="text-[10px]">{accentLabel(voice.accent)}</Badge>
                )}
                {genderLabel(voice.gender) && (
                  <Badge variant="secondary" className="text-[10px]">{genderLabel(voice.gender)}</Badge>
                )}
              </div>

              <div className="flex gap-2 mt-auto">
                <Button
                  type="button"
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => onChange(voice.voice_id)}
                  data-testid={`button-pick-voice-${language}-${voice.voice_id}`}
                >
                  {isSelected ? "محدد" : "اختيار"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isTesting || testMutation.isPending}
                  onClick={() => {
                    setTestingId(voice.voice_id);
                    testMutation.mutate(voice);
                  }}
                  data-testid={`button-test-voice-${language}-${voice.voice_id}`}
                  title="استماع لعينة"
                >
                  {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-8">
            لا توجد أصوات مطابقة للبحث
          </div>
        )}
      </div>
    </div>
  );
}

export default function AudioNewsletterTtsSettings() {
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  const { data, isLoading } = useQuery<ProvidersResponse>({
    queryKey: ["/api/audio-newsletters/providers"],
  });

  const { data: stats } = useQuery<UsageStats>({
    queryKey: ["/api/audio-newsletters/tts-usage-stats", { days: "7" }],
  });

  const [primaryProvider, setPrimaryProvider] = useState<Provider>("elevenlabs");
  const [fallbackProviders, setFallbackProviders] = useState<Provider[]>(["openai", "google"]);
  const [defaultVoices, setDefaultVoices] = useState<{ ar?: string; en?: string; ur?: string }>({});
  const [defaultTone, setDefaultTone] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.settings) {
      setPrimaryProvider(data.settings.primaryProvider);
      setFallbackProviders(data.settings.fallbackProviders || []);
      setDefaultVoices(data.settings.defaultVoices || {});
      setDefaultTone(data.settings.defaultTone || "");
      setDirty(false);
    }
  }, [data?.settings]);

  const markDirty = () => setDirty(true);

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
      setDirty(false);
      toast({ title: "تم الحفظ", description: "تم تحديث إعدادات TTS بنجاح" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الحفظ", description: err.message || "فشل الحفظ", variant: "destructive" });
    },
  });

  if (isUserLoading || !user) {
    return <DashboardLayout><Skeleton className="h-96" /></DashboardLayout>;
  }
  if (!hasRole(user, "admin", "system_admin")) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader><CardTitle>غير مصرح</CardTitle></CardHeader>
          <CardContent>هذه الصفحة متاحة للمدراء فقط.</CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const allProviders: Provider[] = ["openai", "elevenlabs", "google"];
  const configuredCount = data?.providers.filter(p => p.configured).length ?? 0;
  const weekSuccess = stats?.byProvider.length
    ? Math.round(
        (stats.byProvider.reduce((s, p) => s + p.successCount, 0) /
          Math.max(1, stats.byProvider.reduce((s, p) => s + p.count, 0))) * 100,
      )
    : null;

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <SettingsIcon className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-3xl font-bold" data-testid="heading-tts-settings">إعدادات نظام TTS</h1>
              <p className="text-sm text-muted-foreground mt-1">
                المزودون، الأصوات الافتراضية، واختبار الجودة — مع تركيز على الأصوات السعودية
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/audio-newsletters/tts-stats">
              <Button variant="outline" type="button">
                <BarChart3 className="h-4 w-4 ml-2" />
                الإحصائيات
              </Button>
            </Link>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !dirty}
              data-testid="button-save-tts-settings"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Save className="h-4 w-4 ml-2" />}
              {dirty ? "حفظ التغييرات" : "محفوظ"}
            </Button>
          </div>
        </div>

        {dirty && (
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            لديك تغييرات غير محفوظة
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-96" />
        ) : (
          <div className="grid gap-6">
            {/* KPI strip */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-muted-foreground">المزودون المفعّلون</p>
                  <p className="text-2xl font-bold mt-1" data-testid="kpi-configured-providers">
                    {configuredCount}/{allProviders.length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-muted-foreground">المزود الأساسي</p>
                  <p className="text-2xl font-bold mt-1">{PROVIDER_LABELS[primaryProvider]}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-muted-foreground">توليدات آخر 7 أيام</p>
                  <p className="text-2xl font-bold mt-1">{stats?.totals.count ?? "—"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-muted-foreground">نسبة النجاح (7 أيام)</p>
                  <p className="text-2xl font-bold mt-1">
                    {weekSuccess != null ? `${weekSuccess}%` : "—"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Provider status */}
            <Card>
              <CardHeader>
                <CardTitle>حالة المزودين</CardTitle>
                <CardDescription>مؤشرات التفعيل والتكلفة التقريبية لكل مزود</CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-4">
                {data?.providers.map(p => {
                  const usage = stats?.byProvider.find(u => u.provider === p.name);
                  const isPrimary = primaryProvider === p.name;
                  return (
                    <div
                      key={p.name}
                      className={cn(
                        "rounded-lg border p-4 space-y-3",
                        isPrimary && "border-primary/50 bg-primary/5",
                      )}
                      data-testid={`card-provider-${p.name}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{PROVIDER_LABELS[p.name]}</span>
                        <div className="flex items-center gap-1.5">
                          {isPrimary && <Badge>أساسي</Badge>}
                          <Badge variant={p.configured ? "default" : "outline"}>
                            {p.configured ? "مفعّل" : "غير مفعّل"}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{PROVIDER_HINTS[p.name]}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">حد الأحرف</p>
                          <p className="font-medium">{p.charLimit ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">التكلفة / مليون</p>
                          <p className="font-medium">${p.costPer1MChars?.toFixed(2) ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">استخدام أسبوعي</p>
                          <p className="font-medium">{usage?.count ?? 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">نجاح</p>
                          <p className="font-medium">
                            {usage ? `${Math.round(usage.successRate)}%` : "—"}
                          </p>
                        </div>
                      </div>
                      {!p.configured && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          أضف مفتاح API في بيئة الخادم
                        </p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Provider priority */}
            <Card>
              <CardHeader>
                <CardTitle>المزود الأساسي ومزودو الاحتياط</CardTitle>
                <CardDescription>
                  يُجرَّب الأساسي أولاً؛ عند الفشل يتم التحول إلى الاحتياط بالترتيب.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>المزود الأساسي</Label>
                  <Select
                    value={primaryProvider}
                    onValueChange={(v: Provider) => {
                      setPrimaryProvider(v);
                      markDirty();
                    }}
                  >
                    <SelectTrigger data-testid="select-primary-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allProviders.map(p => (
                        <SelectItem key={p} value={p}>
                          {PROVIDER_LABELS[p]} — {PROVIDER_HINTS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label>مزودو الاحتياط</Label>
                  <div className="space-y-2">
                    {allProviders.filter(p => p !== primaryProvider).map(p => (
                      <label
                        key={p}
                        className="flex items-center gap-3 border rounded-md p-3 hover-elevate cursor-pointer"
                      >
                        <Checkbox
                          checked={fallbackProviders.includes(p)}
                          onCheckedChange={(checked) => {
                            setFallbackProviders(prev =>
                              checked ? [...prev.filter(x => x !== p), p] : prev.filter(x => x !== p),
                            );
                            markDirty();
                          }}
                          data-testid={`checkbox-fallback-${p}`}
                        />
                        <div>
                          <span className="font-medium">{PROVIDER_LABELS[p]}</span>
                          <p className="text-xs text-muted-foreground">{PROVIDER_HINTS[p]}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Default voices */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Volume2 className="h-5 w-5" />
                  الأصوات الافتراضية لكل لغة
                </CardTitle>
                <CardDescription>
                  تُستخدم عند إنشاء نشرة دون اختيار صوت محدد. للعربية نوصي بأصوات سعودية من ElevenLabs.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="ar" dir="rtl">
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    {(["ar", "en", "ur"] as const).map(lang => (
                      <TabsTrigger key={lang} value={lang} data-testid={`tab-voice-lang-${lang}`}>
                        {LANG_LABELS[lang]}
                        {defaultVoices[lang] ? (
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-primary" />
                        ) : null}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {(["ar", "en", "ur"] as const).map(lang => (
                    <TabsContent key={lang} value={lang} className="mt-0">
                      <VoicePicker
                        language={lang}
                        voiceId={defaultVoices[lang]}
                        primaryProvider={primaryProvider}
                        onChange={(v) => {
                          setDefaultVoices(prev => ({ ...prev, [lang]: v }));
                          markDirty();
                        }}
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>

            {/* Tone */}
            <Card>
              <CardHeader>
                <CardTitle>نبرة الصوت الافتراضية (OpenAI فقط)</CardTitle>
                <CardDescription>
                  تعليمات نبرة طبيعية لمزود OpenAI، مثل «اقرأ بصوت جدّي ومحايد».
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={defaultTone}
                  onChange={(e) => {
                    setDefaultTone(e.target.value);
                    markDirty();
                  }}
                  placeholder="مثال: اقرأ النشرة بصوت إخباري واضح ومحايد..."
                  rows={3}
                  data-testid="input-default-tone"
                />
              </CardContent>
            </Card>

            <div className="flex justify-end sticky bottom-4">
              <Button
                size="lg"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !dirty}
                className="shadow-lg"
                data-testid="button-save-tts-settings-bottom"
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Save className="h-4 w-4 ml-2" />}
                {dirty ? "حفظ الإعدادات" : "لا توجد تغييرات"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
