import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { FolderKanban, Plus } from "lucide-react";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { PublisherPageHeader } from "@/components/publisher/PublisherPageHeader";
import { CampaignFormDialog } from "@/components/publisher/CampaignFormDialog";
import { campaignPeriod, type CampaignSummary } from "@/components/publisher/campaignTypes";
import { CampaignProgressBar } from "@/components/publisher/CampaignReportBody";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CampaignInput } from "@shared/publisherCampaigns";

export default function PublisherCampaigns() {
  usePublisherAccess();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const status = showArchived ? "archived" : "active";
  const { data, isLoading, error } = useQuery<{ campaigns: CampaignSummary[] }>({
    queryKey: ["/api/publisher/portal/campaigns", { status }],
  });
  const campaigns = Array.isArray(data?.campaigns) ? data!.campaigns : [];

  const create = useMutation({
    mutationFn: (input: CampaignInput) =>
      apiRequest<CampaignSummary>("/api/publisher/portal/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/campaigns"] });
      setCreateOpen(false);
      setLocation(`/dashboard/publisher/campaigns/${row.id}`);
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "تعذر إنشاء الحملة", description: err.message }),
  });

  return (
    <PublisherLayout>
      <div className="w-full space-y-6" dir="rtl">
        <PublisherPageHeader
          icon={FolderKanban}
          eyebrow="الحملات"
          title="ملفات الحملات"
          description="اجمع أخبار عميل أو مناسبة في ملف واحد، واستخرج منه تقريرًا لعميلك."
          actions={
            <Button className="gap-2 rounded-full" onClick={() => setCreateOpen(true)} data-testid="button-new-campaign">
              <Plus className="h-4 w-4" />
              حملة جديدة
            </Button>
          }
        />

        <div className="flex gap-2">
          {(["active", "archived"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setShowArchived(key === "archived")}
              className={cn(
                "min-h-[40px] rounded-full px-4 text-sm font-semibold transition-colors",
                status === key ? "bg-primary text-primary-foreground shadow-[0_6px_16px_rgba(30,155,230,.3)]" : "bg-card text-muted-foreground shadow-sm",
              )}
            >
              {key === "active" ? "الجارية" : "المؤرشفة"}
            </button>
          ))}
        </div>

        {isLoading ? (
          <Skeleton className="h-64 rounded-[20px]" />
        ) : error ? (
          <div className="rounded-[20px] bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
            {(error as Error).message || "تعذر تحميل الحملات"}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="rounded-[20px] bg-card px-6 py-14 text-center shadow-sm" data-testid="campaigns-empty">
            <FolderKanban className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-semibold">{showArchived ? "لا حملات مؤرشفة" : "لا حملات بعد"}</p>
            {!showArchived ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  مثال: «معرض الرياض للعقار» لعميل يشارك فيه. أضف أخباره، ثم اطبع التقرير بضغطة.
                </p>
                <Button className="mt-4 rounded-full" onClick={() => setCreateOpen(true)}>
                  أنشئ أول حملة
                </Button>
              </>
            ) : null}
          </div>
        ) : (
          <section className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_2px_rgba(27,43,58,.04),0_8px_24px_rgba(27,43,58,.06)]">
            <ul>
              {campaigns.map((c, i) => {
                const period = campaignPeriod(c.startsOn, c.endsOn);
                return (
                  <li key={c.id} className={cn(i > 0 && "border-t border-border/60")}>
                    <Link
                      href={`/dashboard/publisher/campaigns/${c.id}`}
                      className="flex flex-wrap items-center gap-4 px-4 py-4 hover:bg-muted/40 md:px-5"
                      data-testid={`campaign-row-${c.id}`}
                    >
                      <div className="min-w-0 flex-[1_1_260px]">
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {[c.clientName ? `العميل: ${c.clientName}` : null, period].filter(Boolean).join(" · ") || "بلا عميل أو فترة"}
                        </div>
                      </div>
                      <div className="w-full sm:w-56">
                        <CampaignProgressBar counts={c.counts} />
                        <div className="mt-1 text-xs text-muted-foreground">
                          <bdi className="tabular-nums">{formatNumber(c.counts.published)}</bdi> منشورة من{" "}
                          <bdi className="tabular-nums">{formatNumber(c.counts.total)}</bdi>
                          {c.counts.needsChanges ? ` · ${formatNumber(c.counts.needsChanges)} تحتاج تعديلك` : ""}
                        </div>
                      </div>
                      <div className="w-28 text-left">
                        <bdi className="block font-bold tabular-nums">{formatNumber(c.views)}</bdi>
                        <span className="text-xs text-muted-foreground">قراءة حتى الآن</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <CampaignFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="حملة جديدة"
        submitLabel="أنشئ الحملة"
        pending={create.isPending}
        onSubmit={(input) => create.mutate(input)}
      />
    </PublisherLayout>
  );
}
