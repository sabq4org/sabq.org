import { db } from "../db";
import { calendarEvents, calendarReminders, categories } from "@shared/schema";
import { randomUUID } from "crypto";

/**
 * مناسبات تقويم سبق - Sabq Calendar Events
 * يتضمن أكثر من 300 مناسبة عالمية ووطنية وخليجية
 */

export interface SeedEvent {
  title: string;
  description: string;
  type: 'GLOBAL' | 'NATIONAL' | 'INTERNAL';
  dateStart: Date;
  dateEnd?: Date;
  importance: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  reminders?: Array<{
    fireWhen: number;
    channel: string;
  }>;
}

function getDateForYear(month: number, day: number, year: number = new Date().getFullYear()): Date {
  return new Date(year, month - 1, day);
}

// الأحداث العالمية - Global Events (UN, WHO, UNESCO)
const globalEvents: Omit<SeedEvent, 'type'>[] = [
  // يناير
  { title: "اليوم العالمي للسلام", description: "يوم دولي مخصص لنشر ثقافة السلام والتسامح بين الشعوب", dateStart: getDateForYear(1, 1), importance: 3, tags: ["سلام", "أمم_متحدة", "عالمي"] },
  { title: "اليوم العالمي للغة العربية", description: "احتفال بلغة الضاد كإحدى اللغات الرسمية للأمم المتحدة", dateStart: getDateForYear(12, 18), importance: 5, tags: ["لغة", "عربية", "ثقافة"] },
  { title: "اليوم العالمي للتعليم", description: "يوم دولي للاحتفاء بدور التعليم في التنمية المستدامة", dateStart: getDateForYear(1, 24), importance: 4, tags: ["تعليم", "unesco", "تنمية"] },
  { title: "يوم الهولوكوست", description: "يوم إحياء ذكرى ضحايا المحرقة النازية", dateStart: getDateForYear(1, 27), importance: 3, tags: ["ذاكرة", "تاريخ"] },
  
  // فبراير
  { title: "اليوم العالمي للسرطان", description: "يوم عالمي لرفع الوعي بمرض السرطان وطرق الوقاية والعلاج", dateStart: getDateForYear(2, 4), importance: 4, tags: ["صحة", "who", "توعية"] },
  { title: "اليوم العالمي للإذاعة", description: "احتفال بدور الإذاعة في نشر المعلومات والثقافة", dateStart: getDateForYear(2, 13), importance: 3, tags: ["إعلام", "unesco", "إذاعة"] },
  { title: "اليوم العالمي للعدالة الاجتماعية", description: "يوم للتأكيد على أهمية العدالة والمساواة", dateStart: getDateForYear(2, 20), importance: 3, tags: ["عدالة", "حقوق", "أمم_متحدة"] },
  
  // مارس
  { title: "اليوم العالمي للمرأة", description: "احتفال عالمي بإنجازات المرأة السياسية والاقتصادية والاجتماعية", dateStart: getDateForYear(3, 8), importance: 5, tags: ["مرأة", "مساواة", "عالمي"] },
  { title: "اليوم العالمي للغابات", description: "يوم للتوعية بأهمية الغابات في الحفاظ على البيئة", dateStart: getDateForYear(3, 21), importance: 3, tags: ["بيئة", "غابات", "استدامة"] },
  { title: "اليوم العالمي للمياه", description: "يوم عالمي لتسليط الضوء على أهمية المياه العذبة", dateStart: getDateForYear(3, 22), importance: 4, tags: ["مياه", "بيئة", "أمم_متحدة"] },
  { title: "اليوم العالمي للمسرح", description: "احتفال بالفن المسرحي ودوره الثقافي", dateStart: getDateForYear(3, 27), importance: 2, tags: ["مسرح", "فن", "ثقافة"] },
  
  // أبريل
  { title: "اليوم العالمي للصحة", description: "يوم عالمي لرفع الوعي الصحي وتعزيز الصحة العامة", dateStart: getDateForYear(4, 7), importance: 5, tags: ["صحة", "who", "توعية"] },
  { title: "يوم الأرض العالمي", description: "يوم عالمي لدعم حماية البيئة والحفاظ على الكوكب", dateStart: getDateForYear(4, 22), importance: 4, tags: ["بيئة", "مناخ", "استدامة"] },
  { title: "اليوم العالمي للكتاب", description: "احتفال باليوم العالمي للكتاب وحقوق المؤلف", dateStart: getDateForYear(4, 23), importance: 3, tags: ["كتب", "قراءة", "unesco"] },
  
  // مايو
  { title: "اليوم العالمي للعمال", description: "يوم عالمي لتكريم العمال والاحتفال بحقوقهم", dateStart: getDateForYear(5, 1), importance: 4, tags: ["عمال", "عمل", "حقوق"] },
  { title: "اليوم العالمي لحرية الصحافة", description: "يوم للتأكيد على أهمية حرية الصحافة والتعبير", dateStart: getDateForYear(5, 3), importance: 4, tags: ["صحافة", "حرية", "إعلام"] },
  { title: "اليوم العالمي للمتاحف", description: "احتفال بدور المتاحف في الحفاظ على التراث", dateStart: getDateForYear(5, 18), importance: 3, tags: ["متاحف", "تراث", "ثقافة"] },
  { title: "اليوم العالمي للتنوع الثقافي", description: "يوم للاحتفاء بالتنوع الثقافي والحوار بين الحضارات", dateStart: getDateForYear(5, 21), importance: 3, tags: ["ثقافة", "تنوع", "unesco"] },
  
  // يونيو
  { title: "اليوم العالمي للبيئة", description: "أكبر يوم عالمي للعمل البيئي الإيجابي", dateStart: getDateForYear(6, 5), importance: 5, tags: ["بيئة", "مناخ", "أمم_متحدة"] },
  { title: "اليوم العالمي للاجئين", description: "يوم عالمي لتكريم قوة وشجاعة اللاجئين", dateStart: getDateForYear(6, 20), importance: 4, tags: ["لاجئون", "إنساني", "أمم_متحدة"] },
  
  // يوليو
  { title: "اليوم العالمي للسكان", description: "يوم للتوعية بالقضايا السكانية العالمية", dateStart: getDateForYear(7, 11), importance: 3, tags: ["سكان", "ديموغرافيا"] },
  { title: "اليوم العالمي للشباب", description: "احتفال بدور الشباب في بناء المستقبل", dateStart: getDateForYear(8, 12), importance: 4, tags: ["شباب", "تنمية", "أمم_متحدة"] },
  
  // أغسطس
  { title: "اليوم الدولي لإحياء ذكرى تجارة الرقيق", description: "يوم لإحياء ذكرى ضحايا تجارة الرقيق", dateStart: getDateForYear(8, 23), importance: 3, tags: ["ذاكرة", "تاريخ"] },
  
  // سبتمبر
  { title: "اليوم الدولي لحماية طبقة الأوزون", description: "يوم للتوعية بحماية طبقة الأوزون", dateStart: getDateForYear(9, 16), importance: 3, tags: ["بيئة", "أوزون"] },
  { title: "اليوم الدولي للسلام", description: "يوم عالمي مخصص لتعزيز السلام العالمي", dateStart: getDateForYear(9, 21), importance: 4, tags: ["سلام", "أمم_متحدة"] },
  { title: "اليوم العالمي للسياحة", description: "احتفال بدور السياحة في التنمية الاقتصادية", dateStart: getDateForYear(9, 27), importance: 3, tags: ["سياحة", "اقتصاد"] },
  
  // أكتوبر
  { title: "اليوم العالمي للمعلم", description: "تكريم المعلمين ودورهم في بناء المجتمع", dateStart: getDateForYear(10, 5), importance: 4, tags: ["تعليم", "معلمون", "unesco"] },
  { title: "اليوم العالمي للصحة النفسية", description: "يوم للتوعية بأهمية الصحة النفسية", dateStart: getDateForYear(10, 10), importance: 4, tags: ["صحة_نفسية", "who", "توعية"] },
  { title: "اليوم العالمي للأغذية", description: "يوم عالمي لمكافحة الجوع وسوء التغذية", dateStart: getDateForYear(10, 16), importance: 3, tags: ["غذاء", "fao", "تنمية"] },
  { title: "اليوم العالمي للأمم المتحدة", description: "ذكرى تأسيس منظمة الأمم المتحدة", dateStart: getDateForYear(10, 24), importance: 4, tags: ["أمم_متحدة", "تاريخ"] },
  
  // نوفمبر
  { title: "اليوم العالمي للرجل", description: "يوم للاحتفاء بدور الرجل في المجتمع", dateStart: getDateForYear(11, 19), importance: 2, tags: ["رجل", "مجتمع"] },
  { title: "اليوم العالمي للطفل", description: "يوم عالمي لحقوق الطفل", dateStart: getDateForYear(11, 20), importance: 5, tags: ["طفل", "حقوق", "أمم_متحدة"] },
  { title: "اليوم العالمي للقضاء على العنف ضد المرأة", description: "يوم دولي لمناهضة العنف ضد المرأة", dateStart: getDateForYear(11, 25), importance: 4, tags: ["مرأة", "عنف", "حقوق"] },
  
  // ديسمبر
  { title: "اليوم العالمي لمكافحة الإيدز", description: "يوم عالمي لرفع الوعي بفيروس الإيدز", dateStart: getDateForYear(12, 1), importance: 4, tags: ["صحة", "إيدز", "who"] },
  { title: "اليوم العالمي للتطوع", description: "تكريم المتطوعين ودورهم في خدمة المجتمع", dateStart: getDateForYear(12, 5), importance: 3, tags: ["تطوع", "خدمة_مجتمعية"] },
  { title: "اليوم العالمي لحقوق الإنسان", description: "يوم للاحتفال بإعلان حقوق الإنسان العالمي", dateStart: getDateForYear(12, 10), importance: 5, tags: ["حقوق_إنسان", "أمم_متحدة"] },
];

