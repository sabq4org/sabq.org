import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Header } from "@/components/Header";
import { NavigationBar } from "@/components/NavigationBar";
import { Footer } from "@/components/Footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OptimizedImage } from "@/components/OptimizedImage";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";
import { cleanOpinionAuthorBio, getOpinionAuthorName, type OpinionCardArticle } from "@/components/public/OpinionCard";
import { getObjectPosition } from "@/lib/imageUtils";
import { formatArticleTimestamp } from "@/lib/formatTime";
import { RefreshCw, Search, X } from "lucide-react";

// صفحة الرأي (/opinion): مقالات اليوم بحجم واحد وترتيب متناوب، وكل كاتب في يومه.
// القواعد في shared/opinionFront.ts، والبيانات من GET /api/opinion-front.

type FrontArticle = OpinionCardArticle & { readMinutes?: number; imageFocalPoint?: unknown };
type FrontWriter = {
  id: string;
  name: string;
  profileImageUrl: string | null;
  bio: string | null;
  gender: string | null;
  articleCount: number;
};
type FrontPayload = {
  today: string;
  days: { key: string; count: number; isToday: boolean; isFuture: boolean }[];
  latestDay: string | null;
  articlesByDay: Record<string, FrontArticle[]>;
  hot: FrontArticle[];
  spotlight: { writer: FrontWriter; article: FrontArticle | null } | null;
  roster: { total: number; writers: FrontWriter[] };
};

const LOCALE = "ar-u-ca-gregory-nu-latn";
const dayDate = (key: string) => new Date(`${key}T12:00:00Z`);
const weekdayName = (key: string) => dayDate(key).toLocaleDateString(LOCALE, { weekday: "long", timeZone: "UTC" });
const monthName = (key: string) => dayDate(key).toLocaleDateString(LOCALE, { month: "long", timeZone: "UTC" });
const dayNumber = (key: string) => String(Number(key.slice(8, 10)));
const authorHref = (name: string) => (name && name !== "كاتب رأي" ? `/author/${encodeURIComponent(name)}` : null);

function timeLabel(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" });
}

function WriterAvatar({ name, src, size = "h-11 w-11" }: { name: string; src?: string | null; size?: string }) {
  return (
    <Avatar className={`${size} shrink-0`}>
      <AvatarImage src={src || undefined} alt="" className="object-cover" />
      <AvatarFallback className="bg-primary/10 text-primary font-bold">{name.replace(/^(أ\.د\.|د\.)\s*/, "").charAt(0)}</AvatarFallback>
    </Avatar>
  );
}

function OpinionRow({ article, eager }: { article: FrontArticle; eager?: boolean }) {
  const name = getOpinionAuthorName(article);
  const role = cleanOpinionAuthorBio(article.author?.bio, name);
  const href = `/opinion/${article.slug}`;
  const writerHref = authorHref(name);
  const image = article.imageUrl || article.thumbnailUrl;
  const summary = article.excerpt || article.aiSummary || "";
  return (
    <article
      className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_240px] gap-x-6 gap-y-3 px-4 py-5 sm:px-7 sm:py-6 border-t border-border/60 first:border-t-0"
      data-testid={`opinion-row-${article.id}`}
    >
      <div className="flex items-center gap-3 sm:col-start-1">
        <WriterAvatar name={name} src={article.author?.profileImageUrl} />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold truncate">{name}</div>
          <div className="text-[13px] text-muted-foreground truncate">
            {role}
            {article.category?.nameAr ? ` · ${article.category.nameAr}` : ""}
          </div>
        </div>
        <time className="text-[13px] text-muted-foreground shrink-0" dateTime={article.publishedAt || undefined}>
          {timeLabel(article.publishedAt)}
        </time>
      </div>
      {image && (
        <Link
          href={href}
          className="block overflow-hidden rounded-2xl aspect-video sm:aspect-[3/2] sm:col-start-2 sm:row-start-1 sm:row-span-4 sm:self-center"
          tabIndex={-1}
          aria-hidden="true"
        >
          <OptimizedImage
            src={image}
            alt=""
            className="h-full w-full object-cover"
            wrapperClassName="h-full w-full"
            objectPosition={getObjectPosition(article, "center top")}
            width={480}
            eager={eager}
          />
        </Link>
      )}
      <h3 className="m-0 text-[19px] sm:text-2xl font-bold leading-relaxed sm:col-start-1">
        <Link href={href} className="text-foreground hover:text-primary">
          {article.title}
        </Link>
      </h3>
      {summary && (
        <p className="m-0 text-sm sm:text-base leading-8 text-muted-foreground line-clamp-3 sm:col-start-1">{summary}</p>
      )}
      <div className="flex items-center gap-4 text-[13px] text-muted-foreground sm:col-start-1">
        {article.readMinutes ? <span>{article.readMinutes} دقائق قراءة</span> : null}
        <Link href={href} className="font-semibold text-primary">
          اقرأ المقال
        </Link>
        {writerHref && (
          <Link href={writerHref} className="hidden sm:inline text-primary">
            مقالات الكاتب
          </Link>
        )}
      </div>
    </article>
  );
}

