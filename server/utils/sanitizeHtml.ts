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
import DOMPurify from "isomorphic-dompurify";

export function sanitizeArticleHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["script", "style", "iframe", "embed", "object", "form", "svg", "math"],
    FORBID_ATTR: ["style"],
    ALLOW_DATA_ATTR: false,
  });
}
