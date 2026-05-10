import { Card } from "@/components/ui/card";
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

const statusConfigs = {
  published: {
    icon: Newspaper,
    label: "منشورة",
    bgColor: "bg-emerald-50 dark:bg-emerald-950",
    textColor: "text-emerald-700 dark:text-emerald-300",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  scheduled: {
    icon: Clock,
    label: "مجدولة",
    bgColor: "bg-indigo-50 dark:bg-indigo-950",
    textColor: "text-indigo-700 dark:text-indigo-300",
    iconColor: "text-indigo-600 dark:text-indigo-400",
  },
  draft: {
    icon: FilePenLine,
    label: "مسودة",
    bgColor: "bg-amber-50 dark:bg-amber-950",
    textColor: "text-amber-700 dark:text-amber-300",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  archived: {
    icon: Archive,
    label: "مؤرشفة",
    bgColor: "bg-slate-50 dark:bg-slate-900",
    textColor: "text-slate-700 dark:text-slate-300",
    iconColor: "text-slate-600 dark:text-slate-400",
  },
};

export function StatusCards({ metrics, activeStatus, onSelect }: StatusCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {(Object.keys(statusConfigs) as StatusKey[]).map((status) => {
        const config = statusConfigs[status];
        const Icon = config.icon;
        const isActive = activeStatus === status;
        const count = metrics[status];

        return (
          <Card
            key={status}
            className={`
              p-3 sm:p-4 cursor-pointer transition-all hover-elevate
              ${config.bgColor}
              ${isActive ? "ring-2 ring-primary" : ""}
            `}
            onClick={() => onSelect(status)}
            data-testid={`card-status-${status}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1 sm:gap-2 min-w-0 flex-1">
                <span className={`text-xs sm:text-sm font-medium ${config.textColor} truncate`}>
                  {config.label}
                </span>
                <span className={`text-xl sm:text-2xl font-bold ${config.textColor}`}>
                  {count}
                </span>
              </div>
              <div className={`p-2 sm:p-3 rounded-lg ${config.iconColor} flex-shrink-0`}>
                <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
