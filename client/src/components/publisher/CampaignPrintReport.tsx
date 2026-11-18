import { useEffect } from "react";
import { createPortal } from "react-dom";
import { PRINT_CSS, usualText } from "@/components/publisher/PublisherPrintReport";
import { articleHref, campaignPeriod, ratioPercent, type CampaignReport } from "@/components/publisher/campaignTypes";
import { formatDateShort, formatDateTime, formatNumber } from "@/lib/format";
import sabqLogo from "../../../../public/branding/identity/sabq-logo.svg";

/**
 * تقرير العميل للحملة — ورقة A4 بهوية سبق، بالطريقة نفسها للتقرير الشهري:
 * تُرسم في بوابة على body ولا تظهر إلا عند الطباعة أو الحفظ PDF.
 */
const CAMPAIGN_CSS = `
#publisher-print-root .pr-links { font-size: 7.5pt !important; color: #0b6fa8 !important; direction: ltr !important; unicode-bidi: isolate !important; display: inline-block !important; word-break: break-all !important; }
#publisher-print-root .pr-place { display: inline-block !important; margin: 0 0 2px 3px !important; padding: 0 5px !important; border-radius: 4px !important; background: #e6f4fd !important; color: #0b6fa8 !important; font-size: 7.5pt !important; white-space: nowrap !important; }
#publisher-print-root .pr-rows > div { display: flex !important; justify-content: space-between !important; gap: 10px !important; padding: 5px 0 !important; border-bottom: 1px solid #e5ebf0 !important; font-size: 9pt !important; }
#publisher-print-root .pr-rows > div:last-child { border-bottom: 0 !important; }
`;

function placementsOf(a: CampaignReport["articles"][number]) {
  const p = a.placements;
  const chips: string[] = [];
  if (p?.featured) chips.push("مميز في الرئيسية");
  if (p?.breaking) chips.push("عاجل");
  if (p?.push) chips.push("تنبيه للقراء");
  if (a.categoryName) chips.push(`قسم ${a.categoryName}`);
  if (p?.x) chips.push("X");
  return chips;
}

