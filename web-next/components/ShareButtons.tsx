"use client";

import { useState } from "react";

/**
 * Interactive share controls — the one hydrated island on the article page.
 * Everything else is static server-rendered HTML. Uses the Web Share API when
 * available, falling back to copy-to-clipboard.
 */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // user cancelled or unsupported — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — no-op
    }
  }

  return (
    <div className="mt-6 flex items-center gap-3 border-t border-border pt-4">
      <button
        type="button"
        onClick={share}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        مشاركة
      </button>
      {copied && (
        <span className="text-sm text-muted-foreground">تم نسخ الرابط</span>
      )}
    </div>
  );
}
