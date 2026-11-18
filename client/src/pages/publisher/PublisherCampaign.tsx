import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Archive, ArchiveRestore, ArrowRight, FolderKanban, Pencil, Plus, Printer, Search } from "lucide-react";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { PublisherPageHeader } from "@/components/publisher/PublisherPageHeader";
import { CampaignFormDialog } from "@/components/publisher/CampaignFormDialog";
import { CampaignPrintReport } from "@/components/publisher/CampaignPrintReport";
import { CampaignArticleList, CampaignDayStrip, CampaignHero } from "@/components/publisher/CampaignReportBody";
import { campaignPeriod, type CampaignReport } from "@/components/publisher/campaignTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDateShort } from "@/lib/format";
import type { CampaignInput } from "@shared/publisherCampaigns";

export function printCampaignReport() {
  const go = () => window.print();
  if (document.fonts?.ready) document.fonts.ready.then(go).catch(go);
  else go();
}

interface PortalArticleRow {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

/** إضافة أخبار موجودة للحملة: بحث في مواد الوكالة واختيار متعدد. */
function AddArticlesPanel({ report, onDone }: { report: CampaignReport; onDone: () => void }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const inCampaign = new Set(report.articles.map((a) => a.id));
  const term = search.trim();

  const { data, isLoading } = useQuery<{ articles: PortalArticleRow[] }>({
    queryKey: ["/api/publisher/portal/articles", { searchQuery: term, limit: 20 }],
  });
  const rows = (Array.isArray(data?.articles) ? data!.articles : []).filter((a) => !inCampaign.has(a.id));

  const add = useMutation({
    mutationFn: () =>
      apiRequest<{ added: number; ignored: number }>(`/api/publisher/portal/campaigns/${report.campaign.id}/articles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleIds: Array.from(selected) }),
      }),
    onSuccess: (r) => {
      toast({ title: `أُضيف ${r.added} إلى الحملة` });
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/campaigns"] });
      onDone();
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "تعذرت الإضافة", description: err.message }),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="rounded-[20px] bg-card p-4 shadow-sm md:p-5" data-testid="campaign-add-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">أضف من أخباركم</h2>
        <Link
          href={`/dashboard/publisher/article/new?campaign=${report.campaign.id}`}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-primary/10 px-4 text-sm font-semibold text-primary"
        >
          <Plus className="h-4 w-4" />
          خبر جديد في هذه الحملة
        </Link>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بعنوان الخبر"
          className="rounded-full pr-9"
          data-testid="input-campaign-search"
        />
      </div>
      <ul className="mt-3 max-h-72 overflow-y-auto">
        {isLoading ? (
          <li className="py-6 text-center text-sm text-muted-foreground">جارٍ التحميل...</li>
        ) : rows.length === 0 ? (
          <li className="py-6 text-center text-sm text-muted-foreground">لا أخبار مطابقة خارج الحملة</li>
        ) : (
          rows.map((a) => (
            <li key={a.id} className="border-t border-border/60 first:border-t-0">
              <label className="flex cursor-pointer items-center gap-3 py-2.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#1E9BE6]"
                  checked={selected.has(a.id)}
                  onChange={() => toggle(a.id)}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDateShort(a.createdAt)}</span>
              </label>
            </li>
          ))
        )}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button
          className="rounded-full"
          disabled={selected.size === 0 || add.isPending}
          onClick={() => add.mutate()}
          data-testid="button-add-to-campaign"
        >
          {add.isPending ? "جارٍ الإضافة..." : selected.size ? `أضف ${selected.size} للحملة` : "اختر أخبارًا"}
        </Button>
      </div>
    </section>
  );
}

export default function PublisherCampaign() {
  usePublisherAccess();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const key = [`/api/publisher/portal/campaigns/${id}`];
  const { data: report, isLoading, error, refetch } = useQuery<CampaignReport>({ queryKey: key, enabled: !!id });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/campaigns"] });
  };

  const update = useMutation({
    mutationFn: (body: Partial<CampaignInput> & { status?: "active" | "archived" }) =>
      apiRequest(`/api/publisher/portal/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setEditOpen(false);
      refresh();
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "تعذر الحفظ", description: err.message }),
  });

  const remove = useMutation({
    mutationFn: (articleId: string) =>
      apiRequest(`/api/publisher/portal/campaigns/${id}/articles/${articleId}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (err: Error) => toast({ variant: "destructive", title: "تعذرت الإزالة", description: err.message }),
  });

  if (isLoading || !report) {
    return (
      <PublisherLayout>
        <div className="w-full space-y-4" dir="rtl">
          {error ? (
            <div className="rounded-[20px] bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
              {(error as Error).message || "تعذر تحميل الحملة"}
              <div className="mt-3">
                <Link href="/dashboard/publisher/campaigns" className="text-primary hover:underline">
                  العودة إلى الحملات
                </Link>
              </div>
            </div>
          ) : (
            <>
              <Skeleton className="h-16 rounded-[20px]" />
              <Skeleton className="h-40 rounded-[22px]" />
              <Skeleton className="h-64 rounded-[20px]" />
            </>
          )}
        </div>
      </PublisherLayout>
    );
  }

  const { campaign } = report;
  const archived = campaign.status === "archived";
  const period = campaignPeriod(campaign.startsOn, campaign.endsOn);

  return (
    <PublisherLayout>
      <div className="w-full space-y-6" dir="rtl">
        <Link
          href="/dashboard/publisher/campaigns"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" />
          كل الحملات
        </Link>

        <PublisherPageHeader
          icon={FolderKanban}
          eyebrow={archived ? "حملة مؤرشفة" : "ملف حملة"}
          title={campaign.name}
          description={[campaign.clientName ? `العميل: ${campaign.clientName}` : null, period].filter(Boolean).join(" · ") || undefined}
          actions={
            <>
              <Button className="gap-2 rounded-full" onClick={printCampaignReport} data-testid="button-print-campaign">
                <Printer className="h-4 w-4" />
                استخرج تقرير العميل
              </Button>
              <Button variant="outline" className="gap-2 rounded-full" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                تعديل
              </Button>
              <Button
                variant="ghost"
                className="gap-2 rounded-full"
                disabled={update.isPending}
                onClick={() => update.mutate({ status: archived ? "active" : "archived" })}
              >
                {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {archived ? "أعدها للجارية" : "أرشف"}
              </Button>
            </>
          }
        />

        <CampaignHero report={report}>
          <CampaignDayStrip report={report} />
        </CampaignHero>

        <CampaignArticleList
          report={report}
          editable
          onRemove={(articleId) => remove.mutate(articleId)}
          emptyAction={
            <Button className="rounded-full" onClick={() => setAdding(true)}>
              أضف أخبار الحملة
            </Button>
          }
        />

        {adding || report.articles.length > 0 ? (
          <AddArticlesPanel report={report} onDone={() => refetch()} />
        ) : null}
      </div>

      <CampaignFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="تعديل الحملة"
        submitLabel="احفظ"
        pending={update.isPending}
        initial={{
          name: campaign.name,
          clientName: campaign.clientName,
          startsOn: campaign.startsOn,
          endsOn: campaign.endsOn,
          note: campaign.note,
        }}
        onSubmit={(input) => update.mutate(input)}
      />

      <CampaignPrintReport report={report} origin={window.location.origin} />
    </PublisherLayout>
  );
}
