// «محرر سبق» — واجهة نظام التحرير الموحد بالذكاء الاصطناعي داخل محرر المقالات.
// تستهلك POST /api/editorial-ai/task (docs/editorial-ai-unified-system-plan-2026-08-03.md).
// المخرج مسودة دائماً: لا شيء يُطبق على المقال إلا بضغطة تطبيق صريحة من المحرر.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Check,
  Loader2,
  NotebookPen,
  AlertTriangle,
  Link2,
  BellRing,
  Languages,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { sanitizeEditorialAiResult } from "@/lib/sanitizeEditorialAiResult";

type EditorialTaskType =
  | "edit"
  | "develop"
  | "merge"
  | "review"
  | "report"
  | "profile"
  | "app_version"
  | "precheck";

interface EditorialTaskResult {
  headline: string;
  altHeadlines: string[];
  body: string;
  editorNotes: string[];
  sources: { title: string; url: string }[];
  pushText: string | null;
  enVersion: { headline: string; body: string; pushText: string } | null;
  riskFlags: string[];
  meta: {
    task: EditorialTaskType;
    modelId: string;
    fallbackUsed: boolean;
    verificationRecommended: boolean;
  };
}

const TASK_LABELS: Record<EditorialTaskType, { label: string; hint: string }> = {
  edit: { label: "حرر", hint: "تحويل مادة خام (بيان/تغريدة/ترجمة) إلى خبر بمعيار سبق" },
  develop: { label: "طوّر", hint: "إثراء مادة ناقصة — يوصى بإرفاق سياق تحقق" },
  merge: { label: "ادمج", hint: "دمج مادتين عن الحدث نفسه بعد التحقق أنهما حدث واحد" },
  review: { label: "راجع", hint: "قائمة تصويبات محددة دون إعادة كتابة" },
  report: { label: "تقرير", hint: "قراءة مشهد معمقة ببنية وتحليل موسوم" },
  profile: { label: "بروفايل", hint: "خبر الحدث + سيرة بمحطات مؤرخة" },
  app_version: { label: "نسخة التطبيق", hint: "نسخة مختصرة + إشعار Push + نسخة إنجليزية" },
  precheck: { label: "فحص ما قبل النشر", hint: "أعلام مخاطر وتنبيهات فقط — لا يعدّل" },
};

// المهام التي تُغذّى تلقائياً من محتوى المقال الحالي بدل لصق مادة خارجية
const TASKS_FROM_EDITOR: ReadonlySet<EditorialTaskType> = new Set([
  "review",
  "app_version",
  "precheck",
]);

interface SabqEditorAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** عنوان المقال الحالي ومتنه — مصدر المادة لمهام المراجعة والفحص ونسخة التطبيق */
  articleTitle: string;
  articleContent: string;
  onApplyHeadline: (headline: string) => void;
  onApplyBody: (html: string) => void;
}

