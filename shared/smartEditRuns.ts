// سجل «تحرير وتوليد شامل»: منطق خالص مشترك بين الخادم والواجهة.
// - بصمة الخبر: من أين جاء كل كلمة في النص المحفوظ (ناتج المحرر الذكي، أم النص
//   الملصق كما هو، أم كتابة المحرر بعده). المقارنة بثلاثيات الكلمات المتتالية،
//   فكلمات شائعة مثل «في» لا تُحسب مطابقة وحدها.
// - ربط التشغيل بالخبر عند أول حفظ إن لم يُرسل رقم الخبر مع الطلب.
// - فرق الكلمات لعرض المقارنة.

export type SmartEditChannel = "web" | "mobile";
export type SmartEditStatus = "success" | "failed";

/** تشغيل بلا رقم خبر يُربط بأول خبر يحفظه صاحبه خلال هذه المدة إن تطابق النص. */
export const SMART_EDIT_LINK_WINDOW_HOURS = 3;
/** أدنى نسبة تطابق (ثلاثيات) بين النص المحفوظ وناتج التشغيل أو مدخله للربط. */
export const SMART_EDIT_LINK_MIN_OVERLAP = 0.3;
/** حد أعلى للنص المخزّن لكل حقل (حماية من طلب ضخم). */
export const SMART_EDIT_MAX_TEXT_CHARS = 60_000;

const SHINGLE = 3;

export interface SmartEditAdoption {
  /** نسبة كلمات النص المحفوظ القادمة من ناتج المحرر الذكي (0–100). */
  aiPct: number;
  /** نسبة الكلمات القادمة من النص الملصق ولم يغيّرها المحرر الذكي. */
  pastedPct: number;
  /** نسبة الكلمات التي كتبها المحرر بنفسه (ليست في المدخل ولا الناتج). */
  editorPct: number;
  /** عدد كلمات النص المحفوظ وقت الحساب. */
  finalWords: number;
  /**
   * نسبة كلمات الناتج التي غيّرها المحرر الذكي فعلًا (ليست ضمن ثلاثيات المدخل).
   * قرب الصفر يعني أن الناتج نسخة من المدخل. غائبة في البصمات المحسوبة قبل إضافتها.
   */
  outputChangedPct?: number;
}

/** دون هذه النسبة من التغيير يُعدّ الناتج مطابقًا للمدخل فلا يُنسب للأداة اعتماد. */
export const SMART_EDIT_UNCHANGED_MAX_PCT = 5;

/** نص صافٍ من HTML: يحذف الوسوم ويفك أشهر الكيانات. */
export function plainText(htmlOrText: string | null | undefined): string {
  if (!htmlOrText) return "";
  return htmlOrText
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** توحيد الكلمة للمقارنة: بلا تشكيل ولا تطويل، والهمزات والتاء المربوطة والياء موحدة. */
export function normalizeWord(word: string): string {
  return word
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

/** كلمات النص كما تظهر (للعرض والفرق). */
export function displayWords(htmlOrText: string | null | undefined): string[] {
  const text = plainText(htmlOrText);
  return text ? text.split(" ").filter(Boolean) : [];
}

/** كلمات موحّدة للمقارنة (تسقط الرموز المنفردة). */
export function comparableWords(htmlOrText: string | null | undefined): string[] {
  return displayWords(htmlOrText).map(normalizeWord).filter(Boolean);
}

export function countWords(htmlOrText: string | null | undefined): number {
  return comparableWords(htmlOrText).length;
}

function shingleSet(words: string[]): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i + SHINGLE <= words.length; i++) set.add(words.slice(i, i + SHINGLE).join(" "));
  return set;
}

/** يعلّم كل كلمة في final تقع ضمن ثلاثية موجودة في ref. */
function coveredBy(final: string[], ref: Set<string>): boolean[] {
  const covered = new Array<boolean>(final.length).fill(false);
  if (ref.size === 0) return covered;
  for (let i = 0; i + SHINGLE <= final.length; i++) {
    if (ref.has(final.slice(i, i + SHINGLE).join(" "))) {
      for (let k = i; k < i + SHINGLE; k++) covered[k] = true;
    }
  }
  return covered;
}

/** نسبة كلمات text الواقعة ضمن ثلاثيات من ref (0–1). */
export function overlapRatio(text: string | null | undefined, ref: string | null | undefined): number {
  const words = comparableWords(text);
  if (words.length === 0) return 0;
  const covered = coveredBy(words, shingleSet(comparableWords(ref)));
  return covered.filter(Boolean).length / words.length;
}

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

/**
 * بصمة النص المحفوظ: الكلمة المغطاة بثلاثية موجودة في المدخل تُنسب للنص الملصق
 * (كانت موجودة قبل التشغيل، حتى لو أبقاها المحرر الذكي)، والمغطاة بثلاثية لا توجد
 * إلا في الناتج تُنسب للمحرر الذكي، والباقي للمحرر. فالتشغيل الذي لم يغيّر النص
 * لا يُحسب مساهمة للأداة مهما حُفظ ناتجه كما هو.
 */
