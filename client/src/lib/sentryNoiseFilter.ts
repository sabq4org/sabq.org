/**
 * فرز أحداث Sentry في المتصفح: هل هذا خطأ من كودنا فعلًا؟
 *
 * الخلفية (JAVASCRIPT-REACT-32 و«عائلته»): متصفحات داخل التطبيقات (تطبيق
 * Google على iOS، أغلفة WebView)، وإضافات المتصفح، ووسوم Google Tag Manager
 * المخصّصة، تحقن سكربتات في صفحتنا. حين ترمي هذه السكربتات استثناءً كان يصل
 * إلينا موسومًا وكأنه خطأ في حزمتنا، لسببين اثنين:
 *
 *   1. تكامل `browserApiErrors` في Sentry يلفّ addEventListener/setInterval/
 *      setTimeout/rAF/XHR عالميًا. حين ترمي دالة راجعة مملوكة لطرف ثالث،
 *      يكون **إطار الغلاف نفسه** — وهو من `/assets/index-*.js` أي من أصولنا —
 *      هو الإطار الوحيد في المكدس، فيمرّ فحص «أول إطار من أصولنا». هكذا صار
 *      `window.webkit.messageHandlers` (بريدج تطبيق Google على iOS، ولا وجود
 *      له في مستودعنا إطلاقًا) خطأً «من كودنا» في JAVASCRIPT-REACT-32، وهكذا
 *      ضخّ `checkIfInView` — وهو وسم GTM مخصّص — 1429 حدثًا في
 *      JAVASCRIPT-REACT-14، و`setInterval` مجهول 295 ألف حدث في
 *      JAVASCRIPT-REACT-K.
 *
 *   2. أحداث بلا مكدس إطلاقًا (رفض Promise بقيمة ليست Error، أو
 *      «Script error.» عابر الأصل) كانت تُمرَّر افتراضيًا، فبقيت تُصفّى واحدةً
 *      واحدةً عبر قائمة `ignoreErrors` — لعبة قط وفأر لا تنتهي
 *      (JAVASCRIPT-REACT-H «Error: Aa»، JAVASCRIPT-REACT-1A رفض بقيمة
 *      undefined).
 *
 * العلاج هنا يعالج (2)، ويُعالَج (1) بتعطيل لفّ `browserApiErrors` عند التهيئة
 * حتى لا نصنع إطارًا زائفًا من أصولنا لكود ليس لنا. الاثنان معًا يعيدان
 * النسبة الصحيحة: خطأ الطرف الثالث ينتهي إما بإطار ليس من أصولنا (فيسقط
 * بالقاعدة 4) أو بلا إطارات (فيسقط بالقاعدة 3).
 *
 * ما لا يفعله هذا الملف: إسكات أخطائنا نحن. أي حدث فيه إطار واحد على الأقل
 * من حزمتنا في موضع الرمي يمرّ كما هو — بما فيها أخطاء الـchunks المفقودة
 * («الشاشة البيضاء بعد النشر») وهي إنذارنا الأهم.
 */

/**
 * «من أصولنا»: حزمة الويب (sabq.org ونطاقاتها الفرعية بما فيها cdn، ومعاينات
 * Cloudflare Pages)، وعمّال blob: أنشأناها نحن، وأغلفة كاباسيتور
 * (capacitor://localhost على iOS وhttps://localhost داخل تطبيق أندرويد).
 *
 * النمط **مثبّت على بداية السلسلة وعلى حدّ المضيف**. الصيغة السابقة كانت
 * طليقة، فكان `https://evil.example/sabq.org/assets/x.js` — أي مضيف يضع
 * `sabq.org/assets/` في مساره — يُحسب «من أصولنا» ويعبر الفلتر. أثره العملي
 * محدود (الفرز فقط) لكنه ثغرة تصنيف حقيقية كشفها اختبار الوحدة.
 */
export const FIRST_PARTY_FRAME =
  /^(?:blob:|capacitor:)|^https?:\/\/(?:[a-z0-9-]+\.)*(?:sabq\.org|pages\.dev|localhost)(?::\d+)?\/(?:assets|src)\//i;

/** إطارات تُنتجها المنصّة لا ملف لها — تُتخطّى نزولًا في المكدس. */
const SYNTHETIC_FILENAMES = new Set(["[native code]", "[wasm code]"]);

/** Browser-extension schemes can never belong to the Sabq application. */
const BROWSER_EXTENSION_FRAME =
  /^(?:chrome|moz|safari(?:-web)?)-extension:\/\//i;

/**
 * آليات الالتقاط التلقائي في متصفح Sentry: `auto.browser.global_handlers.*`
 * (window.onerror / onunhandledrejection) و`auto.browser.browserapierrors.*`
 * (أغلفة المؤقّتات وEventTarget). ما عداها — `generic` تحديدًا — يعني نداءً
 * صريحًا منّا: `Sentry.captureException` / `captureMessage`.
 */
