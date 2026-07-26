// بطاقة «شهاداتي الرسمية» — مساحة كاتب الرأي وصفحة المراسل.
// الإصدار مسموح فقط بعد اعتماد الإدارة. لا طلب ثانٍ لنفس النوع الساري.

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import {
  LETTER_GAPS_STAFF_HINT_AR,
  OFFICIAL_LETTER_TYPE_LIST,
  OFFICIAL_LETTER_TYPE_META,
  type OfficialLetterType,
} from "@shared/officialLetters";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Info,
  Loader2,
  Send,
  ShieldAlert,
} from "lucide-react";

type LetterRow = {
  id: string;
  referenceCode: string;
  letterType: string;
  letterTypeLabelAr: string;
  recipientEntity: string | null;
  status: string;
  issuedAt: string;
};

type ReadinessGap = {
  key: string;
  labelAr: string;
  impactAr: string;
  severity: "important" | "optional";
};

type ProfileReviewStatus = "draft" | "pending_review" | "approved" | "needs_correction";

type Readiness = {
  canIssue: boolean;
  blockingReasonAr: string | null;
  fullNameAr: string | null;
  roleTitleAr: string | null;
  gaps: ReadinessGap[];
  importantMissing: number;
  profileReviewStatus?: ProfileReviewStatus;
  profileReviewNote?: string | null;
};

