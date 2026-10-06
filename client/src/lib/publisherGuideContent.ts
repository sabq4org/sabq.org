/** تحويل نص قسم من دليل الناشر (تحرره الإدارة كنص حر) إلى كتل تُعرض بتنسيق. */

export type GuideBlock =
  | { kind: "lead" | "para"; text: string }
  | { kind: "tip"; text: string }
  | { kind: "list"; heading: string | null; items: string[]; tone: "do" | "dont" | "plain" };

const BULLET = /^\s*(?:[•\-–*·]|\d+[.)])\s*/;

/**
 * يحوّل نص القسم (فقرات تفصلها أسطر فارغة، وقوائم بنقاط «•») إلى كتل:
 * أول فقرة افتتاحية، والقائمة المسبوقة بعنوان نافٍ («لا تستخدم»، «تجنّب»)
 * صندوق أحمر، وغيرها أخضر، والفقرة التي تبدأ بـ«عند الشك/ملاحظة/نصيحة» إطار.
 */
export function parseGuideContent(content: string): GuideBlock[] {
  const blocks: GuideBlock[] = [];
  const chunks = content.replace(/\r/g, "").split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    const bulletLines = lines.filter((l) => BULLET.test(l));
    if (bulletLines.length > 0 && bulletLines.length >= lines.length - 1) {
      const heading = BULLET.test(lines[0]) ? null : lines[0];
      const negative = !!heading && /^(لا |لا$|تجنّ?ب|ممنوع|يُمنع|يمنع|ما لا|غير مسموح)/.test(heading);
      blocks.push({
        kind: "list",
        heading,
        items: bulletLines.map((l) => l.replace(BULLET, "")),
        tone: heading ? (negative ? "dont" : "do") : "plain",
      });
      continue;
    }
    const text = lines.join("\n");
    if (/^(عند الشك|ملاحظة|نصيحة|تنبيه|مهم)/.test(text)) blocks.push({ kind: "tip", text });
    else blocks.push({ kind: blocks.length === 0 ? "lead" : "para", text });
  }
  return blocks;
}
