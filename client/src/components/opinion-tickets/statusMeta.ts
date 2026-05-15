export type OpinionTicketStatus = "open" | "answered" | "closed";

export const STATUS_OPTIONS: OpinionTicketStatus[] = ["open", "answered", "closed"];

export const STATUS_META: Record<
  OpinionTicketStatus,
  { label: string; className: string }
> = {
  open: {
    label: "مفتوح",
    className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  },
  answered: {
    label: "تمت الإجابة",
    className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30",
  },
  closed: {
    label: "مغلق",
    className: "bg-muted text-muted-foreground border-muted-foreground/20",
  },
};