export function MyOfficialLettersCard() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [letterType, setLetterType] = useState<OfficialLetterType>("media_license");
  const [recipientEntity, setRecipientEntity] = useState(
    OFFICIAL_LETTER_TYPE_META.media_license.defaultRecipientAr ?? "",
  );
  const [note, setNote] = useState("");

  useEffect(() => {
    const openForm = () => setFormOpen(true);
    window.addEventListener("sabq:open-official-letter-form", openForm);
    return () => window.removeEventListener("sabq:open-official-letter-form", openForm);
  }, []);

  const { data: lettersRaw, isLoading: lettersLoading } = useQuery({
    queryKey: ["/api/official-letters/mine"],
  });
  const letters = (((lettersRaw as { letters?: LetterRow[] } | undefined)?.letters) ?? []) as LetterRow[];
  const activeLetters = letters.filter((l) => l.status === "issued");
  const hasActiveOfType = (type: OfficialLetterType) =>
    activeLetters.some((l) => l.letterType === type);
  const canRequestSelected = !hasActiveOfType(letterType);
  const allIssued = OFFICIAL_LETTER_TYPE_LIST.every((t) => hasActiveOfType(t.id));

  const { data: readinessRaw, isFetching: readinessLoading } = useQuery({
    queryKey: [`/api/official-letters/my-readiness?letterType=${letterType}`],
    enabled: canRequestSelected,
  });
  const readiness = (readinessRaw ?? null) as Readiness | null;
  const importantGaps = readiness?.gaps.filter((g) => g.severity === "important") ?? [];
  const optionalGaps = readiness?.gaps.filter((g) => g.severity === "optional") ?? [];
  const reviewStatus = readiness?.profileReviewStatus;
  const readyToIssue =
    Boolean(readiness?.canIssue) && (readiness?.importantMissing ?? 1) === 0;
  const profileApproved = reviewStatus === "approved";

  const issueMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/official-letters/requests", {
        method: "POST",
        body: JSON.stringify({
          letterType,
          recipientEntity: recipientEntity.trim() || null,
          note: note.trim() || null,
        }),
        headers: { "Content-Type": "application/json" },
      }) as Promise<{
        ok: boolean;
        issued: boolean;
        letter: { id: string; referenceCode: string };
      }>,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/official-letters/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/official-letters/requests/mine"] });
      setFormOpen(false);
      setNote("");
      toast({
        title: "صدرت شهادتك",
        description: `الرقم المرجعي ${data.letter.referenceCode} — جارٍ فتح التنزيل`,
      });
      if (data.letter?.id) {
        window.open(apiUrl(`/api/official-letters/${data.letter.id}/file.pdf`), "_blank");
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "تعذر إصدار الشهادة",
        description: error.message || "حاول مرة أخرى",
      });
    },
  });

  const onTypeChange = (value: string) => {
    const next = value as OfficialLetterType;
    setLetterType(next);
    setRecipientEntity(OFFICIAL_LETTER_TYPE_META[next].defaultRecipientAr ?? "");
  };

  return (
    <Card id="my-official-letters" data-testid="card-my-official-letters">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          شهاداتي الرسمية
        </CardTitle>
        <CardDescription>
          بعد اعتماد الإدارة لملفك يمكنك إصدار شهادة التعريف وتنزيلها — شهادة واحدة سارية لكل نوع
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {lettersLoading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ التحميل…
          </p>
        ) : activeLetters.length > 0 ? (
          <ul className="divide-y rounded-xl border">
            {activeLetters.map((letter) => (
              <li key={letter.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{letter.letterTypeLabelAr}</p>
                  <p className="text-xs text-muted-foreground">
                    {letter.referenceCode}
                    {letter.recipientEntity ? ` · ${letter.recipientEntity}` : ""}
                  </p>
                </div>
                <Button size="sm" asChild>
                  <a
                    href={apiUrl(`/api/official-letters/${letter.id}/file.pdf`)}
                    target="_blank"
                    rel="noreferrer"
                    data-testid={`link-my-letter-${letter.id}`}
                  >
                    <Download className="ml-1 h-4 w-4" />
                    تنزيل الشهادة
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        ) : profileApproved && !formOpen ? (
          <div
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"
            data-testid="panel-ready-to-issue-certificate"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              ملفك معتمد — جاهز لإصدار شهادة التعريف
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              اضغط الزر لإصدار الشهادة وفتح ملف PDF للتنزيل فوراً.
            </p>
            <Button
              className="mt-3"
              onClick={() => setFormOpen(true)}
              data-testid="button-request-letter"
            >
              <Download className="ml-2 h-4 w-4" />
              إصدار وتحميل شهادة التعريف
            </Button>
          </div>
        ) : null}

        {letters.some((l) => l.status === "revoked") && (
          <div className="space-y-1">
            {letters
              .filter((l) => l.status === "revoked")
              .map((letter) => (
                <div key={letter.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="destructive" className="text-[10px]">ملغى</Badge>
                  <span>{letter.letterTypeLabelAr} · {letter.referenceCode}</span>
                </div>
              ))}
          </div>
        )}

        {!canRequestSelected && formOpen ? (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            لديك شهادة سارية من هذا النوع — استخدم زر التنزيل أعلاه. لا يمكن طلب شهادة ثانية.
          </p>
        ) : formOpen ? (
          <div className="space-y-3 rounded-xl border p-3">
            <div className="space-y-2">
              <Label>نوع الشهادة</Label>
              <Select value={letterType} onValueChange={onTypeChange}>
                <SelectTrigger data-testid="select-my-letter-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OFFICIAL_LETTER_TYPE_LIST.map((type) => (
                    <SelectItem
                      key={type.id}
                      value={type.id}
                      disabled={hasActiveOfType(type.id)}
                    >
                      {type.labelAr}
                      {hasActiveOfType(type.id) ? " (صادرة)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {OFFICIAL_LETTER_TYPE_META[letterType].hintAr}
              </p>
            </div>
            <div className="space-y-2">
              <Label>الجهة (اختياري)</Label>
              <Input
                value={recipientEntity}
                onChange={(e) => setRecipientEntity(e.target.value)}
                placeholder="يُترك فارغاً عادة"
                data-testid="input-my-recipient"
              />
            </div>
            <div className="space-y-2">
              <Label>ملاحظة (اختياري)</Label>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                data-testid="input-my-letter-note"
              />
            </div>

            {readinessLoading ? (
              <p className="text-xs text-muted-foreground">جارٍ فحص بياناتك…</p>
            ) : readiness && reviewStatus === "pending_review" ? (
              <div
                className="flex items-start gap-2 rounded-lg border border-sky-300/70 bg-sky-50/80 p-3 text-sm text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200"
                data-testid="readiness-pending-review"
              >
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {readiness.blockingReasonAr ||
                    "بياناتك مكتملة وهي قيد مراجعة الإدارة. بعد الاعتماد ستتمكن من إصدار الشهادة وتنزيلها."}
                </p>
              </div>
            ) : readiness && reviewStatus === "needs_correction" ? (
              <div
                className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50/70 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/20"
                data-testid="readiness-needs-correction"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p>
                  {readiness.blockingReasonAr ||
                    readiness.profileReviewNote ||
                    "مطلوب تصحيح بياناتك من الإدارة قبل إصدار الشهادة."}
                </p>
              </div>
            ) : readiness && !readiness.canIssue ? (
              <div
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                data-testid="readiness-blocked"
              >
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{readiness.blockingReasonAr}</p>
              </div>
            ) : readiness && importantGaps.length > 0 ? (
              <div
                className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20"
                data-testid="readiness-gaps"
              >
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  أكمل بياناتك أولاً لإصدار الشهادة
                </p>
                <ul className="mt-2 space-y-1.5">
                  {importantGaps.map((gap) => (
                    <li key={gap.key} className="flex items-start gap-2 text-xs">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      <span>
                        <b className="font-semibold">{gap.labelAr}</b>
                        <span className="text-muted-foreground"> — {gap.impactAr}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                  {LETTER_GAPS_STAFF_HINT_AR}
                </p>
              </div>
            ) : readiness && optionalGaps.length > 0 ? (
              <div className="rounded-lg border bg-muted/40 p-3" data-testid="readiness-optional-gaps">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  حقول اختيارية ناقصة — يمكن الإصدار بدونها
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {optionalGaps.map((gap) => (
                    <li key={gap.key}>• {gap.labelAr}</li>
                  ))}
                </ul>
              </div>
            ) : readiness ? (
              <div
                className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400"
                data-testid="readiness-complete"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>تم اعتماد ملفك — اضغط لإصدار الشهادة وفتح التنزيل فوراً</span>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => issueMutation.mutate()}
                disabled={issueMutation.isPending || !readyToIssue}
                data-testid="button-submit-letter-request"
              >
                {issueMutation.isPending ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جارٍ الإصدار…
                  </>
                ) : (
                  <>
                    <Send className="ml-2 h-4 w-4" />
                    إصدار وتحميل الشهادة
                  </>
                )}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setFormOpen(false)}>
                إلغاء
              </Button>
            </div>
          </div>
        ) : !profileApproved && !allIssued ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFormOpen(true)}
            data-testid="button-request-letter"
          >
            إصدار شهادة تعريف
          </Button>
        ) : allIssued ? (
          <p className="text-xs text-muted-foreground">جميع أنواع الشهادات صادرة — استخدم زر التنزيل أعلاه.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
