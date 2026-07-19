export type OpinionTicketStatus = "open" | "answered" | "closed";

export const STATUS_OPTIONS: OpinionTicketStatus[] = ["open", "answered", "closed"];

export const STATUS_META: Record<
  OpinionTicketStatus,
  { label: string; className: string }
> = {
  open: {
    label: "مفتوح",
    className:
      "bg-amber-100 text-amber-950 border-amber-300 dark:bg-amber-500/20 dark:text-amber-100 dark:border-amber-400/40",
  },
  answered: {
    label: "تمت الإجابة",
    className:
      "bg-emerald-100 text-emerald-950 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-100 dark:border-emerald-400/40",
  },
  closed: {
    label: "مغلق",
    className:
      "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-500/20 dark:text-slate-100 dark:border-slate-400/40",
  },
};
