/**
 * صياغة لقطات VARA الذكية: AI للغة فقط، مع سقوط دائم إلى قوالب حتمية.
 */
import { generateJson, isAiAvailable } from "../sportsIntelligence/aiClient";
import {
  SNAP_BODY_MAX_CHARS,
  SNAP_HEADLINE_MAX_CHARS,
  type SportsSnapAccent,
  type SportsSnapKind,
} from "./config";
import type { TeamSnapFacts } from "./factsBuilder";
import { validateSnapCandidate } from "./guardrails";
import { deterministicSnaps, type TemplateSnap } from "./templates";

const NEUTRALITY_RULES = `1. لا سخرية ولا تهكّم على أي فريق أو لاعب أو جمهور، فائزًا كان أو خاسرًا.
2. ممنوع معجم العنف والإذلال: سحق، اكتساح، إذلال، تلقين درس، دمّر، انهيار، فضيحة، مهزلة، كارثة، مذبحة، إعدام.
3. ممنوع معجم الثأر والعداء: انتقام، ثأر، غريم، عقدة، عدو، حرب، معركة، صراع وجود. («المنافس التقليدي» و«الديربي» و«القمة» مقبولة).
4. لا حديث عن التحكيم إطلاقًا: لا ظلم، لا مؤامرة، لا «حُرم من ركلة جزاء» — حتى لو وردت واقعة فار في البيانات تُذكر وصفًا محايدًا («أُلغي هدف بقرار الفار») أو تُترك.
5. لا إسقاطات مناطقية أو طبقية أو طائفية، ولا تعميم على الجماهير («جمهور X دائمًا…» ممنوعة بكل صيغها).
6. لا جزم بالنتائج: «يرجَّح»، «تشير الأرقام»، «فرصة» — وممنوع «سيفوز حتمًا»، «مباراة محسومة»، «لا أمل».
7. الخسارة تُذكر بحيادية وتقترن دائمًا بالتالي البنّاء (المباراة القادمة، موقف الترتيب) — لا تجليد ولا تبرير.
8. كل رقم في النص يجب أن يكون موجودًا حرفيًّا في حزمة الحقائق المرفقة. ممنوع أي إحصائية أو معلومة من خارجها.
9. الفريقان يُذكران باحترام متساوٍ؛ التخصيص («فريقك») تضيفه طبقة التركيب الحتمية لاحقًا، فالنص المولَّد نفسه محايد بين الفريقين.
10. الطول: headline ≤ 60 حرفًا، body ≤ 140 حرفًا.`;

interface AiSnap {
  kind?: string;
  headline?: string;
  body?: string;
  accent?: string;
}

interface AiResponse {
  snaps?: AiSnap[];
}

function promptFor(facts: TeamSnapFacts, isDerby: boolean): string {
  return `أنت محرر رياضي في صحيفة سبق. اكتب «لقطات» قصيرة محايدة عن فريق كرة قدم،
اعتمادًا حصريًّا على الحقائق المرفقة بصيغة JSON. لا تضف أي معلومة أو رقم من خارجها.
لا تكتب تذكير موعد فقط. يجب أن تضيف زاوية مفيدة من الحقائق: ترتيب/نقاط، فارق نقاط،
آخر نتيجة، أهمية المباراة، أو سياق الجولة. إن لم تجد زاوية موثّقة فاكتب صياغة حذرة
تدعو لفتح مركز المباراة بدل ادعاء تحليل.

قواعد ملزمة:
${NEUTRALITY_RULES}

أعد JSON فقط بالمخطط:
{ "snaps": [ { "kind": "upcoming_match|behavioral_big_match|post_match_recap", "headline": "...", "body": "...", "accent": "green|gold|crimson" } ] }

الحقائق:
${JSON.stringify(facts)}
${isDerby ? "تنبيه: هذه مواجهة عالية الحساسية جماهيريًّا — التزم حيادية مضاعفة وتجنّب أي صياغة تفضيلية." : ""}`;
}

function clampText(value: string, max: number): string {
  const chars = Array.from(value.trim().replace(/\s+/g, " "));
  if (chars.length <= max) return chars.join("");
  return chars.slice(0, Math.max(0, max - 1)).join("").trimEnd();
}

function mergeWithTemplate(template: TemplateSnap, ai: AiSnap | undefined): TemplateSnap {
  if (!ai) return template;
  return {
    ...template,
    headline: clampText(String(ai.headline ?? template.headline), SNAP_HEADLINE_MAX_CHARS),
    body: clampText(String(ai.body ?? template.body), SNAP_BODY_MAX_CHARS),
    accent: (ai.accent ?? template.accent) as SportsSnapAccent,
  };
}

function isSameKind(ai: AiSnap, kind: SportsSnapKind): boolean {
  return ai.kind === kind;
}

async function aiSnaps(facts: TeamSnapFacts): Promise<AiSnap[]> {
  if (!isAiAvailable()) return [];
  const isDerby = Boolean(facts.bigMatch && facts.bigMatch.importance >= 88);
  const parsed = await generateJson<AiResponse>(promptFor(facts, isDerby), {
    feature: "sports-snaps",
    // mini تكفي هنا: نصوص ≤140 حرفًا يحرسها validateSnapCandidate مع سقوط دائم
    // إلى القوالب الحتمية عند أي انزلاق.
    tier: "mini",
    maxTokens: 600,
  });
  return Array.isArray(parsed?.snaps) ? parsed.snaps : [];
}

export async function composeSnaps(facts: TeamSnapFacts): Promise<TemplateSnap[]> {
  const templates = deterministicSnaps(facts);
  if (templates.length === 0) return [];

  const generated = await aiSnaps(facts).catch(() => []);
  const result: TemplateSnap[] = [];

  for (const template of templates) {
    const merged = mergeWithTemplate(
      template,
      generated.find((item) => isSameKind(item, template.kind)),
    );
    const validation = validateSnapCandidate(
      {
        kind: merged.kind,
        headline: merged.headline,
        body: merged.body,
        accent: merged.accent,
      },
      facts,
    );

    if (validation.ok) {
      result.push(merged);
      continue;
    }

    const fallbackValidation = validateSnapCandidate(
      {
        kind: template.kind,
        headline: template.headline,
        body: template.body,
        accent: template.accent,
      },
      facts,
    );
    if (fallbackValidation.ok) result.push(template);
  }

  return result;
}
