// اهتمامات كتّاب الرأي ومقترحاتهم — صفحة الإدارة: فرز الردود حسب مجال الاهتمام،
// ونسخ بريد المجموعة المختارة أو تصديرها CSV للتواصل مع كل فئة حسب تخصصها.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Download, Loader2, MessageSquareHeart, Search } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { OPINION_WRITER_INTERESTS, opinionWriterInterestLabel } from "@shared/opinionWriterFeedback";

type FeedbackRow = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  interests: string[];
  otherInterest: string | null;
  suggestions: string | null;
  createdAt: string;
  updatedAt: string;
};

type AdminResponse = { responses?: FeedbackRow[]; counts?: Record<string, number> };

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar", {
      day: "numeric",
      month: "long",
      year: "numeric",
      numberingSystem: "latn",
    });
  } catch {
    return "";
  }
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export default function OpinionWriterFeedbackAdminPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");
  const [onlySuggestions, setOnlySuggestions] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading, isError } = useQuery<AdminResponse | null>({
    queryKey: ["/api/admin/opinion-writer-feedback"],
    staleTime: 30_000,
  });
  const responses = Array.isArray(data?.responses) ? data!.responses! : [];
  const counts = data?.counts ?? {};
  const withSuggestions = responses.filter((r) => r.suggestions).length;

  const visible = useMemo(() => {
    const q = search.trim();
    return responses.filter((r) => {
      if (filter !== "all" && !r.interests.includes(filter)) return false;
      if (onlySuggestions && !r.suggestions) return false;
      if (q && !`${r.name} ${r.email ?? ""} ${r.otherInterest ?? ""} ${r.suggestions ?? ""}`.includes(q)) return false;
      return true;
    });
  }, [responses, filter, onlySuggestions, search]);

  const groupLabel = filter === "all" ? "كل الكتّاب" : opinionWriterInterestLabel(filter);

  const copyEmails = async () => {
    const emails = visible.map((r) => r.email).filter(Boolean).join(", ");
    if (!emails) {
      toast({ title: "لا توجد عناوين بريد في هذه المجموعة" });
      return;
    }
    try {
      await navigator.clipboard.writeText(emails);
      toast({ title: `نُسخ بريد ${visible.filter((r) => r.email).length} كاتب`, description: groupLabel });
    } catch {
      toast({ title: "تعذر النسخ", variant: "destructive" });
    }
  };

  const exportCsv = () => {
    const header = ["الاسم", "البريد", "الاهتمامات", "مجال آخر", "المقترحات", "آخر تحديث"];
    const lines = visible.map((r) =>
      [
        r.name,
        r.email ?? "",
        r.interests.map(opinionWriterInterestLabel).join("، "),
        r.otherInterest ?? "",
        r.suggestions ?? "",
        r.updatedAt.slice(0, 10),
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob(["﻿" + [header.map(csvCell).join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `opinion-writers-${filter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const chip = (id: string, label: string, count: number) => (
    <button
      key={id}
      type="button"
      aria-pressed={filter === id}
      onClick={() => setFilter(id)}
      data-testid={`filter-interest-${id}`}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
        filter === id
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:border-primary/50 hover:bg-primary/5",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
          filter === id ? "bg-white/25" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-5xl" contentClassName="px-4 pb-16 sm:px-6">
        <DashboardPageHeader
          icon={MessageSquareHeart}
          title="اهتمامات كتّاب الرأي ومقترحاتهم"
          description="ردود الكتّاب على نموذج «اهتماماتي ومقترحاتي»، مفروزة حسب مجال الاهتمام"
          titleTestId="text-writer-feedback-admin-title"
        />

        <div className="space-y-4" dir="rtl">
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">كاتب أرسل رده</p>
              <p className="text-2xl font-bold tabular-nums" data-testid="stat-responses">{responses.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">رد فيه مقترحات</p>
              <p className="text-2xl font-bold tabular-nums">{withSuggestions}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {chip("all", "الكل", responses.length)}
            {OPINION_WRITER_INTERESTS.map((i) => chip(i.id, i.label, counts[i.id] ?? 0))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو نص المقترح" className="pr-9" />
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-sm">
                <input type="checkbox" checked={onlySuggestions} onChange={(e) => setOnlySuggestions(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                بمقترحات فقط
              </label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={copyEmails} disabled={visible.length === 0} data-testid="button-copy-emails">
                <Copy className="h-3.5 w-3.5" /> نسخ بريد المجموعة
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={visible.length === 0}>
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            </div>
          </div>

          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
              </CardContent>
            </Card>
          ) : isError ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-destructive">تعذر جلب الردود حالياً.</CardContent>
            </Card>
          ) : visible.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {responses.length === 0 ? "لم يصل أي رد بعد. يظهر النموذج للكتّاب في «اهتماماتي ومقترحاتي»." : "لا توجد ردود تطابق هذا الفرز."}
              </CardContent>
            </Card>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {visible.map((r) => (
                <article key={r.id} className="space-y-2 p-4" data-testid={`feedback-row-${r.id}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <h3 className="font-bold">{r.name}</h3>
                      {r.email && (
                        <a href={`mailto:${r.email}`} dir="ltr" className="text-xs text-primary hover:underline">
                          {r.email}
                        </a>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(r.updatedAt)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.interests.map((id) => (
                      <span key={id} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        {id === "other" && r.otherInterest ? `أخرى: ${r.otherInterest}` : opinionWriterInterestLabel(id)}
                      </span>
                    ))}
                  </div>
                  {r.suggestions && (
                    <p className="whitespace-pre-line rounded-xl bg-muted/50 p-3 text-sm leading-7">{r.suggestions}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