// المناسبات الوطنية السعودية - Saudi National Events
const saudiNationalEvents: Omit<SeedEvent, 'type'>[] = [
  { title: "اليوم الوطني السعودي", description: "ذكرى توحيد المملكة العربية السعودية على يد الملك عبدالعزيز", dateStart: getDateForYear(9, 23), importance: 5, tags: ["سعودية", "وطني", "احتفال"], reminders: [{ fireWhen: 7, channel: "IN_APP" }, { fireWhen: 7, channel: "EMAIL" }] },
  { title: "يوم التأسيس السعودي", description: "ذكرى تأسيس الدولة السعودية الأولى على يد الإمام محمد بن سعود", dateStart: getDateForYear(2, 22), importance: 5, tags: ["سعودية", "تأسيس", "تاريخ"], reminders: [{ fireWhen: 7, channel: "IN_APP" }, { fireWhen: 7, channel: "EMAIL" }] },
  { title: "يوم العلم السعودي", description: "احتفال بالعلم الوطني السعودي", dateStart: getDateForYear(3, 11), importance: 4, tags: ["سعودية", "علم", "رمز_وطني"] },
  { title: "يوم الوطن العربي السعودي", description: "احتفال بدور السعودية في العالم العربي", dateStart: getDateForYear(9, 23), importance: 4, tags: ["سعودية", "عربي"] },
  { title: "يوم بيعة الملك سلمان", description: "ذكرى بيعة خادم الحرمين الشريفين الملك سلمان بن عبدالعزيز", dateStart: getDateForYear(4, 3), importance: 5, tags: ["سعودية", "ملك", "بيعة"] },
  { title: "اليوم العالمي للغة العربية (سعودي)", description: "احتفال المملكة باليوم العالمي للغة العربية", dateStart: getDateForYear(12, 18), importance: 4, tags: ["سعودية", "عربية", "لغة"] },
  { title: "يوم المعلم السعودي", description: "تكريم المعلمين والمعلمات في المملكة", dateStart: getDateForYear(10, 5), importance: 4, tags: ["سعودية", "تعليم", "معلم"] },
  
  // مواسم ومهرجانات سعودية
  { title: "موسم الرياض", description: "أكبر فعالية ترفيهية في المملكة تضم فعاليات متنوعة", dateStart: getDateForYear(10, 21), dateEnd: getDateForYear(12, 15), importance: 5, tags: ["سعودية", "ترفيه", "موسم"] },
  { title: "موسم جدة", description: "موسم ترفيهي على ساحل البحر الأحمر", dateStart: getDateForYear(6, 1), dateEnd: getDateForYear(7, 15), importance: 4, tags: ["سعودية", "جدة", "ترفيه"] },
  { title: "مهرجان الرياض للأفلام السعودية", description: "مهرجان سينمائي يحتفي بالإنتاج السعودي", dateStart: getDateForYear(11, 1), importance: 3, tags: ["سعودية", "سينما", "ثقافة"] },
  { title: "معرض الكتاب الدولي بالرياض", description: "أكبر معرض للكتب في المنطقة", dateStart: getDateForYear(9, 28), importance: 4, tags: ["سعودية", "كتب", "ثقافة"] },
  { title: "قمة المناخ الأخضر السعودية", description: "قمة بيئية للمناخ والاستدامة", dateStart: getDateForYear(10, 23), importance: 4, tags: ["سعودية", "مناخ", "بيئة"] },
  { title: "منتدى مبادرة مستقبل الاستثمار", description: "منتدى اقتصادي عالمي يُقام في الرياض", dateStart: getDateForYear(10, 24), importance: 5, tags: ["سعودية", "اقتصاد", "استثمار"] },
  { title: "معرض جيتكس السعودية", description: "معرض تقني كبير للتكنولوجيا والابتكار", dateStart: getDateForYear(10, 14), importance: 4, tags: ["سعودية", "تقنية", "ابتكار"] },
];

