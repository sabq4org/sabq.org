// «قفل المسودات»: شارة الصف، وزر «اقفل»/«فك القفل» مع نافذته، وشريحة
// «مقفلة» في قائمة الأخبار والمقالات، وشريط المحرر للقراءة فقط.
// القواعد في shared/draftLock.ts، والمنع الحقيقي على الخادم.

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Lock, LockOpen } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DRAFT_LOCK_NOTE_MAX,
  DRAFT_LOCK_REASON_MAX,
  DRAFT_LOCK_REASON_MIN,
  draftLockState,
  type DraftLockFields,
} from "@shared/draftLock";

export type DraftLockArticle = DraftLockFields & { id: string; title?: string | null };

const SUMMARY_KEY = ["/api/admin/draft-locks/summary"] as const;

function errorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : "";
  const match = raw.match(/^\d{3}:\s*(.*)$/s);
  const body = match ? match[1] : raw;
  try {
    const parsed = JSON.parse(body);
    if (parsed?.message) return parsed.message;
  } catch {
    /* نص عادي */
  }
  return body || fallback;
}

function invalidateAfterLockChange(articleId: string) {
  queryClient.invalidateQueries({ queryKey: ["/api/admin/articles"] });
  queryClient.invalidateQueries({ queryKey: [`/api/admin/articles/${articleId}`] });
  queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
}

function since(value: string | null): string {
  if (!value) return "";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return `منذ ${Math.round(hours / 24)} يوم`;
}

/** عدد المسودات المقفلة لشريحة التصفية. */
export function useDraftLockSummary(enabled: boolean) {
  return useQuery<{ total: number; mine: number } | null>({
    queryKey: SUMMARY_KEY,
    queryFn: async () => {
      try {
        return await apiRequest<{ total: number; mine: number }>("/api/admin/draft-locks/summary", { silent: true });
      } catch {
        return null; // قبل تفعيل الأعمدة: لا شريحة
      }
    },
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function DraftLockFilterChip({ total, active, onToggle }: { total: number; active: boolean; onToggle: () => void }) {
  if (total <= 0 && !active) return null;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      data-testid="filter-draft-locked"
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-full border px-4 text-sm font-bold transition",
        active
          ? "border-sky-600 bg-sky-600 text-white"
          : "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100",
      )}
    >
      <Lock className="h-4 w-4" aria-hidden="true" />
      مقفلة · {total.toLocaleString("en-US")}
    </button>
  );
}

/** شارة تحت عنوان المسودة: «مقفلة باسمك» أو «مقفلة لدى فلان». */
export function DraftLockBadge({ article, userId, testId }: { article: DraftLockArticle; userId?: string | null; testId?: string }) {
  const state = draftLockState(article, userId);
  if (!state.locked) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[13px] font-semibold",
          state.isOwner
            ? "bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
            : "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
        )}
        title={state.lockedAt ? new Date(state.lockedAt).toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" }) : undefined}
      >
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        {state.isOwner ? "مقفلة باسمك" : `مقفلة لدى ${state.lockedBy?.name}`}
        {state.lockedAt && <span className="font-normal opacity-80">· {since(state.lockedAt)}</span>}
      </span>
      {state.note && <span className="text-[13px] text-muted-foreground">«{state.note}»</span>}
    </div>
  );
}

/**
 * زر الصف: «اقفل» على مسودة حرة، «فك القفل» لصاحب القفل، و«فك القفل» بسبب
 * لمسؤول النظام على قفل زميل. لا شيء لغيرهم.
 */
