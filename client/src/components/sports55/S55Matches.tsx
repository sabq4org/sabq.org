import { useState } from "react";
import type { RslMatchBuckets } from "@/components/rsl/RslMatches";
import type { RslFixture } from "@/components/rsl/rslTypes";
import { S55MatchCard } from "./S55MatchCard";

type TabKey = "live" | "today" | "upcoming" | "results";

const TABS: { key: TabKey; label: string }[] = [
  { key: "live", label: "مباشر" },
  { key: "today", label: "اليوم" },
  { key: "upcoming", label: "القادمة" },
  { key: "results", label: "النتائج" },
];

/** قسم المباريات بتبويبات — بنفس شبكة «سعودي سبورت» */
export function S55Matches({
  buckets,
  isLoading,
}: {
  buckets: RslMatchBuckets;
  isLoading: boolean;
}) {
  const defaultTab: TabKey =
    buckets.live.length > 0 ? "live" : buckets.today.length > 0 ? "today" : "upcoming";
  const [tab, setTab] = useState<TabKey>(defaultTab);
  const items: RslFixture[] = buckets[tab];

  return (
    <>
      <div className="section-title">
        <h2>المباريات</h2>
      </div>
      <div className="tabs" role="tablist" aria-label="تبويبات المباريات">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? "on" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {buckets[t.key].length > 0 ? <span className="cnt">{buckets[t.key].length}</span> : null}
          </button>
        ))}
      </div>
      <div className="ngrid">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mcard sk" style={{ height: 132 }} />
          ))
        ) : items.length > 0 ? (
          items.map((fx) => <S55MatchCard key={fx.id} fx={fx} />)
        ) : (
          <p className="empty">لا توجد مباريات في هذا التبويب حاليًا.</p>
        )}
      </div>
    </>
  );
}