export function CampaignPrintReport({ report, origin }: { report: CampaignReport; origin: string }) {
  const { campaign, agency } = report;

  useEffect(() => {
    const original = document.title;
    const before = () => {
      document.title = `تقرير حملة ${campaign.name} - ${agency.name} - سبق`;
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
  }, [campaign.name, agency.name]);

  const published = report.articles.filter((a) => a.stage === "published");
  const remaining = report.articles.filter((a) => a.stage !== "published" && a.stage !== "archived");
  const period = campaignPeriod(campaign.startsOn, campaign.endsOn);
  const pct = ratioPercent(report.totals.vsUsualRatio);
  const host = origin.replace(/^https?:\/\//, "");

  return createPortal(
    <div id="publisher-print-root">
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
      />
      <style>{PRINT_CSS + CAMPAIGN_CSS}</style>
      <div className="pr" dir="rtl" data-testid="campaign-print-report">
        <div className="pr-head">
          <div>
            <div className="kind">تقرير حملة{campaign.clientName ? ` · أُعد للعميل: ${campaign.clientName}` : ""}</div>
            <div className="pr-title">{campaign.name}</div>
          </div>
          <div className="pr-logos">
            {agency.logoUrl ? (
              <>
                <img className="agency" src={agency.logoUrl} alt={agency.name} />
                <span className="sep" />
              </>
            ) : null}
            <img src={sabqLogo} alt="سبق" />
          </div>
        </div>

        <dl className="pr-meta">
          <div>
            <dt>الوكالة</dt>
            <dd>{agency.name}</dd>
          </div>
          <div>
            <dt>العميل</dt>
            <dd>{campaign.clientName || "—"}</dd>
          </div>
          <div>
            <dt>فترة الحملة</dt>
            <dd>{period || "—"}</dd>
          </div>
          <div>
            <dt>الأرقام حتى</dt>
            <dd className="num">{formatDateTime(report.generatedAt)}</dd>
          </div>
        </dl>

        <div className="pr-stats">
          <div className="pr-stat">
            <div className="label">مواد منشورة</div>
            <div className="value num">{formatNumber(report.counts.published)}</div>
            <span className="hint">من {formatNumber(report.counts.total)} في ملف الحملة</span>
          </div>
          <div className="pr-stat">
            <div className="label">القراءات حتى تاريخ التقرير</div>
            <div className="value num">{formatNumber(report.totals.views)}</div>
            <span className="hint">
              {report.totals.averageViews == null ? "—" : `متوسط الخبر ${formatNumber(report.totals.averageViews)}`}
            </span>
          </div>
          <div className="pr-stat">
            <div className="label">مقارنة بالمعتاد في أقسامها</div>
            <div className={`value num ${report.totals.vsUsualRatio != null && report.totals.vsUsualRatio >= 1 ? "pr-up" : ""}`}>
              {pct ?? "—"}
            </div>
            <span className="hint">
              {report.totals.comparedCount
                ? `على ${formatNumber(report.totals.comparedCount)} من الأخبار المكتملة`
                : "مبكر للحكم"}
            </span>
          </div>
          <div className="pr-stat">
            <div className="label">ظهور إضافي</div>
            <div className="value num">
              {formatNumber(report.placementTotals.featured + report.placementTotals.push + report.placementTotals.x)}
            </div>
            <span className="hint">الرئيسية والتنبيهات وX</span>
          </div>
        </div>

        <section className="pr-section">
          <div className="pr-h">المواد المنشورة ({formatNumber(published.length)})</div>
          {published.length === 0 ? (
            <div className="muted">لم يُنشر شيء من الحملة بعد.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>المادة والرابط</th>
                  <th>النشر</th>
                  <th>القراءات</th>
                  <th>عن المعتاد</th>
                  <th>أين ظهرت</th>
                </tr>
              </thead>
              <tbody>
                {published.map((a) => (
                  <tr key={a.id}>
                    <td className="title">
                      <div>{a.title}</div>
                      <span className="pr-links">{`${host}${articleHref(a)}`}</span>
                    </td>
                    <td className="num muted" style={{ whiteSpace: "nowrap" }}>{a.publishedAt ? formatDateShort(a.publishedAt) : "—"}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{formatNumber(a.views ?? 0)}</td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{usualText(a.vsUsual)}</td>
                    <td>
                      {placementsOf(a).map((chip) => (
                        <span key={chip} className="pr-place">{chip}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="pr-panels">
          <section className="pr-panel">
            <div className="pr-h">مواضع الظهور الفعلية</div>
            <div className="pr-rows">
              <div><span>مميز في الصفحة الرئيسية</span><span className="num">{formatNumber(report.placementTotals.featured)}</span></div>
              <div><span>خبر عاجل</span><span className="num">{formatNumber(report.placementTotals.breaking)}</span></div>
              <div><span>تنبيه لقراء التطبيق</span><span className="num">{formatNumber(report.placementTotals.push)}</span></div>
              <div><span>حساب سبق في X</span><span className="num">{formatNumber(report.placementTotals.x)}</span></div>
            </div>
          </section>
          <section className="pr-panel">
            <div className="pr-h">ما بقي في الحملة</div>
            {remaining.length === 0 ? (
              <div className="muted">لا شيء. كل مواد الملف منشورة.</div>
            ) : (
              <div className="pr-rows">
                <div><span>لدى فريق التحرير للمراجعة</span><span className="num">{formatNumber(report.counts.withSabq)}</span></div>
                <div><span>تنتظر تعديل الوكالة</span><span className="num">{formatNumber(report.counts.needsChanges)}</span></div>
                <div><span>مجدولة</span><span className="num">{formatNumber(report.counts.scheduled)}</span></div>
                <div><span>مسودات</span><span className="num">{formatNumber(report.counts.drafts)}</span></div>
              </div>
            )}
          </section>
        </div>

        <div className="pr-note">
          المصدر: إحصاءات سبق. القراءات تُحسب حتى وقت إعداد التقرير. «المعتاد» هو وسيط قراءات أخبار سبق في القسم نفسه خلال آخر
          90 يومًا، ولا يُحكم على الخبر قبل مرور يومين على نشره. اختيار مواد الرئيسية والتنبيهات قرار تحريري.
        </div>
      </div>
    </div>,
    document.body,
  );
}
