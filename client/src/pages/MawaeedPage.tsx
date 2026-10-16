import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  GraduationCap,
  HeartHandshake,
  Home,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCanonical } from "@/hooks/useCanonical";
import { apiUrl } from "@/lib/queryClient";
import "@/styles/article-detail.css";
import "@/styles/mawaeed-page.css";
import { compactOccurrenceTitle } from "@shared/mawaeed/display";
import { dayUnitWord, liveCountdown, riyadhDateISO, riyadhMidnightMs } from "@shared/mawaeed/dates";
import {
  boardBlocks,
  heroFollowsRegion,
  nearestCard,
  pulseBlocks,
  schoolBlock,
  schoolRows,
  shortSeriesTitle,
} from "@shared/mawaeed/home";
import { normalizeRegion, type RegionId, type SeriesKind } from "@shared/mawaeed/model";
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

/** تفاصيل العدّاد للبطل (أيام / ساعات / دقائق) أو نص الحالة عند حلول الموعد. */
function heroClockParts(
  card: MawaeedCard,
  nowMs: number,
): { days: number; hours: number; minutes: number; word: string | null } {
  if (card.isPast) return { days: 0, hours: 0, minutes: 0, word: card.pastLabel || "انتهى" };
  if (card.isOngoing) return { days: 0, hours: 0, minutes: 0, word: card.countdownText };
  const live = liveCountdown(new Date(nowMs), card.startsOn, card.todayLabel);
  if (live.calendarDays <= 0) {
    return { days: 0, hours: 0, minutes: 0, word: card.todayLabel || "اليوم" };
  }
  const ms = Math.max(0, riyadhMidnightMs(card.startsOn) - nowMs);
  const totalMinutes = Math.floor(ms / 60_000);
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor(totalMinutes / 60) % 24,
    minutes: totalMinutes % 60,
    word: null,
  };
}

/** يبقى اسم الخدمة واضحاً حتى لو كتب المحرر عنواناً لا يبدأ به. */
function overviewTitle(card: MawaeedCard): string {
  const title = compactOccurrenceTitle(card.title, card.startsOn);
  const normalize = (value: string) => value.replace(/[\u064B-\u065F\u0670\u0640]/g, "").trim();
  return normalize(title).startsWith(normalize(card.seriesTitle)) ? title : `${card.seriesTitle} — ${title}`;
}

