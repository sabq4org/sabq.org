import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared public layout only; callers retain their existing header, footer and data. */
export function PublicPage({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("public-page", className)} {...props} />;
}

export function PublicPageHeader({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("public-page-header", className)}>
      <div className="public-container">
        <h1 className="public-page-title">{title}</h1>
        {description && (
          <div className="public-page-description">{description}</div>
        )}
        {children}
      </div>
    </header>
  );
}

export function PublicSectionHeading({
  title,
  children,
}: {
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="public-section-heading">
      <h2 className="public-section-title">{title}</h2>
      {children}
    </div>
  );
}

export function PublicState({
  title,
  children,
  onRetry,
  retryLabel = "إعادة المحاولة",
  busy = false,
}: {
  title: string;
  children?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  busy?: boolean;
}) {
  return (
    <div className="public-state" role="status" aria-live="polite">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {onRetry && (
        <button
          type="button"
          className="public-action"
          onClick={onRetry}
          disabled={busy}
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
