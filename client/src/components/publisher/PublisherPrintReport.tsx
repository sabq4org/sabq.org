import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { VsUsual } from "@/components/publisher/ArticleInsights";
import { formatDateShort, formatNumber } from "@/lib/format";
import sabqLogo from "../../../../public/branding/identity/sabq-logo.svg";

export interface PrintReportArticle {
  id: string;
  title: string;
  views: number | null;
  publishedAt: string | null;
  categoryName: string | null;
  vsUsual: VsUsual | null;
}

export interface PrintReportData {
  month: string;
  monthLabel: string;
  agencyName: string;
  contactPerson?: string | null;
  packageLine?: string | null;
  generatedAt: string;
  inProgress: boolean;
  countedDays: number;
  daysInMonth: number;
  totals: { published: number; views: number };
  previous: { published: number; views: number };
  trend: Array<{ month: string; label: string; published: number }>;
  categories: Array<{ name: string; published: number; views: number }>;
  authors: Array<{ name: string; published: number; views: number }>;
  topArticles: PrintReportArticle[];
  articles: PrintReportArticle[];
}

/*
 * ورقة الطباعة مستقلة عن واجهة الشاشة: تُرسم خارج تطبيق React الرئيسي
 * (بوابة على body) فتختفي كل الواجهة عند الطباعة دون ترك فراغ أو صفحة بيضاء.
 * الألوان صريحة لأن الطباعة لا تعرف الوضع الليلي، و print-color-adjust
 * يُبقي خلفيات الأعمدة والبطاقات بدل أن يحذفها المتصفح.
 */
const PRINT_CSS = `
#publisher-print-root { display: none; }
@media print {
  @page {
    size: A4;
    margin: 14mm 13mm 16mm;
    @bottom-left { content: counter(page) " / " counter(pages); font: 8.5pt system-ui, sans-serif; color: #64748b; }
    @bottom-right { content: "سبق · sabq.org"; font: 8.5pt system-ui, sans-serif; color: #64748b; }
  }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#publisher-print-root) { display: none !important; }
  #publisher-print-root { display: block !important; }
}
#publisher-print-root .pr { direction: rtl !important; color: #0e2233 !important; font-family: "IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", Tahoma, sans-serif !important; font-size: 10pt !important; line-height: 1.55 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
#publisher-print-root .pr * { box-sizing: border-box !important; }
#publisher-print-root .pr a { color: inherit !important; text-decoration: none !important; }
#publisher-print-root .pr .num { font-variant-numeric: tabular-nums !important; }
#publisher-print-root .pr .muted { color: #64748b !important; }
#publisher-print-root .pr-head { display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 16px !important; padding-bottom: 12px !important; border-bottom: 3px solid #1f9bea !important; }
#publisher-print-root .pr-head img { height: 54px !important; width: auto !important; max-width: none !important; display: block !important; }
#publisher-print-root .pr-head .kind { font-size: 9pt !important; font-weight: 600 !important; color: #1f9bea !important; letter-spacing: .02em !important; }
#publisher-print-root .pr-head .pr-title { margin: 2px 0 0 !important; font-size: 20pt !important; font-weight: 800 !important; line-height: 1.2 !important; }
#publisher-print-root .pr-meta { display: grid !important; grid-template-columns: 1.2fr 1fr 1.5fr .9fr !important; gap: 1px !important; margin-top: 12px !important; background: #dbe4ec !important; border: 1px solid #dbe4ec !important; border-radius: 8px !important; overflow: hidden !important; }
#publisher-print-root .pr-meta > div { background: #f6f9fb !important; padding: 7px 10px !important; }
#publisher-print-root .pr-meta dt { font-size: 8pt !important; color: #64748b !important; }
#publisher-print-root .pr-meta dd { margin: 0 !important; font-weight: 700 !important; font-size: 10pt !important; }
#publisher-print-root .pr-stats { display: grid !important; grid-template-columns: repeat(4, 1fr) !important; gap: 8px !important; margin-top: 14px !important; }
#publisher-print-root .pr-stat { border: 1px solid #dbe4ec !important; border-top: 3px solid #1f9bea !important; border-radius: 8px !important; padding: 9px 11px !important; break-inside: avoid !important; }
#publisher-print-root .pr-stat .label { font-size: 8.5pt !important; color: #64748b !important; }
#publisher-print-root .pr-stat .value { font-size: 19pt !important; font-weight: 800 !important; line-height: 1.25 !important; }
#publisher-print-root .pr-stat .hint { font-size: 8pt !important; color: #64748b !important; }
#publisher-print-root .pr-up { color: #047857 !important; font-weight: 700 !important; }
#publisher-print-root .pr-down { color: #b91c1c !important; font-weight: 700 !important; }
#publisher-print-root .pr-panels { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 10px !important; margin-top: 14px !important; }
#publisher-print-root .pr-panel { border: 1px solid #dbe4ec !important; border-radius: 8px !important; padding: 10px 12px !important; break-inside: avoid !important; }
#publisher-print-root .pr .pr-h { margin: 0 0 8px !important; font-size: 11pt !important; font-weight: 800 !important; break-after: avoid !important; }
#publisher-print-root .pr-trend { display: flex !important; align-items: flex-end !important; gap: 8px !important; height: 110px !important; }
#publisher-print-root .pr-trend > div { flex: 1 !important; height: 100% !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: flex-end !important; gap: 3px !important; }
#publisher-print-root .pr-trend .bar { width: 70% !important; max-width: 34px !important; border-radius: 3px 3px 0 0 !important; background: #b9def7 !important; }
#publisher-print-root .pr-trend .bar.now { background: #1f9bea !important; }
#publisher-print-root .pr-trend .v { font-size: 8.5pt !important; font-weight: 700 !important; }
#publisher-print-root .pr-trend .m { font-size: 8pt !important; color: #64748b !important; white-space: nowrap !important; }
#publisher-print-root .pr-cat { display: grid !important; grid-template-columns: 70px 1fr auto !important; align-items: center !important; gap: 8px !important; margin-bottom: 7px !important; font-size: 9pt !important; }
#publisher-print-root .pr-cat .track { height: 8px !important; border-radius: 4px !important; background: #e8eef3 !important; overflow: hidden !important; }
#publisher-print-root .pr-cat .fill { height: 100% !important; border-radius: 4px !important; background: #1f9bea !important; }
#publisher-print-root .pr-section { margin-top: 16px !important; }
#publisher-print-root .pr table { width: 100% !important; border-collapse: collapse !important; font-size: 9pt !important; }
#publisher-print-root .pr thead { display: table-header-group !important; }
#publisher-print-root .pr th { text-align: start !important; font-size: 8pt !important; font-weight: 700 !important; color: #475569 !important; background: #eef3f7 !important; padding: 6px 8px !important; border-bottom: 1px solid #cfd9e2 !important; }
#publisher-print-root .pr td { padding: 6px 8px !important; border-bottom: 1px solid #e5ebf0 !important; vertical-align: top !important; }
#publisher-print-root .pr tr { break-inside: avoid !important; page-break-inside: avoid !important; }
#publisher-print-root .pr td.title { font-weight: 600 !important; }
#publisher-print-root .pr td.rank { width: 26px !important; color: #64748b !important; font-weight: 700 !important; }
#publisher-print-root .pr tr.top td.rank { color: #1f9bea !important; }
#publisher-print-root .pr-note { margin-top: 14px !important; padding-top: 8px !important; border-top: 1px solid #dbe4ec !important; font-size: 8pt !important; color: #64748b !important; break-inside: avoid !important; }
#publisher-print-root table { break-inside: auto !important; page-break-inside: auto !important; }
#publisher-print-root th, #publisher-print-root td { border: 0 !important; border-bottom: 1px solid #e5ebf0 !important; }
#publisher-print-root th { border-bottom-color: #cfd9e2 !important; }
`;

