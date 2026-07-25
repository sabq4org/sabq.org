/**
 * Server-side HTML sanitizer for article/topic bodies that get injected RAW into
 * an SSR / edge response (server/seoInjector.ts, server/routes/edgeMeta.ts).
 *
 * Replaces the previous hand-rolled regex stripper, which only removed *quoted*
 * event handlers and left `<img src=x onerror=...>` intact — stored XSS that ran
 * in every reader's browser (security audit #5). The field is editor-controlled
 * in theory, but AI-generation and foreign-news import also write it, so it is
 * not fully trusted.
 *
 * DOMPurify removes ALL event handlers (quoted or not), javascript: URLs, and
 * unknown/dangerous tags by default. We additionally forbid embedding/scripting
 * containers that an article body never legitimately needs.
 */
import { clearWindow, sanitize } from "isomorphic-dompurify";

let resetScheduled = false;

/**
 * isomorphic-dompurify keeps one JSDOM Window for the process. jsdom's selector
 * engine attaches listeners/state to that Window while parsing documents, so a
 * long-running server must close it periodically. Coalescing to one reset per
 * event-loop turn avoids rebuilding JSDOM for every request during a burst.
 */
function scheduleWindowReset(): void {
  if (resetScheduled) return;
  resetScheduled = true;

  const immediate = setImmediate(() => {
    resetScheduled = false;
    clearWindow();
  });
  immediate.unref?.();
}

export function sanitizeArticleHtml(html: string): string {
  if (!html) return "";
  try {
    return sanitize(html, {
      FORBID_TAGS: ["script", "style", "iframe", "embed", "object", "form", "svg", "math"],
      FORBID_ATTR: ["style"],
      ALLOW_DATA_ATTR: false,
    });
  } finally {
    scheduleWindowReset();
  }
}
