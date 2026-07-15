import { Fragment } from "react";
import { Link } from "wouter";
import { Trophy, Goal, Target } from "lucide-react";
import type { WcFixture, WcPrediction, WcStoriesTeaser } from "./wcTypes";

/**
 * تنقّل سريع فوق شريط المونديال في الصفحة الرئيسية — يقود مباشرة إلى
 * تبويبات توقّعات المونديال (البطل / مباراة اليوم / الهدّاف).
 * يعرض نسب الجمهور تحت البطل والهدّاف، وتوقّعات خوارزمية صغيرة لمباراة اليوم،
 * مع ملاحظة خروج مرشّح بارز (مثل فرنسا) رغم ارتفاع نسبة ترشيحه.
 */

function LiveDot({ size = "h-3 w-3" }: { size?: string }) {
  return (
    <span className={`absolute -top-0.5 -left-0.5 flex ${size}`}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
      <span className={`relative inline-flex ${size} rounded-full bg-red-500 ring-2 ring-white dark:ring-emerald-950`} />
    </span>
  );
}

function pctParts(prediction: WcPrediction) {
  const total = prediction.home + prediction.draw + prediction.away || 100;
  const p = (v: number) => Math.round((v / total) * 100);
  return { home: p(prediction.home), draw: p(prediction.draw), away: p(prediction.away) };
}

export default function WorldCupStoriesRow({
  isLive = false,
  teaser = null,
  matchFixture = null,
  matchPrediction = null,
}: {
  isLive?: boolean;
  teaser?: WcStoriesTeaser | null;
  matchFixture?: WcFixture | null;
  matchPrediction?: WcPrediction | null;
}) {
  const odds = matchPrediction && matchFixture ? pctParts(matchPrediction) : null;
  const champs = teaser?.champions ?? [];
  const elimNote = teaser?.eliminatedNote ?? null;
  const scorer = teaser?.topScorer ?? null;

  const championSub =
    champs.length > 0
      ? champs.map((c) => `${c.name} ${c.pct.toLocaleString("en-US")}%`).join(" · ")
      : null;

  const matchSub = odds && matchFixture
    ? `${matchFixture.home.name} ${odds.home}% · تعادل ${odds.draw}% · ${matchFixture.away.name} ${odds.away}%`
    : null;

  const scorerSub = scorer
    ? `${scorer.name} ${scorer.pct.toLocaleString("en-US")}%`
    : null;

  const roundEn = (matchFixture?.roundEn ?? "").trim();
  const isFinalCard =
    roundEn === "Final" || (roundEn.startsWith("Final") && !roundEn.startsWith("3rd"));

  const items = [
    {
      key: "champion",
      href: "/world-cup/predictions?tab=tournament",
      label: "توقّع البطل",
      icon: Trophy,
      sub: championSub,
      note: elimNote
        ? `خرجت ${elimNote.name} رغم ترشيح ${elimNote.pct.toLocaleString("en-US")}% من المتوقّعين`
        : null,
    },
    {
      key: "today",
      href: "/world-cup/predictions?tab=today",
      label: isFinalCard ? "النهائي" : "مباراة اليوم",
      icon: Goal,
      live: isLive,
      sub: matchSub,
      note: odds ? "توقّعات للاستئناس" : null,
    },
    {
      key: "scorer",
      href: "/world-cup/predictions?tab=tournament#wc-long-scorer",
      label: "الهدّاف",
      icon: Target,
      sub: scorerSub,
      note: null as string | null,
    },
  ];

  return (
    <div dir="rtl" data-testid="wc-stories-row">
      {/* الهاتف: شريط مضغوط مع نسب صغيرة تحت التسمية */}
      <div className="flex items-stretch justify-between rounded-2xl border border-emerald-600/10 bg-white/80 px-1 py-1.5 dark:border-emerald-400/10 dark:bg-emerald-950/30 md:hidden">
        {items.map(({ key, href, label, icon: Icon, live, sub }, i) => (
          <Fragment key={key}>
            {i > 0 && (
              <span
                className="my-1.5 w-px shrink-0 bg-emerald-600/10 dark:bg-emerald-400/10"
                aria-hidden="true"
              />
            )}
            <Link
              href={href}
              className="relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition active:bg-emerald-100 dark:active:bg-emerald-900/50"
              data-testid={`wc-story-mobile-${key}`}
            >
              <span className="relative flex items-center gap-1">
                <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
                {live && <LiveDot size="h-2 w-2" />}
                <span className="truncate text-[11px] font-bold text-foreground">{label}</span>
              </span>
              {sub && (
                <span className="line-clamp-2 max-w-full px-0.5 text-center text-[9px] leading-tight text-muted-foreground">
                  {sub}
                </span>
              )}
            </Link>
          </Fragment>
        ))}
      </div>

      {/* من md فأعلى: بطاقات مع نسب وملاحظات */}
      <div className="hidden grid-cols-3 gap-3 md:grid">
        {items.map(({ key, href, label, icon: Icon, live, sub, note }) => (
          <Link
            key={key}
            href={href}
            className="group relative flex flex-col items-center gap-1.5 rounded-2xl border border-emerald-600/10 bg-white/80 px-3 py-3.5 text-center shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md dark:border-emerald-400/10 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50"
            data-testid={`wc-story-${key}`}
          >
            <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 transition group-hover:bg-emerald-200 dark:bg-emerald-900/50 dark:group-hover:bg-emerald-900/80">
              <Icon className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
              {live && <LiveDot />}
            </span>
            <span className="text-xs font-bold text-foreground sm:text-sm">{label}</span>
            {sub && (
              <p
                className="line-clamp-2 text-[10px] leading-snug text-muted-foreground"
                data-testid={`wc-story-sub-${key}`}
              >
                {sub}
              </p>
            )}
            {note && (
              <p
                className={
                  key === "champion"
                    ? "line-clamp-2 text-[9px] leading-snug text-amber-700/90 dark:text-amber-400/90"
                    : "line-clamp-1 text-[9px] leading-snug text-muted-foreground/70"
                }
                data-testid={`wc-story-note-${key}`}
              >
                {note}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
