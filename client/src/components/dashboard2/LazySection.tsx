import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface LazySectionProps {
  children: ReactNode;
  className?: string;
  id?: string;
  testId?: string;
  label?: string;
  minHeight?: number;
  /** Reveal immediately (used for above-the-fold sections). */
  eager?: boolean;
}

/**
 * Mounts its children (and therefore their data queries) only when the section
 * approaches the viewport. Keeps /dashboard2 from firing every endpoint at once
 * while preserving scroll position with a fixed-height placeholder.
 */
export function LazySection({
  children,
  className,
  id,
  testId,
  label,
  minHeight = 96,
  eager = false,
}: LazySectionProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(eager);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "320px 0px" },
    );
    observer.observe(el);
    // Safety net: never leave content permanently hidden if the observer misfires.
    const timer = window.setTimeout(() => setVisible(true), 4000);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [visible]);

  return (
    <section
      ref={ref}
      id={id}
      className={cn("scroll-mt-24", className)}
      data-testid={testId}
      aria-label={label}
    >
      {visible ? (
        children
      ) : (
        <div
          className="animate-pulse rounded-2xl border border-border/60 bg-muted/20"
          style={{ minHeight }}
          aria-hidden
        />
      )}
    </section>
  );
}
