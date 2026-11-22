import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { EnglishDashboardLayout } from "@/components/en/EnglishDashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { riyadhDayStart, type EnDeskNeed, type EnDeskOverview, type EnDeskPublishedItem, type EnDeskPulseItem } from "@shared/enDeskOverview";
import { displayTimeZone } from "@/lib/displayTimeZone";

const RIYADH = displayTimeZone(); // device timezone (name kept for the existing call sites)
const OVERVIEW_KEY = ["/api/en/admin/desk-overview"];

const fmtTime = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-GB", { timeZone: RIYADH, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "";

const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(n);

function greetingFor(now: Date): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: RIYADH, hour: "2-digit", hour12: false }).format(now));
  if (h < 4) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function ago(iso: string | null, now: Date): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

const SURFACE = "rounded-[22px] bg-white shadow-[0_1px_2px_rgba(27,43,58,0.05)]";
const ROW = "flex items-center gap-4 px-6 py-4 border-t border-[#EEF2F6] first:border-t-0";
const PILL_SECONDARY = "inline-flex h-9 items-center rounded-full border border-[#D5E1EC] bg-white px-4 text-[13px] font-medium text-[#1B2B3A] hover:border-[#1E9BE6] hover:text-[#0B6FA8] disabled:opacity-50";
const PILL_SOFT = "inline-flex h-9 items-center rounded-full bg-[#EAF7FF] px-4 text-[13px] font-semibold text-[#0B6FA8] hover:bg-[#D9F0FF] disabled:opacity-50";

const KIND_LABEL: Record<EnDeskNeed["kind"], { text: string; color: string }> = {
  scheduled: { text: "Scheduled", color: "text-[#8A4B00]" },
  in_review: { text: "In review", color: "text-[#0B6FA8]" },
  hidden: { text: "Published", color: "text-[#0B6FA8]" },
  draft: { text: "Draft", color: "text-[#3D4F60]" },
};

const SOURCE_LABEL: Record<EnDeskPublishedItem["source"], string> = {
  editor: "Editor",
  bot: "Bot",
  auto: "Auto-translate",
  translated: "Translated",
};

function NeedRow({ need, now, onShowOnHome, busy }: { need: EnDeskNeed; now: Date; onShowOnHome: (id: string) => void; busy: boolean }) {
  const [, navigate] = useLocation();
  const label = KIND_LABEL[need.kind];
  const when = need.kind === "scheduled" ? `${label.text} ${fmtTime(need.scheduledAt)}` : label.text;
  const meta = [need.categoryName, need.hint, need.kind !== "scheduled" ? ago(need.updatedAt, now) : null].filter(Boolean).join(" · ");
  const edit = () => navigate(`/en/dashboard/articles/${need.id}/edit`);
  return (
    <div className={ROW} data-testid={`need-${need.id}`}>
      <span className={`hidden w-[118px] shrink-0 text-[12px] font-semibold sm:block ${label.color}`}>{when}</span>
      <div className="min-w-0 flex-1">
        <span className={`block text-[12px] font-semibold sm:hidden ${label.color}`}>{when}</span>
        <button type="button" onClick={edit} className="line-clamp-2 block w-full text-left text-[15px] font-semibold text-[#1B2B3A] hover:text-[#0B6FA8] sm:truncate">
          {need.title}
        </button>
        <div className="mt-0.5 truncate text-[13px] text-[#6B7B8A]">{meta}</div>
      </div>
      {need.kind === "hidden" ? (
        <button type="button" className={PILL_SOFT} disabled={busy} onClick={() => onShowOnHome(need.id)}>Show on home</button>
      ) : need.hint === "SEO missing" ? (
        <button type="button" className={PILL_SOFT} onClick={edit}>Generate SEO</button>
      ) : (
        <button type="button" className={PILL_SECONDARY} onClick={edit}>{need.kind === "scheduled" ? "Review" : "Finish"}</button>
      )}
    </div>
  );
}

function PulseRow({ item, onTranslate, busy }: { item: EnDeskPulseItem; onTranslate: (id: string) => void; busy: boolean }) {
  return (
    <div className={`${ROW} justify-between`}>
      <div lang="ar" dir="rtl" className="min-w-0 flex-1 truncate text-right font-[IBM_Plex_Sans_Arabic,sans-serif] text-[14px] font-medium text-[#1B2B3A]">
        {item.title}
      </div>
      {item.state === "translated" && item.enArticleId ? (
        <Link href={`/en/dashboard/articles/${item.enArticleId}/edit`} className="shrink-0 text-[13px] font-semibold text-[#0B6FA8]">Translated</Link>
      ) : item.state === "draft" && item.enArticleId ? (
        <Link href={`/en/dashboard/articles/${item.enArticleId}/edit`} className="shrink-0 text-[13px] font-semibold text-[#3D4F60]">Draft ready</Link>
      ) : (
        <button type="button" className={`${PILL_SECONDARY} shrink-0`} disabled={busy} onClick={() => onTranslate(item.arArticleId)}>
          {busy ? "Translating…" : "Translate now"}
        </button>
      )}
    </div>
  );
}

