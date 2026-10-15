// إنشاء مهمة تحريرية حقيقية — تدخل سجل المهام وتُوزَّع فورًا على مسار نوعها.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { OPS_PRIORITIES, OPS_ROUTES, OPS_TASK_TYPES, type OpsPriority, type OpsTaskType } from "@shared/opsRoom";
import { OPS_PRIORITY_LABELS_AR, OPS_TASK_TYPE_LABELS_AR, agentName } from "./shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}

export function CreateTaskDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<OpsTaskType>("breaking");
  const [priority, setPriority] = useState<OpsPriority>("high");
  const [description, setDescription] = useState("");
  const [material, setMaterial] = useState("");
  const [sourceUrls, setSourceUrls] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [radarItemId, setRadarItemId] = useState("");

  const route = OPS_ROUTES[taskType];

  const create = useMutation({
    mutationFn: () =>
      apiRequest<{ id: string }>("/api/admin/ops-room/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          taskType,
          priority,
          description,
          material,
          sourceUrls: sourceUrls
            .split(/\s+/)
            .map((s) => s.trim())
            .filter((s) => /^https?:\/\//.test(s)),
          imageUrl: imageUrl.trim() || undefined,
          radarItemId: radarItemId.trim() || undefined,
        }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ops-room/overview"] });
      toast({ title: "أُنشئت المهمة ووُزّعت على المسار" });
      onOpenChange(false);
      setTitle("");
      setDescription("");
      setMaterial("");
      setSourceUrls("");
      setImageUrl("");
      setRadarItemId("");
      onCreated?.(data.id);
    },
    onError: (err: Error) => toast({ title: "تعذر إنشاء المهمة", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>مهمة تحريرية جديدة</DialogTitle>
          <DialogDescription>تدخل سجل المهام وتُقسَّم فورًا إلى خطوات وكلاء بحسب نوعها — ولا تُنشر قبل اعتماد بشري.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>نوع المهمة</Label>
              <Select value={taskType} onValueChange={(v) => setTaskType(v as OpsTaskType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPS_TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{OPS_TASK_TYPE_LABELS_AR[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>الأولوية</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as OpsPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPS_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{OPS_PRIORITY_LABELS_AR[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>العنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ما الحدث أو الموضوع؟" maxLength={300} />
          </div>
          <div className="space-y-1">
            <Label>وصف مختصر</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={5000} />
          </div>
          <div className="space-y-1">
            <Label>المادة الخام (نص المصدر، بيان، تعليقات…)</Label>
            <Textarea value={material} onChange={(e) => setMaterial(e.target.value)} rows={5} maxLength={20000} placeholder="تُعامل كبيانات خارجية لا تعليمات" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>روابط مصادر (كل رابط في سطر)</Label>
              <Textarea value={sourceUrls} onChange={(e) => setSourceUrls(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1">
              <Label>رابط صورة (اختياري)</Label>
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} dir="ltr" placeholder="https://…" />
              <Label className="mt-2 block">معرّف مادة رادار (اختياري)</Label>
              <Input value={radarItemId} onChange={(e) => setRadarItemId(e.target.value)} dir="ltr" />
            </div>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3 text-xs">
            <div className="font-bold mb-1">المسار: {route.titleAr}</div>
            <div className="text-muted-foreground">
              {route.steps.map((s, i) => (
                <span key={s.key}>
                  {i > 0 ? " ← " : ""}
                  {agentName(s.agent)}
                  {s.approvalGate ? " ✋" : ""}
                </span>
              ))}
              <span className="block mt-1">✋ = بوابة اعتماد بشري</span>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={() => create.mutate()} disabled={title.trim().length < 4 || create.isPending}>
            {create.isPending ? "جارٍ الإنشاء…" : "إنشاء وتوزيع"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
