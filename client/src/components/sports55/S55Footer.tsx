import { useLocation } from "wouter";
import sabqLogo from "@assets/sabq-logo.png";

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "المباريات",
    links: [
      { label: "مباريات اليوم", href: "/sports/matches" },
      { label: "البث المباشر", href: "/sports/live" },
      { label: "أحدث النتائج", href: "/sports/matches" },
    ],
  },
  {
    title: "دوري روشن",
    links: [
      { label: "هب الدوري", href: "/roshn" },
      { label: "الترتيب", href: "/roshn" },
      { label: "الهدّافون", href: "/roshn" },
      { label: "التوقعات", href: "/predictions?competition=rsl-2026" },
    ],
  },
  {
    title: "المزيد",
    links: [
      { label: "البطولات", href: "/sports" },
      { label: "الانتقالات", href: "/sports/transfers" },
      { label: "سبق الرئيسية", href: "/" },
    ],
  },
];

export function S55Footer() {
  const [, navigate] = useLocation();
  const go = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(href);
  };

  return (
    <footer className="footer">
      <div className="wrap">
        <div className="fgrid">
          <div className="fcol fabout">
            <a className="brand" href="/sports55" onClick={go("/sports55")} aria-label="سبق الرياضية">
              <img className="foot-logo" src={sabqLogo} alt="سبق" />
            </a>
            <p>
              بوابة رياضية تنقل مباريات دوري روشن السعودي، النتائج المباشرة، الترتيب والهدّافين
              أولًا بأول.
            </p>
          </div>

          {COLS.map((c) => (
            <div className="fcol" key={c.title}>
              <h4>{c.title}</h4>
              <ul>
                {c.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} onClick={go(l.href)}>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="fbar">
          <span>© 2026 سبق الرياضية — بيانات دوري روشن مباشرة</span>
          <span className="mono">sabq sports · /sports55 · v0.1</span>
        </div>
      </div>
    </footer>
  );
}
