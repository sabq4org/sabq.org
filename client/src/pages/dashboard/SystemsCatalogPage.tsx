import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  Coins,
  ExternalLink,
  FileStack,
  FileText,
  Search,
  Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth, hasPermission } from "@/hooks/useAuth";
import type { LucideIcon } from "lucide-react";

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

/** يطابق MetricCard في NewsroomPulseDashboard */
function CatalogMetricCard({
  title,
  value,
  icon: Icon,
  helper,
  loading,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  helper?: string;
  loading?: boolean;
}) {
  return (
    <Card className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-none sm:rounded-2xl sm:shadow-sm">
      <CardContent className="flex h-full flex-col p-0">
        <div className="flex flex-1 flex-col gap-2 p-3 sm:gap-3 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-10 sm:w-10 sm:rounded-xl">
              <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            </span>
          </div>
          <div>
            <p className="text-xs font-semibold leading-snug text-foreground sm:text-[13px]">{title}</p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-16 sm:h-9 sm:w-20" />
            ) : (
              <p className="mt-1 text-xl font-bold tabular-nums tracking-tight sm:mt-1.5 sm:text-[2rem]">
                {value}
              </p>
            )}
          </div>
        </div>
        {helper ? (
          <div className="hidden border-t border-border/60 bg-muted/30 px-4 py-2.5 sm:block">
            <p className="text-[11px] leading-relaxed text-muted-foreground">{helper}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
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
    let documented = 0;
    for (const s of systems) {
      files += s.fileCount || 0;
      if (s.docExists) documented += 1;
      if (s.aiToday) {
        tokens += s.aiToday.inputTokens + s.aiToday.outputTokens;
        cost += s.aiToday.estimatedCostUsd;
      }
    }
    return { files, tokens, cost, documented };
  }, [systems]);

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4 mt-4">
          <Skeleton className="h-24 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
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

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CatalogMetricCard
            title="عدد الأنظمة"
            value={dataRaw?.count != null ? String(dataRaw.count) : "—"}
            icon={Boxes}
            helper="أنظمة مسجّلة في registry.json"
            loading={isLoading}
          />
          <CatalogMetricCard
            title="ملفات مطابقة"
            value={String(totals.files)}
            icon={FileStack}
            helper={`${totals.documented} نظاماً بوثيقة SYSTEM.md`}
            loading={isLoading}
          />
          <CatalogMetricCard
            title="توكنات اليوم (AI)"
            value={formatTokens(totals.tokens)}
            icon={Sparkles}
            helper="مجموع الإدخال والإخراج عبر Gateway"
            loading={isLoading}
          />
          <CatalogMetricCard
            title="تكلفة تقديرية اليوم"
            value={`$${totals.cost.toFixed(2)}`}
            icon={Coins}
            helper="تقدير من سجلات ai_usage_logs"
            loading={isLoading}
          />
        </section>

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
          <div className="grid gap-3">
            {filtered.map((sys) => (
              <article
                key={sys.id}
                className="grid gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-none sm:grid-cols-[1fr_auto] sm:items-start sm:p-5"
              >
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
                    {sys.aiToday && sys.aiToday.requests > 0 ? (
                      <span>
                        اليوم: <strong>{sys.aiToday.requests}</strong> طلب ·{" "}
                        <strong>
                          {formatTokens(sys.aiToday.inputTokens + sys.aiToday.outputTokens)}
                        </strong>{" "}
                        توكن · <strong>${sys.aiToday.estimatedCostUsd.toFixed(3)}</strong>
                      </span>
                    ) : sys.aiFeatureKeys.length > 0 ? (
                      <span className="text-muted-foreground">
                        مربوط بـ {sys.aiFeatureKeys.length} مفتاح AI · لا استخدام مسجّل اليوم بعد
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        لا مفاتيح AI مربوطة في السجل (قد يستهلك أنظمة مجاورة)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {sys.dashboardPath && (
                    <Link
                      href={sys.dashboardPath}
                      className="inline-flex items-center gap-1 rounded-xl border border-border/70 px-3 py-1.5 text-sm transition hover:bg-muted/40"
                    >
                      اللوحة
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-xl border border-border/70 px-3 py-1.5 text-sm text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    {sys.docExists ? "موثّق" : "ناقص"}
                  </span>
                </div>
              </article>
            ))}
            {filtered.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-6 text-sm text-muted-foreground">
                لا نتائج مطابقة.
              </p>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
