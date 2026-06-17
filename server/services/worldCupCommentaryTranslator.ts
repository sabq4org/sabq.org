/**
 * تعريف تعليقات SportMonks المباشرة إلى العربية — طبقة قالبية سريعة.
 *
 * فلسفة التعريب: تعليقات SportMonks أنماط مكرّرة محدودة (هدف، ركنية، تسديدة،
 * إنذار…) فلا نحتاج ترجمة AI لكل رسالة. نكتفي بـ:
 *   1) كشف النمط بـRegEx على النص الإنجليزي وإخراج قالب عربي.
 *   2) تعريب أسماء اللاعبين/المنتخبات الظاهرة في النص عبر resolveNames (التي
 *      تجمع القاموس الثابت + كاش الذاكرة/قاعدة البيانات + AI دفعة واحدة،
 *      ثم تُكاش كل اسم للأبد).
 *
 * الأنماط غير المصنّفة: نُعرّب أسماءها ونبقي النص كما هو (سريع، 0 تكلفة AI
 * إضافية) — هكذا لا تختفي أي رسالة.
 *
 * مرجع العيّنات: واجهة commentaries/fixtures/:id ترجع بيانات بـ
 * comment / minute / extra_minute / is_goal / is_important / order، والنصوص
 * أنماط موثّقة (Goal! ... takes the lead, Corner awarded to, ... receives
 * a yellow card, Attempt saved/missed, First/Second half begins…).
 */
import { resolveNames } from "./worldCupNameTranslator";

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
 * يمرّ واحدًا (resolveNames) على كل أسماء الدفعة، ثم يطبّق القوالب متزامنًا.
 *
 * @param comments التعليقات الخام كما وردت من SportMonks
 * @returns عناصر مُعرّبة مرتّبة تنازليًا حسب ترتيب المزود (الأحدث أولًا)
 */
export async function translateCommentaries(comments: SmCommentary[]): Promise<WcCommentaryItem[]> {
  if (comments.length === 0) return [];

  // اجمع كل الأسماء الإنجليزية الظاهرة عبر الدفعة لتعريبها جملة واحدة
  const nameSet = new Set<string>();
  for (const c of comments) collectNames(c.comment, nameSet);
  const tr = await resolveNames([...nameSet]);

  const items = comments.map<WcCommentaryItem>((c) => ({
    minute: c.minute ?? 0,
    extraMinute: c.extra_minute,
    goal: c.is_goal,
    important: c.is_important,
    textAr: translateOne(c.comment, tr, c.is_goal),
    textEn: c.comment,
    order: c.order,
  }));

  // تنازليًا: الأحدث أولًا
  items.sort((a, b) => b.order - a.order);
  return items;
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

  // الأهداف: "Goal! <Team> takes the lead N-M with <Player> scoring..."
  let m = s.match(/^Goal!\s+(.+?)\s+takes the lead\s+(\d+-\d+)\s+with\s+(.+?)\s+scoring/i);
  if (m) {
    return `هدف! ${team(m[1], tr)} يتقدّم ${m[2]} عبر ${player(m[3], tr)}${goalTail(s)}`;
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
  // أي هدف آخر يحمل is_goal لكن لا يطابق الأنماط أعلاه
  if (isGoal) {
    return `هدف! ${ar}`;
  }

  // البطاقات — "<Player> from/of <Team> receives a yellow/red card"
  m = s.match(/^(.+?)\s+(?:from|of)\s+(.+?)\s+(?:receives|gets)\s+a\s+(yellow|red)\s+card/i)
    || s.match(/^(.+?)\s+(?:receives|gets)\s+a\s+(yellow|red)\s+card/i);
  if (m) {
    // ترتيب المجموعات يختلف بين النمطين — نوحّد الاستخراج
    const whoGroup = m[1];
    const colorWord = (m[3] || m[2] || "").toLowerCase();
    const who = player(whoGroup, tr);
    if (colorWord === "red") {
      return `بطاقة حمراء على ${who}`;
    }
    return `بطاقة صفراء على ${who}`;
  }
  if (/second yellow|sent off|red card/i.test(low)) {
    return `بطاقة حمراء — ${ar}`;
  }

  // ركلة جزاء
  if (/\bpenalty\b/i.test(low)) {
    return `ضربة جزاء — ${ar}`;
  }

  // ركنية: "Corner awarded to <Team> ...", "Corner for <Team> ..."
  m = s.match(/Corner\s+awarded\s+to\s+(.+?)(?:[.,]|$)/i)
    || s.match(/^Corner\s+for\s+(.+?)(?:[,.]|conceded|$)/i);
  if (m) {
    return `ركلة ركنية لـ${team(m[1], tr)}`;
  }

  // تبديل
  if (/substitut|comes on|comes off|replaces|is brought on|substitution/i.test(low)) {
    return `تبديل — ${ar}`;
  }

  // تسديدات
  // "Attempt saved. <Keeper> from <Team> saves a <foot>-footed shot from <Shooter>."
  m = s.match(
    /^Attempt saved\.\s+(.+?)\s+from\s+(.+?)\s+saves a\s+(?:[\w-]+\s+)?(?:header|shot)\s+from\s+(.+?)(?:[.,]|\s*$)/i
  );
  if (m) {
    return `تصدٍّ — ${player(m[1], tr)} (${team(m[2], tr)}) يُبعد تسديدة ${player(m[3], tr)}`;
  }
  // "Attempt saved. <Keeper> saves a ... shot from <Shooter>." (بلا ذكر منتخب)
  m = s.match(/^Attempt saved\.\s+(.+?)\s+saves a\s+(?:[\w-]+\s+)?(?:header|shot)\s+from\s+(.+?)(?:[.,]|\s*$)/i);
  if (m) {
    return `تصدٍّ — ${player(m[1], tr)} يُبعد تسديدة ${player(m[2], tr)}`;
  }
  if (/attempt saved|attempt is saved/i.test(low)) {
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

  // بدايات/نهايات الأشواط
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
  if (/match ends|game ended|full[\s-]?time|second half ends/i.test(low)) {
    return `صافرة النهاية`;
  }

  // fallback: نُعرّب الأسماء ونُبقي النص — لا تختفي الرسالة
  // TODO(لاحقًا): تفعيل ترجمة AI دفعية للأنماط غير المصنّفة لو رغبنا بدقّة أعلى.
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

// تعريب اسم لاعب: نُسقط أي ذكر للمنتخب بين قوسين ثم نُعرّب
function player(name: string, tr: (n: string) => string): string {
  const cleaned = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!cleaned) return "";
  return tr(cleaned) || cleaned;
}

// تعريب اسم منتخب: قد يأتي بصيغة «<Team> after <X> concedes» فنأخذ الأول
function team(name: string, tr: (n: string) => string): string {
  const cleaned = name.split(/\s+(?:after|concedes?|win[s]?|is)\b/i)[0].trim();
  if (!cleaned) return "";
  return tr(cleaned) || cleaned;
}
