/**
 * مواعيدك — أنواع وثوابت مشتركة بين الخدمة والصفحة والاختبارات.
 * الأوقات كلها أيام مدنية بتوقيت آسيا/الرياض، بلا توقيت صيفي.
 */

export const MAWAEED_TIMEZONE = "Asia/Riyadh";

export const SERIES_KINDS = [
  "school_holiday",
  "salary",
  "citizen_account",
  "social_security",
  "pension",
] as const;
export type SeriesKind = (typeof SERIES_KINDS)[number];

export const CERTAINTIES = ["confirmed", "expected", "unverified"] as const;
export type Certainty = (typeof CERTAINTIES)[number];

export const OCCURRENCE_STATUSES = ["scheduled", "cancelled", "superseded"] as const;
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

export const REGION_GROUPS = ["all", "riyadh_most", "western"] as const;
export type RegionGroup = (typeof REGION_GROUPS)[number];

export const REGIONS = [
  { id: "riyadh", label: "الرياض", group: "riyadh_most" },
  { id: "makkah", label: "مكة المكرمة", group: "western" },
  { id: "madinah", label: "المدينة المنورة", group: "western" },
  { id: "jeddah", label: "جدة", group: "western" },
  { id: "taif", label: "الطائف", group: "western" },
] as const;
export type RegionId = (typeof REGIONS)[number]["id"];

export const EXPECTED_HINT =
  "متوقع: محسوب من الجدول المعتاد للجهة إلى أن يصدر الإعلان الرسمي.";

export const SEEDED_CONTENT_UPDATED_AT = "2026-09-27T00:00:00.000+03:00";

export type SeriesRecord = {
  id: string;
  slug: string;
  kind: SeriesKind;
  titleAr: string;
  summaryAr: string;
  sortOrder: number;
  published: boolean;
  contentUpdatedAt: string;
};

export type OccurrenceRecord = {
  id: string;
  seriesId: string;
  titleAr: string;
  startsOn: string;
  endsOn: string | null;
  sourceUrl: string;
  sourceTitle: string;
  certainty: Certainty;
  status: OccurrenceStatus;
  published: boolean;
  regionGroup: RegionGroup;
  hijriLabel: string | null;
  publicNote: string | null;
  ruleNote: string | null;
};

export type SeriesCopy = {
  slug: string;
  kind: SeriesKind;
  sortOrder: number;
  titleAr: string;
  summaryAr: string;
  seoTitle: string;
  seoDescription: string;
  h1: string;
};

export const HOME_COPY = {
  slug: "",
  seoTitle: "مواعيدك: كم باقي على الإجازة والراتب وحساب المواطن؟ | سبق",
  seoDescription:
    "عدّاد محدَّث لأقرب إجازة مدرسية وموعد الرواتب وإيداع حساب المواطن والضمان المطوّر ومعاشات التقاعد، بالتاريخين الهجري والميلادي ورابط المصدر الرسمي.",
  h1: "مواعيدك: أقرب موعد يهمّك… وكم باقي عليه",
};

