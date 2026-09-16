// الخطابات الرسمية — /dashboard/official-letters
// إصدار شهادة تعريف / تسهيل مهمة للمنسوبين، ومراجعة طلباتهم.

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import {
  OFFICIAL_LETTER_TYPE_LIST,
  OFFICIAL_LETTER_TYPE_META,
  type OfficialLetterType,
} from "@shared/officialLetters";
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type LetterRow = {
  id: string;
  referenceCode: string;
  letterType: string;
  letterTypeLabelAr: string;
  recipientEntity: string | null;
  status: string;
  source: string;
  issuedAt: string;
  subjectUserId: string;
  subjectName: string;
};

type RequestRow = {
  id: string;
  requesterUserId: string;
  requesterName: string;
  letterType: string;
  letterTypeLabelAr: string;
  recipientEntity: string | null;
  note: string | null;
  status: string;
  createdAt: string;
  gaps?: { key: string; labelAr: string; severity: "important" | "optional" }[];
};

type StaffRow = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  jobTitleName: string | null;
  departmentName: string | null;
  employmentType: string | null;
  profileReviewStatus?: string | null;
};

type SubjectPreview = {
  subject: {
    fullNameAr: string;
    roleTitleAr: string;
    departmentAr: string | null;
    pressIdNumber: string | null;
    mediaLicenseNumber: string | null;
    hasNationalId: boolean;
    joinedAt: string | null;
  };
  gaps: { key: string; labelAr: string }[];
};

