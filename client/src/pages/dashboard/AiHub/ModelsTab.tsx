// AI Hub — Models tab: the model catalog with pricing, circuit-breaker
// health, provider key checks (never exposes the keys themselves).

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { KeyRound, Pencil, Plus } from "lucide-react";
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
  formatInt,
  formatMs,
  formatUsd,
  HEALTH_META,
  providerName,
  useIsDark,
  providerColor,
  type ModelRow,
} from "./shared";

const MODELS_KEY = ["/api/admin/ai-hub/models"];

const CAPABILITY_LABELS: Record<string, string> = {
  complete: "نصوص",
  embed: "متجهات",
  image: "صور",
  tts: "صوت",
};

const UNIT_LABELS: Record<string, string> = {
  tokens: "لكل مليون توكن",
  chars: "لكل مليون حرف",
  image: "لكل صورة",
};

interface PriceEdit {
  id: string;
  name: string;
  displayName: string;
  costPer1MInput: string;
  costPer1MOutput: string;
  costPerUnit: string;
  pricingUnit: string;
}

interface KeyTestResult {
  ok: boolean;
  latencyMs: number;
  errorCode?: string;
  skipped?: boolean;
  modelId?: string;
}

const EMPTY_NEW = {
  provider: "openai",
  modelId: "",
  displayName: "",
  capabilities: ["complete"] as string[],
  pricingUnit: "tokens",
  costPer1MInput: "0",
  costPer1MOutput: "0",
  costPerUnit: "0",
};

