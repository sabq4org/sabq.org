/**
 * «إنفو للموقع» — the creative brief. One model call reads the story and returns the idea, the figures,
 * the copy and two image prompts as JSON. Every figure, and every number in the copy, must appear
 * verbatim in the story (`valueAppearsInSource`); one corrective retry is allowed, then figures that
 * still fail are dropped. Fewer than two verified figures fails the job: no invented numbers.
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

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const short = (max: number) => z.string().trim().min(1).max(max);

export const infographicBriefSchema = z.object({
  headline: short(120),
  kicker: short(48),
  titleLines: z.array(short(26)).min(1).max(2),
  highlight: z.string().trim().max(26).optional().default(""),
  hero: z.object({ value: short(14), unit: z.string().trim().max(28).default(""), caption: short(70) }),
  figures: z.array(z.object({ value: short(14), label: short(44) })).min(MIN_FIGURES).max(5),
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
- رقم بطل واحد (hero) ثم 2 إلى 3 أرقام داعمة (figures). كل رقم منقول حرفيًا من نص الخبر بنفس أرقامه، دون تقريب أو حساب أو تحويل. لا تخترع رقمًا أو مصدرًا أو اقتباسًا.
- الألقاب الملكية تبقى كما في الخبر. لا تستخدم «قتيل/قتلى/مقتل» للضحايا؛ استخدم «وفاة/متوفون/ضحايا».
- العربية الفصحى، جمل قصيرة واضحة، بلا مبالغة ولا رموز تعبيرية.

الحقول:
- headline: عنوان الخبر في الموقع دون كلمة «إنفوجرافيك»، يبدأ بالرقم الأبرز أو بالفكرة (حتى 110 حرفًا).
- kicker: سطر تمهيدي قصير فوق العنوان (الجهة أو المجال).
- titleLines: سطران قصيران للعنوان على التصميم (حتى 22 حرفًا للسطر).
- hero: {value: الرقم بأرقام لاتينية كما في الخبر, unit: الوحدة, caption: سطر يربط الرقم بالموضوع}.
- figures: 2–3 عناصر {value, label} قصيرة.
- body: فقرتان قصيرتان للنشر مع الإنفوجرافيك في الموقع، الأولى تلخّص الخبر ومصدره، والثانية بقية الأرقام. كل رقم فيهما من الخبر.
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

function numbersOk(text: string, source: string): boolean {
  return !/[0-9٠-٩۰-۹]/.test(text) || valueAppearsInSource(text, source);
}

/** Pure validation used after each model answer (exported for unit tests). */
export function checkBrief(raw: unknown, source: string): BriefCheck {
  const parsed = infographicBriefSchema.safeParse(raw);
  if (!parsed.success) {
    return { brief: null, problems: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const brief = parsed.data;
  const problems: string[] = [];
  if (!valueAppearsInSource(brief.hero.value, source)) problems.push(`hero.value "${brief.hero.value}" not in the story`);
  const badFigures = brief.figures.filter((f) => !valueAppearsInSource(f.value, source));
  for (const f of badFigures) problems.push(`figure "${f.value}" not in the story`);
  if (!numbersOk(brief.headline, source)) problems.push("headline has a number not in the story");
  if (!brief.titleLines.every((l) => numbersOk(l, source))) problems.push("titleLines have a number not in the story");
  if (!brief.body.every((p) => numbersOk(p, source))) problems.push("body has a number not in the story");
  if (brief.highlight && !brief.titleLines.some((l) => l.includes(brief.highlight))) problems.push("highlight is not part of titleLines");
  return { brief, problems };
}

/** After the retry: drop what is still unverified, keep the job alive when enough remains. */
export function salvageBrief(brief: InfographicBrief, source: string): InfographicBrief | null {
  const figures = brief.figures.filter((f) => valueAppearsInSource(f.value, source)).slice(0, MAX_FIGURES);
  if (!valueAppearsInSource(brief.hero.value, source) || figures.length < MIN_FIGURES) return null;
  const body = brief.body.filter((p) => numbersOk(p, source));
  if (body.length === 0) return null;
  return {
    ...brief,
    figures,
    body,
    headline: numbersOk(brief.headline, source) ? brief.headline : brief.titleLines.join(" "),
    highlight: brief.titleLines.some((l) => l.includes(brief.highlight)) ? brief.highlight : "",
  };
}

/** Fixed framing rules appended to the model's prompt so the text zone stays calm. */
export function heroPrompt(brief: InfographicBrief, kind: "vertical" | "wide"): string {
  const zone =
    kind === "vertical"
      ? `Vertical portrait frame. Keep the ${brief.textZone === "top" ? "upper" : "lower"} 45% of the frame calm, soft and low in detail (sky, plain wall, soft gradient or out-of-focus surface) so text can sit on it; put the hero object in the other part.`
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
  const source = `${input.title}\n${body}`;
  if (!/[0-9٠-٩۰-۹]/.test(source)) throw new InfographicBriefError("الخبر لا يحتوي أرقامًا يُبنى عليها إنفوجرافيك.");

  const messages: ChatMessage[] = [
    { role: "system", content: BRIEF_SYSTEM_PROMPT },
    { role: "user", content: `عنوان الخبر: ${input.title}\n\nنص الخبر:\n${body}` },
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
        content: `صحّح الخطة وأعد JSON كاملًا. المشكلات:\n- ${last.problems.join("\n- ")}\nكل رقم يجب أن يظهر حرفيًا في نص الخبر.`,
      },
    );
  }
  const salvaged = last.brief ? salvageBrief(last.brief, source) : null;
  if (!salvaged) throw new InfographicBriefError("تعذر استخراج أرقام موثقة كافية من الخبر. راجع النص وحاول مجددًا.");
  return { brief: salvaged, source };
}
