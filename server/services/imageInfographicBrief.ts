/**
 * أرقام الخبر لنمط «إنفوجرافيك وبيانات» في التوليد التلقائي للصور.
 *
 * لماذا؟ (2026-10-07) المسار التلقائي كان يرسل للنموذج وصف «مشهد واقعي» مع
 * منع صريح للمخططات والأرقام والنصوص، فيخرج نمط الإنفوجرافيك صورة عادية بلا
 * بيانات. هنا نستخرج من نص الخبر نفسه 2–5 أرقام بعناوين قصيرة، ونتحقق أن كل
 * رقم موجود حرفيًا في النص (لا أرقام مخترعة)، ثم نطلب من النموذج رسمها كما هي.
 * إن لم نجد رقمين على الأقل يعود المسار إلى وصف المشهد المعتاد.
 */
import { aiGateway } from "../ai/gateway";

export const INFOGRAPHIC_FACTS_FEATURE = "infographic-ai";
const INFOGRAPHIC_FACTS_TIMEOUT_MS = 20_000;
const MAX_SOURCE_CHARS = 6000;
const MIN_FACTS = 2;
const MAX_FACTS = 5;

export interface InfographicFact {
  value: string;
  label: string;
}

export interface InfographicFacts {
  heading: string;
  facts: InfographicFact[];
}

export interface InfographicFactsInput {
  title: string;
  content?: string;
  summary?: string;
  language: "ar" | "en" | "ur";
}

const SYSTEM_PROMPT = `You extract the key figures of a news story for a data infographic.
Return JSON only: {"heading": "...", "facts": [{"value": "...", "label": "..."}]}

Rules:
- 2 to 5 facts, the most important numbers in the story (counts, percentages, money, dates, rankings).
- "value" is copied EXACTLY from the article text: same digits, same unit or % sign. Never compute, round, convert or invent a number.
- "label" says what the number measures, 2–6 words, in the article's language.
- "heading" is a short title for the infographic (max 8 words) in the article's language.
- If the story has fewer than 2 real numbers, return {"heading": "", "facts": []}.`;

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** يوحّد الأرقام الهندية والفارسية إلى لاتينية للمقارنة فقط (لا يغيّر ما يُرسم). */
function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC_INDIC.indexOf(d);
    return String(i >= 0 ? i : PERSIAN_INDIC.indexOf(d));
  });
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const NUMBER_TOKEN = /\d+(?:[.,٫٬]\d+)*/g;

/** الأرقام الكاملة في نص (رمزًا رمزًا) — «5» لا تطابق «25» ولا «20» تطابق «2026». */
function numberTokens(text: string): string[] {
  return normalizeDigits(text).match(NUMBER_TOKEN) ?? [];
}

/** الرقم مقبول فقط إن ظهر كل رقم كامل فيه رقمًا كاملًا في نص الخبر نفسه. */
export function valueAppearsInSource(value: string, source: string): boolean {
  const groups = numberTokens(value);
  if (groups.length === 0) return false;
  const src = new Set(numberTokens(source));
  return groups.every((g) => src.has(g));
}

/** نص بلا أرقام، أو كل أرقامه من الخبر — يُطبَّق على عنوان الإنفوجرافيك. */
function numbersAllFromSource(text: string, source: string): boolean {
  return numberTokens(text).length === 0 || valueAppearsInSource(text, source);
}

const clean = (s: unknown, max: number): string =>
  typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";

export async function extractInfographicFacts(
  input: InfographicFactsInput,
  userId?: string
): Promise<InfographicFacts | null> {
  const body = stripHtml(input.content || "") || (input.summary || "").trim();
  const source = `${input.title}\n${body}`.slice(0, MAX_SOURCE_CHARS);
  // بلا أي رقم في النص لا داعي لاستدعاء النموذج
  if (!/[0-9٠-٩۰-۹]/.test(source)) return null;

  try {
    const response = await aiGateway.complete({
      feature: INFOGRAPHIC_FACTS_FEATURE,
      userId,
      timeoutMs: INFOGRAPHIC_FACTS_TIMEOUT_MS,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Article language: ${input.language}\nHeadline: ${input.title}\n\nArticle text:\n${body.slice(0, MAX_SOURCE_CHARS)}`,
        },
      ],
      options: { jsonMode: true, maxTokens: 600, temperature: 0.2 },
    });
    const raw = (response.content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(raw) as { heading?: unknown; facts?: unknown };
    const facts = (Array.isArray(parsed.facts) ? parsed.facts : [])
      .map((f) => {
        const item = (f ?? {}) as { value?: unknown; label?: unknown };
        return { value: clean(item.value, 30), label: clean(item.label, 60) };
      })
      .filter((f) => f.value && f.label && valueAppearsInSource(f.value, source))
      // الرقم المكرر لا يُحسب مرتين نحو الحد الأدنى
      .filter((f, i, all) => all.findIndex((o) => normalizeDigits(o.value) === normalizeDigits(f.value)) === i)
      .slice(0, MAX_FACTS);
    if (facts.length < MIN_FACTS) {
      console.log(`[Image Infographic] Only ${facts.length} verified figures — falling back to scene brief`);
      return null;
    }
    // عنوان فيه رقم ليس في الخبر يُستبدل بعنوان الخبر نفسه
    const heading = clean(parsed.heading, 80);
    return { heading: heading && numbersAllFromSource(heading, source) ? heading : clean(input.title, 80), facts };
  } catch (error) {
    console.warn("[Image Infographic] Figure extraction failed — falling back to scene brief:", (error as Error)?.message);
    return null;
  }
}

/** نص المضمون لـcomposeImagePrompt: النصوص المسموح رسمها حصرًا، كما وردت. */
export function buildInfographicContent(data: InfographicFacts, language: "ar" | "en" | "ur"): string {
  const rtl = language !== "en";
  const langName = language === "ar" ? "Arabic" : language === "ur" ? "Urdu" : "English";
  const cards = data.facts.map((f) => `- big number: "${f.value}" — caption: "${f.label}"`).join("\n");
  return (
    `News data infographic, wide 16:9 layout, ${data.facts.length} data cards.\n\n` +
    `Title at the top: "${data.heading}"\n\n` +
    `Data cards (one simple chart, bar, ring or icon per card that matches its number):\n${cards}\n\n` +
    `Text rules: render ONLY the title, numbers and captions above, in ${langName}` +
    (rtl ? `, right-to-left reading order, the first card on the right` : ``) +
    `. Copy every number and word exactly as written, correctly spelled and fully legible. ` +
    `Do not add, translate or invent any other words, numbers, dates, logos, flags or watermarks.`
  );
}
