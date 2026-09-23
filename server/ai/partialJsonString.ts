/**
 * استخراج قيمة حقل نصي من JSON *غير مكتمل* أثناء البث.
 *
 * محرر أسلوب سبق يعيد JSON مهيكلًا (Structured Outputs) ونص المقال المعاد صياغته
 * يصل داخل `optimized.content`. لعرضه للمحرر حرفًا بحرف أثناء التوليد نحتاج فك
 * سلسلة JSON جزئية (بما فيها الهروب `\n` و`\uXXXX`) دون انتظار اكتمال الكائن.
 */

const SIMPLE_ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
  '"': '"',
  "\\": "\\",
  "/": "/",
};

export interface PartialStringField {
  value: string;
  complete: boolean;
}

/**
 * يبحث عن `"key": "` (اختياريًا بعد علامة `after` مثل `"optimized"`) ويفك ما وصل من
 * القيمة حتى الآن. يعيد null إن لم يبدأ الحقل بعد. الهروب المبتور في نهاية البث
 * (مثل `\u12`) يُترك للجولة التالية بدل فكه خطأً.
 */
export function extractPartialJsonStringField(raw: string, key: string, after?: string): PartialStringField | null {
  let from = 0;
  if (after) {
    const a = raw.indexOf(after);
    if (a === -1) return null;
    from = a + after.length;
  }
  const keyPattern = new RegExp(`"${key}"\\s*:\\s*"`, "g");
  keyPattern.lastIndex = from;
  const m = keyPattern.exec(raw);
  if (!m) return null;

  let i = m.index + m[0].length;
  let out = "";
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"') return { value: out, complete: true };
    if (ch === "\\") {
      const next = raw[i + 1];
      if (next === undefined) break;
      if (next === "u") {
        const hex = raw.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        const code = parseInt(hex, 16);
        if (Number.isNaN(code)) {
          i += 2;
          continue;
        }
        out += String.fromCharCode(code);
        i += 6;
        continue;
      }
      out += SIMPLE_ESCAPES[next] ?? next;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return { value: out, complete: false };
}

/** يتتبع ما أُرسل من الحقل ويعيد الجزء الجديد فقط عند كل دفعة بث. */
export class PartialStringFieldTracker {
  private emitted = 0;
  private done = false;

  constructor(
    private readonly key: string,
    private readonly after?: string,
  ) {}

  /** يعيد النص الجديد منذ آخر نداء (أو null إن لم يتغير شيء). */
  next(raw: string): string | null {
    if (this.done) return null;
    const field = extractPartialJsonStringField(raw, this.key, this.after);
    if (!field) return null;
    if (field.complete) this.done = true;
    if (field.value.length <= this.emitted) return null;
    const chunk = field.value.slice(this.emitted);
    this.emitted = field.value.length;
    return chunk;
  }

  get isComplete(): boolean {
    return this.done;
  }
}
