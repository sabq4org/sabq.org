import { sportsLastFetchLabel } from "@/hooks/useSportsHomeQuery";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, Radio, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { countdownTo, formatKickoffDay, formatKickoffTime } from "../worldcup/wcTypes";

/**
 * «شريط بطولة» عام للصفحة الرئيسية — نفس تجربة شريط المونديال لكن مُعاملًا
 * بالثيم والبيانات: يعرض المباراة القادمة/الحية (من overview.nextMatch)
 * أو بطاقة البطل بعد حسم النهائي، ويختفي كليًا عند blockHidden أو غياب
 * البيانات. يخدم «خليجي 27» و«كأس آسيا 2027» (والقادم من البطولات).
 */

export interface CupTeam {
  id: number;
  name: string;
  logo: string;
}

export interface CupFixture {
  id: number;
  date: string;
  timestamp: number;
  status: {
    code: string;
    label: string;
    elapsed: number | null;
    live: boolean;
    finished: boolean;
  };
  round: string;
  home: CupTeam;
  away: CupTeam;
  goals: { home: number | null; away: number | null };
}

export interface CupChampion {
  team: CupTeam;
  runnerUp: CupTeam | null;
  score: string | null;
  penalties: string | null;
  decidedAt: string | null;
  source: "auto" | "manual";
}

/** ملخّص «يوم الجولة» — لأدوار الكؤوس التي تُلعب دفعة واحدة (عدة مباريات في يوم) */
export interface CupMatchday {
  count: number;
  round: string | null;
  date: string;
  nextKickoffTs: number | null;
  sameKickoff: boolean;
  liveCount: number;
  finishedCount: number;
}

/** وضع «ما قبل الموسم/البطولة» — عدّاد انطلاق + مباراة الافتتاح (للدوريات خاصة) */
export interface CupPreSeason {
  /** عنوان الانطلاقة، مثل «موسم 2026-27 ينطلق» */
  label: string;
  /** توقيت أول مباراة (ثوانٍ يونكس) — null إن لم يُنشر الجدول بعد */
  kickoffTs: number | null;
  /** وسم تاريخ الانطلاق للعرض، مثل «الجمعة 28 أغسطس» */
  dateLabel?: string | null;
  /** مباراة الافتتاح (اختياري) */
  opener?: CupFixture | null;
}

/** ثيم ألوان الشريط — Tailwind classes جاهزة (لا قيم ديناميكية كي لا تسقط من الـpurge) */
export interface CupStripTheme {
  /** خلفية الحزام كامل العرض */
  band: string;
  /** تدرّج بطاقة الشريط */
  card: string;
  ring: string;
  /** نص ثانوي فاتح فوق التدرّج */
  soft: string;
  /** لون التمييز القوي (العدّاد/النتيجة الثانوية) */
  accent: string;
  /** زر الدعوة للقسم */
  cta: string;
}

interface CupHomeStripProps {
  staleUpdatedAt?: string;
  title: string;
  subtitle: string;
  championSubtitle: string;
  championLabel: string;
  href: string;
  ctaLabel: string;
  theme: CupStripTheme;
  fixture: CupFixture | null;
  champion: CupChampion | null;
  /**
   * ملخّص يوم الجولة — متى بلغت مبارياته 3 فأكثر يعرض الشريط عدّاد الجولة
   * بدل إبراز مباراة اعتباطية (أدوار الكؤوس المبكرة تُلعب دفعة واحدة).
   */
  matchday?: CupMatchday | null;
  /**
   * وضع ما قبل الموسم — عدّاد انطلاق الموسم + مباراة الافتتاح. يتقدّم على
   * matchday/fixture (ولا يظهر مع البطل).
   */
  preSeason?: CupPreSeason | null;
  /** شعار البطولة الرسمي — يُعرض على رقعة بيضاء بدل أيقونة الكأس العامة */
  emblemSrc?: string;
  emblemAlt?: string;
}

function arabicDays(n: number): string {
  if (n === 1) return "يوم";
  if (n === 2) return "يومين";
  if (n <= 10) return `${n} أيام`;
  return `${n} يومًا`;
}

function arabicHours(n: number): string {
  if (n === 1) return "ساعة";
  if (n === 2) return "ساعتين";
  if (n <= 10) return `${n} ساعات`;
  return `${n} ساعة`;
}

