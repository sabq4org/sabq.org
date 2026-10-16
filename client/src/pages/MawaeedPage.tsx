import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight, ExternalLink } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCanonical } from "@/hooks/useCanonical";
import { apiUrl } from "@/lib/queryClient";
import "@/styles/article-detail.css";
import "@/styles/mawaeed-page.css";
import { liveCountdown, riyadhDateISO } from "@shared/mawaeed/dates";
import { boardBlocks, heroFollowsRegion, nearestCard, schoolBlock, schoolRows } from "@shared/mawaeed/home";
import { normalizeRegion, type RegionId } from "@shared/mawaeed/model";
import type { MawaeedCard, MawaeedSeriesBlock, MawaeedView } from "@shared/mawaeed/present";

/** المفتاح نفسه الذي تقرؤه صفحة التقويم الدراسي، حتى تتبع اختيار القارئ هنا. */
const REGION_PREF_ID = "mawaeed-region";

/** المنطقة من الرابط أولاً ثم من آخر اختيار محفوظ. الرياض افتراضية. */
function readRegion(search: string): RegionId {
  const fromUrl = new URLSearchParams(search).get("region");
  try {
    if (fromUrl) {
      const region = normalizeRegion(fromUrl);
      window.localStorage.setItem(REGION_PREF_ID, region);
      return region;
    }
    return normalizeRegion(window.localStorage.getItem(REGION_PREF_ID));
  } catch {
    return normalizeRegion(fromUrl);
  }
}

/** ساعة واحدة للصفحة كلها: تدق كل نصف دقيقة، وتعيد الجلب مرة لكل يوم جديد بتوقيت الرياض. */
function useRiyadhClock(onDayChange: () => void): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    let loadedDay = riyadhDateISO(new Date());
    const tick = () => {
      const now = Date.now();
      setNowMs(now);
      const today = riyadhDateISO(new Date(now));
      if (today !== loadedDay) {
        loadedDay = today;
        onDayChange();
      }
    };
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, [onDayChange]);
  return nowMs;
}

/** نص العدّاد الحي: الجاري والمنتهي من الخادم، والقادم محسوب من الساعة. */
function countdownText(card: MawaeedCard, nowMs: number): string {
  if (card.isPast) return card.pastLabel || "انتهى";
  if (card.isOngoing) return card.countdownText;
  return liveCountdown(new Date(nowMs), card.startsOn, card.todayLabel).liveText;
}

/** رقم البطل ووحدته: أيام متبقية، أو ساعات في اليوم الأخير، أو كلمة الحالة. */
function heroCount(card: MawaeedCard, nowMs: number): { n: string | null; unit: string } {
  if (card.isPast) return { n: null, unit: card.pastLabel || "انتهى" };
  if (card.isOngoing) return { n: null, unit: card.countdownText };
  const live = liveCountdown(new Date(nowMs), card.startsOn, card.todayLabel);
  if (live.calendarDays <= 0) return { n: null, unit: card.todayLabel || "اليوم" };
  if (live.days <= 0) return { n: String(Math.max(1, live.hours)), unit: live.hours === 1 ? "ساعة متبقية" : "ساعات متبقية" };
  return { n: String(live.days), unit: live.days === 1 ? "يوم متبقٍ" : live.days === 2 ? "يومان متبقيان" : live.days <= 10 ? "أيام متبقية" : "يومًا متبقيًا" };
}

function badgeClass(card: MawaeedCard): string {
  if (card.isPast) return "mw-badge is-past";
  return card.certainty === "expected" ? "mw-badge is-expected" : "mw-badge is-confirmed";
}

function badgeText(card: MawaeedCard): string {
  return card.isPast ? card.pastLabel || "انتهى" : card.certaintyLabel;
}

