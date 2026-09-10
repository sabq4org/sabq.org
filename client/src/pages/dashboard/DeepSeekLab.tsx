/**
 * مختبر DeepSeek — صفحة تجريبية لقياس النموذج على برومبت التحرير
 *
 * لا تمس مسار النشر: المخرج يُعرض فقط، ويقارَن اختياريًا بمحرر سبق الحالي.
 * البرومبت المخصص يُحفظ محليًا في المتصفح (localStorage) لا في القاعدة.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import DOMPurify from "isomorphic-dompurify";
import {
  Check,
  Copy,
  FlaskConical,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl } from "@/lib/queryClient";

type DeepSeekModel = "deepseek-flash" | "deepseek-v4-pro";

interface StatusResponse {
  configured: boolean;
  balance: { available: boolean; totalUsd: number | null } | null;
  balanceError: string | null;
  models: DeepSeekModel[];
  tasks: { type: string; label: string }[];
  sabqModel: string;
}

interface DeepSeekResult {
  content: string;
  reasoningExcerpt: string | null;
  parsed: Record<string, unknown> | null;
  model: string;
  latencyMs: number;
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
  };
  estimatedCostUsd: number;
  truncated: boolean;
}

interface SabqResult {
  headline: string;
  altHeadlines: string[];
  body: string;
  editorNotes: string[];
  sources: { title: string; url: string }[];
  pushText: string | null;
  riskFlags: string[];
  meta: {
    provider: string;
    modelId: string;
    fallbackUsed: boolean;
    latencyMs: number;
  };
}

interface RunResponse {
  deepseek: DeepSeekResult | { error: string };
  sabq: { ok: boolean; error?: string; result?: SabqResult } | null;
  sabqModel: string;
}

const PROMPT_STORAGE_KEY = "deepseek-lab:systemPrompt";
const MATERIAL_STORAGE_KEY = "deepseek-lab:material";

function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // التخزين المحلي قد يكون معطلاً — الصفحة تعمل بدونه
  }
}

const numberAr = (n: number) => n.toLocaleString("ar-SA");

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-2 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // بعض المتصفحات تمنع الحافظة بلا إيماءة — نتجاهل
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "نُسخ" : "نسخ"}
    </Button>
  );
}

/** يعرض مخرجًا تحريريًا منظمًا (headline/body/...) أو نصًا خامًا إن لم يكن JSON */
function EditorialOutput({
  parsed,
  raw,
}: {
  parsed: Record<string, unknown> | null;
  raw: string;
}) {
  const headline = typeof parsed?.headline === "string" ? parsed.headline : "";
  const body = typeof parsed?.body === "string" ? parsed.body : "";
  const hasStructure = Boolean(parsed && (headline || body));

  if (!hasStructure) {
    return (
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7">
        {raw || "— لا مخرج —"}
      </pre>
    );
  }

  const strList = (key: string): string[] =>
    Array.isArray(parsed?.[key])
      ? (parsed![key] as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
  const altHeadlines = strList("altHeadlines");
  const editorNotes = strList("editorNotes");
  const riskFlags = strList("riskFlags");
  const pushText = typeof parsed?.pushText === "string" ? parsed.pushText : "";
  const sources = Array.isArray(parsed?.sources)
    ? (parsed!.sources as { title?: string; url?: string }[]).filter(
        (s) => s && typeof s.title === "string" && typeof s.url === "string",
      )
    : [];

  return (
    <div className="space-y-4 text-sm">
      {headline ? (
        <h3 className="text-lg font-bold leading-8">{headline}</h3>
      ) : null}
      {altHeadlines.length ? (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-muted-foreground">عناوين بديلة</div>
          <ul className="list-disc space-y-0.5 pr-5">
            {altHeadlines.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {body ? (
        /^\s*</.test(body) ? (
          // المتن يأتي HTML (p/h3) كما يتوقعه المحرر — نعرضه معقمًا
          <div
            className="prose prose-sm max-w-none break-words leading-7 dark:prose-invert [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-bold"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(body, {
                ALLOWED_TAGS: ["p", "h2", "h3", "h4", "ul", "ol", "li", "strong", "em", "b", "i", "br", "blockquote", "a"],
                ALLOWED_ATTR: ["href", "target", "rel"],
              }),
            }}
          />
        ) : (
          <div className="whitespace-pre-wrap break-words leading-7">{body}</div>
        )
      ) : null}
      {pushText ? (
        <div className="rounded-md border border-dashed p-2">
          <div className="text-xs font-semibold text-muted-foreground">نص الإشعار</div>
          <div>{pushText}</div>
        </div>
      ) : null}
      {riskFlags.length ? (
        <div className="flex flex-wrap gap-1">
          {riskFlags.map((f, i) => (
            <Badge key={i} variant="destructive" className="font-normal">
              {f}
            </Badge>
          ))}
        </div>
      ) : null}
      {editorNotes.length ? (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-muted-foreground">ملاحظات المحرر</div>
          <ul className="list-disc space-y-0.5 pr-5 text-muted-foreground">
            {editorNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {sources.length ? (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-muted-foreground">المصادر</div>
          <ul className="list-disc space-y-0.5 pr-5">
            {sources.map((s, i) => (
              <li key={i}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default function DeepSeekLab() {
  useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  const [task, setTask] = useState("edit");
  const [model, setModel] = useState<DeepSeekModel>("deepseek-flash");
  const [thinking, setThinking] = useState(false);
  const [jsonMode, setJsonMode] = useState(true);
  const [compareWithSabq, setCompareWithSabq] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [material, setMaterial] = useState(() => readStorage(MATERIAL_STORAGE_KEY));
  const [material2, setMaterial2] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(() => readStorage(PROMPT_STORAGE_KEY));
  const [promptIsCustom, setPromptIsCustom] = useState(
    () => readStorage(PROMPT_STORAGE_KEY).length > 0,
  );
  const [result, setResult] = useState<RunResponse | null>(null);

  const statusQuery = useQuery<StatusResponse>({
    queryKey: ["/api/deepseek-lab/status"],
    queryFn: () => apiRequest<StatusResponse>(apiUrl("/api/deepseek-lab/status")),
    staleTime: 60_000,
  });

  const defaultPromptQuery = useQuery<{ task: string; systemPrompt: string }>({
    queryKey: ["/api/deepseek-lab/default-prompt", task],
    queryFn: () =>
      apiRequest(apiUrl(`/api/deepseek-lab/default-prompt?task=${encodeURIComponent(task)}`)),
    staleTime: Infinity,
  });

  // بلا برومبت مخصص محفوظ: نعبّئ الافتراضي للمهمة المختارة كلما وصل
  useEffect(() => {
    if (!promptIsCustom && defaultPromptQuery.data?.systemPrompt) {
      setSystemPrompt(defaultPromptQuery.data.systemPrompt);
    }
  }, [defaultPromptQuery.data, promptIsCustom]);

  useEffect(() => {
    writeStorage(MATERIAL_STORAGE_KEY, material);
  }, [material]);

  const status = statusQuery.data;
  const tasks = Array.isArray(status?.tasks) ? status!.tasks : [];
  const models: DeepSeekModel[] = Array.isArray(status?.models)
    ? status!.models
    : ["deepseek-flash", "deepseek-v4-pro"];

  const run = useMutation({
    mutationFn: async () =>
      apiRequest<RunResponse>(apiUrl("/api/deepseek-lab/run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          model,
          thinking,
          jsonMode,
          compareWithSabq,
          material,
          material2: task === "merge" ? material2 : undefined,
          instructions: instructions || undefined,
          systemPrompt: promptIsCustom ? systemPrompt : undefined,
        }),
      }),
    onSuccess: (data) => {
      setResult(data);
      statusQuery.refetch();
      if ("error" in data.deepseek) {
        toast({ title: "DeepSeek فشل", description: data.deepseek.error, variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "تعذر تشغيل التجربة", description: error.message, variant: "destructive" });
    },
  });

  const handlePromptChange = (value: string) => {
    setSystemPrompt(value);
    setPromptIsCustom(true);
    writeStorage(PROMPT_STORAGE_KEY, value);
  };

  const restoreDefaultPrompt = () => {
    setPromptIsCustom(false);
    writeStorage(PROMPT_STORAGE_KEY, "");
    if (defaultPromptQuery.data?.systemPrompt) {
      setSystemPrompt(defaultPromptQuery.data.systemPrompt);
    }
  };

  const canRun =
    Boolean(status?.configured) &&
    material.trim().length >= 20 &&
    (task !== "merge" || material2.trim().length > 0) &&
    !run.isPending;

  const deepseek = result?.deepseek ?? null;
  const deepseekOk = deepseek && !("error" in deepseek) ? deepseek : null;
  const sabq = result?.sabq?.result ?? null;

  const balanceText = useMemo(() => {
    if (!status?.configured) return null;
    if (status.balanceError) return "الرصيد غير متاح";
    if (status.balance?.totalUsd == null) return null;
    return `$${status.balance.totalUsd.toFixed(2)}`;
  }, [status]);

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={FlaskConical}
          title="مختبر DeepSeek"
          description="جرّب نماذج DeepSeek على برومبت التحرير قبل أي ربط — المخرج للعرض فقط ولا يمس النشر"
        />

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {statusQuery.isLoading ? (
            <Badge variant="outline">جارٍ فحص المفتاح…</Badge>
          ) : status?.configured ? (
            <Badge variant="outline" className="border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">المفتاح مضبوط</Badge>
          ) : (
            <Badge variant="destructive">DEEPSEEK_API_KEY غير مضبوط في متغيرات البيئة</Badge>
          )}
          {balanceText ? <MetaChip label="الرصيد" value={balanceText} /> : null}
          {status?.sabqModel ? (
            <MetaChip label="نموذج محرر سبق الحالي" value={status.sabqModel} />
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ===== المدخلات ===== */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">المدخلات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>المهمة</Label>
                  <Select value={task} onValueChange={setTask}>
                    <SelectTrigger className="h-9" data-testid="select-task">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(tasks.length ? tasks : [{ type: "edit", label: "حرر" }]).map((t) => (
                        <SelectItem key={t.type} value={t.type}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>النموذج</Label>
                  <Select value={model} onValueChange={(v) => setModel(v as DeepSeekModel)}>
                    <SelectTrigger className="h-9" data-testid="select-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m === "deepseek-flash" ? "DeepSeek V4.1 Flash (أرخص)" : "DeepSeek V4 Pro"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
                  <span>وضع التفكير</span>
                  <Switch className="no-min-touch-size" checked={thinking} onCheckedChange={setThinking} />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
                  <span>إخراج JSON</span>
                  <Switch className="no-min-touch-size" checked={jsonMode} onCheckedChange={setJsonMode} />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
                  <span>قارن بمحرر سبق</span>
                  <Switch className="no-min-touch-size" checked={compareWithSabq} onCheckedChange={setCompareWithSabq} />
                </label>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ds-instructions">توجيه المحرر (اختياري)</Label>
                <Textarea
                  id="ds-instructions"
                  rows={2}
                  placeholder="زاوية مطلوبة، تركيز عنوان، جمهور…"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ds-material">المادة الخام</Label>
                <Textarea
                  id="ds-material"
                  rows={10}
                  placeholder="الصق البيان أو التغريدة أو الخبر الخام هنا…"
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  data-testid="textarea-material"
                />
              </div>

              {task === "merge" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="ds-material2">المادة الثانية</Label>
                  <Textarea
                    id="ds-material2"
                    rows={6}
                    value={material2}
                    onChange={(e) => setMaterial2(e.target.value)}
                  />
                </div>
              ) : null}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ds-prompt">
                    برومبت النظام{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {promptIsCustom ? "(مخصص — محفوظ في هذا المتصفح)" : "(الافتراضي لمحرر سبق)"}
                    </span>
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={restoreDefaultPrompt}
                    disabled={!promptIsCustom}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    استرجاع الافتراضي
                  </Button>
                </div>
                <Textarea
                  id="ds-prompt"
                  rows={10}
                  className="text-xs leading-6"
                  value={systemPrompt}
                  onChange={(e) => handlePromptChange(e.target.value)}
                  placeholder={defaultPromptQuery.isLoading ? "جارٍ تحميل البرومبت الافتراضي…" : ""}
                  data-testid="textarea-system-prompt"
                />
                <p className="text-xs text-muted-foreground">
                  الافتراضي يطلب JSON بحقول headline/body/editorNotes. إن لصقت برومبتًا حرًا
                  فأطفئ «إخراج JSON» وسيُعرض نص النموذج كما هو.
                </p>
              </div>

              <Button
                type="button"
                className="w-full gap-2"
                disabled={!canRun}
                onClick={() => run.mutate()}
                data-testid="button-run"
              >
                {run.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {run.isPending ? "جارٍ التشغيل…" : "شغّل التجربة"}
              </Button>
            </CardContent>
          </Card>

          {/* ===== المخرجات ===== */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    مخرج DeepSeek
                    {deepseekOk ? (
                      <span className="mr-2 text-xs font-normal text-muted-foreground">
                        {deepseekOk.model}
                      </span>
                    ) : null}
                  </CardTitle>
                  {deepseekOk ? <CopyButton text={deepseekOk.content} /> : null}
                </div>
                {deepseekOk ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <MetaChip label="الزمن" value={`${(deepseekOk.latencyMs / 1000).toFixed(1)} ث`} />
                    <MetaChip label="إدخال" value={numberAr(deepseekOk.usage.inputTokens)} />
                    <MetaChip label="إخراج" value={numberAr(deepseekOk.usage.outputTokens)} />
                    {deepseekOk.usage.reasoningTokens ? (
                      <MetaChip label="تفكير" value={numberAr(deepseekOk.usage.reasoningTokens)} />
                    ) : null}
                    <MetaChip label="التكلفة" value={`$${deepseekOk.estimatedCostUsd.toFixed(4)}`} />
                    {deepseekOk.truncated ? (
                      <Badge variant="destructive">مبتور (max_tokens)</Badge>
                    ) : null}
                  </div>
                ) : null}
              </CardHeader>
              <CardContent>
                {run.isPending ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    ينتظر رد النموذج…
                  </div>
                ) : deepseek && "error" in deepseek ? (
                  <p className="text-sm text-destructive">{deepseek.error}</p>
                ) : deepseekOk ? (
                  <div className="space-y-4">
                    <EditorialOutput parsed={deepseekOk.parsed} raw={deepseekOk.content} />
                    {deepseekOk.reasoningExcerpt ? (
                      <details className="rounded-md border bg-muted/30 p-2 text-xs">
                        <summary className="cursor-pointer font-semibold">
                          مقتطف التفكير (للاطلاع)
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap break-words font-sans leading-6 text-muted-foreground">
                          {deepseekOk.reasoningExcerpt}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    الصق مادة واضغط «شغّل التجربة»
                  </p>
                )}
              </CardContent>
            </Card>

            {compareWithSabq || result?.sabq ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      محرر سبق الحالي
                      {sabq ? (
                        <span className="mr-2 text-xs font-normal text-muted-foreground">
                          {sabq.meta.modelId}
                          {sabq.meta.fallbackUsed ? " (بديل)" : ""}
                        </span>
                      ) : null}
                    </CardTitle>
                    {sabq ? <CopyButton text={`${sabq.headline}\n\n${sabq.body}`} /> : null}
                  </div>
                  {sabq ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <MetaChip label="الزمن" value={`${(sabq.meta.latencyMs / 1000).toFixed(1)} ث`} />
                    </div>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {run.isPending ? (
                    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      ينتظر رد محرر سبق…
                    </div>
                  ) : result?.sabq && !result.sabq.ok ? (
                    <p className="text-sm text-destructive">{result.sabq.error}</p>
                  ) : sabq ? (
                    <EditorialOutput parsed={sabq as unknown as Record<string, unknown>} raw={sabq.body} />
                  ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      سيُشغَّل بالتوازي مع DeepSeek على المادة نفسها
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
