import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  PUBLISH_FIRST_RISK_LABELS,
  PUBLISH_FIRST_RISK_LABELS_AR,
  PUBLISH_FIRST_VERDICTS_AR,
  type PublishFirstRiskLabel,
  type PublishFirstVerdict,
} from "@shared/publishFirst";

type RiskValue = "" | PublishFirstRiskLabel;

interface HistoryResponse {
  verdicts: Array<{
    id: string;
    verdict: string;
    reviewerName: string;
    note: string | null;
    verdictAt: string;
  }>;
  revisions: Array<{
    id: string;
    editorName: string | null;
    changedFields: string[];
    updateReason: string | null;
    createdAt: string;
  }>;
  overrides: Array<{
    id: string;
    actorName: string | null;
    action: string;
    reason: string | null;
    createdAt: string;
  }>;
}

const FIELD_LABELS: Record<string, string> = {
  title: "العنوان",
  subtitle: "العنوان الفرعي",
  excerpt: "الموجز",
  content: "المتن",
  categoryId: "التصنيف",
  imageUrl: "الصورة",
  riskLabel: "شارة المخاطر",
};

function riyadh(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ar-SA-u-ca-gregory-nu-latn", {
    timeZone: "Asia/Riyadh",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function PublishFirstPanel({
  articleId,
  status,
  riskLabel,
  onRiskLabel,
  updateReason,
  onUpdateReason,
  sensitiveOverride,
  onSensitiveOverride,
  overrideReason,
  onOverrideReason,
  canOverride,
}: {
  articleId?: string;
  status: string;
  riskLabel: RiskValue;
  onRiskLabel: (value: RiskValue) => void;
  updateReason: string;
  onUpdateReason: (value: string) => void;
  sensitiveOverride: boolean;
  onSensitiveOverride: (value: boolean) => void;
  overrideReason: string;
  onOverrideReason: (value: string) => void;
  canOverride: boolean;
}) {
  const { toast } = useToast();
  const history = useQuery<HistoryResponse>({
    queryKey: ["/api/admin/articles", articleId, "publish-first"],
    enabled: Boolean(articleId),
    queryFn: () => apiRequest(`/api/admin/articles/${articleId}/publish-first`),
  });

  const rollback = useMutation({
    mutationFn: (revisionId: string) =>
      apiRequest(`/api/admin/articles/${articleId}/revisions/${revisionId}/rollback`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "تم استرجاع النسخة" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles", articleId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles", articleId, "publish-first"] });
    },
    onError: (error: Error) => {
      toast({ title: "تعذر الاسترجاع", description: error.message, variant: "destructive" });
    },
  });

  const data = history.data;
  const published = status === "published";

  return (
    <Card className="order-[62] lg:order-none" data-testid="card-publish-first">
      <CardHeader>
        <CardTitle>النشر أولاً</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>شارة المخاطر</Label>
          <Select
            value={riskLabel || "none"}
            onValueChange={(value) => onRiskLabel(value === "none" ? "" : (value as PublishFirstRiskLabel))}
          >
            <SelectTrigger data-testid="select-risk-label">
              <SelectValue placeholder="بدون شارة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون شارة</SelectItem>
              {PUBLISH_FIRST_RISK_LABELS.map((label) => (
                <SelectItem key={label} value={label}>
                  {PUBLISH_FIRST_RISK_LABELS_AR[label]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {riskLabel === "sensitive" && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              النشر والتصحيح بعد النشر يتوقفان حتى يسجّل مراجع حكماً، ما لم يتجاوزهما مسؤول.
            </p>
          )}
        </div>

        {published && (
          <div className="space-y-2">
            <Label htmlFor="update-reason">سبب التحديث</Label>
            <Textarea
              id="update-reason"
              value={updateReason}
              onChange={(event) => onUpdateReason(event.target.value)}
              placeholder="يظهر للقارئ تحت المتن إن كتبته"
              maxLength={500}
              data-testid="input-update-reason"
            />
          </div>
        )}

        {canOverride && riskLabel === "sensitive" && (
          <div className="space-y-2 rounded-md border border-amber-200 p-3 dark:border-amber-900">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={sensitiveOverride}
                onCheckedChange={(checked) => onSensitiveOverride(checked === true)}
                data-testid="checkbox-sensitive-override"
              />
              تجاوز بوابة الحساسية (للمسؤول)
            </label>
            {sensitiveOverride && (
              <Textarea
                value={overrideReason}
                onChange={(event) => onOverrideReason(event.target.value)}
                placeholder="سبب التجاوز (اختياري) — يُسجَّل في تاريخ المقال"
                maxLength={500}
                data-testid="input-override-reason"
              />
            )}
          </div>
        )}

        {articleId && data && (
          <div className="space-y-3 text-sm" data-testid="publish-first-history">
            {data.verdicts.length > 0 && (
              <div>
                <p className="font-medium">أحكام المراجعين</p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {data.verdicts.map((verdict) => (
                    <li key={verdict.id}>
                      {PUBLISH_FIRST_VERDICTS_AR[verdict.verdict as PublishFirstVerdict] || verdict.verdict}
                      {" — "}
                      {verdict.reviewerName}
                      {" — "}
                      {riyadh(verdict.verdictAt)}
                      {verdict.note ? ` — ${verdict.note}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.overrides.length > 0 && (
              <div>
                <p className="font-medium">تجاوزات المسؤول</p>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {data.overrides.map((row) => (
                    <li key={row.id}>
                      {row.action === "publish" ? "نشر" : "تصحيح"}
                      {" — "}
                      {row.actorName || "مسؤول"}
                      {" — "}
                      {riyadh(row.createdAt)}
                      {row.reason ? ` — ${row.reason}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.revisions.length > 0 && (
              <div>
                <p className="font-medium">مراجعات ما بعد النشر</p>
                <ul className="mt-1 space-y-2">
                  {data.revisions.map((revision) => (
                    <li key={revision.id} className="rounded-md border p-2">
                      <p>
                        {revision.editorName || "محرر"} — {riyadh(revision.createdAt)}
                      </p>
                      <p className="text-muted-foreground">
                        {(revision.changedFields || []).map((field) => FIELD_LABELS[field] || field).join("، ") || "سبب تحديث فقط"}
                        {revision.updateReason ? ` — ${revision.updateReason}` : ""}
                      </p>
                      {canOverride && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          disabled={rollback.isPending}
                          onClick={() => {
                            if (window.confirm("استرجاع هذه النسخة؟ يُحفظ الوضع الحالي كمراجعة جديدة.")) {
                              rollback.mutate(revision.id);
                            }
                          }}
                        >
                          استرجاع
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
