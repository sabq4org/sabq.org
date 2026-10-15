import { describe, expect, it } from "vitest";
import {
  FLAGSHIP_COMPETITION_SLUG,
  pickPortalDefaultCompetition,
} from "@/components/sports/pickPortalDefaultCompetition";
import type { SpCompetition } from "@/pages/SportsHub";

function comp(over: Partial<SpCompetition> & Pick<SpCompetition, "slug" | "status">): SpCompetition {
  return {
    name: over.slug,
    type: "league",
    hasStandings: true,
    hasScorers: true,
    hasStats: true,
    category: "saudi",
    ...over,
  };
}

describe("pickPortalDefaultCompetition", () => {
  it("يختار روشن عندما يكون جاريًا حتى لو كأس الملك في القائمة", () => {
    expect(
      pickPortalDefaultCompetition([
        comp({ slug: "kings-cup", type: "cup", status: "upcoming", hasStandings: false }),
        comp({ slug: "pro-league", status: "ongoing" }),
      ]),
    ).toBe(FLAGSHIP_COMPETITION_SLUG);
  });

  it("لا يثبّت كأس الملك القادم فوق روشن الجاري", () => {
    expect(
      pickPortalDefaultCompetition([
        comp({ slug: "kings-cup", type: "cup", status: "upcoming", hasStandings: false, start: "2026-08-16" }),
        comp({ slug: "pro-league", status: "ongoing", start: "2026-08-13" }),
        comp({ slug: "division-1", status: "upcoming", start: "2026-08-21" }),
      ]),
    ).toBe("pro-league");
  });

  it("يسقط إلى كأس الملك إن كان الجاري الوحيد في الفئة السعودية", () => {
    expect(
      pickPortalDefaultCompetition([
        comp({ slug: "pro-league", status: "finished" }),
        comp({ slug: "kings-cup", type: "cup", status: "ongoing", hasStandings: false }),
      ]),
    ).toBe("kings-cup");
  });

  it("يفضّل روشن حتى وهو قادم إن لم تبدأ أي بطولة سعودية", () => {
    expect(
      pickPortalDefaultCompetition([
        comp({ slug: "kings-cup", type: "cup", status: "upcoming", hasStandings: false }),
        comp({ slug: "pro-league", status: "upcoming" }),
      ]),
    ).toBe("pro-league");
  });
});
