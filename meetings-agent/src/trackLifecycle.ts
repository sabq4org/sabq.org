// ----------------------------------------------------------------------------
// دورة حياة مسارات التفريغ لـ«مُدوِّن سبق AI» — وحدة نقية بلا LiveKit حتى
// تُختبر مباشرة (tests/unit/meetingsAgentTrackLifecycle.test.ts).
//
// سبب وجودها (اجتماع 78848e31 في 2026-11-17): العامل انضم وبدأ تفريغ مسار
// ولم يرفع أي مقطع ولم يطبع أي خطأ، ثم علق عند إغلاق الغرفة («job is
// unresponsive») فلم يطبع سطر «done» أبداً. في @livekit/agents 1.5.3:
//   • فشل جلسة STT يُبث كحدث "error" على كائن STT (EventEmitter)؛ بلا مستمع
//     يرمي Node الخطأ داخل مهمة خلفية، ورفض الوعود في عملية المهمة يُسجَّل
//     بمستوى debug فقط → الفشل صامت تماماً.
//   • AudioStream لا ينتهي دائماً بعد قطع الغرفة → Promise.allSettled لا يعود.
// هنا: عدّادات لكل مسار تُطبع، ومهلة إغلاق، وفحص وجود المتغيرات (بلا قيمها).
// ----------------------------------------------------------------------------

/** مهلة انتظار مسارات التفريغ بعد إغلاق الغرفة قبل الإغلاق القسري */
export const SHUTDOWN_GRACE_MS = 10_000;
/** إعادة محاولة جلسة STT إن فشلت والغرفة ما زالت قائمة */
export const MAX_STT_RESTARTS = 3;
export const STT_RESTART_DELAY_MS = 2_000;

export interface TrackStats {
  identity: string;
  frames: number;
  finals: number;
  emptyFinals: number;
  speechStarts: number;
  errors: number;
  restarts: number;
  lastError: string | null;
}

export function newTrackStats(identity: string): TrackStats {
  return { identity, frames: 0, finals: 0, emptyFinals: 0, speechStarts: 0, errors: 0, restarts: 0, lastError: null };
}

/** سطر ملخص لمسار واحد — بلا نص تفريغ */
export function formatTrackSummary(s: TrackStats): string {
  return (
    `[Agent] track ${s.identity}: frames=${s.frames} speechStarts=${s.speechStarts} ` +
    `finals=${s.finals} emptyFinals=${s.emptyFinals} errors=${s.errors} restarts=${s.restarts}` +
    (s.lastError ? ` lastError="${s.lastError}"` : "")
  );
}

/** تشخيص سبب غياب التفريغ من العدّادات — يُطبع مع الملخص */
export function diagnoseTrack(s: TrackStats): string {
  if (s.errors > 0 && s.finals === 0) return "stt-failed";
  if (s.frames === 0) return "no-audio-frames";
  if (s.speechStarts === 0 && s.finals === 0) return "audio-but-no-speech-detected";
  if (s.finals === 0) return "speech-but-no-transcript";
  return "ok";
}

/** رسالة خطأ آمنة للطباعة: سطر واحد، مقصوصة، وبلا ما يشبه مفتاح API */
export function safeErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
  return raw
    .replace(/\b(sk|rk|pk|botpub)[-_][A-Za-z0-9_-]{8,}/g, "$1-***")
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** حدث "error" من كائن STT في @livekit/agents: { error, recoverable } */
export function describeSttErrorEvent(ev: unknown): { message: string; recoverable: boolean } {
  const e = (ev ?? {}) as { error?: unknown; recoverable?: unknown };
  return { message: safeErrorMessage(e.error ?? ev), recoverable: e.recoverable === true };
}

/** وجود المتغيرات المطلوبة (نعم/لا فقط — لا تُطبع القيم أبداً) */
export function describeEnvPresence(env: Record<string, string | undefined>): {
  line: string;
  missing: string[];
} {
  const required = ["OPENAI_API_KEY", "SABQ_API_URL", "MEETINGS_AGENT_SECRET", "LIVEKIT_URL"];
  const missing = required.filter((k) => !env[k] || !String(env[k]).trim());
  const line = `[Agent] env: ${required.map((k) => `${k}=${missing.includes(k) ? "missing" : "set"}`).join(" ")}`;
  return { line, missing };
}

/** يعيد نتيجة الوعد أو "timeout" بعد ms — لا يرمي */
export async function settleWithin(promises: Promise<unknown>[], ms: number): Promise<"settled" | "timeout"> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
  });
  try {
    return await Promise.race([Promise.allSettled(promises).then(() => "settled" as const), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
