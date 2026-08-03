/**
 * حراس اكتمال مخرجات التحرير التوليدي.
 *
 * الخلفية (حادثة 2026-08-03): مع Structured Outputs، إذا أصدر النموذج علامة
 * تنصيص ASCII خامًا (") داخل حقل content بدل الصيغة المهرَّبة (\")، تعتبرها
 * قواعد الفرض النحوي إغلاقًا لسلسلة JSON وتُكمل بقية البنية بشكل صالح تمامًا —
 * فيصل المحتوى مبتورًا عند علامة التنصيص بلا max_tokens ولا خطأ parse.
 * حراس البتر السابقة (#352) تفحص stop_reason فقط فلا تلتقط هذه الحالة.
 */

/** يجرّد HTML إلى نص صافٍ لمقارنة الأطوال */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** لا نطبق فحص النسبة على المدخلات الضخمة (سلاسل بريد) حيث التنظيف المشروع يزيل معظمها */
const RATIO_CHECK_MIN_INPUT = 400;
const RATIO_CHECK_MAX_INPUT = 10_000;
const MIN_OUTPUT_RATIO = 0.5;

/**
 * يرمي خطأ إذا بدا المحتوى المحرر مبتورًا. يُستدعى بعد JSON.parse في مسار
 * النموذج الأساسي (فيسقط للبديل) وبعد مسار البديل (فيصعد لإعادة المحاولة).
 *
 * فحصان:
 * 1. محتوى HTML لا ينتهي بوسم إغلاق = قُطع داخل فقرة (البصمة الحتمية للعلة).
 * 2. النص الصافي أقصر من نصف المدخل الصافي = أُسقطت فقرات كاملة (شبكة أمان
 *    احتياطية، تُتجاوز للمدخلات الضخمة حيث التنظيف المشروع يقلّص كثيرًا).
 */
export function assertEditedContentComplete(content: string, inputText: string): void {
  // مواد الـ spam (درجة < 10) قد تعود بمحتوى فارغ عمدًا — الغياب ليس بترًا
  if (!content) return;

  const trimmed = content.trimEnd();
  const usesHtmlBlocks = /<p[\s>]/i.test(trimmed);
  if (usesHtmlBlocks && !/<\/[a-z][a-z0-9]*>$/i.test(trimmed)) {
    throw new Error(
      "Edited content truncated: HTML body does not end with a closing tag (unescaped quote closed the JSON string early?)"
    );
  }

  const inputPlain = htmlToPlainText(inputText);
  if (inputPlain.length < RATIO_CHECK_MIN_INPUT || inputPlain.length > RATIO_CHECK_MAX_INPUT) return;

  const contentPlain = htmlToPlainText(content);
  if (contentPlain.length < inputPlain.length * MIN_OUTPUT_RATIO) {
    throw new Error(
      `Edited content truncated: output ${contentPlain.length} chars < ${MIN_OUTPUT_RATIO * 100}% of input ${inputPlain.length} chars`
    );
  }
}