export function computeAdoption(input: {
  finalContent: string | null | undefined;
  outputContent: string | null | undefined;
  inputContent: string | null | undefined;
}): SmartEditAdoption {
  const final = comparableWords(input.finalContent);
  const output = comparableWords(input.outputContent);
  const inputSet = shingleSet(comparableWords(input.inputContent));
  const aiOnly = shingleSet(output);
  for (const shingle of inputSet) aiOnly.delete(shingle);
  const fromInput = coveredBy(final, inputSet);
  const fromAi = coveredBy(final, aiOnly);
  let ai = 0;
  let pasted = 0;
  for (let i = 0; i < final.length; i++) {
    if (fromInput[i]) pasted++;
    else if (fromAi[i]) ai++;
  }
  const aiPct = pct(ai, final.length);
  const pastedPct = pct(pasted, final.length);
  const outputKept = coveredBy(output, inputSet).filter(Boolean).length;
  return {
    aiPct,
    pastedPct,
    // الباقي للمحرر حتى يكون مجموع النسب 100 بعد التقريب
    editorPct: final.length === 0 ? 0 : Math.max(0, 100 - aiPct - pastedPct),
    finalWords: final.length,
    outputChangedPct: output.length === 0 ? 0 : 100 - pct(outputKept, output.length),
  };
}

/**
 * كم بقي في النص المحفوظ مما غيّره المحرر الذكي فعلًا (0–100): نسبة كلماته في المحفوظ
 * إلى نسبة ما غيّره في ناتجه. نشر الناتج كما هو = 100 حتى لو أبقى الناتج نصف المدخل.
 * null إن لم يغيّر الناتج النص (لا شيء يُعتمد) أو لم تُحسب البصمة.
 */
export function retainedPct(adoption: SmartEditAdoption | null | undefined): number | null {
  if (!adoption || adoption.finalWords === 0) return null;
  if (adoption.outputChangedPct === undefined) return adoption.aiPct; // بصمة قديمة
  if (adoption.outputChangedPct < SMART_EDIT_UNCHANGED_MAX_PCT) return null;
  return Math.min(100, Math.round((adoption.aiPct / adoption.outputChangedPct) * 100));
}

/** وصف مختصر لدرجة الاعتماد يظهر شارةً في السجل والملخص. */
export function adoptionLabel(adoption: SmartEditAdoption | null | undefined): {
  label: string;
  tone: "green" | "amber" | "red" | "neutral";
} {
  if (!adoption || adoption.finalWords === 0) return { label: "لم يُحسب بعد", tone: "neutral" };
  const retained = retainedPct(adoption);
  if (retained === null) return { label: "الناتج لم يغيّر النص", tone: "neutral" };
  if (retained >= 60) return { label: "اعتُمد الناتج", tone: "green" };
  if (retained >= 25) return { label: "اعتُمد جزئيًا", tone: "amber" };
  return { label: "لم يُعتمد الناتج", tone: "red" };
}

/** هل التشغيل غير المربوط يخص هذا النص المحفوظ؟ */
export function runMatchesContent(
  savedContent: string | null | undefined,
  run: { inputContent: string | null | undefined; outputContent: string | null | undefined },
): boolean {
  return (
    overlapRatio(savedContent, run.outputContent) >= SMART_EDIT_LINK_MIN_OVERLAP ||
    overlapRatio(savedContent, run.inputContent) >= SMART_EDIT_LINK_MIN_OVERLAP
  );
}

export type DiffOp = { type: "same" | "add" | "del"; text: string };

/** أكبر عدد كلمات تُقارن بخوارزمية LCS؛ ما زاد يعرض بلا تلوين. */
export const WORD_DIFF_MAX_WORDS = 2500;

/**
 * فرق كلمات بين نصين (من before إلى after) بأطول متتالية مشتركة.
 * يتجاهل التشكيل والتطويل وعلامات الترقيم فقط؛ تغيير الهمزة («إن» ← «أن») يظهر فرقًا
 * لأنه تعديل تحريري. يعيد null إن كان النص أطول من الحد.
 */
export function wordDiff(before: string | null | undefined, after: string | null | undefined): DiffOp[] | null {
  const a = displayWords(before);
  const b = displayWords(after);
  if (a.length > WORD_DIFF_MAX_WORDS || b.length > WORD_DIFF_MAX_WORDS) return null;
  const diffKey = (word: string) => word.replace(/[\u064B-\u0652\u0670\u0640]/g, "").replace(/[^\p{L}\p{N}]/gu, "");
  const na = a.map(diffKey);
  const nb = b.map(diffKey);
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const dp = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] = na[i] === nb[j]
        ? dp[(i + 1) * width + j + 1] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  const push = (type: DiffOp["type"], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += ` ${text}`;
    else ops.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (na[i] === nb[j]) {
      push("same", b[j]);
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      push("del", a[i++]);
    } else {
      push("add", b[j++]);
    }
  }
  while (i < n) push("del", a[i++]);
  while (j < m) push("add", b[j++]);
  return ops;
}
