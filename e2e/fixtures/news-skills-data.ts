import type { ArticleWithDetails, Category } from "@shared/schema";

const categoryShort = { id: "local", nameAr: "محليات", nameEn: "Local", slug: "local", color: "#167a68", isActive: true } as unknown as Category;
const categoryLong = { id: "long-category", nameAr: "الشؤون الاقتصادية والاستثمارية والتنمية المستدامة", nameEn: "Economy", slug: "economy", color: "#245a9c", isActive: true } as unknown as Category;
export const categories: Category[] = [categoryShort, categoryLong];

const base = {
  status: "published", authorId: "fixture-author", content: "نص تجريبي محلي لقياس العرض فقط.", excerpt: "ملخص قصير للخبر في معاينة محلية.",
  articleType: "news", newsType: "regular", views: 2840, commentsCount: 12, reactionsCount: 18,
  isFeatured: false, hideFromHomepage: false, language: "ar", createdAt: "2026-10-28T08:00:00.000Z",
  updatedAt: "2026-10-28T08:00:00.000Z", publishedAt: "2026-10-28T08:00:00.000Z", imageUrl: null,
} as const;
const placeholder = (label: string, width: number, height: number, color: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${color}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="white">${label}</text></svg>`)}`;
const landscape = placeholder("سبق", 640, 360, "#187966");
const portrait = placeholder("خبر", 240, 400, "#405e9a");

const demoTitles = ["تحديثات جديدة على شبكة النقل في الرياض", "وزارة التعليم تعلن مواعيد التسجيل للعام المقبل", "فريق الهلال يستعد لمواجهة الجولة القادمة", "طقس معتدل في معظم مناطق المملكة"];
const worstTitles = [
  "ولي العهد يطلق برنامجاً وطنياً جديداً لتعزيز الاستثمار والتنمية في مناطق المملكة خلال السنوات المقبلة",
  "MadinahRegionDevelopmentAuthority تعلن خطة تطوير محطة النقل الحضري وربطها بالمطار والوجهات التاريخية",
  "مجلس الوزراء يقرّ استراتيجية الشؤون الاقتصادية والاستثمارية والتنمية المستدامة ويكلف الجهات بإعلان الجداول التنفيذية",
  "عنوان موجز: أمطار مرتقبة في ثلاث مناطق",
  "وزارة الصحة تنشر مستجدات حملة التطعيم الموسمية وإرشادات حجز المواعيد عبر المنصة الوطنية الموحدة",
];

function createArticle(id: string, title: string, options: {
  long?: boolean; index?: number; demo?: boolean;
} = {}): ArticleWithDetails {
  const i = options.index ?? 0;
  return {
    ...base,
    id,
    title,
    slug: id,
    categoryId: options.long && i < 3 ? "long-category" : "local",
    category: options.long && i < 3 ? categoryLong : categoryShort,
    publishedAt: options.long && i === 8 ? null : base.publishedAt,
    imageUrl: options.long && i === 0 ? "/fixture-missing-news-image.jpg" : options.long && i === 1 ? portrait : options.long && i === 2 ? null : options.demo ? landscape : i % 3 === 1 ? portrait : null,
    excerpt: options.long && i === 0 ? "بوابة متابعة المبادرات https://sabq.org/news/saudi-investment-program/updates-and-announcements — تفاصيل تنفيذية وتحديثات متتابعة." : options.long && i === 2 ? null : base.excerpt,
    views: options.long && i === 0 ? 987654321 : options.long && i === 1 ? 1 : options.demo ? 284 : i % 7 === 0 ? 987654321 : 2840,
    commentsCount: options.long && i === 0 ? 1284999 : options.long && i === 1 ? 1 : options.demo ? 3 : 1284,
    reactionsCount: options.long && i === 0 ? 9999999 : options.demo ? 8 : 999999,
    isFeatured: options.long ? i % 4 === 0 : false,
  } as unknown as ArticleWithDetails;
}

export const datasets = {
  demo: demoTitles.map((title, index) => createArticle(`news-demo-${index + 1}`, title, { index, demo: true })),
  worst: Array.from({ length: 24 }, (_, index) => createArticle(`news-worst-${index + 1}`, worstTitles[index % worstTitles.length], { index, long: true })),
  empty: [] as ArticleWithDetails[],
  one: [createArticle("news-one", "خبر واحد", { demo: true })],
  huge: Array.from({ length: 1000 }, (_, index) => createArticle(`news-huge-${index + 1}`, demoTitles[index % demoTitles.length], { index, demo: true })),
};