export const SERIES_CATALOG: SeriesCopy[] = [
  {
    slug: "school-calendar-1448",
    kind: "school_holiday",
    sortOrder: 1,
    titleAr: "التقويم الدراسي 1448",
    summaryAr:
      "إجازات العام الدراسي 1448-1449هـ حسب وزارة التعليم. الإجازات الإضافية تختلف بين المناطق، والافتراضي هنا الرياض.",
    seoTitle: "التقويم الدراسي 1448: موعد أقرب إجازة وكم باقي عليها | سبق",
    seoDescription:
      "كل إجازات العام الدراسي 1448-1449هـ حسب وزارة التعليم: الإضافية والخريف ومنتصف العام والأعياد ونهاية العام، مع عدّاد تنازلي وتاريخ هجري وميلادي.",
    h1: "التقويم الدراسي 1448: أقرب إجازة وكم باقي عليها",
  },
  {
    slug: "citizen-account",
    kind: "citizen_account",
    sortOrder: 2,
    titleAr: "حساب المواطن",
    summaryAr:
      "موعد إيداع دعم حساب المواطن. اليوم المعتاد هو 10 من الشهر الميلادي حسب سجل إيداعات البرنامج، ويُحدَّث عند إعلان الدفعة.",
    seoTitle: "موعد إيداع حساب المواطن للدفعة القادمة وكم باقي | سبق",
    seoDescription:
      "متى ينزل حساب المواطن هذا الشهر؟ موعد الدفعة القادمة ورقمها بالتاريخين الهجري والميلادي، مع عدّاد تنازلي ورابط الإعلان الرسمي للبرنامج.",
    h1: "موعد إيداع حساب المواطن وكم باقي",
  },
  {
    slug: "salaries",
    kind: "salary",
    sortOrder: 3,
    titleAr: "رواتب موظفي الدولة",
    summaryAr:
      "موعد صرف رواتب موظفي الدولة المدنيين والعسكريين حسب جدول وزارة المالية: يوم 27 ميلادي، وإن وافق الجمعة فالخميس قبله، وإن وافق السبت فالأحد بعده. معاشات المتقاعدين في قسم التقاعد.",
    seoTitle: "موعد نزول الرواتب هذا الشهر وكم باقي على الراتب | سبق",
    seoDescription:
      "متى تنزل رواتب موظفي الدولة المدنيين والعسكريين؟ موعد الراتب القادم حسب جدول وزارة المالية، وماذا يحدث إذا وافق يوم 27 عطلة، مع عدّاد تنازلي.",
    h1: "موعد رواتب موظفي الدولة وكم باقي",
  },
  {
    slug: "social-security",
    kind: "social_security",
    sortOrder: 4,
    titleAr: "الضمان الاجتماعي المطوّر",
    summaryAr:
      "حسب وزارة الموارد البشرية: تُعلن الأهلية يوم 27 من كل شهر ميلادي، ويُصرف المعاش للمؤهلين في اليوم الأول من الشهر.",
    seoTitle: "موعد نزول الضمان الاجتماعي المطوّر وكم باقي | سبق",
    seoDescription:
      "متى يُصرف معاش الضمان الاجتماعي المطور هذا الشهر؟ موعد الصرف وموعد إعلان الأهلية حسب وزارة الموارد البشرية، مع عدّاد تنازلي.",
    h1: "موعد الضمان الاجتماعي المطوّر وكم باقي",
  },
  {
    slug: "pensions",
    kind: "pension",
    sortOrder: 5,
    titleAr: "معاشات التقاعد",
    summaryAr:
      "مواعيد صرف معاشات التقاعد المدني والعسكري والتأمينات الاجتماعية حسب جدول المؤسسة العامة للتأمينات الاجتماعية.",
    seoTitle: "موعد صرف رواتب المتقاعدين (التأمينات الاجتماعية) وكم باقي | سبق",
    seoDescription:
      "متى تُصرف معاشات التقاعد المدني والعسكري والتأمينات؟ مواعيد الصرف من المؤسسة العامة للتأمينات الاجتماعية، مع عدّاد تنازلي وتاريخ هجري وميلادي.",
    h1: "موعد معاشات التقاعد وكم باقي",
  },
];

export function catalogBySlug(slug: string): SeriesCopy | undefined {
  return SERIES_CATALOG.find((item) => item.slug === slug);
}

export function pastWord(kind: SeriesKind): string {
  return kind === "school_holiday" ? "انتهت" : "صُرفت";
}

export function todayWord(kind: SeriesKind): string {
  return kind === "school_holiday" ? "تبدأ اليوم" : "تُصرف اليوم";
}

export function certaintyLabel(certainty: Certainty): string {
  if (certainty === "expected") return "متوقع";
  if (certainty === "unverified") return "بانتظار التحقق";
  return "مؤكد";
}

