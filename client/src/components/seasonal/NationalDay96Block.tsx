import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatRelativeTime } from "@/lib/format";

// بلوك «اليوم الوطني الـ96» للرئيسية — هوية «عزّنا بطبعنا» الداكنة، جزيرة
// مستقلة بألوان ثابتة في الوضعين الفاتح والداكن (مثل سمة الهيدر عمدًا).
//
// وضع الإنتاج (بدون props): يجلب /api/national-day-block ويخفي نفسه تمامًا
// عندما يرجع isVisible=false (معطّل، خارج نافذة الموسم، أو بلا أخبار مطابقة).
// المحتوى = المثبّت يدويًا أولًا ثم المكتشف تلقائيًا بالكلمات المفتاحية،
// ويُدار كاملًا من لوحة التحكم /dashboard/national-day-block.
//
// وضع المعاينة (previewArticles): يتجاوز الجلب ويعرض دائمًا — تستخدمه
// صفحة /nd96-preview بعناوين تجريبية.

const INK = "#EDF5F0";
const MUTED = "#9CBCB0";
const PANEL = "#0A2C25";
const LINE = "#175044";
const GREEN_BRIGHT = "#5BD095";
const BLOCK_BG = "#06251F";

// تدرّجات بديلة للأخبار بلا صورة — تدور بالتناوب
const FALLBACK_GRADIENTS = [
  "linear-gradient(135deg,#0E4A36,#187653)",
  "linear-gradient(135deg,#123B57,#1B5E8C)",
  "linear-gradient(135deg,#5A2340,#8C2F55)",
];

// تاريخ اليوم الوطني الـ96
const NATIONAL_DAY_YMD = { year: 2026, month: 9, day: 23 };

/** عدد الأيام المتبقية حتى 23 سبتمبر 2026 بتوقيت الرياض (سالب = انقضى) */
function daysUntilNationalDay(now: Date = new Date()): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(now)
      .split("-")
      .map(Number);
    const [y, m, d] = parts;
    if (!y || !m || !d) return null;
    const today = Date.UTC(y, m - 1, d);
    const target = Date.UTC(
      NATIONAL_DAY_YMD.year,
      NATIONAL_DAY_YMD.month - 1,
      NATIONAL_DAY_YMD.day,
    );
    return Math.round((target - today) / 86_400_000);
  } catch {
    return null;
  }
}

function countdownLabel(days: number): string {
  if (days === 0) return "🇸🇦 اليوم عيدنا الوطني الـ96";
  if (days === 1) return "باقي يوم واحد";
  if (days === 2) return "باقي يومين";
  if (days <= 10) return `باقي ${days} أيام`;
  return `باقي ${days} يومًا`;
}

// القيم الست لهوية «عزّنا بطبعنا» — كل قيمة بلونها ووسمها
const VALUES: Array<{ label: string; color: string; keyword: string }> = [
  { label: "عزّنا بأصالتنا", color: "#48B368", keyword: "عزنا بأصالتنا" },
  { label: "عزّنا بكرمنا", color: "#4AA3DC", keyword: "عزنا بكرمنا" },
  { label: "عزّنا بجودنا", color: "#8478DD", keyword: "عزنا بجودنا" },
  { label: "عزّنا برؤيتنا", color: "#D2A93C", keyword: "عزنا برؤيتنا" },
  { label: "عزّنا بشجاعتنا", color: "#A8B35E", keyword: "عزنا بشجاعتنا" },
  { label: "عزّنا بهمّتنا", color: "#CE3A6B", keyword: "عزنا بهمتنا" },
];

export interface NDBlockArticle {
  id: string;
  title: string;
  /** فئة + زمن نسبي جاهز للعرض، مثال: «محليات · قبل ساعتين» */
  meta: string;
  imageUrl?: string | null;
  /** تدرّج بديل للصورة (عناوين المعاينة التجريبية) */
  thumbGradient?: string;
  href?: string;
}

type ApiArticle = {
  id: string;
  title: string;
  slug: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  categoryName: string | null;
  isPinned: boolean;
};

type ApiResponse =
  | {
      isVisible: true;
      title: string;
      subtitle: string | null;
      daysRemaining: number | null;
      articles: ApiArticle[];
    }
  | { isVisible: false; reason?: string };

