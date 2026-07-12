// إعدادات التكاملات — غرفة قيادة الخدمات الخارجية.
// تصميم نهاري يتبع ثيم اللوحة (توكنات الثيم، مع دعم الوضع الليلي على نمط
// AI Hub): جدار حالة بمؤشرات نبض حية، قراءات زمن استجابة، وفحص شامل بضغطة.
// لا تعرض الصفحة أي مفتاح أبداً — حالة التهيئة وأسماء المتغيرات الناقصة
// ونتائج الفحص فقط.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Database,
  Globe,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Mail,
  MessageSquare,
  Radar,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth, hasPermission } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface IntegrationStatus {
  key: string;
  name: string;
  nameEn: string;
  category: string;
  configured: boolean;
  missingVars: string[];
  supportsLiveCheck: boolean;
  ok?: boolean;
  latencyMs?: number;
  errorCode?: string;
  checkedAt?: string;
}

const STATUS_URL = "/api/admin/integrations/status";

const CATEGORY_META: Record<string, { label: string; icon: typeof Mail }> = {
  messaging: { label: "الرسائل والإشعارات", icon: MessageSquare },
  email: { label: "البريد", icon: Mail },
  media: { label: "الوسائط", icon: ImageIcon },
  storage: { label: "التخزين", icon: HardDrive },
  infra: { label: "البنية التحتية", icon: Database },
  seo: { label: "محركات البحث", icon: Globe },
  sports: { label: "الرياضة", icon: Trophy },
};

const ERROR_LABELS: Record<string, string> = {
  unauthorized: "المفتاح مرفوض",
  timeout: "انتهت المهلة",
  network: "تعذر الاتصال",
  rate_limited: "تجاوز حد الطلبات",
  not_found: "المورد غير موجود",
  not_configured: "غير مضبوطة",
  not_connected: "غير متصل",
  bucket_not_found: "الحاوية غير موجودة",
  unknown: "خطأ غير معروف",
};

function errorLabel(code?: string): string {
  if (!code) return "فشل الفحص";
  return ERROR_LABELS[code] ?? (code.startsWith("http_") ? `خطأ HTTP ${code.slice(5)}` : code);
}

type Tone = "online" | "fault" | "standby" | "offline";

function toneOf(s: IntegrationStatus): Tone {
  if (!s.configured) return "offline";
  if (s.ok === true) return "online";
  if (s.ok === false) return "fault";
  return "standby";
}

const TONE_STYLES: Record<
  Tone,
  { dot: string; ring: string; label: string; text: string; tile: string }
> = {
  online: {
    dot: "bg-emerald-500",
    ring: "bg-emerald-400/70",
    label: "متصلة",
    text: "text-emerald-600 dark:text-emerald-300",
    tile: "border-emerald-300/70 dark:border-emerald-500/25",
  },
  fault: {
    dot: "bg-red-500",
    ring: "bg-red-400/70",
    label: "عطل",
    text: "text-red-600 dark:text-red-300",
    tile: "border-red-300 dark:border-red-500/40",
  },
  standby: {
    dot: "bg-amber-400",
    ring: "",
    label: "لم تُفحص",
    text: "text-amber-600 dark:text-amber-300",
    tile: "border-border",
  },
  offline: {
    dot: "bg-slate-300 dark:bg-slate-600",
    ring: "",
    label: "غير مضبوطة",
    text: "text-muted-foreground",
    tile: "border-border opacity-80",
  },
};

function StatusLed({ tone }: { tone: Tone }) {
  const style = TONE_STYLES[tone];
  return (
    <span className="relative flex h-3 w-3 shrink-0">
      {style.ring && (
        <span className={`absolute inline-flex h-full w-full rounded-full ${style.ring} animate-ping`} />
      )}
      <span className={`relative inline-flex h-3 w-3 rounded-full ${style.dot}`} />
    </span>
  );
}

