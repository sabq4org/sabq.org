import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ROLE_STATUS_LABELS_AR, type RoleStatus } from "@shared/userAdmin";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { API, type AdminRole, type RoleImpact } from "./types";
import { errorMessage } from "./format";
import { Field } from "./ui";
import { invalidateUserQueries } from "./UserActionDialogs";

function refreshRoles() {
  invalidateUserQueries();
  queryClient.invalidateQueries({ queryKey: ["/api/admin/roles"] });
}

function Footer({ confirm, disabled, pending, destructive, onConfirm, onCancel }: {
  confirm: string; disabled?: boolean; pending: boolean; destructive?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
      <Button variant={destructive ? "destructive" : "default"} className="min-h-[44px] sm:min-h-9" disabled={disabled || pending} onClick={onConfirm}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {confirm}
      </Button>
      <Button variant="outline" className="min-h-[44px] sm:min-h-9" disabled={pending} onClick={onCancel}>
        إلغاء
      </Button>
    </DialogFooter>
  );
}

export function CreateRoleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    if (open) {
      setName("");
      setNameAr("");
      setDescription("");
    }
  }, [open]);
  const m = useMutation({
    mutationFn: () => apiRequest("/api/admin/roles", { method: "POST", body: JSON.stringify({ name: name.trim(), nameAr: nameAr.trim(), description: description.trim() }) }),
    onSuccess: () => {
      toast({ title: "أُنشئ الدور", description: nameAr });
      refreshRoles();
      onClose();
    },
    onError: (e) => toast({ title: "تعذّر إنشاء الدور", description: errorMessage(e), variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !m.isPending && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>دور جديد</DialogTitle>
          <DialogDescription>يُنشأ الدور بلا صلاحيات؛ أضفها من زر «الصلاحيات» بعد الإنشاء.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="الاسم بالعربية" htmlFor="cr-ar">
            <Input id="cr-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} className="min-h-[44px] sm:min-h-9" />
          </Field>
          <Field label="المعرّف بالإنجليزية" htmlFor="cr-en" hint="أحرف إنجليزية صغيرة وشرطة سفلية، مثل: photo_editor">
            <Input id="cr-en" dir="ltr" value={name} onChange={(e) => setName(e.target.value)} className="min-h-[44px] sm:min-h-9" />
          </Field>
          <Field label="الوصف" htmlFor="cr-desc">
            <Textarea id="cr-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <Footer confirm="إنشاء الدور" pending={m.isPending} disabled={nameAr.trim().length < 2 || name.trim().length < 2} onConfirm={() => m.mutate()} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}

export function EditRoleMetaDialog({ role, onClose }: { role: AdminRole | null; onClose: () => void }) {
  const { toast } = useToast();
  const [nameAr, setNameAr] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    if (role) {
      setNameAr(role.nameAr);
      setDescription(role.description ?? "");
    }
  }, [role]);
  const m = useMutation({
    mutationFn: () => apiRequest(`${API}/roles/${role!.id}`, { method: "PATCH", body: JSON.stringify({ nameAr: nameAr.trim(), description: description.trim() || null }) }),
    onSuccess: () => {
      toast({ title: "حُدّث الدور" });
      refreshRoles();
      onClose();
    },
    onError: (e) => toast({ title: "تعذّر الحفظ", description: errorMessage(e), variant: "destructive" }),
  });
  return (
    <Dialog open={!!role} onOpenChange={(o) => !o && !m.isPending && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>تعديل الاسم والوصف</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="الاسم بالعربية" htmlFor="em-ar">
            <Input id="em-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} className="min-h-[44px] sm:min-h-9" />
          </Field>
          <Field label="الوصف" htmlFor="em-desc">
            <Textarea id="em-desc" rows={3} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <Footer confirm="حفظ" pending={m.isPending} disabled={nameAr.trim().length < 2} onConfirm={() => m.mutate()} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}

const VERB: Record<RoleStatus, string> = { active: "تفعيل الدور", closed: "إغلاق الإسناد", disabled: "تعطيل الدور", archived: "أرشفة الدور" };

function holdersPhrase(n: number): string {
  if (n === 1) return "لمستخدم واحد";
  if (n === 2) return "لمستخدمَين";
  return `لـ${n.toLocaleString("en-US")} مستخدمين`;
}

export function RoleStatusDialog({ target, onClose }: { target: { role: AdminRole; to: RoleStatus } | null; onClose: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [target]);
  const impactQ = useQuery<RoleImpact | null>({
    queryKey: [`${API}/roles/${target?.role.id}/impact`, { to: target?.to }],
    enabled: !!target,
    staleTime: 0,
    gcTime: 0,
  });
  const impact = impactQ.data ?? null;
  const m = useMutation({
    mutationFn: () => apiRequest(`${API}/roles/${target!.role.id}/status`, { method: "PATCH", body: JSON.stringify({ status: target!.to, reason: reason.trim() }) }),
    onSuccess: () => {
      toast({ title: `${VERB[target!.to]}: ${target!.role.nameAr}` });
      refreshRoles();
      onClose();
    },
    onError: (e) => toast({ title: "تعذّر تغيير الحالة", description: errorMessage(e), variant: "destructive" }),
  });
  if (!target) return null;
  const { role, to } = target;
  const affects = to === "disabled" || to === "archived";
  const holders = impact?.holders ?? role.userCount;
  const label = `${VERB[to]}${affects && holders > 0 ? ` ${holdersPhrase(holders)}` : ""}`;
  return (
    <Dialog open onOpenChange={(o) => !o && !m.isPending && onClose()}>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>
            {VERB[to]}: {role.nameAr}
          </DialogTitle>
          <DialogDescription>
            من «{ROLE_STATUS_LABELS_AR[role.status]}» إلى «{ROLE_STATUS_LABELS_AR[to]}».
          </DialogDescription>
        </DialogHeader>
        {impactQ.isLoading && <Skeleton className="h-20 w-full" />}
        {impactQ.isError && <p className="text-sm text-destructive">تعذّر حساب الأثر. يمكنك المتابعة، لكن راجع حاملي الدور أولًا.</p>}
        {impact && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm" data-testid="role-impact">
            <p>
              يحمل الدور <b className="tabular-nums">{impact.holders}</b> مستخدمًا.
              {impact.losing > 0 && <> تتوقف بعض صلاحيات <b className="tabular-nums">{impact.losing}</b> منهم.</>}
              {impact.gaining > 0 && <> تعود صلاحيات <b className="tabular-nums">{impact.gaining}</b> منهم.</>}
              {impact.losing === 0 && impact.gaining === 0 && " لا تتغير صلاحيات أحد."}
            </p>
            {impact.leftWithoutEditorialCount > 0 && (
              <div className="rounded border border-warning/40 bg-warning/10 p-2.5">
                <p className="font-semibold">سيبقى {impact.leftWithoutEditorialCount} بلا أي صلاحية تحرير:</p>
                <p className="text-[13px]">
                  {impact.leftWithoutEditorial.map((u) => u.name).join("، ")}
                  {impact.leftWithoutEditorialCount > impact.leftWithoutEditorial.length && " وغيرهم"}
                </p>
              </div>
            )}
          </div>
        )}
        {(to === "disabled" || to === "archived") && (
          <p className="text-[13px] text-muted-foreground">
            يتوقف الدور في فحوص الصلاحيات. بعض الأقسام القديمة تتحقق من اسم الدور مباشرة ولا تعرف التعطيل بعد؛ لإيقاف شخص بالكامل علّق حسابه أو اسحب الدور منه.
          </p>
        )}
        <Field label="السبب" htmlFor="rs-reason" hint="5 أحرف على الأقل. يُسجَّل في سجل التدقيق.">
          <Textarea id="rs-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Footer confirm={label} destructive={affects} pending={m.isPending} disabled={reason.trim().length < 5} onConfirm={() => m.mutate()} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}

export function DeleteRoleDialog({ role, onClose }: { role: AdminRole | null; onClose: () => void }) {
  const { toast } = useToast();
  const m = useMutation({
    mutationFn: () => apiRequest(`${API}/roles/${role!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: `حُذف الدور ${role?.nameAr}` });
      refreshRoles();
      onClose();
    },
    onError: (e) => toast({ title: "تعذّر الحذف", description: errorMessage(e), variant: "destructive" }),
  });
  return (
    <Dialog open={!!role} onOpenChange={(o) => !o && !m.isPending && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>حذف الدور {role?.nameAr}</DialogTitle>
          <DialogDescription>الحذف نهائي، ولا يُسمح به إلا لدور لم يُسند لأحد قط.</DialogDescription>
        </DialogHeader>
        <Footer confirm="حذف الدور" destructive pending={m.isPending} onConfirm={() => m.mutate()} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
