import Link from "next/link";

/**
 * Lightweight, server-rendered header for the SSR public surfaces. This is a
 * functional match of the SPA header (client/src/components/Header.tsx), not a
 * pixel-perfect port — the full interactive nav (search, auth, mobile sheet)
 * stays in the SPA. Pixel parity is tracked as Risk #1 in the P3 plan.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          aria-label="الصفحة الرئيسية"
          className="text-2xl font-bold text-primary"
        >
          سبق
        </Link>
        <nav aria-label="القائمة الرئيسية" className="hidden gap-6 text-sm md:flex">
          <Link href="/" className="hover:text-primary">الرئيسية</Link>
          <Link href="/category/saudi" className="hover:text-primary">محليات</Link>
          <Link href="/category/world" className="hover:text-primary">العالم</Link>
          <Link href="/category/sport" className="hover:text-primary">رياضة</Link>
        </nav>
      </div>
    </header>
  );
}
