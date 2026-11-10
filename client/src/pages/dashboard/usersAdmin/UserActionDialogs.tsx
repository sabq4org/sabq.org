import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API, type UserProfile } from "./types";
import { errorMessage } from "./format";
import { Field } from "./ui";

export type StatusActionKind = "suspend" | "ban" | "lift-suspension" | "lift-ban";

export function invalidateUserQueries() {
  queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && String(q.queryKey[0]).startsWith(`${API}/`) });
}

export const DURATIONS: Array<{ value: string; label: string; days: number | null }> = [
  { value: "1", label: "يوم واحد", days: 1 },
  { value: "3", label: "3 أيام", days: 3 },
  { value: "7", label: "7 أيام", days: 7 },
  { value: "14", label: "14 يومًا", days: 14 },
  { value: "30", label: "30 يومًا", days: 30 },
  { value: "manual", label: "حتى يُرفع يدويًا", days: null },
];

export function DurationSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange} dir="rtl">
      <SelectTrigger id={id} className="min-h-[44px] sm:min-h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DURATIONS.map((d) => (
          <SelectItem key={d.value} value={d.value}>
            {d.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const COPY: Record<StatusActionKind, { title: string; confirm: string; destructive: boolean; done: string }> = {
  suspend: { title: "تعليق الحساب مؤقتًا", confirm: "تعليق الحساب", destructive: true, done: "عُلّق الحساب" },
  ban: { title: "حظر الحساب", confirm: "حظر الحساب", destructive: true, done: "حُظر الحساب" },
  "lift-suspension": { title: "رفع التعليق", confirm: "رفع التعليق", destructive: false, done: "رُفع التعليق" },
  "lift-ban": { title: "رفع الحظر", confirm: "رفع الحظر", destructive: false, done: "رُفع الحظر" },
};

/** تعليق/حظر/رفع من القائمة: يجلب الملف للحصول على version ثم يرسل PATCH. */
export function StatusActionDialog({
  user,
  kind,
  onClose,
}: {
  user: { id: string; name: string } | null;
  kind: StatusActionKind | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("7");
  const lifting = kind === "lift-suspension" || kind === "lift-ban";

  useEffect(() => {
    if (user && kind) {
      setReason("");
      setDuration(kind === "ban" ? "manual" : "7");
    }
  }, [user, kind]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user || !kind) return;
      const profile = await apiRequest<UserProfile>(`${API}/users/${user.id}`);
      const days = DURATIONS.find((d) => d.value === duration)?.days ?? null;
      const status =
        kind === "suspend"
          ? { action: "suspended", days, reason: reason.trim() }
          : kind === "ban"
            ? { action: "banned", days, reason: reason.trim() }
            : { action: "active" };
      await apiRequest(`${API}/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: profile.version,
          status,
          ...(lifting && reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
    },
    onSuccess: () => {
      if (user && kind) toast({ title: `${COPY[kind].done}: ${user.name}` });
      invalidateUserQueries();
      onClose();
    },
    onError: (e) => toast({ title: "تعذّر تنفيذ الإجراء", description: errorMessage(e), variant: "destructive" }),
  });

  const open = !!user && !!kind;
  const copy = kind ? COPY[kind] : COPY.suspend;
  const reasonOk = lifting || reason.trim().length >= 5;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {user?.name}
            {lifting ? ". يعود الحساب إلى الحالة النشطة." : ". تنتهي جلساته على الموقع والتطبيقات فورًا ولا تتغير أدواره."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!lifting && (
            <Field label="المدة" htmlFor="ua-duration">
              <DurationSelect id="ua-duration" value={duration} onChange={setDuration} />
            </Field>
          )}
          <Field
            label={lifting ? "ملاحظة (اختياري)" : "السبب"}
            htmlFor="ua-reason"
            hint={lifting ? undefined : "5 أحرف على الأقل. يُسجَّل في سجل التدقيق."}
          >
            <Textarea id="ua-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />
          </Field>
        </div>
        <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
          <Button
            variant={copy.destructive ? "destructive" : "default"}
            className="min-h-[44px] sm:min-h-9"
            disabled={!reasonOk || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {copy.confirm}
          </Button>
          <Button variant="outline" className="min-h-[44px] sm:min-h-9" onClick={onClose} disabled={mutation.isPending}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function ResetPasswordDialog({ user, onClose }: { user: { id: string; name: string } | null; onClose: () => void }) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (user) {
      setPassword("");
      setDone(false);
    }
  }, [user]);

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/users/${user!.id}/reset-password`, { method: "POST", body: JSON.stringify({ newPassword: password }) }),
    onSuccess: () => {
      setDone(true);
      toast({ title: "عُيّنت كلمة المرور الجديدة وأُنهيت جلسات المستخدم" });
    },
    onError: (e) => toast({ title: "تعذّر تعيين كلمة المرور", description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>إعادة تعيين كلمة المرور</DialogTitle>
          <DialogDescription>{user?.name}. تُنهى كل جلساته الحالية. أبلغه بكلمة المرور بقناة آمنة.</DialogDescription>
        </DialogHeader>
        <Field label="كلمة المرور الجديدة" htmlFor="rp-pw" hint={done ? "انسخها الآن؛ لن تظهر مرة أخرى." : undefined}>
          <div className="flex gap-2">
            <Input
              id="rp-pw"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={done}
              autoComplete="off"
              className="min-h-[44px] sm:min-h-9"
            />
            <Button type="button" variant="outline" className="min-h-[44px] sm:min-h-9" disabled={done} onClick={() => setPassword(generatePassword())}>
              توليد
            </Button>
          </div>
        </Field>
        <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
          {done ? (
            <Button className="min-h-[44px] sm:min-h-9" onClick={onClose}>
              تم
            </Button>
          ) : (
            <Button className="min-h-[44px] sm:min-h-9" disabled={password.length < 10 || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              تعيين كلمة المرور
            </Button>
          )}
          {!done && (
            <Button variant="outline" className="min-h-[44px] sm:min-h-9" onClick={onClose}>
              إلغاء
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PermanentDeleteDialog({ user, onClose }: { user: { id: string; name: string } | null; onClose: () => void }) {
  const { toast } = useToast();
  const [typed, setTyped] = useState("");
  const [needsForce, setNeedsForce] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setTyped("");
      setNeedsForce(null);
    }
  }, [user]);

  const mutation = useMutation({
    mutationFn: (force: boolean) => apiRequest(`/api/admin/users/${user!.id}/permanent${force ? "?force=true" : ""}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: `حُذف حساب ${user?.name} نهائيًا` });
      invalidateUserQueries();
      onClose();
    },
    onError: (e) => {
      const msg = errorMessage(e);
      if (msg.includes("published article")) setNeedsForce(msg);
      else toast({ title: "تعذّر الحذف", description: msg, variant: "destructive" });
    },
  });

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>حذف نهائي لحساب {user?.name}</DialogTitle>
          <DialogDescription>
            لا رجعة فيه: تُحذف بيانات الحساب المرتبطة به. الحذف متاح للحسابات المحظورة فقط.
          </DialogDescription>
        </DialogHeader>
        {needsForce ? (
          <p className="rounded border border-warning/40 bg-warning/10 p-3 text-sm" role="alert">
            للحساب مقالات منشورة. المتابعة تنقل نسبتها إلى «صحيفة سبق» ثم تحذف الحساب.
          </p>
        ) : (
          <Field label="للتأكيد اكتب اسم المستخدم كما يظهر" htmlFor="pd-confirm">
            <Input id="pd-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} className="min-h-[44px] sm:min-h-9" />
          </Field>
        )}
        <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
          <Button
            variant="destructive"
            className="min-h-[44px] sm:min-h-9"
            disabled={mutation.isPending || (!needsForce && typed.trim() !== user?.name)}
            onClick={() => mutation.mutate(!!needsForce)}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {needsForce ? "حذف ونقل المقالات" : "حذف نهائي"}
          </Button>
          <Button variant="outline" className="min-h-[44px] sm:min-h-9" onClick={onClose} disabled={mutation.isPending}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
