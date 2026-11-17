// ----------------------------------------------------------------------------
// إنهاء «مُدوِّن سبق AI» وقياس ما سمعه — وحدة نقية بلا اعتماد على LiveKit حتى
// تُختبر مباشرة (tests/unit/meetingsAgentShutdown.test.ts).
//
// حادثة 2026-11-17: اجتماع خرج «0 مقطع تفريغ». العامل استمع 85 ثانية ولم يرفع
// شيئاً، ثم علق بعد إغلاق الغرفة («job is unresponsive») لأن بث STT لا ينتهي
// من تلقاء نفسه بعد توقف الصوت، فلم يصل إلى الرفع الأخير ولا إلى سطر الإنهاء.
// هنا:
//   • settleWithin: انتظار محدود بزمن بدل الانتظار المفتوح.
//   • TrackMeter: عدّاد لكل مسار (مدة الصوت، أعلى مستوى، بدايات الكلام، المقاطع
//     النهائية) يُطبع في اللوج ويُرسل للخادم — يفرّق بين «لم يصل صوت»،
//     «وصل صمت»، «وصل كلام ولم يُفرَّغ».
// ----------------------------------------------------------------------------

/**
 * مهلة انتظار المقاطع النهائية بعد إغلاق الغرفة. بث STT الفوري لا ينتهي وحده
 * (ينتهي بإغلاق مقبسه فقط)، فالإغلاق بعد المهلة هو المسار الطبيعي لا الاستثنائي:
 * ٤ث تكفي لوصول نص آخر جملة (سكتة VAD ثانية + زمن التفريغ).
 */
export const FINAL_GRACE_MS = 4_000;
/** مهلة قصيرة لانتهاء الحلقات بعد إغلاق البث */
export const FORCE_CLOSE_GRACE_MS = 2_000;
/** مهلة كل طلب رفع/إشارة للخادم — خادم متوقف أثناء نشر لا يعلّق المهمة */
export const UPLOAD_TIMEOUT_MS = 10_000;

/**
 * ينتظر الوعود كلها حتى مهلة قصوى. يعيد true إن استقرت كلها قبل المهلة،
 * وfalse إن انتهت المهلة وبعضها معلّق. لا يرمي أبداً.
 */
export async function settleWithin(
  promises: readonly Promise<unknown>[],
  timeoutMs: number,
): Promise<boolean> {
  if (!promises.length) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const all = Promise.allSettled(promises).then(() => true as const);
  try {
    return await Promise.race([all, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface TrackStats {
  /** ثواني الصوت التي وصلت العامل من هذا المسار */
  audioSeconds: number;
  /** أعلى قيمة مطلقة لعيّنة (0–32767) — قرب الصفر = صمت رقمي/ميكروفون مكتوم */
  peak: number;
  /** نسبة الإطارات التي تجاوزت عتبة الصوت المسموع (0–1) */
  audibleRatio: number;
  speechStarts: number;
  finals: number;
}

/** عتبة «إطار مسموع»: أعلى من ضجيج الخلفية الرقمي بوضوح (≈ ‎-36 dBFS) */
export const AUDIBLE_PEAK = 500;

export class TrackMeter {
  private samples = 0;
  private frames = 0;
  private audibleFrames = 0;
  private peak = 0;
  private speechStarts = 0;
  private finals = 0;

  constructor(private readonly sampleRate: number) {}

  onFrame(data: Int16Array): void {
    let framePeak = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] < 0 ? -data[i] : data[i];
      if (v > framePeak) framePeak = v;
    }
    this.samples += data.length;
    this.frames += 1;
    if (framePeak >= AUDIBLE_PEAK) this.audibleFrames += 1;
    if (framePeak > this.peak) this.peak = framePeak;
  }

  onSpeechStart(): void {
    this.speechStarts += 1;
  }

  onFinal(): void {
    this.finals += 1;
  }

  stats(): TrackStats {
    return {
      audioSeconds: Math.round((this.samples / this.sampleRate) * 10) / 10,
      peak: this.peak,
      audibleRatio: this.frames ? Math.round((this.audibleFrames / this.frames) * 100) / 100 : 0,
      speechStarts: this.speechStarts,
      finals: this.finals,
    };
  }
}

/** تشخيص من سطر واحد لمسار واحد — يُطبع في اللوج */
export function diagnoseTrack(s: TrackStats): string {
  if (s.audioSeconds === 0) return "no-audio-frames";
  if (s.audibleRatio < 0.02) return "silent-audio";
  if (s.speechStarts === 0 && s.finals === 0) return "audible-but-no-speech-detected";
  if (s.finals === 0) return "speech-detected-but-no-transcript";
  return "ok";
}

/** مجموع إحصاءات الاجتماع المرسلة للخادم عند الإنهاء */
export function summarizeTracks(all: readonly TrackStats[]): {
  tracks: number;
  audioSeconds: number;
  speechStarts: number;
  finals: number;
  diagnosis: string;
} {
  const sum = (f: (s: TrackStats) => number) => all.reduce((n, s) => n + f(s), 0);
  const finals = sum((s) => s.finals);
  const order = [
    "ok",
    "speech-detected-but-no-transcript",
    "audible-but-no-speech-detected",
    "silent-audio",
    "no-audio-frames",
  ];
  const diagnoses = all.map(diagnoseTrack);
  const diagnosis = !all.length
    ? "no-audio-tracks"
    : order.find((d) => diagnoses.includes(d)) ?? "unknown";
  return {
    tracks: all.length,
    audioSeconds: Math.round(sum((s) => s.audioSeconds) * 10) / 10,
    speechStarts: sum((s) => s.speechStarts),
    finals,
    diagnosis,
  };
}
