/**
 * «إنفو للموقع» — the creative brief. One model call reads the story and returns the idea, the copy
 * and two image prompts as JSON, in one of two modes:
 * - `figures`: a hero number and 2–3 supporting numbers (stories built on data);
 * - `points`: 3–4 short points (awareness, events, food, how-to: stories without enough numbers).
 * Every number anywhere in the plan must appear in the story, as digits or as an Arabic number word
 * (`numbersFromStory`); one corrective retry is allowed, then what still fails is dropped.
 */
import { z } from "zod";
import { aiGateway } from "../../ai/gateway";
import type { ChatMessage } from "../../ai/gateway/types";
import { stripHtml, valueAppearsInSource } from "../imageInfographicBrief";

/** Shares the AI Hub row of the existing infographic tools (editorial system). */
export const INFOGRAPHIC_STUDIO_AI_FEATURE = "infographic-ai";
const BRIEF_TIMEOUT_MS = 90_000;
const MAX_SOURCE_CHARS = 9000;
const MIN_FIGURES = 2;
const MAX_FIGURES = 3;
const MIN_POINTS = 3;
const MAX_POINTS = 4;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const short = (max: number) => z.string().trim().min(1).max(max);

export const infographicBriefSchema = z.object({
  mode: z.enum(["figures", "points"]).default("figures"),
  headline: short(120),
  kicker: short(48),
  titleLines: z.array(short(26)).min(1).max(2),
  highlight: z.string().trim().max(26).optional().default(""),
  hero: z.object({ value: short(14), unit: z.string().trim().max(28).default(""), caption: short(70) }).nullish(),
  figures: z.array(z.object({ value: short(14), label: short(44) })).max(5).default([]),
  points: z.array(z.object({ title: short(32), text: z.string().trim().max(110).default("") })).max(6).default([]),
  body: z.array(short(480)).min(1).max(2),
  sourceLine: short(90),
  metaphor: short(220),
  imagePromptVertical: short(1500),
  /** Older plans had a separate wide prompt and a text zone; both canvases now share one photo panel. */
  imagePromptWide: z.string().trim().max(1500).optional().default(""),
  textZone: z.enum(["top", "bottom"]).optional().default("top"),
  theme: z.enum(["light", "dark"]),
  ink: hex,
  accent: hex,
  wash: hex,
});

export type InfographicBrief = z.infer<typeof infographicBriefSchema>;

