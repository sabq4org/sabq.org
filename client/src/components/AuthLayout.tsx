import { Link } from "wouter";
import sabqLogo from "@assets/sabq-logo.png";

interface AuthLayoutProps {
  children: React.ReactNode;
  /** محتوى أسفل البطاقة: سطر الشروط أو روابط ثانوية. */
  footer?: React.ReactNode;
}

export default function AuthLayout({ children, footer }: AuthLayoutProps) {
  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-[hsl(207,30%,97%)] dark:bg-background" dir="rtl">
      {/* خلفية هادئة: شبكة نقاط خافتة + توهج علوي بلون الهوية */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,hsl(var(--foreground)/0.05)_1px,transparent_1.1px)] [background-size:26px_26px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(65%_100%_at_50%_0%,hsl(var(--primary)/0.13),transparent_72%)]"
      />

      <div className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-4 py-8 sm:py-12">
        <Link href="/" aria-label="العودة للرئيسية" data-testid="link-back-home">
          <img
            src={sabqLogo}
            alt="سبق"
            className="h-12 w-auto object-contain sm:h-14 dark:brightness-0 dark:invert"
          />
        </Link>

        <main className="mt-6 w-full max-w-[400px] rounded-2xl border border-border bg-card p-5 shadow-xl shadow-slate-950/[0.08] dark:shadow-black/40 sm:p-8">
          {children}
        </main>

        {footer && (
          <footer className="mt-5 w-full max-w-[400px] text-center text-xs leading-relaxed text-muted-foreground">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