function staffName(row: StaffRow): string {
  return [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.email;
}

export default function OfficialLetters() {
  const { toast } = useToast();
  const [issueOpen, setIssueOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [subjectUserId, setSubjectUserId] = useState("");
  const [letterType, setLetterType] = useState<OfficialLetterType>("media_license");
  const [recipientEntity, setRecipientEntity] = useState(
    OFFICIAL_LETTER_TYPE_META.media_license.defaultRecipientAr ?? "",
  );
  const [purposeNote, setPurposeNote] = useState("");

  const { data: lettersRaw, isLoading: lettersLoading } = useQuery({
    queryKey: ["/api/official-letters"],
  });
  const letters = (((lettersRaw as { letters?: LetterRow[] } | undefined)?.letters) ?? []) as LetterRow[];

  const { data: requestsRaw } = useQuery({
    queryKey: ["/api/official-letters/requests?status=pending"],
  });
  const requests = (((requestsRaw as { requests?: RequestRow[] } | undefined)?.requests) ?? []) as RequestRow[];

  const { data: staffRaw } = useQuery({ queryKey: ["/api/staff-profiles"] });
  const staff = (((staffRaw as { items?: StaffRow[] } | undefined)?.items) ?? []) as StaffRow[];
  const pendingProfileReviews = staff.filter(
    (row) => row.profileReviewStatus === "pending_review",
  ).length;

  const { data: previewRaw, isFetching: previewLoading } = useQuery({
    queryKey: [`/api/official-letters/subjects/${subjectUserId}`],
    enabled: Boolean(subjectUserId),
  });
  const preview = (previewRaw ?? null) as SubjectPreview | null;

  const filteredStaff = useMemo(() => {
    const q = search.trim();
    if (!q) return staff.slice(0, 40);
    return staff
      .filter((row) => `${staffName(row)} ${row.email}`.includes(q))
      .slice(0, 40);
  }, [staff, search]);

  const issueMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/official-letters", {
        method: "POST",
        body: JSON.stringify({
          subjectUserId,
          letterType,
          recipientEntity: recipientEntity.trim() || null,
          purposeNote: purposeNote.trim() || null,
        }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/official-letters"] });
      setIssueOpen(false);
      setPurposeNote("");
      toast({
        title: "تم إصدار الخطاب",
        description: `الرقم المرجعي ${data?.letter?.referenceCode ?? ""}`,
      });
      if (data?.letter?.id) {
        window.open(apiUrl(`/api/official-letters/${data.letter.id}/file.pdf`), "_blank");
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "تعذر الإصدار",
        description: error.message || "حاول مرة أخرى",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/api/official-letters/requests/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/official-letters"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/official-letters/requests?status=pending"],
      });
      toast({ title: "تم الاعتماد", description: "صدر الخطاب وأُضيف إلى السجل" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "تعذر الاعتماد", description: error.message });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const note = window.prompt("سبب رفض الطلب:")?.trim();
      if (!note) throw new Error("سبب الرفض مطلوب");
      return apiRequest(`/api/official-letters/requests/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ note }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/official-letters/requests?status=pending"],
      });
      toast({ title: "تم رفض الطلب" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "تعذر الرفض", description: error.message });
    },
  });

  // إعادة توليد ملفات الشهادات السارية بعد تحديث قالب التصميم — نفس الرقم
  // المرجعي ورابط التحقق؛ المنسوب يعيد التحميل فقط.
  const regenerateMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/official-letters/regenerate-pdfs", { method: "POST" }),
    onSuccess: (data: any) => {
      const skipped = (data?.skipped ?? []) as { referenceCode: string; reason: string }[];
      toast({
        title: "اكتمل تحديث الملفات",
        description:
          `أعيد توليد ${data?.regenerated?.length ?? 0} من ${data?.total ?? 0} شهادة` +
          (skipped.length
            ? ` — تخطّي: ${skipped.map((s) => s.referenceCode).join("، ")}`
            : ""),
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "تعذر تحديث الملفات",
        description: error.message || "حاول مرة أخرى",
      });
    },
  });

  const onRegenerate = () => {
    const ok = window.confirm(
      "سيُعاد توليد ملفات PDF لكل الشهادات السارية بالتصميم الحالي، بنفس الأرقام المرجعية وروابط التحقق. المتابعة؟",
    );
    if (ok) regenerateMutation.mutate();
  };

  const onTypeChange = (value: string) => {
    const next = value as OfficialLetterType;
    setLetterType(next);
    setRecipientEntity(OFFICIAL_LETTER_TYPE_META[next].defaultRecipientAr ?? "");
  };

  const selectedStaff = staff.find((s) => s.userId === subjectUserId);

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1200px]" contentClassName="px-4 pb-16 sm:px-6">
        <DashboardPageHeader
          icon={FileText}
          title="الخطابات الرسمية"
          description="إصدار خطابات التعريف وتسهيل المهمة للمنسوبين — مرقّمة وقابلة للتحقق"
          titleTestId="text-official-letters-title"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={onRegenerate}
                disabled={regenerateMutation.isPending}
                data-testid="button-regenerate-letters"
              >
                {regenerateMutation.isPending ? (
                  <>
                    <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                    جارٍ التحديث…
                  </>
                ) : (
                  <>
                    <RefreshCw className="ml-1 h-4 w-4" />
                    تحديث ملفات PDF
                  </>
                )}
              </Button>
              <Button onClick={() => setIssueOpen(true)} data-testid="button-new-letter">
                خطاب جديد
              </Button>
            </div>
          }
        />

        <Link
          href="/dashboard/staff-profiles?review=pending_review"
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-sky-300/70 bg-sky-50/80 px-4 py-3 text-start transition hover:bg-sky-50 dark:border-sky-900/50 dark:bg-sky-950/30"
          data-testid="link-staff-profile-review-queue"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-sky-900 dark:text-sky-100">
            <ClipboardCheck className="h-4 w-4 shrink-0" />
            {pendingProfileReviews > 0
              ? `${pendingProfileReviews} ملف منسوب بانتظار المراجعة والاعتماد قبل الشهادة`
              : "مراجعة ملفات المنسوبين واعتمادها قبل إصدار الشهادات"}
          </span>
          <span className="shrink-0 text-xs text-sky-700 dark:text-sky-300">افتح الطابور ←</span>
        </Link>

        {requests.length > 0 && (
          <section className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              طلبات بانتظار الاعتماد ({requests.length})
            </h2>
            <ul className="space-y-2">
              {requests.map((req) => (
                <li
                  key={req.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{req.requesterName}</p>
                    <p className="text-xs text-muted-foreground">
                      {req.letterTypeLabelAr}
                      {req.recipientEntity ? ` · ${req.recipientEntity}` : ""}
                    </p>
                    {req.note && (
                      <p className="mt-1 text-xs text-muted-foreground/80">{req.note}</p>
                    )}
                    {req.gaps && req.gaps.length > 0 && (
                      <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                        بيانات ناقصة في ملفه:{" "}
                        {req.gaps
                          .map((g) => (g.severity === "important" ? `${g.labelAr} (مهم)` : g.labelAr))
                          .join("، ")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate(req.id)}
                      disabled={approveMutation.isPending}
                      data-testid={`button-approve-request-${req.id}`}
                    >
                      <Check className="ml-1 h-4 w-4" />
                      اعتماد وإصدار
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectMutation.mutate(req.id)}
                      disabled={rejectMutation.isPending}
                    >
                      <X className="ml-1 h-4 w-4" />
                      رفض
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-2xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-bold">سجل الخطابات الصادرة</h2>
          </div>
          {lettersLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
          ) : letters.length === 0 ? (
            <div className="p-10 text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">لم يصدر أي خطاب بعد</p>
            </div>
          ) : (
            <ul className="divide-y">
              {letters.map((letter) => (
                <li key={letter.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{letter.subjectName}</p>
                      <Badge
                        variant={letter.status === "revoked" ? "destructive" : "secondary"}
                        className="text-[10px]"
                      >
                        {letter.status === "revoked" ? "ملغى" : "سارٍ"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {letter.letterTypeLabelAr}
                      {letter.recipientEntity ? ` · ${letter.recipientEntity}` : ""}
                    </p>
                  </div>
                  <code className="rounded bg-muted px-2 py-1 text-[11px] tabular-nums">
                    {letter.referenceCode}
                  </code>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {new Date(letter.issuedAt).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn")}
                  </span>
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={apiUrl(`/api/official-letters/${letter.id}/file.pdf`)}
                      target="_blank"
                      rel="noreferrer"
                      data-testid={`link-download-letter-${letter.id}`}
                    >
                      <Download className="ml-1 h-4 w-4" />
                      تنزيل
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle>إصدار خطاب رسمي</DialogTitle>
              <DialogDescription>
                اختر المنسوب ونوع الخطاب والجهة — ويُصدر الخطاب برقم مرجعي قابل للتحقق
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>المنسوب</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ابحث بالاسم أو البريد"
                    className="pr-9"
                    data-testid="input-search-subject"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto rounded-lg border">
                  {filteredStaff.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">لا نتائج</p>
                  ) : (
                    filteredStaff.map((row) => (
                      <button
                        key={row.userId}
                        type="button"
                        onClick={() => setSubjectUserId(row.userId)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm transition-colors",
                          subjectUserId === row.userId ? "bg-primary/10" : "hover:bg-muted/50",
                        )}
                        data-testid={`option-subject-${row.userId}`}
                      >
                        <span className="min-w-0 truncate">{staffName(row)}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {row.jobTitleName ?? row.employmentType ?? ""}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>نوع الخطاب</Label>
                  <Select value={letterType} onValueChange={onTypeChange}>
                    <SelectTrigger data-testid="select-letter-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OFFICIAL_LETTER_TYPE_LIST.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.labelAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {OFFICIAL_LETTER_TYPE_META[letterType].hintAr}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>الجهة الموجّه إليها</Label>
                  <Input
                    value={recipientEntity}
                    onChange={(e) => setRecipientEntity(e.target.value)}
                    placeholder="اتركه فارغاً لـ «لمن يهمه الأمر»"
                    data-testid="input-recipient-entity"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>سطر إضافي (اختياري)</Label>
                <Textarea
                  rows={2}
                  value={purposeNote}
                  onChange={(e) => setPurposeNote(e.target.value)}
                  placeholder="يظهر كفقرة إضافية في متن الخطاب"
                  data-testid="input-purpose-note"
                />
              </div>

              {subjectUserId && (
                <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                  {previewLoading ? (
                    <p className="text-xs text-muted-foreground">جارٍ قراءة بيانات المنسوب…</p>
                  ) : preview ? (
                    <>
                      <p className="flex items-center gap-2 font-semibold">
                        <ShieldCheck className="h-4 w-4 text-emerald-600" />
                        {preview.subject.fullNameAr} — {preview.subject.roleTitleAr}
                      </p>
                      {preview.gaps.length > 0 && (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                          حقول ناقصة ستُحذف من الخطاب:{" "}
                          {preview.gaps.map((g) => g.labelAr).join("، ")}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-destructive">
                      تعذر تكوين بيانات هذا المنسوب — تأكد من الاسم الكامل بالعربية
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-start gap-2 pt-2">
                <Button
                  onClick={() => issueMutation.mutate()}
                  disabled={!subjectUserId || !preview || issueMutation.isPending}
                  data-testid="button-issue-letter"
                >
                  {issueMutation.isPending ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      جارٍ الإصدار…
                    </>
                  ) : (
                    "إصدار وتنزيل"
                  )}
                </Button>
                <Button variant="outline" onClick={() => setIssueOpen(false)}>
                  إلغاء
                </Button>
              </div>

              {selectedStaff && (
                <p className="text-[11px] text-muted-foreground">
                  سيُسجَّل الخطاب باسم {staffName(selectedStaff)} ولا يمكن تعديله بعد الإصدار.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
