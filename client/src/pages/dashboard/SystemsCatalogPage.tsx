import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes, ExternalLink, FileText, Search } from "lucide-react";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth, hasPermission } from "@/hooks/useAuth";

interface SystemAiToday {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

interface SystemCatalogEntry {
  id: string;
  nameAr: string;
  nameEn: string;
  status: string;
  category: string;
  summary: string;
  docPath: string;
  docExists: boolean;
  fileCount: number;
  aiFeatureKeys: string[];
  dashboardPath: string | null;
  owners: string[];
  lastReviewed: string | null;
  aiToday: SystemAiToday | null;
}

interface CatalogResponse {
  updatedAt: string;
  generatedAt: string;
  count: number;
  inventoryMode: "live" | "snapshot" | "unavailable";
  snapshotGeneratedAt: string | null;
  systems: SystemCatalogEntry[];
}

const STATUS_URL = "/api/admin/systems-catalog";

const CATEGORY_LABELS: Record<string, string> = {
  engagement: "تفاعل",
  sports: "رياضة",
  content: "محتوى",
  ai: "ذكاء اصطناعي",
  intelligence: "استخبارات",
  infra: "بنية",
  monetization: "إيرادات",
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function inventoryLabel(mode: CatalogResponse["inventoryMode"]): string {
  if (mode === "live") return "جرد حي من شجرة الكود";
  if (mode === "snapshot") return "جرد من لقطة مُلتقطة مسبقاً";
  return "جرد الملفات غير متاح على هذا الخادم";
}

export default function SystemsCatalogPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [q, setQ] = useState("");

  const { data: dataRaw, isLoading } = useQuery<CatalogResponse>({
    queryKey: [STATUS_URL],
  });

  const systems = Array.isArray(dataRaw?.systems) ? dataRaw!.systems : [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("ar");
    if (!needle) return systems;
    return systems.filter((s) => {
      const hay = [s.id, s.nameAr, s.nameEn, s.category, s.summary].join(" ").toLocaleLowerCase("ar");
      return hay.includes(needle);
    });
  }, [systems, q]);

  const totals = useMemo(() => {
    let files = 0;
    let tokens = 0;
    let cost = 0;
    let withAi = 0;
    for (const s of systems) {
      files += s.fileCount || 0;
      if (s.aiToday) {
        withAi += 1;
        tokens += s.aiToday.inputTokens + s.aiToday.outputTokens;
        cost += s.aiToday.estimatedCostUsd;
      }
    }
    return { files, tokens, cost, withAi };
  }, [systems]);

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4 mt-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!hasPermission(user, "system.manage_settings")) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-[1600px] px-4 py-10" dir="rtl">
          <p className="text-muted-foreground">لا تملك صلاحية عرض كتالوج الأنظمة.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={Boxes}
          title="كتالوج الأنظمة"
          description="خريطة أنظمة سبق: عدد الملفات، وثيقة SYSTEM.md، واستهلاك الذكاء الاصطناعي اليوم (إن وُجدت مفاتيح الاستخدام)."
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat label="عدد الأنظمة" value={String(dataRaw?.count ?? "—")} />
          <SummaryStat label="ملفات مطابقة" value={isLoading ? "…" : String(totals.files)} />
          <SummaryStat
            label="توكنات اليوم (AI)"
            value={isLoading ? "…" : formatTokens(totals.tokens)}
          />
          <SummaryStat
            label="تكلفة تقديرية اليوم"
            value={isLoading ? "…" : `$${totals.cost.toFixed(2)}`}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث باسم النظام أو التصنيف…"
              className="pr-9"
            />
          </div>
          {dataRaw && (
            <p className="text-xs text-muted-foreground">
              {inventoryLabel(dataRaw.inventoryMode)}
              {dataRaw.snapshotGeneratedAt
                ? ` · لقطة ${new Date(dataRaw.snapshotGeneratedAt).toLocaleString("ar")}`
                : ""}
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        ) : (
          <div className="divide-y rounded-xl border border-border/60 bg-background">
            {filtered.map((sys) => (
              <article key={sys.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-start">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{sys.nameAr}</h2>
                    <Badge variant="secondary">{CATEGORY_LABELS[sys.category] || sys.category}</Badge>
                    <Badge variant={sys.status === "active" ? "default" : "outline"}>{sys.status}</Badge>
                    {!sys.docExists && <Badge variant="destructive">بلا SYSTEM.md</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{sys.summary}</p>
                  <p className="font-mono text-xs text-muted-foreground" dir="ltr">
                    {sys.id} · {sys.docPath}
                  </p>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <span>
                      <strong>{sys.fileCount}</strong> ملف
                    </span>
                    {sys.aiToday ? (
                      <span>
                        اليوم: <strong>{sys.aiToday.requests}</strong> طلب ·{" "}
                        <strong>
                          {formatTokens(sys.aiToday.inputTokens + sys.aiToday.outputTokens)}
                        </strong>{" "}
                        توكن · <strong>${sys.aiToday.estimatedCostUsd.toFixed(3)}</strong>
                      </span>
                    ) : sys.aiFeatureKeys.length > 0 ? (
                      <span className="text-muted-foreground">لا استخدام AI مسجّل اليوم</span>
                    ) : (
                      <span className="text-muted-foreground">لا يستهلك AI عبر Gateway</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {sys.dashboardPath && (
                    <Link
                      href={sys.dashboardPath}
                      className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      اللوحة
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    {sys.docExists ? "موثّق" : "ناقص"}
                  </span>
                </div>
              </article>
            ))}
            {filtered.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground">لا نتائج مطابقة.</p>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
