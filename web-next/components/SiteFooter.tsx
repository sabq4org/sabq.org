import Link from "next/link";

/**
 * Server-rendered footer matching the SPA footer (client/src/components/
 * Footer.tsx): brand logo + tagline, app-store buttons, category + info links,
 * social row, and the "صُنعت بكل ♥ في السعودية" copyright. The SPA's
 * scroll-to-top FAB and mobile collapsibles (interactive) are omitted.
 */
const APP_STORE_URL =
  "https://apps.apple.com/us/app/%D8%B3%D8%A8%D9%82/id521017976?l=ar";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.sabqorg.sabq&hl=ar";
const HUAWEI_URL = "https://appgallery.huawei.com/app/C105897661";

const INFO_LINKS = [
  { label: "من نحن", href: "/about" },
  { label: "سياسة الخصوصية", href: "/ar/privacy" },
  { label: "شروط الاستخدام", href: "/ar/terms" },
  { label: "تواصل معنا", href: "/contact" },
];

const SOCIAL: { label: string; href: string; path: string }[] = [
  { label: "إكس", href: "https://x.com/sabqorg", path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
  { label: "فيسبوك", href: "https://www.facebook.com/sabq.org", path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" },
  { label: "إنستغرام", href: "https://www.instagram.com/sabqorg", path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" },
  { label: "يوتيوب", href: "https://youtube.com/@sabqorg", path: "M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" },
  { label: "واتساب", href: "https://whatsapp.com/channel/0029VaCUMDGEAKWA2soRAl02", path: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" },
];

function AppButton({ href, label, bg, children }: { href: string; label: string; bg: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-white transition-opacity hover:opacity-90"
      style={{ backgroundColor: bg }}
    >
      {children}
    </a>
  );
}

export function SiteFooter({
  sections,
}: {
  sections?: { href: string; title: string }[];
}) {
  const year = new Date().getFullYear();

  return (
    <footer id="footer" dir="rtl" className="mt-12 border-t bg-muted/30">
      <div className="container mx-auto flex flex-col gap-8 px-4 py-8">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          {/* Brand + app buttons */}
          <div className="flex flex-col items-center gap-3 text-center md:items-start md:text-right">
            <Link href="/" aria-label="الصفحة الرئيسية">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/sabq-logo.png"
                alt="سبق"
                width={751}
                height={681}
                loading="lazy"
                decoding="async"
                className="h-10 w-auto object-contain"
              />
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground">
              منصة إخبارية سعودية ذكية
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <AppButton href={APP_STORE_URL} label="App Store" bg="#000000">App Store</AppButton>
              <AppButton href={PLAY_STORE_URL} label="Google Play" bg="#01875f">Google Play</AppButton>
              <AppButton href={HUAWEI_URL} label="AppGallery" bg="#c7112d">AppGallery</AppButton>
            </div>
          </div>

          {/* Categories (when available) */}
          {sections && sections.length > 0 && (
            <div>
              <h4 className="mb-3 text-sm font-medium">التصنيفات</h4>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                {sections.slice(0, 16).map((c) => (
                  <li key={c.href}>
                    <a
                      href={c.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {c.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Info links */}
          <div>
            <h4 className="mb-3 text-sm font-medium">معلومات</h4>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {INFO_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-6 md:flex-row">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            © {year} سبق الذكية — صُنعت بكل <span className="text-green-600">♥</span> في السعودية
          </p>
          <div className="flex items-center gap-3">
            {SOCIAL.map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={s.path} />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
