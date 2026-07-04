/**
 * قصة انتقال لاعب — /sports/transfers/story/:playerId
 *
 * بروفايل اللاعب + بطاقة الحالة الراهنة (الناديان بشعاريهما + سهم متحرك +
 * المبلغ المتداول) + خط زمني لكل الإشاعات السابقة لنفس اللاعب مرتّبة تصاعديًّا
 * مع تطوّر درجة الاحتمال، + «أخبار ذات صلة» من أرشيف سبق (ربط تلقائي بالاسم
 * المعرَّب عبر /api/search).
 *
 * معرّف اللاعب هنا من فضاء SportMonks — لا يُربط بصفحات /sports/player
 * (فضاء API-Football مختلف). المصدر إلزامي في كل عقدة: المصداقية أساس التحرير.
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
import { Card } from "@/components/ui/card";
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
  IMMINENT: { label: "وشيكة", seg: 4, bar: "bg-red-500", text: "text-red-600 dark:text-red-400", dot: "bg-red-500 ring-red-500/30" },
  HIGH: { label: "قوية", seg: 3, bar: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", dot: "bg-orange-500 ring-orange-500/30" },
  MEDIUM: { label: "متوسطة", seg: 2, bar: "bg-yellow-500", text: "text-yellow-700 dark:text-yellow-400", dot: "bg-yellow-500 ring-yellow-500/30" },
  LOW: { label: "ضعيفة", seg: 1, bar: "bg-zinc-400", text: "text-muted-foreground", dot: "bg-zinc-400 ring-zinc-400/30" },
};

const TIER_META: Record<SourceTier, { label: string; icon: React.ReactNode; cls: string }> = {
  high: { label: "موثوقية عالية", icon: <ShieldCheck className="w-3.5 h-3.5" />, cls: "text-emerald-600 dark:text-emerald-400" },
  medium: { label: "موثوقية متوسطة", icon: <Shield className="w-3.5 h-3.5" />, cls: "text-muted-foreground" },
  low: { label: "تعامل بحذر", icon: <ShieldAlert className="w-3.5 h-3.5" />, cls: "text-amber-600 dark:text-amber-500" },
};

function ProbabilityMeter({ p }: { p: TcProbability }) {
  const meta = PROB_META[p];
  return (
    <div className="flex items-center gap-1.5" title={`احتمال الانتقال: ${meta.label}`}>
      <div className="flex gap-0.5" dir="ltr">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1.5 w-3.5 rounded-full ${i <= meta.seg ? meta.bar : "bg-border"} ${p === "IMMINENT" && i <= meta.seg ? "animate-pulse" : ""}`} />
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
      {source.url && <ExternalLink className="w-3 h-3 opacity-60" />}
    </span>
  );
  return source.url ? (
    <a href={source.url} target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-2">{inner}</a>
  ) : inner;
}

function kindBadge(kind: TcRumour["kind"]) {
  if (kind === "loan")
    return <Badge className="shrink-0 gap-1 bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30"><Repeat className="w-3 h-3" /> إعارة</Badge>;
  if (kind === "extension")
    return <Badge className="shrink-0 gap-1 bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30"><FileSignature className="w-3 h-3" /> تجديد عقد</Badge>;
  return <Badge className="shrink-0 gap-1 bg-muted/60 text-muted-foreground border-border"><ArrowLeftRight className="w-3 h-3" /> انتقال</Badge>;
}

function ageOf(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  return Math.floor((Date.now() - b.getTime()) / (365.25 * 24 * 3600 * 1000));
}

/** بطاقة الحالة الراهنة: الناديان بشعاريهما + سهم متحرك + المبلغ */
function CurrentStateCard({ latest }: { latest: TcRumour }) {
  const money = fmtMoney(latest.amount, latest.currency);
  return (
    <Card className={`relative overflow-hidden p-6 ${latest.hereWeGo ? "border-red-500/40" : ""}`}>
      {latest.hereWeGo && (
        <div className="absolute top-0 left-0 flex items-center gap-1.5 rounded-bl-none rounded-br-2xl bg-red-600 px-3 py-1.5 text-xs font-black text-white">
          <Flame className="w-3.5 h-3.5" /> !Here we go
        </div>
      )}
      <div className="flex items-center justify-between gap-2 sm:gap-6">
        {/* RTL: النادي الحالي يمينًا */}
        <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
          {latest.from.image ? (
            <img src={latest.from.image} alt="" className="w-16 h-16 object-contain" loading="lazy" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-muted/60" />
          )}
          <div className="text-sm font-bold text-foreground text-center truncate w-full">{latest.from.name}</div>
          {latest.from.leagueName && <div className="text-[10px] text-muted-foreground">{latest.from.leagueName}</div>}
        </div>
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <ArrowLeft className={`w-9 h-9 ${latest.hereWeGo ? "text-red-500 animate-pulse" : "text-primary"}`} strokeWidth={2.2} />
          {money && <div className="text-xl font-black text-foreground tabular-nums" dir="ltr">{money}</div>}
          {kindBadge(latest.kind)}
        </div>
        <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
          {latest.to.image ? (
            <img src={latest.to.image} alt="" className="w-16 h-16 object-contain" loading="lazy" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-muted/60" />
          )}
          <div className="text-sm font-bold text-foreground text-center truncate w-full">{latest.to.name}</div>
          {latest.to.leagueName && <div className="text-[10px] text-muted-foreground">{latest.to.leagueName}</div>}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border pt-4">
        <ProbabilityMeter p={latest.probability} />
        <SourceBadge source={latest.source} />
        <span className="text-[11px] text-muted-foreground tabular-nums">آخر تحديث: {fmtDay(latest.date)}</span>
      </div>
    </Card>
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

  // أخبار ذات صلة من أرشيف سبق — بالاسم المعرَّب (بحث عربي FTS)
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
      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
        <Link href="/sports/transfers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-5">
          <ArrowRight className="w-4 h-4" /> مركز الانتقالات
        </Link>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-52 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        ) : !data?.found || !player || !latest ? (
          <div className="text-center text-muted-foreground py-20 bg-card rounded-2xl border border-dashed border-border">
            لا توجد قصة انتقال موثّقة لهذا اللاعب حاليًا.
            <div className="mt-3">
              <Link href="/sports/transfers" className="text-primary font-bold hover:underline">عُد إلى مركز الانتقالات</Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* بروفايل اللاعب */}
            <div className="flex items-center gap-4">
              {player.image ? (
                <img src={player.image} alt={player.name} className="w-20 h-20 rounded-2xl object-cover bg-muted/60" loading="lazy" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-muted/60" />
              )}
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-black text-foreground truncate">{player.name}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {player.position && <span>{player.position}</span>}
                  {age != null && <span className="tabular-nums">{age} عامًا</span>}
                  <span className="inline-flex items-center gap-1 text-fuchsia-700 dark:text-fuchsia-400 font-bold text-xs">
                    <CircleDashed className="w-3.5 h-3.5" /> قصة إشاعات — لم تتأكد بعد
                  </span>
                </div>
              </div>
            </div>

            {/* بطاقة الحالة الراهنة */}
            <CurrentStateCard latest={latest} />

            {/* الخط الزمني: تطوّر القصة */}
            <Card className="p-5">
              <h2 className="font-bold text-lg mb-1">تسلسل القصة</h2>
              <p className="text-xs text-muted-foreground mb-5">{timeline.length} تطوّرًا — تصاعديًّا مع درجة احتمال كل مرحلة ومصدرها</p>
              <div className="relative space-y-6 before:absolute before:right-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                {timeline.map((r) => {
                  const meta = PROB_META[r.probability];
                  const money = fmtMoney(r.amount, r.currency);
                  return (
                    <div key={r.id} className="relative pr-7">
                      <span className={`absolute right-0 top-1.5 h-4 w-4 rounded-full ring-4 ${meta.dot}`} />
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs font-bold text-muted-foreground tabular-nums">{fmtDay(r.date)}</span>
                        <span className={`text-xs font-black ${meta.text}`}>{meta.label}</span>
                        {kindBadge(r.kind)}
                        {r.hereWeGo && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">
                            <Flame className="w-3 h-3" /> !Here we go
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-sm min-w-0">
                        <span className="inline-flex items-center gap-1.5 min-w-0 text-muted-foreground">
                          {r.from.image && <img src={r.from.image} alt="" className="w-4 h-4 object-contain shrink-0" loading="lazy" />}
                          <span className="truncate max-w-[8rem]">{r.from.name}</span>
                        </span>
                        <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="inline-flex items-center gap-1.5 min-w-0 font-bold text-foreground">
                          {r.to.image && <img src={r.to.image} alt="" className="w-4 h-4 object-contain shrink-0" loading="lazy" />}
                          <span className="truncate max-w-[8rem]">{r.to.name}</span>
                        </span>
                        {money && <span className="shrink-0 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[11px] font-black text-amber-700 dark:text-amber-400 tabular-nums" dir="ltr">{money}</span>}
                      </div>
                      <div className="mt-1.5"><SourceBadge source={r.source} /></div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* أخبار ذات صلة من أرشيف سبق */}
            {relatedArticles.length > 0 && (
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Newspaper className="w-5 h-5 text-foreground" />
                  <h2 className="font-bold text-lg">أخبار ذات صلة</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {relatedArticles.map((a) => (
                    <Link key={a.id} href={`/article/${a.slug}`} className="group flex gap-3 rounded-xl bg-muted/40 p-2.5 hover:bg-muted/70 transition-colors">
                      {a.imageUrl && (
                        <img src={a.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" loading="lazy" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2">{a.title}</div>
                        {a.publishedAt && <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">{fmtDay(a.publishedAt)}</div>}
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              درجة الاحتمال والمبلغ المتداول من المصدر المذكور في كل مرحلة (رصد SportMonks)، ومؤشر الموثوقية تصنيف تحريري من سبق. تبقى القصة إشاعةً حتى إعلانها رسميًّا من الناديين.
            </p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
