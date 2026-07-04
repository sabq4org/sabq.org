/**
 * تعريف تعليقات SportMonks المباشرة إلى العربية.
 *
 * استراتيجية ثلاثية تضمن عدم ظهور أي نص إنجليزي للمستخدم:
 *
 *   1) قوالب RegEx: الأنماط المتكرّرة (هدف، ركنية، بطاقة، تسديدة، ركلة حرة،
 *      تبديل، أشواط…) تُترجم فوريًا — 0 تكلفة، 0 استدعاء AI.
 *   2) تعريب الأسماء: أسماء اللاعبين/المنتخبات الظاهرة في النص تُحلّ دفعة واحدة
 *      عبر resolveNames (قاموس ثابت + كاش DB + AI، ثم يُكاش لكل اسم للأبد).
 *   3) AI fallback للأنماط المستقبلية غير المعروفة: ترجمة دفعية بـgpt-4o-mini
 *      مع كاش ذاكرة دائم لكل نص فريد — لا نكرّر الترجمة ولا نختلط أبدًا.
 *
 * مرجع العيّنات: واجهة commentaries/fixtures/:id ترجع بيانات بـ
 * comment / minute / extra_minute / is_goal / is_important / order، والنصوص
 * أنماط موثّقة عبر مئات المباريات (Goal! ... takes the lead, wins a free kick,
 * Corner awarded to, Attempt saved/missed, First/Second half begins…).
 */
import OpenAI from "openai";
import { resolveNames } from "./worldCupNameTranslator";

const openai = new OpenAI();

export interface SmCommentary {
  comment: string;
  minute: number | null;
  extra_minute: number | null;
  is_goal: boolean;
  is_important: boolean;
  order: number;
}

export interface WcCommentaryItem {
  minute: number;
  extraMinute: number | null;
  goal: boolean;
  important: boolean;
  textAr: string;
  textEn: string;
  order: number;
}

/**
 * يعرّب دفعة تعليقات SportMonks للعربية دفعة واحدة.
 * يمرّ واحدًا (resolveNames) على كل أسماء الدفعة، ثم يطبّق القوالب متزامنًا،
 * ثم يُترجم بـAI أي تعليقات لم تطابق قالبًا (دفعة واحدة، بكاش دائم).
 *
 * @param comments التعليقات الخام كما وردت من SportMonks
 * @returns عناصر مُعرّبة مرتّبة تنازليًا حسب ترتيب المزود (الأحدث أولًا)
 */
export async function translateCommentaries(comments: SmCommentary[]): Promise<WcCommentaryItem[]> {
  if (comments.length === 0) return [];

  // (1+2) اجمع كل الأسماء الإنجليزية الظاهرة عبر الدفعة لتعريبها جملة واحدة
  const nameSet = new Set<string>();
  for (const c of comments) collectNames(c.comment, nameSet);

  // نُطبّق القوالب أولًا (متزامن، فوري) لأن أغلب الأنماط مغطّاة. لكن القوالب
  // تحتاج الأسماء المُعرّبة، فننتظر resolveNames أولًا.
  const tr = await resolveNames([...nameSet]);
  const templated = comments.map((c) => ({
    src: c,
    ar: translateOne(c.comment, tr, c.is_goal),
  }));

  // (3) فلتر: نُرسل للـAI فقط التعليقات التي بقي فيها حروف لاتينية بعد القوالب
  // (أي لم يغطّها قالب) — عادةً قليلة. هذا يقلّل حجم الدفعة ويُسرّع الرد.
  const pending = [...new Set(templated.filter((r) => !isArabicOnly(r.ar)).map((r) => r.src.comment))];
  const aiMap = pending.length > 0 ? await aiTranslate(pending) : {};
  for (const [en, ar] of Object.entries(aiMap)) {
    aiMap[en] = applyNames(ar, tr);
  }

  const items = templated.map<WcCommentaryItem>((r) => {
    const ai = (aiMap[r.src.comment] || "").trim();
    const usableAi = ai && ai !== r.src.comment && isArabicOnly(ai);
    return {
      minute: r.src.minute ?? 0,
      extraMinute: r.src.extra_minute,
      goal: r.src.is_goal,
      important: r.src.is_important,
      // نُفضّل ترجمة الـAI فقط إذا نجحت فعليًا؛ وإلا نعرض القالب العربي ولا نرجع للنص الخام.
      textAr: usableAi ? ai : r.ar,
      textEn: r.src.comment,
      order: r.src.order,
    };
  });

  // تنازليًا: الأحدث أولًا
  items.sort((a, b) => b.order - a.order);
  return items;
}

