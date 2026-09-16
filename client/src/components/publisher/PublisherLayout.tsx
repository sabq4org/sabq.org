import { useState, type ComponentType, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  LogOut,
  Globe,
  LayoutDashboard,
  FileText,
  CreditCard,
  Building2,
  BookOpen,
  Zap,
  ShieldCheck,
  Package,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "../ThemeToggle";
import { DashboardThemePickerButton } from "../DashboardThemePickerButton";
import { NotificationBell } from "../NotificationBell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardThemeProvider } from "@/dashboard-themes/DashboardThemeProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

interface PublisherLayoutProps {
  children: ReactNode;
}

interface PortalPublisherBrief {
  publisher: {
    id: string;
    agencyName: string;
    logoUrl: string | null;
    autoPublish: boolean;
    isActive: boolean;
  };
  activeCredit: {
    packageName: string;
    isUnlimited: boolean;
    remainingCredits: number;
    totalCredits: number;
    usedCredits?: number;
    expiryDate: string | null;
  } | null;
}

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  testId: string;
}

const navItems: NavItem[] = [
  {
    id: "publisher-dashboard",
    href: "/dashboard/publisher",
    label: "لوحة التحكم",
    icon: LayoutDashboard,
    testId: "nav-publisher-dashboard",
  },
  {
    id: "publisher-articles",
    href: "/dashboard/publisher/articles",
    label: "المقالات",
    icon: FileText,
    testId: "nav-publisher-articles",
  },
  {
    id: "publisher-credits",
    href: "/dashboard/publisher/credits",
    label: "سجل الرصيد",
    icon: CreditCard,
    testId: "nav-publisher-credits",
  },
  // المسار مسجّل في App.tsx منذ البداية لكنه كان بلا مدخل في القائمة،
  // فكانت صفحة الدليل غير قابلة للوصول إلا بكتابة الرابط يدوياً.
  {
    id: "publisher-guide",
    href: "/dashboard/publisher/guide",
    label: "دليل النشر",
    icon: BookOpen,
    testId: "nav-publisher-guide",
  },
];

function getInitials(firstName?: string | null, lastName?: string | null, email?: string | null) {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
  if (firstName) return firstName[0].toUpperCase();
  if (email) return email[0].toUpperCase();
  return "ن";
}

function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return trimmed;
  return trimmed;
}

