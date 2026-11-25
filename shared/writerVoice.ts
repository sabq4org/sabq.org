// «صوتي» لكاتب الرأي: ثوابت ودوال خالصة مشتركة بين الواجهة والخادم (بلا قاعدة بيانات).
// الكاتب يسجّل نحو دقيقة، ننشئ منها نسخة صوتية في ElevenLabs (Instant Voice Cloning)،
// ولا تُستخدم إلا لقراءة مقالاته هو وباختياره. التسجيل الأصلي يُحذف بعد 30 يومًا.

/** نسخة نص الموافقة. تُحفظ مع كل تسجيل؛ غيّرها عند تغيير النص. */
export const WRITER_VOICE_CONSENT_VERSION = "2026-11-25";

export const WRITER_VOICE_CONSENT_TEXT =
  "أوافق على أن تنشئ سبق نسخة رقمية من صوتي تُستخدم لقراءة مقالاتي أنا فقط، ولا تُفعّل إلا حين أختار ذلك. أستطيع حذف صوتي وسحب موافقتي في أي وقت.";

/** توصية ElevenLabs: دقيقة إلى دقيقتين من صوت نظيف، ولا تزد عن 3 دقائق. */
export const WRITER_VOICE_MIN_SECONDS = 45;
export const WRITER_VOICE_MAX_SECONDS = 120;
export const WRITER_VOICE_TARGET_SECONDS = 60;
export const WRITER_VOICE_MAX_BYTES = 12 * 1024 * 1024; // دقيقتان بأي ترميز متصفح أقل من هذا بكثير
export const WRITER_VOICE_SAMPLE_RETENTION_DAYS = 30;
export const WRITER_VOICE_ROOM_CHECK_SECONDS = 5;

/** نص القراءة المعروض أمام الكاتب أثناء التسجيل (نحو دقيقة بإيقاع طبيعي). */
export const WRITER_VOICE_SCRIPT: readonly string[] = [
  "مرحبًا، أنا كاتب في صحيفة سبق.",
  "أكتب لأن الكلمة الواضحة تختصر على القارئ طريقًا طويلًا،",
  "وأقرأ ما أكتب بصوت مرتفع قبل أن أرسله، لأسمع إيقاع الجملة وأعرف أين يتعب القارئ.",
  "في الصباح أبدأ بفنجان قهوة وعناوين اليوم، ثم أختار فكرة واحدة وأتركها تنضج.",
  "أحب الأرقام حين تشرح، وأكره الجمل التي تقول كثيرًا ولا تعني شيئًا.",
  "وأؤمن أن القارئ ذكي، يكفيه أن تضع أمامه الحقيقة كاملة ثم تتركه يحكم.",
  "وإن سألني أحد عن سر المقال الجيد قلت: فكرة واحدة، ومثال قريب، وخاتمة تترك سؤالًا.",
];

export const WRITER_VOICE_STATUSES = ["processing", "ready", "failed", "deleted"] as const;
export type WriterVoiceStatus = (typeof WRITER_VOICE_STATUSES)[number];

export type WriterVoiceStateDto = {
  status: WriterVoiceStatus | "none";
  consentVersion: string | null;
  consentedAt: string | null;
  readyAt: string | null;
  sampleSeconds: number | null;
  hasSample: boolean;
  hasPreview: boolean;
  sampleDeletesAt: string | null;
  errorMessage: string | null;
  updatedAt: string | null;
};

const AUDIO_MIME_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
};

/** يحوّل نوع الملف القادم من المتصفح (قد يحمل ;codecs=…) إلى نوع وامتداد مسموحين، أو null. */
export function normalizeWriterVoiceMime(mime: string | null | undefined): { mime: string; ext: string } | null {
  const base = String(mime || "").split(";")[0].trim().toLowerCase();
  const ext = AUDIO_MIME_EXT[base];
  return ext ? { mime: base, ext } : null;
}

export type DurationCheck = "ok" | "too_short" | "too_long";

export function checkWriterVoiceDuration(seconds: number): DurationCheck {
  if (!Number.isFinite(seconds) || seconds < WRITER_VOICE_MIN_SECONDS) return "too_short";
  if (seconds > WRITER_VOICE_MAX_SECONDS + 2) return "too_long"; // هامش ثانيتين لتقريب المؤقت
  return "ok";
}

/** مستوى الصوت (RMS بين 0 و1) إلى ديسيبل نسبةً للحد الأقصى. */
export function rmsToDbfs(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return -100;
  return Math.max(-100, 20 * Math.log10(rms));
}

/**
 * فحص الغرفة قبل التسجيل: مستوى الضجيج الثابت مع الصمت.
 * أقل من -50 هادئ، وحتى -40 مقبول، وأعلى من ذلك ضجيج يُطلب علاجه.
 */
export type NoiseCheck = "quiet" | "acceptable" | "noisy";
export function classifyRoomNoise(noiseDbfs: number): NoiseCheck {
  if (noiseDbfs <= -50) return "quiet";
  if (noiseDbfs <= -40) return "acceptable";
  return "noisy";
}

/** مستوى صوت القراءة: منخفض جدًا أو مرتفع حتى التشبع أو مناسب. */
export type LevelCheck = "low" | "ok" | "clipping";
export function classifySpeechLevel(speechDbfs: number, clippedRatio: number): LevelCheck {
  if (clippedRatio > 0.01) return "clipping";
  if (speechDbfs < -38) return "low";
  return "ok";
}

/** موعد حذف التسجيل الأصلي (بعد تجهيز الصوت بـ30 يومًا). */
export function writerVoiceSampleDeletesAt(readyAt: Date | null): Date | null {
  if (!readyAt) return null;
  return new Date(readyAt.getTime() + WRITER_VOICE_SAMPLE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export function isWriterVoiceSampleDue(readyAt: Date | null, now: Date = new Date()): boolean {
  const due = writerVoiceSampleDeletesAt(readyAt);
  return !!due && due.getTime() <= now.getTime();
}

/** فقرة الاستماع التجريبي: أول جمل من مقال الكاتب حتى نحو 300 حرف، دون قطع كلمة. */
export function buildWriterVoicePreviewText(plain: string | null | undefined, maxChars = 300): string {
  const text = String(plain || "").replace(/\s+/g, " ").trim();
  if (!text) return WRITER_VOICE_SCRIPT.slice(1, 3).join(" ");
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const sentenceEnd = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("،"), cut.lastIndexOf("؟"), cut.lastIndexOf("!"));
  if (sentenceEnd > maxChars * 0.5) return cut.slice(0, sentenceEnd + 1).trim();
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut).trim();
}

/** الجملة التي يُفترض أن الكاتب يقرؤها الآن، بنسبة الوقت المنقضي إلى طول النص. */
export function activeScriptIndex(elapsedSeconds: number, totalSeconds = WRITER_VOICE_TARGET_SECONDS): number {
  const lengths = WRITER_VOICE_SCRIPT.map((s) => s.length);
  const total = lengths.reduce((a, b) => a + b, 0);
  const progress = Math.min(1, Math.max(0, elapsedSeconds / totalSeconds)) * total;
  let acc = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    acc += lengths[i];
    if (progress < acc) return i;
  }
  return lengths.length - 1;
}
