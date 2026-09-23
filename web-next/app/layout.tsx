import type { Metadata } from "next";
import "./globals.css";

const themeBootstrap = `
  (function () {
    try {
      var saved = localStorage.getItem('theme-preference');
      if (saved !== 'light' && saved !== 'dark' && saved !== 'system') {
        var legacy = localStorage.getItem('theme');
        saved = legacy === 'light' || legacy === 'dark' ? legacy : 'system';
      }
      var media = window.matchMedia('(prefers-color-scheme: dark)');
      var apply = function () {
        var resolved = saved === 'system' ? (media.matches ? 'dark' : 'light') : saved;
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(resolved);
        document.documentElement.dataset.theme = resolved;
        document.documentElement.dataset.themePreference = saved;
        document.documentElement.style.colorScheme = resolved;
      };
      apply();
      if (saved === 'system') media.addEventListener && media.addEventListener('change', apply);
    } catch (_) {}
  })();
`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_SITE_URL || "https://sabq.org"),
  title: {
    default: "سبق",
    template: "%s | سبق",
  },
  ...(process.env.STAGING_NO_INDEX === "true"
    ? {
        robots: {
          index: false,
          follow: false,
          nocache: true,
        },
      }
    : {}),
};

// Default to Arabic/RTL; localized (en/ur) route groups override lang/dir on
// their own <html> via per-segment layouts when added in Phase 2.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
