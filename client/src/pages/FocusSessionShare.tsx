import { useEffect, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SocialShareBar } from "@/components/SocialShareBar";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";
import { Clock, CheckCircle2, BookOpen } from "lucide-react";

interface PublicSession {
  id: string;
  articleId: string;
  language: "ar" | "en" | "ur";
  startedAt: string;
  endedAt: string | null;
  focusedSeconds: number;
  completed: boolean;
  shareSlug: string;
  articleTitle: string | null;
  articleImageUrl: string | null;
  articleSlug: string | null;
  categoryName: string | null;
}

const LABELS = {
  ar: {
    dir: "rtl" as const,
    locale: "ar-SA",
    headerTitle: "جلسة قراءة مركّزة",
    headerSubtitle: "تمت القراءة في وضع التركيز على سبق",
    focusTime: "زمن التركيز",
    completed: "اكتملت القراءة",
    inProgress: "جلسة قراءة",
    readNow: "اقرأ المقال الآن",
    notFound: "لم يتم العثور على هذه الجلسة",
    backHome: "العودة للرئيسية",
    minutes: "دقيقة",
    seconds: "ثانية",
    articlePrefix: "/article/",
  },
  en: {
    dir: "ltr" as const,
    locale: "en-US",
    headerTitle: "Focus reading session",
    headerSubtitle: "Read in focus mode on Sabq",
    focusTime: "Focus time",
    completed: "Reading completed",
    inProgress: "Reading session",
    readNow: "Read the article",
    notFound: "We couldn't find this session",
    backHome: "Back to home",
    minutes: "min",
    seconds: "sec",
    articlePrefix: "/en/article/",
  },
  ur: {
    dir: "rtl" as const,
    locale: "ur-PK",
    headerTitle: "توجہ مرکوز سیشن",
    headerSubtitle: "سبق پر توجہ مرکوز موڈ میں پڑھا گیا",
    focusTime: "توجہ کا وقت",
    completed: "پڑھائی مکمل",
    inProgress: "پڑھائی کا سیشن",
    readNow: "ابھی مضمون پڑھیں",
    notFound: "یہ سیشن نہیں ملا",
    backHome: "ہوم پیج",
    minutes: "منٹ",
    seconds: "سیکنڈ",
    articlePrefix: "/ur/article/",
  },
};

