import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";
import "./mobile.css";
import { installDeployRecovery } from "./lib/deployRecovery";
import { startBuildVersionPolling } from "./lib/buildVersion";

// Sentry — أخطاء فقط (بلا tracing/replay/logs: تستهلك الحصة وتضخّم الحزمة).
// PROD فقط حتى لا يضج التطوير. الـDSN عام بطبيعته (يظهر في حزمة المتصفح مهما
// فعلنا) فالافتراضي المدمج يُغني عن ضبط بيئة على Pages، وVITE_SENTRY_DSN
// يتيح التبديل. denyUrls يطابق فلسفة كاتم أخطاء الطرف الثالث أدناه —
// سكربتات الإعلانات وإضافات المتصفح ليست أخطاءنا. أخطاء الـchunks المفقودة
// تمرّ عمدًا: هي إنذار «الشاشة البيضاء بعد النشر».
// «من أصولنا»: حزمة الويب (sabq.org بما فيها cdn، ومعاينات Pages)، عمّال
// blob: أنشأناها نحن، وأغلفة كاباسيتور (capacitor://localhost على iOS
// وhttps://localhost داخل تطبيق أندرويد).
const FIRST_PARTY_FRAME =
  /^(?:blob:|capacitor:)|(?:sabq\.org|\.pages\.dev|\/\/localhost(?::\d+)?)\/(?:assets|src)\//;

