import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { changedInfoKeys, changedRoleIds, statusChanged, type Draft, type InfoDraft } from "./profileState";
import type { PreviewResponse, UserProfile } from "./types";
import { STEP_LABELS, pluralChanges } from "./format";
import { Field } from "./ui";

export function SaveBar({
  count,
  issues,
  onDiscard,
  onReview,
}: {
  count: number;
  issues: string[];
  onDiscard: () => void;
  onReview: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-foreground/30 bg-background px-3.5 py-2.5 shadow-lg"
      role="region"
      aria-label="التغييرات غير المحفوظة"
      data-testid="users-savebar"
    >
      <span className="text-sm">
        <b className="tabular-nums text-warning">{pluralChanges(count)}</b> <span className="text-xs text-muted-foreground">لم تُحفظ بعد</span>
        {issues.length > 0 && <span className="ms-2 text-xs text-destructive">{issues[0]}</span>}
      </span>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-[44px] sm:min-h-9" onClick={onDiscard}>
          تجاهل التغييرات
        </Button>
        <Button className="min-h-[44px] sm:min-h-9" disabled={issues.length > 0} onClick={onReview}>
          مراجعة وحفظ
        </Button>
      </div>
    </div>
  );
}

const INFO_LABELS: Record<keyof InfoDraft, string> = {
  firstName: "الاسم الأول",
  lastName: "اسم العائلة",
  firstNameEn: "الاسم الأول بالإنجليزية",
  lastNameEn: "اسم العائلة بالإنجليزية",
  phoneNumber: "الجوال",
  jobTitle: "المسمى الوظيفي",
  department: "القسم",
};

export function ReviewDialog({
  open,
  profile,
  draft,
  base,
  preview,
  saving,
  onCancel,
  onConfirm,
  previewState = "ok",
}: {
  previewState?: "ok" | "pending" | "failed";
  open: boolean;
  profile: UserProfile;
  draft: Draft;
  base: Draft;
  preview: PreviewResponse | null;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const nameOf = (id: string) => profile.roles.find((r) => r.id === id)?.nameAr ?? id;
  const roleChanges = changedRoleIds(base.roleIds, draft.roleIds);
  const infoKeys = changedInfoKeys(base.info, draft.info);
  const gained = preview?.diff.gained ?? [];
  const lost = preview?.diff.lost ?? [];
  const sChanged = statusChanged(profile, draft.status);
  const statusLabel = draft.status.action === "active" ? "نشط" : draft.status.action === "suspended" ? "معلّق مؤقتًا" : "محظور";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onCancel()}>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>راجع الأثر قبل الحفظ</DialogTitle>
          <DialogDescription>{profile.user.name}</DialogDescription>
        </DialogHeader>
        {previewState !== "ok" && (
          <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-sm">
            {previewState === "failed"
              ? "تعذّر حساب أثر تغيير الأدوار والاستثناءات، فلا تظهر الخطوات المكتسبة والمفقودة. الحفظ ممكن، والخادم يطبّق الحراسات نفسها."
              : "يُحسب أثر آخر تعديل الآن…"}
          </p>
        )}
        <ul className="list-disc space-y-1.5 ps-5 text-sm">
          {roleChanges.map((id) => (
            <li key={id}>
              {draft.roleIds.includes(id) ? "إسناد" : "سحب"} دور <b>{nameOf(id)}</b>
            </li>
          ))}
          {gained.map((c) => (
            <li key={`g-${c}`}>
              <span className="font-semibold text-success">يكسب</span>: {STEP_LABELS[c] ?? c}
            </li>
          ))}
          {lost.map((c) => (
            <li key={`l-${c}`}>
              <span className="font-semibold text-destructive">يفقد</span>: {STEP_LABELS[c] ?? c}
            </li>
          ))}
          {sChanged && (
            <li>
              تغيير حالة الحساب إلى <b>{statusLabel}</b>
              {draft.status.action !== "active" && draft.status.reason ? ` (السبب: ${draft.status.reason})` : ""}
            </li>
          )}
          {infoKeys.map((k) => (
            <li key={k}>
              تعديل {INFO_LABELS[k]}: <b dir="auto">{draft.info[k].trim() || "فارغ"}</b>
            </li>
          ))}
          {roleChanges.length + gained.length + lost.length + infoKeys.length === 0 && !sChanged && <li>تعديل استثناءات شخصية دون تغيير في النتيجة النهائية</li>}
        </ul>
        <Field label="ملاحظة عامة (اختياري)" htmlFor="rv-reason" hint="تُضاف إلى سجل التدقيق مع التغيير.">
          <Textarea id="rv-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="text-xs text-muted-foreground">
          يُسجَّل في سجل التدقيق: اسمك والمستخدم والقيمة السابقة والجديدة والوقت. تُحدَّث صلاحياته خلال ثوانٍ دون أن يُطلب منه الخروج.
        </p>
        <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
          <Button className="min-h-[44px] sm:min-h-9" disabled={saving || previewState === "pending"} onClick={() => onConfirm(reason)}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            تأكيد الحفظ
          </Button>
          <Button variant="outline" className="min-h-[44px] sm:min-h-9" disabled={saving} onClick={onCancel}>
            رجوع للتعديل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
