import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutDashboard, FileText, CreditCard } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  testId: string;
}

const navItems: NavItem[] = [
  {
    href: "/dashboard/publisher",
    label: "لوحة التحكم",
    icon: LayoutDashboard,
    testId: "nav-dashboard",
  },
  {
    href: "/dashboard/publisher/articles",
    label: "المقالات",
    icon: FileText,
    testId: "nav-articles",
  },
  {
    href: "/dashboard/publisher/credits",
    label: "سجل الرصيد",
    icon: CreditCard,
    testId: "nav-credits",
  },
];

export function PublisherNav() {
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === "/dashboard/publisher") {
      return location === href;
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
