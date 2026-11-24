/**
 * صفحة الكاتب العامة — /author/:name
 * هيرو هادئ (يوم الكتابة، عدد المقالات منذ بدايته، متابعة)، ثم أحدث مقال،
 * ثم المقالات مجمّعة بالشهر، وبجانبها «كتّاب اليوم نفسه» وموعده القادم.
 * بلا أعداد مشاهدات. الإضافات من writer في GET /api/authors/by-name.
 */
import { useEffect, useMemo } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { NavigationBar } from "@/components/NavigationBar";
import { Footer } from "@/components/Footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OptimizedImage } from "@/components/OptimizedImage";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useCanonical } from "@/hooks/useCanonical";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { CalendarDays, Check, Loader2, Share2 } from "lucide-react";

const PAGE_SIZE = 18;
const LOCALE = "ar-u-ca-gregory-nu-latn";
const TZ = "Asia/Riyadh";
const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

type AuthorArticle = {
  id: string;
  title: string;
  excerpt: string | null;
  slug: string;
  englishSlug: string | null;
  articleType: string | null;
  imageUrl?: string | null;
  publishedAt: string | null;
  categoryNameAr?: string | null;
};

type WriterExtras = {
  weekday: number | null;
  nextDayKey: string | null;
  usualCategories: string[];
  peers: { id: string; name: string; avatarUrl: string | null }[];
};

type AuthorPage = {
  author: {
    id: string;
    name: string;
    role: string;
    avatarUrl: string | null;
    bio: string | null;
  };
  stats: {
    articleCount: number;
    earliestPublish?: string | null;
  };
  recentArticles: AuthorArticle[];
  pagination?: { page: number; limit: number; hasMore: boolean };
  writer?: WriterExtras | null;
};

function articleHref(a: AuthorArticle): string {
  const slug = a.englishSlug || a.slug;
  return a.articleType === "opinion" ? `/opinion/${slug}` : `/article/${slug}`;
}

function initialsOf(name: string): string {
  const clean = name.replace(/^(د\.|أ\.د\.|م\.)\s*/, "").trim();
  return clean.charAt(0) || "س";
}

/** صيغة العدد العربية: مقال واحد، مقالان، 3–10 مقالات، 11+ مقالًا. */
function countLabel(n: number) {
  if (n === 0) return "لا مقالات";
  if (n === 1) return "مقال واحد";
  if (n === 2) return "مقالان";
  if (n <= 10) return `${n} مقالات`;
  return `${n} مقالًا`;
}

function validDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dayLabel = (d: Date) => d.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const monthYear = (d: Date) => d.toLocaleDateString(LOCALE, { month: "long", year: "numeric", timeZone: TZ });
const monthKey = (d: Date) => d.toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", timeZone: TZ });
const dayKeyLabel = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function metaLine(a: AuthorArticle) {
  const d = validDate(a.publishedAt);
  return [d ? dayLabel(d) : null, a.categoryNameAr].filter(Boolean).join(" · ");
}

function ArticleThumb({ src, className, eager = false }: { src?: string | null; className: string; eager?: boolean }) {
  return (
    <div className={`${className} overflow-hidden bg-gradient-to-br from-sky-100 to-violet-100`} aria-hidden="true">
      {src ? (
        <OptimizedImage src={src} alt="" className="h-full w-full object-cover" wrapperClassName="h-full w-full" objectPosition="center top" width={480} eager={eager} />
      ) : null}
    </div>
  );
}

function WriterAvatar({ name, src, className, textClass }: { name: string; src?: string | null; className: string; textClass: string }) {
  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt="" className="object-cover" /> : null}
      <AvatarFallback className={`bg-white text-[#0B6FA8] font-bold ${textClass}`}>{initialsOf(name)}</AvatarFallback>
    </Avatar>
  );
}

