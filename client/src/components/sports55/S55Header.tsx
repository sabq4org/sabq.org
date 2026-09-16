import { Search, Home } from "lucide-react";
import { useLocation } from "wouter";

const NAV: { label: string; href: string; md?: boolean }[] = [
  { label: "الرئيسية", href: "/sports55" },
  { label: "مباريات اليوم", href: "/sports/matches" },
  { label: "البث المباشر", href: "/sports/live" },
  { label: "دوري روشن", href: "/roshn" },
  { label: "البطولات", href: "/sports" },
  { label: "الانتقالات", href: "/sports/transfers", md: true },
  { label: "التوقعات", href: "/predictions?competition=rsl-2026", md: true },
];

export function S55Header() {
  const [location, navigate] = useLocation();
  const go = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(href);
  };

  return (
    <header className="header">
      <div className="wrap">
        <a className="brand" href="/sports55" onClick={go("/sports55")} aria-label="سبق الرياضية">
          <span className="brand-word">سبق</span>
          <span className="brand-tag">الرياضية</span>
        </a>

        <nav className="nav" aria-label="التنقّل الرياضي">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              onClick={go(n.href)}
              className={`${location === n.href ? "active" : ""}${n.md ? " hide-md" : ""}`.trim()}
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="hactions">
          <button className="icon-btn" aria-label="بحث" onClick={() => navigate("/search")}>
            <Search size={18} />
          </button>
          <button className="icon-btn" aria-label="الموقع الرئيسي" onClick={() => navigate("/")}>
            <Home size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
