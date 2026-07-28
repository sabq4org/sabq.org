import { useLocation } from "wouter";

const dateLabel = () => {
  try {
    return new Intl.DateTimeFormat("ar", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      calendar: "gregory",
      numberingSystem: "latn",
    }).format(new Date());
  } catch {
    return "";
  }
};

export function S55UtilityBar({ liveCount }: { liveCount: number }) {
  const [, navigate] = useLocation();
  return (
    <div className="ubar">
      <div className="wrap">
        <div className="ubar-l">
          <span className="date">{dateLabel()}</span>
          {liveCount > 0 ? (
            <>
              <span className="sep" />
              <span className="pill-live">
                <span className="d" />
                {liveCount} {liveCount === 1 ? "مباراة مباشرة" : "مباريات مباشرة"}
              </span>
            </>
          ) : null}
        </div>
        <div className="ubar-r">
          <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
            سبق الرئيسية
          </a>
          <span className="sep" />
          <a href="/roshn" onClick={(e) => { e.preventDefault(); navigate("/roshn"); }}>
            دوري روشن
          </a>
          <span className="sep" />
          <a href="/sports/live" onClick={(e) => { e.preventDefault(); navigate("/sports/live"); }}>
            البث المباشر
          </a>
        </div>
      </div>
    </div>
  );
}
