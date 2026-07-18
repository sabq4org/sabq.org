import { Mic, PenLine, type LucideIcon } from "lucide-react";

export type TicketAuthorKind = "reporter" | "opinion_author" | "angle_writer" | "other";

export const AUTHOR_KIND_META: Record<
  TicketAuthorKind,
  { label: string; shortLabel: string; icon: LucideIcon; className: string }
> = {
  reporter: {
    label: "مراسل",
    shortLabel: "مراسل",
    icon: Mic,
    className: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
  },
  opinion_author: {
    label: "كاتب رأي",
    shortLabel: "كاتب",
    icon: PenLine,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  },
  angle_writer: {
    label: "كاتب زاوية",
    shortLabel: "زاوية",
    icon: PenLine,
    className: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200",
  },
  other: {
    label: "مساهم",
    shortLabel: "مساهم",
    icon: PenLine,
    className: "bg-muted text-muted-foreground",
  },
};

export function authorKindMeta(kind?: string | null) {
  if (kind && kind in AUTHOR_KIND_META) {
    return AUTHOR_KIND_META[kind as TicketAuthorKind];
  }
  return AUTHOR_KIND_META.other;
}
