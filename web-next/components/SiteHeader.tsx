import Link from "next/link";

/**
 * Server-rendered header for the SSR public surfaces. Visually matches the SPA
 * header (client/src/components/Header.tsx): the real sabq logo, sticky blurred
 * bar, and the main section nav. The interactive bits of the SPA header
 * (search dialog, auth dropdown, theme/lang switchers, mobile sheet) are
 * intentionally omitted — those live in the hydrated SPA. The logo is served
 * from /branding/sabq-logo.png (proxied to the API by the Pages middleware).
 */
const MAIN_SECTIONS: { name: string; href: string }[] = [
  { name: "الأخبار", href: "/news" },
  { name: "التصنيفات", href: "/categories" },
  { name: "مقالات", href: "/opinion" },
  { name: "مُقترب", href: "/muqtarab" },
  { name: "لحظة بلحظة", href: "/moment-by-moment" },
];

export function SiteHeader() {
  return (
    <header
      role="banner"
      dir="rtl"
      className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" aria-label="الصفحة الرئيسية" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/branding/sabq-logo.png"
              alt="سبق - SABQ"
              width={751}
              height={681}
              loading="eager"
              decoding="async"
              className="h-11 w-auto object-contain md:h-12"
            />
          </Link>

          <nav
            aria-label="القائمة الرئيسية"
            className="hidden flex-1 items-center justify-center gap-6 md:flex"
          >
            {MAIN_SECTIONS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="whitespace-nowrap text-sm font-medium text-foreground transition-colors hover:text-primary"
              >
                {s.name}
              </Link>
            ))}
          </nav>

          {/* Spacer to keep the logo balanced against the centered nav on desktop. */}
          <div className="hidden w-12 md:block" aria-hidden="true" />
        </div>
      </div>
    </header>
  );
}