function KindIcon({ kind }: { kind: SeriesKind }) {
  switch (kind) {
    case "school_holiday":
      return <GraduationCap aria-hidden="true" className="mw-kind-icon" />;
    case "salary":
      return <Landmark aria-hidden="true" className="mw-kind-icon" />;
    case "pension":
      return <ShieldCheck aria-hidden="true" className="mw-kind-icon" />;
    case "social_security":
      return <HeartHandshake aria-hidden="true" className="mw-kind-icon" />;
    case "citizen_account":
      return <Home aria-hidden="true" className="mw-kind-icon" />;
  }
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
      <main className="article-detail-main mawaeed-home container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl">
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
  const nearest = nearestCard(view.series);
  const pulse = pulseBlocks(view.series);
  const school = schoolBlock(view.series);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const activeBlock = useMemo(() => {
    if (selectedSlug) {
      const found = view.series.find((b) => b.slug === selectedSlug && b.next);
      if (found) return found;
    }
    if (nearest) {
      return view.series.find((b) => b.slug === nearest.seriesSlug) ?? null;
    }
    return pulse[0] ?? null;
  }, [selectedSlug, view.series, nearest, pulse]);

  const activeCard = activeBlock?.next ?? nearest;
  const financial = boardBlocks(view.series, activeCard);
  const rows = schoolRows(school).filter((card) => card.id !== activeCard?.id).slice(0, 5);
  const isNearestActive = Boolean(activeCard && nearest && activeCard.id === nearest.id);
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

      {/* رأس الصفحة واختيار الخدمة، دون إعادة التواريخ المعروضة أدناه */}
      <header className="mw-top-shell">
        <div className="mw-head-row">
          <div className="mw-head">
            <h1 className="mw-title">{view.page.h1}</h1>
            <p className="mw-lede">{view.page.description.replace(" ورابط المصدر الرسمي", "")}</p>
          </div>
          <p className="mw-updated">
            <span className="mw-updated-dot" aria-hidden="true" />
            آخر تحديث: <time dateTime={view.dateModified}>{view.dateModifiedLabel}</time> بتوقيت السعودية
          </p>
        </div>

        {pulse.length > 0 ? (
          <div className="mw-pulse-wrap" role="region" aria-label="اختيار الخدمة">
            <div className="mw-pulse-head">
              <span className="mw-pulse-label">اختر الخدمة</span>
            </div>
            <div className="mw-pulse-grid">
              {pulse.map((block) => {
                const isSelected = activeBlock?.slug === block.slug;
                const isEarliest = Boolean(block.next && nearest && block.next.id === nearest.id);
                return (
                  <button
                    key={block.slug}
                    type="button"
                    className={`mw-pulse-card${isSelected ? " is-active" : ""}`}
                    data-kind={block.kind}
                    aria-pressed={isSelected}
                    disabled={!block.next}
                    onClick={() => setSelectedSlug(block.slug)}
                  >
                    <span className="mw-pulse-top">
                      <span className="mw-pulse-series">
                        <KindIcon kind={block.kind} />
                        <span>{shortSeriesTitle(block)}</span>
                      </span>
                      {!block.next ? <span className="mw-pulse-nearest">لا موعد معلن</span> : isEarliest ? <span className="mw-pulse-nearest">الأقرب</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </header>

      {/* بطاقة التركيز التفصيلية (البطل) تتبع الموعد المختار من الشريط العلوي */}
      {activeCard ? (
        <Hero
          card={activeCard}
          href={activeBlock?.href ?? null}
          nowMs={nowMs}
          isNearest={isNearestActive}
          regionLabel={heroFollowsRegion(activeCard) ? regionLabel : null}
        />
      ) : null}

      {/* تخطيط العمودين المتوازن: مواعيد الصرف والرواتب يميناً + التقويم الدراسي المدمج يساراً */}
      <div className="mw-columns">
        {financial.length > 0 ? (
          <section className="mw-fin-col" aria-labelledby="mw-board-title">
            <div className="mw-section-head">
              <div>
                <h2 id="mw-board-title">مواعيد الصرف الأخرى</h2>
                <p>الرواتب والدعم الشهري، مرتبة حسب الأقرب</p>
              </div>
            </div>
            <div className="mw-grid">
              {financial.map((block) => (
                <BoardCard
                  key={block.slug}
                  block={block}
                  nowMs={nowMs}
                />
              ))}
            </div>
          </section>
        ) : null}

        {school ? (
          <section
            className={`mw-school${switching ? " is-switching" : ""}`}
            data-kind="school_holiday"
            aria-labelledby="mw-school-title"
          >
            <div className="mw-school-head">
              <div className="mw-school-title-wrap">
                <span className="mw-school-icon" aria-hidden="true">
                  <GraduationCap />
                </span>
                <div>
                  <h2 id="mw-school-title">{school.title}</h2>
                  <p>الإجازات الرسمية موحّدة، والإضافية حسب المنطقة التعليمية</p>
                </div>
              </div>
            </div>
            <div className="mw-tabs-row">
              <label className="mw-tabs-label" htmlFor="mw-region">إدارة التعليم</label>
              <select
                id="mw-region"
                className="mw-region-select"
                value={region}
                onChange={(event) => {
                  onPickRegion(normalizeRegion(event.target.value));
                  setSelectedSlug(school.slug);
                }}
              >
                {view.regions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </div>
            {!school.upcoming.some((card) => !card.isPast && card.regionGroup !== "all") ? (
              <p className="mw-region-notice">المعروض هو التقويم الدراسي العام. لم تُعتمد في الخدمة إجازات إضافية خاصة بهذه المنطقة بعد.</p>
            ) : null}
            {rows.length ? (
              <ul className="mw-rows" key={view.region} aria-busy={switching}>
                {rows.map((card) => (
                  <li key={card.id}>
                    <div className="mw-row-main">
                      <span className="mw-row-title">
                        {compactOccurrenceTitle(card.title, card.startsOn)}
                      </span>
                      <span className="mw-row-date">
                        <time dateTime={card.startsOn}>{card.gregorianLabel}</time>
                        {" · "}{card.hijriLabel}
                        {card.endLabel ? ` · حتى ${card.endLabel}` : ""}
                        {card.certainty === "expected" ? " · متوقع" : ""}
                      </span>
                    </div>
                    <strong className="mw-row-count">{countdownText(card, nowMs)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mw-empty">{activeCard?.kind === "school_holiday" ? "لا توجد إجازات لاحقة منشورة حاليًا." : school.answerLine}</p>
            )}
            <div className="mw-school-foot">
              <a href={school.href}>كل إجازات العام ›</a>
            </div>
          </section>
        ) : null}
      </div>

      {view.methodology ? (
        <section className="mw-method-box" aria-labelledby="mw-method-title">
          <div className="mw-method-head">
            <h2 id="mw-method-title" className="mw-method-title">
              <ShieldCheck aria-hidden="true" />
              <span>عن المواعيد</span>
            </h2>
            <div className="mw-method-legend" aria-label="دلالة شارات الحالة">
              <span className="mw-method-legend-item">
                <span className="mw-badge is-confirmed">مؤكد</span>
                <span>إعلان رسمي من الجهة</span>
              </span>
              <span className="mw-method-legend-item">
                <span className="mw-badge is-expected">متوقع</span>
                <span>محسوب من الجدول المعتاد</span>
              </span>
            </div>
          </div>
          <p className="mw-method">جميع الأوقات بتوقيت السعودية. تُعرض التواريخ بالميلادي والهجري وفق تقويم أم القرى، ويتحدّث العدّاد تلقائيًا.</p>
        </section>
      ) : null}
    </>
  );
}

function Hero({
  card,
  href,
  nowMs,
  isNearest,
  regionLabel,
}: {
  card: MawaeedCard;
  href: string | null;
  nowMs: number;
  isNearest: boolean;
  regionLabel: string | null;
}) {
  const clock = heroClockParts(card, nowMs);
  const kickerPrefix = isNearest ? "الموعد الأقرب" : "الموعد المختار";
  return (
    <section className="mw-hero" aria-labelledby="mw-hero-title" data-kind={card.kind}>
      <div className="mw-hero-body">
        <div className="mw-hero-badges">
          <span className="mw-kicker">
            <KindIcon kind={card.kind} />
            <span>{kickerPrefix}</span>
          </span>
          <span className={badgeClass(card)}>{badgeText(card)}</span>
        </div>
        <h2 id="mw-hero-title">{card.kind === "school_holiday" ? compactOccurrenceTitle(card.title, card.startsOn) : overviewTitle(card)}</h2>
        <p className="mw-hero-dates">
          <b><time dateTime={card.startsOn}>{card.gregorianLabel}</time></b>
          <span className="mw-dot-sep" aria-hidden="true">·</span>
          <span>{card.hijriLabel}</span>
        </p>
        {card.endLabel ? <p className="mw-hero-note">حتى {card.endLabel}</p> : null}
        {card.expectedHint ? <p className="mw-hero-note">{card.expectedHint}</p> : null}
        {card.publicNote ? <p className="mw-hero-note">{card.publicNote}</p> : null}
        {regionLabel ? (
          <p className="mw-region-chip"><i aria-hidden="true" />في {regionLabel} · تتبع المنطقة المختارة في التقويم الدراسي</p>
        ) : null}
        <div className="mw-hero-foot">
          {href ? <a className="mw-cta" href={href}>كل مواعيد الخدمة ›</a> : null}
        </div>
      </div>

      <div className="mw-clock-box" aria-live="polite">
        <span className="mw-clock-label">الوقت المتبقي</span>
        {clock.word ? (
          <strong className="mw-clock-word">{clock.word}</strong>
        ) : (
          <div className="mw-clock-grid">
            <div className="mw-clock-cell">
              <strong className="mw-clock-num">{clock.days}</strong>
              <span className="mw-clock-unit">{dayUnitWord(clock.days)}</span>
            </div>
            <div className="mw-clock-cell">
              <strong className="mw-clock-num">{clock.hours}</strong>
              <span className="mw-clock-unit">{clock.hours >= 3 && clock.hours <= 10 ? "ساعات" : "ساعة"}</span>
            </div>
            <div className="mw-clock-cell">
              <strong className="mw-clock-num">{clock.minutes}</strong>
              <span className="mw-clock-unit">دقيقة</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function BoardCard({
  block,
  nowMs,
}: {
  block: MawaeedSeriesBlock;
  nowMs: number;
}) {
  const next = block.next;
  return (
    <article className="mw-card" data-kind={block.kind}>
      <div className="mw-card-top">
        <div className="mw-card-series">
          <h3 className="mw-card-title">
            <a className="mw-card-select" href={block.href}>
              <KindIcon kind={block.kind} />
              <span>{next ? overviewTitle(next) : block.title}</span>
            </a>
          </h3>
          {next ? <span className={badgeClass(next)}>{badgeText(next)}</span> : null}
        </div>
        {next ? (
          <p className="mw-card-date">
            <strong><time dateTime={next.startsOn}>{next.gregorianLabel}</time></strong>
            {" · "}{next.hijriLabel}
          </p>
        ) : <p className="mw-card-date">{block.answerLine}</p>}
      </div>

      <div className="mw-card-foot">
        {next ? <strong className="mw-card-count">{countdownText(next, nowMs)}</strong> : <span />}
      </div>
    </article>
  );
}

