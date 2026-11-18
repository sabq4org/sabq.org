import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowRight, FolderKanban, Printer } from "lucide-react";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { AdminPublisherNav } from "@/components/admin/publishers/AdminPublisherNav";
import { CampaignPrintReport } from "@/components/publisher/CampaignPrintReport";
import { CampaignArticleList, CampaignDayStrip, CampaignHero } from "@/components/publisher/CampaignReportBody";
import { campaignPeriod, type CampaignReport } from "@/components/publisher/campaignTypes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function printReport() {
  const go = () => window.print();
  if (document.fonts?.ready) document.fonts.ready.then(go).catch(go);
  else go();
}

/** تقرير حملة وكالة كما تراه الوكالة، للقراءة والطباعة فقط من لوحة الإدارة. */
export default function AdminPublisherCampaign() {
  useRoleProtection("admin");
  const { id } = useParams<{ id: string }>();
  const { data: report, isLoading, error } = useQuery<CampaignReport>({
    queryKey: [`/api/admin/publishers/campaigns/${id}`],
    enabled: !!id,
  });

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1400px] space-y-5 pb-10" dir="rtl">
        <Link
          href="/dashboard/admin/publishers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" />
          إدارة الناشرين
        </Link>

        {isLoading ? (
          <>
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-40 rounded-[22px]" />
          </>
        ) : !report ? (
          <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
            {(error as Error | null)?.message || "الحملة غير موجودة"}
          </div>
        ) : (
          <>
            <DashboardPageHeader
              icon={FolderKanban}
              title={report.campaign.name}
              description={
                [report.agency.name, report.campaign.clientName ? `العميل: ${report.campaign.clientName}` : null, campaignPeriod(report.campaign.startsOn, report.campaign.endsOn)]
                  .filter(Boolean)
                  .join(" · ")
              }
              actions={
                <Button className="gap-2 rounded-full" onClick={printReport}>
                  <Printer className="h-4 w-4" />
                  اطبع تقرير الحملة
                </Button>
              }
            />
            <AdminPublisherNav />
            <CampaignHero report={report}>
              <CampaignDayStrip report={report} />
            </CampaignHero>
            <CampaignArticleList report={report} editable={false} />
            <CampaignPrintReport report={report} origin={window.location.origin} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
