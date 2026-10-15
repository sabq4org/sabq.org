import { Button } from "@/components/ui/button";

export function ArticleSidebarRecovery({ label, onRetry, busy, hasData = false }: {
  label: string;
  onRetry: () => void;
  busy: boolean;
  hasData?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm" role="status" dir="rtl">
      <p className="text-muted-foreground">
        {hasData ? `تعذّر تحديث ${label}؛ نعرض آخر بيانات متاحة.` : `تعذّر تحميل ${label} الآن.`}
      </p>
      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={onRetry} disabled={busy}>
        {busy ? "جارٍ المحاولة…" : "إعادة المحاولة"}
      </Button>
    </div>
  );
}
