import { describe, expect, it } from "vitest";
import {
  isAutoCapturedMechanism,
  isFirstPartyFilename,
  isIgnoredClientErrorMessage,
  isClientNoiseException,
  shouldSendSentryEvent,
  sentryBeforeSend,
  SENTRY_DENY_URLS,
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
  extras?: { type?: string; value?: string },
): MinimalSentryEvent {
  return {
    exception: {
      values: [
        {
          type: extras?.type,
          value: extras?.value,
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

describe("ضجيج العميل غير القابل للإصلاح — يسقط ولو كان الإطار من حزمتنا", () => {
  it("JAVASCRIPT-REACT-3F/3G/3H: مهلة المكونات الاصطناعية فقط تسقط", () => {
    const expectedDeadline = eventWith(
      [{ filename: OUR_BUNDLE }],
      "auto.browser.global_handlers.onunhandledrejection",
      { type: "SabqQueryDeadlineError", value: "Request timed out" },
    );
    const realBrowserTimeout = eventWith(
      [{ filename: OUR_BUNDLE }],
      "auto.browser.global_handlers.onunhandledrejection",
      { type: "TimeoutError", value: "Request timed out" },
    );
    const unrelatedSameType = eventWith(
      [{ filename: OUR_BUNDLE }],
      "auto.browser.global_handlers.onunhandledrejection",
      { type: "SabqQueryDeadlineError", value: "Different failure" },
    );

    expect(shouldSendSentryEvent(expectedDeadline)).toBe(false);
    expect(shouldSendSentryEvent(realBrowserTimeout)).toBe(true);
    expect(shouldSendSentryEvent(unrelatedSameType)).toBe(true);
    expect(isIgnoredClientErrorMessage("Request timed out")).toBe(false);
  });

  it("JAVASCRIPT-REACT-2T: تم فقدان اتصال الشبكة (سفاري معرّب)", () => {
    // https://sabq.sentry.io/issues/7619514545/
    const event = eventWith(
      [{ filename: OUR_BUNDLE }],
      "auto.browser.global_handlers.onunhandledrejection",
      { type: "TypeError", value: "تم فقدان اتصال الشبكة." },
    );
    expect(shouldSendSentryEvent(event)).toBe(false);
    expect(isIgnoredClientErrorMessage("تم فقدان اتصال الشبكة.")).toBe(true);
    expect(isIgnoredClientErrorMessage("تم فقدان اتصال الشبكة")).toBe(true);
  });

  it("The network connection was lost — النسخة الإنجليزية لنفس خطأ WebKit", () => {
    const event = eventWith(
      [{ filename: OUR_BUNDLE }],
      "auto.browser.global_handlers.onerror",
      { type: "TypeError", value: "The network connection was lost." },
    );
    expect(shouldSendSentryEvent(event)).toBe(false);
    expect(isIgnoredClientErrorMessage("The Internet connection appears to be offline.")).toBe(
      true,
    );
  });

  it("JAVASCRIPT-REACT-2W: AbortError signal is aborted without reason", () => {
    const event = eventWith(
      [{ filename: OUR_VENDOR }],
      "auto.browser.global_handlers.onunhandledrejection",
      { type: "AbortError", value: "signal is aborted without reason" },
    );
    expect(shouldSendSentryEvent(event)).toBe(false);
  });

  it("TypeError cancelled / مُلغى — إلغاء fetch عند مغادرة الصفحة", () => {
    expect(
      shouldSendSentryEvent(
        eventWith([{ filename: OUR_BUNDLE }], "auto.browser.global_handlers.onerror", {
          type: "TypeError",
          value: "cancelled",
        }),
      ),
    ).toBe(false);
    expect(
      shouldSendSentryEvent(
        eventWith([{ filename: OUR_BUNDLE }], "auto.browser.global_handlers.onerror", {
          type: "TypeError",
          value: "مُلغى",
        }),
      ),
    ).toBe(false);
    // كلمة cancelled داخل رسالة حقيقية لا تُسقط
    expect(isIgnoredClientErrorMessage("request was cancelled by editor")).toBe(false);
  });

  it("Failed to fetch لمضيف طرف ثالث يسقط، وفشل استيراد الـchunk يمرّ", () => {
    expect(
      isIgnoredClientErrorMessage("Failed to fetch (pagead2.googlesyndication.com)"),
    ).toBe(true);
    expect(isIgnoredClientErrorMessage("Failed to fetch (www.google.com)")).toBe(true);
    expect(isIgnoredClientErrorMessage("Failed to fetch (www.google-analytics.com)")).toBe(true);
    expect(isIgnoredClientErrorMessage("Load failed (cdn.sabq.org)")).toBe(true);
    // إنذار الشاشة البيضاء بعد النشر — بلا لاحقة (host)
    expect(
      isIgnoredClientErrorMessage("Failed to fetch dynamically imported module: /assets/x.js"),
    ).toBe(false);
    expect(
      shouldSendSentryEvent(
        eventWith([{ filename: OUR_BUNDLE }], "auto.browser.global_handlers.onunhandledrejection", {
          type: "TypeError",
          value: "Failed to fetch dynamically imported module: https://sabq.org/assets/x.js",
        }),
      ),
    ).toBe(true);
    // فشل نحو API سبق بدون لاحقة مضيف خارجي يمرّ
    expect(isIgnoredClientErrorMessage("Failed to fetch")).toBe(false);
  });

  it("NotAllowedError — رفض إذن المتصفح بالنوع لا بالنص", () => {
    expect(
      isClientNoiseException({
        type: "NotAllowedError",
        value: "The request is not allowed by the user agent or the platform in the current context.",
      }),
    ).toBe(true);
    expect(
      shouldSendSentryEvent(
        eventWith([{ filename: OUR_BUNDLE }], "auto.browser.global_handlers.onerror", {
          type: "NotAllowedError",
          value: "play() failed because the user didn't interact with the document first.",
        }),
      ),
    ).toBe(false);
  });

  it("إضافات المتصفح: xbrowser و selector is not defined", () => {
    expect(isIgnoredClientErrorMessage("xbrowser is not defined")).toBe(true);
    expect(isIgnoredClientErrorMessage("Can't find variable: xbrowser")).toBe(true);
    expect(isIgnoredClientErrorMessage("selector is not defined")).toBe(true);
    expect(isIgnoredClientErrorMessage("Can't find variable: selector")).toBe(true);
    expect(
      shouldSendSentryEvent(
        eventWith([{ filename: OUR_BUNDLE }], "auto.browser.global_handlers.onerror", {
          type: "ReferenceError",
          value: "selector is not defined",
        }),
      ),
    ).toBe(false);
  });

  it("querySelectorAll على undefined من سكربت مجهول يسقط، ومن حزمتنا يمرّ", () => {
    const fromAnonymous = eventWith(
      [{ filename: "<anonymous>" }],
      "auto.browser.global_handlers.onerror",
      {
        type: "TypeError",
        value: "Cannot read properties of undefined (reading 'querySelectorAll')",
      },
    );
    const fromOurCode = eventWith(
      [{ filename: OUR_BUNDLE }],
      "auto.browser.global_handlers.onerror",
      {
        type: "TypeError",
        value: "Cannot read properties of undefined (reading 'querySelectorAll')",
      },
    );
    expect(shouldSendSentryEvent(fromAnonymous)).toBe(false);
    expect(shouldSendSentryEvent(fromOurCode)).toBe(true);
  });

  it("خطأ تطبيق حقيقي لا تطابقه القائمة يمرّ", () => {
    expect(isIgnoredClientErrorMessage("Cannot read properties of undefined (reading 'id')")).toBe(
      false,
    );
    expect(isClientNoiseException({ type: "TypeError", value: "foo is not a function" })).toBe(
      false,
    );
  });

  it("denyUrls يغطي إعلانات وتحليلات Google وإضافات المتصفح", () => {
    const matchesDeny = (url: string) => SENTRY_DENY_URLS.some((pattern) => pattern.test(url));
    expect(matchesDeny("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js")).toBe(
      true,
    );
    expect(matchesDeny("https://www.google-analytics.com/g/collect")).toBe(true);
    expect(matchesDeny("https://www.googletagmanager.com/gtm.js")).toBe(true);
    expect(matchesDeny("chrome-extension://abcd/inject.js")).toBe(true);
    expect(matchesDeny("https://sabq.org/assets/index.js")).toBe(false);
  });
});
