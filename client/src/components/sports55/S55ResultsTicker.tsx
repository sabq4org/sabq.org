import { History } from "lucide-react";
import { useLocation } from "wouter";
import type { RslFixture } from "@/components/rsl/rslTypes";
import { S55Crest } from "./S55Crest";
import { score } from "./matchUtils";

/** شريط أحدث النتائج */
export function S55ResultsTicker({ results }: { results: RslFixture[] }) {
  const [, navigate] = useLocation();
  if (results.length === 0) return null;
  return (
    <div className="ticker">
      <div className="wrap">
        <span className="tklbl">
          <History size={16} /> أحدث النتائج
        </span>
        <div className="tklist">
          {results.slice(0, 12).map((fx) => (
            <a
              key={fx.id}
              href={`/sports/match/${fx.id}`}
              className="tkchip"
              onClick={(e) => {
                e.preventDefault();
                navigate(`/sports/match/${fx.id}`);
              }}
            >
              <S55Crest team={fx.home} size="mini" />
              {fx.home.name}
              <span className="res">
                {score(fx.goals.home)}-{score(fx.goals.away)}
              </span>
              {fx.away.name}
              <S55Crest team={fx.away} size="mini" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
