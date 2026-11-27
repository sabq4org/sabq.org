// «أعرِب» — منطق مشترك نقي لصفحة إعراب الجمل (بلا شبكة ولا قاعدة بيانات).
// الخادم يستعمله للتحقق من مدخل القارئ، وتحليل رد النموذج، ومطابقة القراءتين
// المستقلتين؛ والاختبارات تغطيه مباشرة. انظر docs/systems/irab/SYSTEM.md.

export const IRAB_CASES = ["raf", "nasb", "jarr", "jazm", "mabni"] as const;
export type IrabCase = (typeof IRAB_CASES)[number];

/** مفاتيح الأدوار التي تُطابَق عليها القراءتان. الاسم العربي يبقى نصًا حرًا للعرض. */
export const IRAB_ROLE_KEYS = [
  "fiil_madi", "fiil_mudari", "fiil_amr",
  "fail", "naib_fail", "maful_bih", "maful_mutlaq", "maful_lah", "maful_fih", "maful_maah",
  "mubtada", "khabar", "ism_nasikh", "khabar_nasikh",
  "mudaf_ilayh", "majrur", "harf",
  "naat", "matuf", "badal", "tawkid", "hal", "tamyiz", "mustathna", "munada",
  "ism_istifham", "ism_mawsul", "ism_ishara", "damir", "other",
] as const;
export type IrabRoleKey = (typeof IRAB_ROLE_KEYS)[number];

export const IRAB_MAX_CHARS = 160;
export const IRAB_MAX_WORDS = 16;
export const IRAB_MAX_READINGS = 3;

export interface IrabWord {
  /** الكلمة مشكولة كما وردت في الجملة. */
  word: string;
  /** الموقع الإعرابي بالعربية، مثل «فاعل» أو «اسم إنّ». */
  role: string;
  roleKey: IrabRoleKey;
  case: IrabCase;
  /** العلامة مختصرة: «الضمة الظاهرة»، «الياء · جمع مذكر سالم»، «مبني على الفتح». */
  sign: string;
  /** نص الإعراب الكامل كما يُكتب في كراسة النحو. */
  text: string;
  /** فهرس العامل في الجملة نفسها (للأقواس)، أو null. */
  head: number | null;
  headLabel?: string;
  /** يُملأ بعد المطابقة: القراءة الثانية اختلفت في هذه الكلمة. */
  uncertain?: boolean;
  /** إعراب القراءة الثانية لهذه الكلمة حين اختلفت. */
  alt?: { role: string; case: IrabCase; sign: string; text: string };
}

export interface IrabReading {
  /** اسم الوجه حين تتعدد الأوجه («التعجب»، «الاستفهام»)، وإلا فارغ. */
  name: string;
  /** الجملة مشكولة كاملة بهذا الوجه. */
  sentence: string;
  /** نوع الجملة: «جملة فعلية»، «جملة اسمية منسوخة بإنّ»… */
  type: string;
  meaning?: string;
  words: IrabWord[];
  /** محل الجمل وشبه الجمل والمتعلقات. */
  notes: string[];
  /** وجه رأته قراءة واحدة فقط. */
  uncertain?: boolean;
}

export type IrabAgreement = "agreed" | "partial" | "single";

export interface IrabResult {
  input: string;
  valid: boolean;
  /** سبب الرفض حين لا تكون الجملة صالحة للإعراب. */
  problem?: string;
  readings: IrabReading[];
  /** agreed: اتفقت القراءتان؛ partial: اختلفتا في كلمات معلّمة؛ single: قراءة واحدة فقط وصلت. */
  agreement: IrabAgreement;
}

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const ARABIC_LETTER = /[ء-يٱ-ۓ]/;