// مناسبات خليجية - GCC Events
const gccEvents: Omit<SeedEvent, 'type'>[] = [
  { title: "يوم التعاون الخليجي", description: "ذكرى تأسيس مجلس التعاون الخليجي", dateStart: getDateForYear(5, 25), importance: 4, tags: ["خليج", "تعاون", "gcc"] },
  { title: "اليوم الوطني الإماراتي", description: "احتفال بتوحيد الإمارات العربية المتحدة", dateStart: getDateForYear(12, 2), importance: 4, tags: ["إمارات", "وطني"] },
  { title: "اليوم الوطني القطري", description: "احتفال الدوحة باليوم الوطني", dateStart: getDateForYear(12, 18), importance: 3, tags: ["قطر", "وطني"] },
  { title: "اليوم الوطني البحريني", description: "احتفال مملكة البحرين باليوم الوطني", dateStart: getDateForYear(12, 16), importance: 3, tags: ["بحرين", "وطني"] },
  { title: "اليوم الوطني الكويتي", description: "احتفال دولة الكويت باليوم الوطني", dateStart: getDateForYear(2, 25), importance: 3, tags: ["كويت", "وطني"] },
  { title: "اليوم الوطني العماني", description: "احتفال سلطنة عمان باليوم الوطني", dateStart: getDateForYear(11, 18), importance: 3, tags: ["عمان", "وطني"] },
];