export function normalizeRegion(raw: string | null | undefined): RegionId {
  const id = (raw || "").trim().toLowerCase();
  const found = REGIONS.find((region) => region.id === id);
  return found ? found.id : "riyadh";
}

export function regionMeta(id: RegionId): (typeof REGIONS)[number] {
  return REGIONS.find((region) => region.id === id) ?? REGIONS[0];
}

export function occurrenceVisibleInRegion(group: RegionGroup, region: RegionId): boolean {
  if (group === "all") return true;
  return group === regionMeta(region).group;
}

export function isPublicOccurrence(row: Pick<OccurrenceRecord, "published" | "status" | "certainty">): boolean {
  return row.published && row.status === "scheduled" && row.certainty !== "unverified";
}

export function regionGroupForSeed(section: string, name: string): RegionGroup {
  if (section !== "school-calendar-1448") return "all";
  if (name.includes("مكة") || name.includes("الطائف") || name.includes("جدة")) return "western";
  if (name.includes("إضافية")) return "riyadh_most";
  return "all";
}

export function classifySeed(confidence: string, note: string): { published: boolean; certainty: Certainty } {
  if (confidence.trim() === "يحتاج تحقق") {
    return { published: false, certainty: "unverified" };
  }
  if (note.includes("محسوب")) {
    return { published: true, certainty: "expected" };
  }
  return { published: true, certainty: "confirmed" };
}

export function seedKey(section: string, date: string, name: string): string {
  return `${section}|${date}|${name}`;
}

export function schoolBucket(title: string, regionGroup: RegionGroup): "extra" | "year" | "official" {
  if (regionGroup !== "all") return "extra";
  if (/نهاية العام|عودة المعلمين|عودة الطلاب|بداية العام/.test(title)) return "year";
  return "official";
}

export function visionNote(title: string, note: string | null): string | null {
  const blob = `${title} ${note || ""}`;
  if (/عيد الفطر|عيد الأضحى|رمضان/.test(blob)) {
    return "موعد العيد يثبت بالرؤية، وقد تقدّم الجهة الصرف أو تؤخره عن هذا اليوم.";
  }
  return null;
}

export function extendedHolidayNote(note: string | null): string | null {
  if (!note || !note.includes("مطول")) return null;
  const idx = note.indexOf("تصنع");
  if (idx >= 0) return note.slice(idx).replace(/\s+/g, " ").trim();
  return "تصنع عطلة مطوّلة مع نهاية الأسبوع.";
}

const PUBLIC_FIELDS = [
  "titleAr",
  "startsOn",
  "endsOn",
  "sourceUrl",
  "sourceTitle",
  "certainty",
  "status",
  "published",
  "regionGroup",
  "hijriLabel",
  "publicNote",
] as const;

export type PublicSnapshot = Record<(typeof PUBLIC_FIELDS)[number], string | boolean | null>;

export function publicSnapshot(row: OccurrenceRecord | null): PublicSnapshot | null {
  if (!row) return null;
  return {
    titleAr: row.titleAr,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    sourceUrl: row.sourceUrl,
    sourceTitle: row.sourceTitle,
    certainty: row.certainty,
    status: row.status,
    published: row.published,
    regionGroup: row.regionGroup,
    hijriLabel: row.hijriLabel,
    publicNote: row.publicNote,
  };
}

export function planOccurrenceWrite(before: OccurrenceRecord | null, after: OccurrenceRecord): {
  action: "create" | "update";
  publicChanged: boolean;
  before: PublicSnapshot | null;
  after: PublicSnapshot;
} {
  const beforePublic = publicSnapshot(before);
  const afterPublic = publicSnapshot(after)!;
  const publicChanged = JSON.stringify(beforePublic) !== JSON.stringify(afterPublic);
  return {
    action: before ? "update" : "create",
    publicChanged,
    before: beforePublic,
    after: afterPublic,
  };
}
