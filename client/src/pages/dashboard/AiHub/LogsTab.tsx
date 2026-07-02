// AI Hub — Logs tab: raw call log with filters, the config-change audit
// trail, and monthly budget limits with 80%/100% alerts.

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { ChevronRight, ChevronLeft, PiggyBank, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  formatInt,
  formatMs,
  formatTokens,
  formatUsd,
  providerName,
  STATUS_META,
  type AuditRow,
  type BudgetRow,
  type FeatureRow,
  type LogRow,
} from "./shared";

const PAGE_SIZE = 50;

interface LogsPayload {
  rows: LogRow[];
  total: number;
}

interface BudgetEdit {
  scope: string;
  scopeKey: string;
  monthlyLimitUsd: string;
  alertAt80: boolean;
  alertAt100: boolean;
  isEnabled: boolean;
}

const ENTITY_LABELS: Record<string, string> = {
  feature: "ميزة",
  model: "نموذج",
  budget: "ميزانية",
};

export default function LogsTab() {
  const { toast } = useToast();
  const [feature, setFeature] = useState("all");
  const [provider, setProvider] = useState("all");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState<DateRange | undefined>();
  const [page, setPage] = useState(1);
  const [budgetEdit, setBudgetEdit] = useState<BudgetEdit | null>(null);

  const logsUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (feature !== "all") params.set("feature", feature);
    if (provider !== "all") params.set("provider", provider);
    if (status !== "all") params.set("status", status);
    if (range?.from) params.set("from", range.from.toISOString());
    if (range?.to) {
      const end = new Date(range.to);
      end.setHours(23, 59, 59, 999);
      params.set("to", end.toISOString());
    }
    return `/api/admin/ai-hub/logs?${params.toString()}`;
  }, [feature, provider, status, range, page]);

  const { data: logsRaw, isLoading } = useQuery<LogsPayload>({ queryKey: [logsUrl] });
  const { data: featuresRaw } = useQuery<FeatureRow[]>({ queryKey: ["/api/admin/ai-hub/features"] });
  const { data: auditRaw } = useQuery<AuditRow[]>({ queryKey: ["/api/admin/ai-hub/audit"] });
  const { data: budgetsRaw } = useQuery<BudgetRow[]>({ queryKey: ["/api/admin/ai-hub/budgets"] });

  const logs = logsRaw?.rows ?? [];
  const total = logsRaw?.total ?? 0;
  const features = Array.isArray(featuresRaw) ? featuresRaw : [];
  const audit = Array.isArray(auditRaw) ? auditRaw : [];
  const budgets = Array.isArray(budgetsRaw) ? budgetsRaw : [];
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const budgetMutation = useMutation({
    mutationFn: async (b: BudgetEdit) =>
      apiRequest("/api/admin/ai-hub/budgets", {
        method: "PUT",
        body: JSON.stringify({ ...b, monthlyLimitUsd: Number(b.monthlyLimitUsd) }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-hub/budgets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-hub/overview"] });
      setBudgetEdit(null);
      toast({ title: "حُفظت الميزانية" });
    },
    onError: (err: Error) => toast({ title: "تعذر الحفظ", description: err.message, variant: "destructive" }),
  });

  function resetFilters<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3.5 flex flex-wrap items-center gap-3">
          <Select value={feature} onValueChange={resetFilters(setFeature)}>
            <SelectTrigger className="w-48 h-9">
              <SelectValue placeholder="كل الميزات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الميزات</SelectItem>
              {features.map((f) => (
                <SelectItem key={f.featureKey} value={f.featureKey}>
                  {f.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={provider} onValueChange={resetFilters(setProvider)}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المزودين</SelectItem>
              {["openai", "anthropic", "gemini", "elevenlabs"].map((p) => (
                <SelectItem key={p} value={p}>
                  {providerName(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={resetFilters(setStatus)}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="success">نجاح</SelectItem>
              <SelectItem value="fallback">تحويل</SelectItem>
              <SelectItem value="failed">فشل</SelectItem>
            </SelectContent>
          </Select>
          <DatePickerWithRange date={range} onDateChange={resetFilters(setRange)} placeholder="كل الفترات" />
          <span className="text-xs text-muted-foreground ms-auto tabular-nums">{formatInt(total)} استدعاء</span>
        </CardContent>
      </Card>

      {/* Log table */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-64 rounded-xl" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right text-xs">الوقت</TableHead>
                  <TableHead className="text-right text-xs">الميزة</TableHead>
                  <TableHead className="text-right text-xs">النموذج</TableHead>
                  <TableHead className="text-right text-xs">العملية</TableHead>
                  <TableHead className="text-right text-xs">التوكنز</TableHead>
                  <TableHead className="text-right text-xs">التكلفة</TableHead>
                  <TableHead className="text-right text-xs">الزمن</TableHead>
                  <TableHead className="text-right text-xs">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((row) => {
                  const meta = STATUS_META[row.status] ?? STATUS_META.failed;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs whitespace-nowrap tabular-nums">
                        {format(new Date(row.createdAt), "d MMM HH:mm:ss", { locale: ar })}
                      </TableCell>
                      <TableCell className="text-xs">{row.featureKey}</TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">
                        {row.provider}/{row.modelId}
                      </TableCell>
                      <TableCell className="text-xs">{row.operation}</TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">
                        {row.inputTokens || row.outputTokens
                          ? `${formatTokens(row.inputTokens)} ← ${formatTokens(row.outputTokens)}`
                          : row.unitCount
                            ? `${formatInt(row.unitCount)} وحدة`
                            : "—"}
                      </TableCell>
                      <TableCell className="text-xs font-semibold tabular-nums">{formatUsd(row.estimatedCostUsd)}</TableCell>
                      <TableCell className="text-xs tabular-nums">{formatMs(row.latencyMs)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${meta.className}`} title={row.errorMessage ?? undefined}>
                          {meta.label}
                          {row.errorCode ? ` · ${row.errorCode}` : ""}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
                      لا استدعاءات مطابقة للفلاتر
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 py-3 border-t">
              <Button size="icon" variant="outline" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <span className="text-xs tabular-nums">
                {page} / {formatInt(totalPages)}
              </span>
              <Button size="icon" variant="outline" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Config audit trail */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">سجل تغييرات الإعدادات</CardTitle>
            <p className="text-xs text-muted-foreground">من بدّل أي نموذج ومتى — مساءلة كاملة</p>
          </CardHeader>
          <CardContent className="space-y-2.5 max-h-96 overflow-y-auto">
            {audit.map((a) => (
              <div key={a.id} className="bg-muted/50 rounded-xl px-3 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {ENTITY_LABELS[a.entityType] ?? a.entityType}
                  </Badge>
                  <b>{a.entityKey}</b>
                  <span className="ms-auto text-muted-foreground tabular-nums">
                    {format(new Date(a.createdAt), "d MMM HH:mm", { locale: ar })}
                  </span>
                </div>
                <div className="mt-1.5 text-muted-foreground">
                  بواسطة <b className="text-foreground">{a.userName ?? "غير معروف"}</b>
                  {a.changes && Object.keys(a.changes).length > 0 && (
                    <span dir="ltr" className="block mt-1 font-mono text-[10px] leading-relaxed break-all">
                      {Object.entries(a.changes)
                        .map(([k, v]) => `${k}: ${JSON.stringify(v.from)} → ${JSON.stringify(v.to)}`)
                        .join(" · ")}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {audit.length === 0 && <p className="text-xs text-muted-foreground py-4">لا تغييرات مسجلة بعد</p>}
          </CardContent>
        </Card>

        {/* Budgets */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <PiggyBank className="w-4 h-4" />
                الميزانيات الشهرية
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">تنبيه تلقائي عند 80% و100% من الحد</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() =>
                setBudgetEdit({ scope: "global", scopeKey: "", monthlyLimitUsd: "500", alertAt80: true, alertAt100: true, isEnabled: true })
              }
            >
              <Plus className="w-3.5 h-3.5" />
              ميزانية
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {budgets.map((b) => {
              const pct = b.monthlyLimitUsd > 0 ? Math.min((b.spentThisMonthUsd / b.monthlyLimitUsd) * 100, 100) : 0;
              const over80 = pct >= 80;
              const scopeLabel =
                b.scope === "global" ? "عام — كل المزودين" : b.scope === "provider" ? providerName(b.scopeKey) : b.scopeKey;
              return (
                <button
                  key={b.id}
                  className="w-full text-right bg-muted/50 hover:bg-muted rounded-xl px-3 py-2.5 transition-colors"
                  onClick={() =>
                    setBudgetEdit({
                      scope: b.scope,
                      scopeKey: b.scopeKey,
                      monthlyLimitUsd: String(b.monthlyLimitUsd),
                      alertAt80: b.alertAt80,
                      alertAt100: b.alertAt100,
                      isEnabled: b.isEnabled,
                    })
                  }
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold">{scopeLabel}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatUsd(b.spentThisMonthUsd)} من {formatUsd(b.monthlyLimitUsd)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-background overflow-hidden" dir="ltr">
                    <div
                      className={`h-full rounded-full ${over80 ? "bg-amber-500" : "bg-indigo-500"}`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </button>
              );
            })}
            {budgets.length === 0 && (
              <p className="text-xs text-muted-foreground py-4">
                لا ميزانيات محددة — أضف حدًّا شهريًا ليظهر مؤشر الميزانية في النظرة العامة
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Budget dialog */}
      <Dialog open={budgetEdit !== null} onOpenChange={(open) => !open && setBudgetEdit(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">ميزانية شهرية</DialogTitle>
          </DialogHeader>
          {budgetEdit && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">النطاق</Label>
                  <Select
                    value={budgetEdit.scope}
                    onValueChange={(v) => setBudgetEdit({ ...budgetEdit, scope: v, scopeKey: v === "global" ? "" : budgetEdit.scopeKey })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">عام</SelectItem>
                      <SelectItem value="provider">مزود</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {budgetEdit.scope === "provider" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">المزود</Label>
                    <Select value={budgetEdit.scopeKey || "openai"} onValueChange={(v) => setBudgetEdit({ ...budgetEdit, scopeKey: v })}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["openai", "anthropic", "gemini", "elevenlabs"].map((p) => (
                          <SelectItem key={p} value={p}>
                            {providerName(p)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">الحد الشهري ($)</Label>
                <Input
                  type="number"
                  min="0"
                  className="h-9"
                  value={budgetEdit.monthlyLimitUsd}
                  onChange={(e) => setBudgetEdit({ ...budgetEdit, monthlyLimitUsd: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between bg-muted/60 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold">تنبيه عند 80%</span>
                <Switch checked={budgetEdit.alertAt80} onCheckedChange={(v) => setBudgetEdit({ ...budgetEdit, alertAt80: v })} />
              </div>
              <div className="flex items-center justify-between bg-muted/60 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold">تنبيه عند 100%</span>
                <Switch checked={budgetEdit.alertAt100} onCheckedChange={(v) => setBudgetEdit({ ...budgetEdit, alertAt100: v })} />
              </div>
              <div className="flex items-center justify-between bg-muted/60 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold">مفعّلة</span>
                <Switch checked={budgetEdit.isEnabled} onCheckedChange={(v) => setBudgetEdit({ ...budgetEdit, isEnabled: v })} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBudgetEdit(null)}>
              إلغاء
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={budgetMutation.isPending || !budgetEdit?.monthlyLimitUsd}
              onClick={() => budgetEdit && budgetMutation.mutate(budgetEdit)}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
