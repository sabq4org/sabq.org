import { Button } from "@/components/ui/button";
import type { RoleStatus } from "@shared/userAdmin";
import type { AdminRole } from "./types";
import { PublishMeter, RoleStatusTag } from "./ui";

export type RoleAction =
  | { type: "permissions" | "meta" | "delete"; role: AdminRole }
  | { type: "status"; role: AdminRole; to: RoleStatus };

const GRID = "grid grid-cols-2 gap-x-3.5 gap-y-2 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,.7fr)_minmax(0,1.3fr)_auto] md:gap-3.5";

function statusButtons(role: AdminRole): Array<{ label: string; to: RoleStatus; danger?: boolean }> {
  switch (role.status) {
    case "active":
      return [{ label: "إغلاق الإسناد", to: "closed" }, { label: "تعطيل", to: "disabled", danger: true }];
    case "closed":
      return [{ label: "فتح الإسناد", to: "active" }, { label: "تعطيل", to: "disabled", danger: true }];
    case "disabled":
      return [{ label: "تفعيل", to: "active" }, { label: "أرشفة", to: "archived", danger: true }];
    default:
      return [{ label: "استعادة إلى معطّل", to: "disabled" }];
  }
}

export function RolesTable({ roles, onAction }: { roles: AdminRole[]; onAction: (a: RoleAction) => void }) {
  return (
    <div className="overflow-hidden rounded-lg border" role="table" aria-label="الأدوار" data-testid="roles-table">
      <div role="row" className={`${GRID} hidden border-b bg-muted/50 px-4 py-2 text-[12.5px] font-semibold text-muted-foreground md:grid`}>
        <span>الدور</span>
        <span>الحالة</span>
        <span>المستخدمون</span>
        <span>أعلى خطوة</span>
        <span />
      </div>
      {roles.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">لا توجد أدوار لعرضها.</p>}
      {roles.map((r) => (
        <div key={r.id} role="row" className={`${GRID} items-center border-b p-3.5 last:border-b-0 md:px-4 md:py-3`}>
          <div role="cell" className="col-span-2 min-w-0 md:col-span-1">
            <b>{r.nameAr}</b>
            {r.description && <div className="text-[12.5px] text-muted-foreground">{r.description}</div>}
          </div>
          <div role="cell">
            <RoleStatusTag status={r.status} />
          </div>
          <div role="cell" className="text-sm tabular-nums">
            <span className="text-xs text-muted-foreground md:hidden">المستخدمون: </span>
            {r.userCount.toLocaleString("en-US")}
          </div>
          <div role="cell" className="col-span-2 md:col-span-1">
            <PublishMeter level={r.publishLevel} dimmed={r.status === "disabled" || r.status === "archived"} />
          </div>
          <div role="cell" className="col-span-2 flex flex-wrap items-center gap-1 border-t pt-2 md:col-span-1 md:justify-end md:border-t-0 md:pt-0">
            {r.isProtected ? (
              <span className="text-xs text-muted-foreground">دور نظام مقفل</span>
            ) : (
              <>
                {!r.isSystem && r.status !== "archived" && (
                  <Button variant="ghost" size="sm" className="min-h-[44px] md:min-h-8" onClick={() => onAction({ type: "permissions", role: r })}>
                    الصلاحيات
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="min-h-[44px] md:min-h-8" onClick={() => onAction({ type: "meta", role: r })}>
                  تعديل الاسم والوصف
                </Button>
                {statusButtons(r).map((b) => (
                  <Button
                    key={b.to}
                    variant="ghost"
                    size="sm"
                    className={`min-h-[44px] md:min-h-8 ${b.danger ? "text-destructive hover:text-destructive" : ""}`}
                    onClick={() => onAction({ type: "status", role: r, to: b.to })}
                  >
                    {b.label}
                  </Button>
                ))}
                {r.userCount === 0 && !r.isSystem && (
                  <Button variant="ghost" size="sm" className="min-h-[44px] text-destructive hover:text-destructive md:min-h-8" onClick={() => onAction({ type: "delete", role: r })}>
                    حذف
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
