import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Loader2,
  Copy,
  Check,
  Wand2,
  CheckCircle2,
  XCircle,
  Lightbulb,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type ToolBehavior = "none" | "proactive" | "conservative" | "parallel";
type ThinkingDepth = "none" | "low" | "medium" | "high" | "max";
type Provider = "anthropic" | "openai" | "gemini";

interface ChecklistItem {
  label: string;
  pass: boolean;
  note: string;
}

interface OptimizeResult {
  optimizedPrompt: string;
  score: number;
  checklist: ChecklistItem[];
  improvements: string[];
  explanation: string;
  provider: string;
  model: string;
}

const CONSTRAINT_OPTIONS: { id: string; label: string }[] = [
  { id: "no-overengineering", label: "تجنّب المبالغة في الهندسة (over-engineering)" },
  { id: "no-hallucination", label: "منع الهلوسة — لا يتكلم عن كود ما فتحه" },
  { id: "minimal-markdown", label: "تقليل الـMarkdown (نثر متدفق)" },
  { id: "no-preamble", label: "بلا مقدمات ('إليك...'، 'بناءً على...')" },
  { id: "plain-text-math", label: "رياضيات نص عادي (بدون LaTeX)" },
  { id: "ask-before-destructive", label: "استئذان قبل العمليات الخطرة/غير القابلة للتراجع" },
  { id: "cleanup-temp-files", label: "تنظيف الملفات المؤقتة بعد الانتهاء" },
];

const PRESETS: { id: string; label: string; values: Partial<FormState> }[] = [
  {
    id: "code-task",
    label: "مهمة كود في سبق",
    values: {
      role: "مهندس برمجيات خبير يعمل على مشروع سبق (React + Vite + Express + Drizzle)",
      outputFormat: "تعديلات كود مباشرة على الملفات مع شرح موجز للتغييرات",
      toolBehavior: "proactive",
      thinking: "medium",
      constraints: ["no-overengineering", "no-hallucination", "ask-before-destructive"],
    },
  },
  {
    id: "research",
    label: "بحث وتلخيص",
    values: {
      role: "باحث دقيق يجمع المعلومات من مصادر متعددة ويتحقق منها",
      outputFormat: "ملخص منظم مع ذكر المصادر ومستوى الثقة",
      toolBehavior: "none",
      thinking: "high",
      constraints: ["no-hallucination", "minimal-markdown"],
    },
  },
  {
    id: "writing",
    label: "كتابة محتوى عربي",
    values: {
      role: "محرّر عربي محترف بأسلوب واضح وجذاب",
      outputFormat: "نص نثري متدفق بالعربية الفصحى",
      toolBehavior: "none",
      thinking: "low",
      constraints: ["minimal-markdown", "no-preamble"],
    },
  },
];

interface FormState {
  rawPrompt: string;
  goal: string;
  role: string;
  context: string;
  outputFormat: string;
  examples: string;
  toolBehavior: ToolBehavior;
  thinking: ThinkingDepth;
  constraints: string[];
  targetModel: string;
  language: "ar" | "en";
  provider: Provider;
}

