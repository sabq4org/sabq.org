import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import type { RelatedArticleLink, ServicePageModel } from "@/lib/servicePage";

/**
 * نسخة الزاحف من صفحة الخدمة. نفس رأس صفحة المقال وذيلها في web-next،
 * والنص من نموذج مواعيدك. العدّاد الحي يبقى في واجهة القارئ.
 */
export function ServiceDateView({
  model,
  related,
}: {
  model: ServicePageModel;
  related: RelatedArticleLink[];
}) {
  const jsonLd = JSON.stringify(model.jsonLd).replace(/</g, "\\u003c");
  return (
    <>
      <SiteHeader />
      <main id="main-content" role="main" lang="ar" dir="rtl" className="mx-auto max-w-3xl px-4 py-6">
        <nav aria-label="مسار التنقل" className="mb-6 flex flex-wrap gap-2 text-sm text-muted-foreground">
          <Link href="/">الرئيسية</Link>
          <span aria-hidden="true">/</span>
          <a href="/mawaeed">مواعيدك</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{model.h1}</span>
        </nav>
        <article>
          <div className="flex items-center gap-3">
            {model.next ? (
              <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-sm font-semibold text-primary">{model.next.certaintyLabel}</span>
            ) : null}
            <h1 className="min-w-0 text-2xl font-bold leading-tight md:text-4xl">{model.h1}</h1>
          </div>
          <Answer model={model} />
          <p className="mt-3 text-sm text-muted-foreground">
            آخر تحديث: <time dateTime={model.dateModified}>{model.dateModifiedLabel}</time>
            {model.next?.sourceUrl ? (
              <>
                {" · "}
                المصدر: <a href={model.next.sourceUrl} className="hover:text-primary">{model.next.sourceTitle}</a>
              </>
            ) : null}
          </p>
          {model.calendarHref && (
            <p className="mt-6">
              <a
                href={model.calendarHref}
                className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                أضف المواعيد القادمة إلى التقويم
              </a>
            </p>
          )}
          <section className="mt-10">
            <h2 className="text-2xl font-bold">خط المواعيد</h2>
            <p className="mt-2 text-sm text-muted-foreground">المواعيد من السجل المنشور. ما مضى يظهر «صُرفت»، وما لم تعلنه الجهة بعد يبقى «متوقعًا».</p>
            <ol className="mt-4 divide-y divide-border">
              {model.rows.map((row) => (
                <li key={row.startsOn} className="py-4">
                  {row.isNext && <p className="text-sm font-semibold text-primary">الموعد القادم</p>}
                  <h3 className="text-lg font-bold">{row.title}</h3>
                  <p><time dateTime={row.startsOn}>{row.gregorianLabel}</time></p>
                  <p className="text-muted-foreground">{row.hijriLabel}</p>
                  <p className="text-sm text-muted-foreground">{row.isPast ? row.pastLabel || "صُرفت" : row.certaintyLabel}</p>
                </li>
              ))}
            </ol>
          </section>
          <section className="mt-10 space-y-4 leading-8">
            <h2 className="text-2xl font-bold">كيف يُحدَّد الموعد</h2>
            {model.explanation.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
          {related.length > 0 && (
            <section className="mt-10">
              <h2 className="text-2xl font-bold">من أخبار سبق</h2>
              <ul className="mt-3 space-y-2">
                {related.map((item) => (
                  <li key={item.href}><a href={item.href} className="text-primary">{item.title}</a></li>
                ))}
              </ul>
            </section>
          )}
          {model.faq.length > 0 && (
            <section className="mt-10 space-y-4">
              <h2 className="text-2xl font-bold">أسئلة شائعة</h2>
              {model.faq.map((item) => (
                <div key={item.question}>
                  <h3 className="font-bold">{item.question}</h3>
                  <p className="mt-1 leading-8 text-muted-foreground">{item.answer}</p>
                </div>
              ))}
            </section>
          )}
          <nav className="mt-10" aria-label="صفحات ذات صلة">
            <h2 className="text-2xl font-bold">صفحات ذات صلة</h2>
            <ul className="mt-3 space-y-2">
              {model.links.map((item) => (
                <li key={item.href}><a href={item.href} className="text-primary">{item.label}</a></li>
              ))}
            </ul>
          </nav>
        </article>
      </main>
      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    </>
  );
}

function Answer({ model }: { model: ServicePageModel }) {
  if (!model.next) return <p className="mt-4 text-lg leading-8" id="answer">{model.leadPrefix}</p>;
  const next = model.next;
  const hint = next.expectedHint?.replace(/^متوقع:\s*/, "");
  return (
    <>
      <p className="mt-4 text-lg leading-8" id="answer">
        {model.leadPrefix}{" "}
        <time dateTime={next.startsOn}>{next.gregorianLabel}</time>
        {" "}الموافق {next.hijriLabel}،{" "}
        <strong>{next.countdownText}</strong>.
      </p>
      {hint ? <p className="mt-3 text-lg leading-8">{hint}</p> : null}
      {model.shiftRule ? <p className="mt-3 text-lg leading-8">{model.shiftRule}</p> : null}
    </>
  );
}
