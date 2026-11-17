// ----------------------------------------------------------------------------
// إعدادات التفريغ لـ«مُدوِّن سبق AI» — وحدة نقية بلا اعتماد على LiveKit حتى
// تُختبر مباشرة (tests/unit/meetingsAgentSttConfig.test.ts).
//
// المرحلة الأولى من خطة الدقة (2026-11-17):
//   • turn detection: سكتة ~ثانية قبل إنهاء المقطع بدل 350ms الافتراضية — كانت
//     تقطع الكلام لقطع ٢–٣ ثوانٍ بلا سياق فيخرج كلام بلا معنى.
//   • prompt عربي يصف الاجتماع (لهجة سعودية، صحيفة سبق) + قائمة مصطلحات وأسماء.
//   • تنقية ضوضاء near_field (ميكروفون قريب: لابتوب/سماعة).
//   • startMs يُسجَّل عند بدء الكلام لا عند وصول النص النهائي.
// الخيارات كلها موجودة في @livekit/agents-plugin-openai 1.5.3 (STTOptions:
// prompt / turnDetection / noiseReductionType) وتُرسل في session.update.
// ----------------------------------------------------------------------------

export const STT_MODEL = "gpt-4o-transcribe";
export const STT_LANGUAGE = "ar";

export const TURN_DETECTION = {
  type: "server_vad" as const,
  threshold: 0.55,
  prefix_padding_ms: 300,
  silence_duration_ms: 1000,
};

export const NOISE_REDUCTION = "near_field" as const;

/** مصطلحات سبق الثابتة — تُضاف دائماً لقائمة المصطلحات */
export const SABQ_FIXED_TERMS: readonly string[] = [
  "سبق",
  "صحيفة سبق",
  "سبق نيوز",
  "غرفة الأخبار",
  "التحرير",
  "مدير التحرير",
  "رئيس التحرير",
  "الديسك",
  "خبر عاجل",
  "مانشيت",
  "النشرة البريدية",
  "السوشال ميديا",
  "منصة إكس",
  "تغطية",
  "مقال رأي",
  "إنفوجرافيك",
  "المحضر",
];

/** سقف طول الـprompt كاملاً (حروف) — يبقى أقل بكثير من حد النموذج */
export const MAX_PROMPT_CHARS = 900;
const MAX_TERM_CHARS = 60;

const PROMPT_HEAD =
  "اجتماع عمل داخلي في صحيفة سبق الإلكترونية السعودية. الحديث بالعربية وغالباً باللهجة السعودية، " +
  "مع مصطلحات صحفية وتقنية. اكتب الكلام كما قيل بإملاء عربي صحيح، واكتب الأسماء كما هي في القائمة.";

/** تنظيف قائمة مصطلحات: قص الفراغات، حذف الفارغ والمكرر والطويل جداً */
export function normalizeKeyterms(terms: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    if (typeof raw !== "string") continue;
    const t = raw.replace(/[،,؛;]/g, " ").replace(/[\s\u200f\u200e]+/g, " ").trim();
    if (!t || t.length > MAX_TERM_CHARS || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * يبني الـprompt: وصف ثابت + «مصطلحات وأسماء: …» من الثابت أولاً ثم ما وصل في
 * metadata، ويتوقف قبل تجاوز MAX_PROMPT_CHARS (لا يقص مصطلحاً في منتصفه).
 */
export function buildTranscriptionPrompt(extraTerms: readonly unknown[] = []): string {
  const terms = normalizeKeyterms([...SABQ_FIXED_TERMS, ...extraTerms]);
  const label = " مصطلحات وأسماء قد ترد: ";
  let prompt = PROMPT_HEAD + label;
  let first = true;
  for (const t of terms) {
    const piece = (first ? "" : "، ") + t;
    if (prompt.length + piece.length + 1 > MAX_PROMPT_CHARS) break;
    prompt += piece;
    first = false;
  }
  return prompt + ".";
}

/** الخيارات الممرَّرة لـ new openai.STT(...) — مصدر واحد يختبره الاختبار */
export function buildSttOptions(extraTerms: readonly unknown[] = []) {
  return {
    model: STT_MODEL,
    language: STT_LANGUAGE,
    prompt: buildTranscriptionPrompt(extraTerms),
    turnDetection: { ...TURN_DETECTION },
    noiseReductionType: NOISE_REDUCTION,
  };
}

/** قراءة metadata الاستدعاء: { meetingId, keyterms? } — أي شكل آخر يُتجاهل */
export function parseJobMetadata(raw: string | undefined): { meetingId?: string; keyterms: string[] } {
  try {
    const m = JSON.parse(raw || "{}") as { meetingId?: unknown; keyterms?: unknown };
    return {
      meetingId: typeof m.meetingId === "string" && m.meetingId ? m.meetingId : undefined,
      keyterms: Array.isArray(m.keyterms) ? normalizeKeyterms(m.keyterms) : [],
    };
  } catch {
    return { keyterms: [] };
  }
}

/**
 * ساعة المقاطع: تحفظ لحظة بدء الكلام (START_OF_SPEECH) لكل مقطع.
 * مع server_vad يصل النص النهائي (FINAL) بعد انتهاء الكلام وقد يبدأ مقطع
 * تالٍ قبله، لذا البدايات في طابور FIFO: FINAL يقرأ أقدم بداية، و
 * RECOGNITION_USAGE (يصل لكل مقطع مكتمل حتى الفارغ) يزيلها.
 * احتياط: إن لم يصل حدث بدء فأول نص مؤقت (INTERIM) ثم لحظة FINAL نفسها.
 */
export class SegmentClock {
  private starts: number[] = [];
  private firstInterimAt: number | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  onStartOfSpeech(): void {
    this.starts.push(this.now());
  }

  onInterim(): void {
    if (this.firstInterimAt === null) this.firstInterimAt = this.now();
  }

  /** لحظة بدء المقطع المنتهي (مطلقة، ms) */
  onFinal(): number {
    const t = this.starts[0] ?? this.firstInterimAt ?? this.now();
    this.firstInterimAt = null;
    return t;
  }

  /** نهاية دورة مقطع (مكتمل، بنص أو بدونه) */
  onSegmentDone(): void {
    this.starts.shift();
    this.firstInterimAt = null;
  }
}
