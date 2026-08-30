import { describe, expect, it } from "vitest";
import {
  isAutoCapturedMechanism,
  isFirstPartyFilename,
  shouldSendSentryEvent,
  sentryBeforeSend,
  type MinimalSentryEvent,
} from "../../client/src/lib/sentryNoiseFilter";

/**
 * كل حالة هنا مأخوذة من حدث حقيقي في Sentry (production) — الرقم في اسم
 * الاختبار هو رقم المشكلة. الغرض منع الرجوع: أي تعديل يعيد تمرير هذه الأحداث
 * يكسر الاختبار.
 */

/** بناء حدث بأقل قدر من الحشو. الإطارات بترتيب Sentry: الأقدم أولًا، وموضع الرمي آخرًا. */
function eventWith(
  frames: Array<{ filename?: string }> | undefined,
  mechanismType?: string,
): MinimalSentryEvent {
  return {
    exception: {
      values: [
        {
          mechanism: mechanismType ? { type: mechanismType } : undefined,
          stacktrace: frames ? { frames } : undefined,
        },
      ],
    },
  };
}

const OUR_BUNDLE = "https://sabq.org/assets/index-m-Y1GLu9.js";
const OUR_VENDOR = "https://sabq.org/assets/vendor-react-DDGRY6NW.js";

describe("shouldSendSentryEvent — أخطاء الطرف الثالث تسقط", () => {
  it("JAVASCRIPT-REACT-32: بريدج iOS داخل تطبيق Google، إطار غلاف Sentry وحده", () => {
    // `TypeError: undefined is not an object (evaluating 'window.webkit.messageHandlers')`
    // المكدس كله إطار واحد: دالة الغلاف `r` داخل حزمتنا. قبل هذا الفلتر كان
    // يمرّ لأن الإطار «من أصولنا» شكلًا. لا وجود لـmessageHandlers في كود الويب.
    const event = eventWith(
      [{ filename: OUR_BUNDLE }],
      "auto.browser.browserapierrors.addEventListener",
    );
    expect(shouldSendSentryEvent(event)).toBe(false);

    // ومع تعطيل لفّ browserApiErrors عند التهيئة لن يُصنع هذا الإطار أصلًا،
    // فيصل الحدث بلا إطارات — وهذا المسار يسقط أيضًا.
    const withoutWrapperFrame = eventWith(undefined, "auto.browser.global_handlers.onerror");
    expect(shouldSendSentryEvent(withoutWrapperFrame)).toBe(false);
  });

  it("إطار غلاف وحيد يسقط، لكن غلاف + إطار دالتنا الراجعة يمرّ", () => {
    const loneWrapper = eventWith([{ filename: OUR_BUNDLE }], "auto.browser.browserapierrors.setTimeout");
    const wrapperPlusOurCallback = eventWith(
      [{ filename: OUR_BUNDLE }, { filename: OUR_VENDOR }],
      "auto.browser.browserapierrors.setTimeout",
    );
    expect(shouldSendSentryEvent(loneWrapper)).toBe(false);
    expect(shouldSendSentryEvent(wrapperPlusOurCallback)).toBe(true);
  });

  it("JAVASCRIPT-REACT-K: setInterval مجهول محقون (295 ألف حدث)", () => {
    const event = eventWith(
      [{ filename: OUR_BUNDLE }, { filename: "<anonymous>" }],
      "auto.browser.browserapierrors.setInterval",
    );
    expect(shouldSendSentryEvent(event)).toBe(false);
  });

  it("JAVASCRIPT-REACT-14: وسم GTM مخصّص (checkIfInView) على visibilitychange", () => {
    const event = eventWith(
      [{ filename: OUR_BUNDLE }, { filename: "<anonymous>" }],
      "auto.browser.browserapierrors.addEventListener",
    );
    expect(shouldSendSentryEvent(event)).toBe(false);
  });

  it("JAVASCRIPT-REACT-H: «Error: Aa» من غلاف تطبيق Google — بلا مكدس", () => {
    const event = eventWith(undefined, "auto.browser.global_handlers.onunhandledrejection");
    expect(shouldSendSentryEvent(event)).toBe(false);
  });

  it("JAVASCRIPT-REACT-1A: رفض Promise بقيمة undefined من بريدج أصلي — بلا مكدس", () => {
    const event = eventWith([], "auto.browser.global_handlers.onunhandledrejection");
    expect(shouldSendSentryEvent(event)).toBe(false);
  });

  it("JAVASCRIPT-REACT-V: موضع الرمي إطار eval بلا اسم ملف", () => {
    const event = eventWith(
      [{ filename: OUR_BUNDLE }, { filename: undefined }],
      "auto.browser.global_handlers.onerror",
    );
    expect(shouldSendSentryEvent(event)).toBe(false);
  });

  it("سكربت إعلانات خارجي بملف صريح", () => {
    const event = eventWith(
      [{ filename: "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js" }],
      "auto.browser.global_handlers.onerror",
    );
    expect(shouldSendSentryEvent(event)).toBe(false);
  });

  it("إضافة متصفح", () => {
    const event = eventWith(
      [{ filename: "chrome-extension://abcdef/inject.js" }],
      "auto.browser.global_handlers.onerror",
    );
    expect(shouldSendSentryEvent(event)).toBe(false);
  });

  it("JAVASCRIPT-REACT-3B/3C/1S: إضافة fetch داخل مكدس مختلط تسقط", () => {
    // الأحداث الحقيقية تبدأ وتنتهي بإطارات من حزمتنا لأن الإضافة لفّت fetch
    // ثم مرّ الخطأ عبر غلاف SDK. فحص «آخر إطار» وحده كان يمررها رغم وجود
    // injectScriptAdjust.js صراحةً في المنتصف.
    const event = eventWith(
      [
        { filename: OUR_BUNDLE },
        { filename: "chrome-extension://bkkbcggnhapdmkeljlodobbkopceiche/injectScriptAdjust.js" },
        { filename: OUR_VENDOR },
      ],
      "auto.browser.global_handlers.onunhandledrejection",
    );
    expect(shouldSendSentryEvent(event)).toBe(false);
  });

  it("وجود عدة إطارات من حزمتنا بلا إضافة لا يزال يمرّ", () => {
    const event = eventWith(
      [{ filename: OUR_BUNDLE }, { filename: OUR_VENDOR }, { filename: OUR_BUNDLE }],
      "auto.browser.global_handlers.onerror",
    );
    expect(shouldSendSentryEvent(event)).toBe(true);
  });

  it("كل الإطارات صناعية → لا موضع رمي يُنسب إلينا", () => {
    const event = eventWith(
      [{ filename: "[native code]" }, { filename: "[wasm code]" }],
      "auto.browser.global_handlers.onerror",
    );
    expect(shouldSendSentryEvent(event)).toBe(false);
  });
});

