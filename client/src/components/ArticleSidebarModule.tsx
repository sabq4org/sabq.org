import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArticleSidebarHeading } from "./ArticleSidebarHeading";

/**
 * One container for every list module beside (desktop) or below (mobile) a news
 * story or opinion piece: pale-blue surface, one heading, one column of cards.
 */
export function ArticleSidebarModule({
  title,
  description,
  icon,
  action,
  titleTestId,
  testId,
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  action?: ReactNode;
  titleTestId?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section className="article-sidebar-module" data-testid={testId} dir="rtl" aria-label={title}>
      <ArticleSidebarHeading title={title} description={description} icon={icon} action={action} titleTestId={titleTestId} />
      <div className="article-sidebar-module-list">{children}</div>
    </section>
  );
}
