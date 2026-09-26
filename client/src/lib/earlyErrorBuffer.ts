// Sentry يُحمَّل بعد ظهور الصفحة (LCP، خطة 2026-09-25) بدل أن يكون في حزمة
// الدخول. حتى لا تضيع أخطاء أول ثانية (مثل «الشاشة البيضاء بعد النشر»)،
// نلتقطها هنا مبكرًا ثم يعيد sentryInit إرسالها عبر captureException فتمر
// بالفلاتر نفسها (allowUrls/beforeSend). الثمن المقبول: خطأ يسبق إعادة تحميل
// فورية للصفحة قد يضيع.
const MAX_BUFFERED = 20;

let buffer: Error[] = [];
let installed = false;

function push(err: unknown) {
  if (err instanceof Error && buffer.length < MAX_BUFFERED) buffer.push(err);
}

function onError(event: ErrorEvent) {
  push(event.error);
}

function onRejection(event: PromiseRejectionEvent) {
  push(event.reason);
}

export function installEarlyErrorBuffer(target: Pick<Window, "addEventListener"> = window) {
  if (installed) return;
  installed = true;
  target.addEventListener("error", onError as EventListener);
  target.addEventListener("unhandledrejection", onRejection as EventListener);
}

/** يوقف الالتقاط ويعيد ما جُمع (مرة واحدة). */
export function drainEarlyErrors(target: Pick<Window, "removeEventListener"> = window): Error[] {
  if (installed) {
    target.removeEventListener("error", onError as EventListener);
    target.removeEventListener("unhandledrejection", onRejection as EventListener);
    installed = false;
  }
  const out = buffer;
  buffer = [];
  return out;
}
