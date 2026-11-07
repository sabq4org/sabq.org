/**
 * «إنفو للموقع» — the art-director step. After the brief has verified the numbers and the copy, a second
 * model call designs both canvases itself (composition, title placement, how the numbers sit on the
 * hero object) from Sabq's infographic guide, and writes the image prompts to match its layout.
 *
 * The model returns CSS and the inner HTML of `.canvas` only. It is sanitised (no scripts, handlers,
 * external URLs or embedded documents), wrapped in the house shell (fonts, logo, fitter), rendered with
 * every network request blocked, and checked like the fixed template. Every number in the rendered text
 * must come from the story. The fixed template stays as the fallback.
 */
import { aiGateway } from "../../ai/gateway";
import type { ChatMessage } from "../../ai/gateway/types";
import { INFOGRAPHIC_STUDIO_AI_FEATURE, type InfographicBrief } from "./brief";

const DESIGN_TIMEOUT_MS = 180_000;

export interface InfographicDesign {
  concept: string;
  imageVertical: string;
  imageWide: string;
  cssVertical: string;
  htmlVertical: string;
  cssWide: string;
  htmlWide: string;
}

export const DESIGN_SYSTEM_PROMPT = `أنت مدير فني ومصمّم إنفوجرافيك تحريري في صحيفة «سبق» السعودية. تحوّل خطة خبر جاهزة إلى تصميمين يُنشران في موقع سبق: إنفوجرافيك عمودي 1080×1920، وصورة واجهة عرضية 1920×1080. المطلوب صورة تُوقف الإصبع عن التمرير، ثم أرقام دقيقة تُقرأ في ثانيتين على الجوال. لست منسّق بيانات: لا «صورة وتحتها صف أرقام».

## المنهج
1. **العنصر البطل:** عنصر واحد ضخم واقعي التصوير (photoreal) من عالم القصة، يأخذ 55–70% من اللوحة، والأرقام تُبنى عليه أو داخل المشهد: محفورة على سطحه، مكتوبة على ملصق أو لافتة فيه، على خطوط تشير إلى أجزائه، على الرمل أو الجدار خلفه. ليست في مربعات ولا صفًّا ملصقًا تحت الصورة. استخرج الاستعارة من تفصيلة داخل القصة، واكتب لنفسك 5 أفكار واشطب أول ثلاث (الأكثر ابتذالًا).
2. **تأكد أن الاستعارة لا تقلب المعنى**، وأنها من بيئة القارئ السعودي، وأن نبرتها تناسب الخبر (لا احتفال في خبر رسوم أو حزن).
3. **التكوين يتغير كل مرة.** اختر واحدًا يناسب القصة (أو ابتكر غيره):
   - العنوان داخل العنصر نفسه (لافتة، شاشة، ملصق، بطاقة مزاد) والأرقام حوله.
   - العنصر في الأعلى ضخمًا والعنوان أسفل الصفحة.
   - العنوان مقسوم على جانبي العنصر.
   - الرقم البطل عملاق خلف العنصر أو يتقاطع معه (العنصر أمام الرقم جزئيًا).
   - أرقام على خطوط إشارة رفيعة تشير إلى أجزاء العنصر.
   - تسلسل يتبع حركة في الصورة (مسار، درج، مدرّج).
   الممنوع: الهيكل المكرر «صورة ثم عنوان ثم صف أرقام متساوية ثم تذييل»، والمربعات والبطاقات بإطار، والخطوط المتقطعة للزينة، والرسوم الخطية والأيقونات.
4. **الأرقام:** الرقم البطل 200–280px (Alexandria 900) أكبر بوضوح من الداعمة (90–130px)، وتحت كل رقم سطر قصير يقول ماذا يقيس. الوحدة («ألف ريال») بخط أصغر من الرقم. 3–4 أرقام كحد أقصى. في نمط النقاط: 3–4 نقاط قصيرة موزعة على العنصر أو حوله، مرقمة بأرقام كبيرة.
5. **العنوان:** بخط HC وزن 900، بين 96 و128px في العمودي، سطران كحد أقصى، يسمّي الموضوع صراحة، وكلمة مفتاحية واحدة بلون الإبراز، ومدّ (ـــ) في كلمة أو كلمتين في وسط الكلمة («ليـــلة مزاد الصقـــور»)، لا بعد «ال» ولا داخل «لا».
6. **الألوان:** لون غالب من الصورة نفسها، ولون إبراز واحد، ومحايد للنص. ثلاثة ألوان كحد أقصى، والأحمر للعاجل فقط. الصحة والغذاء على خلفية فاتحة. تباين النص قوي دائمًا.
7. **الملاءمة:** لا كأس بساق لسائل، ولا أحذية في سياق ديني، ولا وجوه أشخاص حقيقيين، ولا ضحية ظاهرة، ولا الحرمين.

## المحتوى
- استعمل نص الخطة المعطاة فقط. يمكنك اختصار جملة، لكن لا تضف رقمًا أو معلومة أو اسمًا ليس في الخطة. أي رقم في التصميم ليس في الخبر يُسقط التصميم كله.
- لا تكتب أسماء الحقول أو كلمات إنجليزية في النص الظاهر.

## العقد التقني (إلزامي)
- اكتب CSS ومحتوى عنصر \`.canvas\` فقط. اللوحة جاهزة: \`.canvas{position:relative;overflow:hidden}\` بالمقاس المحدد، و\`dir="rtl"\`.
- ممنوع: <script>، <img>، <link>، <style> داخل HTML، <iframe>، خصائص on*، روابط خارجية، @import، و@font-face.
- الخطوط المتاحة: \`HC\` (عام الحرف اليدوية، وزن 900، للعنوان فقط)، \`Alex\` (Alexandria من 100 إلى 900، للأرقام والعناوين الفرعية)، \`Plex\` (400 و600، للنص). خط HC لا يعرض الحروف اللاتينية ولا «».
- الصورة المولدة: \`var(--photo)\` بمقاس اللوحة نفسها؛ استعملها خلفية لأي عنصر، مثل \`background:var(--photo) center/cover\`، بعرض اللوحة كاملة أو مقصوصة بشكل. أنت من يكتب وصفها، فاجعل التكوين في الوصف مطابقًا لتصميمك.
- تظليل النص فوق الصورة: تدرّج في منطقة النص فقط بألفا \`var(--a1)\` و\`var(--a2)\` (مثل \`linear-gradient(180deg,rgba(20,14,8,var(--a1)),rgba(20,14,8,0))\`)؛ الفاحص يرفعهما تلقائيًا إن ضعف التباين.
- الشعار: ضع \`{{LOGO_WHITE}}\` (على الداكن والصور) أو \`{{LOGO_COLOR}}\` (على الفاتح البارد) داخل عنصر \`data-qa="logo"\` بعرض 150–190px في الزاوية العليا، بمسافة 56px على الأقل من الحافة. لا تعِد تلوينه. يمكنك وضع ظل دائري ناعم خلف الأبيض.
- وسم الصورة: \`{{AI_LABEL}}\` داخل عنصر \`data-qa="ai-label"\` بخط Plex لا يقل عن 20px.
- العمودي فقط: تذييل فيه سطر المصدر في عنصر \`data-qa="source"\` يمينًا، و«sabq.org» يسارًا، بخط 24px فأكثر، على بعد 48px من الأسفل.
- كل كتلة نص (العنوان، كل رقم مع سطره، كل نقطة، التمهيد، المصدر) عنصر مستقل بـ \`data-qa\` واسم يصفه: title، kicker، hero، figure، point، source، caption. لا تتداخل كتلتان.
- كل حاوية نص ثابتة الأبعاد تأخذ \`data-zone\`، وأحجام الخطوط فيها بصيغة \`calc(110px*var(--s))\` ليصغّرها الفاحص إن لم تتسع.
- العرضي 1920×1080 صورة واجهة للصفحة الرئيسية: العنوان والرقم البطل وسطره فقط، مع الشعار والوسم، بلا تذييل. يُقرأ مصغّرًا، فلا تكتب فيه نصًا صغيرًا.
- لا نص يلمس حافة اللوحة: هامش 56px على الأقل.

## وصف الصورتين (بالإنجليزية)
صورة فوتوغرافية واقعية للعنصر البطل، بلا أي نص أو حروف أو أرقام أو شعارات أو أعلام أو وجوه أشخاص حقيقيين. اذكر بالنِّسَب أين يقع العنصر وأي المناطق تبقى هادئة للنص، مطابقة لتصميمك (مثلًا: "the falcon stands in the lower 60% of the frame, centred; the upper 35% is a calm dark studio wall"). العمودي بنسبة 2:3 يُقص إلى 9:16، والعرضي 16:9.

## صيغة الرد
أعد الأقسام التالية فقط، كل قسم بين وسميه، بلا أي شرح خارجها:
<concept>جملة عربية: الاستعارة والتكوين ولماذا يناسبان القصة</concept>
<image_vertical>English prompt</image_vertical>
<image_wide>English prompt</image_wide>
<css_vertical>…</css_vertical>
<html_vertical>…</html_vertical>
<css_wide>…</css_wide>
<html_wide>…</html_wide>`;