export default function MawaeedPage() {
  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });
  const search = useSearch();
  const [, navigate] = useLocation();
  const region = useMemo(() => readRegion(search), [search]);
  const viewQuery = useQuery<MawaeedView>({
    queryKey: ["/api/mawaeed", { region }],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/mawaeed${region === "riyadh" ? "" : `?region=${region}`}`), { credentials: "include" });
      if (!res.ok) throw new Error(`تعذر تحميل المواعيد (${res.status})`);
      return (await res.json()) as MawaeedView;
    },
    retry: 2,
    // عند تبديل المنطقة تبقى البطاقات معروضة حتى تصل بيانات المنطقة الجديدة بدل أن تُفرَّغ الصفحة.
    placeholderData: keepPreviousData,
  });
  const view = viewQuery.data;
  const { refetch } = viewQuery;
  const refetchView = useCallback(() => {
    void refetch();
  }, [refetch]);
  const nowMs = useRiyadhClock(refetchView);
  useCanonical(view?.page.canonical ?? null);
  useEffect(() => {
    if (view?.page.title) document.title = view.page.title;
  }, [view?.page.title]);

  const pickRegion = useCallback((next: RegionId) => {
    try {
      window.localStorage.setItem(REGION_PREF_ID, next);
    } catch {
      /* التخزين قد يكون محجوباً؛ الاستعلام يكفي */
    }
    navigate(next === "riyadh" ? "/mawaeed" : `/mawaeed?region=${next}`, { replace: true });
  }, [navigate]);

  return (
    <div className="article-detail public-page min-h-screen bg-background relative z-10" dir="rtl">
      <Header user={user || undefined} />
      <main className="article-detail-main mawaeed-home container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
        {viewQuery.isLoading ? (
          <p className="public-meta">جارٍ تحميل المواعيد…</p>
        ) : !view ? (
          <article className="article-detail-content">
            <h1 className="article-detail-title">تعذر تحميل المواعيد</h1>
            <p className="article-detail-subtitle">الخدمة لم تستجب الآن. الصفحة موجودة، فأعد المحاولة بعد لحظات.</p>
            <p>
              <button type="button" className="service-retry" onClick={() => void refetch()} disabled={viewQuery.isFetching}>
                {viewQuery.isFetching ? "جارٍ إعادة المحاولة…" : "أعد المحاولة"}
              </button>
            </p>
          </article>
        ) : (
          <MawaeedBody view={view} nowMs={nowMs} region={region} switching={viewQuery.isFetching} onPickRegion={pickRegion} />
        )}
      </main>
      <Footer />
    </div>
  );
}

function MawaeedBody({
  view,
  nowMs,
  region,
  switching,
  onPickRegion,
}: {
  view: MawaeedView;
  nowMs: number;
  region: RegionId;
  switching: boolean;
  onPickRegion: (region: RegionId) => void;
}) {
  const hero = nearestCard(view.series);
  const heroBlock = hero ? view.series.find((block) => block.slug === hero.seriesSlug) ?? null : null;
  const school = schoolBlock(view.series);
  const rows = schoolRows(school);
  const board = boardBlocks(view.series, hero);
  const regionLabel = view.regions.find((item) => item.id === view.region)?.label ?? "";
  const jsonLd = JSON.stringify(view.jsonLd).replace(/</g, "\\u003c");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <nav aria-label="مسار التنقل" className="article-breadcrumbs">
        <Link href="/">الرئيسية</Link>
        <ChevronRight aria-hidden="true" />
        <span aria-current="page">مواعيدك</span>
      </nav>

      <header className="mw-head">
        <h1 className="mw-title">{view.page.h1}</h1>
        <p className="mw-lede">{view.page.description}</p>
        <p className="mw-updated">
          <span className="mw-updated-dot" aria-hidden="true" />
          آخر تحديث للبيانات: <time dateTime={view.dateModified}>{view.dateModifiedLabel}</time> بتوقيت السعودية
        </p>
      </header>

      {hero ? (
        <Hero
          card={hero}
          href={heroBlock?.href ?? null}
          nowMs={nowMs}
          regionLabel={heroFollowsRegion(hero) ? regionLabel : null}
        />
      ) : null}

      {school ? (
        <section className={`mw-school${switching ? " is-switching" : ""}`} aria-labelledby="mw-school-title">
          <div className="mw-school-head">
            <h2 id="mw-school-title">{school.title}</h2>
            <p>الإجازات الرسمية موحّدة، والإضافية حسب المنطقة التعليمية</p>
          </div>
          <div className="mw-tabs-row">
            <span className="mw-tabs-label">المنطقة</span>
            <div className="mw-tabs" role="group" aria-label="اختر المنطقة التعليمية">
              {view.regions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="mw-tab"
                  aria-pressed={item.id === region}
                  onClick={() => onPickRegion(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {rows.length ? (
            <ul className="mw-rows" key={view.region} aria-busy={switching}>
              {rows.map((card, index) => (
                <li key={card.id} className={index === 0 ? "is-first" : undefined}>
                  <span className="mw-row-title">
                    {index === 0 ? <span className="mw-row-tag">الأقرب</span> : null}
                    {card.title}
                  </span>
                  <strong className="mw-row-count">{countdownText(card, nowMs)}</strong>
                  <span className="mw-row-date">
                    <time dateTime={card.startsOn}>{card.gregorianLabel}</time>
                    {" · "}{card.hijriLabel}
                    {card.endLabel ? ` · حتى ${card.endLabel}` : ""}
                    {card.certainty === "expected" ? " · متوقع" : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mw-empty">{school.answerLine}</p>
          )}
          <div className="mw-school-foot">
            <span>
              المصدر: {rows[0]?.sourceTitle || "وزارة التعليم والإدارات التعليمية"}
            </span>
            <a href={school.href}>كل إجازات العام ›</a>
          </div>
        </section>
      ) : null}

      {board.length ? (
        <section aria-labelledby="mw-board-title">
          <div className="mw-board-head">
            <h2 id="mw-board-title">باقي المواعيد</h2>
            <span>مرتبة من الأقرب إلى الأبعد</span>
          </div>
          <div className="mw-grid">
            {board.map((block) => (
              <BoardCard key={block.slug} block={block} nowMs={nowMs} />
            ))}
          </div>
        </section>
      ) : null}

      {view.methodology ? <p className="mw-method">{view.methodology}</p> : null}
    </>
  );
}

function Hero({
  card,
  href,
  nowMs,
  regionLabel,
}: {
  card: MawaeedCard;
  href: string | null;
  nowMs: number;
  regionLabel: string | null;
}) {
  const count = heroCount(card, nowMs);
  const series = card.seriesTitle.trim();
  // كثير من عناوين المواعيد تبدأ باسم السلسلة نفسها؛ لا نكرّره في السطر العلوي.
  const showSeries = Boolean(series) && !card.title.startsWith(series);
  return (
    <section className="mw-hero" aria-labelledby="mw-hero-title" data-kind={card.kind}>
      <div className="mw-hero-body">
        <p className="mw-kicker">الموعد الأقرب{showSeries ? ` · ${series}` : ""}</p>
        <h2 id="mw-hero-title">{card.title}</h2>
        <p className="mw-hero-dates">
          <b><time dateTime={card.startsOn}>{card.gregorianLabel}</time></b>
          {" · "}{card.hijriLabel}{" "}
          <span className={badgeClass(card)}>{badgeText(card)}</span>
        </p>
        {card.endLabel ? <p className="mw-hero-note">حتى {card.endLabel}</p> : null}
        {card.expectedHint ? <p className="mw-hero-note">{card.expectedHint}</p> : null}
        {card.publicNote ? <p className="mw-hero-note">{card.publicNote}</p> : null}
        {regionLabel ? (
          <p className="mw-region-chip"><i aria-hidden="true" />في {regionLabel} · تتبع المنطقة المختارة أدناه</p>
        ) : null}
        <p className="mw-hero-source">
          <span>المصدر:</span>{" "}
          <a href={card.sourceUrl} rel="noopener noreferrer" target="_blank">
            {card.sourceTitle} <ExternalLink aria-hidden="true" />
          </a>
        </p>
        {href ? <a className="mw-cta" href={href}>كل مواعيد {series || "القسم"} ›</a> : null}
      </div>
      <div className="mw-count" aria-live="polite">
        {count.n ? <span className="mw-count-n">{count.n}</span> : null}
        <span className="mw-count-u">{count.unit}</span>
      </div>
    </section>
  );
}

function BoardCard({ block, nowMs }: { block: MawaeedSeriesBlock; nowMs: number }) {
  const next = block.next;
  return (
    <article className="mw-card">
      <div className="mw-card-series">
        <span>{block.title}</span>
        {next ? <span className={badgeClass(next)}>{badgeText(next)}</span> : null}
      </div>
      {next ? (
        <>
          <h3>{next.title}</h3>
          <p className="mw-card-date">
            <time dateTime={next.startsOn}>{next.gregorianLabel}</time>
            {" · "}{next.hijriLabel}
          </p>
          <div className="mw-card-foot">
            <strong className="mw-card-count">{countdownText(next, nowMs)}</strong>
            <a href={block.href}>كل مواعيد القسم ›</a>
          </div>
        </>
      ) : (
        <>
          <p className="mw-card-date">{block.answerLine}</p>
          <div className="mw-card-foot">
            <span />
            <a href={block.href}>صفحة القسم ›</a>
          </div>
        </>
      )}
    </article>
  );
}