// ---------- كشف «عربي خالص» ----------

// نعتبر النص عربيًا خالصًا لو خلا من أي حرف لاتيني (أسماء لاعبين متبقية).
// هذا هو الفلتر الذي يقرر هل نحتاج ترجمة AI للسطر.
const HAS_LATIN_RE = /[A-Za-zÀ-ÿ]/;
function isArabicOnly(text: string): boolean {
  return !HAS_LATIN_RE.test(text);
}

// ---------- كاش ذاكرة لترجمات الـAI ----------

// النص الإنجليزي → العربي. تُحسب مرة واحدة لكل نص فريد ثم تُكاش طوال عمر العملية.
// تعليقات المباراة محدودة (~120 لكل مباراة، كثيرها مكرّر عبر المباريات) فيكفي
// الكاش دون جدول قاعدة بيانات. أي ترجمة جديدة تُضاف تلقائيًا هنا.
const aiTranslationCache = new Map<string, string>();

/**
 * يترجم دفعة نصوص إنجليزية للعربية عبر gpt-4o-mini، مع كاش ذاكرة دائم.
 * «أفضل جهد»: لو غابت OPENAI_API_KEY أو فشل الطلب، نُعيد النص كما هو (لا عطل).
 */
async function aiTranslate(texts: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const todo: string[] = [];
  for (const t of texts) {
    const cached = aiTranslationCache.get(t);
    if (cached != null) {
      out[t] = cached;
    } else {
      todo.push(t);
    }
  }
  if (todo.length === 0) return out;

  if (!(process.env.OPENAI_API_KEY || "").trim()) {
    // لا AI متاح — نُبقي النص كما هو (تعريب الأسماء طُبّق مسبقًا في translateCommentaries)
    for (const t of todo) out[t] = t;
    return out;
  }

  try {
    // مهلة زمنية صارمة: لو تأخّر الـAI (ازدحام/شبكة) نُلغي الطلب ونعتمد على
    // القوالب المُعرّبة وحدها بدل تعليق الاستجابة. التعليقات المترجمة تُكاش
    // فلا تتكرّر التكلفة، والمحاولة القادمة (بعد refetch) قد تنجح وتُكمّل النقص.
    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "أنت مترجم تعليقات رياضية حيّة لكرة القدم من الإنجليزية إلى العربية الفصحى المبسّطة. " +
              "ترجم كل جملة ترجمة طبيعية وموجزة كما تُقرأ في تطبيق رياضي عربي (مثل: \"Goal! France takes the lead 2-1\" " +
              "← \"هدف! تتقدّم فرنسا 2-1\"). حافظ على أسماء اللاعبين والمنتخبات كما هي إن وردت. " +
              "أعد JSON فقط بالشكل: {\"items\":[{\"src\":\"<النص الإنجليزي كما ورد>\",\"ar\":\"<العربي>\"}]}.",
          },
          { role: "user", content: JSON.stringify(todo) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: Math.min(4000, 200 + todo.length * 80),
      }),
      // 6 ثوانٍ حدّ أعلى — يكفي لـ1-4 تعليقات غير مصنّفة (الحالة الواقعية بعد فلترة
      // المهم: ~4-5 تعليقات للمباراة، أغلبها يغطّيها القالب، يتبقى 1-2 للـAI).
      // لو فُلتر أكبر (مثلاً بث كامل) تأخّر، نُلغي ونعتمد على القوالب، والمحاولة
      // القادمة بعد refetch تُكمّل النقص (الكاش يمنع التكرار).
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI translation timeout")), 6000)
      ),
    ]);
    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content) as { items?: { src?: string; ar?: string }[] };
      for (const item of parsed.items ?? []) {
        if (item.src && item.ar) {
          out[item.src] = item.ar;
          aiTranslationCache.set(item.src, item.ar);
        }
      }
    }
  } catch (error) {
    console.warn("[Commentary] AI translation failed:", (error as Error)?.message);
  }

  // ما تبقّى دون ترجمة نُبقيه كما هو (تعريب الأسماء طُبّق)
  for (const t of todo) {
    if (out[t] == null) out[t] = t;
  }
  return out;
}