const SECTIONS = ["concept", "image_vertical", "image_wide", "css_vertical", "html_vertical", "css_wide", "html_wide"] as const;

export function parseDesign(text: string): InfographicDesign | null {
  const get = (tag: string) => {
    const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return m ? m[1].trim() : "";
  };
  const v = Object.fromEntries(SECTIONS.map((s) => [s, get(s)])) as Record<(typeof SECTIONS)[number], string>;
  if (!v.image_vertical || !v.image_wide || !v.html_vertical || !v.html_wide) return null;
  return {
    concept: v.concept.slice(0, 400),
    imageVertical: v.image_vertical.slice(0, 1500),
    imageWide: v.image_wide.slice(0, 1500),
    cssVertical: v.css_vertical,
    htmlVertical: v.html_vertical,
    cssWide: v.css_wide,
    htmlWide: v.html_wide,
  };
}

/** Removes anything executable or remote from model-written markup. Rendering also blocks the network. */
export function sanitizeDesignHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|form|svg|math|template|noscript|video|audio|picture|title|textarea)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta|base|form|svg|math|template|noscript|video|audio|source|picture|title|textarea)\b[^>]*>/gi, "")
    .replace(/<\s*\/?\s*(img|input|button|textarea|select)\b[^>]*>/gi, "")
    .replace(/([\s/"'])on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "$1")
    .replace(/([\s/"'])(href|src|srcset|action|formaction|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "$1")
    .replace(/javascript:/gi, "");
}

export function sanitizeDesignCss(css: string): string {
  return css
    .replace(/<\/?style[^>]*>/gi, "")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/@font-face\s*\{[^}]*\}/gi, "")
    .replace(/url\(\s*(['"]?)(?!data:)[^)]*\1\s*\)/gi, "none")
    .replace(/expression\s*\(/gi, "(")
    .replace(/<\/?[a-z][^>]*>/gi, "");
}

/** Structural problems that are cheap to see before rendering. */
export function designContractProblems(d: InfographicDesign): string[] {
  const problems: string[] = [];
  for (const [name, html] of [["vertical", d.htmlVertical], ["wide", d.htmlWide]] as const) {
    if (!/data-qa=["']title["']/.test(html)) problems.push(`${name}: the title element with data-qa="title" is missing`);
    if (!/\{\{LOGO_(WHITE|COLOR)\}\}/.test(html)) problems.push(`${name}: {{LOGO_WHITE}} or {{LOGO_COLOR}} is missing`);
    if (!html.includes("{{AI_LABEL}}")) problems.push(`${name}: {{AI_LABEL}} is missing`);
    if (!/data-zone/.test(html)) problems.push(`${name}: no element has data-zone`);
  }
  if (!/data-qa=["']source["']/.test(d.htmlVertical)) problems.push(`vertical: the source line with data-qa="source" is missing`);
  if (!/var\(--photo\)/.test(`${d.cssVertical}${d.htmlVertical}`)) problems.push("vertical: the photo var(--photo) is not used");
  if (!/var\(--photo\)/.test(`${d.cssWide}${d.htmlWide}`)) problems.push("wide: the photo var(--photo) is not used");
  return problems;
}

function briefForDesigner(b: InfographicBrief) {
  return {
    mode: b.mode,
    kicker: b.kicker,
    titleLines: b.titleLines,
    highlight: b.highlight,
    hero: b.hero ?? null,
    figures: b.figures,
    points: b.points,
    sourceLine: b.sourceLine,
    metaphorIdea: b.metaphor,
    theme: b.theme,
    colours: { ink: b.ink, accent: b.accent, wash: b.wash },
  };
}

export class InfographicDesignError extends Error {}

/** Opens the conversation; `repair` continues it with the problems found in the last answer. */
export function designMessages(brief: InfographicBrief, story: string): ChatMessage[] {
  return [
    { role: "system", content: DESIGN_SYSTEM_PROMPT },
    {
      role: "user",
      content: `الخطة الموثقة (أرقامها كلها من الخبر):\n${JSON.stringify(briefForDesigner(brief), null, 2)}\n\nنص الخبر للسياق فقط:\n${story.slice(0, 5000)}\n\nصمّم التصميمين الآن.`,
    },
  ];
}

export async function requestDesign(messages: ChatMessage[], userId?: string): Promise<{ design: InfographicDesign | null; raw: string }> {
  const response = await aiGateway.complete({
    feature: INFOGRAPHIC_STUDIO_AI_FEATURE,
    userId,
    timeoutMs: DESIGN_TIMEOUT_MS,
    messages,
    options: { maxTokens: 12000, temperature: 0.9, cacheSystemPrompt: true },
  });
  const raw = response.content || "";
  return { design: parseDesign(raw), raw };
}

export function repairMessage(problems: string[]): ChatMessage {
  return {
    role: "user",
    content: `فحصتُ التصميم بعد التصدير ووجدت:\n- ${problems.join("\n- ")}\nأصلح هذه المشكلات وحدها مع الإبقاء على الفكرة والتكوين، وأعد الأقسام كلها بالصيغة نفسها. لا تغيّر وصف الصورتين إلا إن كان سبب المشكلة في التكوين.`,
  };
}
