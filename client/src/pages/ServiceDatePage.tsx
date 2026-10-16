import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Link, useParams } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useCanonical } from "@/hooks/useCanonical";
import { apiUrl } from "@/lib/queryClient";
import "@/styles/article-detail.css";
import { HIDDEN_SERVICE_ROBOTS } from "@shared/servicePages/catalog";
import type { ServicePageModel } from "@shared/servicePages/present";
import {
  relatedArticlesFromKeyword,
  relatedArticlesFromSearch,
  type RelatedArticleLink,
} from "@shared/servicePages/related";

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

function phrase(days: number, hours: number, todayLabel: string): string {
  if (days <= 0 && hours <= 0) return todayLabel;
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

function useLiveCountdown(startsOn: string | undefined, todayLabel: string, initial: string) {
  const [text, setText] = useState(initial);
  const [parts, setParts] = useState<{ days: number; hours: number; minutes: number } | null>(() =>
    startsOn ? remaining(startsOn, Date.now()) : null,
  );
  useEffect(() => {
    if (!startsOn) return;
    const tick = () => {
      const left = remaining(startsOn, Date.now());
      setParts(left);
      setText(left ? phrase(left.days, left.hours, todayLabel) : todayLabel);
    };
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, [startsOn, todayLabel]);
  return { text, parts };
}

export default function ServiceDatePage() {
  const { id } = useParams<{ id: string }>();
  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });
  const pageQuery = useQuery<ServicePageModel>({
    queryKey: ["/api/service-pages", id],
    enabled: Boolean(id),
    retry: false,
  });
  const model = pageQuery.data;
  useCanonical(model?.canonical ?? null);
  useEffect(() => {
    let meta = document.head.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", HIDDEN_SERVICE_ROBOTS);
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
            <p><Link href="/mawaeed">العودة إلى مواعيدك</Link></p>
          </article>
        ) : (
          <ServiceDateBody model={model} related={related} />
        )}
      </main>
      <Footer />
    </div>
  );
}

