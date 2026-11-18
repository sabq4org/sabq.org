import { sanitizeArticleHtml } from "../utils/sanitizeHtml";
import { BotDraftError, canonicalHttpsImageUrl } from "./botDraftsService";

type BodyImage = { url: string; caption?: string | null; alt?: string | null };

function imageKey(image: Element) {
  const src = image.getAttribute("src")?.trim();
  if (!src) return null;
  // Older editor content also contains same-origin relative media URLs.
  if (src.startsWith("/") && !src.startsWith("//")) return src;
  return canonicalHttpsImageUrl(src);
}

/** Restore editor image nodes, including their caption and layout, when replacing the text. */
export function mergeBotEditorBodyImages(previous: string | null, replacement: string | null, edits: BodyImage[] = []) {
  const oldHtml = previous ?? "";
  const nextHtml = replacement ?? oldHtml;
  if (!edits.length && (oldHtml === nextHtml || !/<img\b/i.test(oldHtml))) return nextHtml;

  const previousImages: Element[] = [];
  sanitizeArticleHtml(oldHtml, fragment => {
    previousImages.push(...Array.from(fragment.querySelectorAll("img")));
  });
  // The sanitizer returns early on empty input. A single whitespace node lets
  // image-only content and an empty replacement follow the same path.
  return sanitizeArticleHtml(nextHtml || " ", fragment => {
    const groups = new Map<string, Element[]>();
    const add = (key: string, image: Element) => {
      const group = groups.get(key) ?? [];
      group.push(image);
      groups.set(key, group);
    };
    for (const image of Array.from(fragment.querySelectorAll("img"))) {
      const key = imageKey(image);
      if (key) add(key, image);
    }
    const occurrences = new Map<string, number>();
    for (const prior of previousImages) {
      const key = imageKey(prior);
      if (!key) continue;
      const index = occurrences.get(key) ?? 0;
      occurrences.set(key, index + 1);
      const current = groups.get(key)?.[index];
      if (!current) {
        const restored = fragment.ownerDocument.importNode(prior, true);
        fragment.appendChild(restored);
        add(key, restored);
      } else {
        // The legacy HTML normalizer resets image attributes. Retain the
        // newsroom's metadata unless the caller explicitly supplies a change.
        for (const name of ["alt", "data-caption", "data-width", "data-align"]) {
          if (prior.hasAttribute(name)) current.setAttribute(name, prior.getAttribute(name)!);
        }
      }
    }
    for (const edit of edits) {
      const images = groups.get(canonicalHttpsImageUrl(edit.url) ?? "");
      if (!images) throw new BotDraftError(422, "invalid_image", "الصورة غير موجودة في متن الخبر");
      for (const image of images) {
        if (edit.alt !== undefined) image.setAttribute("alt", edit.alt ?? "");
        if (edit.caption === null) image.removeAttribute("data-caption");
        else if (edit.caption !== undefined) image.setAttribute("data-caption", edit.caption);
      }
    }
  });
}
