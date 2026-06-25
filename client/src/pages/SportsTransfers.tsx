/**
 * مركز انتقالات الدوري السعودي — /sports/transfers
 *
 * موجز موحّد لحركة الانتقالات (وصل/غادر) لكل أندية دوري روشن في قائمة واحدة
 * مرتّبة زمنيًا، مع فلاتر: النادي · الاتجاه · النوع · بحث باللاعب.
 * يستهلك /api/sports/transfers (مزوّد API-Football عبر saudiLeagueService).
 *
 * عن «المبلغ»: المزوّد يضع قيمة الصفقة داخل النوع نصًّا وغالبًا يغيب — فنعرض
 * المبلغ عند توفّره فقط (يظهر للصفقات الكبرى)، ولا نختلق رقمًا. RTL + داكن.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowLeft, ArrowLeftRight, Search, Coins, Repeat, Gift, Filter } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCanonical } from "@/hooks/useCanonical";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type TransferKind = "money" | "free" | "loan" | "loanend" | "other";
interface Club { id: number; name: string; logo: string; }
interface LeagueTransfer {
  id: string;
  date: string;
  type: string;
  kind: TransferKind;
  feeValue: number | null;
  player: { id: number; name: string };
  from: { id: number; name: string; logo: string };
  to: { id: number; name: string; logo: string };
  inClubId: number | null;
  outClubId: number | null;
}
interface TransfersResponse {
  configured: boolean;
  clubs: Club[];
  transfers: LeagueTransfer[];
  topDeals: LeagueTransfer[];
  stats: { total: number; withFee: number; loans: number; free: number };
}

type DirFilter = "all" | "in" | "out";
type KindFilter = "all" | "money" | "loan" | "free";

const monthFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "long" });
const dayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", year: "numeric" });
function fmtDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dayFmt.format(d);
}
function monthKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : monthFmt.format(d);
}

// لون شارة النوع حسب الفئة (المبلغ ذهبي بارز، الحر أخضر، الإعارة سماوي).
function kindBadge(t: LeagueTransfer) {
  if (t.kind === "money")
    return <Badge className="shrink-0 gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"><Coins className="w-3 h-3" /> {t.type}</Badge>;
  if (t.kind === "free")
    return <Badge className="shrink-0 gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"><Gift className="w-3 h-3" /> {t.type}</Badge>;
  if (t.kind === "loan" || t.kind === "loanend")
    return <Badge className="shrink-0 gap-1 bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30"><Repeat className="w-3 h-3" /> {t.type}</Badge>;
  return <Badge variant="secondary" className="shrink-0 text-[10px]">{t.type}</Badge>;
}

function ClubChip({ club, roshn }: { club: { id: number; name: string; logo: string }; roshn: boolean }) {
  const inner = (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${roshn ? "font-bold text-foreground" : "text-muted-foreground"}`}>
      {club.logo && <img src={club.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
      <span className="truncate">{club.name || "—"}</span>
    </span>
  );
  return club.id ? (
    <Link href={`/sports/team/${club.id}`} className="hover:text-primary transition-colors min-w-0">{inner}</Link>
  ) : inner;
}

function TransferRow({ t }: { t: LeagueTransfer }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted/40 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-3">
      {/* اللاعب + التاريخ */}
      <div className="min-w-0 sm:w-44 shrink-0">
        {t.player.id ? (
          <Link href={`/sports/player/${t.player.id}`} className="text-sm font-bold text-foreground hover:text-primary transition-colors truncate block">{t.player.name}</Link>
        ) : (
          <span className="text-sm font-bold text-foreground truncate block">{t.player.name}</span>
        )}
        <span className="text-[11px] text-muted-foreground tabular-nums">{fmtDay(t.date)}</span>
      </div>
      {/* من ← إلى (RTL: المصدر يمينًا، الوجهة يسارًا) */}
      <div className="flex items-center gap-2 flex-1 min-w-0 text-sm">
        <ClubChip club={t.from} roshn={t.outClubId != null} />
        <ArrowLeft className="w-4 h-4 text-muted-foreground shrink-0" />
        <ClubChip club={t.to} roshn={t.inClubId != null} />
      </div>
      {/* النوع/المبلغ */}
      <div className="flex shrink-0">{kindBadge(t)}</div>
    </div>
  );
}