/** يوحّد المسافات ويحذف التطويل؛ يُبقي التشكيل والترقيم لأنهما يغيّران الإعراب. */
export function normalizeIrabInput(raw: string): string {
  return raw
    .replace(/ـ/g, "")
    .replace(/[​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** يحذف التشكيل ويوحّد الهمزات — للمقارنة فقط. */
export function bareArabic(s: string): string {
  return s
    .replace(DIACRITICS, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[.,،;؛:!؟?«»"'()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type IrabInputCheck = { ok: true; sentence: string } | { ok: false; message: string };

export function validateIrabInput(raw: unknown): IrabInputCheck {
  if (typeof raw !== "string") return { ok: false, message: "اكتب جملة عربية." };
  const sentence = normalizeIrabInput(raw);
  if (!sentence) return { ok: false, message: "اكتب جملة عربية." };
  if (sentence.length > IRAB_MAX_CHARS) return { ok: false, message: `الجملة أطول من ${IRAB_MAX_CHARS} حرفًا. أعرب جملة واحدة في كل مرة.` };
  const letters = sentence.replace(DIACRITICS, "").replace(/[\s\d.,،;؛:!؟?«»"'()\-]/g, "");
  const arabic = [...letters].filter((c) => ARABIC_LETTER.test(c)).length;
  if (letters.length === 0 || arabic / letters.length < 0.9) return { ok: false, message: "الصفحة تعرب الجمل العربية فقط." };
  const words = sentence.split(" ").filter((w) => ARABIC_LETTER.test(w));
  if (words.length < 2) return { ok: false, message: "اكتب جملة من كلمتين على الأقل." };
  if (words.length > IRAB_MAX_WORDS) return { ok: false, message: `الجملة أطول من ${IRAB_MAX_WORDS} كلمة. قسّمها وأعرب كل جزء.` };
  return { ok: true, sentence };
}

function str(v: unknown, max = 600): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function asCase(v: unknown): IrabCase | null {
  return typeof v === "string" && (IRAB_CASES as readonly string[]).includes(v) ? (v as IrabCase) : null;
}

function asRoleKey(v: unknown): IrabRoleKey {
  return typeof v === "string" && (IRAB_ROLE_KEYS as readonly string[]).includes(v) ? (v as IrabRoleKey) : "other";
}

export class IrabParseError extends Error {
  readonly code = "IRAB_BAD_MODEL_OUTPUT";
  constructor(detail: string) { super(`نتيجة الإعراب غير مكتملة: ${detail}`); }
}

export interface IrabPass {
  valid: boolean;
  problem?: string;
  readings: IrabReading[];
}

/** يحلّل رد النموذج ويتحقق من شكله. أي نقص جوهري يرمي IrabParseError ولا يُعرض. */
export function parseIrabPass(raw: string, input: string): IrabPass {
  let data: unknown;
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    data = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
  } catch {
    throw new IrabParseError("ليست JSON");
  }
  if (!data || typeof data !== "object") throw new IrabParseError("شكل غير متوقع");
  const d = data as Record<string, unknown>;
  if (d.valid === false) {
    return { valid: false, problem: str(d.problem, 300) || "تعذر إعراب هذا النص لأنه لا يشكّل جملة عربية سليمة.", readings: [] };
  }
  // المقارنة بلا مسافات: يجوز أن يفصل النموذج واو العطف أو حرف الجر الملتصق كلمةً مستقلة.
  const inputBare = bareArabic(input).replace(/ /g, "");
  const rawReadings = Array.isArray(d.readings) ? d.readings.slice(0, IRAB_MAX_READINGS) : [];
  if (rawReadings.length === 0) throw new IrabParseError("لا توجد قراءة");
  const readings = rawReadings.map((r, ri): IrabReading => {
    const rr = (r ?? {}) as Record<string, unknown>;
    const rawWords = Array.isArray(rr.words) ? rr.words : [];
    if (rawWords.length === 0) throw new IrabParseError(`القراءة ${ri + 1} بلا كلمات`);
    const words = rawWords.map((w, wi): IrabWord => {
      const ww = (w ?? {}) as Record<string, unknown>;
      const c = asCase(ww.case);
      const word = str(ww.word, 60);
      const text = str(ww.text, 900);
      if (!c || !word || !text) throw new IrabParseError(`الكلمة ${wi + 1} ناقصة`);
      const head = typeof ww.head === "number" && Number.isInteger(ww.head) && ww.head >= 0 && ww.head < rawWords.length && ww.head !== wi ? ww.head : null;
      const headLabel = str(ww.headLabel, 40);
      return {
        word, role: str(ww.role, 80) || "—", roleKey: asRoleKey(ww.roleKey), case: c,
        sign: str(ww.sign, 120), text, head, ...(headLabel ? { headLabel } : {}),
      };
    });
    // الكلمات يجب أن تطابق الجملة المدخلة كلمة بكلمة (بعد حذف التشكيل)، وإلا فالنموذج
    // أعرب جملة غير التي كتبها القارئ.
    const got = words.map((w) => bareArabic(w.word)).join("");
    if (got !== inputBare) throw new IrabParseError("الكلمات لا تطابق الجملة المدخلة");
    const notes = Array.isArray(rr.notes) ? rr.notes.map((n) => str(n, 400)).filter(Boolean).slice(0, 6) : [];
    const meaning = str(rr.meaning, 200);
    return {
      name: str(rr.name, 40), sentence: str(rr.sentence, 400) || words.map((w) => w.word).join(" "),
      type: str(rr.type, 80) || "جملة", ...(meaning ? { meaning } : {}), words, notes,
    };
  });
  return { valid: true, readings };
}

function readingSignature(r: IrabReading): string {
  return r.words.map((w) => `${w.case}:${w.roleKey}`).join("|");
}

/**
 * يطابق قراءتين مستقلتين. القراءة الأولى هي المعروضة؛ كل كلمة اختلفت فيها الثانية
 * تُعلَّم «غير مؤكدة» مع إعراب الثانية بجانبها، ولا تُعرض نتيجة «متفق عليها» إلا
 * إذا تطابقت الحالة والموقع في كل كلمة من كل وجه.
 */
export function mergeIrabPasses(input: string, a: IrabPass | null, b: IrabPass | null): IrabResult {
  const only = a ?? b;
  if (!only) throw new IrabParseError("لم تصل أي قراءة");
  if (!a || !b) {
    return { input, valid: only.valid, ...(only.problem ? { problem: only.problem } : {}), readings: only.readings, agreement: "single" };
  }
  if (!a.valid || !b.valid) {
    if (!a.valid && !b.valid) return { input, valid: false, problem: a.problem ?? b.problem, readings: [], agreement: "agreed" };
    // إحداهما رأت الجملة غير صالحة: نعرض الأخرى ونعلّم كل شيء غير مؤكد.
    const ok = a.valid ? a : b;
    return {
      input, valid: true, agreement: "partial",
      readings: ok.readings.map((r) => ({ ...r, uncertain: true, words: r.words.map((w) => ({ ...w, uncertain: true })) })),
    };
  }
  const bSigs = new Map(b.readings.map((r) => [readingSignature(r), r]));
  const readings: IrabReading[] = [];
  let allMatched = a.readings.length === b.readings.length;
  a.readings.forEach((r, i) => {
    const sig = readingSignature(r);
    if (bSigs.has(sig)) { readings.push(r); bSigs.delete(sig); return; }
    allMatched = false;
    // لا تطابق تام: نقارن بالوجه المقابل في الترتيب نفسه كلمة بكلمة.
    const other = b.readings[i] ?? b.readings[0];
    readings.push({
      ...r,
      words: r.words.map((w, wi) => {
        const o = other.words[wi];
        if (o && o.case === w.case && o.roleKey === w.roleKey) return w;
        return { ...w, uncertain: true, ...(o ? { alt: { role: o.role, case: o.case, sign: o.sign, text: o.text } } : {}) };
      }),
    });
  });
  // أوجه رأتها القراءة الثانية وحدها تُضاف موسومة غير مؤكدة، في حدود الحد الأقصى.
  for (const extra of bSigs.values()) {
    if (readings.length >= IRAB_MAX_READINGS) break;
    if (a.readings.length === 1 && b.readings.length === 1) break; // قورنت كلمة بكلمة أعلاه
    readings.push({ ...extra, uncertain: true });
  }
  return { input, valid: true, readings, agreement: allMatched ? "agreed" : "partial" };
}
