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
  imagePromptWide: short(1500),
  textZone: z.enum(["top", "bottom"]),
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
- العنوان يسمّي الموضوع صراحة، في سطرين قصيرين على الأكثر، وكلمة مفتاحية واحدة تُبرز (highlight يجب أن يكون جزءًا حرفيًا من أحد السطرين).
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
- figures: 2–3 عناصر {value, label} قصيرة في نمط الأرقام، و[] في نمط النقاط.
- points: 3–4 عناصر {title, text} في نمط النقاط، و[] في نمط الأرقام.
- body: فقرتان قصيرتان للنشر مع الإنفوجرافيك في الموقع، الأولى تلخّص الخبر ومصدره، والثانية بقية التفاصيل. كل رقم فيهما من الخبر.
- sourceLine: «المصدر: ...» بالجهة أو المتحدث كما في الخبر.
- metaphor: جملة عربية تشرح الفكرة البصرية.
- textZone: "top" إن كان الجزء العلوي من المشهد هادئًا للنص، أو "bottom".
- imagePromptVertical: وصف إنجليزي لصورة فوتوغرافية عمودية للجسم البطل، يذكر صراحة أن ${"`"}textZone${"`"} من الإطار (نحو 45%) فارغ هادئ قليل التفاصيل لوضع النص، وأن الصورة بلا نصوص ولا حروف ولا شعارات ولا وجوه.
- imagePromptWide: المشهد نفسه بإطار عرضي 16:9، الجسم البطل في الثلث الأيسر والجزء الأيمن (نحو 55%) هادئ فارغ للنص.
- theme: "light" إن كانت منطقة النص فاتحة، أو "dark".
- ink: لون النص (#RRGGBB) متباين مع منطقة النص، accent: لون الكلمة المبرزة والأرقام، wash: لون التظليل خلف النص (قريب من لون منطقة النص في الصورة).

أعد كائن JSON واحدًا فقط بهذه الحقول، بلا شرح.`;

export interface BriefCheck {
  brief: InfographicBrief | null;
  problems: string[];
}

const AR_NUMBER_WORDS: Array<[RegExp, number]> = [
  [/واحد|واحدة/, 1],
  [/اثنان|اثنين|اثنتان|اثنتين/, 2],
  [/ثلاث|ثلاثة/, 3],
  [/أربع|أربعة|اربع|اربعة/, 4],
  [/خمس|خمسة/, 5],
  [/ست|ستة/, 6],
  [/سبع|سبعة/, 7],
  [/ثمان|ثماني|ثمانية/, 8],
  [/تسع|تسعة/, 9],
  [/عشر|عشرة/, 10],
];
const AR_LETTER = "\u0621-\u064A";

/**
 * The story plus the digit forms it implies, for checking only: «ثلاثة صقور» also counts as 3, and
 * «310 آلاف» also counts as 310,000. Nothing here is shown to readers.
 */
export function numbersFromStory(source: string): string {
  const extra: string[] = [];
  for (const [word, n] of AR_NUMBER_WORDS) {
    const re = new RegExp(`(?:^|[^${AR_LETTER}])(?:[وفبل]?(?:ال)?)(?:${word.source})(?=$|[^${AR_LETTER}])`, "u");
    if (re.test(source)) extra.push(String(n));
  }
  for (const m of source.matchAll(/(\d+)\s*(?:ألف|آلاف|الف)/g)) {
    const v = Number(m[1]) * 1000;
    extra.push(String(v), v.toLocaleString("en-US"));
  }
  return extra.length ? `${source}\n${extra.join(" ")}` : source;
}

function numbersOk(text: string, source: string): boolean {
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

/** Pure validation used after each model answer (exported for unit tests). */
export function checkBrief(raw: unknown, story: string): BriefCheck {
  const parsed = infographicBriefSchema.safeParse(raw);
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
  return { brief, problems };
}

/**
 * After the retry: drop what is still unverified and keep the job alive when enough remains.
 * A figures plan without enough verified numbers falls back to points when it has them.
 */
export function salvageBrief(brief: InfographicBrief, story: string): InfographicBrief | null {
  const source = numbersFromStory(story);
  const hero = brief.hero && valueAppearsInSource(brief.hero.value, source) ? brief.hero : null;
  const figures = brief.figures.filter((f) => valueAppearsInSource(f.value, source)).slice(0, MAX_FIGURES);
  const points = brief.points.filter((p) => numbersOk(`${p.title} ${p.text}`, source)).slice(0, MAX_POINTS);
  let mode = brief.mode;
  if (mode === "figures" && (!hero || figures.length < MIN_FIGURES)) {
    if (points.length < MIN_POINTS) return null;
    mode = "points";
  }
  if (mode === "points" && points.length < MIN_POINTS) return null;
  const body = brief.body.map((p) => verifiedSentences(p, source)).filter(Boolean);
  if (body.length === 0) return null;
  const titleLines = brief.titleLines.filter((l) => numbersOk(l, source));
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
    highlight: titleLines.some((l) => l.includes(brief.highlight)) ? brief.highlight : "",
  };
}

/** Fixed framing rules appended to the model's prompt so the text zone stays calm. */
export function heroPrompt(brief: InfographicBrief, kind: "vertical" | "wide"): string {
  const zone =
    kind === "vertical"
      ? `Vertical portrait frame. Keep the ${brief.textZone === "top" ? "upper" : "lower"} ${brief.mode === "points" ? "60" : "45"}% of the frame calm, soft and low in detail (sky, plain wall, soft gradient or out-of-focus surface) so text can sit on it; put the hero object in the other part.`
      : "Wide 16:9 frame. Put the hero object in the left third; keep the right 55% calm, soft and low in detail so text can sit on it.";
  const prompt = kind === "vertical" ? brief.imagePromptVertical : brief.imagePromptWide;
  return [
    "Photorealistic editorial photograph, natural subject colours, cinematic soft light, high detail.",
    prompt,
    zone,
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
  if (!salvaged) throw new InfographicBriefError("تعذر بناء خطة موثقة من نص الخبر. راجع النص وحاول مجددًا.");
  return { brief: salvaged, source };
}