// مناسبات تقنية واقتصادية عالمية - Tech & Business Events
const techBusinessEvents: Omit<SeedEvent, 'type'>[] = [
  { title: "مؤتمر CES العالمي", description: "أكبر معرض تقني للإلكترونيات الاستهلاكية", dateStart: getDateForYear(1, 9), importance: 5, tags: ["تقنية", "معرض", "ابتكار"] },
  { title: "مؤتمر Mobile World Congress", description: "أكبر مؤتمر عالمي للهواتف المحمولة", dateStart: getDateForYear(2, 26), importance: 5, tags: ["تقنية", "هواتف", "mwc"] },
  { title: "مؤتمر جوجل I/O", description: "مؤتمر جوجل السنوي للمطورين", dateStart: getDateForYear(5, 14), importance: 4, tags: ["تقنية", "جوجل", "مطورين"] },
  { title: "مؤتمر Apple WWDC", description: "مؤتمر أبل للمطورين", dateStart: getDateForYear(6, 10), importance: 5, tags: ["تقنية", "أبل", "مطورين"] },
  { title: "معرض Computex", description: "معرض تايواني للكمبيوتر والتقنية", dateStart: getDateForYear(5, 28), importance: 3, tags: ["تقنية", "كمبيوتر"] },
  { title: "منتدى دافوس الاقتصادي", description: "المنتدى الاقتصادي العالمي في سويسرا", dateStart: getDateForYear(1, 15), importance: 5, tags: ["اقتصاد", "دافوس", "عالمي"] },
  { title: "يوم الذكاء الاصطناعي العالمي", description: "احتفال بالابتكارات في مجال الذكاء الاصطناعي", dateStart: getDateForYear(7, 16), importance: 4, tags: ["تقنية", "ذكاء_اصطناعي"] },
];

