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

/**
 * تخطيط صور المحرر (العرض المخصص والمحاذاة) يعيش في `data-width` / `data-align`
 * ووسم `style`. المُعقِّم يحذف `style` كليًا ويحذف كل `data-*`، فكانت الصورة
 * المضبوطة على 25% تخرج للـSSR/الزواحف بلا عرض فتُعرض بعرض المقال كاملًا.
 *
 * لذلك: نسمح صراحةً بسمات التخطيط الثلاث (وهي بيانات وصفية لا تنفّذ شيئًا)،
 * ثم نعيد بناء `style` للصور فقط من قيمة `data-width` — بقيمة مُتحقَّق منها
 * (نسبة أو بكسل) لا تأتي من نص المستخدم مباشرة. أي `style` آخر يبقى محذوفًا.
 *
 * الاستعادة تجري على شجرة DOM المعقَّمة عبر setAttribute ثم تُسلسَل مرة واحدة،
 * ولا تُعدَّل سلسلة HTML بعد التعقيم: كان التعديل بـregex يقطع الوسم عند أول
 * `>` داخل سمة مقتبسة (مثل alt)، فيتحول نص خامل إلى وسم فعّال (XSS مخزّن).
 */
const IMAGE_LAYOUT_ATTRS = ["data-width", "data-align", "data-caption"];

const SAFE_IMAGE_WIDTH = /^(?:\d{1,3}(?:\.\d+)?%|\d{1,4}(?:\.\d+)?px)$/;

const SANITIZE_CONFIG = {
  FORBID_TAGS: ["script", "style", "iframe", "embed", "object", "form", "svg", "math"],
  FORBID_ATTR: ["style"],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: IMAGE_LAYOUT_ATTRS,
};

function restoreImageWidths(fragment: DocumentFragment): void {
  fragment.querySelectorAll("img[data-width]").forEach((img) => {
    const width = img.getAttribute("data-width")?.trim();

    // قيمة غير مطابقة للنمط الآمن = بقايا لصق أو محاولة حقن: تُحذف السمة.
    if (!width || !SAFE_IMAGE_WIDTH.test(width)) {
      img.removeAttribute("data-width");
      return;
    }
    if (img.hasAttribute("style")) return;

    img.setAttribute("style", `width: ${width}; max-width: 100%; height: auto;`);
  });
}

export function sanitizeArticleHtml(html: string): string {
  if (!html) return "";
  try {
    if (!html.includes("data-width")) return sanitize(html, SANITIZE_CONFIG);

    const fragment = sanitize(html, { ...SANITIZE_CONFIG, RETURN_DOM_FRAGMENT: true });
    restoreImageWidths(fragment);
    const host = fragment.ownerDocument.createElement("div");
    host.appendChild(fragment);
    return host.innerHTML;
  } finally {
    scheduleWindowReset();
  }
}