// ---------- جمع الأسماء من النص ----------

// كلمة إنجليزية تبدأ بحرف كبير (تشمل اللاعبين متعددي الأسماء، المنتخبات، الأماكن).
// نلتقط التتابعات الكبيرة (Title Case) كاسم محتمل ثم يُعرّبه resolveNames.
// ملاحظة حدود الكلمات: \b في JS لا يعتبر الحروف اللاتينية الموسّعة (á é í...) جزءًا
// من الكلمة، فيقطع الأسماء مثل "Paquetá" و"Di María" قبل الحرف المُشكَّل. لذا نستبدل
// الحدّ الخلفي بـ lookahead يقبَل نهاية الاسم أو علامة ترقيم. الأسماء قد تحوي
// فاصلة عليا (D'Angelo) لكن لا تنتهي بنقطة أو شرطة، فلا نضمّنهما لاحقة.
const NAME_RUN_RE =
  /\b[A-Z][A-Za-zÀ-ÿ'']*(?:\s+[A-Z][A-Za-zÀ-ÿ'']*){0,3}(?=\s|[.,;:!?)\]]|$)/g;

function collectNames(text: string, into: Set<string>): void {
  for (const m of text.matchAll(NAME_RUN_RE)) {
    const name = m[0].trim();
    if (name.length >= 3) into.add(name);
  }
}

// استبدال الأسماء الإنجليزية بنظيراتها العربية داخل النص
function applyNames(text: string, tr: (n: string) => string): string {
  return text.replace(NAME_RUN_RE, (full) => tr(full.trim()) || full);
}

// ---------- القوالب العربية ----------

