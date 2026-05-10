import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Mic, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Provider = "openai" | "elevenlabs" | "google";
interface Voice { voice_id: string; name: string; description?: string; }

interface CompareResult {
  provider: Provider;
  configured: boolean;
  success: boolean;
  voiceId?: string;
  durationMs?: number;
  estimatedCostUsd?: number;
  audio?: string;
  error?: string;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI (gpt-4o-mini-tts)",
  elevenlabs: "ElevenLabs",
  google: "Google Cloud TTS",
};

const DEFAULT_TEXT = "مرحباً، هذا اختبار مقارنة بين مزودي الصوت الثلاثة. سنقرأ لكم أهم الأخبار من سبق اليوم.";

function VoiceSelector({ provider, value, onChange }: { provider: Provider; value: string; onChange: (v: string) => void }) {
  const { data, isLoading } = useQuery<{ voices: Voice[] }>({
    queryKey: ["/api/audio-newsletters/voices", { provider }],
  });
  if (isLoading) return <Skeleton className="h-9" />;
  const voices = data?.voices || [];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={`select-compare-voice-${provider}`}>
        <SelectValue placeholder="اختر الصوت" />
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {voices.map(v => (
          <SelectItem key={v.voice_id} value={v.voice_id}>{v.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function AudioNewsletterVoiceCompare() {
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  const [text, setText] = useState(DEFAULT_TEXT);
  const [language, setLanguage] = useState<"ar" | "en" | "ur">("ar");
  const [voices, setVoices] = useState<{ openai?: string; elevenlabs?: string; google?: string }>({});
  const [tone, setTone] = useState("");
  const [results, setResults] = useState<CompareResult[]>([]);

  const compareMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/audio-newsletters/voices/compare", {
        method: "POST",
        body: JSON.stringify({
          sampleText: text,
          language,
          voices,
          tone: tone || undefined,
        }),
      });
    },
    onSuccess: (data) => {
      setResults(data.results || []);
      toast({ title: "تمت المقارنة", description: "تم توليد العينات الصوتية للمزودين الثلاثة" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message || "فشل توليد المقارنة", variant: "destructive" });
    },
  });

  if (isUserLoading || !user) return <DashboardLayout><Skeleton className="h-96" /></DashboardLayout>;
  if (!hasRole(user, "admin", "system_admin")) {
    return (
      <DashboardLayout>
        <Card><CardHeader><CardTitle>غير مصرح</CardTitle></CardHeader>
          <CardContent>هذه الصفحة متاحة للمدراء فقط.</CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center gap-3">
          <Mic className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold" data-testid="heading-voice-compare">مقارنة الأصوات</h1>
            <p className="text-sm text-muted-foreground mt-1">
              قارن نفس النص بين OpenAI و ElevenLabs و Google جنباً إلى جنب
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>إعدادات المقارنة</CardTitle>
            <CardDescription>اختر النص واللغة والصوت لكل مزود</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>النص التجريبي</Label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder="اكتب النص الذي تريد مقارنته..."
                data-testid="input-compare-text"
              />
              <p className="text-xs text-muted-foreground">
                {text.length.toLocaleString("ar-SA")} حرف
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>اللغة</Label>
                <Select value={language} onValueChange={(v) => setLanguage(v as "ar" | "en" | "ur")}>
                  <SelectTrigger data-testid="select-compare-language"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">العربية</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ur">اردو</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>نبرة OpenAI (اختياري)</Label>
                <Textarea
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  rows={1}
                  placeholder="مثال: اقرأ بصوت جدّي ومحايد"
                  data-testid="input-compare-tone"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {(["openai", "elevenlabs", "google"] as Provider[]).map(p => (
                <div key={p} className="space-y-2">
                  <Label>{PROVIDER_LABELS[p]}</Label>
                  <VoiceSelector
                    provider={p}
                    value={voices[p] || ""}
                    onChange={(v) => setVoices(prev => ({ ...prev, [p]: v }))}
                  />
                </div>
              ))}
            </div>

            <Button
              onClick={() => compareMutation.mutate()}
              disabled={compareMutation.isPending || !text.trim()}
              data-testid="button-run-compare"
              className="w-full"
            >
              {compareMutation.isPending ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <PlayCircle className="h-4 w-4 ml-2" />}
              توليد المقارنة
            </Button>
          </CardContent>
        </Card>

        {results.length > 0 && (
          <div className="grid md:grid-cols-3 gap-4">
            {results.map(r => (
              <Card key={r.provider} data-testid={`compare-result-${r.provider}`}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg">{PROVIDER_LABELS[r.provider]}</CardTitle>
                    <Badge variant={r.success ? "default" : "destructive"}>
                      {r.success ? "نجح" : "فشل"}
                    </Badge>
                  </div>
                  {r.voiceId && (
                    <CardDescription className="text-xs font-mono">{r.voiceId}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {r.success && r.audio ? (
                    <>
                      <audio controls src={r.audio} className="w-full" data-testid={`audio-${r.provider}`} />
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">الزمن</span>
                        <span className="font-medium">{((r.durationMs || 0) / 1000).toFixed(2)} ث</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">التكلفة التقديرية</span>
                        <span className="font-medium">${(r.estimatedCostUsd || 0).toFixed(6)}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-destructive" data-testid={`error-${r.provider}`}>
                      {r.error || (r.configured ? "فشل بدون رسالة" : "المزود غير مفعّل")}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
