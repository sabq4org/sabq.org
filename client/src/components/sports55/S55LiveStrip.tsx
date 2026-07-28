import { Radio } from "lucide-react";
import { useLocation } from "wouter";
import type { RslFixture } from "@/components/rsl/rslTypes";
import { S55MatchCard } from "./S55MatchCard";

/** شريط أفقي لمباريات دوري روشن (مباشر + اليوم + القادمة) */
export function S55LiveStrip({
  fixtures,
  isLoading,
}: {
  fixtures: RslFixture[];
  isLoading: boolean;
}) {
  const [, navigate] = useLocation();
  return (
    <div className="livewrap">
      <div className="wrap">
        <div className="strip-head">
          <h2>
            <Radio size={16} /> مباريات دوري روشن <span className="tag">مباشر</span>
          </h2>
          <a
            href="/sports/matches"
            onClick={(e) => {
              e.preventDefault();
              navigate("/sports/matches");
            }}
          >
            كل المباريات ←
          </a>
        </div>
        <div className="livestrip">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="mcard sk" style={{ height: 132 }} />
              ))
            : fixtures.length > 0
              ? fixtures.map((fx) => <S55MatchCard key={fx.id} fx={fx} />)
              : <p className="empty" style={{ padding: 24 }}>لا توجد مباريات مجدولة حاليًا.</p>}
        </div>
      </div>
    </div>
  );
}