// بطاقة صفقة بارزة (ضمن «أبرز الصفقات بمبلغ») — معالجة محايدة فاخرة (رمادي + خط).
function TopDealCard({ t, rank }: { t: LeagueTransfer; rank: number }) {
  return (
    <div className="relative shrink-0 w-60 rounded-2xl border border-border bg-muted/40 p-4">
      <div className="absolute top-3 left-3 text-xs font-black text-muted-foreground/50 tabular-nums">#{rank}</div>
      <div className="text-3xl font-black text-foreground tabular-nums" dir="ltr">{t.type}</div>
      {t.player.id ? (
        <Link href={`/sports/player/${t.player.id}`} className="mt-1 block font-bold text-foreground hover:text-primary transition-colors truncate">{t.player.name}</Link>
      ) : (
        <div className="mt-1 font-bold text-foreground truncate">{t.player.name}</div>
      )}
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
        {t.from.logo && <img src={t.from.logo} alt="" className="w-4 h-4 object-contain shrink-0" loading="lazy" />}
        <span className="truncate max-w-[5rem]">{t.from.name}</span>
        <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
        {t.to.logo && <img src={t.to.logo} alt="" className="w-4 h-4 object-contain shrink-0" loading="lazy" />}
        <span className="truncate max-w-[5rem]">{t.to.name}</span>
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">{fmtDay(t.date)}</div>
    </div>
  );
}

