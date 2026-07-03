import { Fragment } from "react";
import { Link } from "wouter";
import { Trophy, Goal, Crown } from "lucide-react";

/**
 * تنقّل سريع فوق شريط المونديال في الصفحة الرئيسية — يقود مباشرة إلى
 * تبويبات توقّعات المونديال (البطل / مباراة اليوم / المتصدّرون).
 * لا يُضاف كبانر مستقل: يعيش داخل WorldCupHomeSection فيظهر ويختفي معه
 * تلقائيًا — لا وجود دائم حين لا توجد مباراة أو أخبار مونديال.
 *
 * نسختان بحسب المساحة: شريط واحد خفيف (chips) تحت md، وبطاقات ناعمة
 * من md فأعلى — نفس عتبة "الهاتف" المستخدمة في AppDownloadBanner (768px).
 */

interface StoryItem {
  key: string;
  href: string;
  label: string;
  icon: typeof Trophy;
  live?: boolean;
}

function LiveDot({ size = "h-3 w-3" }: { size?: string }) {
  return (
    <span className={`absolute -top-0.5 -left-0.5 flex ${size}`}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
      <span className={`relative inline-flex ${size} rounded-full bg-red-500 ring-2 ring-white dark:ring-emerald-950`} />
    </span>
  );
}

export default function WorldCupStoriesRow({ isLive = false }: { isLive?: boolean }) {
  const items: StoryItem[] = [
    { key: "champion", href: "/world-cup/predictions?tab=tournament", label: "توقّع البطل", icon: Trophy },
    { key: "today", href: "/world-cup/predictions?tab=today", label: "مباراة اليوم", icon: Goal, live: isLive },
    { key: "leaders", href: "/world-cup/predictions?tab=leaders", label: "المتصدّرون", icon: Crown },
  ];

  return (
    <div dir="rtl" data-testid="wc-stories-row">
      {/* الهاتف: شريط واحد خفيف بلا بطاقات منفصلة — لا يأخذ مساحة */}
      <div className="flex items-stretch justify-between rounded-full border border-emerald-600/10 bg-white/80 px-1 py-1 dark:border-emerald-400/10 dark:bg-emerald-950/30 md:hidden">
        {items.map(({ key, href, label, icon: Icon, live }, i) => (
          <Fragment key={key}>
            {i > 0 && (
              <span
                className="my-1.5 w-px shrink-0 bg-emerald-600/10 dark:bg-emerald-400/10"
                aria-hidden="true"
              />
            )}
            <Link
              href={href}
              className="relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 transition active:bg-emerald-100 dark:active:bg-emerald-900/50"
              data-testid={`wc-story-mobile-${key}`}
            >
              <span className="relative shrink-0">
                <Icon className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                {live && <LiveDot size="h-2 w-2" />}
              </span>
              <span className="truncate text-[11px] font-bold text-foreground">{label}</span>
            </Link>
          </Fragment>
        ))}
      </div>

      {/* من md فأعلى: بطاقات ناعمة */}
      <div className="hidden grid-cols-3 gap-3 md:grid">
        {items.map(({ key, href, label, icon: Icon, live }) => (
          <Link
            key={key}
            href={href}
            className="group relative flex flex-col items-center gap-2 rounded-2xl border border-emerald-600/10 dark:border-emerald-400/10 bg-white/80 dark:bg-emerald-950/30 px-3 py-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md dark:hover:bg-emerald-950/50"
            data-testid={`wc-story-${key}`}
          >
            <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 transition group-hover:bg-emerald-200 dark:bg-emerald-900/50 dark:group-hover:bg-emerald-900/80">
              <Icon className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
              {live && <LiveDot />}
            </span>
            <span className="text-xs font-bold text-foreground sm:text-sm">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
