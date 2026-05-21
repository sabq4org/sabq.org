import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Clock, Moon } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";

/**
 * "صدى الحج" — homepage block that surfaces during the Hajj season.
 *
 * Renders ONLY when the backend `/api/hajj-block` returns
 * `isVisible: true` — that endpoint already gates on:
 *   - admin toggle (isActive)
 *   - season window (seasonStartDate ≤ now ≤ seasonEndDate)
 *
 * Visually distinct from a regular news block:
 *   - warm ivory→gold gradient background (calmer than the breaking-news red)
 *   - subtle pulsing crescent in the corner (motion-safe — respects
 *     prefers-reduced-motion)
 *   - each article carries an auto-derived hajj tag ("من عرفات", "في منى",
 *     etc.) above its title, served by the backend
 *   - "اليوم الحجي" + "آخر تحديث" pills in the header
 *
 * The block is intentionally compact (5 articles default) so it acts as
 * a spiritual sidebar rather than a competing news rail.
 */
export function HajjBlock() {
  const { data } = useQuery<HajjBlockResponse>({
    queryKey: ["/api/hajj-block"],
    queryFn: async () => {
      const res = await fetch("/api/hajj-block");
      if (!res.ok) return { isVisible: false };
      return res.json();
    },
    // Refresh every 5 minutes so the "آخر تحديث" pill stays honest and
    // new pinned articles surface without a hard reload.
    refetchInterval: 5 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });

  if (!data?.isVisible) return null;

  return (
    <section
      dir="rtl"
      className="relative overflow-hidden rounded-2xl my-6 px-5 py-6 md:px-7 md:py-8 [background:linear-gradient(135deg,#F8F4EB_0%,#EDE4D3_60%,#E2D3B0_100%)] dark:[background:linear-gradient(135deg,#24242A_0%,#1F1F23_60%,#1A1A1E_100%)]"
      data-testid="block-hajj"
    >
      {/* Decorative crescent — fades in/out gently via CSS keyframes.
          motion-safe ensures users with reduce-motion preferences see
          a static crescent instead of the pulse. */}
      <Moon
        className="absolute top-4 left-4 h-12 w-12 text-amber-700/15 dark:text-amber-400/25 motion-safe:animate-pulse-slow pointer-events-none"
        strokeWidth={1.2}
      />
      {/* Subtle Kaaba silhouette in the far corner — kept low opacity so
          it reads as texture, not imagery. */}
      <div
        className="absolute bottom-0 right-0 h-32 w-32 opacity-[0.06] dark:opacity-[0.10] pointer-events-none"
        aria-hidden
      >
        <svg viewBox="0 0 100 100" className="w-full h-full text-amber-900 dark:text-amber-300">
          <rect x="22" y="30" width="56" height="50" fill="currentColor" />
          <rect x="22" y="30" width="56" height="8" fill="currentColor" opacity="0.5" />
        </svg>
      </div>

      <HajjBlockHeader
        title={data.title}
        subtitle={data.subtitle}
        hajjDay={data.hajjDay}
        daysToArafat={data.daysToArafat}
        hajjPhase={data.hajjPhase}
        lastUpdatedAt={data.lastUpdatedAt}
      />

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.articles.map((a) => (
          <HajjArticleCard key={a.id} article={a} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Header — title + Hajj-day strip + last-updated pill
// ---------------------------------------------------------------------------

function HajjBlockHeader({
  title, subtitle, hajjDay, daysToArafat, hajjPhase, lastUpdatedAt,
}: {
  title: string;
  subtitle?: string | null;
  hajjDay: number | null;
  daysToArafat: number | null;
  hajjPhase: string | null;
  lastUpdatedAt: string;
}) {
  return (
    <header className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl" aria-hidden>🕋</span>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-amber-950 dark:text-gray-100 leading-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs md:text-sm text-amber-900/70 dark:text-gray-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-800/80 dark:text-gray-300 bg-white/40 dark:bg-white/5 backdrop-blur-sm px-2.5 py-1 rounded-full"
          data-testid="hajj-last-updated"
        >
          <Clock className="h-3 w-3" />
          آخر تحديث {formatRelativeTime(lastUpdatedAt)}
        </span>
      </div>

      {/* Hajj-day strip: phases as inline chips. Current phase highlighted.
          Hidden entirely outside the ritual period. */}
      {hajjPhase && (
        <HajjDayStrip currentPhase={hajjPhase} daysToArafat={daysToArafat} hajjDay={hajjDay} />
      )}
    </header>
  );
}

const PHASES: Array<{ key: string; labelAr: string; hijriDay: number }> = [
  { key: "tarwiyah", labelAr: "التروية",  hijriDay: 8  },
  { key: "arafat",   labelAr: "عرفة",     hijriDay: 9  },
  { key: "nahr",     labelAr: "النحر",    hijriDay: 10 },
  { key: "tashreeq", labelAr: "التشريق",  hijriDay: 11 },
];

function HajjDayStrip({
  currentPhase, daysToArafat, hajjDay,
}: {
  currentPhase: string;
  daysToArafat: number | null;
  hajjDay: number | null;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1" data-testid="hajj-day-strip">
      {PHASES.map((p) => {
        const isCurrent = p.key === currentPhase;
        return (
          <span
            key={p.key}
            className={`inline-flex items-center gap-1.5 text-[11px] md:text-xs font-medium px-2.5 py-1 rounded-full transition ${
              isCurrent
                ? "bg-amber-700 dark:bg-amber-600 text-white shadow-sm"
                : "bg-white/40 dark:bg-white/5 text-amber-900/70 dark:text-gray-300"
            }`}
          >
            <span className="opacity-70">يوم</span>
            <span>{p.labelAr}</span>
            {isCurrent && hajjDay !== null && <span className="opacity-75">· {hajjDay} ذو الحجة</span>}
          </span>
        );
      })}
      {currentPhase === "before" && daysToArafat !== null && daysToArafat > 0 && (
        <span className="ms-auto inline-flex items-center text-[11px] md:text-xs font-bold text-amber-800 dark:text-amber-200 bg-white/60 dark:bg-white/10 px-3 py-1 rounded-full">
          {daysToArafat === 1
            ? "غدًا يوم عرفة"
            : `${daysToArafat} أيام حتى يوم عرفة`}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Article card — image right, hajjTag chip above title, soft border
// ---------------------------------------------------------------------------

function HajjArticleCard({ article }: { article: HajjArticle }) {
  return (
    <Link
      href={`/article/${article.slug ?? article.id}`}
      className="group flex gap-3 p-3 rounded-xl bg-white/55 dark:bg-white/5 backdrop-blur-sm border border-white/60 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/10 transition-colors"
      data-testid={`hajj-article-${article.id}`}
    >
      <div className="flex-1 min-w-0">
        <span
          className="inline-flex items-center gap-1 text-[10px] md:text-[11px] font-bold text-amber-800 dark:text-amber-200 bg-amber-200/60 dark:bg-amber-800/30 px-2 py-0.5 rounded-full mb-1.5"
          data-testid="hajj-tag"
        >
          <span aria-hidden>{article.hajjEmoji}</span>
          <span>{article.hajjTag}</span>
          {article.isPinned && (
            <span className="ms-1 text-[9px] text-amber-700/80 dark:text-amber-300/90 font-bold" aria-label="مثبتة">★</span>
          )}
        </span>
        <h3 className="text-sm md:text-[15px] font-bold text-amber-950 dark:text-gray-100 leading-snug line-clamp-2 group-hover:text-amber-900 dark:group-hover:text-gray-200">
          {article.title}
        </h3>
        {article.publishedAt && (
          <p className="text-[10px] md:text-xs text-amber-900/55 dark:text-gray-500 mt-1.5">
            {formatRelativeTime(article.publishedAt)}
          </p>
        )}
      </div>

      {article.imageUrl ? (
        <div className="w-20 h-20 md:w-24 md:h-24 shrink-0 rounded-lg overflow-hidden">
          <img
            src={article.imageUrl}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-20 h-20 md:w-24 md:h-24 shrink-0 rounded-lg bg-amber-100 dark:bg-amber-900/25 grid place-items-center">
          <span className="text-2xl opacity-50" aria-hidden>🕋</span>
        </div>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HajjArticle = {
  id: string;
  title: string;
  slug: string | null;
  excerpt: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  isBreaking: boolean;
  isPinned: boolean;
  hajjTag: string;
  hajjEmoji: string;
};

type HajjBlockResponse =
  | {
      isVisible: true;
      title: string;
      subtitle: string | null;
      articles: HajjArticle[];
      hajjDay: number | null;
      daysToArafat: number | null;
      hajjPhase: string | null;
      lastUpdatedAt: string;
    }
  | { isVisible: false; reason?: string };