export function DraftLockButton({
  article,
  userId,
  canLock,
  isSystemAdmin,
  size = "sm",
}: {
  article: DraftLockArticle;
  userId?: string | null;
  canLock: boolean;
  isSystemAdmin: boolean;
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  if (article.status !== "draft") return null;
  const state = draftLockState(article, userId);
  const mode: "lock" | "unlock" | "override" | null = !state.locked
    ? (canLock ? "lock" : null)
    : state.isOwner
      ? "unlock"
      : isSystemAdmin
        ? "override"
        : null;
  if (!mode) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={() => setOpen(true)}
        data-testid={`button-draft-${mode}-${article.id}`}
        className={cn(
          "gap-1.5 rounded-full",
          mode === "unlock" && "border-sky-500 text-sky-700 dark:text-sky-200",
          mode === "override" && "border-orange-500 text-orange-700 dark:text-orange-200",
        )}
      >
        {mode === "lock" ? <Lock className="h-4 w-4" aria-hidden="true" /> : <LockOpen className="h-4 w-4" aria-hidden="true" />}
        {mode === "lock" ? "اقفل" : "فك القفل"}
      </Button>
      {open && (
        <DraftLockDialog
          article={article}
          mode={mode}
          lockedByName={state.lockedBy?.name ?? null}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function DraftLockDialog({
  article,
  mode,
  lockedByName,
  onClose,
}: {
  article: DraftLockArticle;
  mode: "lock" | "unlock" | "override";
  lockedByName: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => mode === "lock"
      ? apiRequest(`/api/admin/articles/${article.id}/draft-lock`, { method: "POST", body: JSON.stringify({ note }) })
      : apiRequest(`/api/admin/articles/${article.id}/draft-lock`, {
          method: "DELETE",
          body: JSON.stringify(mode === "override" ? { reason } : {}),
        }),
    onSuccess: () => {
      invalidateAfterLockChange(article.id);
      toast({ title: mode === "lock" ? "قُفلت المسودة باسمك" : "فُك القفل" });
      onClose();
    },
    onError: (error) => {
      invalidateAfterLockChange(article.id);
      toast({ title: "تعذر تنفيذ الطلب", description: errorMessage(error, "حاول مرة أخرى"), variant: "destructive" });
    },
  });
  const reasonOk = reason.trim().length >= DRAFT_LOCK_REASON_MIN;
  const title = mode === "lock" ? "قفل المسودة" : mode === "unlock" ? "فك قفل مسودتك" : "فك قفل زميل";

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !mutation.isPending) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md rounded-3xl" data-testid={`dialog-draft-${mode}-${article.id}`}>
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-2xl",
              mode === "override" ? "bg-orange-100 text-orange-700" : "bg-sky-50 text-sky-600",
            )}>
              {mode === "lock" ? <Lock className="h-5 w-5" aria-hidden="true" /> : <LockOpen className="h-5 w-5" aria-hidden="true" />}
            </span>
            {title}
          </DialogTitle>
          <DialogDescription className="text-right leading-7">
            {mode === "lock" && "لن يستطيع أي زميل تعديلها أو نشرها أو جدولتها أو أرشفتها أو حذفها، من الموقع أو التطبيقات، حتى تفك القفل بنفسك. يرونها في القائمة مع اسمك."}
            {mode === "unlock" && "بعد فك القفل يستطيع الزملاء تعديل المسودة ونشرها كالمعتاد."}
            {mode === "override" && `للحالات الطارئة فقط، مثل غياب صاحب القفل. يصل ${lockedByName || "صاحب القفل"} إشعار بأنك فككت القفل، ويُسجَّل الإجراء في سجل المقال.`}
          </DialogDescription>
        </DialogHeader>

        {article.title && <p className="line-clamp-2 text-[15px] font-semibold">{article.title}</p>}

        {mode === "lock" && (
          <div className="space-y-2">
            <Label htmlFor={`draft-lock-note-${article.id}`} className="text-sm text-muted-foreground">ملاحظة للزملاء (اختيارية)</Label>
            <Input
              id={`draft-lock-note-${article.id}`}
              value={note}
              maxLength={DRAFT_LOCK_NOTE_MAX}
              onChange={(event) => setNote(event.target.value)}
              placeholder="مثل: ننتظر تأكيد الأرقام"
              className="h-11 rounded-full"
              data-testid="input-draft-lock-note"
            />
          </div>
        )}
        {mode === "override" && (
          <div className="space-y-2">
            <Label htmlFor={`draft-unlock-reason-${article.id}`} className="text-sm text-muted-foreground">السبب (مطلوب)</Label>
            <Input
              id={`draft-unlock-reason-${article.id}`}
              value={reason}
              maxLength={DRAFT_LOCK_REASON_MAX}
              onChange={(event) => setReason(event.target.value)}
              placeholder="مثل: الخبر مطلوب الآن وصاحبه خارج الدوام"
              className="h-11 rounded-full"
              data-testid="input-draft-unlock-reason"
            />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (mode === "override" && !reasonOk)}
            className={cn(
              "h-11 rounded-full px-6 font-bold",
              mode === "override" && "border border-orange-600 bg-white text-orange-700 hover:bg-orange-50",
            )}
            data-testid="button-confirm-draft-lock"
          >
            {mutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {mode === "lock" ? "اقفلها" : "فك القفل"}
          </Button>
          <Button type="button" variant="outline" className="h-11 rounded-full px-5" onClick={onClose} disabled={mutation.isPending}>
            إلغاء
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** شريط المحرر حين تكون المسودة مقفلة عند زميل: قراءة فقط. */
export function DraftLockedEditorBanner({
  article,
  userId,
  isSystemAdmin,
}: {
  article: DraftLockArticle;
  userId?: string | null;
  isSystemAdmin: boolean;
}) {
  const state = draftLockState(article, userId);
  if (!state.locked || state.isOwner) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-start gap-3 rounded-2xl bg-amber-50 px-5 py-4 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50"
      data-testid="banner-draft-locked"
    >
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-100">
        <Lock className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-base font-bold">
          هذه المسودة مقفلة لدى {state.lockedBy?.name} {state.lockedAt ? since(state.lockedAt) : ""}
        </p>
        <p className="text-sm leading-7 opacity-90">
          تقرؤها فقط. التعديل والنشر والجدولة والحذف متوقفة حتى يفك القفل.
          {state.note ? ` ملاحظته: «${state.note}»` : ""}
        </p>
      </div>
      {isSystemAdmin && (
        <DraftLockButton article={article} userId={userId} canLock={false} isSystemAdmin size="default" />
      )}
    </div>
  );
}
