import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Sparkles, UsersRound } from "lucide-react";
import gulfCupLogoHorizontal from "@assets/gulf-cup-27-logo-horizontal.svg";
import type { GcFixture, GcOverview, GcScorersBoard, GcStarPlayer } from "./gcTypes";

/**
 * شريط تنقّل لاصق تحت هيدر سبق (ومسار التصنيفات على سطح المكتب):
 * الأقسام الظاهرة فقط + التوقعات والمجلس.
 */

type Section = { id: string; label: string };

export function GcSectionNav({
  overview,
  fixtures,
}: {
  overview: GcOverview | undefined;
  fixtures: GcFixture[];
}) {
  const { data: starsData } = useQuery<{ stars: GcStarPlayer[] }>({
    queryKey: ["/api/gulf-cup/stars"],
    staleTime: 30 * 60_000,
  });
  const { data: scorersData } = useQuery<GcScorersBoard>({
    queryKey: ["/api/gulf-cup/scorers"],
    staleTime: 5 * 60_000,
  });

  const hasStars = (starsData?.stars ?? []).length > 0;
  const hasScorers =
    (scorersData?.scorers ?? []).some((s) => s.goals > 0) ||
    (scorersData?.assists ?? []).some((s) => s.assists > 0);
  const hasKnockout = fixtures.some((f) => {
    const round = (f.roundEn ?? "").toLowerCase();
    return round.includes("semi") || round.trim().startsWith("final");
  });
  const hasVenues = (overview?.venues?.length ?? 0) > 0;

  const sections: Section[] = [
    overview?.saudi?.team ? { id: "gc-saudi", label: "الأخضر" } : null,
    { id: "gc-schedule", label: "المباريات" },
    { id: "gc-groups", label: "المجموعات" },
    hasKnockout ? { id: "gc-knockout", label: "الطريق إلى اللقب" } : null,
    hasScorers ? { id: "gc-scorers", label: "الهدّافون" } : null,
    hasStars ? { id: "gc-stars", label: "النجوم" } : null,
    { id: "gc-history", label: "سجلّ البطولة" },
    { id: "gc-teams", label: "المنتخبات" },
    hasVenues ? { id: "gc-venues", label: "دليل الحضور" } : null,
  ].filter((s): s is Section => Boolean(s));

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      dir="rtl"
      aria-label="أقسام صفحة خليجي 27"
      className="sticky z-40 border-b border-white/10 bg-[#041C22]/95 backdrop-blur-md supports-[backdrop-filter]:bg-[#041C22]/90 top-[var(--public-header-height,4rem)] md:top-[calc(var(--public-header-height,4rem)+2.75rem)]"
    >
      <div className="container mx-auto flex max-w-6xl items-center gap-0.5 overflow-x-auto px-4 py-2.5 sm:px-6 lg:px-8">
        <span className="ml-1.5 hidden shrink-0 rounded-lg bg-white px-1.5 py-1 shadow-sm sm:block">
          <img
            src={gulfCupLogoHorizontal}
            alt="خليجي 27"
            className="h-5 w-auto object-contain"
            loading="lazy"
          />
        </span>
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => jump(s.id)}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold text-sky-100/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            {s.label}
          </button>
        ))}
        <span className="mx-1.5 h-4 w-px shrink-0 bg-white/15" />
        <Link
          href="/gulf-cup/predictions"
          className="flex shrink-0 items-center gap-1 rounded-full bg-sky-300 px-4 py-1.5 text-[13px] font-black text-sky-950 transition-colors hover:bg-sky-200"
        >
          <Sparkles className="h-3.5 w-3.5" />
          توقّع واربح
        </Link>
        <Link
          href="/gulf-cup/majlis"
          className="flex shrink-0 items-center gap-1 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-[13px] font-bold text-sky-100 transition-colors hover:bg-white/10"
        >
          <UsersRound className="h-3.5 w-3.5" />
          المجلس
        </Link>
      </div>
    </nav>
  );
}
