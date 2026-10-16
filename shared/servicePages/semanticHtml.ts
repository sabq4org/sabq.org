/**
 * متن مقروء للزواحف يُحقن في قشرة SPA عند تعذّر SSR، بنفس حقائق النموذج.
 * بلا ألوان خاصة: التنسيق يأتي من صفحة المقال في الواجهة.
 */

import type { ServicePageModel } from "./present";
import type { RelatedArticleLink } from "./related";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function renderServiceSemanticHtml(
  model: ServicePageModel,
  related: RelatedArticleLink[] = [],
): string {
  const answer = answerHtml(model);
  const defaultPast = model.tone === "school" ? "انتهت" : "صُرفت";
  const rows = (model.rows || [])
    .map((row) => {
      const mark = row.isPast ? row.pastLabel || defaultPast : row.certaintyLabel;
      const kicker = row.isNext ? `<p>الموعد القادم</p>` : "";
      return `<li>${kicker}<h3>${esc(row.title)}</h3><p><time datetime="${esc(row.startsOn)}">${esc(row.gregorianLabel)}</time></p><p>${esc(row.hijriLabel)}</p><p>${esc(mark)}</p></li>`;
    })
    .join("");
  const calendar = model.calendarHref
    ? `<p><a href="${esc(model.calendarHref)}">أضف المواعيد القادمة إلى التقويم</a></p>`
    : "";
  const explanation = (model.explanation || []).map((paragraph) => `<p>${esc(paragraph)}</p>`).join("");
  const faq = (model.faq || [])
    .map((item) => `<h3>${esc(item.question)}</h3><p>${esc(item.answer)}</p>`)
    .join("");
  const news = related.map((item) => `<li><a href="${esc(item.href)}">${esc(item.title)}</a></li>`).join("");
  const links = (model.links || []).map((item) => `<li><a href="${esc(item.href)}">${esc(item.label)}</a></li>`).join("");
  const jsonLd = model.jsonLd ? `<script type="application/ld+json">${safeJson(model.jsonLd)}</script>` : "";
  const badge = model.next ? `<p>${esc(model.next.certaintyLabel)}</p>` : "";
  return `<article dir="rtl"><h1>${esc(model.h1)}</h1>${badge}${answer}${calendar}<h2>خط المواعيد</h2><p>المواعيد من السجل المنشور. ما مضى يظهر «${defaultPast}»، وما لم تعلنه الجهة بعد يبقى «متوقعًا».</p><ol>${rows}</ol><h2>كيف يُحدَّد الموعد</h2>${explanation}${news ? `<h2>من أخبار سبق</h2><ul>${news}</ul>` : ""}${faq ? `<h2>أسئلة شائعة</h2>${faq}` : ""}<ul>${links}</ul><p><time datetime="${esc(model.dateModified)}">${esc(model.dateModifiedLabel)}</time></p>${jsonLd}</article>`;
}

function answerHtml(model: ServicePageModel): string {
  if (!model.next) return `<p id="answer">${esc(model.leadPrefix)}</p>`;
  const next = model.next;
  const hint = next.expectedHint
    ? `<p>${esc(next.expectedHint.replace(/^متوقع:\s*/, ""))}</p>`
    : "";
  const rule = model.shiftRule ? `<p>${esc(model.shiftRule)}</p>` : "";
  return `<p id="answer">${esc(model.leadPrefix)} <time datetime="${esc(next.startsOn)}">${esc(next.gregorianLabel)}</time> الموافق ${esc(next.hijriLabel)}، <strong data-countdown data-date="${esc(next.startsOn)}" data-today="${esc(next.todayLabel)}">${esc(next.countdownText)}</strong>.</p>${hint}${rule}`;
}
