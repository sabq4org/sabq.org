/**
 * قصة انتقال لاعب — /sports/transfers/story/:playerId
 *
 * بروفايل اللاعب + بطاقة الحالة الراهنة (الناديان + المبلغ المتداول) + خط زمني
 * لكل الإشاعات السابقة مرتّبة تصاعديًّا مع تطوّر الاحتمال، + أخبار ذات صلة
 * من أرشيف سبق عبر /api/search.
 *
 * معرّف اللاعب من فضاء SportMonks — لا يُربط بـ /sports/player (API-Football).
 * الهوية البصرية: تلميع ضمن بوابة /sports ومركز الانتقالات.
 */
import { useEffect, useMemo } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, ArrowLeft, ExternalLink, ShieldCheck, Shield, ShieldAlert,
  Flame, Repeat, FileSignature, ArrowLeftRight, CircleDashed, Newspaper,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCanonical } from "@/hooks/useCanonical";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type TcProbability = "LOW" | "MEDIUM" | "HIGH" | "IMMINENT";
type SourceTier = "high" | "medium" | "low";
interface TcParty { id: number; name: string; image: string | null; leagueId: number | null; leagueName: string | null; saudi: boolean; }
interface TcPlayer { id: number; name: string; image: string | null; position: string | null; birthdate: string | null; }
interface TcRumour {
  id: number;
  date: string;
  probability: TcProbability;
  kind: "transfer" | "loan" | "extension";
  amount: number | null;
  currency: string | null;
  source: { name: string; url: string | null; tier: SourceTier };
  hereWeGo: boolean;
  player: TcPlayer;
  from: TcParty;
  to: TcParty;
  saudi: boolean;
}
interface StoryResponse { configured: boolean; found: boolean; player: TcPlayer | null; timeline: TcRumour[]; }
interface SearchArticle { id: number; title: string; slug: string; imageUrl: string | null; publishedAt: string | null; categoryName?: string | null; }
interface SearchResponse { results: SearchArticle[]; query: string; }

const dayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" });
function fmtDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dayFmt.format(d);
}

const CURRENCY_SYMBOL: Record<string, string> = { EUR: "€", GBP: "£", USD: "$" };
function fmtMoney(n: number | null, cur: string | null): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  const sym = CURRENCY_SYMBOL[cur ?? "EUR"] ?? "";
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 ? v.toFixed(1) : v} مليون ${sym}`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)} ألف ${sym}`;
  return `${n} ${sym}`;
}

const PROB_META: Record<TcProbability, { label: string; seg: number; bar: string; text: string; dot: string }> = {
  IMMINENT: { label: "وشيكة", seg: 4, bar: "bg-red-500", text: "text-red-600 dark:text-red-400", dot: "bg-red-500 ring-red-500/25" },
  HIGH: { label: "قوية", seg: 3, bar: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", dot: "bg-orange-500 ring-orange-500/25" },
  MEDIUM: { label: "متوسطة", seg: 2, bar: "bg-yellow-500", text: "text-yellow-700 dark:text-yellow-400", dot: "bg-yellow-500 ring-yellow-500/25" },
  LOW: { label: "ضعيفة", seg: 1, bar: "bg-zinc-400", text: "text-foreground/55", dot: "bg-zinc-400 ring-zinc-400/25" },
};

const TIER_META: Record<SourceTier, { label: string; icon: React.ReactNode; cls: string }> = {
  high: { label: "موثوقية عالية", icon: <ShieldCheck className="h-3.5 w-3.5" />, cls: "text-emerald-700 dark:text-emerald-400" },
  medium: { label: "موثوقية متوسطة", icon: <Shield className="h-3.5 w-3.5" />, cls: "text-foreground/60" },
  low: { label: "تعامل بحذر", icon: <ShieldAlert className="h-3.5 w-3.5" />, cls: "text-amber-700 dark:text-amber-500" },
};

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <p className="text-sm font-semibold text-foreground/80">{title}</p>
      {hint && <p className="mt-1.5 text-[12.5px] text-foreground/55">{hint}</p>}
      <Link href="/sports/transfers" className="mt-4 inline-flex text-sm font-extrabold text-primary hover:underline">
        عُد إلى مركز الانتقالات
      </Link>
    </div>
  );
}

