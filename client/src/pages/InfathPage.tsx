import { Fragment, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { InfathLogo } from "@/components/infath/InfathLogo";
import { useCanonical } from "@/hooks/useCanonical";
import { apiUrl } from "@/lib/queryClient";
import "@/styles/infath-page.css";
import {
  ASSET_FORMS,
  AUCTION_FORMS,
  INFATH_CATEGORIES,
  INFATH_DAY_NAMES,
  INFATH_REGIONS,
  arCount,
  auctionPhase,
  auctionStartMs,
  formatDateNumeric,
  formatLabel,
  formatSarParts,
  formatTime12,
  formatWeekRange,
  regionLabel,
  riyadhToday,
  summarizeWeek,
  weekdayOf,
  type InfathAuction,
  type InfathCategory,
  type InfathPublicView,
  type InfathRegion,
} from "@shared/infath";

const CANONICAL = "https://sabq.org/infath";
const INFATH_SITE = "https://infath.gov.sa";

/** ساعة الصفحة: تدق كل 15 ثانية لتحريك العدّاد وحالات «جارٍ الآن». */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** يعدّ الرقم من الصفر عند أول ظهور، ويحترم تقليل الحركة. */
function useCountUp(target: number, decimals: number): string {
  const [value, setValue] = useState(target);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target <= 0) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 1100);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value.toFixed(decimals);
}

function shortUnit(unit: string): string {
  return unit === "مليون" ? "م" : unit;
}

function dayLabel(date: string): string {
  return INFATH_DAY_NAMES[weekdayOf(date)];
}

function stampText(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 16);
  return `${dayLabel(date)} ${formatDateNumeric(date)} ${formatTime12(time)}`;
}

function Harvest({ view, nowMs }: { view: InfathPublicView; nowMs: number }) {
  const { weekStart, weekEnd, auctions, updatedAt } = view.week;
  const summary = useMemo(() => summarizeWeek(weekStart, auctions), [weekStart, auctions]);
  const today = riyadhToday(new Date(nowMs));
  const finished = today > weekEnd;
  const parts = formatSarParts(summary.soldValue);
  const decimals = parts.value.includes(".") ? parts.value.split(".")[1].length : 0;
  const counted = useCountUp(Number(parts.value), decimals);
  const daysWithResults = summary.byDay.filter((d) => d.held > 0).length;
  const maxDay = Math.max(1, ...summary.byDay.map((d) => d.soldValue));
  const pct = summary.sellThrough ?? 0;
  const C = 2 * Math.PI * 16;
  return (
    <section className="group harv" aria-label="حصاد الأسبوع">
      <div>
        <div className="hv-k"><i />{finished ? "حصاد الأسبوع" : "حصاد هذا الأسبوع حتى الآن"}</div>
        <div className="hv-v">
          <span className="num">{counted}</span>
          <small>{[parts.unit, "ريال"].filter(Boolean).join(" ")}</small>
        </div>
        <div className="hv-sub">
          {daysWithResults
            ? <>من {arCount(daysWithResults, { one: "يوم مزادات واحد", two: "يومي مزادات", few: "أيام مزادات", many: "يوم مزادات" })} · آخر تحديث {stampText(updatedAt)}</>
            : <>تظهر المبيعات هنا بعد أول يوم مزادات · آخر تحديث {stampText(updatedAt)}</>}
        </div>
        <div className="hv-stats">
          <div><b className="num">{summary.assetsSold}</b><span>أصلًا بيعت</span></div>
          <div><b className="num">{summary.held}</b><span>مزادًا اكتمل</span></div>
          <div className="hv-ring">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="16" fill="none" stroke="#E3EAF1" strokeWidth="5" />
              <circle cx="20" cy="20" r="16" fill="none" stroke="#0E7A4B" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 20 20)" />
            </svg>
            <div><b className="num">{summary.sellThrough === null ? "—" : `${pct}%`}</b><span>نسبة البيع</span></div>
          </div>
        </div>
      </div>
      <div>
        <div className="hv-top">
          <span className="lbl">المبيعات يومًا بيوم</span>
          {!finished && <span className="lbl">الأيام القادمة: عدد المزادات المجدولة</span>}
        </div>
        <div className="track">
          {summary.byDay.map((d, index) => {
            const state = d.date < today || finished ? "done" : d.date === today ? "live" : d.auctions ? "fut" : "off";
            const sold = formatSarParts(d.soldValue);
            const height = state === "fut" ? Math.min(104, Math.max(18, d.auctions * 9))
              : state === "off" || (state === "done" && !d.soldValue) ? 6
              : Math.max(10, (d.soldValue / maxDay) * 104);
            const label = state === "fut" ? `${d.auctions} مزاد`
              : d.soldValue ? `${sold.value} ${shortUnit(sold.unit)}`.trim() : "";
            return (
              <div key={d.date} className={`tcol ${state === "done" ? "" : state}${state === "done" && !d.soldValue ? " off" : ""}`}>
                <span className="v">{label}</span>
                <span className="b" style={{ height, animationDelay: `${index * 0.12}s` }} />
                <span className="d">{state === "live" ? "اليوم" : dayLabel(d.date).replace(/^ال/, "")}</span>
              </div>
            );
          })}
        </div>
        {summary.top && (
          <div className="hv-best">
            <span>أعلى مزاد حصيلةً{finished ? "" : " حتى الآن"}</span>
            <b>{summary.top.assetType} في {summary.top.city} · <span className="num" style={{ color: "var(--ink)" }}>{formatSarParts(summary.top.soldValue).value}</span> {formatSarParts(summary.top.soldValue).unit} ريال</b>
          </div>
        )}
      </div>
    </section>
  );
}

