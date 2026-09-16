import {
  QUERY_DEADLINE_ERROR_MESSAGE,
  QUERY_DEADLINE_ERROR_NAME,
} from "./queryDeadline";

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
  message?: string;
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      mechanism?: { type?: string } | null;
      stacktrace?: { frames?: Array<{ filename?: string }> } | null;
    }>;
  } | null;
}

/**
 * سكربتات إعلانات/تحليلات وإضافات متصفح — ليست أخطاءنا. تُمرَّر إلى
 * `denyUrls` في `Sentry.init` حتى يُسقطها الـSDK قبل beforeSend.
 */
export const SENTRY_DENY_URLS: RegExp[] = [
  /googletagmanager|googlesyndication|doubleclick|adservice|novatiq|permutive|google-analytics|googletagservices|googleadservices|analytics\.google/i,
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
  /^safari(-web)?-extension:\/\//,
];

/**
 * رسائل ضجيج العميل غير القابلة للإصلاح من جهتنا.
 *
 * تُمرَّر إلى `ignoreErrors` في التهيئة (يسقطها الـSDK مبكرًا) وتُعاد
 * فحصها في `shouldSendSentryEvent` حتى تُختبَر بالوحدة. مطابقة السلاسل
 * كـSentry: السلسلة جزء من الرسالة، والتعبير النمطي `RegExp.test`.
 *
 * لا تُدرج هنا أخطاء الـchunks المفقودة («Failed to fetch dynamically
 * imported module») — تلك إنذار الشاشة البيضاء بعد النشر.
 */