function RowsSkeleton() {
  return (
    <div className="rounded-[22px] bg-card shadow-sm overflow-hidden">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-48 m-5 rounded-2xl animate-pulse bg-muted/60" />
      ))}
    </div>
  );
}

export default function OpinionPage() {
  // يطابق <title> المحقون على الحافة (/api/edge/seo-meta) بعد تشغيل جافاسكربت.
  useEffect(() => {
    document.title = "الرأي — سبق";
  }, []);
  useAdTracking("رأي");

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: front, isLoading, isError, refetch } = useQuery<FrontPayload>({
    queryKey: ["/api/opinion-front"],
    staleTime: 60 * 1000,
  });

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [showAllWriters, setShowAllWriters] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data: searchData, isLoading: searchLoading } = useQuery<{ articles: FrontArticle[] }>({
    queryKey: [`/api/opinion?page=1&limit=20&search=${encodeURIComponent(search)}`],
    enabled: search.length >= 2,
  });
  const searchResults = Array.isArray(searchData?.articles) ? searchData!.articles : [];

  const today = front?.today ?? null;
  const days = Array.isArray(front?.days) ? front!.days : [];
  const activeDay = selectedDay ?? today;
  const todayEmpty = Boolean(today && activeDay === today && !(front?.articlesByDay?.[today]?.length));
  const listDay = todayEmpty && front?.latestDay ? front.latestDay : activeDay;
  const list = (listDay && front?.articlesByDay?.[listDay]) || [];
  const hot = Array.isArray(front?.hot) ? front!.hot : [];
  const writers = Array.isArray(front?.roster?.writers) ? front!.roster.writers : [];
  const visibleWriters = showAllWriters ? writers : writers.slice(0, 10);

  const heading = useMemo(() => {
    if (!listDay) return "مقالات اليوم";
    if (todayEmpty) return `آخر المقالات · ${weekdayName(listDay)} ${dayNumber(listDay)} ${monthName(listDay)}`;
    if (listDay === today) return "مقالات اليوم";
    return `مقالات ${weekdayName(listDay)} ${dayNumber(listDay)} ${monthName(listDay)}`;
  }, [listDay, today, todayEmpty]);

  const spotlight = front?.spotlight ?? null;
  const spotlightFemale = spotlight?.writer.gender === "female";

  return (
    <div className="public-page min-h-screen overflow-x-clip bg-background flex flex-col" dir="rtl">
      <Header user={user} />
      <NavigationBar />

      {/* DMS: الليدربورد مباشرة تحت القائمة الرئيسية (طلب DMS 2026-09-29) */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-4 max-w-6xl empty:hidden">
        <DmsLeaderboardAd />
      </div>

      <main className="flex-1 container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-6 pb-16 flex flex-col gap-7 sm:gap-8">
        <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5" data-testid="section-hero">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-muted-foreground">
              {today ? `${weekdayName(today)} ${dayNumber(today)} ${monthName(today)} ${today.slice(0, 4)}` : "صفحة الرأي"}
            </span>
            <h1 className="m-0 text-[32px] sm:text-[44px] font-bold" data-testid="text-page-title">
              الرأي
            </h1>
            <p className="m-0 text-[15px] sm:text-[17px] text-muted-foreground" data-testid="text-page-tagline">
              مقالات اليوم أولًا، وكل كاتب يظهر في يومه.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative flex items-center gap-2 bg-card border border-border rounded-full h-[46px] px-4 flex-1 lg:w-80 lg:flex-none">
              <Search className="h-[18px] w-[18px] text-muted-foreground shrink-0" aria-hidden="true" />
              <label htmlFor="opinion-search" className="sr-only">
                ابحث في مقالات الرأي
              </label>
              <input
                id="opinion-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="ابحث بعنوان أو اسم كاتب"
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px]"
                data-testid="input-opinion-search"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="no-min-touch-size text-muted-foreground hover:text-foreground"
                  aria-label="مسح البحث"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <a
              href="#opinion-writers"
              className="h-[46px] hidden sm:inline-flex items-center px-5 rounded-full bg-primary/10 text-primary font-semibold text-[15px] shrink-0"
            >
              دليل الكتّاب
            </a>
          </div>
        </section>

        {search.length >= 2 ? (
          <section className="flex flex-col gap-3" data-testid="opinion-search-results">
            <h2 className="m-0 text-xl sm:text-2xl font-bold">نتائج «{search}»</h2>
            {searchLoading ? (
              <RowsSkeleton />
            ) : searchResults.length ? (
              <div className="rounded-[22px] bg-card shadow-sm overflow-hidden">
                {searchResults.map((a) => (
                  <OpinionRow key={a.id} article={a} />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">لا توجد مقالات تطابق البحث.</p>
            )}
          </section>
        ) : (
          <>
            <section
              aria-label="أيام الأسبوع"
              className="flex gap-2 sm:gap-2.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-1"
              data-testid="opinion-week-strip"
            >
              {days.map((d) => {
                const on = d.key === activeDay;
                return (
                  <button
                    key={d.key}
                    type="button"
                    disabled={d.isFuture}
                    onClick={() => setSelectedDay(d.key)}
                    aria-pressed={on}
                    className={`flex flex-col items-center justify-center gap-0.5 shrink-0 w-[72px] sm:w-auto sm:flex-1 min-h-[76px] sm:min-h-[84px] rounded-[20px] border transition-colors ${
                      on
                        ? "bg-primary border-primary text-primary-foreground shadow-[0_6px_18px_rgba(30,155,230,0.28)]"
                        : d.isFuture
                          ? "bg-muted/40 border-border/50 text-muted-foreground/70 cursor-default"
                          : "bg-card border-border text-foreground hover:border-primary/50"
                    }`}
                    data-testid={`button-opinion-day-${d.key}`}
                  >
                    <span className="text-xs sm:text-sm font-semibold">{weekdayName(d.key)}</span>
                    <span className="text-[19px] sm:text-[22px] font-bold">{dayNumber(d.key)}</span>
                    <span className="text-[11px] sm:text-xs opacity-85">
                      {d.isFuture ? "قريبًا" : `${d.isToday ? "اليوم · " : ""}${d.count} مقالات`}
                    </span>
                  </button>
                );
              })}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-7 lg:gap-8 items-start">
              <section className="flex flex-col gap-3.5 min-w-0" data-testid="opinion-day-list">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                  <h2 className="m-0 text-[21px] sm:text-2xl font-bold">{heading}</h2>
                  <span className="flex items-center gap-1.5 text-xs sm:text-[13px] text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {listDay === today ? "الترتيب يتناوب كل ساعة، فيأخذ كل مقال دوره في الأعلى" : "بترتيب وقت النشر"}
                  </span>
                </div>
                {isLoading ? (
                  <RowsSkeleton />
                ) : isError ? (
                  <div className="rounded-[22px] bg-card shadow-sm p-8 text-center flex flex-col items-center gap-3">
                    <p className="m-0 text-muted-foreground">تعذر تحميل مقالات الرأي.</p>
                    <button type="button" onClick={() => refetch()} className="rounded-full bg-primary text-primary-foreground px-5 h-11 font-semibold">
                      إعادة المحاولة
                    </button>
                  </div>
                ) : list.length ? (
                  <div className="rounded-[22px] bg-card shadow-[0_1px_2px_rgba(27,43,58,0.04),0_8px_24px_rgba(27,43,58,0.04)] overflow-hidden">
                    {list.map((a, i) => (
                      <OpinionRow key={a.id} article={a} eager={i < 2} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[22px] bg-card shadow-sm p-8 text-center text-muted-foreground">لا توجد مقالات في هذا اليوم.</div>
                )}
              </section>

              <aside className="flex flex-col gap-6">
                {hot.length > 0 && (
                  <section className="rounded-[22px] bg-card shadow-sm p-5 sm:p-6" data-testid="opinion-hot">
                    <h2 className="m-0 text-lg sm:text-[19px] font-bold">يقرؤونه الآن</h2>
                    <p className="mt-1.5 mb-3 text-xs sm:text-[13px] leading-relaxed text-muted-foreground">
                      حسب سرعة القراءة لمقالات آخر 3 أيام، لا مجموع المشاهدات. مقال واحد لكل كاتب.
                    </p>
                    <ol className="list-none m-0 p-0">
                      {hot.map((a, i) => (
                        <li key={a.id} className="flex gap-3 py-3 border-t border-border/60">
                          <span className="text-lg sm:text-xl font-bold text-primary w-5 shrink-0">{i + 1}</span>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <Link href={`/opinion/${a.slug}`} className="text-[15px] font-semibold leading-relaxed text-foreground hover:text-primary">
                              {a.title}
                            </Link>
                            <span className="text-xs sm:text-[13px] text-muted-foreground">
                              {getOpinionAuthorName(a)}
                              {a.publishedAt ? ` · ${formatArticleTimestamp(new Date(a.publishedAt))}` : ""}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}

                <DmsMpuAd topSlot />

                {spotlight && (
                  <section
                    className="rounded-[22px] p-5 sm:p-6 bg-gradient-to-br from-[#EAF6FF] to-[#F1EEFF] dark:from-primary/10 dark:to-primary/5 flex flex-col gap-3"
                    data-testid="opinion-spotlight"
                  >
                    <span className="text-xs sm:text-[13px] font-semibold text-primary">تعرّف على {spotlightFemale ? "كاتبة" : "كاتب"}</span>
                    <div className="flex items-center gap-3">
                      <WriterAvatar name={spotlight.writer.name} src={spotlight.writer.profileImageUrl} size="h-[52px] w-[52px]" />
                      <div className="flex flex-col min-w-0">
                        {authorHref(spotlight.writer.name) ? (
                          <Link href={authorHref(spotlight.writer.name)!} className="text-[17px] font-bold text-foreground hover:text-primary">
                            {spotlight.writer.name}
                          </Link>
                        ) : (
                          <span className="text-[17px] font-bold">{spotlight.writer.name}</span>
                        )}
                        <span className="text-xs sm:text-[13px] text-muted-foreground">
                          {cleanOpinionAuthorBio(spotlight.writer.bio, spotlight.writer.name)}
                        </span>
                      </div>
                    </div>
                    {spotlight.article && (
                      <Link href={`/opinion/${spotlight.article.slug}`} className="text-[15px] font-semibold leading-relaxed text-foreground hover:text-primary">
                        {spotlightFemale ? "آخر مقالاتها" : "آخر مقالاته"}: {spotlight.article.title}
                      </Link>
                    )}
                    <span className="text-xs text-muted-foreground">يتبدّل يوميًا بين الكتّاب الأقل ظهورًا هذا الشهر.</span>
                  </section>
                )}

                {writers.length > 0 && (
                  <section id="opinion-writers" className="rounded-[22px] bg-card shadow-sm p-5 sm:p-6 flex flex-col gap-3.5 scroll-mt-24" data-testid="opinion-writers">
                    <div className="flex items-center justify-between">
                      <h2 className="m-0 text-lg sm:text-[19px] font-bold">كتّاب سبق</h2>
                      {writers.length > 10 && (
                        <button
                          type="button"
                          onClick={() => setShowAllWriters((v) => !v)}
                          className="text-sm font-semibold text-primary min-h-[44px]"
                          data-testid="button-opinion-writers-all"
                        >
                          {showAllWriters ? "أقل" : `الكل (${front?.roster.total ?? writers.length})`}
                        </button>
                      )}
                    </div>
                    <p className="m-0 text-xs sm:text-[13px] text-muted-foreground">مرتبون أبجديًا، لا حسب المشاهدات.</p>
                    <div className="grid grid-cols-5 gap-2.5">
                      {visibleWriters.map((w) => {
                        const href = authorHref(w.name);
                        const short = w.name.replace(/^(أ\.د\.|د\.)\s*/, "").split(" ").slice(0, 2).join(" ");
                        const body = (
                          <>
                            <WriterAvatar name={w.name} src={w.profileImageUrl} size="h-[46px] w-[46px]" />
                            <span className="text-[11px] text-center leading-snug line-clamp-2">{short}</span>
                          </>
                        );
                        return href ? (
                          <Link key={w.id} href={href} className="flex flex-col items-center gap-1.5 text-foreground hover:text-primary" title={w.name}>
                            {body}
                          </Link>
                        ) : (
                          <div key={w.id} className="flex flex-col items-center gap-1.5">
                            {body}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </aside>
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
