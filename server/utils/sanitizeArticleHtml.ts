/**
 * Cleans up article HTML before saving:
 * - Removes empty <span> tags (and whitespace-only ones).
 * - Strips inline `style="color: rgb(0,0,0)"` / `color:#000` / `color:black`
 *   (these are default text colors that bloat HTML and confuse SEO crawlers).
 * - Removes <span> tags that have no remaining attributes (unwraps them, keeping inner content).
 * - Removes Word/Google Docs leftovers like `<span class="">` and bare `<span>`.
 *
 * Conservative — never touches content text, only attributes/empty wrappers.
 * Idempotent — running twice gives same result.
 */
export function sanitizeArticleHtml(html: string): string {
  if (!html || typeof html !== "string") return html;

  let out = html;
  let prev = "";
  let safety = 0;

  // Loop because removing one layer can expose another (nested empty spans).
  while (out !== prev && safety < 8) {
    prev = out;
    safety++;

    // 1) Strip "default black" color from style attributes.
    //    Matches: color: rgb(0, 0, 0) | color:#000 | color:#000000 | color:black
    out = out.replace(
      /style\s*=\s*"([^"]*)"/gi,
      (_m, styleBody: string) => {
        let cleaned = styleBody
          // drop default-black color declarations
          .replace(/(?:^|;)\s*color\s*:\s*(?:rgb\s*\(\s*0\s*,\s*0\s*,\s*0\s*\)|#0{3,6}|black)\s*(?=;|$)/gi, "")
          // drop default-white background (rare, but pasted from Word)
          .replace(/(?:^|;)\s*background-color\s*:\s*(?:rgb\s*\(\s*255\s*,\s*255\s*,\s*255\s*\)|#f{3,6}|white|transparent)\s*(?=;|$)/gi, "")
          // collapse `;;` → `;` and trim leading/trailing `;` and spaces
          .replace(/;\s*;+/g, ";")
          .replace(/^\s*;+\s*/, "")
          .replace(/\s*;+\s*$/, "")
          .trim();
        return cleaned ? `style="${cleaned}"` : "";
      }
    );

    // 2) Remove empty class attributes left by Word/Google Docs (`class=""`).
    out = out.replace(/\sclass\s*=\s*"\s*"/gi, "");

    // 3) Remove fully empty <span> tags (or whitespace/&nbsp;-only).
    out = out.replace(
      /<span\b[^>]*>\s*(?:&nbsp;|&#160;)?\s*<\/span>/gi,
      ""
    );

    // 4) Unwrap <span> tags that have no attributes left (just `<span>...</span>`).
    out = out.replace(
      /<span\s*>([\s\S]*?)<\/span>/gi,
      "$1"
    );
  }

  return out;
}
