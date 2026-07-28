/**
 * /sports55 — بوابة رياضية بستايل «سعودي سبورت» (so3ody) مربوطة بمباريات
 * دوري روشن السعودي الحقيقية عبر /api/rsl/hero و/api/sports/pro-league/*.
 * منظومة تصميم معزولة تحت .sp55 (sports55.css) لا تتعارض مع بقية سبق.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RslMatchBuckets } from "@/components/rsl/RslMatches";
import {
  RSL_SLUG,
  type RslHero,
  type RslFixture,
  type RslStandingRow,
  type RslScorer,
} from "@/components/rsl/rslTypes";
import { S55UtilityBar } from "@/components/sports55/S55UtilityBar";
import { S55Header } from "@/components/sports55/S55Header";
import { S55BreakingTicker } from "@/components/sports55/S55BreakingTicker";
import { S55LiveStrip } from "@/components/sports55/S55LiveStrip";
import { S55BigMatch } from "@/components/sports55/S55BigMatch";
import { S55MatchCard } from "@/components/sports55/S55MatchCard";
import { S55Matches } from "@/components/sports55/S55Matches";
import { S55StandingsFull } from "@/components/sports55/S55StandingsFull";
import { S55Scorers } from "@/components/sports55/S55Scorers";
import { S55Sidebar } from "@/components/sports55/S55Sidebar";
import { S55ResultsTicker } from "@/components/sports55/S55ResultsTicker";
import { S55Footer } from "@/components/sports55/S55Footer";
import "./sports55.css";

const asArray = <T,>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v : []);

function dedupe(fixtures: RslFixture[]): RslFixture[] {
  const seen = new Set<number>();
  return fixtures.filter((fx) => {
    if (seen.has(fx.id)) return false;
    seen.add(fx.id);
    return true;
  });
}

export default function Sports55() {
  useEffect(() => {
    document.title = "البوابة الرياضية — دوري روشن السعودي | سبق";
  }, []);

  const { data: hero } = useQuery<RslHero>({ queryKey: ["/api/rsl/hero"] });

  const { data: matchesData, isLoading: matchesLoading } = useQuery<
    { configured: boolean } & RslMatchBuckets
  >({ queryKey: [`/api/sports/${RSL_SLUG}/matches`] });

  const { data: standingsData, isLoading: standingsLoading } = useQuery<{
    standings: RslStandingRow[];
  }>({ queryKey: [`/api/sports/${RSL_SLUG}/standings`] });

  const { data: scorersData, isLoading: scorersLoading } = useQuery<{ scorers: RslScorer[] }>({
    queryKey: [`/api/sports/${RSL_SLUG}/scorers`],
  });

  const live = asArray(matchesData?.live);
  const today = asArray(matchesData?.today);
  const upcoming = asArray(matchesData?.upcoming);
  const results = asArray(matchesData?.results);
  const standings = asArray(standingsData?.standings);
  const scorers = asArray(scorersData?.scorers);

  const stripFixtures = dedupe([...live, ...today, ...upcoming]).slice(0, 14);
  const buckets: RslMatchBuckets = { live, today, upcoming, results };

  const big: RslFixture | null =
    live[0] ?? hero?.nextMatch ?? upcoming[0] ?? today[0] ?? results[0] ?? null;
  const secondary = dedupe([...upcoming, ...today, ...results])
    .filter((fx) => fx.id !== big?.id)
    .slice(0, 2);

  const todaySide = dedupe([...live, ...today]);
  const breakingFixtures = dedupe([...live, ...today, ...upcoming]);

  return (
    <div className="sp55">
      <S55UtilityBar liveCount={live.length} />
      <S55Header />
      <S55BreakingTicker fixtures={breakingFixtures} />
      <S55LiveStrip fixtures={stripFixtures} isLoading={matchesLoading} />

      <div className="wrap">
        <div className="layout">
          <main>
            <div className="hero-feat">
              {big ? (
                <S55BigMatch fx={big} />
              ) : (
                <div className="bigmatch" style={{ minHeight: 200 }} />
              )}
              <div className="stack-col">
                {secondary.map((fx) => (
                  <S55MatchCard key={fx.id} fx={fx} />
                ))}
              </div>
            </div>

            <S55Matches buckets={buckets} isLoading={matchesLoading} />
            <S55StandingsFull rows={standings} isLoading={standingsLoading} />
            <S55Scorers scorers={scorers} isLoading={scorersLoading} />
          </main>

          <S55Sidebar
            today={todaySide}
            standings={standings}
            scorers={scorers}
            predictionsEnabled={hero?.predictionsEnabled ?? false}
          />
        </div>
      </div>

      <S55ResultsTicker results={results} />
      <S55Footer />
    </div>
  );
}
