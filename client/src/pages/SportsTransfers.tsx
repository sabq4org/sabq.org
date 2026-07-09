/**
 * مركز الانتقالات المتكامل — /sports/transfers
 *
 * تبويبان رئيسيان: سعودية | عالمية، وداخل كلٍّ: مؤكّدة | إشاعات | إعارات |
 * تجديد عقود — بتمييز بصري صارم بين المؤكّد والإشاعة.
 *
 * المصادر: المؤكّد السعودي من /api/sports/transfers (API-Football)،
 * والإشاعات + المؤكّد العالمي من /api/transfer-center/* (SportMonks).
 * مبالغ الإشاعات قيم متداولة من مصادرها — نعرضها بوسمها فقط. RTL كامل.
 *
 * الهوية البصرية: تلميع ضمن بوابة /sports (أسطح فاتحة، primary، قوائم نظيفة).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, ArrowLeft, ArrowLeftRight, Search, Coins, Repeat, Gift, Filter,
  ExternalLink, ShieldCheck, Shield, ShieldAlert, Hourglass, TrendingUp,
  FileSignature, Sparkles, CheckCircle2, CircleDashed, Flame, ChevronLeft,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCanonical } from "@/hooks/useCanonical";
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
  high: { label: "موثوقية عالية", icon: <ShieldCheck className="w-3.5 h-3.5" />, cls: "text-emerald-700 dark:text-emerald-400" },
  medium: { label: "موثوقية متوسطة", icon: <Shield className="w-3.5 h-3.5" />, cls: "text-foreground/60" },
  low: { label: "تعامل بحذر", icon: <ShieldAlert className="w-3.5 h-3.5" />, cls: "text-amber-700 dark:text-amber-500" },
};

/** حالة فارغة موحّدة بأسلوب بوابة الرياضة */
function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <p className="text-sm font-semibold text-foreground/80">{title}</p>
      {hint && <p className="mt-1.5 text-[12.5px] text-foreground/55">{hint}</p>}
    </div>
  );
}

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

function PlayerAvatar({ src, size = "h-10 w-10" }: { src: string | null; size?: string }) {
  if (!src) {
    return (
      <div className={`${size} grid shrink-0 place-items-center rounded-full border border-border bg-background text-xs font-bold text-foreground/45`}>
        ؟
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={`${size} shrink-0 rounded-full border border-border object-cover bg-background`}
      onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
    />
  );
}

/** وسم صريح يفصل المؤكّد عن الإشاعة — لا يلتبس على القارئ أبدًا */
function CertaintyTag({ confirmed }: { confirmed: boolean }) {
  return confirmed ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" /> مؤكّدة
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-extrabold text-foreground/70">
      <CircleDashed className="h-3 w-3" /> إشاعة
    </span>
  );
}

function MoneyChip({ value }: { value: string }) {
  return (
    <span className="shrink-0 rounded-lg border border-border bg-background px-2 py-0.5 text-xs font-extrabold tabular-nums text-foreground" dir="ltr">
      {value}
    </span>
  );
}