function usualText(value: VsUsual | null) {
  if (!value) return "مبكر للحكم";
  if (value.ratio >= 2) return `×${value.ratio.toLocaleString("en-US", { maximumFractionDigits: 1 })} المعتاد`;
  if (value.ratio >= 1.1) return "فوق المعتاد";
  if (value.ratio < 0.9) return "أقل من المعتاد";
  return "في حدود المعتاد";
}

function Delta({ now, before }: { now: number; before: number }) {
  if (before <= 0) return <span className="hint">لا مقارنة بالشهر السابق</span>;
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return <span className="hint">مثل الشهر السابق</span>;
  return (
    <span className="hint">
      <span className={change > 0 ? "pr-up" : "pr-down"}>
        {change > 0 ? "▲" : "▼"} <bdi className="num">{formatNumber(Math.abs(change))}%</bdi>
      </span>{" "}
      عن الشهر السابق
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="pr-stat">
      <div className="label">{label}</div>
      <div className="value num">{value}</div>
      {hint}
    </div>
  );
}

/** نسخة الطباعة/PDF من التقرير الشهري، بهوية سبق. لا تظهر على الشاشة. */
export function PublisherPrintReport({ data }: { data: PrintReportData }) {
  // اسم ملف PDF الافتراضي يؤخذ من عنوان الصفحة
  useEffect(() => {
    const original = document.title;
    const before = () => {
      document.title = `تقرير ${data.agencyName} - ${data.monthLabel} - سبق`;
    };
    const after = () => {
      document.title = original;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      document.title = original;
    };
  }, [data.agencyName, data.monthLabel]);

  const trendMax = Math.max(1, ...data.trend.map((m) => m.published));
  const catMax = Math.max(1, ...data.categories.map((c) => c.published));
  const topIds = new Set(data.topArticles.slice(0, 3).map((a) => a.id));
  const average = data.totals.published ? Math.round(data.totals.views / data.totals.published) : null;

  return createPortal(
    <div id="publisher-print-root">
      <style>{PRINT_CSS}</style>
      <div className="pr" dir="rtl" data-testid="publisher-print-report">
        <div className="pr-head">
          <div>
            <div className="kind">التقرير الشهري للوكالة</div>
            <div className="pr-title">{data.monthLabel}</div>
          </div>
          <img src={sabqLogo} alt="سبق" />
        </div>

        <dl className="pr-meta">
          <div>
            <dt>الوكالة</dt>
            <dd>{data.agencyName}</dd>
          </div>
          <div>
            <dt>{data.contactPerson ? "مسؤول الحساب" : "الفترة"}</dt>
            <dd>{data.contactPerson || data.monthLabel}</dd>
          </div>
          <div>
            <dt>الباقة</dt>
            <dd>{data.packageLine || "—"}</dd>
          </div>
          <div>
            <dt>تاريخ الإعداد</dt>
            <dd className="num">{formatDateShort(data.generatedAt)}</dd>
          </div>
        </dl>

        <div className="pr-stats">
          <Stat label="أخبار منشورة" value={formatNumber(data.totals.published)} hint={<Delta now={data.totals.published} before={data.previous.published} />} />
          <Stat label="قراءات أخبار الشهر" value={formatNumber(data.totals.views)} hint={<Delta now={data.totals.views} before={data.previous.views} />} />
          <Stat label="متوسط قراءات الخبر" value={average === null ? "—" : formatNumber(average)} hint={<span className="hint">لكل خبر منشور</span>} />
          <Stat
            label="أيام الشهر"
            value={`${data.countedDays} / ${data.daysInMonth}`}
            hint={<span className="hint">{data.inProgress ? "الشهر لم يكتمل بعد" : "شهر كامل"}</span>}
          />
        </div>

        {data.trend.length > 1 || data.categories.length > 0 ? (
          <div className="pr-panels">
            {data.trend.length > 1 ? (
              <section className="pr-panel">
                <div className="pr-h">الأخبار المنشورة آخر {formatNumber(data.trend.length)} أشهر</div>
                <div className="pr-trend">
                  {data.trend.map((m) => (
                    <div key={m.month}>
                      <span className="v num">{formatNumber(m.published)}</span>
                      <span
                        className={m.month === data.month ? "bar now" : "bar"}
                        style={{ height: `${Math.max(3, (m.published / trendMax) * 78)}%` }}
                      />
                      <span className="m">{m.label}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {data.categories.length > 0 ? (
              <section className="pr-panel">
                <div className="pr-h">حسب القسم</div>
                {data.categories.map((c) => (
                  <div key={c.name} className="pr-cat">
                    <span>{c.name}</span>
                    <span className="track">
                      <span className="fill" style={{ display: "block", width: `${(c.published / catMax) * 100}%` }} />
                    </span>
                    <span className="num muted">
                      {formatNumber(c.published)} خبر · {formatNumber(c.views)} قراءة
                    </span>
                  </div>
                ))}
                {data.authors.length > 1 ? (
                  <>
                    <div className="pr-h" style={{ marginTop: 12 }}>حسب عضو الفريق</div>
                    {data.authors.map((a) => (
                      <div key={a.name} className="pr-cat" style={{ gridTemplateColumns: "1fr auto" }}>
                        <span>{a.name}</span>
                        <span className="num muted">
                          {formatNumber(a.published)} خبر · {formatNumber(a.views)} قراءة
                        </span>
                      </div>
                    ))}
                  </>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}

        <section className="pr-section">
          <div className="pr-h">
            أخبار الشهر ({formatNumber(data.articles.length)})
            {topIds.size > 0 ? <span className="muted" style={{ fontWeight: 400, fontSize: "8.5pt" }}> · الرقم الأزرق = من الثلاثة الأعلى قراءة</span> : null}
          </div>
          {data.articles.length === 0 ? (
            <div className="muted">لا توجد أخبار منشورة في هذا الشهر.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>الخبر</th>
                  <th>القسم</th>
                  <th>النشر</th>
                  <th>القراءات</th>
                  <th>مقارنة بالمعتاد</th>
                </tr>
              </thead>
              <tbody>
                {data.articles.map((a, i) => (
                  <tr key={a.id} className={topIds.has(a.id) ? "top" : undefined}>
                    <td className="rank num">{i + 1}</td>
                    <td className="title">{a.title}</td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{a.categoryName ?? "—"}</td>
                    <td className="num muted" style={{ whiteSpace: "nowrap" }}>{a.publishedAt ? formatDateShort(a.publishedAt) : "—"}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{formatNumber(a.views ?? 0)}</td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{usualText(a.vsUsual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="pr-note">
          القراءات هي مجموع قراءات الأخبار المنشورة في الشهر حتى تاريخ إعداد التقرير. «المعتاد» هو وسيط قراءات أخبار سبق في القسم
          نفسه خلال آخر 90 يومًا، ولا يُحكم على الخبر قبل مرور يومين على نشره.
        </div>
      </div>
    </div>,
    document.body,
  );
}