export const BRIEF_SYSTEM_PROMPT = `أنت مصمم إنفوجرافيك تحريري في صحيفة سبق السعودية. تقرأ خبرًا وتعيد خطة تصميم واحدة بصيغة JSON فقط.

المنهج (معتمد من رئيس التحرير):
- فكرة بصرية واحدة كبيرة من عالم الخبر نفسه: جسم حقيقي واحد يملأ المشهد ويحمل المعنى (نخلة جذورها تمتد إلى الدول، عدّاد ماء، ميزان، قطعة شطرنج...). لا أيقونات، ولا خرائط مسطحة، ولا رسوم خطية، ولا مخططات. الصورة فوتوغرافية واقعية مولّدة.
- لا تكرر الاستعارات المستهلكة: الدرع، الميزان النحاسي، الكرة الأرضية المخيطة، الأنهار التي تصب في بحر.
- ملاءمة ثقافية سعودية: لا سوائل في كؤوس بساق أو أكواب تشبه الخمر، ولا أحذية في موضوع روحاني أو ديني، ولا احتفالات أو ألعاب نارية في خبر رسوم أو أسعار أو ضحايا. لا ترسم الحرمين ولا وجوه أشخاص حقيقيين. المواضيع الصحية بخلفية فاتحة.
- العنوان يسمّي الموضوع صراحة، في سطرين قصيرين على الأكثر، وكلمة مفتاحية واحدة تُبرز (highlight يجب أن يكون جزءًا حرفيًا من أحد السطرين). لا تكتب في titleLines رقم البطل؛ الرقم يظهر كبيرًا تحته، فتكراره في العنوان يضعف التصميم. لا تكتب المدّة (ـ) بنفسك؛ القالب يضيفها.
- اختر النمط (mode):
  - "figures" إن كان الخبر قائمًا على ثلاثة أرقام مهمة أو أكثر: رقم بطل واحد (hero) ثم 2 إلى 3 أرقام داعمة (figures).
  - "points" للأخبار التوعوية والنصائح والأطعمة والأحداث وما ليس فيه أرقام كافية: 3 إلى 4 نقاط (points) قصيرة من الخبر نفسه، كل نقطة {title: عنوان من 2–4 كلمات, text: جملة قصيرة تشرحها}. hero اختياري هنا: ضعه فقط إن كان في الخبر رقم واحد بارز، وإلا اجعله null، واجعل figures [].
- كل رقم تكتبه منقول من نص الخبر كما هو، دون تقريب أو حساب أو تحويل. إن كتب الخبر العدد بالحروف («ثلاثة») فاكتبه بالحروف أو بالأرقام. لا تخترع رقمًا أو مصدرًا أو اقتباسًا أو معلومة ليست في الخبر.
- الألقاب الملكية تبقى كما في الخبر. لا تستخدم «قتيل/قتلى/مقتل» للضحايا؛ استخدم «وفاة/متوفون/ضحايا».
- العربية الفصحى، جمل قصيرة واضحة، بلا مبالغة ولا رموز تعبيرية.

الحقول:
- headline: عنوان الخبر في الموقع دون كلمة «إنفوجرافيك»، يبدأ بالرقم الأبرز أو بالفكرة (حتى 110 حرفًا). إن لم يُعطَ عنوان للخبر فاكتبه أنت من النص.
- kicker: سطر تمهيدي قصير فوق العنوان (الجهة أو المجال).
- titleLines: سطران قصيران للعنوان على التصميم (حتى 22 حرفًا للسطر).
- mode: "figures" أو "points".
- hero: {value: الرقم بأرقام لاتينية كما في الخبر, unit: الوحدة, caption: سطر يربط الرقم بالموضوع}، أو null في نمط النقاط.
- figures: 2–3 عناصر {value, label} قصيرة في نمط الأرقام، و[] في نمط النقاط. value يبدأ بالرقم ثم وحدته القصيرة إن وجدت («102 ألف ريال»)، وlabel وصف قصير من 2–5 كلمات.
- points: 3–4 عناصر {title, text} في نمط النقاط، و[] في نمط الأرقام.
- body: فقرتان قصيرتان للنشر مع الإنفوجرافيك في الموقع، الأولى تلخّص الخبر ومصدره، والثانية بقية التفاصيل. كل رقم فيهما من الخبر.
- sourceLine: «المصدر: ...» بالجهة أو المتحدث كما في الخبر.
- metaphor: جملة عربية تشرح الفكرة البصرية.
- imagePromptVertical: وصف إنجليزي لصورة فوتوغرافية مربعة للجسم البطل وحده في وسط الإطار، كاملًا مع هامش حوله، بخلفية بسيطة غير مزدحمة، وبلا نصوص ولا حروف ولا شعارات ولا وجوه. الصورة تُعرض في لوحة مستقلة أسفل التصميم العمودي ويسار الغلاف العرضي، والنص لا يقع فوقها.
- theme: "light" إن كانت الخلفية فاتحة، أو "dark".
- wash: لون الخلفية المصمتة التي يقع عليها النص (#RRGGBB)، قريب من لون خلفية الصورة لتذوب الصورة فيه. ink: لون النص متباين بقوة مع wash. accent: لون الكلمة المبرزة والأرقام.

أعد كائن JSON واحدًا فقط بهذه الحقول، بلا شرح.`;

export interface BriefCheck {
  brief: InfographicBrief | null;
  problems: string[];
}

