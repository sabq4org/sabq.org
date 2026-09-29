// رسائل عربية لكل سبب فشل في التوليد التلقائي للصور — كان المحرر يرى ردّ 400 خامًا
// بالإنجليزية حتى حين كان السبب نفاد رصيد مزوّد الصور. لا 429/502/503/504 هنا:
// apiRequest في الواجهة يستبدل بها رسالة عامة فتضيع رسالتنا.

export interface AutoImageFailure {
  status: number;
  message: string;
}

const AUTO_IMAGE_FAILURES: Record<string, AutoImageFailure> = {
  DISABLED: { status: 400, message: "التوليد التلقائي للصور معطّل من الإعدادات." },
  ARTICLE_TYPE_NOT_ENABLED: { status: 400, message: "التوليد التلقائي غير مفعّل لهذا النوع من المحتوى في الإعدادات." },
  CATEGORY_SKIPPED: { status: 400, message: "هذا التصنيف مستثنى من التوليد التلقائي في الإعدادات." },
  MONTHLY_LIMIT_REACHED: { status: 400, message: "بلغ التوليد التلقائي حدّه الشهري المحدد في الإعدادات." },
  QUOTA_EXCEEDED: {
    status: 402,
    message: "تعذّر توليد الصورة: نفد رصيد خدمة توليد الصور (Google Gemini). يلزم شحن الرصيد من حساب الفوترة ثم إعادة المحاولة.",
  },
  AUTH_ERROR: { status: 500, message: "تعذّر توليد الصورة: مفتاح خدمة توليد الصور غير صالح أو منتهٍ. راجع إعدادات المفتاح." },
  RATE_LIMITED: { status: 500, message: "خدمة توليد الصور مشغولة حاليًا. أعد المحاولة بعد دقيقة." },
  CONTENT_FILTER: { status: 422, message: "رفضت خدمة التوليد هذا الطلب لأسباب تتعلق بسياسة المحتوى. عدّل العنوان أو اختر نمطًا آخر." },
};

// Gemini يعيد «exceeded its monthly spending cap» حين يبلغ المشروع سقف الإنفاق الذي
// ضبطه صاحب الحساب في AI Studio — الرصيد موجود، والحل رفع السقف لا الشحن.
const SPEND_CAP_FAILURE: AutoImageFailure = {
  status: 402,
  message:
    "تعذّر توليد الصورة: بلغ مشروع خدمة توليد الصور (Google Gemini) سقف الإنفاق الشهري المحدد في Google AI Studio. يلزم رفع السقف من صفحة Spend في AI Studio ثم إعادة المحاولة.",
};

const AUTO_IMAGE_GENERIC_FAILURE: AutoImageFailure = {
  status: 500,
  message: "تعذّر توليد الصورة بسبب خطأ في خدمة التوليد. أعد المحاولة لاحقًا.",
};

export function autoImageFailure(errorCode: string | undefined, error: string | undefined): AutoImageFailure {
  if (errorCode === "QUOTA_EXCEEDED" && /spend(ing)? cap/i.test(error || "")) return SPEND_CAP_FAILURE;
  const failure = (errorCode && AUTO_IMAGE_FAILURES[errorCode]) || AUTO_IMAGE_GENERIC_FAILURE;
  // رسائل nanoBanana العربية (رفض المحتوى، ردّ بلا صورة) أدق من الرسالة العامة
  if (failure === AUTO_IMAGE_GENERIC_FAILURE && /[؀-ۿ]/.test(error || "")) {
    return { status: failure.status, message: error! };
  }
  return failure;
}