export const SENTRY_IGNORE_ERRORS: Array<string | RegExp> = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications.",
  // تتبّع خارجي محجوب بمانع إعلانات — السلسلة ليست في كودنا أصلًا
  "Failed to track Pageview",
  // سكربت إعلانات محقون (GTM/DMS) يمشّط DOM الصفحة بحثًا عن البطاقة
  // الرابعة ليحقن إعلانًا داخل الشبكة — في الصفحات التي تعرض أقل من 4
  // بطاقات يرمي TypeError. ليس في مستودعنا إطلاقًا (السيلكتور لا يظهر
  // إلا كـtestid في NewsArticleCard)، لكنه أكبر مصدر ضجيج في Sentry
  // (3,400+ حدث/أسبوع) وقد يصل بلا إطارات فلا يسقطه allowUrls.
  /card-article-grid/,
  /reading 'parentNode'/,
  // GPT غير محمّل (مانع إعلانات) وسكربت خارجي يستدعيه بلا حارس —
  // كودنا (DmsAdSlot) يفحص window.googletag.pubads قبل أي استدعاء
  /googletag\.pubads is not a function/,
  // ماسح روابط Outlook (SafeLinks) يرفض Promise بكائن ليس Error —
  // نمط عالمي معروف، يصل بلا إطارات فلا يسقطه beforeSend أدناه
  "Object Not Found Matching Id",
  // إضافة «تعبئة تلقائية» في متصفحات أندرويد تستدعي دالة غير معرّفة
  // (بصيغتي Chrome وSafari/WebKit)
  /xbrowser is not defined|Can't find variable: xbrowser/,
  // إضافة متصفح / سكربت محقون يفترض متغيّرًا عامًا اسمه selector
  // (JAVASCRIPT-REACT-4). لا يوجد ReferenceError بهذا الاسم في كودنا.
  /selector is not defined|Can't find variable: selector/,
  // fetch فاشل نحو مضيف ليس لنا — منذ SDK v8 تُلحق الرسالة بمضيف الطلب
  // الفاشل فنطابق عليه. كودنا لا ينادي أي مضيف خارجي بـfetch من المتصفح
  // (تحقُّق 2026-08-17: صفر نداءات خارجية في client/src)، فكل فشل موسوم
  // بمضيف غير sabq مصدره سكربت محقون: إضافات (frame_ant نحو
  // www.google.com في JAVASCRIPT-REACT-1C، injectScriptAdjust في 35/37)،
  // أدواري (utq.vvipquan.com في 36)، ووسوم إعلانات. كانت القاعدة قائمة
  // بمضيفي الإعلانات المعروفين — لعبة قط وفأر انتهت بقلب المنطق.
  // الفشل بلا لاحقة "(host)" أو نحو مضيف sabq يمرّ كما هو.
  /(?:Failed to fetch|Load failed|NetworkError)[^(]*\((?!(?:[a-z0-9-]+\.)*sabq\.(?:org|news)\))/i,
  // polyfill الـmodulepreload من Vite يجلب chunks مسبقًا بـfetch — فشله
  // (شبكة متقطعة، إغلاق الصفحة أثناء الجلب، دوران build بعد النشر) لا
  // يكسر شيئًا: الاستيراد الفعلي له مسار خطئه وdeployRecovery يعالج
  // الشاشة البيضاء. 1,428 حدثًا في 16 يومًا (JAVASCRIPT-REACT-D) صفر
  // مستخدم متأثر. إنذار CDN الحقيقي محفوظ: رسائل فشل الاستيراد
  // الديناميكي (Failed to fetch dynamically imported module /
  // Importing a module script failed) بلا لاحقة "(host)" فلا تطابق.
  /(?:Failed to fetch|Load failed|NetworkError)[^(]*\(cdn\.sabq\.org\)/,
  // إلغاء داخلي في TanStack Query: حين يُفكَّك آخر مكوّن يراقب استعلامًا
  // جاريًا يستدعي removeObserver → cancel({revert}) فيجهض الجلب عبر
  // AbortController، ورفض retryer الداخلي يصعد كـunhandled rejection من
  // vendor-core — سلوك مقصود في المكتبة لا خطأ عندنا. صفر مستخدم متأثر
  // في 157 حدثًا خلال أسبوعين (JAVASCRIPT-REACT-2W و2V).
  "signal is aborted without reason",
  // سفاري/WebKit يرمي TypeError برسالة «مُلغى» (المعرّب) أو "cancelled"
  // (الإنجليزي) — مكافئ Load failed — حين يُجهض fetch بمغادرة الصفحة
  // أثناء الجلب. ضجيج شبكة لا خطأ كود (JAVASCRIPT-REACT-38).
  // مطابقة تامة حتى لا تُسقط رسالة حقيقية تحتوي الكلمة.
  /^مُلغى$/,
  /^cancelled$/,
  // سفاري/WebKit المعرّب: «تم فقدان اتصال الشبكة.» = CFNetwork
  // NSURLErrorNetworkConnectionLost. يصل من fetch في حزمتنا فيمرّ
  // فحص موضع الرمي — لذلك تُدرَج هنا لا في beforeSend وحدها.
  // JAVASCRIPT-REACT-2T: https://sabq.sentry.io/issues/7619514545/
  /^تم فقدان اتصال الشبكة\.?$/,
  /^The network connection was lost\.?$/i,
  /^The Internet connection appears to be offline\.?$/i,
  // رفض إذن المتصفح (تشغيل تلقائي، حافظة، إشعارات، كاميرا) — قرار
  // المستخدم أو سياسة المنصّة، لا خلل في الكود. الرسائل تختلف حسب
  // اللغة لذلك نطابق النوع أيضًا في isClientNoiseException.
  /^NotAllowedError/,
];

/** مطابقة `ignoreErrors` كما يفعل Sentry: السلسلة جزءًا، والتعبير النمطي اختبارًا. */
export function isIgnoredClientErrorMessage(message: unknown): boolean {
  if (typeof message !== "string" || !message) return false;
  return SENTRY_IGNORE_ERRORS.some((pattern) =>
    typeof pattern === "string" ? message.includes(pattern) : pattern.test(message),
  );
}

/**
 * ضجيج عميل واضح من نوع الاستثناء أو نصّه.
 *
 * `NotAllowedError` يُسقط بالنوع لأن نص الرفض يختلف حسب اللغة والسياق.
 * بقية الأنماط تمرّ عبر قائمة `SENTRY_IGNORE_ERRORS`.
 */
export function isClientNoiseException(
  exception: { type?: string; value?: string } | undefined,
  fallbackMessage?: string,
): boolean {
  const type = exception?.type ?? "";
  if (type === "NotAllowedError") return true;

  // `withQueryDeadline` deliberately aborts optional component requests so
  // React Query can expose the existing recovery UI. TanStack's internal
  // cancellation may still reach `unhandledrejection`, but this exact,
  // application-owned sentinel is already handled product behavior. Do not
  // broaden this to generic TimeoutError/"Request timed out" events.
  if (
    type === QUERY_DEADLINE_ERROR_NAME &&
    exception?.value === QUERY_DEADLINE_ERROR_MESSAGE
  ) {
    return true;
  }

  const value = exception?.value ?? fallbackMessage ?? "";
  if (isIgnoredClientErrorMessage(value)) return true;
  if (type && value && isIgnoredClientErrorMessage(`${type}: ${value}`)) return true;
  return false;
}

/**
 * القرار: هل نرسل هذا الحدث إلى Sentry؟
 *
 * القواعد بالترتيب:
 *   0. نوع/نص معروف كضجيج عميل (شبكة، إلغاء، رفض إذن، إضافات) → يسقط.
 *      هذه الأحداث غالبًا من fetch في حزمتنا فتمرّ فحص موضع الرمي.
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
 *
 * querySelectorAll على undefined من سكربت مجهول (JAVASCRIPT-REACT-K)
 * يسقط بالقاعدة 2 (`<anonymous>`) — لا تُضاف رسالته إلى ignoreErrors حتى
 * لا تُكتم علة حقيقية في كودنا.
 */
export function shouldSendSentryEvent(event: MinimalSentryEvent): boolean {
  if (hasBrowserExtensionFrame(event)) return false;

  const exceptionValue = event.exception?.values?.[0];
  if (isClientNoiseException(exceptionValue, event.message)) return false;
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