function formatDuration(totalSeconds: number, language: keyof typeof LABELS) {
  const labels = LABELS[language];
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s.toLocaleString(labels.locale)} ${labels.seconds}`;
  return `${m.toLocaleString(labels.locale)} ${labels.minutes} ${s.toString().padStart(2, "0")} ${labels.seconds}`;
}

export default function FocusSessionShare() {
  const { slug } = useParams<{ slug: string }>();
  const { logBehavior } = useBehaviorTracking();

  const { data: session, isLoading, isError } = useQuery<PublicSession>({
    queryKey: ["/api/focus-sessions/share", slug],
    enabled: !!slug,
    retry: false,
  });

  const language = (session?.language as keyof typeof LABELS) || "ar";
  const labels = LABELS[language];

  useEffect(() => {
    if (session?.shareSlug) {
      // The share landing page is a *view* of an already-shared session; we
      // re-use the focus_session_share event with an explicit "view" action so
      // analytics can distinguish creation from inbound traffic.
      logBehavior("focus_session_share", {
        action: "view",
        source: "share_landing",
        shareSlug: session.shareSlug,
        articleId: session.articleId,
      });
    }
  }, [session?.shareSlug, session?.articleId, logBehavior]);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined" || !slug) return "";
    return `${window.location.origin}/focus/session/${slug}`;
  }, [slug]);

  // Title + meta description + OpenGraph/Twitter tags for social sharing.
  // The share landing page is a public URL designed to be shared on social
  // media, so it must surface the article title, a focus-time aware
  // description, and a preview image.
  useEffect(() => {
    if (typeof document === "undefined" || !session) return;
    const articleTitle = session.articleTitle || labels.headerTitle;
    const minutes = Math.max(1, Math.round(session.focusedSeconds / 60));
    const minutesLabel = minutes.toLocaleString(labels.locale);
    const description =
      language === "ar"
        ? `${labels.headerSubtitle} — ${minutesLabel} ${labels.minutes} من القراءة المركّزة على «${articleTitle}».`
        : language === "ur"
        ? `${labels.headerSubtitle} — «${articleTitle}» پر ${minutesLabel} ${labels.minutes} توجہ مرکوز پڑھائی۔`
        : `${labels.headerSubtitle} — ${minutesLabel} ${labels.minutes} of focused reading on "${articleTitle}".`;
    const ogTitle = `${articleTitle} · ${labels.headerTitle}`;
    const previousTitle = document.title;
    document.title = `${ogTitle} | Sabq`;

    const setMeta = (selector: string, attr: string, attrValue: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      let created = false;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, attrValue);
        document.head.appendChild(el);
        created = true;
      }
      const previous = el.getAttribute("content");
      el.setAttribute("content", content);
      return () => {
        if (created) {
          el?.remove();
        } else if (previous !== null) {
          el?.setAttribute("content", previous);
        }
      };
    };

    const restorers: Array<() => void> = [];
    restorers.push(setMeta('meta[name="description"]', "name", "description", description));
    restorers.push(setMeta('meta[property="og:title"]', "property", "og:title", ogTitle));
    restorers.push(setMeta('meta[property="og:description"]', "property", "og:description", description));
    restorers.push(setMeta('meta[property="og:type"]', "property", "og:type", "article"));
    restorers.push(setMeta('meta[property="og:url"]', "property", "og:url", shareUrl));
    if (session.articleImageUrl) {
      restorers.push(setMeta('meta[property="og:image"]', "property", "og:image", session.articleImageUrl));
      restorers.push(setMeta('meta[name="twitter:image"]', "name", "twitter:image", session.articleImageUrl));
    }
    restorers.push(setMeta('meta[name="twitter:card"]', "name", "twitter:card", session.articleImageUrl ? "summary_large_image" : "summary"));
    restorers.push(setMeta('meta[name="twitter:title"]', "name", "twitter:title", ogTitle));
    restorers.push(setMeta('meta[name="twitter:description"]', "name", "twitter:description", description));

    return () => {
      document.title = previousTitle;
      for (const restore of restorers) restore();
    };
  }, [session, language, labels, shareUrl]);

  const articleHref = session?.articleSlug ? `${labels.articlePrefix}${session.articleSlug}` : null;

  return (
    <div dir={labels.dir} className="flex min-h-screen flex-col bg-background" data-testid="page-focus-share">
      <Header />
      <main className="flex-1 px-4 py-8">
        <div className="mx-auto max-w-2xl">
          {isLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ) : isError || !session ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground" data-testid="text-share-notfound">
                <p>{labels.notFound}</p>
                <div className="mt-4">
                  <Link
                    href={language === "en" ? "/en" : language === "ur" ? "/ur" : "/"}
                    className="text-primary underline-offset-4 hover:underline"
                    data-testid="link-share-back"
                  >
                    {labels.backHome}
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardDescription>{labels.headerSubtitle}</CardDescription>
                <CardTitle data-testid="text-share-title">{labels.headerTitle}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {session.articleImageUrl ? (
                  <div className="flex justify-center overflow-hidden rounded-md border bg-muted/30">
                    {/* Preserve natural aspect ratio (Task #69 requirement) */}
                    <img
                      src={session.articleImageUrl}
                      alt={session.articleTitle || ""}
                      className="block h-auto w-full max-h-[60vh] object-contain"
                      data-testid="img-share-article"
                    />
                  </div>
                ) : null}

                <div>
                  {session.categoryName ? (
                    <div className="mb-1 text-xs font-medium uppercase text-muted-foreground" data-testid="text-share-category">
                      {session.categoryName}
                    </div>
                  ) : null}
                  <h2 className="text-xl font-semibold" data-testid="text-share-article-title">
                    {session.articleTitle || labels.headerTitle}
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border bg-muted/40 p-3" data-testid="card-share-focus-time">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      <span>{labels.focusTime}</span>
                    </div>
                    <div className="mt-1 text-lg font-bold tabular-nums">
                      {formatDuration(session.focusedSeconds, language)}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3" data-testid="card-share-status">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {session.completed ? (
                        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                      ) : (
                        <BookOpen className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span>{session.completed ? labels.completed : labels.inProgress}</span>
                    </div>
                    <div className="mt-1 text-sm tabular-nums">
                      {new Date(session.startedAt).toLocaleDateString(labels.locale, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                </div>

                {articleHref ? (
                  <Link
                    href={articleHref}
                    className="inline-flex items-center gap-2 rounded-md border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover-elevate"
                    data-testid="link-share-read-article"
                  >
                    <BookOpen className="h-4 w-4" />
                    <span>{labels.readNow}</span>
                  </Link>
                ) : null}

                <div className="border-t pt-4">
                  <SocialShareBar
                    title={session.articleTitle || labels.headerTitle}
                    url={shareUrl}
                    description={labels.headerSubtitle}
                    articleId={session.articleId}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