function OverviewBody({ data }: { data: EnDeskOverview }) {
  const now = useMemo(() => new Date(data.now), [data.now]);
  const qc = useQueryClient();
  const { toast } = useToast();

  const showOnHome = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/en/dashboard/articles/${id}`, { method: "PATCH", body: JSON.stringify({ hideFromHomepage: false }) }),
    onSuccess: () => {
      toast({ title: "Now on the English homepage" });
      qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
    onError: (e: Error) => toast({ title: "Could not update the story", description: e.message, variant: "destructive" }),
  });

  const translate = useMutation({
    mutationFn: (arId: string) => apiRequest(`/api/admin/articles/${arId}/translate-to-english`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Translated and published in English" });
      qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
    onError: (e: Error) => toast({ title: "Translation failed", description: e.message, variant: "destructive" }),
  });

  // Tolerate an older API during a split deploy (Pages and the API ship separately).
  const counts = data.counts ?? { enLast24h: 0, arLast24h: 0, waiting: 0, scheduledTonight: 0 };
  const needs = Array.isArray(data.needs) ? data.needs : [];
  const pulse = { enabled: !!data.pulse?.enabled, nextRunAt: data.pulse?.nextRunAt ?? data.now, items: Array.isArray(data.pulse?.items) ? data.pulse.items : [] };
  const publishedRecent = Array.isArray(data.publishedRecent) ? data.publishedRecent : [];

  return (
    <div className="flex flex-col gap-5">
      {/* One number for the day */}
      <section aria-label="Today in one line" className={`${SURFACE} flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-5`}>
        <div className="flex items-baseline gap-3">
          <span className="text-[48px] font-bold leading-none text-[#1E9BE6]" data-testid="text-en-24h">{fmtNum(counts.enLast24h)}</span>
          <span className="text-[15px] font-semibold text-[#1B2B3A]">English stories in the last 24 hours</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-[#4A5B6B]">
          <span><strong className="text-[#1B2B3A]">{fmtNum(counts.waiting)}</strong> waiting for you</span>
          <span><strong className="text-[#1B2B3A]">{fmtNum(counts.scheduledTonight)}</strong> scheduled tonight</span>
          <span><strong className="text-[#1B2B3A]">{fmtNum(counts.arLast24h)}</strong> Arabic stories in the same 24 hours</span>
        </div>
        <span className="flex-1" />
        <Link href="/en/dashboard/analytics" className="text-[14px] font-medium text-[#0B6FA8]">Open analytics</Link>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="needs" className={`${SURFACE} overflow-hidden`}>
          <div className="flex items-center px-6 pb-2 pt-5">
            <h2 id="needs" className="text-[17px] font-bold text-[#1B2B3A]">Needs you</h2>
            <span className="flex-1" />
            <Link href="/en/dashboard/articles?status=draft" className="text-[14px] font-medium text-[#0B6FA8]">All drafts</Link>
          </div>
          {needs.length === 0 ? (
            <p className="px-6 pb-6 pt-2 text-[14px] text-[#6B7B8A]">Nothing is waiting. Scheduled stories and fresh drafts will show here.</p>
          ) : (
            <div>
              {needs.map((n) => (
                <NeedRow key={n.id} need={n} now={now} busy={showOnHome.isPending} onShowOnHome={(id) => showOnHome.mutate(id)} />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="pulse" className={`${SURFACE} overflow-hidden`}>
          <div className="px-6 pb-2 pt-5">
            <h2 id="pulse" className="text-[17px] font-bold text-[#1B2B3A]">Translation pulse</h2>
            <p className="mt-1 text-[13px] text-[#6B7B8A]">
              Most read Arabic news of the last 3 hours ·{" "}
              {pulse.enabled ? `next auto-translate run ${fmtTime(pulse.nextRunAt)}` : "auto-translate is off"}
            </p>
          </div>
          {pulse.items.length === 0 ? (
            <p className="px-6 pb-6 pt-2 text-[14px] text-[#6B7B8A]">No Arabic news in the last 3 hours.</p>
          ) : (
            <div>
              {pulse.items.map((p) => (
                <PulseRow
                  key={p.arArticleId}
                  item={p}
                  busy={translate.isPending && translate.variables === p.arArticleId}
                  onTranslate={(id) => translate.mutate(id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="today" className={`${SURFACE} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-2 px-6 pb-2 pt-5">
          <h2 id="today" className="text-[17px] font-bold text-[#1B2B3A]">Published in the last 24 hours</h2>
          <span className="flex-1" />
          <span className="text-[12px] text-[#6B7B8A]">Search engines = listed in the news sitemap (IndexNow pinged on publish), not Google's verdict</span>
        </div>
        {publishedRecent.length === 0 ? (
          <p className="px-6 pb-6 pt-2 text-[14px] text-[#6B7B8A]">No English story published in the last 24 hours.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-[#6B7B8A]">
                  <th className="px-6 py-3 font-semibold">Story</th>
                  <th className="px-3 py-3 font-semibold">Source</th>
                  <th className="px-3 py-3 font-semibold">Time</th>
                  <th className="px-3 py-3 font-semibold">Views</th>
                  <th className="px-6 py-3 font-semibold">Search engines</th>
                </tr>
              </thead>
              <tbody>
                {publishedRecent.map((p) => (
                  <tr key={p.id} className="border-t border-[#EEF2F6]">
                    <td className="max-w-[520px] px-6 py-3">
                      <a href={`/en/article/${p.slug}`} target="_blank" rel="noreferrer" className="font-semibold text-[#1B2B3A] hover:text-[#0B6FA8]">{p.title}</a>
                      {p.categoryName && <div className="text-[12px] text-[#6B7B8A]">{p.categoryName}</div>}
                    </td>
                    <td className="px-3 py-3 text-[#4A5B6B]">{SOURCE_LABEL[p.source]}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#4A5B6B]">
                      {p.publishedAt && Date.parse(p.publishedAt) < riyadhDayStart(now).getTime() ? "Yesterday " : ""}
                      {fmtTime(p.publishedAt)}
                    </td>
                    <td className="px-3 py-3 font-semibold text-[#1B2B3A]">{fmtNum(p.views)}</td>
                    <td className="px-6 py-3 text-[#0B6FA8]">Listed</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function EnglishDeskHome() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery<EnDeskOverview | null>({
    queryKey: OVERVIEW_KEY,
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const now = data ? new Date(data.now) : new Date();
  const u = user as { firstNameEn?: string | null } | null;
  const dateLine = new Intl.DateTimeFormat("en-GB", {
    timeZone: RIYADH, weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(now);
  const timeLine = new Intl.DateTimeFormat("en-US", { timeZone: RIYADH, hour: "numeric", minute: "2-digit" }).format(now);

  return (
    <EnglishDashboardLayout>
      <div className="-m-4 min-h-full bg-[#F4F7FB] p-4 md:-m-6 md:p-8" data-testid="en-desk-home">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="text-[13px] text-[#6B7B8A]">{dateLine} · {timeLine}</p>
              <h1 className="mt-1 text-[28px] font-bold text-[#1B2B3A]" data-testid="text-greeting">
                {greetingFor(now)}{u?.firstNameEn ? `, ${u.firstNameEn}` : ""}
              </h1>
            </div>
            <span className="flex-1" />
            <Link href="/en/dashboard/articles/new" className="inline-flex h-11 items-center rounded-full bg-[#1E9BE6] px-6 text-[15px] font-semibold text-white hover:bg-[#1789CC]">
              New article
            </Link>
          </div>

          {isLoading || !user ? (
            <div className="flex flex-col gap-5">
              <Skeleton className="h-[92px] rounded-[22px]" />
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
                <Skeleton className="h-[320px] rounded-[22px]" />
                <Skeleton className="h-[320px] rounded-[22px]" />
              </div>
            </div>
          ) : isError || !data ? (
            <div className={`${SURFACE} px-6 py-8 text-center`}>
              <p className="text-[15px] font-semibold text-[#1B2B3A]">Could not load the English Desk.</p>
              <button type="button" onClick={() => refetch()} className={`${PILL_SECONDARY} mt-3`}>Try again</button>
            </div>
          ) : (
            <OverviewBody data={data} />
          )}
        </div>
      </div>
    </EnglishDashboardLayout>
  );
}

export default function ProtectedEnglishDeskHome() {
  return (
    <ProtectedRoute requireStaff={true}>
      <EnglishDeskHome />
    </ProtectedRoute>
  );
}
