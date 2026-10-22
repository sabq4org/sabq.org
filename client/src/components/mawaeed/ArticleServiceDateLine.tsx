/**
 * سطر «موعد الصرف» داخل الخبر: خبر عن حساب المواطن أو الرواتب أو الضمان أو التقاعد أو إجازات المدارس
 * يحمل موعد الخدمة القادم وكم بقي عليه، ورابطًا إلى صفحتها في /services.
 * يقرأ /api/mawaeed بمفتاح سطر الرئيسية وصفحة مواعيدك نفسه، فلا طلب جديد إن سبق تحميله.
 * قبل وصول البيانات (أو عند فشلها) يبقى الرابط بنصه فقط.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft } from "lucide-react";
import { apiUrl } from "@/lib/queryClient";
import { mawaeedApiPath, readRegion } from "@/lib/mawaeedRegion";
import type { MawaeedView } from "@shared/mawaeed/present";
import type { ArticleServiceLink } from "@shared/servicePages/articleLink";

export default function ArticleServiceDateLine({ link }: { link: ArticleServiceLink }) {
  const region = useMemo(() => readRegion(""), []);
  const { data } = useQuery<MawaeedView>({
    queryKey: ["/api/mawaeed", { region }],
    queryFn: async () => {
      const res = await fetch(apiUrl(mawaeedApiPath(region)), { credentials: "include" });
      if (!res.ok) throw new Error(`تعذر تحميل المواعيد (${res.status})`);
      return (await res.json()) as MawaeedView;
    },
    staleTime: 10 * 60_000,
  });
  const series = Array.isArray(data?.series) ? data.series : [];
  const block = series.find((item) => item.slug === link.seriesSlug);
  const next = block?.next && !block.next.isPast ? block.next : null;

  return (
    <Link href={block?.href || link.path} className="article-service-date" data-testid="link-article-service-date">
      <CalendarClock className="article-service-date-icon" aria-hidden="true" strokeWidth={2.2} />
      <span className="article-service-date-text">
        <span className="article-service-date-label">{link.label}</span>
        {next && (
          <span className="article-service-date-when">
            <time dateTime={next.startsOn}>{next.gregorianLabel}</time>
            <span className="article-service-date-count">{next.countdownText}</span>
            {next.certainty === "expected" && (
              <span className="article-service-date-expected">{next.certaintyLabel}</span>
            )}
          </span>
        )}
      </span>
      <ChevronLeft className="article-service-date-arrow" aria-hidden="true" strokeWidth={2.2} />
    </Link>
  );
}
