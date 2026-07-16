import { Newspaper, Clock, FilePenLine, Archive } from "lucide-react";

type StatusKey = "published" | "scheduled" | "draft" | "archived";

interface StatusCardsProps {
  metrics: {
    published: number;
    scheduled: number;
    draft: number;
    archived: number;
  };
  activeStatus: StatusKey;
  onSelect: (status: StatusKey) => void;
}

const statusConfigs: Record<
  StatusKey,
  {
    icon: typeof Newspaper;
    label: string;
    idle: string;
    active: string;
    iconIdle: string;
    iconActive: string;
  }
> = {
  published: {
    icon: Newspaper,
    label: "منشورة",
    idle: "border-emerald-200/70 bg-emerald-50/40 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-100",
    active: "border-emerald-700 bg-emerald-700 text-white shadow-sm dark:border-emerald-500 dark:bg-emerald-600",
    iconIdle: "bg-emerald-100/90 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    iconActive: "bg-white/20 text-white",
  },
  scheduled: {
    icon: Clock,
    label: "مجدولة",
    idle: "border-sky-200/70 bg-sky-50/40 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-100",
    active: "border-sky-700 bg-sky-700 text-white shadow-sm dark:border-sky-500 dark:bg-sky-600",
    iconIdle: "bg-sky-100/90 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
    iconActive: "bg-white/20 text-white",
  },
  draft: {
    icon: FilePenLine,
    label: "مسودة",
    idle: "border-amber-200/70 bg-amber-50/40 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100",
    active: "border-amber-700 bg-amber-700 text-white shadow-sm dark:border-amber-500 dark:bg-amber-600",
    iconIdle: "bg-amber-100/90 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    iconActive: "bg-white/20 text-white",
  },
  archived: {
    icon: Archive,
    label: "مؤرشفة",
    idle: "border-rose-200/70 bg-rose-50/40 text-rose-950 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-100",
    active: "border-rose-800 bg-rose-800 text-white shadow-sm dark:border-rose-500 dark:bg-rose-700",
    iconIdle: "bg-rose-100/90 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
    iconActive: "bg-white/20 text-white",
  },
};

export function StatusCards({ metrics, activeStatus, onSelect }: StatusCardsProps) {
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:gap-2" role="tablist" aria-label="تصفية حسب الحالة">
      {(Object.keys(statusConfigs) as StatusKey[]).map((status) => {
        const config = statusConfigs[status];
        const Icon = config.icon;
        const isActive = activeStatus === status;
        const count = metrics[status];

        return (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`rounded-xl border px-2 py-2 text-start transition-colors sm:px-3 sm:py-2.5 ${
              isActive ? config.active : config.idle
            }`}
            onClick={() => onSelect(status)}
            data-testid={`card-status-${status}`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-[11px] font-semibold sm:text-xs">{config.label}</span>
              <span className={`rounded-md p-1 ${isActive ? config.iconActive : config.iconIdle}`}>
                <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-1 text-base font-bold tabular-nums sm:text-lg">
              {count.toLocaleString("en-US")}
            </div>
          </button>
        );
      })}
    </div>
  );
}
