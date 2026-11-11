// «راجع العنوان»: إشعار فحص الظل لتطابق العنوان مع المتن (Gemini Decisions).
// معلوماتي فقط ولا يمنع النشر. يظهر حين يكون آخر فحص مخزّن معلَّماً
// (احتمال دقة العنوان أقل من 0.5). الخادم: server/routes/titleChecks.ts.
// الميزة مطفأة افتراضياً، وقبل تشغيل الترحيل تعود القائمة فارغة فلا تظهر شارة.

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";

export const TITLE_CHECK_LABEL = "راجع العنوان";

type TitleCheckItem = {
  articleId: string;
  probability: number | null;
  flagged: boolean;
};

type TitleCheckListResponse = { items?: TitleCheckItem[] };
type TitleCheckArticleResponse = { item?: TitleCheckItem | null };

export type TitleCheckFlags = Map<string, number | null>;

function formatScore(probability: number | null | undefined): string {
  return typeof probability === "number" ? probability.toFixed(2) : "—";
}

/** المواد المنشورة المعلَّمة «راجع العنوان» (أحدث 100). خريطة فارغة عند أي خطأ. */
export function useTitleCheckFlags(enabled: boolean) {
  return useQuery<TitleCheckFlags>({
    queryKey: ["/api/internal/title-checks", "flagged"],
    queryFn: async () => {
      try {
        const data = await apiRequest<TitleCheckListResponse>("/api/internal/title-checks?limit=100", { silent: true });
        return new Map((data?.items ?? []).filter((i) => i.flagged).map((i) => [i.articleId, i.probability]));
      } catch {
        return new Map();
      }
    },
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function TitleCheckBadge({
  articleId,
  flags,
  testId,
}: {
  articleId: string;
  flags: TitleCheckFlags | undefined;
  testId?: string;
}) {
  if (!flags || !flags.has(articleId)) return null;
  const probability = flags.get(articleId);
  return (
    <Badge
      variant="outline"
      className="w-fit gap-1 border-amber-400 bg-amber-50 text-[11px] text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
      title={`فحص آلي: العنوان قد لا يطابق المتن (درجة ${formatScore(probability)} من 1). إشعار فقط ولا يمنع النشر.`}
      data-testid={testId ?? `badge-title-check-${articleId}`}
    >
      <AlertTriangle className="h-3 w-3" />
      {TITLE_CHECK_LABEL}
    </Badge>
  );
}

/** سطر تنبيه تحت حقل العنوان في المحرر حين يكون آخر فحص معلَّماً. */
export function EditorTitleCheckNotice({ articleId }: { articleId: string | undefined }) {
  const { data } = useQuery<TitleCheckItem | null>({
    queryKey: ["/api/internal/title-checks/article", articleId],
    queryFn: async () => {
      try {
        const res = await apiRequest<TitleCheckArticleResponse>(
          `/api/internal/title-checks/article/${encodeURIComponent(articleId as string)}`,
          { silent: true },
        );
        return res?.item ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!articleId,
    staleTime: 60_000,
    retry: false,
  });
  if (!data?.flagged) return null;
  return (
    <div
      className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
      data-testid="editor-title-check-notice"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <strong>{TITLE_CHECK_LABEL}:</strong> فحص آلي يرى أن العنوان المنشور قد لا يطابق المتن (درجة {formatScore(data.probability)} من 1).
        تأكد من الأرقام والأسماء والأماكن. إشعار فقط ولا يمنع النشر.
      </span>
    </div>
  );
}
