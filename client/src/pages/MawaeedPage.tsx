import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ExternalLink,
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
import { dayUnitWord, liveCountdown, riyadhDateISO, riyadhMidnightMs } from "@shared/mawaeed/dates";
import {
  financialBlocks,
  heroFollowsRegion,
  nearestCard,
  pulseBlocks,
  schoolBlock,
  schoolRows,
  shortSeriesTitle,
} from "@shared/mawaeed/home";
import { normalizeRegion, type MawaeedKind, type RegionId } from "@shared/mawaeed/model";
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

/** رقم موجز لبطاقة النبض السريعة في أعلى الصفحة. */
function pulseCount(card: MawaeedCard | null, nowMs: number): { num: string | null; unit: string } {
  if (!card) return { num: null, unit: "قريباً" };
  if (card.isPast) return { num: null, unit: card.pastLabel || "انتهى" };
  if (card.isOngoing) return { num: null, unit: card.countdownText };
  const live = liveCountdown(new Date(nowMs), card.startsOn, card.todayLabel);
  if (live.calendarDays <= 0) return { num: null, unit: card.todayLabel || "اليوم" };
  if (live.days <= 0) {
    const hrs = Math.max(1, live.hours);
    return { num: String(hrs), unit: hrs === 1 ? "ساعة متبقية" : hrs <= 10 ? "ساعات متبقية" : "ساعة متبقية" };
  }
  const unit =
    live.days === 1
      ? "يوم متبقٍّ"
      : live.days === 2
        ? "يومان متبقيان"
        : `${dayUnitWord(live.days)} ${live.days <= 10 ? "متبقية" : "متبقياً"}`;
  return { num: String(live.days), unit };
}

/** تاريخ مختصر بدون اسم الأسبوع لبطاقات الشريط العلوي (مثل: 27 أكتوبر 2026). */
function compactGregorian(label: string): string {
  const parts = label.trim().split(/\s+/);
  return parts.length >= 4 ? parts.slice(1).join(" ") : label;
}