const AR_NUMBER_WORDS: Record<string, number> = {
  واحد: 1, واحدة: 1,
  اثنان: 2, اثنين: 2, اثنتان: 2, اثنتين: 2,
  ثلاث: 3, ثلاثة: 3,
  أربع: 4, أربعة: 4, اربع: 4, اربعة: 4,
  خمس: 5, خمسة: 5,
  ست: 6, ستة: 6,
  سبع: 7, سبعة: 7,
  ثمان: 8, ثماني: 8, ثمانية: 8,
  تسع: 9, تسعة: 9,
  عشر: 10, عشرة: 10,
};
/** Words that make a neighbouring unit part of a bigger number («ثلاثة عشر»، «خمسة وعشرون»، «ثلاثة آلاف»). */
const AR_COMPOUND = /^(?:عشر|عشرة|عشرون|عشرين|ثلاثون|ثلاثين|أربعون|أربعين|اربعون|اربعين|خمسون|خمسين|ستون|ستين|سبعون|سبعين|ثمانون|ثمانين|تسعون|تسعين|مائة|مئة|مائتان|مائتين|مئتان|مئتين|ألف|آلاف|الف|ألفان|ألفين|مليون|ملايين|مليار|مليارات)$/;

function unitWord(token: string): number | undefined {
  const bare = token.replace(/^[وفبل]?(?:ال)?/, "");
  return AR_NUMBER_WORDS[token] ?? AR_NUMBER_WORDS[bare];
}

function isNumberWord(token: string | undefined): boolean {
  if (!token) return false;
  const t = token.replace(/^و/, "");
  return unitWord(token) !== undefined || AR_COMPOUND.test(t);
}

/**
 * The story plus the digit forms it implies, for checking only: a standalone «ثلاثة صقور» also counts
 * as 3, and «310 آلاف» / «8.5 ألف» as 310,000 / 8,500. Compound number words («ثلاثة عشر») add nothing,
 * so they cannot vouch for a wrong unit. Nothing here is shown to readers.
 */
export function numbersFromStory(source: string): string {
  const extra: string[] = [];
  const tokens = source.split(/[^\u0621-\u064A]+/).filter(Boolean);
  tokens.forEach((token, i) => {
    const n = unitWord(token);
    if (n === undefined || isNumberWord(tokens[i - 1]) || isNumberWord(tokens[i + 1])) return;
    extra.push(String(n));
  });
  for (const m of source.matchAll(/(?<![\d.,٫٬])(\d+(?:\.\d+)?)\s*(?:ألف|آلاف|الف)/g)) {
    const v = Math.round(Number(m[1]) * 1000);
    extra.push(String(v), v.toLocaleString("en-US"));
  }
  return extra.length ? `${source}\n${extra.join(" ")}` : source;
}

export function numbersOk(text: string, source: string): boolean {
  return !/[0-9٠-٩۰-۹]/.test(text) || valueAppearsInSource(text, source);
}

/** Keeps the sentences whose numbers all come from the story. */
function verifiedSentences(paragraph: string, source: string): string {
  return paragraph
    .split(/(?<=[.!؟])\s+/)
    .filter((sentence) => numbersOk(sentence, source))
    .join(" ")
    .trim();
}

/** Cuts at the last word boundary that fits; a long field should shorten, not fail the whole plan. */
function clip(value: unknown, max: number): unknown {
  if (typeof value !== "string") return value;
  const t = value.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[\s،,:؛-]+$/, "");
}

const asRecord = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/**
 * Length and count limits are layout limits, not facts: a model answer that overshoots them is
 * trimmed to fit instead of being refused. Numbers are still verified afterwards.
 */