export default function ModelsTab() {
  const { toast } = useToast();
  const isDark = useIsDark();
  const [priceEdit, setPriceEdit] = useState<PriceEdit | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newModel, setNewModel] = useState(EMPTY_NEW);
  const [keyResults, setKeyResults] = useState<Record<string, KeyTestResult> | null>(null);

  const { data: modelsRaw, isLoading } = useQuery<ModelRow[]>({ queryKey: MODELS_KEY });
  const models = Array.isArray(modelsRaw) ? modelsRaw : [];

  const patchMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      apiRequest(`/api/admin/ai-hub/models/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MODELS_KEY });
      toast({ title: "تم الحفظ" });
    },
    onError: (err: Error) => toast({ title: "تعذر الحفظ", description: err.message, variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/admin/ai-hub/models", {
        method: "POST",
        body: JSON.stringify({
          ...newModel,
          costPer1MInput: Number(newModel.costPer1MInput),
          costPer1MOutput: Number(newModel.costPer1MOutput),
          costPerUnit: Number(newModel.costPerUnit),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MODELS_KEY });
      setAddOpen(false);
      setNewModel(EMPTY_NEW);
      toast({ title: "أُضيف النموذج" });
    },
    onError: (err: Error) => toast({ title: "تعذر الإضافة", description: err.message, variant: "destructive" }),
  });

  const keysMutation = useMutation({
    mutationFn: async () =>
      apiRequest<Record<string, KeyTestResult>>("/api/admin/ai-hub/providers/test", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (results) => setKeyResults(results),
    onError: (err: Error) => toast({ title: "فشل الفحص", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3.5 flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className="h-9 gap-2"
            disabled={keysMutation.isPending}
            onClick={() => keysMutation.mutate()}
          >
            <KeyRound className="w-4 h-4" />
            {keysMutation.isPending ? "يجري الفحص…" : "فحص مفاتيح المزودين"}
          </Button>
          {keyResults &&
            Object.entries(keyResults).map(([provider, r]) => (
              <Badge
                key={provider}
                variant="outline"
                className={`gap-1.5 rounded-full ${
                  r.ok
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300"
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: providerColor(provider, isDark) }} />
                {providerName(provider)}: {r.ok ? `متصل (${formatMs(r.latencyMs)})` : r.skipped ? "لا نماذج قابلة للفحص" : r.errorCode ?? "فشل"}
              </Badge>
            ))}
          <Button className="h-9 gap-2 ms-auto bg-indigo-600 hover:bg-indigo-700" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" />
            إضافة نموذج
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">النموذج</TableHead>
                <TableHead className="text-right">القدرات</TableHead>
                <TableHead className="text-right">التسعير</TableHead>
                <TableHead className="text-right">الحالة الصحية</TableHead>
                <TableHead className="text-right">استهلاك 30 يومًا</TableHead>
                <TableHead className="text-right">نشط</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((m) => {
                const health = m.health;
                const meta = HEALTH_META[health?.status ?? "healthy"] ?? HEALTH_META.healthy;
                return (
                  <TableRow key={m.id} className={!m.isActive ? "opacity-55" : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: providerColor(m.provider, isDark) }} />
                        <div>
                          <div className="font-semibold text-sm">{m.displayName}</div>
                          <div className="text-[11px] text-muted-foreground">
                            <span dir="ltr">{providerName(m.provider)} · {m.modelId}</span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(m.capabilities ?? []).map((c) => (
                          <Badge key={c} variant="secondary" className="text-[10px]">
                            {CAPABILITY_LABELS[c] ?? c}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs tabular-nums" dir="ltr" style={{ textAlign: "right" }}>
                        {m.pricingUnit === "image"
                          ? formatUsd(m.costPerUnit)
                          : `${formatUsd(m.costPer1MInput)} / ${formatUsd(m.costPer1MOutput)}`}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{UNIT_LABELS[m.pricingUnit] ?? m.pricingUnit}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${meta.className}`}>
                        {meta.label}
                      </Badge>
                      {health?.cooldownUntil && new Date(health.cooldownUntil) > new Date() && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          يعود {format(new Date(health.cooldownUntil), "HH:mm", { locale: ar })}
                        </div>
                      )}
                      {health?.lastErrorCode && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          <span dir="ltr">{health.lastErrorCode}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-bold tabular-nums">{formatUsd(m.usage30d.costUsd)}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">{formatInt(m.usage30d.requests)} طلب</div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={m.isActive}
                        onCheckedChange={(checked) => patchMutation.mutate({ id: m.id, patch: { isActive: checked } })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5"
                        onClick={() =>
                          setPriceEdit({
                            id: m.id,
                            name: `${providerName(m.provider)} — ${m.modelId}`,
                            displayName: m.displayName,
                            costPer1MInput: String(m.costPer1MInput),
                            costPer1MOutput: String(m.costPer1MOutput),
                            costPerUnit: String(m.costPerUnit),
                            pricingUnit: m.pricingUnit,
                          })
                        }
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        الأسعار
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Price edit dialog */}
      <Dialog open={priceEdit !== null} onOpenChange={(open) => !open && setPriceEdit(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">أسعار: {priceEdit?.name}</DialogTitle>
          </DialogHeader>
          {priceEdit && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">الاسم المعروض</Label>
                <Input
                  className="h-9"
                  value={priceEdit.displayName}
                  onChange={(e) => setPriceEdit({ ...priceEdit, displayName: e.target.value })}
                />
              </div>
              {priceEdit.pricingUnit === "image" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">التكلفة لكل صورة ($)</Label>
                  <Input
                    type="number"
                    step="0.001"
                    className="h-9"
                    value={priceEdit.costPerUnit}
                    onChange={(e) => setPriceEdit({ ...priceEdit, costPerUnit: e.target.value })}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">إدخال $ / 1M</Label>
                    <Input
                      type="number"
                      step="0.01"
                      className="h-9"
                      value={priceEdit.costPer1MInput}
                      onChange={(e) => setPriceEdit({ ...priceEdit, costPer1MInput: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">إخراج $ / 1M</Label>
                    <Input
                      type="number"
                      step="0.01"
                      className="h-9"
                      value={priceEdit.costPer1MOutput}
                      onChange={(e) => setPriceEdit({ ...priceEdit, costPer1MOutput: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPriceEdit(null)}>
              إلغاء
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={patchMutation.isPending}
              onClick={() => {
                if (!priceEdit) return;
                patchMutation.mutate({
                  id: priceEdit.id,
                  patch: {
                    displayName: priceEdit.displayName,
                    costPer1MInput: Number(priceEdit.costPer1MInput),
                    costPer1MOutput: Number(priceEdit.costPer1MOutput),
                    costPerUnit: Number(priceEdit.costPerUnit),
                  },
                });
                setPriceEdit(null);
              }}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add model dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">إضافة نموذج جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">المزود</Label>
                <Select dir="rtl" value={newModel.provider} onValueChange={(v) => setNewModel({ ...newModel, provider: v })}>
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
              <div className="space-y-1.5">
                <Label className="text-xs">القدرة</Label>
                <Select
                  dir="rtl"
                  value={newModel.capabilities[0]}
                  onValueChange={(v) =>
                    setNewModel({
                      ...newModel,
                      capabilities: [v],
                      pricingUnit: v === "image" ? "image" : v === "tts" ? "chars" : "tokens",
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CAPABILITY_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">معرّف النموذج (كما في API المزود)</Label>
              <Input
                className="h-9"
                dir="ltr"
                placeholder="gpt-5.2 / claude-opus-5 …"
                value={newModel.modelId}
                onChange={(e) => setNewModel({ ...newModel, modelId: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الاسم المعروض</Label>
              <Input
                className="h-9"
                value={newModel.displayName}
                onChange={(e) => setNewModel({ ...newModel, displayName: e.target.value })}
              />
            </div>
            {newModel.pricingUnit === "image" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">التكلفة لكل صورة ($)</Label>
                <Input
                  type="number"
                  step="0.001"
                  className="h-9"
                  value={newModel.costPerUnit}
                  onChange={(e) => setNewModel({ ...newModel, costPerUnit: e.target.value })}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">إدخال $ / 1M</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-9"
                    value={newModel.costPer1MInput}
                    onChange={(e) => setNewModel({ ...newModel, costPer1MInput: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">إخراج $ / 1M</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-9"
                    value={newModel.costPer1MOutput}
                    onChange={(e) => setNewModel({ ...newModel, costPer1MOutput: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={addMutation.isPending || !newModel.modelId || !newModel.displayName}
              onClick={() => addMutation.mutate()}
            >
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
