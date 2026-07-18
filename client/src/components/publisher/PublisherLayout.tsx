import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, ChevronDown, Globe, LayoutDashboard, FileText, CreditCard, BookOpen } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "../ThemeToggle";
import { DashboardThemePickerButton } from "../DashboardThemePickerButton";
import { NotificationBell } from "../NotificationBell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardThemeProvider } from "@/dashboard-themes/DashboardThemeProvider";

interface PublisherLayoutProps {
  children: ReactNode;
}

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
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
  {
    id: "publisher-guide",
    href: "/dashboard/publisher/guide",
    label: "دليل الناشر",
    icon: BookOpen,
    testId: "nav-publisher-guide",
  },
];

export function PublisherLayout({ children }: PublisherLayoutProps) {
  const [location, navigate] = useLocation();
  const { user, isLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  // عرض شاشة تحميل أثناء التحقق من المصادقة
  if (isLoading || !user) {
    return (
      <DashboardThemeProvider>
        <div className="flex h-screen w-full items-center justify-center" dir="rtl">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
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

  const getInitials = (firstName?: string | null, lastName?: string | null, email?: string) => {
    if (firstName && lastName) {
      return `${firstName?.[0]}${lastName?.[0]}`.toUpperCase();
    }
    if (firstName) {
      return `${firstName?.[0]}`.toUpperCase();
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'ن';
  };

  const isActive = (href: string) => {
    if (href === "/dashboard/publisher") {
      return location === href;
    }
    return location.startsWith(href);
  };

  return (
    <DashboardThemeProvider>
    <SidebarProvider>
      <div className="flex h-screen w-full" dir="rtl">
        <Sidebar side="right" collapsible="offcanvas">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-lg font-bold mb-4">
                <div className="flex items-center gap-2">
                  <img 
                    src="/attached_assets/sabq-logo.png" 
                    alt="سبق" 
                    className="h-8 w-auto object-contain"
                    data-testid="img-sabq-logo"
                  />
                  <span>لوحة الناشر</span>
                </div>
              </SidebarGroupLabel>
              <SidebarGroupContent>
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
                        >
                          <Link href={item.href}>
                            <span className="flex items-center gap-3">
                              <Icon className="h-5 w-5" />
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

          <SidebarFooter>
            <div className="p-4 space-y-3 border-t">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {getInitials(user?.firstName, user?.lastName, user?.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user?.firstName && user?.lastName 
                      ? `${user.firstName} ${user.lastName}`
                      : user?.email}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    ناشر
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={handleLogout}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 ml-2" />
                تسجيل الخروج
              </Button>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex flex-col flex-1">
          <header className="flex h-16 items-center gap-4 border-b px-4 md:px-6">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex-1" />
            <NotificationBell />
            <Button
              variant="outline"
              size="icon"
              asChild
              data-testid="button-view-site"
            >
              <Link href="/" target="_blank">
                <Globe className="h-5 w-5" />
                <span className="sr-only">عرض الموقع</span>
              </Link>
            </Button>
            <DashboardThemePickerButton />
            <ThemeToggle />
          </header>
          
          <main className="flex-1 overflow-auto p-4 md:p-6">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
    </DashboardThemeProvider>
  );
}