export function isAutoCapturedMechanism(mechanismType: unknown): boolean {
  return typeof mechanismType === "string" && mechanismType.startsWith("auto.");
}

export function isFirstPartyFilename(filename: unknown): boolean {
  return typeof filename === "string" && FIRST_PARTY_FRAME.test(filename);
}

function hasBrowserExtensionFrame(event: MinimalSentryEvent): boolean {
  return Boolean(event.exception?.values?.some((value) =>
    value.stacktrace?.frames?.some((frame) =>
      typeof frame.filename === "string" &&
      BROWSER_EXTENSION_FRAME.test(frame.filename),
    ),
  ));
}

/**
 * حدث نُسب إلى غلاف `browserApiErrors` ولا يحمل سوى إطار الغلاف نفسه.
 *
 * دفاع في العمق: التهيئة تعطّل هذا اللفّ أصلًا، فلا ينبغي أن تصل آلية
 * `browserapierrors` بعد اليوم. لكن لو أُعيد تفعيلها — أو لفّت نسخة SDK
 * لاحقة مسارًا آخر — يبقى الفحص صالحًا: خطأ حقيقي من دالة راجعة لنا يترك
 * إطار الدالة الراجعة **إضافة** إلى إطار الغلاف (دالتان منفصلتان، والتصغير
 * لا يدمجهما). إطار واحد يعني أن موضع الرمي الحقيقي ضاع لأنه ليس ملفًا
 * نعرفه — أي كود محقون.
 */
function isLoneWrapperFrame(
  mechanismType: unknown,
  frames: Array<{ filename?: string }>,
): boolean {
  return (
    typeof mechanismType === "string" &&
    mechanismType.startsWith("auto.browser.browserapierrors.") &&
    frames.length === 1 &&
    isFirstPartyFilename(frames[0]?.filename)
  );
}

/** الشكل الأدنى الذي نحتاجه من حدث Sentry — يُبقي الوحدة قابلة للاختبار بلا SDK. */
export interface MinimalSentryEvent {
  exception?: {
    values?: Array<{
      mechanism?: { type?: string } | null;
      stacktrace?: { frames?: Array<{ filename?: string }> } | null;
    }>;
  } | null;
}

/**
 * القرار: هل نرسل هذا الحدث إلى Sentry؟
 *
 * القواعد بالترتيب:
 *   1. لا استثناء في الحدث (رسالة صريحة منّا) → يمرّ.
 *   1.5 أي إطار صريح لإضافة متصفح → يسقط. إضافات مثل
 *       `injectScriptAdjust.js` تلفّ `window.fetch`، فيصبح المكدس مختلطًا
 *       (إطار من حزمتنا + الإضافة + غلاف SDK من حزمتنا) ويفلت من فحص موضع
 *       الرمي وحده رغم أن الطرف الدخيل مثبت داخل المكدس.
 *   1.6 إطار غلاف `browserApiErrors` وحيدًا → يسقط (انظر isLoneWrapperFrame).
 *   2. له إطارات → نمشي من موضع الرمي (آخر إطار) إلى الأعلى:
 *      - `[native code]` / `[wasm code]` تُتخطّى،
 *      - إطار بلا اسم ملف = كود eval محقون → يسقط (حزمة Vite الإنتاجية لا
 *        تستخدم eval إطلاقًا، فاعتباره دخيلًا آمن)،
 *      - أول إطار ذي ملف يحسم: من أصولنا → يمرّ، وإلا → يسقط.
 *   3. كل إطاراته صناعية → يسقط.
 *   4. بلا إطارات إطلاقًا:
 *      - التقاط تلقائي (`auto.*`) → يسقط؛ لا دليل واحد على أنه خطؤنا، وكل
 *        حالة من هذا الشكل في آخر 30 يومًا كانت طرفًا ثالثًا.
 *      - نداء صريح منّا (`generic` أو بلا mechanism) → يمرّ.
 */
export function shouldSendSentryEvent(event: MinimalSentryEvent): boolean {
  if (hasBrowserExtensionFrame(event)) return false;

  const exceptionValue = event.exception?.values?.[0];
  if (!exceptionValue) return true;

  const frames = exceptionValue.stacktrace?.frames;

  if (!frames?.length) {
    return !isAutoCapturedMechanism(exceptionValue.mechanism?.type);
  }

  if (isLoneWrapperFrame(exceptionValue.mechanism?.type, frames)) return false;

  for (let i = frames.length - 1; i >= 0; i--) {
    const filename = frames[i]?.filename;
    if (typeof filename === "string" && SYNTHETIC_FILENAMES.has(filename)) {
      continue;
    }
    if (!filename) return false;
    return isFirstPartyFilename(filename);
  }

  // كل الإطارات صناعية — لا موضع رمي يمكن نسبته إلينا.
  return false;
}

/** غلاف بتوقيع `beforeSend` الذي يتوقعه Sentry. */
export function sentryBeforeSend<T extends MinimalSentryEvent>(event: T): T | null {
  return shouldSendSentryEvent(event) ? event : null;
}
