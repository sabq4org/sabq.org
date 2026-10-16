import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Newspaper,
  Share2,
} from "lucide-react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useCanonical } from "@/hooks/useCanonical";
import { apiUrl } from "@/lib/queryClient";
import "@/styles/article-detail.css";
import { HIDDEN_SERVICE_ROBOTS, regionSuffix, servicePageUsesRegion } from "@shared/servicePages/catalog";
import { REGIONS, normalizeRegion, type RegionId } from "@shared/mawaeed/model";
import type { ServicePageModel } from "@shared/servicePages/present";
import {
  relatedArticlesFromKeyword,
  relatedArticlesFromSearch,
  type RelatedArticleLink,
} from "@shared/servicePages/related";

/** المفتاح نفسه الذي تكتبه صفحة /mawaeed، حتى تتبع صفحة المدارس اختيار القارئ. */
const REGION_PREF_ID = "mawaeed-region";

/** منطقة صفحة المدارس: من الرابط أولاً ثم من آخر اختيار محفوظ. الرياض افتراضية. */
function readRegion(id: string | undefined, search: string): RegionId {
  if (!id || !servicePageUsesRegion(id)) return "riyadh";
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

function riyadhStartMs(iso: string): number {
  const bits = iso.split("-").map(Number);
  if (bits.length !== 3 || bits.some((n) => !Number.isFinite(n))) return NaN;
  return Date.UTC(bits[0], bits[1] - 1, bits[2], -3, 0, 0, 0);
}

function daysText(n: number): string {
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومين";
  if (n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}

function hoursText(n: number): string {
  if (n <= 0) return "";
  if (n === 1) return "وساعة";
  if (n === 2) return "وساعتان";
  if (n <= 10) return `و${n} ساعات`;
  return `و${n} ساعة`;
}

/** يُستدعى فقط والوقت المتبقي موجب، فالدقائق الأخيرة قبل منتصف الليل ليست «اليوم». */
function phrase(days: number, hours: number): string {
  if (days <= 0 && hours <= 0) return "بعد أقل من ساعة";
  if (days <= 0) return `بعد ${hoursText(hours).replace(/^و/, "")}`;
  if (hours <= 0) return `بعد ${daysText(days)}`;
  return `بعد ${daysText(days)} ${hoursText(hours)}`;
}

function remaining(iso: string, nowMs: number): { days: number; hours: number; minutes: number } | null {
  const ms = riyadhStartMs(iso) - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.floor(ms / 60000);
  return {
    days: Math.floor(minutes / 1440),
    hours: Math.floor(minutes / 60) % 24,
    minutes: minutes % 60,
  };
}

function riyadhDay(nowMs: number): string {
  return new Date(nowMs + 3 * 3_600_000).toISOString().slice(0, 10);
}

function useLiveCountdown(startsOn: string | undefined, todayLabel: string, initial: string, onDayChange?: () => void) {
  const [text, setText] = useState(initial);
  const [parts, setParts] = useState<{ days: number; hours: number; minutes: number } | null>(() =>
    startsOn ? remaining(startsOn, Date.now()) : null,
  );
  useEffect(() => {
    setText(initial);
    if (!startsOn) {
      setParts(null);
      return;
    }
    const loadedDay = riyadhDay(Date.now());
    let notified = false;
    const tick = () => {
      const now = Date.now();
      // بعد منتصف ليل الرياض يتغيّر الموعد القادم أو حالته: نعيد الجلب مرة بدل البقاء على «اليوم».
      if (!notified && riyadhDay(now) !== loadedDay) {
        notified = true;
        onDayChange?.();
      }
      const left = remaining(startsOn, now);
      setParts(left);
      setText(left ? phrase(left.days, left.hours) : todayLabel);
    };
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, [startsOn, todayLabel, initial, onDayChange]);
  return { text, parts };
}

function statusBadgeClass(certainty: "confirmed" | "expected" | undefined, isPast?: boolean): string {
  if (isPast) return "service-status-badge is-past";
  if (certainty === "expected") return "service-status-badge is-expected";
  return "service-status-badge is-confirmed";
}

export default function ServiceDatePage() {
  const { id } = useParams<{ id: string }>();
  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });
  const search = useSearch();
  const region = useMemo(() => readRegion(id, search), [id, search]);
  const pageQuery = useQuery<ServicePageModel>({
    queryKey: ["/api/service-pages", id, { region: region === "riyadh" ? undefined : region }],
    enabled: Boolean(id),
    retry: false,
  });
  const model = pageQuery.data;
  const { refetch } = pageQuery;
  const refetchPage = useCallback(() => {
    void refetch();
  }, [refetch]);
  useCanonical(model?.canonical ?? null);
  useEffect(() => {
    let meta = document.head.querySelector('meta[name="robots"]');
    const created = !meta;
    const prevContent = meta?.getAttribute("content") ?? null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", HIDDEN_SERVICE_ROBOTS);
    return () => {
      if (created) {
        meta?.remove();
      } else if (meta && prevContent !== null) {
        meta.setAttribute("content", prevContent);
      }
    };
  }, []);
  useEffect(() => {
    if (model?.title) document.title = model.title;
  }, [model?.title]);

  const relatedQuery = useQuery({
    queryKey: ["service-page-related", model?.id, model?.relatedSource, model?.relatedQuery],
    enabled: Boolean(model?.relatedQuery),
    retry: false,
    queryFn: async () => {
      if (!model?.relatedQuery) return null;
      const endpoint = model.relatedSource === "keyword"
        ? `/api/keyword/${encodeURIComponent(model.relatedQuery)}`
        : `/api/search?q=${encodeURIComponent(model.relatedQuery)}&limit=6`;
      const res = await fetch(apiUrl(endpoint), { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });
  const related = useMemo<RelatedArticleLink[]>(() => {
    if (!model || !relatedQuery.data) return [];
    return model.relatedSource === "keyword"
      ? relatedArticlesFromKeyword(relatedQuery.data)
      : relatedArticlesFromSearch(relatedQuery.data);
  }, [model, relatedQuery.data]);

  return (
    <div className="article-detail public-page min-h-screen bg-background relative z-10" dir="rtl">
      <Header user={user || undefined} />
      <main className="article-detail-main container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
        {pageQuery.isLoading ? (
          <p className="public-meta">جارٍ تحميل الموعد…</p>
        ) : !model ? (
          <article className="article-detail-content">
            <h1 className="article-detail-title">الصفحة غير موجودة</h1>
            <p className="article-detail-subtitle">لا توجد صفحة خدمة بهذا العنوان.</p>
            <p><a href="/mawaeed">العودة إلى مواعيدك</a></p>
          </article>
        ) : (
          <ServiceDateBody model={model} related={related} onDayChange={refetchPage} />
        )}
      </main>
      <Footer />
    </div>
  );
}

function ServiceDateBody({
  model,
  related,
  onDayChange,
}: {
  model: ServicePageModel;
  related: RelatedArticleLink[];
  onDayChange: () => void;
}) {
  // الموعد الجاري لا عدّاد له: نصه «جارية حتى …» من الخادم.
  const live = useLiveCountdown(
    model.next && !model.next.isOngoing ? model.next.startsOn : undefined,
    model.next?.todayLabel || "اليوم",
    model.next?.countdownText || "",
    onDayChange,
  );
  const jsonLd = JSON.stringify(model.jsonLd).replace(/</g, "\\u003c");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <nav aria-label="مسار التنقل" className="article-breadcrumbs">
        <Link href="/">الرئيسية</Link>
        <ChevronRight aria-hidden="true" />
        <a href="/mawaeed">مواعيدك</a>
        <ChevronRight aria-hidden="true" />
        <span aria-current="page">{model.h1}</span>
      </nav>
      <div className="article-detail-layout service-date-page" data-tone={model.tone}>
        <article className="article-detail-content min-w-0">
          <header className="article-detail-header">
            <div className="flex flex-wrap items-center gap-3">
              {model.next ? (
                <span className={statusBadgeClass(model.next.certainty)}>
                  {model.next.certaintyLabel}
                </span>
              ) : null}
              <h1 className="article-detail-title !mt-0 min-w-0">{model.h1}</h1>
            </div>
            {model.tone === "school" ? <RegionPicker current={model.region} /> : null}
            <Answer model={model} countdown={live.text} />
            <div className="article-detail-byline">
              {model.next?.sourceUrl ? (
                <p className="public-meta inline-flex items-center gap-1.5">
                  <span>المصدر:</span>
                  <a
                    href={model.next.sourceUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="inline-flex items-center gap-1 font-semibold hover:underline"
                  >
                    <span>{model.next.sourceTitle}</span>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </p>
              ) : <span />}
              <p className="article-detail-metadata">
                آخر تحديث: <time dateTime={model.dateModified}>{model.dateModifiedLabel}</time>
              </p>
            </div>
          </header>

          {model.next ? (
            <section className="service-next-panel" aria-label="بطاقة الموعد القادم">
              <div className="service-next-header">
                <p className="service-next-kicker">
                  <Calendar aria-hidden="true" />
                  <span>الموعد القادم · {model.next.title}</span>
                </p>
                <span className={statusBadgeClass(model.next.certainty)}>
                  {model.next.certaintyLabel}
                </span>
              </div>
              <div className="service-date-grid">
                <div className="service-date-cell">
                  <p className="service-date-label">التاريخ الميلادي</p>
                  <p className="service-date-value">
                    <time dateTime={model.next.startsOn}>{model.next.gregorianLabel}</time>
                  </p>
                </div>
                <div className="service-date-cell">
                  <p className="service-date-label">التاريخ الهجري (أم القرى)</p>
                  <p className="service-date-value">{model.next.hijriLabel}</p>
                </div>
              </div>
              {live.parts && (
                <div className="service-countdown-bar" aria-hidden="true">
                  <p className="service-countdown-label">
                    {model.tone === "school"
                      ? "الوقت المتبقي على الإجازة (بتوقيت الرياض)"
                      : "الوقت المتبقي على الصرف (بتوقيت الرياض)"}
                  </p>
                  <div className="service-countdown-grid">
                    <div className="service-countdown-cell">
                      <b className="service-countdown-num">{live.parts.days}</b>
                      <span className="service-countdown-unit">يوم</span>
                    </div>
                    <div className="service-countdown-cell">
                      <b className="service-countdown-num">{live.parts.hours}</b>
                      <span className="service-countdown-unit">ساعة</span>
                    </div>
                    <div className="service-countdown-cell">
                      <b className="service-countdown-num">{live.parts.minutes}</b>
                      <span className="service-countdown-unit">دقيقة</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="service-actions-bar">
                {model.calendarHref && (
                  <Button asChild>
                    <a href={apiUrl(model.calendarHref)}>
                      <CalendarPlus className="ml-2 h-4 w-4" aria-hidden="true" />
                      أضف المواعيد القادمة إلى التقويم
                    </a>
                  </Button>
                )}
                <ShareButton title={model.title} url={`${model.canonical}${regionSuffix(model.region)}`} />
              </div>
            </section>
          ) : (
            <div className="article-detail-toolbar-row">
              <ShareButton title={model.title} url={`${model.canonical}${regionSuffix(model.region)}`} />
            </div>
          )}

          <section>
            <h2 className="public-section-title">خط المواعيد</h2>
            <p className="public-meta mt-1">
              {model.tone === "school"
                ? "المواعيد من السجل المنشور. ما مضى يظهر «انتهت»، وما لم تعلنه الجهة بعد يبقى «متوقعًا»."
                : "المواعيد من السجل المنشور. ما مضى يظهر «صُرفت»، وما لم تعلنه الجهة بعد يبقى «متوقعًا»."}
            </p>
            {model.rows.length === 0 ? (
              <p className="mt-4">لا توجد مواعيد منشورة في السجل.</p>
            ) : (
              <ol className="service-timeline">
                {model.rows.map((row) => {
                  const rowCertainty = row.certaintyLabel === "متوقع" ? "expected" : "confirmed";
                  return (
                    <li
                      key={`${row.startsOn}-${row.title}`}
                      className={`service-timeline-row${row.isNext ? " is-next" : ""}${row.isPast ? " is-past" : ""}`}
                    >
                      <div className="service-timeline-main">
                        <div className="service-timeline-head">
                          <h3 className="service-timeline-title">{row.title}</h3>
                          {row.isNext && <span className="service-next-pill">الموعد القادم</span>}
                        </div>
                        <p className="service-timeline-dates">
                          <time dateTime={row.startsOn}>{row.gregorianLabel}</time>
                          <span aria-hidden="true">·</span>
                          <span className="service-timeline-hijri">{row.hijriLabel}</span>
                        </p>
                      </div>
                      <div className="service-timeline-meta">
                        {!row.isPast && row.countdownText ? (
                          <span className="service-timeline-countdown">{row.countdownText}</span>
                        ) : null}
                        <span className={statusBadgeClass(rowCertainty, row.isPast)}>
                          {row.isPast ? row.pastLabel || (model.tone === "school" ? "انتهت" : "صُرفت") : row.certaintyLabel}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section>
            <h2 className="public-section-title">كيف يُحدَّد الموعد</h2>
            <div className="service-explanation-box">
              {model.explanation.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </section>

          {model.faq.length > 0 && (
            <section>
              <h2 className="public-section-title">أسئلة شائعة</h2>
              <div className="service-faq-list">
                {model.faq.map((item, idx) => (
                  <details key={item.question} className="service-faq-item" open={idx === 0}>
                    <summary className="service-faq-summary">{item.question}</summary>
                    <div className="service-faq-answer">
                      <p>{item.answer}</p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}
        </article>

        <aside className="article-detail-sidebar min-w-0">
          {related.length > 0 && (
            <section className="article-sidebar-module">
              <div className="article-sidebar-heading">
                <h2>
                  <span className="article-sidebar-heading-icon" aria-hidden="true">
                    <Newspaper />
                  </span>
                  من أخبار سبق
                </h2>
              </div>
              <ul className="service-sidebar-list">
                {related.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="service-sidebar-link">
                      <span>{item.title}</span>
                      <ChevronLeft aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <nav className="article-sidebar-module" aria-label="صفحات ذات صلة">
            <div className="article-sidebar-heading">
              <h2>
                <span className="article-sidebar-heading-icon" aria-hidden="true">
                  <Clock />
                </span>
                صفحات ذات صلة
              </h2>
            </div>
            <ul className="service-sidebar-list">
              {model.links.map((item) => (
                <li key={item.href}>
                  {item.href === "/mawaeed" || item.href.startsWith("/mawaeed/") ? (
                    <a href={item.href} className="service-sidebar-link">
                      <span>{item.label}</span>
                      <ChevronLeft aria-hidden="true" />
                    </a>
                  ) : (
                    <Link href={item.href} className="service-sidebar-link">
                      <span>{item.label}</span>
                      <ChevronLeft aria-hidden="true" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </>
  );
}

/** شريط المنطقة التعليمية في صفحة المدارس: يغيّر ?region= ويحفظ الاختيار كما تفعل /mawaeed. */
function RegionPicker({ current }: { current: RegionId }) {
  const [location, navigate] = useLocation();
  return (
    <div className="service-region">
      <p className="service-region-label">
        المنطقة التعليمية
        <span>الإجازات الرسمية موحّدة، والإضافية حسب المنطقة</span>
      </p>
      <div className="service-region-segs" role="group" aria-label="المنطقة التعليمية">
        {REGIONS.map((region) => (
          <button
            key={region.id}
            type="button"
            className="service-region-seg"
            aria-pressed={region.id === current}
            onClick={() => {
              try {
                window.localStorage.setItem(REGION_PREF_ID, region.id);
              } catch {
                /* التخزين قد يكون محجوباً؛ الاستعلام يكفي */
              }
              navigate(`${location}?region=${region.id}`, { replace: true });
            }}
          >
            {region.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Answer({ model, countdown }: { model: ServicePageModel; countdown: string }) {
  if (!model.next) {
    return <p className="service-answer-lead" id="answer">{model.leadPrefix}</p>;
  }
  const next = model.next;
  const hint = next.expectedHint?.replace(/^متوقع:\s*/, "");
  return (
    <>
      <p className="service-answer-lead" id="answer">
        {model.leadPrefix}{" "}
        <time dateTime={next.startsOn}>{next.gregorianLabel}</time>
        {" "}الموافق {next.hijriLabel}،{" "}
        <strong data-countdown data-date={next.startsOn} data-today={next.todayLabel}>{countdown || next.countdownText}</strong>.
      </p>
      {hint || model.shiftRule ? (
        <div className="service-rule-notes">
          {hint ? <p>{hint}</p> : null}
          {model.shiftRule ? <p>{model.shiftRule}</p> : null}
        </div>
      ) : null}
    </>
  );
}

/** يشارك رابط المنطقة المعروضة، حتى لو جاءت من الاختيار المحفوظ لا من الرابط. */
function ShareButton({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        if (navigator.share) {
          navigator.share({ title, url }).catch(() => {});
          return;
        }
        navigator.clipboard?.writeText(url).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2500);
        }).catch(() => {});
      }}
    >
      {copied ? (
        <Check className="ml-2 h-4 w-4" aria-hidden="true" />
      ) : (
        <Share2 className="ml-2 h-4 w-4" aria-hidden="true" />
      )}
      {copied ? "تم نسخ الرابط" : "شارك الموعد"}
    </Button>
  );
}