function AgencyLogo({
  logoUrl,
  agencyName,
}: {
  logoUrl: string | null | undefined;
  agencyName: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = resolveAssetUrl(logoUrl);

  if (!src || failed) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-background shadow-sm">
        <Building2 className="h-7 w-7 text-primary/70" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={agencyName}
      className="h-14 w-14 shrink-0 rounded-2xl border bg-white object-contain p-1.5 shadow-sm"
      data-testid="img-agency-logo-sidebar"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function PublisherLayout({ children }: PublisherLayoutProps) {
  const [location, navigate] = useLocation();
  const { user, isLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  const { data: portalBrief, isLoading: portalLoading } = useQuery<PortalPublisherBrief>({
    queryKey: ["/api/publisher/portal/overview"],
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  if (isLoading || !user) {
    return (
      <DashboardThemeProvider>
        <div className="flex h-screen w-full items-center justify-center" dir="rtl">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
            <p className="mt-4 text-muted-foreground">جاري التحميل...</p>
          </div>
        </div>
      </DashboardThemeProvider>
    );
  }

  const handleLogout = async () => {
    try {
      await apiRequest("/api/logout", { method: "POST" });
      toast({
        title: "تم تسجيل الخروج",
        description: "نراك قريباً",
      });
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const isActive = (href: string) => {
    if (href === "/dashboard/publisher") return location === href;
    return location.startsWith(href);
  };

  const publisher = portalBrief?.publisher;
  const activeCredit = portalBrief?.activeCredit ?? null;
  const agencyName = publisher?.agencyName ?? "وكالة النشر";
  const displayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.firstName || user.email || "ناشر";

  const packageLabel = activeCredit
    ? activeCredit.isUnlimited
      ? `${activeCredit.packageName} · مفتوحة`
      : `${activeCredit.packageName}`
    : "لا توجد باقة نشطة";

  return (
    <DashboardThemeProvider>
      <SidebarProvider>
        <div className="flex h-screen w-full" dir="rtl">
          <Sidebar side="right" collapsible="offcanvas" className="border-l">
            <SidebarHeader className="gap-0 p-0">
              <div className="relative overflow-hidden px-4 pt-5 pb-4">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/12 via-primary/5 to-transparent"
                />
                <div className="relative space-y-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <img
                      src="/attached_assets/sabq-logo.png"
                      alt=""
                      className="h-4 w-auto object-contain opacity-80"
                    />
                    <span>بوابة الناشرين · سبق</span>
                  </div>

                  {portalLoading && !publisher ? (
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-14 w-14 rounded-2xl" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-5 w-24" />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5" data-testid="sidebar-agency-brand">
                      <div className="flex items-center gap-3">
                        <AgencyLogo logoUrl={publisher?.logoUrl} agencyName={agencyName} />
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-base font-bold leading-snug tracking-tight"
                            data-testid="text-agency-name-sidebar"
                            title={agencyName}
                          >
                            {agencyName}
                          </p>
                          {publisher?.autoPublish ? (
                            <Badge
                              className="mt-1.5 gap-1 border-0 bg-sky-500/15 text-sky-700 hover:bg-sky-500/20 dark:bg-sky-400/15 dark:text-sky-300"
                              data-testid="badge-auto-publish-sidebar"
                            >
                              <Zap className="h-3 w-3" />
                              نشر فوري
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="mt-1.5 gap-1 text-muted-foreground"
                              data-testid="badge-review-publish-sidebar"
                            >
                              <ShieldCheck className="h-3 w-3" />
                              بمراجعة التحرير
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div
                        className="flex items-start gap-2 rounded-xl border bg-background/70 px-2.5 py-2 text-[11px] leading-snug"
                        data-testid="sidebar-package-info"
                        title={packageLabel}
                      >
                        <Package className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-300" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground/90 truncate">
                            {activeCredit?.packageName ?? "بدون باقة نشطة"}
                          </p>
                          <p className="text-muted-foreground">
                            {activeCredit
                              ? activeCredit.isUnlimited
                                ? `مفتوحة ∞ · نُشر ${formatNumber(activeCredit.usedCredits)}`
                                : `متبقي ${formatNumber(activeCredit.remainingCredits)} من ${formatNumber(activeCredit.totalCredits)}`
                              : "تواصل مع الإدارة للتفعيل"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </SidebarHeader>

            <SidebarSeparator className="mx-0" />

            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel className="px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                  القائمة
                </SidebarGroupLabel>
                <SidebarGroupContent className="px-2">
                  <SidebarMenu>
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);

                      return (
                        <SidebarMenuItem key={item.id}>
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={item.label}
                            className={cn(
                              "h-10 rounded-xl px-3 transition-colors",
                              active && "bg-primary/10 font-semibold text-primary shadow-none",
                            )}
                          >
                            <Link href={item.href} data-testid={item.testId}>
                              <span className="flex items-center gap-3">
                                <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                                <span>{item.label}</span>
                              </span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="gap-0 p-0">
              <SidebarSeparator className="mx-0" />
              <div className="space-y-2 p-3">
                <div
                  className="flex items-center gap-3 rounded-2xl border bg-muted/40 p-2.5"
                  data-testid="sidebar-user-card"
                >
                  <Avatar className="h-10 w-10 border shadow-sm">
                    {user.profileImageUrl ? (
                      <AvatarImage src={user.profileImageUrl} alt={displayName} />
                    ) : null}
                    <AvatarFallback className="bg-primary text-sm text-primary-foreground">
                      {getInitials(user.firstName, user.lastName, user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight" data-testid="text-user-name">
                      {displayName}
                    </p>
                    <p
                      className="truncate text-[11px] text-muted-foreground"
                      data-testid="text-user-agency"
                      title={agencyName}
                    >
                      {agencyName}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground hover:text-foreground"
                  onClick={handleLogout}
                  data-testid="button-logout"
                >
                  <LogOut className="ml-2 h-4 w-4" />
                  تسجيل الخروج
                </Button>
              </div>
            </SidebarFooter>
          </Sidebar>

          <SidebarInset className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:h-16 md:px-6">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-muted-foreground md:hidden">
                  {agencyName}
                </p>
              </div>
              <NotificationBell />
              <Button variant="outline" size="icon" asChild data-testid="button-view-site">
                <Link href="/" target="_blank">
                  <Globe className="h-5 w-5" />
                  <span className="sr-only">عرض الموقع</span>
                </Link>
              </Button>
              <DashboardThemePickerButton />
              <ThemeToggle />
            </header>

            <main className="min-w-0 flex-1 overflow-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/[0.04] via-background to-background p-4 md:p-6 lg:p-8">
              {children}
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </DashboardThemeProvider>
  );
}
