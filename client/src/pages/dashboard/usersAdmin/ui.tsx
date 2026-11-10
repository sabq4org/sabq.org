import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { PUBLISH_LEVEL_LABELS_AR, ROLE_STATUS_LABELS_AR, type PublishLevel, type RoleStatus } from "@shared/userAdmin";
import { cn } from "@/lib/utils";
import { levelBars, type Tone } from "./format";

const TONE_DOT: Record<Tone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  bad: "bg-destructive",
  idle: "bg-muted-foreground/60",
};

const TONE_BOX: Record<Tone, string> = {
  ok: "bg-success/10",
  warn: "bg-warning/15",
  bad: "bg-destructive/10",
  idle: "bg-muted",
};

export function StatusTag({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium text-foreground",
        TONE_BOX[tone],
        className,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} />
      {children}
    </span>
  );
}

const ROLE_STATUS_TONE: Record<RoleStatus, Tone> = { active: "ok", closed: "idle", disabled: "warn", archived: "bad" };

export function RoleStatusTag({ status }: { status: RoleStatus }) {
  return <StatusTag tone={ROLE_STATUS_TONE[status]}>{ROLE_STATUS_LABELS_AR[status]}</StatusTag>;
}

/** رقاقة دور بحدّ مربّع؛ تُعتَّم إن كان الدور معطّلًا أو مؤرشفًا. */
export function RoleChip({ nameAr, status }: { nameAr: string; status: RoleStatus }) {
  const off = status === "disabled" || status === "archived";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 text-xs",
        off ? "border-dashed text-muted-foreground line-through decoration-muted-foreground/60" : "border-border",
      )}
      title={off ? `الدور ${ROLE_STATUS_LABELS_AR[status]} وصلاحياته متوقفة` : undefined}
    >
      {nameAr}
      {off && <span className="no-underline text-[10px]">({ROLE_STATUS_LABELS_AR[status]})</span>}
    </span>
  );
}

export function PublishMeter({ level, dimmed, className }: { level: PublishLevel; dimmed?: boolean; className?: string }) {
  const n = levelBars(level);
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", className)}>
      <span aria-hidden className="inline-flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <b key={i} className={cn("h-3.5 w-1.5 rounded-[1px]", i <= n && !dimmed ? "bg-primary" : "bg-border")} />
        ))}
      </span>
      <span className={cn("text-[13px] font-medium", (dimmed || n === 0) && "text-muted-foreground")}>
        {PUBLISH_LEVEL_LABELS_AR[level]}
      </span>
    </span>
  );
}

export function NoAccess({ message }: { message?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border p-8 text-center" role="alert" data-testid="users-admin-no-access">
      <ShieldAlert className="h-8 w-8 text-muted-foreground" />
      <h2 className="text-lg font-semibold">لا تملك صلاحية عرض هذه الصفحة</h2>
      <p className="text-sm text-muted-foreground">{message ?? "تواصل مع مسؤول النظام إن كنت تحتاج إلى هذا الوصول."}</p>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {(error || hint) && <span className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>{error || hint}</span>}
    </div>
  );
}
