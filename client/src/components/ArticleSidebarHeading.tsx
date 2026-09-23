import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** One heading treatment for the existing modules on the public news page. */
export function ArticleSidebarHeading({ title, description, icon: Icon, action, titleTestId }: {
  title: string;
  description: string;
  icon: LucideIcon;
  action?: ReactNode;
  titleTestId?: string;
}) {
  return (
    <div className="article-sidebar-heading">
      <h2 data-testid={titleTestId}>
        <span className="article-sidebar-heading-icon"><Icon aria-hidden="true" /></span>
        {title}
      </h2>
      <div className="article-sidebar-heading-description">
        <p>{description}</p>
        {action}
      </div>
    </div>
  );
}
