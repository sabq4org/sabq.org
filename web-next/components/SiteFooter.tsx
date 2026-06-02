import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-12 border-t border-border bg-footer text-footer-foreground">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-8 text-center">
        <Link href="/" className="text-xl font-bold text-primary">سبق</Link>
        <p className="text-xs text-muted-foreground">
          صحيفة سبق الإلكترونية — جميع الحقوق محفوظة © {year}
        </p>
      </div>
    </footer>
  );
}