const INITIAL_FORM: FormState = {
  rawPrompt: "",
  goal: "",
  role: "",
  context: "",
  outputFormat: "",
  examples: "",
  toolBehavior: "none",
  thinking: "none",
  constraints: [],
  targetModel: "Claude Opus 4.8",
  language: "ar",
  provider: "anthropic",
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

interface PromptStudioPanelProps {
  /** endpoint to POST to (authenticated or public variant) */
  endpoint: string;
  /** extra fields merged into the request body (e.g. password) */
  extraBody?: Record<string, unknown>;
  /** show the built-in title header (default true) */
  showHeader?: boolean;
  /** called when the server rejects the shared password (HTTP 401) */
  onAuthError?: () => void;
}

export function PromptStudioPanel({
  endpoint,
  extraBody,
  showHeader = true,
  onAuthError,
}: PromptStudioPanelProps) {
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleConstraint = (id: string, checked: boolean) =>
    setForm((prev) => ({
      ...prev,
      constraints: checked
        ? [...prev.constraints, id]
        : prev.constraints.filter((c) => c !== id),
    }));

  const applyPreset = (values: Partial<FormState>) =>
    setForm((prev) => ({ ...prev, ...values }));

  const optimize = useMutation({
    mutationFn: async () =>
      apiRequest<OptimizeResult>(endpoint, {
        method: "POST",
        body: JSON.stringify({ ...form, ...(extraBody || {}) }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (data) => {
      setResult(data);
      toast({ title: "تم تحسين البرومبت", description: `النموذج: ${data.model}` });
    },
    onError: (error: Error) => {
      const isAuthError = /كلمة السر|401/.test(error.message);
      toast({
        title: isAuthError ? "كلمة السر غير صحيحة" : "تعذّر التحسين",
        description: error.message,
        variant: "destructive",
      });
      if (isAuthError) onAuthError?.();
    },
  });

  const handleCopy = async () => {
    if (!result?.optimizedPrompt) return;
    try {
      await navigator.clipboard.writeText(result.optimizedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "تعذّر النسخ", variant: "destructive" });
    }
  };

  const canSubmit = form.rawPrompt.trim().length >= 5 && !optimize.isPending;

  return (
    <div dir="rtl" className="space-y-6">
      {showHeader && (
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Wand2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">مختبر البرومبت</h1>
            <p className="text-sm text-muted-foreground">
              حسّن تعليماتك تلقائياً وفق دليل Anthropic الرسمي لهندسة البرومبت
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* المدخلات */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">المُدخلات</CardTitle>
            <CardDescription>اكتب برومبتك الخام وحدّد المتطلبات</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(p.values)}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rawPrompt">البرومبت الخام *</Label>
              <Textarea
                id="rawPrompt"
                rows={5}
                placeholder="اكتب البرومبت كما تكتبه عادةً..."
                value={form.rawPrompt}
                onChange={(e) => set("rawPrompt", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="goal">الهدف / المهمة</Label>
                <Input
                  id="goal"
                  placeholder="ماذا تريد إنجازه؟"
                  value={form.goal}
                  onChange={(e) => set("goal", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">الدور</Label>
                <Input
                  id="role"
                  placeholder="مثال: مهندس برمجيات خبير"
                  value={form.role}
                  onChange={(e) => set("role", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="context">السياق + لماذا يهم</Label>
              <Textarea
                id="context"
                rows={2}
                placeholder="اشرح السبب والخلفية لتحصل على نتائج أدق"
                value={form.context}
                onChange={(e) => set("context", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="outputFormat">صيغة المخرجات المطلوبة</Label>
              <Input
                id="outputFormat"
                placeholder="مثال: JSON / نثر / قائمة خطوات"
                value={form.outputFormat}
                onChange={(e) => set("outputFormat", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="examples">أمثلة (تُلَفّ تلقائياً بوسوم example)</Label>
              <Textarea
                id="examples"
                rows={2}
                placeholder="أمثلة few-shot اختيارية"
                value={form.examples}
                onChange={(e) => set("examples", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>سلوك الأدوات</Label>
                <Select
                  value={form.toolBehavior}
                  onValueChange={(v) => set("toolBehavior", v as ToolBehavior)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون توجيه</SelectItem>
                    <SelectItem value="proactive">مبادر (ينفّذ)</SelectItem>
                    <SelectItem value="conservative">متحفّظ (يقترح)</SelectItem>
                    <SelectItem value="parallel">استدعاء متوازٍ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>عمق التفكير</Label>
                <Select
                  value={form.thinking}
                  onValueChange={(v) => set("thinking", v as ThinkingDepth)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون توجيه</SelectItem>
                    <SelectItem value="low">منخفض</SelectItem>
                    <SelectItem value="medium">متوسط</SelectItem>
                    <SelectItem value="high">عالٍ</SelectItem>
                    <SelectItem value="max">أقصى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>قيود ومحاذير</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {CONSTRAINT_OPTIONS.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-start gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={form.constraints.includes(c.id)}
                      onCheckedChange={(checked) =>
                        toggleConstraint(c.id, checked === true)
                      }
                    />
                    <span className="leading-tight">{c.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="targetModel">النموذج المستهدف</Label>
                <Input
                  id="targetModel"
                  value={form.targetModel}
                  onChange={(e) => set("targetModel", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>لغة المخرجات</Label>
                <Select
                  value={form.language}
                  onValueChange={(v) => set("language", v as "ar" | "en")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">العربية</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>محرّك الذكاء</Label>
                <Select
                  value={form.provider}
                  onValueChange={(v) => set("provider", v as Provider)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anthropic">Claude (Anthropic)</SelectItem>
                    <SelectItem value="openai">GPT (OpenAI)</SelectItem>
                    <SelectItem value="gemini">Gemini (Google)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={!canSubmit}
              onClick={() => optimize.mutate()}
            >
              {optimize.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جارٍ التحسين...
                </>
              ) : (
                <>
                  <Sparkles className="ml-2 h-4 w-4" />
                  حسّن البرومبت
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* المخرجات */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">البرومبت المُحسَّن</CardTitle>
                <CardDescription>منظّم بوسوم XML وجاهز للنسخ</CardDescription>
              </div>
              {result?.optimizedPrompt && (
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <>
                      <Check className="ml-1.5 h-4 w-4" /> تم النسخ
                    </>
                  ) : (
                    <>
                      <Copy className="ml-1.5 h-4 w-4" /> نسخ
                    </>
                  )}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {result?.optimizedPrompt ? (
                <pre
                  dir="auto"
                  className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm leading-relaxed"
                >
                  {result.optimizedPrompt}
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
                  <Wand2 className="h-8 w-8 opacity-40" />
                  <p className="text-sm">
                    اكتب برومبتك واضغط «حسّن البرومبت» لرؤية النسخة المُحسَّنة هنا
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {result && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">تقييم البرومبت الأصلي</CardTitle>
                  <span className={`text-2xl font-bold ${scoreColor(result.score)}`}>
                    {result.score}%
                  </span>
                </div>
                <Progress value={result.score} className="mt-2" />
              </CardHeader>
              <CardContent className="space-y-4">
                {result.explanation && (
                  <p className="text-sm text-muted-foreground">{result.explanation}</p>
                )}

                {result.checklist.length > 0 && (
                  <div className="space-y-2">
                    {result.checklist.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        {item.pass ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                        ) : (
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                        )}
                        <div>
                          <span className="font-medium">{item.label}</span>
                          {item.note && (
                            <span className="text-muted-foreground"> — {item.note}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {result.improvements.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      اقتراحات التحسين
                    </div>
                    <ul className="list-disc space-y-1 pr-5 text-sm text-muted-foreground">
                      {result.improvements.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge variant="secondary">{result.provider}</Badge>
                  <Badge variant="outline">{result.model}</Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
