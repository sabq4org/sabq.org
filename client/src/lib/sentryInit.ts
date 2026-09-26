import * as Sentry from "@sentry/react";
import {
  sentryBeforeSend,
  SENTRY_DENY_URLS,
  SENTRY_IGNORE_ERRORS,
} from "./sentryNoiseFilter";
import { drainEarlyErrors } from "./earlyErrorBuffer";

// Sentry — أخطاء فقط (بلا tracing/replay/logs: تستهلك الحصة وتضخّم الحزمة).
// PROD فقط حتى لا يضج التطوير. الـDSN عام بطبيعته (يظهر في حزمة المتصفح مهما
// فعلنا) فالافتراضي المدمج يُغني عن ضبط بيئة على Pages، وVITE_SENTRY_DSN
// يتيح التبديل. denyUrls يطابق فلسفة كاتم أخطاء الطرف الثالث أدناه —
// سكربتات الإعلانات وإضافات المتصفح ليست أخطاءنا. أخطاء الـchunks المفقودة
// تمرّ عمدًا: هي إنذار «الشاشة البيضاء بعد النشر».
// تعريف «من أصولنا» ومنطق الفرز انتقلا إلى lib/sentryNoiseFilter.ts حتى
// يصيرا قابلين للاختبار بالوحدة (tests/unit/sentryNoiseFilter.test.ts يثبّت
// أحداثًا حقيقية من production فلا ترجع المشكلة صامتة).

// يُستورد ديناميكيًا من main.tsx بعد ظهور الصفحة، فلا يثقل حزمة الدخول.
export function initSentry() {
  Sentry.init({
    dsn:
      import.meta.env.VITE_SENTRY_DSN ||
      "https://1b0d0e5e036519383e22c0e20f9eddc0@o4511664870391808.ingest.us.sentry.io/4511665077420032",
    environment: "production",
    // السبب الجذري لـJAVASCRIPT-REACT-32 وعائلته (14 و2E وK…): تكامل
    // browserApiErrors يلفّ addEventListener/setTimeout/setInterval/rAF/XHR
    // **عالميًا**، فيشمل الدوال الراجعة التي يسجّلها كود ليس لنا: متصفحات
    // داخل التطبيقات (تطبيق Google على iOS)، إضافات المتصفح، وسوم GTM
    // المخصّصة، أكواد الإعلانات. حين ترمي إحداها، يكون إطار الغلاف — وهو
    // من `/assets/index-*.js` أي من حزمتنا — الإطارَ الوحيد في المكدس،
    // فيُنسب خطأ الطرف الثالث إلينا ويعبر كل فلاتر «أول إطار من أصولنا».
    // هكذا صار بريدج `window.webkit.messageHandlers` — ولا وجود له في كود
    // الويب إطلاقًا — خطأً «من كودنا» على iPhone داخل صفحة مقال.
    //
    // إيقاف اللفّ يعيد النسبة الصحيحة ولا يفقدنا تغطية: الخطأ الذي يرميه
    // كودنا داخل مستمع أو مؤقّت يظل يصعد إلى window.onerror فيلتقطه
    // globalHandlers بمكدس كامل. المفقود الوحيد بيانات وصفية إضافية عن
    // نوع الـAPI — ثمن زهيد مقابل إسناد صحيح.
    integrations: [
      Sentry.browserApiErrorsIntegration({
        setTimeout: false,
        setInterval: false,
        requestAnimationFrame: false,
        XMLHttpRequest: false,
        eventTarget: false,
      }),
    ],
    // أول 90 دقيقة تشغيل أثبتت أن denyUrls وحدها لا تكفي: الضجيج الأكبر جاء من
    // إطارات مجهولة (<anonymous>) وسكربتات لا يغطيها النمط (beacon.min.js حقن
    // كلاودفلير، player.ima إعلانات فيديو، «moment-by-moment» يمشّط الـDOM).
    // allowUrls يقلب المنطق: لا يُقبل إلا خطأ إطارُ رميه من حزمتنا نحن
    // (sabq.org/assets أو معاينات Pages) — وأخطاء chunks «الشاشة البيضاء» منها،
    // فتمرّ. ملاحظة: أحداث بلا إطارات (captureMessage/رفض غير-Error) لا يسقطها
    // allowUrls — لذلك تبقى ignoreErrors لنصوصها المعروفة.
    allowUrls: [/sabq\.org\/assets\//, /\.pages\.dev\/assets\//],
    // القوائم الكاملة والتعليل في lib/sentryNoiseFilter.ts — مصدر واحد
    // يستهلكه الـSDK هنا ويُعاد فحصه في beforeSend مع اختبارات الوحدة.
    denyUrls: SENTRY_DENY_URLS,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    // الحسم بموضع الرمي: أعلى إطار ذي ملف يجب أن يكون من أصولنا، وإلا أُسقط
    // الحدث قبل الإرسال فلا يستهلك من الحصة أصلًا. والأحداث بلا مكدس التي
    // التقطها المتصفح تلقائيًا (auto.*) تسقط كذلك — لا دليل واحد على أنها
    // منّا، وكانت هي المنفذ الأخير الذي عبرت منه JAVASCRIPT-REACT-H و1A.
    // المنطق كامل ومشروح في lib/sentryNoiseFilter.ts.
    beforeSend: sentryBeforeSend,
  });
  for (const err of drainEarlyErrors()) Sentry.captureException(err);
}
