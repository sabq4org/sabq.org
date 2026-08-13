import type { SpCompetition } from "@/pages/SportsHub";

/** بطولة العلم السعودي في مركز مباريات `/sports`. */
export const FLAGSHIP_COMPETITION_SLUG = "pro-league";
/** احتياطي إن غاب روشن عن القائمة. */
export const FALLBACK_COMPETITION_SLUG = "kings-cup";

function categoryOf(c: SpCompetition): string {
  return c.category ?? "saudi";
}

/**
 * ديفولت مركز المباريات: الجارية السعودية أولًا (روشن إن كان جاريًا)،
 * وإلا روشن حتى لو قادم، وإلا كأس الملك. لا تُثبَّت بطولة «لم تبدأ بعد»
 * فوق دوري جارٍ.
 */
export function pickPortalDefaultCompetition(competitions: SpCompetition[]): string {
  if (competitions.length === 0) return FLAGSHIP_COMPETITION_SLUG;
  const saudi = competitions.filter((c) => categoryOf(c) === "saudi");
  const pool = saudi.length > 0 ? saudi : competitions;
  const ongoing = pool.filter((c) => c.status === "ongoing");
  return (
    ongoing.find((c) => c.slug === FLAGSHIP_COMPETITION_SLUG)?.slug ??
    ongoing[0]?.slug ??
    pool.find((c) => c.slug === FLAGSHIP_COMPETITION_SLUG)?.slug ??
    pool.find((c) => c.slug === FALLBACK_COMPETITION_SLUG)?.slug ??
    pool[0]!.slug
  );
}

/** ترتيب شرائح البطولة داخل الفئة: المختارة، ثم روشن الجاري، ثم بقية الجارية. */
export function competitionPortalRank(c: SpCompetition, selectedSlug: string): number {
  if (c.slug === selectedSlug) return -10;
  if (c.status === "ongoing" && c.slug === FLAGSHIP_COMPETITION_SLUG) return -5;
  if (c.status === "ongoing") return 0;
  if (c.status === "upcoming") return 1;
  if (c.status === "unknown") return 2;
  return 3;
}
