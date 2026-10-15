import DOMPurify from "isomorphic-dompurify";
import { isHttpSourceUrl } from "@shared/editorialAiSources";

function sanitizeBody(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["script", "style", "iframe", "embed", "object", "form", "svg", "math"],
    FORBID_ATTR: ["style"],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["data-width", "data-align", "data-caption"],
  });
}

/** Store only sanitized output: previews and the explicit Apply action share it. */
export function sanitizeEditorialAiResult<T extends {
  body: string;
  enVersion: { body: string } | null;
  sources: { title: string; url: string }[];
}>(result: T): T {
  return {
    ...result,
    body: sanitizeBody(result.body),
    enVersion: result.enVersion
      ? { ...result.enVersion, body: sanitizeBody(result.enVersion.body) }
      : null,
    sources: result.sources.filter(source => isHttpSourceUrl(source.url)),
  };
}
