/**
 * يربط الخبر بصفحة موعده في سبق: خبر عن حساب المواطن، أو صرف الضمان أو المعاشات،
 * أو رواتب موظفي الدولة، أو إجازات المدارس، يحمل سطرًا إلى صفحة الخدمة.
 * المطابقة على العنوان وحده لأن المحرر يكتبه بقصد، والمتن يذكر كلمات كثيرة عرضًا.
 * حيث تكثر الأخبار غير المتعلقة بالصرف (الضمان، التأمينات) تُشترط كلمة صرف.
 */

import { servicePageById } from "./catalog";

export type ArticleServiceLink = {
  id: string;
  path: string;
  seriesSlug: string;
  /** نص السطر قبل التاريخ: «موعد صرف حساب المواطن القادم». */
  label: string;
};

/** أخبار العالم والرياضة لا تخص مواعيد الصرف والإجازات في السعودية. */
const EXCLUDED_CATEGORIES = new Set(["world", "sports"]);

/** «column» نوع قديم يُعامل كمقال رأي في بقية الموقع (وسم «مقال رأي» في edgeMeta). */
const OPINION_TYPES = new Set(["opinion", "column"]);

/**
 * كلمة صرف في أول الكلمة، مع سوابقها («يُصرف»، «بصرف»، «سيودع»، «الدفعة»)،
 * حتى لا تطابق «المصرفية» أو «مستودع».
 */
const PAYMENT = /(^|[^ء-ي])(ال|وال|بال|[بولفيتس]{0,2})(صرف|ايداع|يودع|تودع|موعد|دفعة|معونة)/;

const RULES: { id: string; label: string; test: (title: string) => boolean }[] = [
  {
    id: "citizen-account-date",
    label: "موعد صرف حساب المواطن القادم",
    test: (t) => /حساب المواطن/.test(t),
  },
  {
    id: "social-security-date",
    label: "موعد صرف الضمان الاجتماعي القادم",
    test: (t) =>
      /الضمان (الاجتماعي|المطور)|(معاش|معاشات|مستفيدي|دعم) الضمان|["«“]الضمان["»”]/.test(t) &&
      (PAYMENT.test(t) || /معاش/.test(t)),
  },
  {
    id: "pensions-date",
    label: "موعد صرف معاشات التقاعد القادم",
    test: (t) => (/التامينات|التقاعد|المتقاعد/.test(t) && PAYMENT.test(t)) || /صرف (ال)?معاشات/.test(t),
  },
  {
    id: "government-salaries-date",
    label: "موعد صرف رواتب موظفي الدولة القادم",
    test: (t) => /رواتب|الراتب/.test(t) && /موظفي الدولة|الحكومي|وزارة المالية/.test(t),
  },
  {
    id: "school-calendar-date",
    label: "موعد الإجازة المدرسية القادمة",
    test: (t) =>
      !/جامع/.test(t) &&
      (/التقويم الدراسي/.test(t) || (/اجاز/.test(t) && /مدارس|مدرس|طلاب|طالب|دراس|معلم|تقويم|تعليم/.test(t))),
  },
];

/** تشكيل وتطويل وهمزات: «يُودِع» و«إيداع» تطابقان «يودع» و«ايداع». */
export function normalizeArabicTitle(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export type ArticleServiceLinkInput = {
  title: string | null | undefined;
  categorySlug?: string | null;
  articleType?: string | null;
};

export function serviceLinkForArticle(input: ArticleServiceLinkInput): ArticleServiceLink | null {
  if (input.articleType && OPINION_TYPES.has(input.articleType)) return null;
  if (input.categorySlug && EXCLUDED_CATEGORIES.has(input.categorySlug)) return null;
  const title = normalizeArabicTitle(input.title || "");
  if (!title) return null;
  const rule = RULES.find((item) => item.test(title));
  const spec = rule ? servicePageById(rule.id) : undefined;
  if (!rule || !spec) return null;
  return { id: spec.id, path: spec.path, seriesSlug: spec.source.seriesSlug, label: rule.label };
}

/**
 * نسخة محركات البحث (seo-bundle): الرابط نفسه نصًا في آخر المتن.
 * بلا تاريخ لأن النسخة تُخزَّن مؤقتًا، والتاريخ الحي في صفحة الخدمة.
 */
export function withServiceLinkHtml(html: string, input: ArticleServiceLinkInput): string {
  const link = serviceLinkForArticle(input);
  if (!link || html.includes(`href="${link.path}"`)) return html;
  return `${html}\n<p><a href="${link.path}">${link.label}</a></p>`;
}
