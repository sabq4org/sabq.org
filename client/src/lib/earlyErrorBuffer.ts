// Sentry يُحمَّل بعد ظهور الصفحة (LCP، خطة 2026-09-25) بدل أن يكون في حزمة
// الدخول. حتى لا تضيع أخطاء أول ثانية (مثل «الشاشة البيضاء بعد النشر»)،
// نلتقطها هنا مبكرًا مع مصدرها واسم الملف، ثم يعيد sentryInit إرسال ما يثبت
// أن مصدره من حزمة سبق. حفظ المصدر ضروري لأن captureException يحوّل آلية
// الالتقاط إلى generic ويفقد filename، فتبدو أخطاء السكربتات المحقونة كأنها
// نداءات صريحة من التطبيق.
const MAX_BUFFERED = 20;

export interface BufferedEarlyError {
  error: Error;
  source: "error" | "unhandledrejection";
  /** ErrorEvent filename before replay; captureException otherwise loses it. */
  filename?: string;
}

let buffer: BufferedEarlyError[] = [];
let installed = false;

function push(
  err: unknown,
  source: BufferedEarlyError["source"],
  filename?: string,
) {
  if (err instanceof Error && buffer.length < MAX_BUFFERED) {
    buffer.push({ error: err, source, filename });
  }
}

function onError(event: ErrorEvent) {
  push(event.error, "error", event.filename || undefined);
}

function onRejection(event: PromiseRejectionEvent) {
  push(event.reason, "unhandledrejection");
}

export function installEarlyErrorBuffer(target: Pick<Window, "addEventListener"> = window) {
  if (installed) return;
  installed = true;
  target.addEventListener("error", onError as EventListener);
  target.addEventListener("unhandledrejection", onRejection as EventListener);
}

/** يوقف الالتقاط ويعيد ما جُمع (مرة واحدة) مع مصدره الأصلي قبل إعادة الإرسال. */
export function drainEarlyErrors(
  target: Pick<Window, "removeEventListener"> = window,
): BufferedEarlyError[] {
  if (installed) {
    target.removeEventListener("error", onError as EventListener);
    target.removeEventListener("unhandledrejection", onRejection as EventListener);
    installed = false;
  }
  const out = buffer;
  buffer = [];
  return out;
}