// ---------- صف إشاعة موحّد ----------
function RumourCard({ r }: { r: TcRumour }) {
  const money = fmtMoney(r.amount, r.currency);
  return (
    <div className={`rounded-2xl border bg-card p-4 transition-colors hover:border-primary/30 ${r.hereWeGo ? "border-red-500/35" : "border-border"}`}>
      <div className="flex items-start gap-3">
        <Link href={`/sports/transfers/story/${r.player.id}`}>
          <PlayerAvatar src={r.player.image} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/sports/transfers/story/${r.player.id}`} className="truncate font-bold text-foreground transition-colors hover:text-primary">
              {r.player.name}
            </Link>
            {r.player.position && <span className="text-[11px] font-medium text-foreground/55">{r.player.position}</span>}
            <CertaintyTag confirmed={false} />
            {r.hereWeGo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-extrabold text-white">
                <Flame className="h-3 w-3" /> Here we go
              </span>
            )}
            {rumourKindBadge(r.kind)}
          </div>
          <div className="mt-2 flex min-w-0 items-center gap-2 text-sm">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground/60">
              {r.from.image && <img src={r.from.image} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />}
              <span className="truncate">{r.from.name}</span>
            </span>
            <ArrowLeft className="h-4 w-4 shrink-0 text-foreground/35" />
            <span className="inline-flex min-w-0 items-center gap-1.5 font-bold text-foreground">
              {r.to.image && <img src={r.to.image} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />}
              <span className="truncate">{r.to.name}</span>
            </span>
            {money && <span className="mr-auto"><MoneyChip value={money} /></span>}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <ProbabilityMeter p={r.probability} />
            <SourceBadge source={r.source} />
            <span className="text-[11px] tabular-nums text-foreground/55">{fmtDay(r.date)}</span>
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
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-3.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 shrink-0 items-center gap-2.5 sm:w-52">
        <PlayerAvatar src={t.player.image} size="h-9 w-9" />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-foreground">{t.player.name}</div>
          <span className="text-[11px] tabular-nums text-foreground/55">{fmtDay(t.date)}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground/60">
          {t.from.image && <img src={t.from.image} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />}
          <span className="truncate">{t.from.name}</span>
        </span>
        <ArrowLeft className="h-4 w-4 shrink-0 text-foreground/35" />
        <span className="inline-flex min-w-0 items-center gap-1.5 font-bold text-foreground">
          {t.to.image && <img src={t.to.image} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />}
          <span className="truncate">{t.to.name}</span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <CertaintyTag confirmed />
        {t.kind === "loan" && <Badge className="shrink-0 gap-1 border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-400"><Repeat className="h-3 w-3" /> إعارة</Badge>}
        {t.kind === "free" && <Badge className="shrink-0 gap-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"><Gift className="h-3 w-3" /> حر</Badge>}
        {money && <MoneyChip value={money} />}
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
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${roshn ? "font-bold text-foreground" : "text-foreground/60"}`}>
      {club.logo && <img src={club.logo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />}
      <span className="truncate">{club.name || "—"}</span>
    </span>
  );
  return club.id ? (
    <Link href={`/sports/team/${club.id}`} className="min-w-0 transition-colors hover:text-primary">{inner}</Link>
  ) : inner;
}

function TransferRow({ t }: { t: LeagueTransfer }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-3.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 shrink-0 sm:w-44">
        {t.player.id ? (
          <Link href={`/sports/player/${t.player.id}`} className="block truncate text-sm font-bold text-foreground transition-colors hover:text-primary">{t.player.name}</Link>
        ) : (
          <span className="block truncate text-sm font-bold text-foreground">{t.player.name}</span>
        )}
        <span className="text-[11px] tabular-nums text-foreground/55">{fmtDay(t.date)}</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <ClubChip club={t.from} roshn={t.outClubId != null} />
        <ArrowLeft className="h-4 w-4 shrink-0 text-foreground/35" />
        <ClubChip club={t.to} roshn={t.inClubId != null} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <CertaintyTag confirmed />
        {kindBadge(t)}
      </div>
    </div>
  );
}

