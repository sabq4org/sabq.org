import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Download, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import {
  INFOGRAPHIC_STUDIO_STEP_LABELS,
  type InfographicStudioJob,
  type InfographicStudioRequest,
  type InfographicStudioResult,
  type InfographicStudioStep,
} from "@shared/infographicStudio";

export interface InfographicStudioApply {
  infographicUrl: string;
  bannerUrl: string;
  headline: string;
  bodyHtml: string;
}

interface InfographicStudioCardProps {
  articleId?: string | null;
  title: string;
  content: string;
  disabled?: boolean;
  onApply: (result: InfographicStudioApply) => void;
}

const VISIBLE_STEPS: InfographicStudioStep[] = ["brief", "images", "render", "upload"];
const JOB_ID = /^[0-9a-f-]{36}$/i;
const JOB_NOT_FOUND = "العملية غير موجودة.";

function htmlToText(html: string): string {
  return html
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function plainLength(html: string): number {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().length;
}

/**
 * «إنفو للموقع»: from the story's own text the server builds the vertical infographic, the 16:9
 * front image, a headline and a short text. The editor reviews and applies; nothing is published.
 * Layout approved by the editor-in-chief on 2026-11-07 (four states: idle, working, result, failure).
 */
export function InfographicStudioCard({ articleId, title, content, disabled, onApply }: InfographicStudioCardProps) {
  const storageKey = `infographic-studio-job-${articleId || "new"}`;
  const [jobId, setJobId] = useState<string | null>(null);
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [applied, setApplied] = useState(false);
  const shownResult = useRef<string | null>(null);
  const prevKey = useRef<string | null>(null);
  const jobIdRef = useRef<string | null>(null);
  jobIdRef.current = jobId;

  useEffect(() => {
    const from = prevKey.current;
    prevKey.current = storageKey;
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(storageKey);
    } catch {
      /* optional */
    }
    // A new story gets its permanent id from the first autosave; keep the running job with it.
    if (!stored && from?.endsWith("-new") && jobIdRef.current) {
      stored = jobIdRef.current;
      try {
        sessionStorage.setItem(storageKey, stored);
        sessionStorage.removeItem(from);
      } catch {
        /* optional */
      }
    }
    setJobId(stored && JOB_ID.test(stored) ? stored : null);
  }, [storageKey]);

  const capabilities = useQuery<{ configured: boolean }>({
    queryKey: ["/api/infographic-studio/capabilities"],
    queryFn: () => apiRequest("/api/infographic-studio/capabilities"),
    staleTime: 60_000,
    retry: false,
  });

  const status = useQuery<InfographicStudioJob>({
    queryKey: ["/api/infographic-studio/jobs", jobId],
    queryFn: () => apiRequest(`/api/infographic-studio/jobs/${jobId}`),
    enabled: Boolean(jobId),
    // A network error or 503 does not stop the job on the server: keep polling the same job.
    // Only an explicit 404 lets the card forget it.
    refetchInterval: (query) =>
      (query.state.data && query.state.data.status !== "processing") || query.state.error?.message === JOB_NOT_FOUND ? false : 3000,
    retry: false,
  });

  const start = useMutation({
    mutationFn: (input: InfographicStudioRequest): Promise<InfographicStudioJob> =>
      apiRequest("/api/infographic-studio/jobs", { method: "POST", body: JSON.stringify(input) }),
    retry: false,
    onSuccess: (job) => setJobId(job.id),
  });

  const job = status.data;
  const result: InfographicStudioResult | null = job?.status === "completed" ? job.result : null;

  useEffect(() => {
    if (result && shownResult.current !== job?.id) {
      shownResult.current = job?.id ?? null;
      setHeadline(result.headline);
      setBody(htmlToText(result.bodyHtml));
      setApplied(false);
    }
  }, [result, job?.id]);

  const jobMissing = status.isError && (status.error as Error).message === JOB_NOT_FOUND;
  const working = start.isPending || (Boolean(jobId) && (!job || job.status === "processing") && !jobMissing);
  const pollTrouble = working && status.isError;
  const failedMessage =
    (start.error as Error | null)?.message ||
    (job?.status === "failed" ? job.error || "تعذر إكمال الإنفوجرافيك. حاول مجددًا." : null) ||
    (jobMissing ? "لم نعد نجد هذه العملية. ابدأ تصميمًا جديدًا." : null);
  const notConfigured = capabilities.data?.configured === false;
  const tooShort = plainLength(content) < 80 || title.trim().length < 5;

  function run() {
    const requestId = crypto.randomUUID();
    try {
      sessionStorage.setItem(storageKey, requestId);
    } catch {
      /* Recovery after a reload is optional. */
    }
    shownResult.current = null;
    setApplied(false);
    setJobId(null);
    start.mutate({ requestId, articleId: articleId || null, title: title.trim(), content });
  }

  function reset() {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* optional */
    }
    start.reset();
    setJobId(null);
  }

  const stepIndex = job ? VISIBLE_STEPS.indexOf(job.step) : -1;
  const percent = job?.step === "queued" || !job ? 5 : Math.round(((stepIndex + 0.5) / VISIBLE_STEPS.length) * 100);

  return (
    <Card data-testid="card-infographic-studio">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              إنفو للموقع
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {result
                ? `جاهز للمراجعة${result.metaphor ? ` · الفكرة: ${result.metaphor}` : ""}`
                : working
                  ? "جارٍ التصميم… يمكنك مواصلة التحرير."
                  : "من نص الخبر: إنفو عمودي، صورة واجهة عرضية، عنوان، ونص قصير."}
            </p>
          </div>
          {!result && !failedMessage && (
            <Button
              type="button"
              size="sm"
              onClick={run}
              disabled={disabled || working || tooShort || notConfigured}
              data-testid="button-infographic-studio-run"
            >
              {working ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Sparkles className="ml-2 h-4 w-4" />}
              {working ? "قيد العمل" : "صمّم من نص الخبر"}
            </Button>
          )}
          {failedMessage && (
            <Button type="button" size="sm" variant="outline" onClick={reset} data-testid="button-infographic-studio-retry">
              <RefreshCw className="ml-2 h-4 w-4" />
              حاول مجددًا
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!working && !result && !failedMessage && (
          <p className="text-xs text-muted-foreground">
            {notConfigured
              ? "خدمة صور GPT غير مفعّلة على الخادم."
              : tooShort
                ? "اكتب عنوان الخبر ونصه أولًا (80 حرفًا على الأقل)."
                : "يحتاج الخبر رقمين على الأقل. كل رقم يُنقل من النص كما هو. المدة نحو 3 دقائق."}
          </p>
        )}

        {working && (
          <div className="space-y-3" role="status" aria-live="polite" data-testid="infographic-studio-progress">
            <Progress value={percent} className="h-1.5" />
            {pollTrouble && <p className="text-xs text-amber-700 dark:text-amber-300">تعذر جلب الحالة مؤقتًا، نعيد المحاولة…</p>}
            <ol className="space-y-2">
              {VISIBLE_STEPS.map((step, i) => {
                const done = stepIndex > i;
                const now = stepIndex === i;
                return (
                  <li key={step} className={`flex items-center gap-2.5 text-sm ${now ? "font-semibold" : done ? "" : "text-muted-foreground"}`}>
                    <span
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                        done ? "border-emerald-600 bg-emerald-600 text-white" : now ? "border-primary" : "border-border"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" /> : now ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : null}
                    </span>
                    {INFOGRAPHIC_STUDIO_STEP_LABELS[step]}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {failedMessage && (
          <p className="text-sm text-destructive" role="alert" data-testid="infographic-studio-error">
            {failedMessage}
          </p>
        )}

        {result && (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,9fr)_minmax(0,16fr)]" data-testid="infographic-studio-result">
            <a href={result.infographicUrl} target="_blank" rel="noreferrer" className="block max-w-[240px] sm:max-w-none">
              <img
                src={result.infographicUrl}
                alt="الإنفوجرافيك العمودي"
                className="aspect-[9/16] w-full rounded-lg border object-cover"
                data-testid="img-infographic-studio-vertical"
              />
            </a>
            <div className="min-w-0 space-y-3">
              <a href={result.bannerUrl} target="_blank" rel="noreferrer" className="block">
                <img
                  src={result.bannerUrl}
                  alt="صورة الواجهة العرضية"
                  className="aspect-video w-full rounded-lg border object-cover"
                  data-testid="img-infographic-studio-wide"
                />
              </a>
              {result.figures.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.figures.map((f) => (
                    <span key={`${f.value}-${f.label}`} className="rounded-full border px-2.5 py-0.5 text-xs">
                      <bdi className="font-bold">{f.value}</bdi> {f.label}
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="infographic-studio-headline" className="text-xs text-muted-foreground">
                  العنوان
                </Label>
                <Input id="infographic-studio-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="infographic-studio-body" className="text-xs text-muted-foreground">
                  النص
                </Label>
                <Textarea id="infographic-studio-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
              {result.warnings.map((w) => (
                <div key={w} className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ملاحظة الفحص: {w}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled || !headline.trim()}
                  onClick={() => {
                    onApply({ infographicUrl: result.infographicUrl, bannerUrl: result.bannerUrl, headline: headline.trim(), bodyHtml: textToHtml(body) });
                    setApplied(true);
                  }}
                  data-testid="button-infographic-studio-apply"
                >
                  <Check className="ml-2 h-4 w-4" />
                  {applied ? "طُبّق على الخبر" : "تطبيق على الخبر"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={run} disabled={disabled || working} data-testid="button-infographic-studio-rerun">
                  <RefreshCw className="ml-2 h-4 w-4" />
                  إعادة التصميم
                </Button>
                <Button type="button" size="sm" variant="ghost" asChild>
                  <a href={result.infographicUrl} target="_blank" rel="noreferrer" download>
                    <Download className="ml-2 h-4 w-4" />
                    العمودي
                  </a>
                </Button>
                <Button type="button" size="sm" variant="ghost" asChild>
                  <a href={result.bannerUrl} target="_blank" rel="noreferrer" download>
                    <Download className="ml-2 h-4 w-4" />
                    العرضي
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                «تطبيق على الخبر» يضع العمودي صورةً للإنفوجرافيك والعرضي صورةً للواجهة، ويستبدل العنوان ونص الخبر. يبقى الخبر مسودة حتى تنشره.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