function ProbabilityMeter({ p }: { p: TcProbability }) {
  const meta = PROB_META[p];
  return (
    <div className="flex items-center gap-1.5" title={`احتمال الانتقال: ${meta.label}`}>
      <div className="flex gap-0.5" dir="ltr">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-1.5 w-3.5 rounded-full ${i <= meta.seg ? meta.bar : "bg-border"} ${p === "IMMINENT" && i <= meta.seg ? "animate-pulse" : ""}`}
          />
        ))}
      </div>
      <span className={`text-[11px] font-bold ${meta.text}`}>{meta.label}</span>
    </div>
  );
}

function SourceBadge({ source }: { source: TcRumour["source"] }) {
  const tier = TIER_META[source.tier];
  const inner = (
    <span className={`inline-flex items-center gap-1 text-[11px] ${tier.cls}`} title={tier.label}>
      {tier.icon}
      <span className="font-bold">{source.name}</span>
      {source.url && <ExternalLink className="h-3 w-3 opacity-60" />}
    </span>
  );
  return source.url ? (
    <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{inner}</a>
  ) : inner;
}

function kindBadge(kind: TcRumour["kind"]) {
  if (kind === "loan") {
    return (
      <Badge className="shrink-0 gap-1 border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-400">
        <Repeat className="h-3 w-3" /> إعارة
      </Badge>
    );
  }
  if (kind === "extension") {
    return (
      <Badge className="shrink-0 gap-1 border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-400">
        <FileSignature className="h-3 w-3" /> تجديد عقد
      </Badge>
    );
  }
  return (
    <Badge className="shrink-0 gap-1 border-border bg-background text-foreground/70">
      <ArrowLeftRight className="h-3 w-3" /> انتقال
    </Badge>
  );
}

function MoneyChip({ value }: { value: string }) {
  return (
    <span className="shrink-0 rounded-lg border border-border bg-background px-2 py-0.5 text-xs font-extrabold tabular-nums text-foreground" dir="ltr">
      {value}
    </span>
  );
}

function ageOf(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  return Math.floor((Date.now() - b.getTime()) / (365.25 * 24 * 3600 * 1000));
}

function ClubColumn({ party }: { party: TcParty }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      {party.image ? (
        <img src={party.image} alt="" className="h-14 w-14 object-contain sm:h-16 sm:w-16" loading="lazy" />
      ) : (
        <div className="h-14 w-14 rounded-full border border-border bg-background sm:h-16 sm:w-16" />
      )}
      <div className="w-full truncate text-center text-sm font-extrabold text-foreground">{party.name}</div>
      {party.leagueName && <div className="text-[11px] font-medium text-foreground/55">{party.leagueName}</div>}
    </div>
  );
}

/** الحالة الراهنة: ناديان + سهم + مبلغ — بلا بطاقة ثقيلة */
function CurrentStateCard({ latest }: { latest: TcRumour }) {
  const money = fmtMoney(latest.amount, latest.currency);
  return (
    <div className={`rounded-2xl border bg-card p-5 sm:p-6 ${latest.hereWeGo ? "border-red-500/35" : "border-border"}`}>
      {latest.hereWeGo && (
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-[11px] font-extrabold text-white">
          <Flame className="h-3.5 w-3.5" /> Here we go
        </div>
      )}
      <div className="flex items-center justify-between gap-3 sm:gap-6">
        <ClubColumn party={latest.from} />
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <ArrowLeft className={`h-8 w-8 sm:h-9 sm:w-9 ${latest.hereWeGo ? "animate-pulse text-red-500" : "text-primary"}`} strokeWidth={2.2} />
          {money && <div className="text-xl font-extrabold tabular-nums text-foreground sm:text-2xl" dir="ltr">{money}</div>}
          {kindBadge(latest.kind)}
        </div>
        <ClubColumn party={latest.to} />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border pt-4">
        <ProbabilityMeter p={latest.probability} />
        <SourceBadge source={latest.source} />
        <span className="text-[11px] tabular-nums text-foreground/55">آخر تحديث: {fmtDay(latest.date)}</span>
      </div>
    </div>
  );
}

export default function TransferStory() {
  const params = useParams<{ playerId: string }>();
  const playerId = Number.parseInt(params.playerId ?? "", 10);

  const { data, isLoading } = useQuery<StoryResponse>({
    queryKey: [`/api/transfer-center/story/${playerId}`],
    staleTime: 10 * 60_000,
    enabled: Number.isFinite(playerId) && playerId > 0,
  });

  const player = data?.player ?? null;
  const timeline = useMemo(() => (Array.isArray(data?.timeline) ? data!.timeline : []), [data]);
  const latest = timeline.length ? timeline[timeline.length - 1] : null;

  useCanonical(player ? `https://sabq.org/sports/transfers/story/${playerId}` : null);
  useEffect(() => {
    if (player) document.title = `قصة انتقال ${player.name} — مركز الانتقالات | سبق`;
    return () => { document.title = "صحيفة سبق الإلكترونية"; };
  }, [player]);

  const { data: related } = useQuery<SearchResponse>({
    queryKey: ["/api/search", { q: player?.name ?? "", limit: 6 }],
    staleTime: 10 * 60_000,
    enabled: Boolean(player?.name && player.name.length >= 2),
  });
  const relatedArticles = Array.isArray(related?.results) ? related!.results.slice(0, 6) : [];
  const age = ageOf(player?.birthdate ?? null);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header />

      {/* هيرو خفيف متسق مع مركز الانتقالات */}
      <section className="border-b border-border bg-card px-4 pt-6 pb-5 sm:px-6 sm:pt-8 sm:pb-6">
        <div className="mx-auto max-w-[900px]">
          <Link
            href="/sports/transfers"
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-foreground/60 transition-colors hover:text-primary"
          >
            <ArrowRight className="h-4 w-4" /> مركز الانتقالات
          </Link>

          {isLoading ? (
            <div className="flex items-center gap-4">
              <Skeleton className="h-20 w-20 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            </div>
          ) : player ? (
            <div className="flex items-center gap-4">
              {player.image ? (
                <img
                  src={player.image}
                  alt={player.name}
                  className="h-20 w-20 rounded-2xl border border-border object-cover bg-background"
                  loading="lazy"
                />
              ) : (
                <div className="grid h-20 w-20 place-items-center rounded-2xl border border-border bg-background text-lg font-bold text-foreground/35">
                  ؟
                </div>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-extrabold text-foreground sm:text-3xl">{player.name}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-foreground/65">
                  {player.position && <span>{player.position}</span>}
                  {age != null && <span className="tabular-nums">{age} عامًا</span>}
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-extrabold text-foreground/70">
                    <CircleDashed className="h-3.5 w-3.5" /> قصة إشاعات — لم تتأكد بعد
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <h1 className="text-2xl font-extrabold text-foreground sm:text-3xl">قصة انتقال</h1>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-52 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        ) : !data?.found || !player || !latest ? (
          <EmptyState
            title="لا توجد قصة انتقال موثّقة لهذا اللاعب حاليًا"
            hint="قد تظهر لاحقًا عند رصد إشاعات جديدة من المصادر."
          />
        ) : (
          <div className="space-y-6">
            <CurrentStateCard latest={latest} />

            {/* الخط الزمني */}
            <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h2 className="text-lg font-extrabold text-foreground">تسلسل القصة</h2>
              <p className="mt-1 text-[12.5px] font-medium text-foreground/55">
                {timeline.length} تطوّرًا — تصاعديًّا مع درجة احتمال كل مرحلة ومصدرها
              </p>
              <div className="relative mt-5 space-y-5 before:absolute before:bottom-2 before:right-[7px] before:top-2 before:w-0.5 before:bg-border">
                {timeline.map((r) => {
                  const meta = PROB_META[r.probability];
                  const money = fmtMoney(r.amount, r.currency);
                  return (
                    <div key={r.id} className="relative pr-7">
                      <span className={`absolute right-0 top-1.5 h-4 w-4 rounded-full ring-4 ${meta.dot}`} />
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs font-bold tabular-nums text-foreground/55">{fmtDay(r.date)}</span>
                        <span className={`text-xs font-extrabold ${meta.text}`}>{meta.label}</span>
                        {kindBadge(r.kind)}
                        {r.hereWeGo && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-extrabold text-white">
                            <Flame className="h-3 w-3" /> Here we go
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex min-w-0 items-center gap-2 text-sm">
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground/60">
                          {r.from.image && <img src={r.from.image} alt="" className="h-4 w-4 shrink-0 object-contain" loading="lazy" />}
                          <span className="max-w-[8rem] truncate">{r.from.name}</span>
                        </span>
                        <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-foreground/35" />
                        <span className="inline-flex min-w-0 items-center gap-1.5 font-bold text-foreground">
                          {r.to.image && <img src={r.to.image} alt="" className="h-4 w-4 shrink-0 object-contain" loading="lazy" />}
                          <span className="max-w-[8rem] truncate">{r.to.name}</span>
                        </span>
                        {money && <MoneyChip value={money} />}
                      </div>
                      <div className="mt-1.5">
                        <SourceBadge source={r.source} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* أخبار ذات صلة */}
            {relatedArticles.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Newspaper className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-extrabold text-foreground">أخبار ذات صلة</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {relatedArticles.map((a) => (
                    <Link
                      key={a.id}
                      href={`/article/${a.slug}`}
                      className="group flex gap-3 rounded-xl border border-border bg-background p-2.5 transition-colors hover:border-primary/35"
                    >
                      {a.imageUrl && (
                        <img src={a.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" loading="lazy" />
                      )}
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-sm font-bold text-foreground transition-colors group-hover:text-primary">
                          {a.title}
                        </div>
                        {a.publishedAt && (
                          <div className="mt-1 text-[10px] tabular-nums text-foreground/55">{fmtDay(a.publishedAt)}</div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <p className="text-[11px] leading-relaxed text-foreground/55">
              درجة الاحتمال والمبلغ المتداول من المصدر المذكور في كل مرحلة (رصد SportMonks)، ومؤشر الموثوقية تصنيف تحريري من سبق. تبقى القصة إشاعةً حتى إعلانها رسميًّا من الناديين.
            </p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