export function normaliseRawBrief(raw: unknown): unknown {
  const r = asRecord(raw);
  if (!r) return raw;
  const out: Record<string, unknown> = { ...r };
  const lens: Record<string, number> = { headline: 120, kicker: 48, sourceLine: 90, metaphor: 220, imagePromptVertical: 1500, imagePromptWide: 1500, highlight: 26 };
  for (const [k, n] of Object.entries(lens)) out[k] = clip(r[k], n);
  if (typeof r.mode === "string") out.mode = r.mode.trim().toLowerCase();
  if (Array.isArray(r.titleLines)) out.titleLines = r.titleLines.slice(0, 2).map((l) => clip(l, 26));
  if (Array.isArray(r.body)) out.body = r.body.slice(0, 2).map((p) => clip(p, 480));
  const hero = asRecord(r.hero);
  if (hero) out.hero = { ...hero, unit: clip(hero.unit ?? "", 28), caption: clip(hero.caption, 70) };
  if (Array.isArray(r.figures)) out.figures = r.figures.slice(0, 5).map((f) => { const x = asRecord(f); return x ? { ...x, label: clip(x.label, 44) } : f; });
  if (Array.isArray(r.points)) out.points = r.points.slice(0, 6).map((p) => { const x = asRecord(p); return x ? { ...x, title: clip(x.title, 32), text: clip(x.text ?? "", 110) } : p; });
  // Colours: expand #ABC, and fall back to the house palette rather than refusing a good plan.
  const palette: Record<string, string> = { ink: "#1B2430", accent: "#8A5A12", wash: "#F2ECE2" };
  for (const k of Object.keys(palette)) {
    const v = typeof r[k] === "string" ? (r[k] as string).trim().toUpperCase() : "";
    const short3 = v.match(/^#([0-9A-F])([0-9A-F])([0-9A-F])$/);
    out[k] = short3 ? `#${short3[1]}${short3[1]}${short3[2]}${short3[2]}${short3[3]}${short3[3]}` : /^#[0-9A-F]{6}$/.test(v) ? v : palette[k];
  }
  if (r.theme !== "light" && r.theme !== "dark") out.theme = "light";
  return out;
}

/** Pure validation used after each model answer (exported for unit tests). */
export function checkBrief(raw: unknown, story: string): BriefCheck {
  const parsed = infographicBriefSchema.safeParse(normaliseRawBrief(raw));
  if (!parsed.success) {
    return { brief: null, problems: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const source = numbersFromStory(story);
  const brief = parsed.data;
  const problems: string[] = [];
  if (brief.mode === "figures") {
    if (!brief.hero) problems.push("hero is required in figures mode");
    if (brief.figures.length < MIN_FIGURES) problems.push(`figures mode needs at least ${MIN_FIGURES} figures; use points mode instead`);
  } else if (brief.points.length < MIN_POINTS) {
    problems.push(`points mode needs ${MIN_POINTS}–${MAX_POINTS} points`);
  }
  if (brief.hero && !valueAppearsInSource(brief.hero.value, source)) problems.push(`hero.value "${brief.hero.value}" not in the story`);
  for (const f of brief.figures.filter((f) => !valueAppearsInSource(f.value, source))) problems.push(`figure "${f.value}" not in the story`);
  for (const p of brief.points.filter((p) => !numbersOk(`${p.title} ${p.text}`, source))) problems.push(`point "${p.title}" has a number not in the story`);
  if (!numbersOk(brief.headline, source)) problems.push("headline has a number not in the story");
  if (!brief.titleLines.every((l) => numbersOk(l, source))) problems.push("titleLines have a number not in the story");
  if (!brief.body.every((p) => numbersOk(p, source))) problems.push("body has a number not in the story");
  if (brief.highlight && !brief.titleLines.some((l) => l.includes(brief.highlight))) problems.push("highlight is not part of titleLines");
  // Design text is Arabic: a Latin word here is a leaked field name or placeholder («بـ highlight ريال»).
  const designText = [...brief.titleLines, brief.highlight, brief.kicker, brief.hero?.unit ?? "", brief.hero?.caption ?? "", ...brief.figures.map((f) => f.label), ...brief.points.map((p) => `${p.title} ${p.text}`)];
  if (designText.some(hasLatin)) problems.push("design text (titleLines, kicker, hero, figures, points) must be Arabic only: no Latin words, field names or placeholders; write the actual words and numbers");
  return { brief, problems };
}

/** A Latin letter or markup in design text is a leaked field name or placeholder. */
const hasLatin = (t: string): boolean => /[A-Za-z{}<>]/.test(t);

/**
 * After the retry: drop what is still unverified and keep the job alive when enough remains.
 * A figures plan without enough verified numbers falls back to points when it has them.
 */
export function salvageBrief(brief: InfographicBrief, story: string): InfographicBrief | null {
  const source = numbersFromStory(story);
  const hero = brief.hero && valueAppearsInSource(brief.hero.value, source) && !hasLatin(`${brief.hero.unit} ${brief.hero.caption}`) ? brief.hero : null;
  const figures = brief.figures.filter((f) => valueAppearsInSource(f.value, source) && !hasLatin(f.label)).slice(0, MAX_FIGURES);
  const points = brief.points.filter((p) => numbersOk(`${p.title} ${p.text}`, source) && !hasLatin(`${p.title} ${p.text}`)).slice(0, MAX_POINTS);
  let mode = brief.mode;
  if (mode === "figures" && (!hero || figures.length < MIN_FIGURES)) {
    if (points.length < MIN_POINTS) return null;
    mode = "points";
  }
  if (mode === "points" && points.length < MIN_POINTS) return null;
  const body = brief.body.map((p) => verifiedSentences(p, source)).filter(Boolean);
  if (body.length === 0) return null;
  const titleLines = brief.titleLines.filter((l) => numbersOk(l, source) && !hasLatin(l));
  if (titleLines.length === 0) return null;
  return {
    ...brief,
    mode,
    hero,
    figures: mode === "figures" ? figures : [],
    points: mode === "points" ? points : [],
    body,
    titleLines,
    headline: numbersOk(brief.headline, source) ? brief.headline : titleLines.join(" "),
    kicker: hasLatin(brief.kicker) ? "" : brief.kicker,
    highlight: brief.highlight && !hasLatin(brief.highlight) && titleLines.some((l) => l.includes(brief.highlight)) ? brief.highlight : "",
  };
}

/** Fixed framing rules appended to the model's prompt so the text zone stays calm. */
/** One square photo serves both canvases: it sits in its own panel, never under the text. */
export function heroPrompt(brief: InfographicBrief): string {
  return [
    "Photorealistic editorial photograph, natural subject colours, cinematic soft light, high detail.",
    brief.imagePromptVertical,
    `Square frame. The hero object sits in the centre, fully visible with a clear margin on every side; it will be cropped slightly to a landscape panel and to a portrait panel, so nothing important touches the edges. Simple uncluttered background whose tone is close to ${brief.wash}, so the photo can fade into a flat ${brief.wash} colour along its edges.`,
    "No text, letters, numbers, logos, watermarks or flags. No recognisable real people. No religious holy sites.",
  ].join("\n");
}

function parseJson(text: string): unknown {
  const raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
}

export class InfographicBriefError extends Error {}

export async function generateInfographicBrief(
  input: { title: string; content: string },
  userId?: string,
): Promise<{ brief: InfographicBrief; source: string }> {
  const body = stripHtml(input.content).slice(0, MAX_SOURCE_CHARS);
  const title = input.title.trim();
  const source = title ? `${title}\n${body}` : body;

  const messages: ChatMessage[] = [
    { role: "system", content: BRIEF_SYSTEM_PROMPT },
    { role: "user", content: `${title ? `عنوان الخبر: ${title}` : "لا يوجد عنوان؛ اكتبه من النص."}\n\nنص الخبر:\n${body}` },
  ];
  let last: BriefCheck = { brief: null, problems: [] };
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await aiGateway.complete({
      feature: INFOGRAPHIC_STUDIO_AI_FEATURE,
      userId,
      timeoutMs: BRIEF_TIMEOUT_MS,
      messages,
      options: { jsonMode: true, maxTokens: 3000, temperature: 0.7, cacheSystemPrompt: true },
    });
    let raw: unknown = null;
    try {
      raw = parseJson(response.content || "");
    } catch {
      last = { brief: null, problems: ["the answer was not valid JSON"] };
    }
    if (raw !== null) last = checkBrief(raw, source);
    if (last.brief && last.problems.length === 0) return { brief: last.brief, source };
    messages.push(
      { role: "assistant", content: response.content || "" },
      {
        role: "user",
        content: `صحّح الخطة وأعد JSON كاملًا. المشكلات:\n- ${last.problems.join("\n- ")}\nكل رقم يجب أن يظهر في نص الخبر. إن لم تكفِ الأرقام فاستخدم نمط النقاط.`,
      },
    );
  }
  const salvaged = last.brief ? salvageBrief(last.brief, source) : null;
  // Validation messages only (field names, numbers from the story), so a refusal can be diagnosed.
  if (!salvaged) console.warn("[infographic-studio] plan refused", JSON.stringify({ mode: last.brief?.mode ?? null, problems: last.problems.slice(0, 10) }));
  if (!salvaged) throw new InfographicBriefError("تعذر بناء خطة موثقة من نص الخبر. راجع النص وحاول مجددًا.");
  return { brief: salvaged, source };
}