function toBlockArticle(a: ApiArticle, index: number): NDBlockArticle {
  const parts = [
    a.categoryName,
    a.publishedAt ? formatRelativeTime(a.publishedAt) : null,
  ].filter(Boolean);
  return {
    id: a.id,
    title: a.title,
    meta: parts.join(" · "),
    imageUrl: a.imageUrl,
    thumbGradient: FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length],
    href: `/article/${a.slug ?? a.id}`,
  };
}

export function NationalDay96Block({
  previewArticles,
}: {
  previewArticles?: NDBlockArticle[];
}) {
  const isPreview = !!previewArticles;

  const { data } = useQuery<ApiResponse>({
    queryKey: ["/api/national-day-block"],
    enabled: !isPreview,
    // تحديث دوري كي تظهر الأخبار المثبّتة حديثًا بدون إعادة تحميل
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  if (!isPreview && !data?.isVisible) return null;

  const live = !isPreview && data?.isVisible ? data : null;
  const articles =
    previewArticles ?? (live?.articles ?? []).map(toBlockArticle);
  const title = live?.title ?? "اليوم الوطني السعودي الـ96";
  const days = live ? live.daysRemaining : daysUntilNationalDay();

  return (
    <section
      dir="rtl"
      className="relative overflow-hidden rounded-2xl border"
      style={{ background: BLOCK_BG, borderColor: LINE }}
      data-testid="block-national-day-96"
    >
      {/* زخرفة السدو حافةً علوية للبلوك */}
      <div
        aria-hidden="true"
        style={{
          height: 8,
          background:
            "repeating-conic-gradient(#2FA46B 0% 25%, transparent 0% 50%) 0 0 / 8px 8px",
          opacity: 0.4,
        }}
      />

      <div className="p-5 md:p-7">
        <header className="flex items-center gap-3.5 flex-wrap">
          <div>
            <div
              className="text-[11px] font-bold tracking-[0.16em]"
              style={{ color: GREEN_BRIGHT }}
            >
              تغطية خاصة
            </div>
            <h2
              className="text-xl md:text-2xl font-extrabold leading-tight mt-0.5"
              style={{ color: INK }}
            >
              {title}
            </h2>
          </div>

          {days !== null && days >= 0 && (
            <span
              className="text-sm font-bold rounded-full border px-3.5 py-1 tabular-nums"
              style={{ color: INK, borderColor: LINE, background: PANEL }}
              data-testid="nd96-countdown"
            >
              {countdownLabel(days)}
            </span>
          )}

          <Link
            href="/keyword/اليوم الوطني"
            className="ms-auto inline-flex items-center gap-0.5 text-sm font-bold"
            style={{ color: GREEN_BRIGHT }}
            data-testid="nd96-all-coverage"
          >
            كل التغطية
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </header>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {articles.slice(0, 3).map((a, i) => {
            const card = (
              <article
                className="h-full rounded-xl overflow-hidden border transition-colors"
                style={{ background: PANEL, borderColor: LINE }}
                data-testid={`nd96-article-${a.id}`}
              >
                {a.imageUrl ? (
                  <img
                    src={a.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-24 md:h-28 w-full object-cover"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="h-24 md:h-28 relative"
                    style={{
                      background:
                        a.thumbGradient ??
                        FALLBACK_GRADIENTS[i % FALLBACK_GRADIENTS.length],
                    }}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          "repeating-conic-gradient(rgba(255,255,255,.07) 0% 25%, transparent 0% 50%) 0 0 / 9px 9px",
                      }}
                    />
                  </div>
                )}
                <h3
                  className="text-sm font-bold leading-relaxed line-clamp-2 px-3.5 pt-3 pb-1"
                  style={{ color: INK }}
                >
                  {a.title}
                </h3>
                {a.meta && (
                  <div className="text-xs px-3.5 pb-3.5" style={{ color: MUTED }}>
                    {a.meta}
                  </div>
                )}
              </article>
            );
            return a.href ? (
              <Link key={a.id} href={a.href} className="block h-full">
                {card}
              </Link>
            ) : (
              <div key={a.id}>{card}</div>
            );
          })}
        </div>

        {/* شريط القيم الست — كل قيمة تفتح تغطية وسمها */}
        <div className="mt-4 flex flex-wrap gap-2" data-testid="nd96-values">
          {VALUES.map((v) => (
            <Link
              key={v.label}
              href={`/keyword/${v.keyword}`}
              className="text-xs font-bold rounded-full border px-3 py-1 transition-opacity hover:opacity-80"
              style={{ color: v.color, borderColor: v.color, background: PANEL }}
            >
              {v.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