function Countdown({ target, nowMs }: { target: number; nowMs: number }) {
  const ms = Math.max(0, target - nowMs);
  const minutes = Math.floor(ms / 60000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="cd" aria-live="off">
      <div><b className="num">{Math.floor(minutes / 1440)}</b><small>يوم</small></div>
      <div><b className="num">{pad(Math.floor((minutes % 1440) / 60))}</b><small>ساعة</small></div>
      <div><b className="num">{pad(minutes % 60)}</b><small>دقيقة</small></div>
    </div>
  );
}

type Filters = { region: InfathRegion | "all"; category: InfathCategory | "all"; day: string | null; showPast: boolean };

export default function InfathPage() {
  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const week = params.get("week");
  const preview = params.get("preview");
  const path = preview
    ? `/api/infath/admin/weeks/${encodeURIComponent(preview)}/preview`
    : week ? `/api/infath?week=${encodeURIComponent(week)}` : "/api/infath";
  const viewQuery = useQuery<InfathPublicView | null>({
    queryKey: ["/api/infath", { week, preview }],
    queryFn: async () => {
      const res = await fetch(apiUrl(path), { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`تعذر تحميل المزادات (${res.status})`);
      return (await res.json()) as InfathPublicView;
    },
    retry: preview ? false : 2,
    placeholderData: keepPreviousData,
  });
  const view = viewQuery.data ?? null;
  const nowMs = useNow();
  const [filters, setFilters] = useState<Filters>({ region: "all", category: "all", day: null, showPast: false });
  useCanonical(CANONICAL);
  useEffect(() => {
    document.title = "مزادات إنفاذ العقارية هذا الأسبوع — سبق";
  }, []);
  useEffect(() => {
    setFilters({ region: "all", category: "all", day: null, showPast: false });
  }, [view?.week.weekStart]);

  const auctions = view?.week.auctions ?? [];
  const regionsInWeek = useMemo(() => INFATH_REGIONS.filter((r) => auctions.some((a) => a.region === r.id)), [auctions]);
  const inRegion = (a: InfathAuction) => filters.region === "all" || a.region === filters.region;
  const live = auctions.filter((a) => a.resultStatus !== "cancelled");
  const regional = live.filter(inRegion);
  const next = regional
    .filter((a) => auctionPhase(a, nowMs) === "upcoming")
    .sort((x, y) => auctionStartMs(x.date, x.time) - auctionStartMs(y.date, y.time))[0];
  const upcomingOrLive = regional.filter((a) => {
    const phase = auctionPhase(a, nowMs);
    return phase === "upcoming" || phase === "live";
  }).length;
  const today = riyadhToday(new Date(nowMs));
  const weekDays = useMemo(() => (view ? summarizeWeek(view.week.weekStart, []).byDay.map((d) => d.date) : []), [view]);
  const listed = auctions.filter((a) => inRegion(a)
    && (filters.category === "all" || a.category === filters.category)
    && (filters.day === null || a.date === filters.day));
  const hidePast = filters.day === null && !filters.showPast;
  const pastCount = listed.filter((a) => auctionPhase(a, nowMs) !== "upcoming" && auctionPhase(a, nowMs) !== "live").length;
  const rows = hidePast ? listed.filter((a) => { const p = auctionPhase(a, nowMs); return p === "upcoming" || p === "live"; }) : listed;
  const previous = view?.previous ?? null;
  const goWeek = (w: string | null) => navigate(w ? `/infath?week=${w}` : "/infath");

  return (
    <div className="min-h-screen" dir="rtl" style={{ background: "#F5F7FA" }}>
      <Header user={user || undefined} />
      <div className="inf-page">
        <main className="inf-main">
          <nav className="crumb" aria-label="مسار التنقل"><Link href="/">الرئيسية</Link> › مزادات إنفاذ</nav>
          {view?.preview && (
            <div className="preview-bar" role="status">معاينة قبل الاعتماد — هذه الصفحة لا يراها القراء حتى يعتمد محرر سبق الأسبوع.</div>
          )}
          {viewQuery.isLoading ? (
            <p className="state">جارٍ تحميل المزادات…</p>
          ) : viewQuery.isError ? (
            <p className="state">تعذر تحميل المزادات الآن. حاول بعد قليل.</p>
          ) : !view ? (
            <div className="state">
              <InfathLogo className="ilogo" />
              <p>لا توجد مزادات منشورة حاليًا. يُنشر جدول الأسبوع كل يوم أحد.</p>
            </div>
          ) : (
            <>
              <div className="head">
                <div>
                  <h1>مزادات إنفاذ العقارية</h1>
                  <p>المزادات العقارية التي يشرف عليها مركز الإسناد والتصفية · آخر تحديث {stampText(view.week.updatedAt)}</p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="partner"><InfathLogo className="ilogo" /></span>
                  {!view.preview && (
                    <div className="weeknav" aria-label="تغيير الأسبوع">
                      <button type="button" aria-label="الأسبوع السابق" disabled={!view.nav.prev} onClick={() => goWeek(view.nav.prev)}>‹</button>
                      <span>{formatWeekRange(view.week.weekStart)}</span>
                      <button type="button" aria-label="الأسبوع التالي" disabled={!view.nav.next} onClick={() => goWeek(view.nav.next)}>›</button>
                    </div>
                  )}
                </div>
              </div>

              <Harvest view={view} nowMs={nowMs} />

              <section className="group hero" aria-label="أقرب مزاد">
                <div>
                  <div className="lbl">أقرب مزاد في</div>
                  <div className="regpick" role="group" aria-label="اختر منطقتك">
                    {[{ id: "all" as const, ar: "كل المناطق" }, ...regionsInWeek].map((r) => (
                      <button key={r.id} type="button" className={`chip${filters.region === r.id ? " on" : ""}`} aria-pressed={filters.region === r.id}
                        onClick={() => setFilters((f) => ({ ...f, region: r.id }))}>{r.ar}</button>
                    ))}
                  </div>
                  {next ? (
                    <>
                      <div className="next-what">{next.city} · {next.assetType} · {arCount(next.assetsCount, ASSET_FORMS)}</div>
                      <Countdown target={auctionStartMs(next.date, next.time)} nowMs={nowMs} />
                      <div className="next-meta">{dayLabel(next.date)} <span className="num">{formatDateNumeric(next.date)}</span> · {formatTime12(next.time)} بتوقيت الرياض · {formatLabel(next.format)}</div>
                      <a className="go" href={next.url || INFATH_SITE} target="_blank" rel="noopener noreferrer">{next.url ? "صفحة المزاد على موقع إنفاذ" : "موقع إنفاذ"} ↖</a>
                    </>
                  ) : (
                    <>
                      <div className="next-what">لا مزادات قادمة {filters.region === "all" ? "" : `في ${regionLabel(filters.region)} `}هذا الأسبوع</div>
                      <div className="next-meta">نعرض مزادات الأسبوع القادم فور اعتمادها.</div>
                    </>
                  )}
                </div>
                <div>
                  <div className="lbl">{filters.region === "all" ? "هذا الأسبوع في المملكة" : `هذا الأسبوع في ${regionLabel(filters.region)}`}</div>
                  <div className="kp">
                    <div><b className="num">{regional.length}</b><span>مزادًا</span></div>
                    <div><b className="num">{regional.reduce((s, a) => s + a.assetsCount, 0)}</b><span>أصلًا عقاريًا</span></div>
                    <div><b className="num">{upcomingOrLive}</b><span>مزادًا لم يبدأ أو جارٍ الآن</span></div>
                    <div>
                      {previous ? (
                        <>
                          <b><span className="num">{formatSarParts(previous.soldValue).value}</span> <small style={{ fontSize: 14, fontWeight: 500 }}>{formatSarParts(previous.soldValue).unit}</small></b>
                          <span>مبيعات الأسبوع الماضي</span>{" "}
                          {previous.changePct !== null && previous.changePct !== 0 && (
                            <em style={previous.changePct < 0 ? { color: "var(--amber)" } : undefined}>{previous.changePct > 0 ? "▲" : "▼"} <span className="num">{Math.abs(previous.changePct)}%</span></em>
                          )}
                        </>
                      ) : (
                        <><b className="num">{regionsInWeek.length}</b><span>منطقة فيها مزادات</span></>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <div className="cols">
                <section className="group" aria-label="جدول المزادات">
                  <div className="gh"><h2>جدول المزادات</h2><span className="s">اضغط يومًا لعرضه وحده</span></div>
                  <div className="days">
                    {weekDays.map((date) => {
                      const count = regional.filter((a) => a.date === date).length;
                      const on = filters.day === date;
                      return (
                        <button key={date} type="button" aria-pressed={on}
                          className={`day${on ? " on" : ""}${date === today ? " today" : ""}${count === 0 ? " zero" : ""}`}
                          onClick={() => setFilters((f) => ({ ...f, day: f.day === date ? null : date }))}>
                          <span className="d">{dayLabel(date).replace(/^ال/, "")}</span>
                          <span className="n num">{Number(date.slice(8))}</span>
                          <span className="bar2"><i style={{ width: `${Math.min(100, (count / 7) * 100)}%` }} /></span>
                          <span className="c">{count ? `${count} مزاد` : "لا شيء"}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="filters">
                    <span className="lbl">النوع</span>
                    {[{ id: "all" as const, ar: "الكل" }, ...INFATH_CATEGORIES].map((c) => (
                      <button key={c.id} type="button" className={`chip${filters.category === c.id ? " on" : ""}`} aria-pressed={filters.category === c.id}
                        onClick={() => setFilters((f) => ({ ...f, category: c.id }))}>{c.ar}</button>
                    ))}
                    <span className="count">{arCount(listed.length, AUCTION_FORMS)}</span>
                  </div>
                  <div className="rows">
                    {!listed.length ? (
                      <div className="empty">
                        لا مزادات تطابق اختيارك.<br />
                        <button type="button" className="chip" onClick={() => setFilters({ region: "all", category: "all", day: null, showPast: false })}>عرض كل المزادات</button>
                      </div>
                    ) : (
                      <>
                        {hidePast && pastCount > 0 && (
                          <div className="dayhead" style={{ textAlign: "center" }}>
                            <button type="button" className="chip" onClick={() => setFilters((f) => ({ ...f, showPast: true }))}>
                              عرض {arCount(pastCount, AUCTION_FORMS)} {pastCount === 1 ? "انتهى" : "انتهت"} هذا الأسبوع
                            </button>
                          </div>
                        )}
                        {rows.map((a, index) => {
                          const phase = auctionPhase(a, nowMs);
                          const newDay = index === 0 || rows[index - 1].date !== a.date;
                          const sold = a.resultStatus === "held" && a.soldValue != null ? formatSarParts(a.soldValue) : null;
                          return (
                            <Fragment key={a.id}>
                              {newDay && <div className="dayhead">{dayLabel(a.date)} <span className="num">{formatDateNumeric(a.date).replace(/\/\d{4}$/, "")}</span></div>}
                              <div className={`r${phase === "past" || phase === "cancelled" ? " past" : ""}`}>
                                <span className="t">{a.time}</span>
                                <span className="w">
                                  <b>{a.city}</b>
                                  <span>
                                    {a.assetType}{a.city !== regionLabel(a.region) ? ` · منطقة ${regionLabel(a.region)}` : ""}
                                    {sold && a.assetsSold != null ? ` · بيع ${a.assetsSold} من ${a.assetsCount} بـ ${sold.value} ${sold.unit} ريال` : ""}
                                  </span>
                                </span>
                                <span className="a"><b className="num">{a.assetsCount}</b> {a.assetsCount > 2 && a.assetsCount < 11 ? "أصول" : "أصلًا"}</span>
                                <span className="tg">
                                  {phase === "cancelled" ? <span className="tag done">أُلغي</span>
                                    : phase === "past" ? <span className="tag done">انتهى</span>
                                    : phase === "live" ? <span className="tag live">جارٍ الآن</span>
                                    : a.url ? <a className="tag blue" href={a.url} target="_blank" rel="noopener noreferrer">{formatLabel(a.format)} ↖</a>
                                    : <span className={`tag${a.format === "online" ? " blue" : ""}`}>{formatLabel(a.format)}</span>}
                                </span>
                              </div>
                            </Fragment>
                          );
                        })}
                      </>
                    )}
                  </div>
                </section>

                <aside className="side">
                  {previous && (
                    <section className="group">
                      <div className="gh"><h2>حصاد الأسبوع الماضي</h2><span className="s">{formatWeekRange(previous.weekStart, false)}</span></div>
                      <div className="sec-pad">
                        <div className="big"><span className="num">{formatSarParts(previous.soldValue).value}</span> <small>{formatSarParts(previous.soldValue).unit} ريال</small></div>
                        <div className="sold">
                          بيع <span className="num">{previous.assetsSold}</span> أصلًا من <span className="num">{previous.assets}</span> معروضًا
                          {previous.sellThrough !== null && <> (<span className="num">{previous.sellThrough}%</span>)</>}
                        </div>
                        <div className="hb">
                          {(() => {
                            const top = previous.byRegion.slice(0, 4);
                            const rest = previous.byRegion.slice(4).reduce((s, r) => s + r.soldValue, 0);
                            const bars = [...top.map((r) => ({ label: regionLabel(r.region), value: r.soldValue })), ...(rest > 0 ? [{ label: "بقية المناطق", value: rest }] : [])];
                            const max = Math.max(1, ...bars.map((b) => b.value));
                            return bars.map((b) => (
                              <div key={b.label}>
                                <div className="l"><span>{b.label}</span><span>{formatSarParts(b.value).value} {formatSarParts(b.value).unit}</span></div>
                                <div className="tr"><i style={{ width: `${(b.value / max) * 100}%` }} /></div>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </section>
                  )}
                  {view.history.length > 1 && (
                    <section className="group">
                      <div className="gh"><h2>المبيعات أسبوعًا بأسبوع</h2><span className="s">آخر {view.history.length} أسابيع</span></div>
                      <div className="sec-pad chart"><HistoryChart history={view.history} /></div>
                    </section>
                  )}
                  {view.archive.length > 0 && (
                    <section className="group">
                      <div className="gh"><h2>الأسابيع السابقة</h2></div>
                      <div className="list2" style={{ paddingTop: 6 }}>
                        {view.archive.slice(0, 6).map((w) => (
                          <Link key={w.weekStart} href={`/infath?week=${w.weekStart}`} className="it" style={{ color: "inherit", textDecoration: "none" }}>
                            <div>{formatWeekRange(w.weekStart, false)}<br /><span>{arCount(w.auctions, AUCTION_FORMS)} · {arCount(w.assets, ASSET_FORMS)}</span></div>
                            <b className="num" style={{ fontWeight: 600 }}>{formatSarParts(w.soldValue).value} {formatSarParts(w.soldValue).unit}</b>
                          </Link>
                        ))}
                      </div>
                    </section>
                  )}
                </aside>
              </div>

              <div className="foot footrow">
                <InfathLogo className="ilogo" />
                <div>
                  البيانات من مركز الإسناد والتصفية «إنفاذ» وتُحدَّث أسبوعيًا. المواعيد بتوقيت الرياض. شروط المشاركة والعربون وتفاصيل كل أصل في صفحة المزاد على{" "}
                  <a href={INFATH_SITE} target="_blank" rel="noopener noreferrer">infath.gov.sa</a>. هذه الصفحة لا تشمل مزادات التركات أو المنقولات.
                </div>
              </div>
            </>
          )}
        </main>
      </div>
      <Footer />
    </div>
  );
}

function HistoryChart({ history }: { history: { weekStart: string; soldValue: number }[] }) {
  const W = 300, H = 130, pad = 22, bw = 24;
  const max = Math.max(1, ...history.map((w) => w.soldValue)) * 1.12;
  const gap = history.length > 1 ? (W - pad * 2 - bw * history.length) / (history.length - 1) : 0;
  const unit = formatSarParts(max).unit;
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label={`قيمة المبيعات الأسبوعية آخر ${history.length} أسابيع`}>
      {[0, 0.5, 1].map((f) => {
        const y = H - f * (H - 10);
        return <line key={f} x1={pad} x2={W - pad} y1={y} y2={y} stroke="#EEF2F6" />;
      })}
      {history.map((w, i) => {
        // الأقدم يمينًا كما في القراءة العربية.
        const x = W - pad - bw - i * (bw + gap);
        const h = Math.max(2, (w.soldValue / max) * (H - 10));
        const y = H - h;
        const last = i === history.length - 1;
        const parts = formatSarParts(w.soldValue);
        const [, m, d] = w.weekStart.split("-").map(Number);
        return (
          <g key={w.weekStart}>
            <rect x={x} y={y} width={bw} height={h} rx={5} fill={last ? "#1E9BE6" : "#CFE6F7"}>
              <title>{formatWeekRange(w.weekStart)}: {parts.value} {parts.unit} ريال</title>
            </rect>
            {last && <text x={x + bw / 2} y={y - 5} fontSize="10" fontWeight="700" fill="#0F2233" textAnchor="middle">{parts.unit === unit ? parts.value : `${parts.value} ${parts.unit}`}</text>}
            {(i % 2 === 1 || last) && <text x={x + bw / 2} y={H + 16} fontSize="9" fill="#5B6B7C" textAnchor="middle">{`${d}/${m}`}</text>}
          </g>
        );
      })}
    </svg>
  );
}
