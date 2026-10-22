import { describe, expect, it } from "vitest";
import { normalizeArabicTitle, serviceLinkForArticle, withServiceLinkHtml } from "@shared/servicePages/articleLink";

// عناوين حقيقية من أرشيف سبق (بحث 2026-10-22).
const MATCHES: [string, string][] = [
  ["حساب المواطن يودع 3 مليارات ريال لمستفيدي دفعة سبتمبر", "citizen-account-date"],
  ["\"حساب المواطن\" يُودع دعم ديسمبر شـاملاً الإضافي في حسابات المستفيدين", "citizen-account-date"],
  ["حساب المواطن يعلن نتائج الأهلية للدورة 99 لشهر فبراير 2026", "citizen-account-date"],
  ["\"الحربي\": دمج الضمان وحساب المواطن خطوة نحو دعم أكثر كفاءة وعدالة", "citizen-account-date"],
  ["الضمان الاجتماعي والتمكين يعلن تقديم موعد صرف المعاش إلى 25 مايو", "social-security-date"],
  ["غداً الأربعاء.. صرف معاش الضمان الاجتماعي للدفعة 40", "social-security-date"],
  ["\"الموارد البشرية\" لـ\"سبق\": معاشات الضمان الاجتماعي تُصرف بهذه الآلية إذا صادفت عطلة نهاية الأسبوع", "social-security-date"],
  ["خادم الحرمين الشريفين بناءً على ما عرضه سمو ولي العهد يوجه بصرف أكثر من ثلاثة مليارات ريال معونة شهر رمضان لمستفيدي الضمان الاجتماعي", "social-security-date"],
  ["التأمينات الاجتماعية تؤكد صرف معاشات التقاعد في موعدها المحدد", "pensions-date"],
  ["التأمينات الاجتماعية تقدم موعد صرف معاشات المتقاعدين للخميس 27 رمضان", "pensions-date"],
  ["بمنظومة رقمية متكاملة.. صرف معاشات سبتمبر بأكثر من 12 مليار ريال", "pensions-date"],
  ["تقديم موعد صرف رواتب موظفي الدولة إلى الخميس القادم بدلاً من الجمعة", "government-salaries-date"],
  ["رسمياً.. تقديم موعد صرف رواتب موظفي الدولة لشهر مارس إلى 25 رمضان", "government-salaries-date"],
  ["تعليم الرياض يُعلن مواعيد الإجازات الإضافية للعام الدراسي 1448-1449هـ", "school-calendar-date"],
  ["23 يومًا إجازة عيد الفطر للطلاب والمعلمين وفق تقويم 1447هـ", "school-calendar-date"],
  ["عودة أكثر من ربع مليون طالب وطالبة إلى 1700 مدرسة بالطائف بعد إجازة عيد الأضحى", "school-calendar-date"],
  ["جدل واسع بعد مقترح «إخراج رمضان من التقويم الدراسي» للمسند", "school-calendar-date"],
];

const NO_MATCH = [
  // الضمان والتأمينات بلا صرف
  "تعيين مزهية الدوسري مديرةً لمكتب الضمان الاجتماعي بالأفلاج",
  "الضمان الاجتماعي يجدد دعوته للاستفادة من خصم 50% على حليب الأطفال",
  "التأمينات الاجتماعية تطلق حملة توعوية لقطاع الحراسات الأمنية بمشاركة 3 جهات",
  "\"التأمينات الاجتماعية\" تطلق خدمة الدفع التلقائي لتحسين تجربة أصحاب العمل وتعزيز التزامهم التأميني",
  // «المصرفية» ليست «صرف»
  "لجنة الإعلام والتوعية المصرفية تعزّز الوعي المالي لما بعد التقاعد بمحاضرة موجهة لمستفيدي \"برنامج تقدير\"",
  "تعليم الرياض توضح مواعيد وإجراءات التقاعد المبكر للمعلمين والمعلمات",
  "ابتدائية الإمام البخاري تحتفي بتقاعد معلمين بعد مسيرة عطاء في تعليم الطائف",
  // رواتب غير رواتب موظفي الدولة
  "السعودية تعلن دعماً مالياً جديداً لليمن يشمل تعزيز الميزانية وصرف رواتب الموظفين لتخفيف الأعباء المعيشية",
  "بعد قفزة الرواتب.. مدفوعات نقاط البيع تتراجع 18% إلى 13.5 مليار ريال وتبقى أعلى من مستواها قبل الصرف",
  "حماية الأجور يوثّق رواتب 10 ملايين عامل بـ17 مليون ملف في 2025",
  // إجازات غير مدرسية، أو جامعية
  " \"الموارد البشرية\": 4 ضوابط لتأجيل الإجازة السنوية.. والحد الأقصى نهاية السنة التالية",
  "أمير منطقة الرياض يوجه بالاستمرار في العمل خلال إجازة عيد الأضحى",
  "جمعية سمو بالقنفذة تمنح إجازة قرآنية بسند متصل إلى النبي للقارئ \"القوزي\"",
  "جامعة شقراء تعلن التقويم الأكاديمي للفصل الأول 1448.. 19 أسبوعًا دراسيًا ومواعيد الإجازات والاختبارات",
  "",
];

describe("service page link inside an article", () => {
  it.each(MATCHES)("links «%s» to %s", (title, id) => {
    const link = serviceLinkForArticle({ title, categorySlug: "saudi", articleType: "news" });
    expect(link?.id).toBe(id);
    expect(link?.path).toBe(`/services/${id}`);
    expect(link?.label.startsWith("موعد")).toBe(true);
  });

  it.each(NO_MATCH)("leaves «%s» without a link", (title) => {
    expect(serviceLinkForArticle({ title, categorySlug: "saudi" })).toBeNull();
  });

  it("skips opinion pieces and the world and sports sections", () => {
    const title = "حساب المواطن يودع 3 مليارات ريال لمستفيدي دفعة سبتمبر";
    expect(serviceLinkForArticle({ title, articleType: "opinion" })).toBeNull();
    expect(serviceLinkForArticle({ title, categorySlug: "world" })).toBeNull();
    expect(serviceLinkForArticle({ title, categorySlug: "sports" })).toBeNull();
    expect(serviceLinkForArticle({ title, categorySlug: null })?.seriesSlug).toBe("citizen-account");
  });

  it("ignores diacritics, tatweel and hamza forms", () => {
    expect(normalizeArabicTitle("يُودِع  إيداع شـاملاً")).toBe("يودع ايداع شاملا");
  });
});

describe("service page link in the search engine copy", () => {
  const title = "حساب المواطن يودع 3 مليارات ريال لمستفيدي دفعة سبتمبر";

  it("appends one plain link paragraph after the article body", () => {
    const html = withServiceLinkHtml("<p>نص الخبر</p>", { title, categorySlug: "saudi", articleType: "news" });
    expect(html).toBe(
      '<p>نص الخبر</p>\n<p><a href="/services/citizen-account-date">موعد صرف حساب المواطن القادم</a></p>',
    );
  });

  it("leaves the body alone when the title has no service or the link is already there", () => {
    const body = '<p>انظر <a href="/services/citizen-account-date">موعد الصرف</a></p>';
    expect(withServiceLinkHtml(body, { title })).toBe(body);
    expect(withServiceLinkHtml("<p>نص</p>", { title: "أمير منطقة الرياض يستقبل السفير" })).toBe("<p>نص</p>");
    expect(withServiceLinkHtml("<p>نص</p>", { title, articleType: "opinion" })).toBe("<p>نص</p>");
  });
});
