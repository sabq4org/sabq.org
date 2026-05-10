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
      return location === href || location === "/dashboard/admin/publishers/";
    }
    return location.startsWith(href);
  };

  return (
    <nav className="border-b bg-background" dir="rtl">
      <div className="container mx-auto px-6">
        <div className="flex items-center gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
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
      </div>
    </nav>
  );
}