function TickingCountdown({ timestamp, accent, soft }: { timestamp: number; accent: string; soft: string }) {
  const [countdown, setCountdown] = useState(() => countdownTo(timestamp));
  useEffect(() => {
    const interval = setInterval(() => setCountdown(countdownTo(timestamp)), 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  if (countdown.total <= 0) {
    return <p className={`text-[11px] font-bold ${soft}`}>حان موعد الانطلاق — التغطية خلال لحظات</p>;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  // في آخر يوم ساعة رقمية HH:MM:SS (وحدها dir=ltr)؛ قبله نص عربي خالص —
  // خلطه مع dir=ltr يبعثر الأرقام (Bidi)
  const isClock = countdown.days === 0;
  const text = isClock
    ? `${pad(countdown.hours)}:${pad(countdown.minutes)}:${pad(countdown.seconds)}`
    : countdown.hours > 0
      ? `${arabicDays(countdown.days)} و${arabicHours(countdown.hours)}`
      : arabicDays(countdown.days);

  return (
    <p className={`text-[11px] ${soft}`}>
      تنطلق بعد{" "}
      <span className={`font-black tabular-nums ${accent}`} dir={isClock ? "ltr" : undefined}>
        {text}
      </span>
    </p>
  );
}

/** عدّاد تنازلي بشرائح (يوم/ساعة/دقيقة/ثانية) — نسخة مدمجة من عدّاد هيرو الأقسام */
function CountdownChipsRow({ timestamp, soft }: { timestamp: number; soft: string }) {
  const [countdown, setCountdown] = useState(() => countdownTo(timestamp));
  useEffect(() => {
    const interval = setInterval(() => setCountdown(countdownTo(timestamp)), 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  if (countdown.total <= 0) {
    return <p className={`text-[11px] font-bold ${soft}`}>حان موعد الانطلاق — التغطية خلال لحظات</p>;
  }

  const chips = [
    { value: countdown.days, label: "يوم" },
    { value: countdown.hours, label: "ساعة" },
    { value: countdown.minutes, label: "دقيقة" },
    { value: countdown.seconds, label: "ثانية" },
  ];
  return (
    <div className="flex items-center justify-center gap-1.5" dir="ltr" aria-label="العد التنازلي لانطلاق الجولة">
      {chips.map((chip) => (
        <div key={chip.label} className="flex min-w-[2.75rem] flex-col items-center rounded-lg bg-white/10 px-2 py-1 backdrop-blur-sm">
          <span className="text-base font-black text-white tabular-nums leading-tight">{chip.value}</span>
          <span className={`text-[9px] ${soft}`}>{chip.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * كتلة «يوم الجولة» — تحل محل مربع المباراة عندما يضم اليوم 3 مباريات فأكثر:
 * اسم الدور + التاريخ وعدد المباريات + عدّاد تنازلي مشترك (توقيت الانطلاق واحد
 * غالبًا)، وتتحوّل لمؤشّر مباشر عند انطلاق المباريات.
 */
function MatchdayBlock({ matchday, theme, stale = false }: { matchday: CupMatchday; theme: CupStripTheme; stale?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0 text-center" data-testid="cup-matchday-block">
      <p className="text-lg font-black text-white leading-tight">
        {matchday.round ?? "جولة البطولة"}
      </p>
      <p className={`text-[11px] ${theme.soft}`}>
        {formatKickoffDay(matchday.date)} · {matchday.count} {matchday.count === 2 ? "مباراتان" : "مباريات"}
        {matchday.sameKickoff && matchday.nextKickoffTs != null && (
          <> · تنطلق جميعها {formatKickoffTime(new Date(matchday.nextKickoffTs * 1000).toISOString())}</>
        )}
      </p>
      {stale ? <p className={`text-[11px] ${theme.soft}`}>حالة الجولة حسب آخر تحديث متاح</p> : matchday.liveCount > 0 ? (
        <p className="flex items-center gap-1.5 text-sm font-bold text-red-300">
          <Radio className="h-3.5 w-3.5 animate-pulse" />
          {matchday.liveCount === 1 ? "مباراة تجري الآن" : `${matchday.liveCount} مباريات تجري الآن`}
          {matchday.finishedCount > 0 && (
            <span className={`font-semibold ${theme.soft}`}>· انتهت {matchday.finishedCount}</span>
          )}
        </p>
      ) : matchday.nextKickoffTs != null ? (
        <CountdownChipsRow timestamp={matchday.nextKickoffTs} soft={theme.soft} />
      ) : null}
    </div>
  );
}

/**
 * كتلة «ما قبل الموسم» — عدّاد انطلاق الموسم بشرائح + سطر مباراة الافتتاح.
 * تُستخدم لدوري روشن (وأي بطولة موسمية قادمة) قبل أول جولة.
 */
function PreSeasonBlock({ preSeason, theme }: { preSeason: CupPreSeason; theme: CupStripTheme }) {
  const opener = preSeason.opener ?? null;
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0 text-center" data-testid="cup-preseason-block">
      <p className="text-lg font-black text-white leading-tight">{preSeason.label}</p>
      {preSeason.dateLabel && <p className={`text-[11px] ${theme.soft}`}>{preSeason.dateLabel}</p>}
      {preSeason.kickoffTs != null ? (
        <CountdownChipsRow timestamp={preSeason.kickoffTs} soft={theme.soft} />
      ) : (
        <p className={`text-[11px] font-bold ${theme.soft}`}>جدول الموسم يُعلن قريبًا</p>
      )}
      {opener && (
        <p className={`flex items-center gap-1.5 text-[11px] ${theme.soft}`}>
          الافتتاح:
          <img src={opener.home.logo} alt={opener.home.name} className="h-4 w-4 rounded-full bg-white p-px object-contain" loading="lazy" />
          <b className="text-white">{opener.home.name}</b>
          ×
          <b className="text-white">{opener.away.name}</b>
          <img src={opener.away.logo} alt={opener.away.name} className="h-4 w-4 rounded-full bg-white p-px object-contain" loading="lazy" />
        </p>
      )}
    </div>
  );
}

function TeamChip({ team }: { team: CupTeam }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="h-9 w-9 shrink-0 rounded-full bg-white p-1 ring-2 ring-white/15 shadow">
        <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
      </span>
      <span className="text-sm font-extrabold text-white truncate">{team.name}</span>
    </div>
  );
}

function MatchBlock({ fixture, theme, stale = false }: { fixture: CupFixture; theme: CupStripTheme; stale?: boolean }) {
  const started = fixture.status.live || fixture.status.finished;
  return (
    <div className="flex items-center justify-center gap-3 sm:gap-5 min-w-0">
      <TeamChip team={fixture.home} />

      <div className="flex flex-col items-center gap-0.5 shrink-0">
        {started ? (
          <>
            {/* المضيف معروض يمينًا في RTL — الضيف أولًا داخل LTR */}
            <span className="text-2xl font-black text-white tabular-nums leading-none" dir="ltr">
              {fixture.goals.away ?? 0} - {fixture.goals.home ?? 0}
            </span>
            <Badge
              className={
                fixture.status.live && !stale
                  ? "bg-red-500 text-white border-0 gap-1 text-[10px] px-2 py-0"
                  : "bg-white/10 text-white/85 border-0 text-[10px] px-2 py-0"
              }
            >
              {fixture.status.live && !stale && <Radio className="h-2.5 w-2.5 animate-pulse" />}
              {stale ? "آخر نتيجة متاحة" : fixture.status.live && fixture.status.elapsed != null
                ? `${fixture.status.label} · ${fixture.status.elapsed}'`
                : fixture.status.label}
            </Badge>
          </>
        ) : (
          <>
            <span className="text-xl font-black text-white leading-none">
              {formatKickoffTime(fixture.date)}
            </span>
            <span className={`text-[10px] ${theme.soft}`}>{formatKickoffDay(fixture.date)}</span>
            {!stale && <TickingCountdown timestamp={fixture.timestamp} accent={theme.accent} soft={theme.soft} />}
          </>
        )}
      </div>

      <TeamChip team={fixture.away} />
    </div>
  );
}

// بطاقة البطل — تحل محل مربع المباراة بعد حسم النهائي. سطر النتيجة بصيغة
// «فاز على {الوصيف} W-L» الموحّدة (الفائز أولًا من الخادم فلا انقلاب في RTL).
function ChampionBlock({
  champion,
  championLabel,
  theme,
}: {
  champion: CupChampion;
  championLabel: string;
  theme: CupStripTheme;
}) {
  return (
    <div className="flex items-center justify-center gap-4 min-w-0" data-testid="cup-champion-block">
      <span className="relative h-14 w-14 shrink-0 rounded-full bg-white p-1.5 ring-2 ring-amber-300/70 shadow-lg">
        <img
          src={champion.team.logo}
          alt={champion.team.name}
          className="h-full w-full object-contain"
          loading="lazy"
        />
        <Trophy className="absolute -bottom-1 -left-1 h-5 w-5 text-amber-300 drop-shadow" />
      </span>
      <div className="text-right min-w-0">
        <p className="text-[11px] font-bold text-amber-300/90 leading-tight">🏆 {championLabel}</p>
        <p className="text-2xl font-black text-white leading-tight truncate">{champion.team.name}</p>
        {champion.runnerUp && champion.score && (
          <p className={`text-[11px] ${theme.soft}`}>
            فاز على {champion.runnerUp.name} في النهائي{" "}
            <span dir="ltr" className={`font-black tabular-nums ${theme.accent}`}>
              {champion.score}
            </span>
            {champion.penalties && (
              <>
                {" "}
                (بركلات الترجيح{" "}
                <span dir="ltr" className={`font-black tabular-nums ${theme.accent}`}>
                  {champion.penalties}
                </span>
                )
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

export default function CupHomeStrip({
  staleUpdatedAt,
  title,
  subtitle,
  championSubtitle,
  championLabel,
  href,
  ctaLabel,
  theme,
  fixture,
  champion,
  matchday,
  preSeason,
  emblemSrc,
  emblemAlt,
}: CupHomeStripProps) {
  if (!fixture && !champion && !preSeason) return null;
  // 3 مباريات فأكثر في اليوم = إبراز مباراة واحدة اعتباطي — نعرض عدّاد الجولة
  const preSeasonMode = !champion && !!preSeason;
  const matchdayMode = !champion && !preSeasonMode && !!matchday && matchday.count >= 3;

  return (
    <div className={`border-y py-8 ${theme.band}`}>
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <section
          dir="rtl"
          aria-label={`تغطية ${title}`}
          className={`relative overflow-hidden rounded-3xl shadow-lg ring-1 ${theme.card} ${theme.ring}`}
        >
          {/* ملمس الملعب + وهج الكشافات (ذهبي احتفالي مع البطل) */}
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, rgba(255,255,255,0.6) 0 70px, transparent 70px 140px)",
            }}
          />
          <div
            className={`absolute -top-20 -right-16 h-48 w-48 rounded-full blur-3xl ${
              champion ? "bg-amber-300/20" : "bg-white/10"
            }`}
          />
          <div className="absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-white/5 blur-3xl" />

          <div className="relative flex flex-col md:flex-row items-center gap-4 md:gap-6 px-4 sm:px-6 py-4">
            {/* هوية البطولة */}
            <Link href={href}>
              <span className="flex items-center gap-3 cursor-pointer group">
                {emblemSrc ? (
                  // الشعار الرسمي على رقعة بيضاء — نص الهوية الداكن يحتاج خلفية فاتحة
                  <span className="rounded-xl bg-white p-1.5 shadow-lg shrink-0">
                    <img
                      src={emblemSrc}
                      alt={emblemAlt ?? title}
                      className="h-11 w-auto object-contain"
                      loading="lazy"
                    />
                  </span>
                ) : (
                  <span className="rounded-xl bg-white/10 ring-1 ring-white/20 p-2.5 shadow-lg shrink-0">
                    <Trophy className="h-8 w-8 text-amber-300" />
                  </span>
                )}
                <span className="text-right">
                  <span className="block text-lg font-black text-white leading-tight group-hover:text-amber-200 transition-colors">
                    {title}
                  </span>
                  <span className={`block text-[11px] ${theme.soft}`}>
                    {champion ? championSubtitle : subtitle}
                  </span>
                </span>
              </span>
            </Link>

            <div className="hidden md:block h-12 w-px bg-white/10 shrink-0" />

            {/* البطل — وإلا عدّاد ما قبل الموسم — وإلا عدّاد الجولة — وإلا المباراة القادمة/الحية */}
            <div className="flex-1 flex flex-wrap items-center justify-center gap-3 sm:gap-6 min-w-0">
              {champion ? (
                <ChampionBlock champion={champion} championLabel={championLabel} theme={theme} />
              ) : preSeasonMode ? (
                <PreSeasonBlock preSeason={preSeason!} theme={theme} />
              ) : matchdayMode ? (
                <MatchdayBlock matchday={matchday!} theme={theme} stale={!!staleUpdatedAt} />
              ) : (
                fixture && <MatchBlock fixture={fixture} theme={theme} stale={!!staleUpdatedAt} />
              )}
            </div>

            {/* الدعوة للقسم */}
            <Link href={href} className="shrink-0">
              <Button className={`font-bold rounded-full gap-1 px-5 ${theme.cta}`}>
                {ctaLabel}
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          {staleUpdatedAt && <p role="status" className={`relative px-4 pb-3 text-center text-xs ${theme.soft}`}>{sportsLastFetchLabel(staleUpdatedAt)}</p>}
        </section>
      </div>
    </div>
  );
}