export function SabqEditorAssistant({
  open,
  onOpenChange,
  articleTitle,
  articleContent,
  onApplyHeadline,
  onApplyBody,
}: SabqEditorAssistantProps) {
  const { toast } = useToast();
  const [task, setTask] = useState<EditorialTaskType>("edit");
  const [material, setMaterial] = useState("");
  const [material2, setMaterial2] = useState("");
  const [instructions, setInstructions] = useState("");
  const [result, setResult] = useState<EditorialTaskResult | null>(null);

  const fromEditor = TASKS_FROM_EDITOR.has(task);
  const editorMaterial = [articleTitle, articleContent].filter(Boolean).join("\n\n");
  const effectiveMaterial = fromEditor ? editorMaterial : material;
  const materialTooShort = effectiveMaterial.trim().length < 20;

  const taskMutation = useMutation({
    mutationFn: async () =>
      apiRequest<EditorialTaskResult>("/api/editorial-ai/task", {
        method: "POST",
        body: JSON.stringify({
          type: task,
          material: effectiveMaterial,
          material2: task === "merge" ? material2 : undefined,
          instructions: instructions.trim() || undefined,
        }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (data) => setResult(sanitizeEditorialAiResult(data)),
    onError: (error: any) =>
      toast({
        title: "تعذر تنفيذ المهمة",
        description: error?.message || "حدث خطأ غير متوقع",
        variant: "destructive",
      }),
  });

  const reset = () => {
    setResult(null);
    taskMutation.reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-3xl" data-testid="dialog-sabq-assistant">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookPen className="h-5 w-5" />
            محرر سبق
          </DialogTitle>
          <DialogDescription>
            مهام التحرير الموحد وفق الدستور التحريري — المخرج مسودة لا تُطبق إلا بقرارك.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>المهمة</Label>
              <Select
                value={task}
                onValueChange={(v) => {
                  setTask(v as EditorialTaskType);
                  taskMutation.reset();
                }}
              >
                <SelectTrigger data-testid="select-sabq-task">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TASK_LABELS) as EditorialTaskType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TASK_LABELS[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{TASK_LABELS[task].hint}</p>
            </div>

            {fromEditor ? (
              <Alert>
                <AlertDescription className="text-xs">
                  ستُنفذ المهمة على العنوان والمتن الحاليين في المحرر (
                  {editorMaterial.trim().length.toLocaleString("ar")} حرفاً).
                </AlertDescription>
              </Alert>
            ) : (
              <div className="grid gap-2">
                <Label>{task === "merge" ? "المادة الأولى" : "المادة الخام"}</Label>
                <Textarea
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  rows={7}
                  placeholder="الصق البيان / التغريدة / مادة الرادار هنا..."
                  data-testid="textarea-sabq-material"
                />
              </div>
            )}

            {task === "merge" && (
              <div className="grid gap-2">
                <Label>المادة الثانية</Label>
                <Textarea
                  value={material2}
                  onChange={(e) => setMaterial2(e.target.value)}
                  rows={7}
                  placeholder="الصق المادة الثانية..."
                  data-testid="textarea-sabq-material2"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label>توجيه المحرر (اختياري)</Label>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={2}
                placeholder="زاوية مطلوبة، تركيز العنوان، جمهور محدد..."
                data-testid="textarea-sabq-instructions"
              />
            </div>

            <Button
              className="w-full gap-2"
              onClick={() => taskMutation.mutate()}
              disabled={
                taskMutation.isPending ||
                materialTooShort ||
                (task === "merge" && material2.trim().length < 20)
              }
              data-testid="button-sabq-run"
            >
              {taskMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <NotebookPen className="h-4 w-4" />
              )}
              {taskMutation.isPending ? "جارٍ التحرير..." : `تنفيذ: ${TASK_LABELS[task].label}`}
            </Button>
          </div>
        ) : (
          <ScrollArea className="max-h-[65vh] pr-2">
            <div className="space-y-4">
              {result.meta.verificationRecommended && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    هذه المهمة تؤدى بأفضل صورة مع تحقق خارجي (بحث) لم يُرفق — راجع
                    الملاحظات قبل الاعتماد.
                  </AlertDescription>
                </Alert>
              )}

              {result.riskFlags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.riskFlags.map((flag) => (
                    <Badge key={flag} variant="destructive" className="text-xs">
                      {flag}
                    </Badge>
                  ))}
                </div>
              )}

              {result.headline && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">العنوان المقترح</Label>
                  {[result.headline, ...result.altHeadlines].map((h, i) => (
                    <div
                      key={`${i}-${h.slice(0, 20)}`}
                      className="flex items-start justify-between gap-2 rounded-md border p-2"
                    >
                      <span className="text-sm font-medium leading-6">{h}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 gap-1"
                        onClick={() => {
                          onApplyHeadline(h);
                          toast({ title: "طُبق العنوان" });
                        }}
                        data-testid={`button-sabq-apply-headline-${i}`}
                      >
                        <Check className="h-3 w-3" />
                        تطبيق
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {result.body && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">المتن</Label>
                    <Button
                      size="sm"
                      className="gap-1"
                      onClick={() => {
                        onApplyBody(result.body);
                        toast({
                          title: "طُبق المتن في المحرر",
                          description: "راجعه قبل الحفظ — الذكاء لا ينشر.",
                        });
                      }}
                      data-testid="button-sabq-apply-body"
                    >
                      <Check className="h-3 w-3" />
                      إدراج في المحرر
                    </Button>
                  </div>
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none rounded-md border p-3 text-sm leading-7"
                    // مخرج نظامنا التحريري الداخلي — يُعاد تنقيته عند الإدراج عبر TipTap
                    dangerouslySetInnerHTML={{ __html: result.body }}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">ملاحظات التحرير</Label>
                <ul className="space-y-1.5 rounded-md border bg-muted/40 p-3">
                  {result.editorNotes.map((note, i) => (
                    <li key={i} className="text-xs leading-5 flex gap-2">
                      <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                      {note}
                    </li>
                  ))}
                </ul>
              </div>

              {result.pushText && (
                <Alert>
                  <BellRing className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <span className="font-medium">إشعار مقترح:</span> {result.pushText}
                  </AlertDescription>
                </Alert>
              )}

              {result.enVersion && (
                <div className="space-y-1 rounded-md border p-3" dir="ltr">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Languages className="h-3 w-3" /> English version
                  </Label>
                  <p className="text-sm font-medium">{result.enVersion.headline}</p>
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-xs"
                    dangerouslySetInnerHTML={{ __html: result.enVersion.body }}
                  />
                </div>
              )}

              {result.sources.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">المصادر</Label>
                  {result.sources.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <Link2 className="h-3 w-3 shrink-0" />
                      {s.title}
                    </a>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between border-t pt-3">
                <p className="text-[11px] text-muted-foreground">
                  {result.meta.modelId}
                  {result.meta.fallbackUsed ? " (النموذج البديل)" : ""}
                </p>
                <Button variant="outline" size="sm" onClick={reset} data-testid="button-sabq-new-task">
                  مهمة جديدة
                </Button>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
