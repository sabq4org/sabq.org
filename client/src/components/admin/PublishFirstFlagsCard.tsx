import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type { PublishFirstFlags } from "@shared/publishFirst";

const ROWS: Array<{ key: keyof PublishFirstFlags; title: string; settingKey: string; hint: string }> = [
  {
    key: "validation",
    title: "تحقق وقت الرفع",
    settingKey: "publish_first_validation",
    hint: "العنوان الفرعي 120 حرفاً، وقائمة التصنيفات الصالحة في خطأ 422",
  },
  {
    key: "revisionHistory",
    title: "سجل مراجعات ما بعد النشر",
    settingKey: "publish_first_revision_history",
    hint: "حفظ من عدّل وماذا تغيّر. الاسترجاع يبقى للمسؤول",
  },
  {
    key: "updateLine",
    title: "سطر سبب التحديث للقارئ",
    settingKey: "publish_first_update_line",
    hint: "إظهار «تحديث: …» تحت المتن بتوقيت الرياض",
  },
];

export function PublishFirstFlagsCard() {
  const { toast } = useToast();
  const query = useQuery<{ flags: PublishFirstFlags }>({
    queryKey: ["/api/admin/publish-first/flags"],
    queryFn: () => apiRequest("/api/admin/publish-first/flags"),
  });
  const save = useMutation({
    mutationFn: (patch: Partial<PublishFirstFlags>) =>
      apiRequest("/api/admin/publish-first/flags", {
        method: "PUT",
        body: JSON.stringify(patch),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/publish-first/flags"] });
      toast({ title: "تم حفظ مفاتيح النشر أولاً" });
    },
    onError: (error: Error) => {
      toast({ title: "تعذر الحفظ", description: error.message, variant: "destructive" });
    },
  });

  const flags = query.data?.flags;

  return (
    <Card data-testid="card-publish-first-flags">
      <CardHeader>
        <CardTitle>النشر أولاً</CardTitle>
        <CardDescription>
          المفاتيح الأربعة مفعّلة إن لم يوجد صف في إعدادات النظام. الإطفاء فوري خلال ثوانٍ بلا إعادة نشر.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {ROWS.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">{row.title}</p>
              <p className="text-xs text-muted-foreground">{row.hint}</p>
              <p className="text-xs text-muted-foreground" dir="ltr">{row.settingKey}</p>
            </div>
            <Switch
              checked={flags ? flags[row.key] : true}
              disabled={!flags || save.isPending}
              onCheckedChange={(checked) => save.mutate({ [row.key]: checked })}
              data-testid={`switch-publish-first-${row.key}`}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
