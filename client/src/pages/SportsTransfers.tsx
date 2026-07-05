/**
 * مركز الانتقالات المتكامل — /sports/transfers
 *
 * تبويبان رئيسيان: 🇸🇦 سعودية (روشن + انتقالات السعوديين) | 🌍 عالمية،
 * وداخل كلٍّ: مؤكّدة ✅ | إشاعات 🔮 | إعارات | تجديد عقود — بتمييز بصري صارم
 * بين المؤكّد والإشاعة لا يلتبس على القارئ.
 *
 * المصادر: المؤكّد السعودي من /api/sports/transfers (API-Football — لم يُمسّ)،
 * والإشاعات + المؤكّد العالمي من /api/transfer-center/* (SportMonks Transfer
 * Rumours). كل إشاعة تحمل درجة احتمال (وشيكة/قوية/متوسطة/ضعيفة) ومصدرًا
 * مُلزَمًا باسمه ورابطه + مؤشر موثوقية تحريري (رومانو ≠ صحيفة إثارة).
 *
 * عن «المبلغ»: مبالغ الإشاعات قيم متداولة من مصادرها لا أرقامًا رسمية — نعرضها
 * بوسمها، ولا نختلق رقمًا عند غيابها. RTL كامل.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, ArrowLeft, ArrowLeftRight, Search, Coins, Repeat, Gift, Filter,
  ExternalLink, ShieldCheck, Shield, ShieldAlert, Hourglass, TrendingUp,
  FileSignature, Sparkles, CheckCircle2, CircleDashed, Flame,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCanonical } from "@/hooks/useCanonical";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ---------- أنواع المؤكّد السعودي (API-Football — كما كانت) ----------
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

// ---------- أنواع مركز الانتقالات (SportMonks) ----------
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
interface TcConfirmed {
  id: number;
  date: string;
  kind: "transfer" | "loan" | "free";
  amount: number | null;
  currency: string | null;
  player: TcPlayer;
  from: TcParty;
  to: TcParty;
  saudi: boolean;
  major: boolean;
}
interface RumoursResponse { configured: boolean; rumours: TcRumour[]; leagues: { id: number; name: string }[]; }
interface GlobalConfirmedResponse { configured: boolean; transfers: TcConfirmed[]; }
interface TransferWindow { label: string; opensAt: string; closesAt: string; }
interface OverviewResponse {
  configured: boolean;
  rumoursConfigured: boolean;
  hero: TcRumour[];
  windows: { saudi: TransferWindow; europe: TransferWindow } | null;
  comparison: { basis: "confirmed" | "rumoured"; roshn: { total: number; deals: number }; premierLeague: { total: number; deals: number } } | null;
  clubBalance: { clubId: number; club: string; logo: string; spent: number; earned: number }[];
}

// ---------- تهيئة العرض ----------
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

// مقياس الاحتمال — رموز الألوان من البرومبت التحريري: 🔴/🟠/🟡/⚪
const PROB_META: Record<TcProbability, { label: string; seg: number; bar: string; text: string; chip: string }> = {
  IMMINENT: { label: "وشيكة", seg: 4, bar: "bg-red-500", text: "text-red-600 dark:text-red-400", chip: "bg-red-500/10 border-red-500/30" },
  HIGH: { label: "قوية", seg: 3, bar: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", chip: "bg-orange-500/10 border-orange-500/30" },
  MEDIUM: { label: "متوسطة", seg: 2, bar: "bg-yellow-500", text: "text-yellow-700 dark:text-yellow-400", chip: "bg-yellow-500/10 border-yellow-500/30" },
  LOW: { label: "ضعيفة", seg: 1, bar: "bg-zinc-400", text: "text-muted-foreground", chip: "bg-muted/60 border-border" },
};

const TIER_META: Record<SourceTier, { label: string; icon: React.ReactNode; cls: string }> = {
  high: { label: "موثوقية عالية", icon: <ShieldCheck className="w-3.5 h-3.5" />, cls: "text-emerald-600 dark:text-emerald-400" },
  medium: { label: "موثوقية متوسطة", icon: <Shield className="w-3.5 h-3.5" />, cls: "text-muted-foreground" },
  low: { label: "تعامل بحذر", icon: <ShieldAlert className="w-3.5 h-3.5" />, cls: "text-amber-600 dark:text-amber-500" },
};

/** مقياس الاحتمال البصري: 4 خانات تمتلئ بحسب الدرجة */
function ProbabilityMeter({ p, compact }: { p: TcProbability; compact?: boolean }) {
  const meta = PROB_META[p];
  return (
    <div className="flex items-center gap-1.5" title={`احتمال الانتقال: ${meta.label}`}>
      <div className="flex gap-0.5" dir="ltr">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1.5 rounded-full ${compact ? "w-2.5" : "w-3.5"} ${i <= meta.seg ? meta.bar : "bg-border"} ${p === "IMMINENT" && i <= meta.seg ? "animate-pulse" : ""}`} />
        ))}
      </div>
      {!compact && <span className={`text-[11px] font-bold ${meta.text}`}>{meta.label}</span>}
    </div>
  );
}

/** شارة المصدر: مؤشر الموثوقية + الاسم + رابط خارجي — المصداقية أساس التحرير */
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

/** شارة نوع الإشاعة */
function rumourKindBadge(kind: TcRumour["kind"]) {
  if (kind === "loan")
    return <Badge className="shrink-0 gap-1 bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30"><Repeat className="w-3 h-3" /> إعارة</Badge>;
  if (kind === "extension")
    return <Badge className="shrink-0 gap-1 bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30"><FileSignature className="w-3 h-3" /> تجديد عقد</Badge>;
  return <Badge className="shrink-0 gap-1 bg-muted/60 text-muted-foreground border-border"><ArrowLeftRight className="w-3 h-3" /> انتقال</Badge>;
}

function PlayerAvatar({ src, size = "w-11 h-11" }: { src: string | null; size?: string }) {
  if (!src) return <div className={`${size} shrink-0 rounded-full bg-muted/60 grid place-items-center text-muted-foreground text-xs`}>؟</div>;
  return <img src={src} alt="" loading="lazy" className={`${size} shrink-0 rounded-full object-cover bg-muted/60`} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />;
}

/** وسم صريح يفصل المؤكّد عن الإشاعة — لا يلتبس على القارئ أبدًا */
function CertaintyTag({ confirmed }: { confirmed: boolean }) {
  return confirmed ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="w-3 h-3" /> مؤكّدة
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/30 px-2 py-0.5 text-[10px] font-black text-fuchsia-700 dark:text-fuchsia-400">
      <CircleDashed className="w-3 h-3" /> إشاعة
    </span>
  );
}

// ---------- بطاقة إشاعة ----------
function RumourCard({ r }: { r: TcRumour }) {
  const money = fmtMoney(r.amount, r.currency);
  return (
    <div className={`relative rounded-2xl border p-4 transition-colors ${r.hereWeGo ? "border-red-500/40 bg-gradient-to-l from-red-500/[0.07] via-transparent to-transparent" : "border-border bg-card hover:border-primary/30"}`}>
      {r.hereWeGo && (
        <div className="absolute -top-2.5 left-3 inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-sm">
          <Flame className="w-3 h-3" /> !Here we go
        </div>
      )}
      <div className="flex items-start gap-3">
        <Link href={`/sports/transfers/story/${r.player.id}`}>
          <PlayerAvatar src={r.player.image} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/sports/transfers/story/${r.player.id}`} className="font-bold text-foreground hover:text-primary transition-colors truncate">
              {r.player.name}
            </Link>
            {r.player.position && <span className="text-[11px] text-muted-foreground">{r.player.position}</span>}
            <CertaintyTag confirmed={false} />
            {rumourKindBadge(r.kind)}
          </div>
          {/* من ← إلى (RTL: المصدر يمينًا) */}
          <div className="mt-2 flex items-center gap-2 text-sm min-w-0">
            <span className="inline-flex items-center gap-1.5 min-w-0 text-muted-foreground">
              {r.from.image && <img src={r.from.image} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
              <span className="truncate">{r.from.name}</span>
            </span>
            <ArrowLeft className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="inline-flex items-center gap-1.5 min-w-0 font-bold text-foreground">
              {r.to.image && <img src={r.to.image} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
              <span className="truncate">{r.to.name}</span>
            </span>
            {money && <span className="mr-auto shrink-0 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-xs font-black text-amber-700 dark:text-amber-400 tabular-nums" dir="ltr">{money}</span>}
          </div>
          {/* الاحتمال + المصدر + التاريخ */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <ProbabilityMeter p={r.probability} />
            <SourceBadge source={r.source} />
            <span className="text-[11px] text-muted-foreground tabular-nums">{fmtDay(r.date)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- صف مؤكّد عالمي ----------
function GlobalConfirmedRow({ t }: { t: TcConfirmed }) {
  const money = fmtMoney(t.amount, t.currency);
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted/40 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex items-center gap-2.5 min-w-0 sm:w-52 shrink-0">
        <PlayerAvatar src={t.player.image} size="w-9 h-9" />
        <div className="min-w-0">
          <div className="text-sm font-bold text-foreground truncate">{t.player.name}</div>
          <span className="text-[11px] text-muted-foreground tabular-nums">{fmtDay(t.date)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-0 text-sm">
        <span className="inline-flex items-center gap-1.5 min-w-0 text-muted-foreground">
          {t.from.image && <img src={t.from.image} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
          <span className="truncate">{t.from.name}</span>
        </span>
        <ArrowLeft className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="inline-flex items-center gap-1.5 min-w-0 font-bold text-foreground">
          {t.to.image && <img src={t.to.image} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
          <span className="truncate">{t.to.name}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <CertaintyTag confirmed />
        {t.kind === "loan" && <Badge className="shrink-0 gap-1 bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30"><Repeat className="w-3 h-3" /> إعارة</Badge>}
        {t.kind === "free" && <Badge className="shrink-0 gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"><Gift className="w-3 h-3" /> حر</Badge>}
        {money && <span className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-xs font-black text-amber-700 dark:text-amber-400 tabular-nums" dir="ltr">{money}</span>}
      </div>
    </div>
  );
}

// ---------- المؤكّد السعودي (مكوّنات النسخة السابقة كما هي) ----------
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
      <div className="min-w-0 sm:w-44 shrink-0">
        {t.player.id ? (
          <Link href={`/sports/player/${t.player.id}`} className="text-sm font-bold text-foreground hover:text-primary transition-colors truncate block">{t.player.name}</Link>
        ) : (
          <span className="text-sm font-bold text-foreground truncate block">{t.player.name}</span>
        )}
        <span className="text-[11px] text-muted-foreground tabular-nums">{fmtDay(t.date)}</span>
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-0 text-sm">
        <ClubChip club={t.from} roshn={t.outClubId != null} />
        <ArrowLeft className="w-4 h-4 text-muted-foreground shrink-0" />
        <ClubChip club={t.to} roshn={t.inClubId != null} />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <CertaintyTag confirmed />
        {kindBadge(t)}
      </div>
    </div>
  );
}

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

// ---------- عدّاد نافذة الانتقالات ----------
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function fmtRemaining(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days} يومًا و${hours} ساعة`;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours} ساعة و${minutes} دقيقة`;
}

function WindowCountdown({ win }: { win: TransferWindow }) {
  const now = useNow();
  const opens = new Date(win.opensAt).getTime();
  const closes = new Date(win.closesAt).getTime();
  let status: React.ReactNode;
  let pct = 0;
  if (now < opens) {
    status = <>تفتح بعد <b className="text-foreground tabular-nums">{fmtRemaining(opens - now)}</b></>;
  } else if (now < closes) {
    pct = Math.min(100, Math.round(((now - opens) / (closes - opens)) * 100));
    status = <>تُغلق بعد <b className="text-foreground tabular-nums">{fmtRemaining(closes - now)}</b></>;
  } else {
    pct = 100;
    status = <span className="font-bold">أُغلقت النافذة</span>;
  }
  return (
    <div className="flex-1 min-w-[240px] rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Hourglass className="w-4 h-4 text-primary shrink-0" />
        <span className="text-xs font-black text-foreground">{win.label}</span>
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">{status}</div>
      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden" dir="ltr">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------- Hero: أضخم 3 صفقات جارية ----------
function HeroDealCard({ r, rank }: { r: TcRumour; rank: number }) {
  const meta = PROB_META[r.probability];
  const money = fmtMoney(r.amount, r.currency);
  return (
    <Link
      href={`/sports/transfers/story/${r.player.id}`}
      className={`group relative flex-1 min-w-[260px] overflow-hidden rounded-3xl border p-5 transition-transform hover:-translate-y-0.5 ${r.hereWeGo ? "border-red-500/40 bg-gradient-to-br from-red-500/10 via-card to-card" : "border-border bg-gradient-to-br from-primary/[0.06] via-card to-card"}`}
    >
      <div className="absolute top-4 left-4 text-4xl font-black text-muted-foreground/15 tabular-nums">#{rank}</div>
      {r.hereWeGo && (
        <div className="absolute top-4 left-14 inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-black text-white">
          <Flame className="w-3 h-3" /> !Here we go
        </div>
      )}
      <div className="flex items-center gap-3">
        <PlayerAvatar src={r.player.image} size="w-14 h-14" />
        <div className="min-w-0">
          <div className="font-black text-lg text-foreground group-hover:text-primary transition-colors truncate">{r.player.name}</div>
          <div className="text-[11px] text-muted-foreground">{r.player.position ?? "—"}</div>
        </div>
      </div>
      {money && <div className="mt-3 text-3xl font-black text-foreground tabular-nums" dir="ltr">{money}</div>}
      <div className="mt-2 flex items-center gap-2 text-sm min-w-0">
        <span className="inline-flex items-center gap-1.5 min-w-0 text-muted-foreground">
          {r.from.image && <img src={r.from.image} alt="" className="w-5 h-5 object-contain" loading="lazy" />}
          <span className="truncate max-w-[7rem]">{r.from.name}</span>
        </span>
        <ArrowLeft className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="inline-flex items-center gap-1.5 min-w-0 font-bold text-foreground">
          {r.to.image && <img src={r.to.image} alt="" className="w-5 h-5 object-contain" loading="lazy" />}
          <span className="truncate max-w-[7rem]">{r.to.name}</span>
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <ProbabilityMeter p={r.probability} />
        <span className={`text-[11px] font-bold ${meta.text}`}>{fmtDay(r.date)}</span>
      </div>
    </Link>
  );
}

// ---------- مقارنة الميركاتو: روشن vs البريميرليغ ----------
function MercatoComparison({ comparison }: { comparison: NonNullable<OverviewResponse["comparison"]> }) {
  const rumoured = comparison.basis === "rumoured";
  const max = Math.max(comparison.roshn.total, comparison.premierLeague.total, 1);
  const rows = [
    { label: "دوري روشن السعودي", flag: "🇸🇦", ...comparison.roshn, cls: "bg-emerald-500" },
    { label: "البريميرليغ", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", ...comparison.premierLeague, cls: "bg-violet-500" },
  ];
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-foreground" />
        <h2 className="font-bold text-lg">{rumoured ? "قيم الميركاتو المتداولة: روشن مقابل البريميرليغ" : "إنفاق الميركاتو: روشن مقابل البريميرليغ"}</h2>
        {rumoured && <CertaintyTag confirmed={false} />}
      </div>
      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="font-bold text-foreground">{row.flag} {row.label}</span>
              <span className="text-muted-foreground tabular-nums">
                <b className="text-foreground" dir="ltr">{fmtMoney(row.total, "EUR") ?? "0 €"}</b>
                <span className="mx-1">·</span>{row.deals} {rumoured ? "إشاعة مُسعَّرة" : "صفقة مُسعَّرة"}
              </span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden" dir="ltr">
              <div className={`h-full rounded-full ${row.cls} transition-all`} style={{ width: `${Math.max(2, Math.round((row.total / max) * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {rumoured
          ? "قيم متداولة في إشاعات المصادر منذ مطلع يونيو — يتحوّل الرسم إلى الصفقات الرسمية فور توفّر سجل النافذة من المزوّد."
          : "الصفقات المُعلَنة المبالغ فقط منذ مطلع يونيو — كثير من الصفقات لا تُفصح عن قيمتها."}
      </p>
    </Card>
  );
}

// ---------- ميزان الصرف/الدخل لأندية روشن ----------
function ClubBalanceBoard({ rows }: { rows: OverviewResponse["clubBalance"] }) {
  const max = Math.max(...rows.map((r) => Math.max(r.spent, r.earned)), 1);
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Coins className="w-5 h-5 text-foreground" />
        <h2 className="font-bold text-lg">ميزان السوق — أندية روشن هذا الميركاتو</h2>
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.clubId} className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 w-28 shrink-0 text-sm font-bold text-foreground min-w-0">
              {r.logo && <img src={r.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
              <span className="truncate">{r.club}</span>
            </span>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 rounded-full bg-red-500/80" style={{ width: `${Math.max(1, Math.round((r.spent / max) * 100))}%` }} />
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0" dir="ltr">{fmtMoney(r.spent, "EUR") ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 rounded-full bg-emerald-500/80" style={{ width: `${Math.max(1, Math.round((r.earned / max) * 100))}%` }} />
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0" dir="ltr">{fmtMoney(r.earned, "EUR") ?? "—"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-red-500/80" /> صرف</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-emerald-500/80" /> دخل</span>
      </div>
    </Card>
  );
}

// ---------- الصفحة ----------
type Scope = "saudi" | "global";
type Tab = "confirmed" | "rumours" | "loans" | "extensions";
type DirFilter = "all" | "in" | "out";
type KindFilter = "all" | "money" | "loan" | "free";
type SortMode = "latest" | "value";
type WindowFilter = "all" | "summer" | "winter";
type ProbFilter = "all" | TcProbability;

function seasonOf(date: string): "summer" | "winter" | "other" {
  const m = new Date(date).getMonth() + 1;
  if (m >= 6 && m <= 10) return "summer";
  if (m === 12 || m <= 2) return "winter";
  return "other";
}

export default function SportsTransfers() {
  useCanonical("https://sabq.org/sports/transfers");
  useEffect(() => {
    document.title = "مركز الانتقالات — صحيفة سبق الإلكترونية";
  }, []);

  const { data, isLoading } = useQuery<TransfersResponse>({
    queryKey: ["/api/sports/transfers"],
    staleTime: 10 * 60_000,
  });
  const { data: rumoursRaw, isLoading: rumoursLoading } = useQuery<RumoursResponse>({
    queryKey: ["/api/transfer-center/rumours"],
    staleTime: 10 * 60_000,
  });
  const { data: overviewRaw } = useQuery<OverviewResponse>({
    queryKey: ["/api/transfer-center/overview"],
    staleTime: 10 * 60_000,
  });

  const [scope, setScope] = useState<Scope>("saudi");
  const [tab, setTab] = useState<Tab>("confirmed");

  // فلاتر المؤكّد السعودي (كما كانت)
  const [club, setClub] = useState<number | null>(null);
  const [dir, setDir] = useState<DirFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [q, setQ] = useState("");

  // فلاتر الإشاعات
  const [league, setLeague] = useState<number | null>(null);
  const [prob, setProb] = useState<ProbFilter>("all");
  const [position, setPosition] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [windowFilter, setWindowFilter] = useState<WindowFilter>("all");
  const [majorsOnly, setMajorsOnly] = useState(true);

  // المؤكّد العالمي — يُجلب عند الحاجة فقط
  const wantGlobalConfirmed = scope === "global" && (tab === "confirmed" || tab === "loans");
  const { data: globalConfirmedRaw, isLoading: globalLoading } = useQuery<GlobalConfirmedResponse>({
    queryKey: ["/api/transfer-center/global-confirmed"],
    staleTime: 10 * 60_000,
    enabled: wantGlobalConfirmed,
  });

  const clubs = useMemo(() => (Array.isArray(data?.clubs) ? data!.clubs : []), [data]);
  const transfers = useMemo(() => (Array.isArray(data?.transfers) ? data!.transfers : []), [data]);
  const topDeals = useMemo(() => (Array.isArray(data?.topDeals) ? data!.topDeals : []), [data]);
  const rumours = useMemo(() => (Array.isArray(rumoursRaw?.rumours) ? rumoursRaw!.rumours : []), [rumoursRaw]);
  const bigLeagues = useMemo(() => (Array.isArray(rumoursRaw?.leagues) ? rumoursRaw!.leagues : []), [rumoursRaw]);
  const globalConfirmed = useMemo(
    () => (Array.isArray(globalConfirmedRaw?.transfers) ? globalConfirmedRaw!.transfers : []),
    [globalConfirmedRaw],
  );
  const overview = overviewRaw?.configured ? overviewRaw : null;
  const rumoursConfigured = rumoursRaw?.configured !== false;

  // أندية روشن الظاهرة في الإشاعات السعودية — رقائق فلترة بالاسم المعرَّب
  const saudiRumourClubs = useMemo(() => {
    const names = new Map<string, string | null>();
    for (const r of rumours) {
      if (!r.saudi) continue;
      for (const party of [r.from, r.to]) {
        if (party.saudi && party.name && party.name !== "—") names.set(party.name, party.image);
      }
    }
    return [...names.entries()].map(([name, image]) => ({ name, image }));
  }, [rumours]);
  const [saudiRumourClub, setSaudiRumourClub] = useState<string | null>(null);

  // ---------- فلترة الإشاعات ----------
  const query = q.trim();
  const filteredRumours = useMemo(() => {
    let list = rumours.filter((r) => (scope === "saudi" ? r.saudi : !r.saudi));
    if (tab === "rumours") list = list.filter((r) => r.kind === "transfer");
    else if (tab === "loans") list = list.filter((r) => r.kind === "loan");
    else if (tab === "extensions") list = list.filter((r) => r.kind === "extension");
    if (scope === "global" && league != null) list = list.filter((r) => r.from.leagueId === league || r.to.leagueId === league);
    if (scope === "saudi" && saudiRumourClub) list = list.filter((r) => r.from.name === saudiRumourClub || r.to.name === saudiRumourClub);
    if (prob !== "all") list = list.filter((r) => r.probability === prob);
    if (position) list = list.filter((r) => r.player.position === position);
    if (windowFilter !== "all") list = list.filter((r) => seasonOf(r.date) === windowFilter);
    if (query) list = list.filter((r) => r.player.name.includes(query) || r.from.name.includes(query) || r.to.name.includes(query));
    if (sortMode === "value") list = [...list].sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1));
    return list;
  }, [rumours, scope, tab, league, saudiRumourClub, prob, position, windowFilter, query, sortMode]);

  // ---------- فلترة المؤكّد السعودي (كما كانت) ----------
  const filteredSaudiConfirmed = useMemo(() => {
    let list = transfers;
    if (tab === "loans") list = list.filter((t) => t.kind === "loan" || t.kind === "loanend");
    return list.filter((t) => {
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
  }, [transfers, tab, club, dir, kind, query]);

  const groupedSaudi = useMemo(() => {
    const out: { month: string; items: LeagueTransfer[] }[] = [];
    let cur: { month: string; items: LeagueTransfer[] } | null = null;
    for (const t of filteredSaudiConfirmed) {
      const m = monthKey(t.date);
      if (!cur || cur.month !== m) { cur = { month: m, items: [] }; out.push(cur); }
      cur.items.push(t);
    }
    return out;
  }, [filteredSaudiConfirmed]);

  // ---------- فلترة المؤكّد العالمي ----------
  const filteredGlobalConfirmed = useMemo(() => {
    // استبعاد الصفقات السعودية: فيد المؤكّد العالمي يعلّم صفقات أندية روشن بـ
    // saudi=true (تُبقيها الخدمة لنبض السوق)، وهي تُعرض في تبويب «سعودية» — فلا
    // تتسرّب إلى «عالمية» (مطابقةً لتصفية الإشاعات بالنطاق).
    let list = globalConfirmed.filter((t) => !t.saudi);
    if (tab === "loans") list = list.filter((t) => t.kind === "loan");
    if (majorsOnly) list = list.filter((t) => t.major);
    if (query) list = list.filter((t) => t.player.name.includes(query) || t.from.name.includes(query) || t.to.name.includes(query));
    return list;
  }, [globalConfirmed, tab, majorsOnly, query]);

  const configured = data?.configured !== false;
  const stats = data?.stats ?? { total: 0, withFee: 0, loans: 0, free: 0 };

  const scopeTabs: { key: Scope; label: string }[] = [
    { key: "saudi", label: "🇸🇦 سعودية" },
    { key: "global", label: "🌍 عالمية" },
  ];
  const contentTabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "confirmed", label: "مؤكّدة", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    { key: "rumours", label: "إشاعات", icon: <Sparkles className="w-3.5 h-3.5" /> },
    { key: "loans", label: "إعارات", icon: <Repeat className="w-3.5 h-3.5" /> },
    { key: "extensions", label: "تجديد عقود", icon: <FileSignature className="w-3.5 h-3.5" /> },
  ];
  const probTabs: { key: ProbFilter; label: string }[] = [
    { key: "all", label: "كل الدرجات" },
    { key: "IMMINENT", label: "وشيكة" },
    { key: "HIGH", label: "قوية" },
    { key: "MEDIUM", label: "متوسطة" },
    { key: "LOW", label: "ضعيفة" },
  ];
  const positionTabs = ["حارس مرمى", "مدافع", "لاعب وسط", "مهاجم"];
  const windowTabs: { key: WindowFilter; label: string }[] = [
    { key: "all", label: "كل النوافذ" },
    { key: "summer", label: "صيفية" },
    { key: "winter", label: "شتوية" },
  ];

  const showRumourFilters = tab === "rumours" || tab === "extensions" || (tab === "loans" && rumoursConfigured);
  const showSaudiConfirmedUi = scope === "saudi" && (tab === "confirmed" || tab === "loans");
  const showGlobalConfirmedUi = scope === "global" && (tab === "confirmed" || tab === "loans");

  const chip = (active: boolean) =>
    `shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${active ? "bg-primary text-white shadow-sm" : "bg-card border border-border text-muted-foreground hover:border-primary/40"}`;

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
              <p className="text-sm text-muted-foreground">صفقات مؤكّدة وإشاعات موثّقة المصدر — سعوديًّا وعالميًّا</p>
            </div>
          </div>
        </div>

        {/* Hero: أضخم 3 صفقات جارية */}
        {overview && overview.hero.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-5 h-5 text-foreground" />
              <h2 className="font-bold text-lg">أضخم القصص الجارية</h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              {overview.hero.map((r, i) => <HeroDealCard key={r.id} r={r} rank={i + 1} />)}
            </div>
          </div>
        )}

        {/* عدّادات النوافذ */}
        {overview?.windows && (
          <div className="mb-6 flex flex-wrap gap-3">
            <WindowCountdown win={overview.windows.saudi} />
            <WindowCountdown win={overview.windows.europe} />
          </div>
        )}

        {/* تبويب النطاق: سعودية | عالمية */}
        <div className="mb-4 grid grid-cols-2 rounded-2xl bg-muted/60 p-1.5">
          {scopeTabs.map((s) => (
            <button
              key={s.key}
              onClick={() => { setScope(s.key); setQ(""); }}
              className={`rounded-xl px-4 py-2.5 text-sm font-black transition-colors ${scope === s.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* تبويب النوع: مؤكّدة | إشاعات | إعارات | تجديد */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {contentTabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={chip(tab === t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ملخّص الأرقام + أبرز الصفقات — سعودية › مؤكّدة فقط */}
        {showSaudiConfirmedUi && tab === "confirmed" && !isLoading && configured && stats.total > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <StatPill label="إجمالي الصفقات" value={stats.total} icon={<ArrowLeftRight className="w-5 h-5" />} />
              <StatPill label="صفقات بمبلغ معلن" value={stats.withFee} icon={<Coins className="w-5 h-5" />} />
              <StatPill label="إعارات" value={stats.loans} icon={<Repeat className="w-5 h-5" />} />
              <StatPill label="انتقالات حرّة" value={stats.free} icon={<Gift className="w-5 h-5" />} />
            </div>
            {topDeals.length > 0 && (
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
          </>
        )}

        {/* الفلاتر */}
        <Card className="p-4 mb-6 space-y-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث باسم لاعب أو نادٍ…"
              className="w-full rounded-xl border border-border bg-background py-2.5 pr-10 pl-3 text-sm outline-none focus:border-primary/50"
            />
          </div>

          {/* فلاتر المؤكّد السعودي */}
          {showSaudiConfirmedUi && (
            <>
              <div className="flex flex-wrap gap-2">
                <div className="inline-flex rounded-xl bg-muted/60 p-1">
                  {([{ key: "all", label: "الكل" }, { key: "in", label: "وصل" }, { key: "out", label: "غادر" }] as { key: DirFilter; label: string }[]).map((tb) => (
                    <button key={tb.key} onClick={() => setDir(tb.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${dir === tb.key ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                      {tb.label}
                    </button>
                  ))}
                </div>
                {tab === "confirmed" && (
                  <div className="inline-flex rounded-xl bg-muted/60 p-1">
                    {([{ key: "all", label: "كل الأنواع" }, { key: "money", label: "بمبلغ" }, { key: "free", label: "حر" }, { key: "loan", label: "إعارة" }] as { key: KindFilter; label: string }[]).map((tb) => (
                      <button key={tb.key} onClick={() => setKind(tb.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${kind === tb.key ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                        {tb.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button onClick={() => setClub(null)} className={chip(club == null)}>
                  <Filter className="w-3 h-3" /> كل الأندية
                </button>
                {clubs.map((c) => (
                  <button key={c.id} onClick={() => setClub(c.id)} className={chip(club === c.id)}>
                    {c.logo && <img src={c.logo} alt="" className="w-4 h-4 object-contain" loading="lazy" />}
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* فلاتر الإشاعات */}
          {showRumourFilters && (
            <>
              <div className="flex flex-wrap gap-2">
                <div className="inline-flex rounded-xl bg-muted/60 p-1">
                  {probTabs.map((tb) => (
                    <button key={tb.key} onClick={() => setProb(tb.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${prob === tb.key ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                      {tb.label}
                    </button>
                  ))}
                </div>
                <div className="inline-flex rounded-xl bg-muted/60 p-1">
                  {([{ key: "latest", label: "الأحدث" }, { key: "value", label: "الأعلى قيمة" }] as { key: SortMode; label: string }[]).map((tb) => (
                    <button key={tb.key} onClick={() => setSortMode(tb.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${sortMode === tb.key ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                      {tb.label}
                    </button>
                  ))}
                </div>
                <div className="inline-flex rounded-xl bg-muted/60 p-1">
                  {windowTabs.map((tb) => (
                    <button key={tb.key} onClick={() => setWindowFilter(tb.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${windowFilter === tb.key ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                      {tb.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button onClick={() => setPosition(null)} className={chip(position == null)}>كل المراكز</button>
                {positionTabs.map((p) => (
                  <button key={p} onClick={() => setPosition(p)} className={chip(position === p)}>{p}</button>
                ))}
              </div>
              {scope === "global" && bigLeagues.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  <button onClick={() => setLeague(null)} className={chip(league == null)}>
                    <Filter className="w-3 h-3" /> كل الدوريات
                  </button>
                  {bigLeagues.map((l) => (
                    <button key={l.id} onClick={() => setLeague(l.id)} className={chip(league === l.id)}>{l.name}</button>
                  ))}
                </div>
              )}
              {scope === "saudi" && saudiRumourClubs.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  <button onClick={() => setSaudiRumourClub(null)} className={chip(saudiRumourClub == null)}>
                    <Filter className="w-3 h-3" /> كل الأندية
                  </button>
                  {saudiRumourClubs.map((c) => (
                    <button key={c.name} onClick={() => setSaudiRumourClub(c.name)} className={chip(saudiRumourClub === c.name)}>
                      {c.image && <img src={c.image} alt="" className="w-4 h-4 object-contain" loading="lazy" />}
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* مفتاح «أبرز الأندية» للمؤكّد العالمي */}
          {showGlobalConfirmedUi && (
            <div className="flex gap-2">
              <button onClick={() => setMajorsOnly(true)} className={chip(majorsOnly)}>أبرز الأندية</button>
              <button onClick={() => setMajorsOnly(false)} className={chip(!majorsOnly)}>كل الانتقالات</button>
            </div>
          )}
        </Card>

        {/* ---------- المحتوى ---------- */}
        <div className="space-y-8">
          {/* سعودية › مؤكّدة / إعارات مؤكّدة */}
          {showSaudiConfirmedUi && (
            isLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : !configured ? (
              <div className="text-center text-muted-foreground py-16 bg-card rounded-2xl border border-dashed border-border">
                مركز الانتقالات غير متاح حاليًا.
              </div>
            ) : filteredSaudiConfirmed.length === 0 ? (
              tab === "confirmed" && (
                <div className="text-center text-muted-foreground py-16 bg-card rounded-2xl border border-dashed border-border">
                  {transfers.length === 0 ? "لا توجد حركة انتقالات في النافذة الحالية." : "لا نتائج مطابقة للفلاتر المحدّدة."}
                </div>
              )
            ) : (
              <div className="space-y-6">
                {tab === "loans" && <div className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /><h2 className="font-bold text-lg">إعارات مؤكّدة</h2></div>}
                <div className="text-xs text-muted-foreground">{filteredSaudiConfirmed.length} صفقة مؤكّدة</div>
                {groupedSaudi.map((g) => (
                  <div key={g.month}>
                    <div className="sticky top-16 z-[1] mb-2.5 inline-block rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{g.month}</div>
                    <div className="space-y-2">
                      {g.items.map((t) => <TransferRow key={t.id} t={t} />)}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* عالمية › مؤكّدة / إعارات مؤكّدة */}
          {showGlobalConfirmedUi && (
            globalLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : globalConfirmedRaw?.configured === false ? (
              <div className="text-center text-muted-foreground py-16 bg-card rounded-2xl border border-dashed border-border">
                الانتقالات العالمية غير متاحة حاليًا.
              </div>
            ) : filteredGlobalConfirmed.length === 0 ? (
              <div className="text-center text-muted-foreground py-16 bg-card rounded-2xl border border-dashed border-border">
                لا نتائج مطابقة — جرّب «كل الانتقالات» أو امسح البحث.
              </div>
            ) : (
              <div className="space-y-6">
                {tab === "loans" && <div className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /><h2 className="font-bold text-lg">إعارات مؤكّدة</h2></div>}
                <div className="text-xs text-muted-foreground">{filteredGlobalConfirmed.length} انتقالًا</div>
                <div className="space-y-2">
                  {filteredGlobalConfirmed.slice(0, 60).map((t) => <GlobalConfirmedRow key={t.id} t={t} />)}
                </div>
              </div>
            )
          )}

          {/* الإشاعات (انتقال/إعارة/تجديد بحسب التبويب) */}
          {showRumourFilters && (
            rumoursLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
              </div>
            ) : !rumoursConfigured ? (
              <div className="text-center text-muted-foreground py-16 bg-card rounded-2xl border border-dashed border-border">
                الإشاعات غير متاحة حاليًا.
              </div>
            ) : filteredRumours.length === 0 ? (
              <div className="text-center text-muted-foreground py-16 bg-card rounded-2xl border border-dashed border-border">
                {scope === "saudi" ? "لا إشاعات سعودية مطابقة حاليًا — تغطية المصادر العالمية للدوري السعودي تتحرك مع اشتعال السوق." : "لا إشاعات مطابقة للفلاتر المحدّدة."}
              </div>
            ) : (
              <div className="space-y-4">
                {(tab === "loans") && <div className="flex items-center gap-2"><CircleDashed className="w-5 h-5 text-fuchsia-600" /><h2 className="font-bold text-lg">إشاعات إعارة</h2></div>}
                <div className="text-xs text-muted-foreground">{filteredRumours.length} إشاعة — كل إشاعة بمصدرها ودرجة احتمالها</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredRumours.slice(0, 60).map((r) => <RumourCard key={r.id} r={r} />)}
                </div>
              </div>
            )
          )}
        </div>

        {/* ---------- إحصائيات السوق ---------- */}
        {(overview?.comparison || (overview?.clubBalance?.length ?? 0) > 0) && (
          <div className="mt-10 space-y-6">
            {overview?.comparison && <MercatoComparison comparison={overview.comparison} />}
            {(overview?.clubBalance?.length ?? 0) > 0 && <ClubBalanceBoard rows={overview!.clubBalance} />}
          </div>
        )}

        {/* ملاحظة تحريرية */}
        <p className="mt-8 text-[11px] leading-relaxed text-muted-foreground">
          الصفقات المؤكّدة من سجل API-Football، والإشاعات من رصد SportMonks لمصادر عالمية (فابريزيو رومانو، الغارديان، ESPN…) وتبقى إشاعةً حتى إعلانها رسميًّا — درجة الاحتمال والمبلغ المتداول من المصدر نفسه، ومؤشر الموثوقية تصنيف تحريري من سبق. تُعرض قيمة الصفقة عند إعلانها فقط ولا نختلق رقمًا.
        </p>
      </main>
      <Footer />
    </div>
  );
}