function FollowButton({ authorId, authorName, className }: { authorId: string; authorName: string; className: string }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isSelf = user?.id === authorId;
  const { data } = useQuery<{ isFollowing: boolean } | null>({
    queryKey: [`/api/social/is-following/${authorId}`],
    enabled: !!user && !isSelf,
  });
  const following = Boolean(data?.isFollowing);
  const mutation = useMutation({
    mutationFn: () =>
      following
        ? apiRequest(`/api/social/unfollow/${authorId}`, { method: "DELETE" })
        : apiRequest("/api/social/follow", { method: "POST", body: JSON.stringify({ followingId: authorId }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/social/is-following/${authorId}`] });
      toast({ title: following ? "ألغيت متابعة الكاتب" : `تتابع الآن ${authorName}` });
    },
    onError: () => toast({ title: "تعذّر تنفيذ المتابعة، حاول مرة أخرى", variant: "destructive" }),
  });

  if (isSelf) return null;

  const onClick = () => {
    if (!user) {
      try {
        localStorage.setItem("redirectAfterLogin", window.location.pathname + window.location.search);
      } catch {
        /* التخزين غير متاح */
      }
      navigate("/login");
      return;
    }
    mutation.mutate();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={mutation.isPending}
      aria-pressed={following}
      data-testid="button-follow-author"
      className={`${className} inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:opacity-60 ${
        following ? "border border-[#BFE3FA] bg-white text-[#0B6FA8] hover:bg-sky-50" : "bg-[#1E9BE6] text-white hover:bg-[#178AD0]"
      }`}
    >
      {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : following ? <Check className="h-4 w-4" /> : null}
      {following ? "تتابع الكاتب" : "تابِع الكاتب"}
    </button>
  );
}

function ShareButton({ name }: { name: string }) {
  const { toast } = useToast();
  const onShare = async () => {
    const url = window.location.href.split("?")[0];
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    try {
      if (nav.share) {
        await nav.share({ title: `${name} — سبق`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast({ title: "نُسخ رابط صفحة الكاتب" });
    } catch {
      /* ألغى المستخدم المشاركة */
    }
  };
  return (
    <button
      type="button"
      onClick={onShare}
      aria-label="مشاركة صفحة الكاتب"
      data-testid="button-share-author"
      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#E3E9F0] bg-white text-[#5B6B7A] hover:bg-slate-50"
    >
      <Share2 className="h-[18px] w-[18px]" />
    </button>
  );
}

export default function AuthorArticlesPage() {
  const params = useParams<{ name?: string }>();
  const rawName = params.name ? decodeURIComponent(params.name) : "";
  const name = rawName.trim().replace(/\s+/g, " ");
  const { user } = useAuth();
  const search = useSearch();
  const requestedPage = new URLSearchParams(search).get("page");
  const pageNumber = requestedPage && /^[1-9]\d*$/.test(requestedPage) && Number(requestedPage) <= 10_000 ? Number(requestedPage) : 1;
  const authorPath = `/author/${encodeURIComponent(name)}`;
  const pageHref = (page: number) => (page === 1 ? authorPath : `${authorPath}?page=${page}`);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["/api/authors/by-name", name, PAGE_SIZE, pageNumber],
    queryFn: async ({ pageParam }): Promise<AuthorPage> => {
      const page = typeof pageParam === "number" ? pageParam : 1;
      const res = await fetch(apiUrl(`/api/authors/by-name?name=${encodeURIComponent(name)}&limit=${PAGE_SIZE}&page=${page}`), {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "تعذر جلب الكاتب");
      }
      return res.json();
    },
    initialPageParam: pageNumber,
    getNextPageParam: (lastPage) => (lastPage.pagination?.hasMore ? (lastPage.pagination.page || 1) + 1 : undefined),
    enabled: name.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const firstPage = data?.pages?.[0];
  const articles = useMemo(
    () => (data?.pages ?? []).flatMap((p) => (Array.isArray(p.recentArticles) ? p.recentArticles : [])),
    [data],
  );
  const writer = firstPage?.writer ?? null;
  const isOpinionWriter = Boolean(writer) || articles.some((a) => a.articleType === "opinion");

  // أحدث مقال بارز في الصفحة الأولى فقط، والباقي مجمّع بالشهر
  const featured = pageNumber === 1 ? articles[0] : undefined;
  const months = useMemo(() => {
    const rest = featured ? articles.slice(1) : articles;
    const groups: { key: string; label: string; items: AuthorArticle[] }[] = [];
    for (const a of rest) {
      const d = validDate(a.publishedAt);
      const key = d ? monthKey(d) : "—";
      let g = groups.find((x) => x.key === key);
      if (!g) {
        g = { key, label: d ? monthYear(d) : "بلا تاريخ", items: [] };
        groups.push(g);
      }
      g.items.push(a);
    }
    return groups;
  }, [articles, featured]);

  useEffect(() => {
    document.title = firstPage?.author.name ? `${firstPage.author.name} — كاتب في سبق` : name ? `${name} — كاتب في سبق` : "كاتب — سبق";
  }, [firstPage?.author.name, name]);

  useCanonical(name ? `https://sabq.org${pageHref(pageNumber)}` : null);

  const author = firstPage?.author;
  const since = validDate(firstPage?.stats.earliestPublish);
  const weekdayName = writer?.weekday != null ? WEEKDAYS[writer.weekday] : null;

  return (
    <div className="public-page min-h-screen flex flex-col bg-[#F4F7FB] text-[#1B2B3A]" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        {isLoading ? (
          <div className="mx-auto max-w-6xl px-4 py-10 space-y-8" aria-busy="true">
            <div className="flex flex-col items-center gap-4 sm:flex-row animate-pulse">
              <div className="h-24 w-24 rounded-full bg-white shrink-0" />
              <div className="space-y-3 w-full max-w-md">
                <div className="h-7 bg-white rounded w-2/3" />
                <div className="h-4 bg-white rounded w-1/3" />
              </div>
            </div>
            <div className="h-56 rounded-[20px] bg-white animate-pulse" />
          </div>
        ) : error || !firstPage || !author ? (
          <div className="mx-auto max-w-xl px-4 py-20 text-center space-y-3">
            <h1 className="text-2xl font-bold">الكاتب غير موجود</h1>
            <p className="text-[#5B6B7A] text-sm">لم نتمكّن من العثور على كاتب بهذا الاسم.</p>
            <Link href="/opinion" className="text-[#0B6FA8] text-sm font-semibold hover:underline inline-block">
              العودة إلى مقالات الرأي
            </Link>
          </div>
        ) : (
          <>
            <section className="bg-gradient-to-b from-[#EAF6FF] to-[#F4F7FB]">
              <div className="mx-auto max-w-6xl px-4 pt-7 pb-6 sm:pt-10 sm:pb-8">
                <div className="flex flex-col items-center text-center gap-4 sm:flex-row sm:items-center sm:text-start sm:gap-6">
                  <WriterAvatar
                    name={author.name}
                    src={author.avatarUrl}
                    className="h-24 w-24 sm:h-28 sm:w-28 shrink-0 border-4 border-white shadow-[0_8px_24px_rgba(27,43,58,.10)]"
                    textClass="text-3xl"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <span className="hidden sm:block text-[13px] font-semibold text-[#0B6FA8]">
                      {isOpinionWriter ? "كاتب رأي في سبق" : "كاتب في سبق"}
                    </span>
                    <h1 className="text-[28px] sm:text-4xl font-bold leading-tight" data-testid="text-author-page-name">
                      {author.name}
                    </h1>
                    {author.role && author.role !== "كاتب في سبق" ? <p className="text-[15px] text-[#5B6B7A]">{author.role}</p> : null}
                    <div className="flex flex-wrap justify-center sm:justify-start gap-2 pt-1.5">
                      {weekdayName ? (
                        <span className="inline-flex h-[34px] items-center gap-1.5 rounded-full bg-[#1E9BE6] px-3.5 text-[13px] font-semibold text-white" data-testid="chip-writer-weekday">
                          <CalendarDays className="h-4 w-4" aria-hidden="true" />
                          يكتب كل {weekdayName}
                        </span>
                      ) : null}
                      {firstPage.stats.articleCount > 0 ? (
                        <span className="inline-flex h-[34px] items-center rounded-full border border-[#E3E9F0] bg-white px-3.5 text-[13px]">
                          {countLabel(firstPage.stats.articleCount)}
                          {since ? ` منذ ${monthYear(since)}` : ""}
                        </span>
                      ) : null}
                      {writer && writer.usualCategories.length > 0 ? (
                        <span className="hidden sm:inline-flex h-[34px] items-center rounded-full border border-[#E3E9F0] bg-white px-3.5 text-[13px] text-[#5B6B7A]">
                          يكتب غالبًا في: {writer.usualCategories.join(" · ")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex w-full gap-2.5 sm:w-auto sm:shrink-0">
                    <FollowButton authorId={author.id} authorName={author.name} className="h-12 flex-1 px-7 text-[15px] sm:flex-none" />
                    <ShareButton name={author.name} />
                  </div>
                </div>
                {author.bio ? (
                  <p className="mx-auto mt-5 max-w-3xl whitespace-pre-line text-center text-sm leading-[1.9] text-[#3B4B5A] sm:mx-0 sm:text-start sm:text-base">
                    {author.bio}
                  </p>
                ) : null}
              </div>
            </section>

            <div className="mx-auto max-w-6xl px-4 pt-5 pb-12 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
              <div className="flex flex-col gap-6 min-w-0">
                {pageNumber > 1 ? (
                  <a href={pageHref(pageNumber - 1)} rel="prev" className="text-[#0B6FA8] text-sm font-semibold">
                    ‹ المقالات الأحدث
                  </a>
                ) : null}

                {articles.length === 0 ? (
                  <p className="rounded-[20px] bg-white py-12 text-center text-sm text-[#5B6B7A]">لا مقالات منشورة بعد</p>
                ) : null}

                {featured ? (
                  <section className="flex flex-col gap-2.5">
                    <h2 className="text-[19px] font-bold">أحدث مقال</h2>
                    <article className="overflow-hidden rounded-[20px] bg-white shadow-[0_1px_2px_rgba(27,43,58,.04),0_8px_24px_rgba(27,43,58,.04)] sm:grid sm:grid-cols-[minmax(0,1fr)_320px]">
                      <ArticleThumb src={featured.imageUrl} eager className="aspect-[16/9] sm:order-2 sm:aspect-auto sm:h-full sm:min-h-[220px]" />
                      <div className="flex flex-col gap-2 p-[18px] sm:p-6 sm:order-1">
                        <span className="text-xs text-[#7A8896]">{metaLine(featured)}</span>
                        <h3 className="text-xl sm:text-2xl font-bold leading-[1.55]">
                          <Link href={articleHref(featured)} className="text-[#1B2B3A] hover:text-[#0B6FA8]" data-testid={`link-author-featured-${featured.id}`}>
                            {featured.title}
                          </Link>
                        </h3>
                        {featured.excerpt ? <p className="text-sm leading-[1.8] text-[#5B6B7A] line-clamp-3">{featured.excerpt}</p> : null}
                        <Link href={articleHref(featured)} className="mt-1 inline-flex min-h-[44px] items-center self-start text-sm font-semibold text-[#0B6FA8]">
                          اقرأ المقال
                        </Link>
                      </div>
                    </article>
                  </section>
                ) : null}

                {months.map((m) => (
                  <section key={m.key} className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#E6F4FD] text-[#1E9BE6]">
                        <CalendarDays className="h-4 w-4" />
                      </span>
                      <h2 className="text-base font-bold text-[#0B6FA8]">{m.label}</h2>
                      <span className="text-xs text-[#7A8896]">· {countLabel(m.items.length)}</span>
                    </div>
                    <div className="overflow-hidden rounded-[20px] bg-white shadow-[0_1px_2px_rgba(27,43,58,.04)]">
                      {m.items.map((a, i) => (
                        <article key={a.id} className={`flex items-center gap-3.5 px-4 py-3.5 sm:gap-5 sm:px-5 sm:py-4 ${i > 0 ? "border-t border-[#EEF2F6]" : ""}`}>
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="text-xs text-[#7A8896]">{metaLine(a)}</span>
                            <h3 className="text-base sm:text-lg font-bold leading-[1.6]">
                              <Link href={articleHref(a)} className="text-[#1B2B3A] hover:text-[#0B6FA8]">
                                {a.title}
                              </Link>
                            </h3>
                            {a.excerpt ? <p className="hidden sm:block text-sm leading-[1.8] text-[#5B6B7A] line-clamp-2">{a.excerpt}</p> : null}
                          </div>
                          <ArticleThumb src={a.imageUrl} className="h-[72px] w-24 shrink-0 rounded-xl sm:h-[100px] sm:w-[150px]" />
                        </article>
                      ))}
                    </div>
                  </section>
                ))}

                {hasNextPage ? (
                  <div className="flex flex-col items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      data-testid="button-author-load-more"
                      className="inline-flex h-12 items-center gap-2 rounded-full border border-[#E3E9F0] bg-white px-7 text-[15px] font-semibold text-[#0B6FA8] hover:bg-sky-50 disabled:opacity-60"
                    >
                      {isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      عرض المقالات الأقدم
                    </button>
                    <a href={pageHref((data?.pages.at(-1)?.pagination?.page || pageNumber) + 1)} rel="next" className="sr-only">
                      الصفحة التالية
                    </a>
                  </div>
                ) : null}
              </div>

              {writer && (writer.peers.length > 0 || writer.nextDayKey) ? (
                <aside className="mt-6 flex flex-col gap-4 lg:mt-[38px]">
                  {writer.peers.length > 0 && weekdayName ? (
                    <section className="rounded-[20px] bg-white p-[18px] shadow-[0_1px_2px_rgba(27,43,58,.04)]">
                      <h2 className="text-lg font-bold">كتّاب {weekdayName}</h2>
                      <p className="mb-3 mt-1 text-xs text-[#7A8896]">اقرأ لمن يكتب معه في اليوم نفسه.</p>
                      <div className="flex gap-3.5 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible">
                        {writer.peers.map((p) => (
                          <Link
                            key={p.id}
                            href={`/author/${encodeURIComponent(p.name)}`}
                            className="flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-[#1B2B3A] lg:w-auto lg:flex-row lg:gap-3 lg:rounded-xl lg:px-1 lg:py-2 lg:hover:bg-slate-50"
                            data-testid={`link-peer-writer-${p.id}`}
                          >
                            <WriterAvatar name={p.name} src={p.avatarUrl} className="h-[52px] w-[52px] lg:h-11 lg:w-11 bg-sky-50" textClass="text-lg" />
                            <span className="text-center text-[11px] leading-[1.4] lg:text-start lg:text-sm lg:font-semibold">{p.name}</span>
                          </Link>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {writer.nextDayKey ? (
                    <section className="flex flex-col gap-1 rounded-[20px] border border-[#D6ECFB] bg-[#EAF6FF] p-[18px]">
                      <span className="text-xs font-semibold text-[#0B6FA8]">موعده القادم</span>
                      <span className="text-lg font-bold" data-testid="text-writer-next-day">{dayKeyLabel(writer.nextDayKey)}</span>
                    </section>
                  ) : null}
                </aside>
              ) : null}
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