describe("shouldSendSentryEvent — أخطاؤنا تمرّ", () => {
  it("خطأ في كود التطبيق", () => {
    const event = eventWith(
      [{ filename: OUR_VENDOR }, { filename: OUR_BUNDLE }],
      "auto.browser.global_handlers.onerror",
    );
    expect(shouldSendSentryEvent(event)).toBe(true);
  });

  it("chunk مفقود بعد النشر — إنذار «الشاشة البيضاء» يجب ألا يُكتم", () => {
    const event = eventWith(
      [{ filename: "https://sabq.org/assets/index-abc123.js" }],
      "auto.browser.global_handlers.onunhandledrejection",
    );
    expect(shouldSendSentryEvent(event)).toBe(true);
  });

  it("معاينة Cloudflare Pages من أصولنا", () => {
    const event = eventWith([{ filename: "https://abc.sabq-org.pages.dev/assets/index-x.js" }]);
    expect(shouldSendSentryEvent(event)).toBe(true);
  });

  it("غلاف كاباسيتور على iOS", () => {
    const event = eventWith([{ filename: "capacitor://localhost/assets/index-x.js" }]);
    expect(shouldSendSentryEvent(event)).toBe(true);
  });

  it("عامل blob: أنشأناه نحن", () => {
    const event = eventWith([{ filename: "blob:https://sabq.org/9f0c-uuid" }]);
    expect(shouldSendSentryEvent(event)).toBe(true);
  });

  it("موضع الرمي داخل [native code] لكن الإطار التالي من أصولنا", () => {
    const event = eventWith([{ filename: OUR_BUNDLE }, { filename: "[native code]" }]);
    expect(shouldSendSentryEvent(event)).toBe(true);
  });

  it("captureMessage صريح منّا: بلا مكدس وبلا آلية تلقائية → يمرّ", () => {
    expect(shouldSendSentryEvent(eventWith(undefined, "generic"))).toBe(true);
    expect(shouldSendSentryEvent(eventWith(undefined, undefined))).toBe(true);
  });

  it("حدث بلا exception إطلاقًا (رسالة) → يمرّ", () => {
    expect(shouldSendSentryEvent({})).toBe(true);
    expect(shouldSendSentryEvent({ exception: { values: [] } })).toBe(true);
  });
});

describe("المساعدات", () => {
  it("isAutoCapturedMechanism", () => {
    expect(isAutoCapturedMechanism("auto.browser.global_handlers.onerror")).toBe(true);
    expect(isAutoCapturedMechanism("auto.browser.browserapierrors.setInterval")).toBe(true);
    expect(isAutoCapturedMechanism("generic")).toBe(false);
    expect(isAutoCapturedMechanism(undefined)).toBe(false);
  });

  it("isFirstPartyFilename يقبل أصولنا وحدها", () => {
    expect(isFirstPartyFilename("https://sabq.org/assets/index-x.js")).toBe(true);
    expect(isFirstPartyFilename("https://cdn.sabq.org/assets/index-x.js")).toBe(true);
    expect(isFirstPartyFilename("https://abc.sabq-org.pages.dev/assets/index-x.js")).toBe(true);
    expect(isFirstPartyFilename("http://localhost:5173/src/main.tsx")).toBe(true);
    expect(isFirstPartyFilename("capacitor://localhost/assets/index-x.js")).toBe(true);
    expect(isFirstPartyFilename("blob:https://sabq.org/9f0c-uuid")).toBe(true);
  });

  it("isFirstPartyFilename لا يُخدع بمضيف يضع نطاقنا في مساره", () => {
    // النمط الطليق السابق كان يمرّر هذه — ثغرة تصنيف حقيقية
    expect(isFirstPartyFilename("https://evil.example/sabq.org/assets/index-x.js")).toBe(false);
    expect(isFirstPartyFilename("https://sabq.org.attacker.test/assets/index-x.js")).toBe(false);
    expect(isFirstPartyFilename("https://notsabq.org/assets/index-x.js")).toBe(false);
    expect(isFirstPartyFilename("https://sabq.org/other/index-x.js")).toBe(false);
    expect(isFirstPartyFilename(undefined)).toBe(false);
  });

  it("sentryBeforeSend يعيد الحدث أو null", () => {
    const keep = eventWith([{ filename: OUR_BUNDLE }]);
    const drop = eventWith([{ filename: "<anonymous>" }], "auto.browser.global_handlers.onerror");
    expect(sentryBeforeSend(keep)).toBe(keep);
    expect(sentryBeforeSend(drop)).toBeNull();
  });
});