function ServiceDateBody({
  model,
  related,
}: {
  model: ServicePageModel;
  related: RelatedArticleLink[];
}) {
  const live = useLiveCountdown(model.next?.startsOn, model.next?.todayLabel || "اليوم", model.next?.countdownText || "");
  const jsonLd = JSON.stringify(model.jsonLd).replace(/</g, "\\u003c");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <nav aria-label="مسار التنقل" className="article-breadcrumbs">
        <Link href="/">الرئيسية</Link>
        <ChevronRight aria-hidden="true" />
        <Link href="/mawaeed">مواعيدك</Link>
        <ChevronRight aria-hidden="true" />
        <span aria-current="page">{model.h1}</span>
      </nav>
      <div className="article-detail-layout">
        <article className="article-detail-content min-w-0">
          <header className="article-detail-header">
            <div className="flex items-center gap-3">
              {model.next ? <span className="article-category-label shrink-0">{model.next.certaintyLabel}</span> : null}
              <h1 className="article-detail-title !mt-0 min-w-0">{model.h1}</h1>
            </div>
            <Answer model={model} countdown={live.text} />
            <div className="article-detail-byline">
              {model.next?.sourceUrl ? (
                <p className="public-meta">
                  المصدر:{" "}
                  <a href={model.next.sourceUrl} rel="noopener noreferrer">{model.next.sourceTitle}</a>
                </p>
              ) : <span />}
              <p className="article-detail-metadata">
                آخر تحديث: <time dateTime={model.dateModified}>{model.dateModifiedLabel}</time>
              </p>
            </div>
          </header>
          {model.next && (
            <div className="article-detail-summary">
              <p className="public-meta">ميلادي</p>
              <p><time dateTime={model.next.startsOn}>{model.next.gregorianLabel}</time></p>
              <p className="public-meta">هجري</p>
              <p>{model.next.hijriLabel}</p>
              {live.parts && (
                <p className="article-detail-metadata" aria-hidden="true">
                  <span><b className="tabular-nums">{live.parts.days}</b> يوم</span>
                  <span><b className="tabular-nums">{live.parts.hours}</b> ساعة</span>
                  <span><b className="tabular-nums">{live.parts.minutes}</b> دقيقة</span>
                </p>
              )}
            </div>
          )}
          <div className="article-detail-toolbar-row">
            {model.calendarHref && (
              <Button asChild>
                <a href={model.calendarHref}>أضف المواعيد القادمة إلى التقويم</a>
              </Button>
            )}
            <ShareButton title={model.title} />
          </div>
          <section>
            <h2 className="public-section-title">خط المواعيد</h2>
            <p className="public-meta">المواعيد من السجل المنشور. ما مضى يظهر «صُرفت»، وما لم تعلنه الجهة بعد يبقى «متوقعًا».</p>
            {model.rows.length === 0 ? (
              <p>لا توجد مواعيد منشورة في السجل.</p>
            ) : (
              <ol className="mt-4 divide-y divide-border">
                {model.rows.map((row) => (
                  <li key={row.startsOn} className="py-4">
                    {row.isNext && <p className="public-meta">الموعد القادم</p>}
                    <h3 className="public-card-title">{row.title}</h3>
                    <p><time dateTime={row.startsOn}>{row.gregorianLabel}</time></p>
                    <p className="public-meta">{row.hijriLabel}</p>
                    <p className="public-meta">{row.isPast ? row.pastLabel || "صُرفت" : row.certaintyLabel}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="article-prose">
            <h2>كيف يُحدَّد الموعد</h2>
            {model.explanation.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
          {model.faq.length > 0 && (
            <section className="article-prose">
              <h2>أسئلة شائعة</h2>
              {model.faq.map((item) => (
                <div key={item.question}>
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </div>
              ))}
            </section>
          )}
        </article>
        <aside className="article-detail-sidebar min-w-0">
          {related.length > 0 && (
            <section>
              <h2 className="public-section-title">من أخبار سبق</h2>
              <ul className="mt-3 space-y-3">
                {related.map((item) => (
                  <li key={item.href}><Link href={item.href}>{item.title}</Link></li>
                ))}
              </ul>
            </section>
          )}
          <nav className="mt-8" aria-label="صفحات ذات صلة">
            <h2 className="public-section-title">صفحات ذات صلة</h2>
            <ul className="mt-3 space-y-3">
              {model.links.map((item) => (
                <li key={item.href}><Link href={item.href}>{item.label}</Link></li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </>
  );
}

function Answer({ model, countdown }: { model: ServicePageModel; countdown: string }) {
  if (!model.next) {
    return <p className="article-detail-subtitle" id="answer">{model.leadPrefix}</p>;
  }
  const next = model.next;
  const hint = next.expectedHint?.replace(/^متوقع:\s*/, "");
  return (
    <>
      <p className="article-detail-subtitle" id="answer">
        {model.leadPrefix}{" "}
        <time dateTime={next.startsOn}>{next.gregorianLabel}</time>
        {" "}الموافق {next.hijriLabel}،{" "}
        <strong data-countdown data-date={next.startsOn} data-today={next.todayLabel}>{countdown || next.countdownText}</strong>.
      </p>
      {hint ? <p className="article-detail-subtitle">{hint}</p> : null}
      {model.shiftRule ? <p className="article-detail-subtitle">{model.shiftRule}</p> : null}
    </>
  );
}

function ShareButton({ title }: { title: string }) {
  const [label, setLabel] = useState("شارك الموعد");
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        const url = window.location.href.split("#")[0];
        if (navigator.share) {
          navigator.share({ title, url }).catch(() => {});
          return;
        }
        navigator.clipboard?.writeText(url).then(() => setLabel("تم نسخ الرابط")).catch(() => {});
      }}
    >
      {label}
    </Button>
  );
}
