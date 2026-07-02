// AI Hub — Features tab: per-feature model routing. Changing the primary
// model / fallback chain here applies within ~60s (config cache TTL) with
// no deploy. Embeddings is UI-locked: failover stays off.

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, FlaskConical, Lock, Pencil, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  CATEGORY_LABELS,
  formatInt,
  formatMs,
  formatUsd,
  providerName,
  type FeatureRow,
  type ModelRow,
  type TestResult,
} from "./shared";

const FEATURES_KEY = ["/api/admin/ai-hub/features"];

interface EditState {
  featureKey: string;
  displayName: string;
  primaryModelId: string;
  fallbackChain: string[];
  maxTokens: string;
  temperature: string;
  allowFailover: boolean;
  locked: boolean;
}

export default function FeaturesTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [testResult, setTestResult] = useState<{ feature: string; result: TestResult } | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);

  const { data: featuresRaw, isLoading } = useQuery<FeatureRow[]>({ queryKey: FEATURES_KEY });
  const { data: modelsRaw } = useQuery<ModelRow[]>({ queryKey: ["/api/admin/ai-hub/models"] });

  const features = Array.isArray(featuresRaw) ? featuresRaw : [];
  const models = Array.isArray(modelsRaw) ? modelsRaw : [];
  const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

  const categories = useMemo(
    () => Array.from(new Set(features.map((f) => f.category))).sort(),
    [features],
  );

  const filtered = features.filter((f) => {
    if (category !== "all" && f.category !== category) return false;
    if (search && !`${f.displayName} ${f.featureKey}`.includes(search)) return false;
    return true;
  });

  const patchMutation = useMutation({
    mutationFn: async ({ key, patch }: { key: string; patch: Record<string, unknown> }) =>
      apiRequest(`/api/admin/ai-hub/features/${key}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FEATURES_KEY });
      toast({ title: "تم الحفظ", description: "يسري التغيير خلال دقيقة على الأكثر" });
    },
    onError: (err: Error) => toast({ title: "تعذر الحفظ", description: err.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async (key: string) =>
      apiRequest<TestResult>(`/api/admin/ai-hub/features/${key}/test`, { method: "POST", body: JSON.stringify({}) }),
    onSettled: () => setTestingKey(null),
    onSuccess: (result, key) => setTestResult({ feature: key, result }),
    onError: (err: Error) => toast({ title: "فشل الاختبار", description: err.message, variant: "destructive" }),
  });

  function openEdit(f: FeatureRow) {
    setEdit({
      featureKey: f.featureKey,
      displayName: f.displayName,
      primaryModelId: f.primaryModel?.id ?? "",
      fallbackChain: f.fallbackChain.map((m) => m.id),
      maxTokens: f.maxTokens?.toString() ?? "",
      temperature: f.temperature?.toString() ?? "",
      allowFailover: f.allowFailover,
      locked: f.featureKey === "embeddings",
    });
  }

  function saveEdit() {
    if (!edit) return;
    patchMutation.mutate({
      key: edit.featureKey,
      patch: {
        primaryModelId: edit.primaryModelId || undefined,
        fallbackChain: edit.fallbackChain,
        maxTokens: edit.maxTokens === "" ? null : Number(edit.maxTokens),
        temperature: edit.temperature === "" ? null : Number(edit.temperature),
        allowFailover: edit.allowFailover,
      },
    });
    setEdit(null);
  }

  function moveChain(index: number, dir: -1 | 1) {
    if (!edit) return;
    const chain = [...edit.fallbackChain];
    const target = index + dir;
    if (target < 0 || target >= chain.length) return;
    [chain[index], chain[target]] = [chain[target], chain[index]];
    setEdit({ ...edit, fallbackChain: chain });
  }

  if (isLoading) {
    return <Skeleton className="h-96 rounded-2xl" />;
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3.5 flex flex-wrap items-center gap-3">
          <Input
            placeholder="ابحث عن ميزة…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-56 h-9"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c] ?? c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ms-auto">
            {formatInt(filtered.length)} ميزة · تغيير النموذج يسري بدون deploy
          </span>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الميزة</TableHead>
                <TableHead className="text-right">القسم</TableHead>
                <TableHead className="text-right">النموذج الأساسي</TableHead>
                <TableHead className="text-right">سلسلة الاحتياط</TableHead>
                <TableHead className="text-right">استهلاك 30 يومًا</TableHead>
                <TableHead className="text-right">مفعّلة</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => (
                <TableRow key={f.featureKey} className={!f.isEnabled ? "opacity-55" : undefined}>
                  <TableCell>
                    <div className="font-semibold text-sm flex items-center gap-1.5">
                      {f.displayName}
                      {f.featureKey === "embeddings" && (
                        <span title="مثبّتة — المتجهات غير متوافقة بين النماذج">
                          <Lock className="w-3.5 h-3.5 text-amber-600" />
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground" dir="ltr">
                      {f.featureKey}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[11px]">
                      {CATEGORY_LABELS[f.category] ?? f.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {f.primaryModel ? (
                      <div className="text-xs">
                        <div className="font-semibold">{f.primaryModel.displayName}</div>
                        <div className="text-muted-foreground" dir="ltr">
                          {providerName(f.primaryModel.provider)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-red-600">غير محدد</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-52">
                      {f.fallbackChain.map((m, i) => (
                        <Badge key={m.id} variant="outline" className="text-[10px] gap-1">
                          <span className="text-muted-foreground">{i + 1}</span>
                          {m.displayName}
                        </Badge>
                      ))}
                      {f.fallbackChain.length === 0 && <span className="text-[11px] text-muted-foreground">بدون احتياط</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-bold tabular-nums">{formatUsd(f.usage30d.costUsd)}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {formatInt(f.usage30d.requests)} طلب
                      {f.usage30d.fallbacks > 0 && ` · ${formatInt(f.usage30d.fallbacks)} تحويل`}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={f.isEnabled}
                      onCheckedChange={(checked) =>
                        patchMutation.mutate({ key: f.featureKey, patch: { isEnabled: checked } })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => openEdit(f)}>
                        <Pencil className="w-3.5 h-3.5" />
                        تعديل
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1.5"
                        disabled={testingKey === f.featureKey}
                        onClick={() => {
                          setTestingKey(f.featureKey);
                          testMutation.mutate(f.featureKey);
                        }}
                      >
                        <FlaskConical className="w-3.5 h-3.5" />
                        {testingKey === f.featureKey ? "يجري…" : "اختبار"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={edit !== null} onOpenChange={(open) => !open && setEdit(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">تعديل: {edit?.displayName}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">النموذج الأساسي</Label>
                <Select value={edit.primaryModelId} onValueChange={(v) => setEdit({ ...edit, primaryModelId: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="اختر نموذجًا" />
                  </SelectTrigger>
                  <SelectContent>
                    {models
                      .filter((m) => m.isActive)
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {providerName(m.provider)} — {m.displayName}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  سلسلة الاحتياط (بالترتيب)
                  {edit.locked && (
                    <span className="text-amber-600 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> مقفلة للمتجهات
                    </span>
                  )}
                </Label>
                <div className="space-y-1.5">
                  {edit.fallbackChain.map((id, i) => (
                    <div key={id} className="flex items-center gap-2 bg-muted/60 rounded-lg px-2.5 py-1.5">
                      <span className="text-[11px] font-bold text-muted-foreground w-4">{i + 1}</span>
                      <span className="text-xs font-medium flex-1">
                        {modelById.get(id)?.displayName ?? id}
                        <span className="text-muted-foreground"> · {providerName(modelById.get(id)?.provider ?? "")}</span>
                      </span>
                      <Button size="icon" variant="ghost" className="h-6 w-6" disabled={edit.locked} onClick={() => moveChain(i, -1)}>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" disabled={edit.locked} onClick={() => moveChain(i, 1)}>
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-red-600"
                        disabled={edit.locked}
                        onClick={() => setEdit({ ...edit, fallbackChain: edit.fallbackChain.filter((x) => x !== id) })}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  {!edit.locked && (
                    <Select
                      value=""
                      onValueChange={(v) => v && setEdit({ ...edit, fallbackChain: [...edit.fallbackChain, v] })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Plus className="w-3.5 h-3.5" /> إضافة نموذج احتياطي
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {models
                          .filter((m) => m.isActive && m.id !== edit.primaryModelId && !edit.fallbackChain.includes(m.id))
                          .map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {providerName(m.provider)} — {m.displayName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">أقصى توكنز (اختياري)</Label>
                  <Input
                    type="number"
                    className="h-9"
                    value={edit.maxTokens}
                    onChange={(e) => setEdit({ ...edit, maxTokens: e.target.value })}
                    placeholder="افتراضي النموذج"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">درجة الحرارة (اختياري)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    className="h-9"
                    value={edit.temperature}
                    onChange={(e) => setEdit({ ...edit, temperature: e.target.value })}
                    placeholder="افتراضي النموذج"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between bg-muted/60 rounded-lg px-3 py-2.5">
                <div>
                  <div className="text-xs font-semibold">التحويل التلقائي عند الفشل</div>
                  <div className="text-[11px] text-muted-foreground">
                    {edit.locked ? "مقفل — المتجهات غير متوافقة بين النماذج" : "عند نفاد الرصيد أو خطأ المفاتيح ينتقل للاحتياط فورًا"}
                  </div>
                </div>
                <Switch
                  checked={edit.allowFailover}
                  disabled={edit.locked}
                  onCheckedChange={(v) => setEdit({ ...edit, allowFailover: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEdit(null)}>
              إلغاء
            </Button>
            <Button onClick={saveEdit} disabled={patchMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
              حفظ التغييرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test result dialog */}
      <Dialog open={testResult !== null} onOpenChange={(open) => !open && setTestResult(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">نتيجة اختبار: {testResult?.feature}</DialogTitle>
          </DialogHeader>
          {testResult?.result.ok ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-muted/60 rounded-lg py-2">
                  <div className="text-[10px] text-muted-foreground">النموذج</div>
                  <div className="text-xs font-bold" dir="ltr">
                    {testResult.result.modelId}
                  </div>
                </div>
                <div className="bg-muted/60 rounded-lg py-2">
                  <div className="text-[10px] text-muted-foreground">الزمن</div>
                  <div className="text-xs font-bold tabular-nums">{formatMs(testResult.result.latencyMs ?? 0)}</div>
                </div>
                <div className="bg-muted/60 rounded-lg py-2">
                  <div className="text-[10px] text-muted-foreground">التكلفة</div>
                  <div className="text-xs font-bold tabular-nums">{formatUsd(testResult.result.estimatedCostUsd ?? 0)}</div>
                </div>
              </div>
              {testResult.result.fallbackUsed && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  خُدم عبر نموذج احتياطي
                </Badge>
              )}
              {testResult.result.preview && (
                <div className="text-xs bg-muted/60 rounded-lg p-3 leading-relaxed">{testResult.result.preview}</div>
              )}
            </div>
          ) : (
            <p className="text-sm text-red-600">{testResult?.result.error}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