function IntegrationTile({
  status,
  testing,
  onTest,
  canManage,
}: {
  status: IntegrationStatus;
  testing: boolean;
  onTest: (key: string) => void;
  canManage: boolean;
}) {
  const tone = toneOf(status);
  const style = TONE_STYLES[tone];
  return (
    <div
      className={`rounded-xl border bg-card shadow-sm p-4 space-y-3 transition-colors ${style.tile}`}
      data-testid={`tile-integration-${status.key}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <StatusLed tone={tone} />
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{status.name}</p>
            <p className="text-[11px] font-mono text-muted-foreground truncate" dir="ltr">
              {status.nameEn}
            </p>
          </div>
        </div>
        <span className={`text-[11px] font-semibold whitespace-nowrap ${style.text}`}>
          {tone === "fault" ? errorLabel(status.errorCode) : style.label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 min-h-[28px]">
        <div className="text-[11px] font-mono text-muted-foreground" dir="ltr">
          {status.ok === true && typeof status.latencyMs === "number" ? (
            <span className="text-emerald-600 dark:text-emerald-400">{status.latencyMs}ms</span>
          ) : !status.configured && status.missingVars.length > 0 ? (
            <span className="block truncate max-w-[180px]" title={status.missingVars.join(", ")}>
              ناقص: {status.missingVars.join("، ")}
            </span>
          ) : !status.supportsLiveCheck && status.configured ? (
            <span>فحص تهيئة فقط</span>
          ) : null}
        </div>
        {canManage && status.supportsLiveCheck && status.configured && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs gap-1.5"
            disabled={testing}
            onClick={() => onTest(status.key)}
            data-testid={`button-test-${status.key}`}
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
            فحص
          </Button>
        )}
      </div>
    </div>
  );
}

export default function IntegrationsSettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [testingKeys, setTestingKeys] = useState<Set<string>>(new Set());
  const [sweeping, setSweeping] = useState(false);

  const { data: dataRaw, isLoading } = useQuery<{ integrations: IntegrationStatus[] }>({
    queryKey: [STATUS_URL],
    refetchInterval: 90_000,
  });
  const integrations = Array.isArray(dataRaw?.integrations) ? dataRaw!.integrations : [];

  const canManage = hasPermission(user, "integrations.manage");

  const summary = useMemo(() => {
    const counts = { online: 0, fault: 0, standby: 0, offline: 0 };
    for (const s of integrations) counts[toneOf(s)]++;
    return counts;
  }, [integrations]);

  const lastChecked = useMemo(() => {
    const times = integrations.map((s) => s.checkedAt).filter(Boolean) as string[];
    if (times.length === 0) return null;
    return new Date(times.sort().at(-1)!);
  }, [integrations]);

  const grouped = useMemo(() => {
    const map = new Map<string, IntegrationStatus[]>();
    for (const s of integrations) {
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return map;
  }, [integrations]);

  const applyResult = (result: IntegrationStatus) => {
    queryClient.setQueryData<{ integrations: IntegrationStatus[] }>([STATUS_URL], (prev) =>
      prev
        ? { integrations: prev.integrations.map((s) => (s.key === result.key ? result : s)) }
        : prev,
    );
  };

  const testOne = async (key: string) => {
    setTestingKeys((prev) => new Set(prev).add(key));
    try {
      const result = (await apiRequest(`/api/admin/integrations/${key}/test`, {
        method: "POST",
      })) as IntegrationStatus;
      applyResult(result);
    } catch {
      toast({ title: "خطأ", description: "فشل تنفيذ الفحص", variant: "destructive" });
    } finally {
      setTestingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const sweepAll = async () => {
    setSweeping(true);
    try {
      const result = (await apiRequest("/api/admin/integrations/test-all", {
        method: "POST",
      })) as { integrations: IntegrationStatus[] };
      if (Array.isArray(result?.integrations)) {
        queryClient.setQueryData([STATUS_URL], result);
        const faults = result.integrations.filter((s) => s.ok === false && s.configured).length;
        toast({
          title: "اكتمل المسح الشامل",
          description: faults === 0 ? "كل الخدمات المضبوطة متصلة" : `رُصدت ${faults} خدمة بها عطل`,
          variant: faults === 0 ? "default" : "destructive",
        });
      }
    } catch {
      toast({ title: "خطأ", description: "فشل المسح الشامل", variant: "destructive" });
    } finally {
      setSweeping(false);
    }
  };

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

  if (!hasPermission(user, "integrations.view")) {
    return (
      <DashboardLayout>
        <Card className="max-w-lg mx-auto mt-16">
          <CardContent className="py-10 text-center space-y-2">
            <ShieldCheck className="w-10 h-10 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-bold">إعدادات التكاملات</h2>
            <p className="text-sm text-muted-foreground">لا تملك صلاحية الوصول إلى هذه الصفحة</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div dir="rtl" className="space-y-6 pb-10">
        {/* شريط القيادة العلوي */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-indigo-50 border border-indigo-200 dark:bg-indigo-500/15 dark:border-indigo-400/30 flex items-center justify-center">
              <Radar className={`h-5 w-5 text-indigo-600 dark:text-indigo-300 ${sweeping ? "animate-spin" : ""}`} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-foreground">
                غرفة قيادة التكاملات
              </h1>
              <p className="text-xs text-muted-foreground font-mono" dir="ltr">
                {lastChecked
                  ? `آخر مسح: ${lastChecked.toLocaleTimeString("ar-SA")}`
                  : "لم يُنفذ أي مسح بعد"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["online", summary.online],
                ["fault", summary.fault],
                ["standby", summary.standby],
                ["offline", summary.offline],
              ] as [Tone, number][]
            ).map(([tone, count]) => (
              <span
                key={tone}
                className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs shadow-sm"
                data-testid={`chip-summary-${tone}`}
              >
                <StatusLed tone={tone} />
                <span className={TONE_STYLES[tone].text}>{TONE_STYLES[tone].label}</span>
                <span className="font-mono text-foreground">{count}</span>
              </span>
            ))}
            {canManage && (
              <Button
                onClick={sweepAll}
                disabled={sweeping}
                className="gap-2 bg-indigo-600 hover:bg-indigo-500 text-white"
                data-testid="button-sweep-all"
              >
                {sweeping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
                فحص شامل
              </Button>
            )}
          </div>
        </div>

        {/* جدار الحالة */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([category, items]) => {
              const meta = CATEGORY_META[category] ?? { label: category, icon: Database };
              const CategoryIcon = meta.icon;
              return (
                <section key={category} className="space-y-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CategoryIcon className="h-4 w-4" />
                    <h2 className="text-xs font-bold uppercase tracking-widest">{meta.label}</h2>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {items.map((status) => (
                      <IntegrationTile
                        key={status.key}
                        status={status}
                        testing={testingKeys.has(status.key)}
                        onTest={testOne}
                        canManage={canManage}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground border-t pt-4">
          المفاتيح تُدار حصراً عبر متغيرات البيئة على Railway ولا تُعرض هنا إطلاقاً. هذه اللوحة
          تعرض حالة التهيئة ونتائج فحوص اتصال قراءة-فقط (لا تُرسل رسائل أو بريداً تجريبياً).
          نتائج الفحص تُخزن مؤقتاً لمدة دقيقة.
        </p>
      </div>
    </DashboardLayout>
  );
}
