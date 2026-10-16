import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { compactServiceOccurrenceTitle, stripDisplayedSourceSentence } from "@/lib/mawaeedDisplay";
import { relatedArticleMeta, type RelatedArticleLink, type ServicePageModel } from "@/lib/servicePage";

function badgeClasses(certainty: "confirmed" | "expected" | undefined, isPast?: boolean): string {
  if (isPast) {
    return "inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground";
  }
  if (certainty === "expected") {
    return "inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950/60 dark:text-amber-300";
  }
  return "inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300";
}

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
  const nextCertainty = model.next?.certainty ?? (model.next?.certaintyLabel === "متوقع" ? "expected" : "confirmed");
  const laterRows = model.rows.filter((row) => !row.isNext);
  const displayTone = model.tone ?? "salary";
  const nextTitle = model.next ? compactServiceOccurrenceTitle(model.next.title ?? "", model.next.startsOn, displayTone) : "";
  const nextHeading = displayTone === "school" ? "الإجازة القادمة" : "الصرف القادم";
  return (
    <>
      <SiteHeader />
      <main id="main-content" role="main" lang="ar" dir="rtl" className="mx-auto max-w-5xl px-4 py-8">
        <nav aria-label="مسار التنقل" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-primary">الرئيسية</Link>
          {/* «›» ينعكس في RTL فيُرسم متجهاً يساراً (إلى الأمام)؛ «‹» كان يشير إلى الخلف. */}
          <span aria-hidden="true">›</span>
          <a href="/mawaeed" className="hover:text-primary">مواعيدك</a>
        </nav>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <article className="space-y-8 min-w-0">
            <header>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="min-w-0 text-2xl font-extrabold leading-tight md:text-4xl">{model.h1}</h1>
              </div>
              {model.tone === "school" && model.regions.length > 0 ? (
                <div className="mt-4 rounded-lg border border-border/60 p-3">
                  <form method="get" className="flex flex-wrap items-end gap-2">
                    <label htmlFor="service-region" className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-semibold">
                      إدارة التعليم
                      <select id="service-region" name="region" defaultValue={model.region} className="h-10 rounded-md border border-border bg-background px-3 font-normal">
                        {model.regions.map((region) => <option key={region.id} value={region.id}>{region.label}</option>)}
                      </select>
                    </label>
                    <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">عرض</button>
                  </form>
                  {model.regionNotice ? <p className="mt-2 text-sm leading-7 text-muted-foreground">{model.regionNotice}</p> : null}
                </div>
              ) : null}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3 text-sm text-muted-foreground">
                <p>
                  آخر تحديث: <time dateTime={model.dateModified}>{model.dateModifiedLabel}</time>
                </p>
              </div>
            </header>

            {model.next && (
              <section aria-label="بطاقة الموعد القادم" className="overflow-hidden border-s-4 border-primary bg-muted/40">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
                  <p className="text-sm font-bold text-foreground">
                    {displayTone === "school" && nextTitle ? nextTitle : `${nextHeading}${nextTitle ? ` · ${nextTitle}` : ""}`}
                  </p>
                  <span className={badgeClasses(nextCertainty)}>{model.next.certaintyLabel}</span>
                </div>
                <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 sm:divide-x sm:divide-x-reverse">
                  <div className="p-5">
                    <p className="text-xs font-semibold text-muted-foreground">التاريخ الميلادي</p>
                    <p className="mt-1.5 text-xl font-extrabold tabular-nums">
                      <time dateTime={model.next.startsOn}>{model.next.gregorianLabel}</time>
                    </p>
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-semibold text-muted-foreground">التاريخ الهجري (أم القرى)</p>
                    <p className="mt-1.5 text-xl font-extrabold tabular-nums">{model.next.hijriLabel}</p>
                  </div>
                </div>
                <div className="border-t border-border px-5 py-3 text-sm font-bold tabular-nums text-primary">
                  {model.next.countdownText}
                </div>
                {model.calendarHref && (
                  <div className="border-t border-border px-5 py-3.5">
                    <a
                      href={model.calendarHref}
                      className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
                    >
                      أضف المواعيد القادمة إلى التقويم
                    </a>
                  </div>
                )}
              </section>
            )}

            <Answer model={model} />

          {laterRows.length > 0 && <section>
              <h2 className="text-2xl font-bold">بقية المواعيد</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {model.tone === "school"
                  ? "المواعيد من السجل المنشور. ما مضى يظهر «انتهت»، وما لم تعلنه الجهة بعد يبقى «متوقعًا»."
                  : "المواعيد من السجل المنشور. ما مضى يظهر «صُرفت»، وما لم تعلنه الجهة بعد يبقى «متوقعًا»."}
              </p>
              <ol className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-muted/30">
                {laterRows.map((row) => {
                  const rowCertainty = row.certaintyLabel === "متوقع" ? "expected" : "confirmed";
                  const rowTitle = compactServiceOccurrenceTitle(row.title, row.startsOn, displayTone);
                  const showRowTitle = rowTitle && !(displayTone === "pension" && rowTitle === nextTitle);
                  return (
                    <li
                      key={`${row.startsOn}-${row.title}`}
                      className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${row.isPast ? "opacity-75" : ""}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {showRowTitle ? <h3 className="text-base font-bold">{rowTitle}</h3> : null}
                        </div>
                        <p className="mt-1 text-sm tabular-nums">
                          <time dateTime={row.startsOn} className="font-semibold">{row.gregorianLabel}</time>
                          <span aria-hidden="true" className="mx-1.5 text-muted-foreground">·</span>
                          <span className="text-muted-foreground">{row.hijriLabel}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        {!row.isPast && row.countdownText ? (
                          <span className="text-xs font-bold tabular-nums text-muted-foreground">{row.countdownText}</span>
                        ) : null}
                        <span className={badgeClasses(rowCertainty, row.isPast)}>
                          {row.isPast ? row.pastLabel || (model.tone === "school" ? "انتهت" : "صُرفت") : row.certaintyLabel}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>}

            <section>
              <h2 className="text-2xl font-bold">كيف يُحدَّد الموعد</h2>
              <div className="mt-3 space-y-3 rounded-2xl border border-border bg-muted/30 p-5 leading-8">
                {model.explanation.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </section>

            {model.faq.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold">أسئلة شائعة</h2>
                <div className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-muted/30">
                    {model.faq.map((item) => (
                      <details key={item.question} className="group">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-bold">
                        <span>{item.question}</span>
                        <span aria-hidden="true" className="text-muted-foreground transition-transform group-open:-rotate-90">‹</span>
                      </summary>
                      <p className="px-5 pb-4 leading-8 text-muted-foreground">{stripDisplayedSourceSentence(item.answer)}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}
          </article>

          <aside className="space-y-6 min-w-0">
            {related.length > 0 && (
              <section className="rounded-2xl border border-border bg-muted/30 p-5">
                <h2 className="border-b border-border pb-3 text-lg font-bold">من أخبار سبق</h2>
                <ul className="mt-3 divide-y divide-border">
                  {related.map((item) => {
                    const meta = relatedArticleMeta(item, new Date());
                    return (
                      <li key={item.href} className="py-2.5 first:pt-0 last:pb-0">
                        <a
                          href={item.href}
                          className={`font-semibold hover:text-primary ${meta.archived ? "text-muted-foreground" : "text-foreground"}`}
                        >
                          {item.title}
                        </a>
                        {meta.dateLabel ? (
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
                            <time dateTime={item.publishedAt ?? undefined}>{meta.dateLabel}</time>
                            {meta.archived ? (
                              <span className="rounded-md bg-amber-100 px-2 font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                من الأرشيف
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <nav aria-label="صفحات ذات صلة" className="rounded-2xl border border-border bg-muted/30 p-5">
              <h2 className="border-b border-border pb-3 text-lg font-bold">صفحات ذات صلة</h2>
              <ul className="mt-3 divide-y divide-border">
                {model.links.map((item) => (
                  <li key={item.href} className="py-2.5 first:pt-0 last:pb-0">
                    <a href={item.href} className="font-semibold text-foreground hover:text-primary">{item.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        </div>
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
  if (!hint && !model.shiftRule) return null;
  return <div className="mt-3 space-y-1.5 rounded-xl border-r-4 border-primary bg-muted/40 px-4 py-3 text-sm leading-7 text-muted-foreground" id="answer">
    {hint ? <p>{hint}</p> : null}
    {model.shiftRule ? <p>{model.shiftRule}</p> : null}
  </div>;
}