function KindIcon({ kind }: { kind: MawaeedKind }) {
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
  const financial = financialBlocks(view.series);
  const school = schoolBlock(view.series);
  const rows = schoolRows(school, 5);
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

      {/* قشرة رأس الصفحة + شريط نبض المواعيد الخمسة فوق الطيّ */}
      <header className="mw-top-shell">
        <div className="mw-head-row">
          <div className="mw-head">
            <h1 className="mw-title">{view.page.h1}</h1>
            <p className="mw-lede">{view.page.description}</p>
          </div>
          <p className="mw-updated">
            <span className="mw-updated-dot" aria-hidden="true" />
            آخر تحديث: <time dateTime={view.dateModified}>{view.dateModifiedLabel}</time> بتوقيت السعودية
          </p>
        </div>

        {pulse.length > 0 ? (
          <div className="mw-pulse-wrap" role="region" aria-label="نظرة سريعة على جميع المواعيد">
            <div className="mw-pulse-head">
              <span className="mw-pulse-label">جميع المواعيد في نظرة واحدة — اضغط لعرض التفاصيل</span>
              <span className="mw-pulse-hint">مرتبة حسب الأقرب</span>
            </div>
            <div className="mw-pulse-grid">
              {pulse.map((block) => {
                const card = block.next;
                const count = pulseCount(card, nowMs);
                const isSelected = activeBlock?.slug === block.slug;
                const isEarliest = Boolean(card && nearest && card.id === nearest.id);
                return (
                  <button
                    key={block.slug}
                    type="button"
                    className={`mw-pulse-card${isSelected ? " is-active" : ""}`}
                    data-kind={block.kind}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedSlug(block.slug)}
                  >
                    <span className="mw-pulse-top">
                      <span className="mw-pulse-series">
                        <KindIcon kind={block.kind} />
                        <span>{shortSeriesTitle(block)}</span>
                      </span>
                      {isEarliest ? (
                        <span className="mw-pulse-nearest">الأقرب</span>
                      ) : card ? (
                        <span className={badgeClass(card)}>{badgeText(card)}</span>
                      ) : null}
                    </span>

                    <span className="mw-pulse-count">
                      {count.num ? <strong className="mw-pulse-num">{count.num}</strong> : null}
                      <span className="mw-pulse-unit">{count.unit}</span>
                    </span>

                    <span className="mw-pulse-foot">
                      <span className="mw-pulse-date">
                        {card ? compactGregorian(card.gregorianLabel) : "لا موعد معلن"}
                      </span>
                      <span className="mw-pulse-arrow" aria-hidden="true">›</span>
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
                <h2 id="mw-board-title">مواعيد الرواتب والدعم الشهري</h2>
                <p>مواعيد الإيداع القادمة حسب الجداول الرسمية للجهات</p>
              </div>
              <span className="mw-section-sub">مرتبة من الأقرب إلى الأبعد</span>
            </div>
            <div className="mw-grid">
              {financial.map((block) => (
                <BoardCard
                  key={block.slug}
                  block={block}
                  nowMs={nowMs}
                  isSelected={activeBlock?.slug === block.slug}
                  onSelect={() => setSelectedSlug(block.slug)}
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
              <a className="mw-school-top-link" href={school.href}>صفحة التقويم ›</a>
            </div>
            <div className="mw-tabs-row">
              <span className="mw-tabs-label">المنطقة:</span>
              <div className="mw-tabs" role="group" aria-label="اختر المنطقة التعليمية">
                {view.regions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="mw-tab"
                    aria-pressed={item.id === region}
                    onClick={() => {
                      onPickRegion(item.id);
                      setSelectedSlug(school.slug);
                    }}
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
                    <div className="mw-row-main">
                      <span className="mw-row-title">
                        {index === 0 ? <span className="mw-row-tag">الأقرب</span> : null}
                        {card.title}
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
      </div>

      {view.methodology ? <p className="mw-method">{view.methodology}</p> : null}
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
  const series = card.seriesTitle.trim();
  const showSeries = Boolean(series) && !card.title.startsWith(series);
  const kickerPrefix = isNearest ? "الموعد الأقرب" : "الموعد المختار";
  return (
    <section className="mw-hero" aria-labelledby="mw-hero-title" data-kind={card.kind}>
      <div className="mw-hero-body">
        <div className="mw-hero-badges">
          <span className="mw-kicker">
            <KindIcon kind={card.kind} />
            <span>{kickerPrefix}{showSeries ? ` · ${series}` : ""}</span>
          </span>
          <span className={badgeClass(card)}>{badgeText(card)}</span>
        </div>
        <h2 id="mw-hero-title">{card.title}</h2>
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
          <p className="mw-hero-source">
            <span>المصدر:</span>{" "}
            <a href={card.sourceUrl} rel="noopener noreferrer" target="_blank">
              {card.sourceTitle} <ExternalLink aria-hidden="true" />
            </a>
          </p>
          {href ? <a className="mw-cta" href={href}>صفحة {series || "القسم"} الكاملة ›</a> : null}
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
  isSelected,
  onSelect,
}: {
  block: MawaeedSeriesBlock;
  nowMs: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const next = block.next;
  return (
    <article
      className={`mw-card${isSelected ? " is-selected" : ""}`}
      data-kind={block.kind}
      onClick={onSelect}
    >
      <div className="mw-card-top">
        <div className="mw-card-series">
          <span className="mw-card-kicker">
            <KindIcon kind={block.kind} />
            <span>{block.title}</span>
          </span>
          {next ? <span className={badgeClass(next)}>{badgeText(next)}</span> : null}
        </div>
        {next ? (
          <>
            <h3>{next.title}</h3>
            <p className="mw-card-date">
              <strong><time dateTime={next.startsOn}>{next.gregorianLabel}</time></strong>
              {" · "}{next.hijriLabel}
            </p>
          </>
        ) : (
          <p className="mw-card-date">{block.answerLine}</p>
        )}
      </div>

      <div className="mw-card-foot">
        {next ? (
          <strong className="mw-card-count">{countdownText(next, nowMs)}</strong>
        ) : (
          <span />
        )}
        <a href={block.href} onClick={(e) => e.stopPropagation()}>
          كل المواعيد ›
        </a>
      </div>
    </article>
  );
}