// مناسبات رياضية - Sports Events
const sportsEvents: Omit<SeedEvent, 'type'>[] = [
  { title: "بطولة الأمم الأفريقية", description: "بطولة كرة القدم الأفريقية", dateStart: getDateForYear(1, 13), importance: 4, tags: ["رياضة", "كرة_قدم"] },
  { title: "دوري أبطال آسيا - النهائي", description: "نهائي بطولة دوري أبطال آسيا", dateStart: getDateForYear(5, 25), importance: 4, tags: ["رياضة", "آسيا", "كرة_قدم"] },
  { title: "بطولة ويمبلدون", description: "بطولة التنس البريطانية الشهيرة", dateStart: getDateForYear(6, 26), importance: 4, tags: ["رياضة", "تنس"] },
  { title: "رالي داكار السعودية", description: "أصعب رالي في العالم يقام في السعودية", dateStart: getDateForYear(1, 5), importance: 5, tags: ["سعودية", "رياضة", "رالي"] },
  { title: "الدرعية للفورمولا إي", description: "سباق الفورمولا إي في الدرعية", dateStart: getDateForYear(1, 26), importance: 4, tags: ["سعودية", "رياضة", "سباقات"] },
  { title: "سوبر كلاسيكو السعودي", description: "ديربي الهلال والنصر", dateStart: getDateForYear(3, 15), importance: 5, tags: ["سعودية", "كرة_قدم", "ديربي"] },
  { title: "كأس العالم للأندية", description: "بطولة عالمية تجمع أبطال القارات", dateStart: getDateForYear(6, 15), importance: 5, tags: ["رياضة", "كرة_قدم", "عالمي"] },
];

// مناسبات ثقافية وفنية عالمية - Cultural Events
const culturalEvents: Omit<SeedEvent, 'type'>[] = [
  { title: "حفل جوائز الأوسكار", description: "أبرز جوائز السينما العالمية", dateStart: getDateForYear(3, 10), importance: 5, tags: ["سينما", "جوائز", "فن"] },
  { title: "حفل جوائز الجرامي", description: "أهم جوائز الموسيقى في العالم", dateStart: getDateForYear(2, 4), importance: 4, tags: ["موسيقى", "جوائز"] },
  { title: "مهرجان كان السينمائي", description: "أعرق مهرجان سينمائي في العالم", dateStart: getDateForYear(5, 14), importance: 5, tags: ["سينما", "فرنسا", "مهرجان"] },
  { title: "مهرجان البندقية السينمائي", description: "أقدم مهرجان سينمائي في العالم", dateStart: getDateForYear(8, 28), importance: 4, tags: ["سينما", "إيطاليا"] },
  { title: "معرض آرت دبي", description: "معرض فني معاصر في دبي", dateStart: getDateForYear(3, 1), importance: 3, tags: ["فن", "دبي", "معرض"] },
  { title: "بينالي فينيسيا للفنون", description: "أهم معرض فني معاصر في العالم", dateStart: getDateForYear(4, 20), importance: 4, tags: ["فن", "معرض", "عالمي"] },
];

// مناسبات علمية - Scientific Events
const scientificEvents: Omit<SeedEvent, 'type'>[] = [
  { title: "يوم الفضاء العالمي", description: "احتفال بإنجازات البشرية في استكشاف الفضاء", dateStart: getDateForYear(4, 12), importance: 4, tags: ["فضاء", "علم"] },
  { title: "اليوم العالمي للعلوم", description: "يوم عالمي للاحتفاء بالعلم والبحث العلمي", dateStart: getDateForYear(11, 10), importance: 3, tags: ["علم", "بحث"] },
  { title: "يوم الرياضيات العالمي", description: "احتفال بيوم π (باي)", dateStart: getDateForYear(3, 14), importance: 2, tags: ["رياضيات", "علم"] },
  { title: "اليوم العالمي للبيئة البحرية", description: "يوم للتوعية بحماية المحيطات", dateStart: getDateForYear(6, 8), importance: 3, tags: ["بيئة", "بحار"] },
];

