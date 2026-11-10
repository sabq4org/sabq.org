import { Link } from "wouter";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ListedUser } from "./types";
import { initialOf, relativeTimeAr, statusText, statusTone } from "./format";
import { PublishMeter, RoleChip, StatusTag } from "./ui";
import type { StatusActionKind } from "./UserActionDialogs";

export const LIST_GRID =
  "grid grid-cols-2 gap-x-3.5 gap-y-2.5 md:grid-cols-[minmax(0,2.3fr)_minmax(0,1.5fr)_minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,.9fr)_170px] md:gap-3.5";

function CellLabel({ children }: { children: string }) {
  return <span className="mb-0.5 block text-xs text-muted-foreground md:hidden">{children}</span>;
}

export interface RowActions {
  onStatus: (u: ListedUser, kind: StatusActionKind) => void;
  onDelete: (u: ListedUser) => void;
  onResetPassword: (u: ListedUser) => void;
  canManageStatus: boolean;
  canDelete: boolean;
  canResetPassword: boolean;
}

export function UserListRow({ user, actions }: { user: ListedUser; actions: RowActions }) {
  const banned = user.status === "banned";
  const suspended = user.status === "suspended";
  const sensitive: Array<{ label: string; run: () => void }> = [];
  if (actions.canManageStatus) {
    if (suspended) sensitive.push({ label: "رفع التعليق", run: () => actions.onStatus(user, "lift-suspension") });
    if (banned) sensitive.push({ label: "رفع الحظر", run: () => actions.onStatus(user, "lift-ban") });
    if (!suspended && !banned) sensitive.push({ label: "تعليق مؤقت", run: () => actions.onStatus(user, "suspend") });
    if (!banned) sensitive.push({ label: "حظر", run: () => actions.onStatus(user, "ban") });
  }
  if (banned && actions.canDelete) sensitive.push({ label: "حذف نهائي", run: () => actions.onDelete(user) });
  const showResetPassword = actions.canResetPassword;

  return (
    <div
      role="row"
      className={`${LIST_GRID} items-center border-b p-3.5 last:border-b-0 hover:bg-muted/40 md:px-4 md:py-3`}
      data-testid={`user-row-${user.id}`}
    >
      <div role="cell" className="col-span-2 flex min-w-0 items-center gap-2.5 md:col-span-1">
        <Avatar className="h-9 w-9">
          {user.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt="" />}
          <AvatarFallback className="bg-primary/10 font-bold text-primary">{initialOf(user.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <Link href={`/dashboard/users/${user.id}`} className="block truncate font-semibold hover:underline">
            {user.name}
          </Link>
          <span dir="ltr" className="block truncate text-start text-[12.5px] text-muted-foreground" style={{ unicodeBidi: "isolate" }}>
            {user.email || user.phoneNumber || ""}
          </span>
        </div>
      </div>

      <div role="cell" className="min-w-0">
        <CellLabel>الأدوار</CellLabel>
        <div className="flex flex-wrap gap-1">
          {user.roles.length === 0 ? (
            <span className="text-xs text-muted-foreground">قارئ</span>
          ) : (
            user.roles.map((r) => <RoleChip key={r.id} nameAr={r.nameAr} status={r.status} />)
          )}
        </div>
      </div>

      <div role="cell">
        <CellLabel>في مسار الخبر</CellLabel>
        <PublishMeter level={user.publishLevel} dimmed={banned || suspended} />
      </div>

      <div role="cell">
        <CellLabel>الحالة</CellLabel>
        <StatusTag tone={statusTone(user.status)}>{statusText(user.status, user.suspendedUntil, user.bannedUntil)}</StatusTag>
      </div>

      <div role="cell">
        <CellLabel>آخر نشاط</CellLabel>
        <span className={`text-xs tabular-nums ${user.lastActivityAt ? "" : "text-muted-foreground"}`}>{relativeTimeAr(user.lastActivityAt)}</span>
      </div>

      <div role="cell" className="col-span-2 flex items-center gap-1 border-t pt-2 md:col-span-1 md:justify-end md:border-t-0 md:pt-0">
        <Button asChild variant="ghost" size="sm" className="min-h-[44px] md:min-h-8">
          <Link href={`/dashboard/users/${user.id}`}>فتح الملف</Link>
        </Button>
        {(sensitive.length > 0 || showResetPassword) && (
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="min-h-[44px] md:min-h-8" aria-label={`المزيد من الإجراءات لـ${user.name}`}>
                <MoreHorizontal className="h-4 w-4" />
                المزيد
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              {showResetPassword && <DropdownMenuItem onSelect={() => actions.onResetPassword(user)}>إعادة تعيين كلمة المرور</DropdownMenuItem>}
              {showResetPassword && sensitive.length > 0 && <DropdownMenuSeparator />}
              {sensitive.map((s) => (
                <DropdownMenuItem key={s.label} className="text-destructive focus:text-destructive" onSelect={s.run}>
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
