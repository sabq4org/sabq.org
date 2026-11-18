import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatNumber } from "@/lib/format";
import { waitLabel } from "@shared/publisherCampaigns";

interface YourItem {
  kind: "needs_changes" | "offer";
  id: string;
  title: string;
  note: string | null;
  campaignName: string | null;
  waitingSince: string;
  href: string;
}

interface WithSabqItem {
  id: string;
  title: string;
  campaignName: string | null;
  waitingSince: string;
}

/**
 * «ينتظر إجراءك» في لوحة الوكالة: المواد التي أعادها المحرر بسببها وزر فتحها،
 * ثم «عند سبق الآن» بعمر الانتظار. العروض تبقى في بطاقة التجديد كما هي.
 */
export function PortalActionItems() {
  const { data } = useQuery<{ yours: YourItem[]; withSabq: WithSabqItem[] }>({
    queryKey: ["/api/publisher/portal/action-items"],
  });
  const yours = (Array.isArray(data?.yours) ? data!.yours : []).filter((i) => i.kind === "needs_changes");
  const withSabq = Array.isArray(data?.withSabq) ? data!.withSabq : [];
  if (yours.length === 0 && withSabq.length === 0) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]" data-testid="portal-action-items">
      <section className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_2px_rgba(27,43,58,.04),0_8px_24px_rgba(27,43,58,.06)]">
        <div className="flex items-center justify-between px-4 pb-3 pt-4 md:px-5">
          <h2 className="text-lg font-bold">ينتظر إجراءك</h2>
          <span className="text-sm text-muted-foreground">
            {yours.length ? `${formatNumber(yours.length)} مادة` : "لا شيء الآن"}
          </span>
        </div>
        {yours.length === 0 ? (
          <div className="border-t border-border/60 px-5 py-8 text-center text-sm text-muted-foreground">
            كل موادكم إما منشورة أو عند المحرر.
          </div>
        ) : (
          <ul>
            {yours.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-3 border-t border-border/60 bg-amber-50/60 px-4 py-3.5 dark:bg-amber-950/20 md:px-5"
              >
                <div className="min-w-0 flex-[1_1_240px]">
                  <div className="font-semibold">{item.title}</div>
                  {item.note ? (
                    <div className="mt-0.5 text-sm text-amber-900 dark:text-amber-200">ملاحظة المحرر: {item.note}</div>
                  ) : null}
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {[`أعادها المحرر ${waitLabel(item.waitingSince)}`, item.campaignName ? `حملة ${item.campaignName}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <Link
                  href={item.href}
                  className="inline-flex min-h-[40px] items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
                >
                  افتح المادة للتعديل
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-[20px] bg-card shadow-sm">
        <div className="flex items-center justify-between px-4 pb-3 pt-4 md:px-5">
          <h2 className="text-lg font-bold">عند سبق الآن</h2>
          <span className="text-sm text-muted-foreground">{formatNumber(withSabq.length)}</span>
        </div>
        {withSabq.length === 0 ? (
          <div className="border-t border-border/60 px-5 py-8 text-center text-sm text-muted-foreground">لا مواد بانتظار المراجعة.</div>
        ) : (
          <ul>
            {withSabq.slice(0, 8).map((item) => (
              <li key={item.id} className="border-t border-border/60 px-4 py-3 md:px-5">
                <div className="truncate text-sm font-semibold">{item.title}</div>
                <div className="text-xs text-muted-foreground">
                  {[`أُرسلت ${waitLabel(item.waitingSince)}`, item.campaignName ? `حملة ${item.campaignName}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