function StatPill({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60 text-primary">{icon}</div>
      <div>
        <div className="text-xl font-black tabular-nums text-foreground">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default function SportsTransfers() {
  useCanonical("https://sabq.org/sports/transfers");
  const { data, isLoading } = useQuery<TransfersResponse>({
    queryKey: ["/api/sports/transfers"],
    staleTime: 10 * 60_000,
  });

  const [club, setClub] = useState<number | null>(null);
  const [dir, setDir] = useState<DirFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [q, setQ] = useState("");

  const clubs = useMemo(() => (Array.isArray(data?.clubs) ? data!.clubs : []), [data]);
  const transfers = useMemo(() => (Array.isArray(data?.transfers) ? data!.transfers : []), [data]);
  const topDeals = useMemo(() => (Array.isArray(data?.topDeals) ? data!.topDeals : []), [data]);

  const filtered = useMemo(() => {
    const query = q.trim();
    return transfers.filter((t) => {
      if (club != null) {
        const isIn = t.to.id === club;
        const isOut = t.from.id === club;
        if (!isIn && !isOut) return false;
        if (dir === "in" && !isIn) return false;
        if (dir === "out" && !isOut) return false;
      } else {
        if (dir === "in" && t.inClubId == null) return false;
        if (dir === "out" && t.outClubId == null) return false;
      }
      if (kind === "money" && t.kind !== "money") return false;
      if (kind === "loan" && !(t.kind === "loan" || t.kind === "loanend")) return false;
      if (kind === "free" && t.kind !== "free") return false;
      if (query && !t.player.name.includes(query) && !t.from.name.includes(query) && !t.to.name.includes(query)) return false;
      return true;
    });
  }, [transfers, club, dir, kind, q]);

  // تجميع حسب الشهر للموجز الزمني.
  const grouped = useMemo(() => {
    const out: { month: string; items: LeagueTransfer[] }[] = [];
    let cur: { month: string; items: LeagueTransfer[] } | null = null;
    for (const t of filtered) {
      const m = monthKey(t.date);
      if (!cur || cur.month !== m) { cur = { month: m, items: [] }; out.push(cur); }
      cur.items.push(t);
    }
    return out;
  }, [filtered]);

  const configured = data?.configured !== false;
  const stats = data?.stats ?? { total: 0, withFee: 0, loans: 0, free: 0 };

  const dirTabs: { key: DirFilter; label: string }[] = [
    { key: "all", label: "الكل" },
    { key: "in", label: "وصل" },
    { key: "out", label: "غادر" },
  ];
  const kindTabs: { key: KindFilter; label: string }[] = [
    { key: "all", label: "كل الأنواع" },
    { key: "money", label: "بمبلغ" },
    { key: "free", label: "حر" },
    { key: "loan", label: "إعارة" },
  ];

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
        {/* ترويسة */}
        <div className="mb-6">
          <Link href="/sports" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-4">
            <ArrowRight className="w-4 h-4" /> البوابة الرياضية
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ArrowLeftRight className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-foreground">مركز الانتقالات</h1>
              <p className="text-sm text-muted-foreground">حركة الصفقات في دوري روشن السعودي — مَن وصل ومَن غادر</p>
            </div>
          </div>
        </div>

        {/* ملخّص الأرقام */}
        {!isLoading && configured && stats.total > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatPill label="إجمالي الصفقات" value={stats.total} icon={<ArrowLeftRight className="w-5 h-5" />} />
            <StatPill label="صفقات بمبلغ معلن" value={stats.withFee} icon={<Coins className="w-5 h-5" />} />
            <StatPill label="إعارات" value={stats.loans} icon={<Repeat className="w-5 h-5" />} />
            <StatPill label="انتقالات حرّة" value={stats.free} icon={<Gift className="w-5 h-5" />} />
          </div>
        )}

        {/* أبرز الصفقات بمبلغ معلن (من كامل السجل، الأعلى قيمةً) */}
        {!isLoading && configured && topDeals.length > 0 && (
          <div className="mb-7">
            <div className="flex items-center gap-2 mb-3">
              <Coins className="w-5 h-5 text-foreground" />
              <h2 className="font-bold text-lg">أبرز الصفقات بمبلغ معلن</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {topDeals.map((t, i) => <TopDealCard key={t.id} t={t} rank={i + 1} />)}
            </div>
          </div>
        )}

        {/* الفلاتر */}
        {!isLoading && configured && transfers.length > 0 && (
          <Card className="p-4 mb-6 space-y-3">
            {/* بحث */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث باسم لاعب أو نادٍ…"
                className="w-full rounded-xl border border-border bg-background py-2.5 pr-10 pl-3 text-sm outline-none focus:border-primary/50"
              />
            </div>
            {/* اتجاه + نوع */}
            <div className="flex flex-wrap gap-2">
              <div className="inline-flex rounded-xl bg-muted/60 p-1">
                {dirTabs.map((tb) => (
                  <button key={tb.key} onClick={() => setDir(tb.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${dir === tb.key ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    {tb.label}
                  </button>
                ))}
              </div>
              <div className="inline-flex rounded-xl bg-muted/60 p-1">
                {kindTabs.map((tb) => (
                  <button key={tb.key} onClick={() => setKind(tb.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${kind === tb.key ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    {tb.label}
                  </button>
                ))}
              </div>
            </div>
            {/* الأندية */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button onClick={() => setClub(null)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${club == null ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground hover:border-primary/40"}`}>
                <Filter className="w-3 h-3" /> كل الأندية
              </button>
              {clubs.map((c) => (
                <button key={c.id} onClick={() => setClub(c.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${club === c.id ? "bg-primary text-white shadow-sm" : "bg-card border border-border text-muted-foreground hover:border-primary/40"}`}>
                  {c.logo && <img src={c.logo} alt="" className="w-4 h-4 object-contain" loading="lazy" />}
                  {c.name}
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* القائمة */}
        {isLoading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : !configured ? (
          <div className="text-center text-muted-foreground py-16 bg-card rounded-2xl border border-dashed border-border">
            مركز الانتقالات غير متاح حاليًا.
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 bg-card rounded-2xl border border-dashed border-border">
            {transfers.length === 0 ? "لا توجد حركة انتقالات في النافذة الحالية." : "لا نتائج مطابقة للفلاتر المحدّدة."}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-xs text-muted-foreground">{filtered.length} صفقة</div>
            {grouped.map((g) => (
              <div key={g.month}>
                <div className="sticky top-16 z-[1] mb-2.5 inline-block rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{g.month}</div>
                <div className="space-y-2">
                  {g.items.map((t) => <TransferRow key={t.id} t={t} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ملاحظة عن المبلغ */}
        {!isLoading && configured && stats.total > 0 && (
          <p className="mt-8 text-[11px] leading-relaxed text-muted-foreground">
            تُعرض قيمة الصفقة عند إعلانها من المصدر فقط؛ كثير من الصفقات المحلية لا تُفصح عن المبالغ فتظهر «حر» أو «إعارة» أو بلا مبلغ. المصدر: API-Football.
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}
