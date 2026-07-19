import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Users, FileCheck, BarChart3 } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  testId: string;
}

const navItems: NavItem[] = [
  {
    href: "/dashboard/admin/publishers",
    label: "قائمة الناشرين",
    icon: Users,
    testId: "nav-publishers",
  },
  {
    href: "/dashboard/admin/publishers/articles",
    label: "مراجعة المقالات",
    icon: FileCheck,
    testId: "nav-review-articles",
  },
  {
    href: "/dashboard/admin/publishers/analytics",
    label: "التحليلات",
    icon: BarChart3,
    testId: "nav-analytics",
  },
];

export function AdminPublisherNav() {
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === "/dashboard/admin/publishers") {
      // القائمة + صفحة تفاصيل وكالة (UUID/id) — دون مقالات/تحليلات/دليل
      if (location === href || location === "/dashboard/admin/publishers/") return true;
      const detailMatch = location.match(/^\/dashboard\/admin\/publishers\/([^/]+)$/);
      if (!detailMatch) return false;
      return !["articles", "analytics", "guide"].includes(detailMatch[1]);
    }
    return location.startsWith(href);
  };

  return (
    <nav className="rounded-2xl border bg-card p-1" dir="rtl" data-testid="admin-publisher-nav">
      <div className="flex items-center gap-1 overflow-x-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link key={item.href} href={item.href}>
              <a
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                data-testid={item.testId}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </a>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