if (import.meta.env.PROD) {
  Sentry.init({
    dsn:
      import.meta.env.VITE_SENTRY_DSN ||
      "https://1b0d0e5e036519383e22c0e20f9eddc0@o4511664870391808.ingest.us.sentry.io/4511665077420032",
    environment: "production",
    // أول 90 دقيقة تشغيل أثبتت أن denyUrls وحدها لا تكفي: الضجيج الأكبر جاء من
    // إطارات مجهولة (<anonymous>) وسكربتات لا يغطيها النمط (beacon.min.js حقن
    // كلاودفلير، player.ima إعلانات فيديو، «moment-by-moment» يمشّط الـDOM).
    // allowUrls يقلب المنطق: لا يُقبل إلا خطأ إطارُ رميه من حزمتنا نحن
    // (sabq.org/assets أو معاينات Pages) — وأخطاء chunks «الشاشة البيضاء» منها،
    // فتمرّ. ملاحظة: أحداث بلا إطارات (captureMessage/رفض غير-Error) لا يسقطها
    // allowUrls — لذلك تبقى ignoreErrors لنصوصها المعروفة.
    allowUrls: [/sabq\.org\/assets\//, /\.pages\.dev\/assets\//],
    denyUrls: [
      /googletagmanager|googlesyndication|doubleclick|adservice|novatiq|permutive/i,
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^safari(-web)?-extension:\/\//,
    ],
    ignoreErrors: [
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
      // fetch محجوب (مانع إعلانات) نحو نطاقات إعلانات/تحليلات خارجية —
      // منذ SDK v8 تُلحق الرسالة بمضيف الطلب الفاشل فنطابق عليه. طلباتنا
      // نحو cdn.sabq.org تمرّ عمدًا: فشلها إنذار CDN حقيقي.
      /(?:Failed to fetch|Load failed|NetworkError)[^(]*\([^)]*(?:googlesyndication|doubleclick|googletagmanager|google-analytics|analytics\.google|adservice|spadsync)/i,
    ],
    // allowUrls لا يكفي وحده: غلاف Sentry (browserApiErrors) يلفّ callbacks
    // setInterval/addEventListener حتى للسكربتات المحقونة (إضافات متصفح،
    // WebView داخل التطبيقات، أكواد إعلانات)، فيظهر إطار الغلاف — وهو من
    // حزمتنا — أسفل المكدس ويمرّر الحدث رغم أن موضع الرمي الفعلي
    // <anonymous>. هذا وحده ضخّ ~288 ألف حدث في 9 أيام (JAVASCRIPT-REACT-K).
    // الحسم هنا بموضع الرمي: أعلى إطار ذي ملف يجب أن يكون من أصولنا وإلا
    // أُسقط الحدث قبل الإرسال — فلا يستهلك من الحصة أصلًا.
    beforeSend(event) {
      const frames = event.exception?.values?.[0]?.stacktrace?.frames;
      // بلا مكدس (captureMessage/رفض غير-Error): تكفيه ignoreErrors أعلاه
      if (!frames?.length) return event;
      for (let i = frames.length - 1; i >= 0; i--) {
        const filename = frames[i]?.filename;
        // native/wasm فقط تُتخطى نزولًا. إطار بلا ملف = كود eval محقون
        // (JAVASCRIPT-REACT-V تسرّب من هنا: أعلى إطاره `eval` بلا filename
        // فسقط الفحص على إطار غلاف Sentry من حزمتنا) — حزمة Vite الإنتاجية
        // لا تستخدم eval إطلاقًا، فاعتباره دخيلًا آمن.
        if (filename === "[native code]" || filename === "[wasm code]") continue;
        if (!filename) return null;
        return FIRST_PARTY_FRAME.test(filename) ? event : null;
      }
      // كل الإطارات مجهولة الملف — callback خارجي ملفوف بغلاف Sentry
      return null;
    },
  });
}

// Recover from "white page after deploy": if a lazily-loaded chunk 404s
// because the edge-cached shell points at a rotated build, hard-reload once
// (cache-busted) to fetch the current deploy. This is what makes edge-caching
// the SPA shell in functions/_middleware.js safe. Production only — Vite's HMR
// handles chunk rotation in dev.
//
// REACTIVE layer: deployRecovery listens for `vite:preloadError` / lazy-import
// failures and reloads once with a cache buster.
// PROACTIVE layer: buildVersion polls /build-info.json so an open tab reloads
// to the current deploy BEFORE it tries to load a deleted chunk — turning the
// post-deploy "white page" into a transparent refresh. Combined with the clean
// 404 for missing /assets/* in functions/_middleware.js, this closes the loop.
if (import.meta.env.PROD) {
  installDeployRecovery();
  startBuildVersionPolling();
}

// Suppress noisy errors from third-party ad scripts. They reach
// `window.onerror` because of cross-origin script tags; nothing we can
// fix from this side, but we don't want them surfacing in error
// trackers or polluting the console for the editorial team.
// Also swallow the known DMS/GTM injector that assumes ≥4
// `card-article-grid-*` nodes exist — on /opinion (and any sparse grid)
// it throws TypeError and Replit's runtime-error overlay hijacks the page.
const isKnownAdDomNoise = (message: string) =>
  /card-article-grid/.test(message) ||
  (/parentNode/.test(message) && /undefined is not an object|Cannot read propert/i.test(message));

window.addEventListener("error", (event) => {
  const message = event.message || "";
  if (isKnownAdDomNoise(message)) {
    event.preventDefault();
    console.warn("[Third-party ad DOM noise suppressed]", message);
    return false;
  }
  const src = event.filename || "";
  if (!src) return;
  const isThirdParty =
    src.includes("googletagmanager") ||
    src.includes("googlesyndication") ||
    src.includes("doubleclick") ||
    src.includes("dms") ||
    src.includes("novatiq") ||
    !src.includes(window.location.origin);
  if (isThirdParty) {
    event.preventDefault();
    console.warn("[Third-party script error suppressed]", message);
    return false;
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  if (reason && typeof reason === "object" && !reason.stack) {
    event.preventDefault();
    console.warn("[Third-party promise rejection suppressed]");
    return false;
  }
});

createRoot(document.getElementById("root")!).render(<App />);

import { Capacitor } from "@capacitor/core";
if (import.meta.env.PROD && Capacitor.isNativePlatform()) {
  // Dismiss the native splash as early as possible: fire hide() the
  // moment the splash-screen plugin chunk resolves, instead of waiting
  // on the other three plugin imports (status-bar/keyboard/app). On a
  // cold network those extra chunks can lag, and bundling their wait
  // into the hide() chain kept the splash up longer than needed. The
  // 2.5s launchAutoHide in capacitor.config stays as the safety net.
  import("@capacitor/splash-screen")
    .then(({ SplashScreen }) => SplashScreen.hide())
    .catch(() => {});

  Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/keyboard"),
    import("@capacitor/app"),
  ]).then(([{ StatusBar, Style }, { Keyboard }, { App: CapacitorApp }]) => {
    StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: "#1a73e8" }).catch(() => {});
    Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {});
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      console.warn("App state changed. Is active?", isActive);
    }).catch(() => {});
  }).catch(() => {});
}