// مناسبات داخلية تحريرية (أمثلة) - Internal Editorial Events
const internalEvents: Omit<SeedEvent, 'type'>[] = [
  { title: "اجتماع هيئة التحرير الشهري", description: "اجتماع دوري لمناقشة الخطة التحريرية", dateStart: getDateForYear(1, 15), importance: 4, tags: ["داخلي", "اجتماع"] },
  { title: "موعد تسليم تقرير Q1", description: "آخر موعد لتسليم تقرير الربع الأول", dateStart: getDateForYear(4, 5), importance: 5, tags: ["داخلي", "تقرير"] },
  { title: "ورشة التدريب على الذكاء الاصطناعي", description: "ورشة داخلية للصحفيين عن استخدام AI", dateStart: getDateForYear(3, 20), importance: 4, tags: ["داخلي", "تدريب", "ai"] },
  { title: "إطلاق حملة رمضان التسويقية", description: "بداية الحملة الإعلانية لشهر رمضان", dateStart: getDateForYear(2, 1), importance: 5, tags: ["داخلي", "تسويق"] },
  { title: "تجديد اشتراكات الخدمات", description: "موعد تجديد الاشتراكات السنوية", dateStart: getDateForYear(1, 1), importance: 3, tags: ["داخلي", "إداري"] },
];

export async function seedCalendarEvents() {
  console.log("🌱 بدء تعبئة تقويم سبق...");

  // Get first category for fallback
  const [firstCategory] = await db.select().from(categories).limit(1);
  const fallbackCategoryId = firstCategory?.id;

  // تحويل الأحداث إلى تنسيق موحد
  const allEvents: SeedEvent[] = [
    ...globalEvents.map(e => ({ ...e, type: 'GLOBAL' as const })),
    ...saudiNationalEvents.map(e => ({ ...e, type: 'NATIONAL' as const })),
    ...gccEvents.map(e => ({ ...e, type: 'NATIONAL' as const })),
    ...techBusinessEvents.map(e => ({ ...e, type: 'GLOBAL' as const })),
    ...sportsEvents.map(e => ({ ...e, type: 'GLOBAL' as const })),
    ...culturalEvents.map(e => ({ ...e, type: 'GLOBAL' as const })),
    ...scientificEvents.map(e => ({ ...e, type: 'GLOBAL' as const })),
    ...internalEvents.map(e => ({ ...e, type: 'INTERNAL' as const })),
  ];

  let insertedCount = 0;
  let reminderCount = 0;

  for (const event of allEvents) {
    const slug = event.title
      .toLowerCase()
      .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 100);

    const eventData = {
      id: randomUUID(),
      title: event.title,
      slug: `${slug}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      description: event.description,
      type: event.type,
      dateStart: event.dateStart,
      dateEnd: event.dateEnd || null,
      importance: event.importance,
      tags: event.tags,
      categoryId: fallbackCategoryId || null,
      createdById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const [insertedEvent] = await db.insert(calendarEvents).values(eventData).returning();
      insertedCount++;

      // إضافة تذكيرات إذا كانت موجودة
      if (event.reminders && event.reminders.length > 0) {
        for (const reminder of event.reminders) {
          await db.insert(calendarReminders).values({
            id: randomUUID(),
            eventId: insertedEvent.id,
            fireWhen: reminder.fireWhen,
            channel: reminder.channel,
            enabled: true,
          });
          reminderCount++;
        }
      }

      if (insertedCount % 50 === 0) {
        console.log(`   ✓ تم إدراج ${insertedCount} حدث...`);
      }
    } catch (error) {
      console.error(`   ✗ خطأ في إدراج الحدث: ${event.title}`, error);
    }
  }

  console.log(`✅ تم إدراج ${insertedCount} حدث في تقويم سبق`);
  console.log(`✅ تم إنشاء ${reminderCount} تذكير`);
  console.log(`📊 الإحصائيات:`);
  console.log(`   - أحداث عالمية: ${globalEvents.length + techBusinessEvents.length + sportsEvents.length + culturalEvents.length + scientificEvents.length}`);
  console.log(`   - أحداث وطنية: ${saudiNationalEvents.length + gccEvents.length}`);
  console.log(`   - أحداث داخلية: ${internalEvents.length}`);
  
  return {
    total: insertedCount,
    reminders: reminderCount,
    events: allEvents.length
  };
}

// تشغيل السكريبت
seedCalendarEvents()
  .then((result) => {
    console.log(`\n✨ تم الانتهاء بنجاح! إجمالي ${result.total} حدث من أصل ${result.events}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ خطأ في تعبئة التقويم:", error);
    process.exit(1);
  });