function TopDealCard({ t, rank }: { t: LeagueTransfer; rank: number }) {
  return (
    <div className="relative w-56 shrink-0 rounded-2xl border border-border bg-card p-4">
      <div className="absolute left-3 top-3 text-xs font-extrabold tabular-nums text-foreground/30">#{rank}</div>
      <div className="text-2xl font-extrabold tabular-nums text-foreground" dir="ltr">{t.type}</div>
      {t.player.id ? (
        <Link href={`/sports/player/${t.player.id}`} className="mt-1 block truncate font-bold text-foreground transition-colors hover:text-primary">{t.player.name}</Link>
      ) : (
        <div className="mt-1 truncate font-bold text-foreground">{t.player.name}</div>
      )}
      <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-foreground/60">
        {t.from.logo && <img src={t.from.logo} alt="" className="h-4 w-4 shrink-0 object-contain" loading="lazy" />}
        <span className="max-w-[5rem] truncate">{t.from.name}</span>
        <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
        {t.to.logo && <img src={t.to.logo} alt="" className="h-4 w-4 shrink-0 object-contain" loading="lazy" />}
        <span className="max-w-[5rem] truncate">{t.to.name}</span>
      </div>
      <div className="mt-1.5 text-[11px] tabular-nums text-foreground/55">{fmtDay(t.date)}</div>
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

function WindowChip({ win }: { win: TransferWindow }) {
  const now = useNow();
  const opens = new Date(win.opensAt).getTime();
  const closes = new Date(win.closesAt).getTime();
  let status: React.ReactNode;
  if (now < opens) {
    status = <>تفتح بعد <b className="tabular-nums text-foreground">{fmtRemaining(opens - now)}</b></>;
  } else if (now < closes) {
    status = <>تُغلق بعد <b className="tabular-nums text-foreground">{fmtRemaining(closes - now)}</b></>;
  } else {
    status = <span className="font-bold">أُغلقت</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[12px] font-semibold text-foreground/75">
      <Hourglass className="h-3.5 w-3.5 text-primary" />
      <span className="font-bold text-foreground">{win.label}</span>
      <span className="text-foreground/30">·</span>
      <span>{status}</span>
    </span>
  );
}

/** صفقة بارزة واحدة — بدل شبكة ثلاث بطاقات متدرجة */
function SpotlightDeal({ r }: { r: TcRumour }) {
  const money = fmtMoney(r.amount, r.currency);
  return (
    <Link
      href={`/sports/transfers/story/${r.player.id}`}
      className={`group flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/35 sm:flex-row sm:items-center sm:gap-5 sm:p-5 ${r.hereWeGo ? "border-red-500/35" : "border-border"}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <PlayerAvatar src={r.player.image} size="h-14 w-14" />
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <CertaintyTag confirmed={false} />
            {r.hereWeGo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-extrabold text-white">
                <Flame className="h-3 w-3" /> Here we go
              </span>
            )}
          </div>
          <div className="truncate text-lg font-extrabold text-foreground transition-colors group-hover:text-primary sm:text-xl">
            {r.player.name}
          </div>
          <div className="mt-1.5 flex min-w-0 items-center gap-2 text-sm">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground/60">
              {r.from.image && <img src={r.from.image} alt="" className="h-5 w-5 object-contain" loading="lazy" />}
              <span className="truncate">{r.from.name}</span>
            </span>
            <ArrowLeft className="h-4 w-4 shrink-0 text-foreground/35" />
            <span className="inline-flex min-w-0 items-center gap-1.5 font-bold text-foreground">
              {r.to.image && <img src={r.to.image} alt="" className="h-5 w-5 object-contain" loading="lazy" />}
              <span className="truncate">{r.to.name}</span>
            </span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 sm:flex-col sm:items-end">
        {money && <div className="text-2xl font-extrabold tabular-nums text-foreground sm:text-3xl" dir="ltr">{money}</div>}
        <ProbabilityMeter p={r.probability} />
        <span className="inline-flex items-center gap-0.5 text-[12px] font-extrabold text-primary">
          التفاصيل
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.4} />
        </span>
      </div>
    </Link>
  );
}

// ---------- مقارنة الميركاتو: روشن vs البريميرليغ ----------
function MercatoComparison({ comparison }: { comparison: NonNullable<OverviewResponse["comparison"]> }) {
  const rumoured = comparison.basis === "rumoured";
  const max = Math.max(comparison.roshn.total, comparison.premierLeague.total, 1);
  const rows = [
    { label: "دوري روشن السعودي", ...comparison.roshn, cls: "bg-primary" },
    { label: "البريميرليغ", ...comparison.premierLeague, cls: "bg-primary/40" },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-extrabold text-foreground">
          {rumoured ? "قيم الميركاتو المتداولة" : "إنفاق الميركاتو"}
        </h2>
        <span className="text-sm font-medium text-foreground/55">روشن مقابل البريميرليغ</span>
        {rumoured && <CertaintyTag confirmed={false} />}
      </div>
      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-bold text-foreground">{row.label}</span>
              <span className="tabular-nums text-foreground/60">
                <b className="text-foreground" dir="ltr">{fmtMoney(row.total, "EUR") ?? "0 €"}</b>
                <span className="mx-1">·</span>{row.deals} {rumoured ? "إشاعة مُسعَّرة" : "صفقة مُسعَّرة"}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-background border border-border" dir="ltr">
              <div className={`h-full rounded-full ${row.cls} transition-all`} style={{ width: `${Math.max(2, Math.round((row.total / max) * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-foreground/55">
        {rumoured
          ? "قيم متداولة في إشاعات المصادر منذ مطلع يونيو — يتحوّل الرسم إلى الصفقات الرسمية فور توفّر سجل النافذة."
          : "الصفقات المُعلَنة المبالغ فقط منذ مطلع يونيو — كثير من الصفقات لا تُفصح عن قيمتها."}
      </p>
    </div>
  );
}

// ---------- ميزان الصرف/الدخل لأندية روشن ----------
function ClubBalanceBoard({ rows }: { rows: OverviewResponse["clubBalance"] }) {
  const max = Math.max(...rows.map((r) => Math.max(r.spent, r.earned)), 1);
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Coins className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-extrabold text-foreground">ميزان السوق — أندية روشن</h2>
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.clubId} className="flex items-center gap-3">
            <span className="flex w-28 min-w-0 shrink-0 items-center gap-1.5 text-sm font-bold text-foreground">
              {r.logo && <img src={r.logo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />}
              <span className="truncate">{r.club}</span>
            </span>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 rounded-full bg-red-500/70" style={{ width: `${Math.max(1, Math.round((r.spent / max) * 100))}%` }} />
                <span className="shrink-0 text-[10px] tabular-nums text-foreground/55" dir="ltr">{fmtMoney(r.spent, "EUR") ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 rounded-full bg-emerald-500/70" style={{ width: `${Math.max(1, Math.round((r.earned / max) * 100))}%` }} />
                <span className="shrink-0 text-[10px] tabular-nums text-foreground/55" dir="ltr">{fmtMoney(r.earned, "EUR") ?? "—"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-foreground/55">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-red-500/70" /> صرف</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-emerald-500/70" /> دخل</span>
      </div>
    </div>
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
    { key: "saudi", label: "سعودية" },
    { key: "global", label: "عالمية" },
  ];
  const contentTabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "confirmed", label: "مؤكّدة", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    { key: "rumours", label: "إشاعات", icon: <Sparkles className="h-3.5 w-3.5" /> },
    { key: "loans", label: "إعارات", icon: <Repeat className="h-3.5 w-3.5" /> },
    { key: "extensions", label: "تجديد عقود", icon: <FileSignature className="h-3.5 w-3.5" /> },
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
  const spotlight = overview?.hero?.[0] ?? null;
  const moreHero = overview?.hero?.slice(1, 3) ?? [];

  const chip = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13px] font-bold transition-colors ${
      active
        ? "border-primary/30 bg-primary/10 text-primary"
        : "border-border bg-background text-foreground hover:border-primary/35 hover:bg-primary/10 hover:text-primary"
    }`;

  const segBtn = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
      active ? "bg-primary text-white" : "text-foreground/65 hover:text-foreground"
    }`;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header />

      {/* هيرو أوضح — عنوان + وصف + نوافذ مضغوطة */}
      <section className="border-b border-border bg-card px-4 pt-7 pb-6 text-center sm:px-6 sm:pt-10 sm:pb-8">
        <Link
          href="/sports"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-foreground/60 transition-colors hover:text-primary"
        >
          <ArrowRight className="h-4 w-4" /> البوابة الرياضية
        </Link>
        <h1 className="mx-auto max-w-2xl text-balance text-[26px] font-extrabold leading-[1.3] text-foreground sm:text-4xl">
          مركز الانتقالات
        </h1>
        <p className="mx-auto mt-2.5 max-w-xl text-[14px] font-medium leading-relaxed text-foreground/70 sm:text-base">
          صفقات مؤكّدة وإشاعات موثّقة المصدر — سعوديًّا وعالميًّا.
        </p>
        {overview?.windows && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <WindowChip win={overview.windows.saudi} />
            <WindowChip win={overview.windows.europe} />
          </div>
        )}
      </section>

      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        {/* صفقة بارزة واحدة */}
        {spotlight && (
          <div className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <Flame className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-extrabold text-foreground">أبرز قصة جارية</h2>
            </div>
            <SpotlightDeal r={spotlight} />
            {moreHero.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {moreHero.map((r) => (
                  <Link
                    key={r.id}
                    href={`/sports/transfers/story/${r.player.id}`}
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-bold text-foreground transition-colors hover:border-primary/35 hover:text-primary"
                  >
                    <PlayerAvatar src={r.player.image} size="h-6 w-6" />
                    <span className="truncate">{r.player.name}</span>
                    <ProbabilityMeter p={r.probability} compact />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* نطاق: سعودية | عالمية */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          {scopeTabs.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => { setScope(s.key); setQ(""); }}
              className={`rounded-xl border px-4 py-2.5 text-sm font-extrabold transition-colors ${
                scope === s.key
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/35"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* نوع المحتوى */}
        <div className="scrollbar-hide mb-5 flex gap-2 overflow-x-auto pb-1">
          {contentTabs.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={chip(tab === t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ملخّص مضغوط + أبرز الصفقات */}
        {showSaudiConfirmedUi && tab === "confirmed" && !isLoading && configured && stats.total > 0 && (
          <div className="mb-5 space-y-4">
            <p className="text-center text-[13px] font-semibold text-foreground/70">
              <span className="tabular-nums text-foreground">{stats.total}</span> صفقة
              <span className="mx-1.5 text-foreground/30">·</span>
              <span className="tabular-nums text-foreground">{stats.withFee}</span> بمبلغ
              <span className="mx-1.5 text-foreground/30">·</span>
              <span className="tabular-nums text-foreground">{stats.loans}</span> إعارة
              <span className="mx-1.5 text-foreground/30">·</span>
              <span className="tabular-nums text-foreground">{stats.free}</span> حرّة
            </p>
            {topDeals.length > 0 && (
              <div>
                <div className="mb-2.5 flex items-center gap-2">
                  <Coins className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-extrabold text-foreground">أبرز الصفقات بمبلغ معلن</h2>
                </div>
                <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-1">
                  {topDeals.map((t, i) => <TopDealCard key={t.id} t={t} rank={i + 1} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* فلاتر أخف — بحث أولًا ثم أساسيات بلا بطاقة سميكة */}
        <div className="mb-6 space-y-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث باسم لاعب أو نادٍ…"
              className="w-full rounded-xl border border-border bg-card py-2.5 pr-10 pl-3 text-sm text-foreground outline-none placeholder:text-foreground/40 focus:border-primary/50"
            />
          </div>

          {showSaudiConfirmedUi && (
            <>
              <div className="flex flex-wrap gap-2">
                <div className="inline-flex rounded-xl border border-border bg-card p-1">
                  {([{ key: "all", label: "الكل" }, { key: "in", label: "وصل" }, { key: "out", label: "غادر" }] as { key: DirFilter; label: string }[]).map((tb) => (
                    <button key={tb.key} type="button" onClick={() => setDir(tb.key)} className={segBtn(dir === tb.key)}>
                      {tb.label}
                    </button>
                  ))}
                </div>
                {tab === "confirmed" && (
                  <div className="inline-flex rounded-xl border border-border bg-card p-1">
                    {([{ key: "all", label: "كل الأنواع" }, { key: "money", label: "بمبلغ" }, { key: "free", label: "حر" }, { key: "loan", label: "إعارة" }] as { key: KindFilter; label: string }[]).map((tb) => (
                      <button key={tb.key} type="button" onClick={() => setKind(tb.key)} className={segBtn(kind === tb.key)}>
                        {tb.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
                <button type="button" onClick={() => setClub(null)} className={chip(club == null)}>
                  <Filter className="h-3 w-3" /> كل الأندية
                </button>
                {clubs.map((c) => (
                  <button key={c.id} type="button" onClick={() => setClub(c.id)} className={chip(club === c.id)}>
                    {c.logo && <img src={c.logo} alt="" className="h-4 w-4 object-contain" loading="lazy" />}
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {showRumourFilters && (
            <>
              <div className="flex flex-wrap gap-2">
                <div className="inline-flex rounded-xl border border-border bg-card p-1">
                  {probTabs.map((tb) => (
                    <button key={tb.key} type="button" onClick={() => setProb(tb.key)} className={segBtn(prob === tb.key)}>
                      {tb.label}
                    </button>
                  ))}
                </div>
                <div className="inline-flex rounded-xl border border-border bg-card p-1">
                  {([{ key: "latest", label: "الأحدث" }, { key: "value", label: "الأعلى قيمة" }] as { key: SortMode; label: string }[]).map((tb) => (
                    <button key={tb.key} type="button" onClick={() => setSortMode(tb.key)} className={segBtn(sortMode === tb.key)}>
                      {tb.label}
                    </button>
                  ))}
                </div>
                <div className="inline-flex rounded-xl border border-border bg-card p-1">
                  {windowTabs.map((tb) => (
                    <button key={tb.key} type="button" onClick={() => setWindowFilter(tb.key)} className={segBtn(windowFilter === tb.key)}>
                      {tb.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
                <button type="button" onClick={() => setPosition(null)} className={chip(position == null)}>كل المراكز</button>
                {positionTabs.map((p) => (
                  <button key={p} type="button" onClick={() => setPosition(p)} className={chip(position === p)}>{p}</button>
                ))}
              </div>
              {scope === "global" && bigLeagues.length > 0 && (
                <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
                  <button type="button" onClick={() => setLeague(null)} className={chip(league == null)}>
                    <Filter className="h-3 w-3" /> كل الدوريات
                  </button>
                  {bigLeagues.map((l) => (
                    <button key={l.id} type="button" onClick={() => setLeague(l.id)} className={chip(league === l.id)}>{l.name}</button>
                  ))}
                </div>
              )}
              {scope === "saudi" && saudiRumourClubs.length > 0 && (
                <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
                  <button type="button" onClick={() => setSaudiRumourClub(null)} className={chip(saudiRumourClub == null)}>
                    <Filter className="h-3 w-3" /> كل الأندية
                  </button>
                  {saudiRumourClubs.map((c) => (
                    <button key={c.name} type="button" onClick={() => setSaudiRumourClub(c.name)} className={chip(saudiRumourClub === c.name)}>
                      {c.image && <img src={c.image} alt="" className="h-4 w-4 object-contain" loading="lazy" />}
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {showGlobalConfirmedUi && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setMajorsOnly(true)} className={chip(majorsOnly)}>أبرز الأندية</button>
              <button type="button" onClick={() => setMajorsOnly(false)} className={chip(!majorsOnly)}>كل الانتقالات</button>
            </div>
          )}
        </div>

        {/* ---------- المحتوى ---------- */}
        <div className="space-y-8">
          {showSaudiConfirmedUi && (
            isLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
              </div>
            ) : !configured ? (
              <EmptyState title="مركز الانتقالات غير متاح حاليًا" hint="أعد المحاولة لاحقًا." />
            ) : filteredSaudiConfirmed.length === 0 ? (
              tab === "confirmed" && (
                <EmptyState
                  title={transfers.length === 0 ? "لا توجد حركة انتقالات في النافذة الحالية" : "لا نتائج مطابقة للفلاتر"}
                  hint={transfers.length === 0 ? "تظهر الصفقات هنا فور تسجيلها." : "جرّب مسح البحث أو تغيير النادي."}
                />
              )
            ) : (
              <div className="space-y-6">
                {tab === "loans" && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <h2 className="text-lg font-extrabold text-foreground">إعارات مؤكّدة</h2>
                  </div>
                )}
                <div className="text-[12px] font-semibold text-foreground/55">{filteredSaudiConfirmed.length} صفقة مؤكّدة</div>
                {groupedSaudi.map((g) => (
                  <div key={g.month}>
                    <div className="sticky top-16 z-[1] mb-2.5 inline-block rounded-full border border-border bg-card px-3 py-1 text-xs font-bold text-foreground/65">
                      {g.month}
                    </div>
                    <div className="space-y-2">
                      {g.items.map((t) => <TransferRow key={t.id} t={t} />)}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {showGlobalConfirmedUi && (
            globalLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
              </div>
            ) : globalConfirmedRaw?.configured === false ? (
              <EmptyState title="الانتقالات العالمية غير متاحة حاليًا" hint="أعد المحاولة لاحقًا." />
            ) : filteredGlobalConfirmed.length === 0 ? (
              <EmptyState title="لا نتائج مطابقة" hint="جرّب «كل الانتقالات» أو امسح البحث." />
            ) : (
              <div className="space-y-6">
                {tab === "loans" && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <h2 className="text-lg font-extrabold text-foreground">إعارات مؤكّدة</h2>
                  </div>
                )}
                <div className="text-[12px] font-semibold text-foreground/55">{filteredGlobalConfirmed.length} انتقالًا</div>
                <div className="space-y-2">
                  {filteredGlobalConfirmed.slice(0, 60).map((t) => <GlobalConfirmedRow key={t.id} t={t} />)}
                </div>
              </div>
            )
          )}

          {showRumourFilters && (
            rumoursLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
              </div>
            ) : !rumoursConfigured ? (
              <EmptyState title="الإشاعات غير متاحة حاليًا" hint="أعد المحاولة لاحقًا." />
            ) : filteredRumours.length === 0 ? (
              <EmptyState
                title={scope === "saudi" ? "لا إشاعات سعودية مطابقة حاليًا" : "لا إشاعات مطابقة للفلاتر"}
                hint={scope === "saudi" ? "تظهر هنا مع اشتعال سوق روشن." : "جرّب تغيير درجة الاحتمال أو الدوري."}
              />
            ) : (
              <div className="space-y-4">
                {tab === "loans" && (
                  <div className="flex items-center gap-2">
                    <CircleDashed className="h-5 w-5 text-foreground/55" />
                    <h2 className="text-lg font-extrabold text-foreground">إشاعات إعارة</h2>
                  </div>
                )}
                <div className="text-[12px] font-semibold text-foreground/55">
                  {filteredRumours.length} إشاعة — كل إشاعة بمصدرها ودرجة احتمالها
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredRumours.slice(0, 60).map((r) => <RumourCard key={r.id} r={r} />)}
                </div>
              </div>
            )
          )}
        </div>

        {(overview?.comparison || (overview?.clubBalance?.length ?? 0) > 0) && (
          <div className="mt-10 space-y-5 border-t border-border pt-8">
            {overview?.comparison && <MercatoComparison comparison={overview.comparison} />}
            {(overview?.clubBalance?.length ?? 0) > 0 && <ClubBalanceBoard rows={overview!.clubBalance} />}
          </div>
        )}

        <p className="mt-8 text-[11px] leading-relaxed text-foreground/55">
          الصفقات المؤكّدة من سجل API-Football، والإشاعات من رصد SportMonks لمصادر عالمية وتبقى إشاعةً حتى إعلانها رسميًّا — درجة الاحتمال والمبلغ المتداول من المصدر نفسه، ومؤشر الموثوقية تصنيف تحريري من سبق. تُعرض قيمة الصفقة عند إعلانها فقط ولا نختلق رقمًا.
        </p>
      </main>
      <Footer />
    </div>
  );
}
