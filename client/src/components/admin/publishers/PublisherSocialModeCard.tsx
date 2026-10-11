import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Share2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type Mode = "off" | "approval" | "direct";

const OPTIONS: Array<{ value: Mode; title: string; hint: string }> = [
  { value: "off", title: "مغلق", hint: "لا يظهر زر النشر الاجتماعي للوكالة." },
  { value: "approval", title: "بموافقة سبق", hint: "كل تغريدة تنتظر موافقتكم في صفحة النشر الاجتماعي." },
  {
    value: "direct",
    title: "نشر مباشر",
    hint: "تنشر الوكالة فورًا أو تجدول بلا موافقة. تبقى كل تغريدة في سجل النشر الاجتماعي.",
  },
];

/** إعداد النشر الاجتماعي للوكالة: مغلق، أو بموافقة سبق (الافتراضي)، أو نشر مباشر. */
export function PublisherSocialModeCard({ publisherId, mode }: { publisherId: string; mode: string | null | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const current: Mode = mode === "off" || mode === "direct" ? mode : "approval";

  const save = useMutation({
    mutationFn: (next: Mode) =>
      apiRequest(`/api/admin/publishers/${publisherId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ socialPublishMode: next }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/publishers/${publisherId}`] });
      toast({ title: "حُفظ إعداد النشر الاجتماعي" });
    },
    onError: () => toast({ title: "خطأ", description: "تعذر حفظ الإعداد", variant: "destructive" }),
  });

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Share2 className="h-4 w-4" />
          النشر الاجتماعي
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={current}
          onValueChange={(v) => save.mutate(v as Mode)}
          disabled={save.isPending}
          className="grid gap-2 md:grid-cols-3"
          dir="rtl"
        >
          {OPTIONS.map((o) => (
            <Label
              key={o.value}
              htmlFor={`social-mode-${o.value}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3 font-normal",
                current === o.value && "border-primary bg-primary/5",
              )}
            >
              <RadioGroupItem value={o.value} id={`social-mode-${o.value}`} className="mt-1" data-testid={`radio-social-${o.value}`} />
              <span className="space-y-0.5">
                <span className="block text-sm font-semibold">{o.title}</span>
                <span className="block text-xs text-muted-foreground">{o.hint}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
