import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Permission, RoleWithPermissions } from "@shared/schema";
import type { AdminRole } from "./types";
import { errorMessage } from "./format";
import { MODULE_NAMES, MODULE_ORDER } from "./moduleNames";
import { invalidateUserQueries } from "./UserActionDialogs";

export function RolePermissionsSheet({ role, onClose }: { role: AdminRole | null; onClose: () => void }) {
  const { toast } = useToast();
  const open = !!role;
  const rolesQuery = useQuery<RoleWithPermissions[]>({ queryKey: ["/api/admin/roles"], enabled: open, staleTime: 0 });
  const permsQuery = useQuery<Permission[]>({ queryKey: ["/api/permissions"], enabled: open, staleTime: 60_000 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const current = (Array.isArray(rolesQuery.data) ? rolesQuery.data : []).find((r) => r.id === role?.id);
  useEffect(() => {
    if (current) setSelected(new Set((Array.isArray(current.permissions) ? current.permissions : []).map((p) => p.id)));
  }, [current?.id, rolesQuery.dataUpdatedAt]);
  useEffect(() => {
    if (open) setFilter("");
  }, [open]);

  const all = Array.isArray(permsQuery.data) ? permsQuery.data : [];
  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const map: Record<string, Permission[]> = {};
    for (const p of all) {
      if (q && !`${p.labelAr} ${p.code}`.toLowerCase().includes(q)) continue;
      (map[p.module] ||= []).push(p);
    }
    return Object.keys(map)
      .sort((a, b) => {
        const ia = MODULE_ORDER.indexOf(a);
        const ib = MODULE_ORDER.indexOf(b);
        return ia === -1 && ib === -1 ? a.localeCompare(b) : ia === -1 ? 1 : ib === -1 ? -1 : ia - ib;
      })
      .map((m) => [m, map[m]] as const);
  }, [all, filter]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/roles/${role!.id}/permissions`, { method: "PATCH", body: JSON.stringify({ permissionIds: Array.from(selected) }) }),
    onSuccess: () => {
      toast({ title: "حُدّثت صلاحيات الدور", description: role?.nameAr });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/roles"] });
      invalidateUserQueries();
      onClose();
    },
    onError: (e) => toast({ title: "تعذّر حفظ الصلاحيات", description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <SheetContent side="left" dir="rtl" className="flex w-full flex-col gap-3 sm:max-w-lg">
        <SheetHeader className="text-right">
          <SheetTitle>صلاحيات الدور: {role?.nameAr}</SheetTitle>
          <SheetDescription>اختر ما يمنحه الدور. يسري التغيير على كل حامليه خلال ثوانٍ.</SheetDescription>
        </SheetHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ابحث في الصلاحيات" className="min-h-[44px] ps-9 sm:min-h-9" aria-label="ابحث في الصلاحيات" />
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pe-1">
          {(rolesQuery.isLoading || permsQuery.isLoading) && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          {(rolesQuery.isError || permsQuery.isError) && <p className="text-sm text-destructive">تعذّر تحميل الصلاحيات. أغلق النافذة وأعد المحاولة.</p>}
          {grouped.map(([module, perms]) => (
            <div key={module} className="rounded-lg border">
              <h3 className="flex justify-between border-b bg-muted/50 px-3 py-2 text-sm font-semibold">
                {MODULE_NAMES[module] || module}
                <span className="text-xs font-normal tabular-nums text-muted-foreground">
                  {perms.filter((p) => selected.has(p.id)).length} / {perms.length}
                </span>
              </h3>
              <div className="divide-y">
                {perms.map((p) => (
                  <label key={p.id} className="flex min-h-[44px] cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/40">
                    <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                    <span className="min-w-0">
                      <span className="block">{p.labelAr}</span>
                      <span dir="ltr" className="block truncate text-start text-xs text-muted-foreground">
                        {p.code}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t pt-3">
          <Button className="min-h-[44px] flex-1 sm:min-h-9" disabled={save.isPending || !current} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ الصلاحيات
          </Button>
          <Button variant="outline" className="min-h-[44px] sm:min-h-9" disabled={save.isPending} onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
