import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useBuildVersionCheck } from "@/hooks/useBuildVersionCheck";
import { cacheBustReload } from "@/lib/cacheBust";

/**
 * Floating banner that appears the moment a new deploy is detected (via
 * useBuildVersionCheck). One-tap "تحديث" runs cacheBustReload so the
 * browser fetches the new HTML + new chunks instead of bumping into a
 * stale-chunk ChunkLoadError later.
 *
 * Calm, non-intrusive style — sits at the bottom-center, dismissible.
 */
export function UpdateBanner() {
  const hasUpdate = useBuildVersionCheck();
  const [dismissed, setDismissed] = useState(false);

  if (!hasUpdate || dismissed) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md"
      dir="rtl"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-card/95 backdrop-blur-md border border-border shadow-xl">
        <div className="grid place-items-center h-9 w-9 rounded-xl bg-primary/10 text-primary shrink-0">
          <RefreshCw className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight text-foreground">
            نسخة جديدة من الموقع متاحة
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            انقر للتحديث وتلقّي آخر التحسينات
          </p>
        </div>
        <button
          type="button"
          onClick={() => cacheBustReload()}
          className="px-3 py-1.5 rounded-full text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity shrink-0"
          data-testid="update-banner-refresh"
        >
          تحديث
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="grid place-items-center h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          aria-label="إغلاق"
          data-testid="update-banner-dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