function translateOne(raw: string, tr: (n: string) => string, isGoal: boolean): string {
  const s = raw.trim();
  const low = s.toLowerCase();
  // نسخة بأسماء مُعرّبة مسبقًا — تُستعمل في الخرج المُجمَّع لتفادي مزج عربي/إنجليزي.
  const ar = applyNames(s, tr);

  // ===== الأهداف (أنماط متعدّدة) =====
  // "Goal! Australia 1(2), Egypt 1(4). Hossam ... converts the penalty with..."
  let m = s.match(
    /^Goal!\s+(.+?)\s+(\d+\(\d+\)),\s+(.+?)\s+(\d+\(\d+\))\.\s+(.+?)\s+converts\s+the\s+penalty\s+with\s+a\s+(.+?)\s+to\s+(.+?)(?:\.|$)/i
  );
  if (m) {
    return `هدف في ركلات الترجيح! ${player(m[5], tr)} يسجّل لـ${penaltyPlayerTeam(m[5], tr)} ${shotPhrase(m[6], m[7])}. النتيجة ${team(m[1], tr)} ${m[2]}، ${team(m[3], tr)} ${m[4]}`;
  }
  // "Goal! In the penalty shootout: <Player> scores for <Team> with..."
  m = s.match(
    /^Goal!\s+In\s+the\s+penalty\s+shootout:\s+(.+?)\s+scores\s+for\s+(.+?)\s+with\s+a\s+(.+?)\s+to\s+(.+?)\.\s+The\s+match\s+remains\s+(\d+-\d+),\s+and\s+(.+?)\s+now\s+has\s+(\d+)\s+penalties\s+scored\.?$/i
  );
  if (m) {
    return `هدف في ركلات الترجيح! ${player(m[1], tr)} يسجّل لـ${team(m[2], tr)} ${shotPhrase(m[3], m[4])}. النتيجة الأصلية ما زالت ${m[5]}، و${team(m[6], tr)} لديه ${m[7]} ركلات ناجحة`;
  }
  // "Goal! <Player> converts the penalty with..."
  m = s.match(/^Goal!\s+(.+?)\s+converts\s+the\s+penalty\s+with\s+a\s+(.+?)\s+to\s+(.+?)(?:\.|$)/i);
  if (m) {
    return `هدف! ${player(m[1], tr)} يسجّل من ركلة جزاء ${shotPhrase(m[2], m[3])}`;
  }

  // "Goal! <Team> takes the lead N-M with <Player> scoring..."
  m = s.match(/^Goal!\s+(.+?)\s+takes the lead\s+(\d+-\d+)\s+with\s+(.+?)\s+scoring/i);
  if (m) {
    return `هدف! ${team(m[1], tr)} يتقدّم ${m[2]} عبر ${player(m[3], tr)}${goalTail(s)}`;
  }
  // "Goal! <Team> equalizes at N-M ..."
  m = s.match(/^Goal!\s+(.+?)\s+equaliz(?:e|es|ed)\s+(?:at\s+)?(\d+-\d+)/i);
  if (m) {
    return `هدف! ${team(m[1], tr)} يدرك التعادل ${m[2]}${goalTail(s)}`;
  }
  // "Goal! <Team> lead N-N against <Team>." / "<Team> N, <Team> N."
  m = s.match(/^Goal!\s+(.+?)\s+lead\s+(\d+-\d+)\s+against\s+(.+?)(?:[.,]|$)/i);
  if (m) {
    return `هدف! ${team(m[1], tr)} يتقدّم ${m[2]} على ${team(m[3], tr)}${goalTail(s)}`;
  }
  // "Goal! The match is now N-M as <Player> scores for <Team>..."
  m = s.match(/^Goal!\s+The match is now\s+(\d+-\d+)\s+as\s+(.+?)\s+scores\s+for\s+(.+?)(?:\s+with|\s*,|\.|$)/i);
  if (m) {
    return `هدف! تصبح النتيجة ${m[1]} بعد أن سجّل ${player(m[2], tr)} لـ${team(m[3], tr)}${goalTail(s)}`;
  }
  // "Goal! <Player> scores ..." (قد يليها "for <Team>" أو وصف)
  m = s.match(/^Goal!\s+(.+?)\s+scores(?:\s+for\s+(.+?))?(?:[.,]|\s+with|$)/i);
  if (m) {
    const who = player(m[1], tr);
    const side = m[2] ? ` لـ${team(m[2], tr)}` : "";
    return `هدف! سجّل ${who}${side}${goalTail(s)}`;
  }
  // "Own goal by <Player> gives <Team> a N-M lead..."
  m = s.match(/^Own goal\s+by\s+(.+?)\s+gives\s+(.+?)\s+a\s+(\d+-\d+)/i);
  if (m) {
    return `هدف عكسي من ${player(m[1], tr)} يمنح ${team(m[2], tr)} التقدّم ${m[3]}`;
  }
  // أي هدف آخر يحمل is_goal لكن لا يطابق الأنماط أعلاه
  if (isGoal) {
    return `هدف! ${ar}`;
  }

  // ===== البطاقات =====
  // "<Player> from/of <Team> receives a yellow/red card for a foul."
  m = s.match(/^(.+?)\s+(?:from|of)\s+(.+?)\s+(?:receives|gets)\s+a\s+(yellow|red)\s+card/i)
    || s.match(/^(.+?)\s+(?:receives|gets)\s+a\s+(yellow|red)\s+card/i);
  if (m) {
    const whoGroup = m[1];
    const colorWord = (m[3] || m[2] || "").toLowerCase();
    const who = player(whoGroup, tr);
    if (colorWord === "red") {
      return `بطاقة حمراء على ${who}`;
    }
    return `بطاقة صفراء على ${who}`;
  }
  // "Second yellow card..." / "sent off"
  if (/second yellow|sent off|red card/i.test(low)) {
    return `بطاقة حمراء — ${ar}`;
  }
  // "VAR decision: the card has been changed." / referee decisions
  if (/\bvar\b|\bdecision\b/i.test(low)) {
    return `قرار حكم — ${ar}`;
  }

  // ===== ركلة جزاء =====
  if (/\bpenalty\b/i.test(low)) {
    return `ضربة جزاء — ${ar}`;
  }

  // ===== ركنية (صيغ متعدّدة) =====
  m = s.match(/Corner\s+awarded\s+to\s+(.+?)(?:[.,]|$)/i)
    || s.match(/(.+?)\s+wins\s+a\s+corner\s+after\s+(.+?)\s+concedes/i)
    || s.match(/^Corner\s+for\s+(.+?)(?:[,.]|conceded|$)/i);
  if (m) {
    const t = team(m[1], tr);
    return `ركلة ركنية لـ${t}`;
  }

  // ===== ركلات حرة (شائعة جدًا — كانت سبب الاختلاط) =====
  m = s.match(/^(.+?)\s+(?:from|of)\s+(.+?)\s+(wins|is awarded|earns)\s+a\s+free\s+kick\s+(.+)/i)
    || s.match(/^(.+?)\s+(wins|is awarded|earns)\s+a\s+free\s+kick\s+(.+)/i);
  if (m) {
    // اللاعب قد يسبقه "from <Team>" أو لا
    const hasTeam = /from|of/.test(m[0]) && m[2];
    const who = player(hasTeam ? m[1] : m[1], tr);
    const sidePart = hasTeam ? ` (${team(m[2]!, tr)})` : "";
    const where = freeKickWhere(m[3] || m[2] || "");
    return `ركلة حرة لـ${who}${sidePart}${where}`;
  }
  if (/free\s+kick/i.test(low)) {
    return `ركلة حرة — ${ar}`;
  }

  // ===== تبديل =====
  if (/substitut|comes on|comes off|replaces|is brought on|substitution/i.test(low)) {
    return `تبديل — ${ar}`;
  }

  // ===== تسديدات =====
  // "Attempt saved. <Keeper> from <Team> saves a <foot>-footed shot from <Shooter>."
  m = s.match(
    /^Attempt saved\.\s+(.+?)\s+from\s+(.+?)\s+saves a\s+(?:[\w-]+\s+)?(?:header|shot)\s+from\s+(.+?)(?:[.,]|\s*$)/i
  );
  if (m) {
    return `تصدٍّ — ${player(m[1], tr)} (${team(m[2], tr)}) يُبعد تسديدة ${player(m[3], tr)}`;
  }
  m = s.match(/^Attempt saved\.\s+(.+?)\s+saves a\s+(?:[\w-]+\s+)?(?:header|shot)\s+from\s+(.+?)(?:[.,]|\s*$)/i);
  if (m) {
    return `تصدٍّ — ${player(m[1], tr)} يُبعد تسديدة ${player(m[2], tr)}`;
  }
  m = s.match(/^(.+?)'s\s+.+?shot\s+.+?is\s+saved/i);
  if (m) {
    return `تصدٍّ لتسديدة ${player(m[1], tr)}`;
  }
  if (/attempt saved|attempt is saved|is saved/i.test(low)) {
    return `تصدٍّ — ${ar}`;
  }
  // "Attempt missed. <Shooter> from <Team> misses..." / "<Shooter>'s ... shot ..."
  m = s.match(/^Attempt missed\.\s+(.+?)\s+from\s+(.+?)\s+misses/i);
  if (m) {
    return `تسديدة محالة — ${player(m[1], tr)} (${team(m[2], tr)})`;
  }
  m = s.match(/^Attempt missed\.\s+(.+?)\s+misses/i) || s.match(/^(.+?)\s+misses\s+an?\s+(?:attempt|header)/i);
  if (m) {
    return `تسديدة محالة — ${player(m[1], tr)}`;
  }
  if (/attempt missed|attempt goes wide|misses an attempt|misses a/i.test(low)) {
    return `تسديدة محالة — ${ar}`;
  }

  // ===== بدايات/نهايات الأشواط =====
  if (/first half begins|kick-off|kickoff|match begins/i.test(low)) {
    return `بداية الشوط الأول`;
  }
  if (/second half begins/i.test(low)) {
    return `بداية الشوط الثاني`;
  }
  if (/half[- ]?time|end of the first half|first half ends/i.test(low)) {
    return `نهاية الشوط الأول`;
  }
  // الوقت بدل الضائع: "there will be N minutes of added time"
  m = s.match(/(\d+)\s+minutes?\s+of\s+added time/i) || s.match(/added time.*?(\d+)/i);
  if (m) {
    return `الوقت بدل الضائع: ${m[1]} دقائق`;
  }
  // تأخير/استئناف
  if (/delay is over|ready to continue|play resumes/i.test(low)) {
    return `استئناف اللعب`;
  }
  if (/delay|drinks break|temporary suspension/i.test(low)) {
    return `توقّف مؤقّت — ${ar}`;
  }
  if (/match ends|game ended|full[\s-]?time|second half ends/i.test(low)) {
    return `صافرة النهاية`;
  }

  // ===== fallback: نُعرّب الأسماء ونُبقي النص =====
  // (التعليقات التي تبقى بحروف لاتينية ستُترجم بـAI في translateCommentaries)
  return ar;
}

// ذيل الهدف: نلتقط وصف التسديدة إن وُجد (... from outside the box ...)
function goalTail(s: string): string {
  const m = s.match(/from\s+(outside the box|the center of the box|the box|the penalty spot|the right side of the box|the left side of the box|very close range)/i);
  if (!m) return "";
  const map: Record<string, string> = {
    "outside the box": " (من خارج المنطقة)",
    "the center of the box": " (من مركز المنطقة)",
    "the box": " (من داخل المنطقة)",
    "the penalty spot": " (من نقطة الجزاء)",
    "the right side of the box": " (من يمين المنطقة)",
    "the left side of the box": " (من يسار المنطقة)",
    "very close range": " (من مسافة قريبة جدًا)",
  };
  return map[m[1].toLowerCase()] ?? "";
}

function shotPhrase(footRaw: string, targetRaw: string): string {
  const foot = shotFoot(footRaw);
  const target = shotTarget(targetRaw);
  return [foot, target].filter(Boolean).join(" ");
}

function shotFoot(raw: string): string {
  const low = raw.toLowerCase();
  if (/right/.test(low)) return "بتسديدة بالقدم اليمنى";
  if (/left/.test(low)) return "بتسديدة بالقدم اليسرى";
  if (/header|headed/.test(low)) return "برأسية";
  return "بتسديدة";
}

function shotTarget(raw: string): string {
  const low = raw.toLowerCase().replace(/\.$/, "").trim();
  if (/bottom left corner/.test(low)) return "إلى الزاوية اليسرى السفلية";
  if (/bottom right corner/.test(low)) return "إلى الزاوية اليمنى السفلية";
  if (/top left corner/.test(low)) return "إلى الزاوية اليسرى العليا";
  if (/top right corner/.test(low)) return "إلى الزاوية اليمنى العليا";
  if (/centre|center/.test(low)) return "في وسط المرمى";
  if (/left/.test(low)) return "جهة اليسار";
  if (/right/.test(low)) return "جهة اليمين";
  return "";
}

// موضع الركلة الحرة: "on the left wing" ← " على الجناح الأيسر"
function freeKickWhere(rest: string): string {
  const low = rest.toLowerCase();
  if (/left wing/.test(low)) return " على الجناح الأيسر";
  if (/right wing/.test(low)) return " على الجناح الأيمن";
  if (/attacking half/.test(low)) return " في نصف المهاجم";
  if (/defensive half/.test(low)) return " في نصف المدافع";
  return "";
}

// تعريب اسم لاعب: نُسقط أي ذكر للمنتخب بين قوسين ثم نُعرّب
function player(name: string, tr: (n: string) => string): string {
  const cleaned = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!cleaned) return "";
  return tr(cleaned) || cleaned;
}

function penaltyPlayerTeam(name: string, tr: (n: string) => string): string {
  const m = name.match(/\(([^)]+)\)\s*$/);
  return m ? team(m[1], tr) : "فريقه";
}

// تعريب اسم منتخب: قد يأتي بصيغة «<Team> after <X> concedes» فنأخذ الأول
function team(name: string, tr: (n: string) => string): string {
  const cleaned = name.split(/\s+(?:after|concedes?|win[s]?|is)\b/i)[0].trim();
  if (!cleaned) return "";
  return tr(cleaned) || cleaned;
}
