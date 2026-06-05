import { ReactNode, useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useAuth, getHighestRole } from "@/hooks/useAuth";
import { LogOut, ChevronDown, Globe, User } from "lucide-react";
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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./ThemeToggle";
import { AutoPublishBanner } from "./AutoPublishBanner";
import { EditorPresenceBar } from "./admin/EditorPresenceBar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useNav, trackNavClick } from "@/nav/useNav";
import { AppBreadcrumbs } from "./AppBreadcrumbs";
import { InternalAnnouncement } from "./InternalAnnouncement";
import type { UserRole } from "@/nav/types";
import { resolveUserRole } from "@/lib/roleMapping";
import type { NavItem } from "@/nav/types";

interface DashboardLayoutProps {
  children: ReactNode;
}

const STORAGE_KEY = "sabq.sidebar.v1";

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location, navigate] = useLocation();
  const { user, isLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();
  
  // Load collapsed state from localStorage
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Save collapsed state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsedGroups));
    } catch (error) {
      console.error("Failed to save sidebar state:", error);
    }
  }, [collapsedGroups]);

  // Mark moderator offline when closing tab/browser
  // إزالة المشرف من المتصلين عند إغلاق التبويب
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable delivery during page unload
      navigator.sendBeacon('/api/admin/moderator/disconnect', '');
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // ALWAYS call hooks in same order - use fallback values during loading
  // Get highest role from RBAC system, fallback to legacy role
  // Map custom/RBAC roles to navigation-compatible roles
  const highestRole = getHighestRole(user);
  
  // Map to known role or default to 'guest' for unknown RBAC roles
  // 'guest' provides minimal navigation access - actual access controlled by permissions
  const role: UserRole = resolveUserRole(highestRole);
  
  // Memoize flags to prevent unnecessary re-renders  
  const flags = useMemo(() => ({
    aiDeepAnalysis: false,
    smartThemes: true,
    audioSummaries: false,
  }), []);
  
  const { treeFiltered, activeItem } = useNav({
    role,
    flags,
    pathname: location,
    permissions: user?.permissions || [], // Always pass array (empty if undefined)
    // Pass the full role set so excludeRoles can hide entries when ANY of
    // the user's roles matches (e.g. an account with both admin and
    // opinion_author should drop opinion-author-excluded entries).
    allRoles: user?.roles && user.roles.length > 0 ? user.roles : (user?.role ? [user.role] : []),
  });

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // عرض شاشة تحميل أثناء التحقق من المصادقة
  if (isLoading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
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

  const handleNavClick = (item: NavItem) => {
    trackNavClick(item.id, item.path);
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
    return 'س';
  };

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = activeItem?.id === item.id;
    const hasChildren = item.children && item.children.length > 0;

    if (hasChildren) {
      const isOpen = !collapsedGroups[item.id];

      return (
        <Collapsible
          key={item.id}
          open={isOpen}
          onOpenChange={() => toggleGroup(item.id)}
        >
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton
                tooltip={item.labelAr || item.labelKey}
                className="w-full"
              >
                <span className="flex items-center gap-3 flex-1">
                  {Icon && <Icon className="h-5 w-5" />}
                  <span>{item.labelAr || item.labelKey}</span>
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {item.children?.map((child) => {
                  const ChildIcon = child.icon;
                  const isChildActive = activeItem?.id === child.id;
                  
                  return (
                    <SidebarMenuSubItem key={child.id}>
                      <SidebarMenuSubButton
                        asChild
                        isActive={isChildActive}
                      >
                        <Link 
                          href={child.path || "#"}
                          onClick={() => handleNavClick(child)}
                        >
                          <span className="flex items-center gap-3">
                            {ChildIcon && <ChildIcon className="h-4 w-4" />}
                            <span>{child.labelAr || child.labelKey}</span>
                          </span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  );
                })}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      );
    }

    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton
          asChild
          isActive={isActive}
          tooltip={item.labelAr || item.labelKey}
        >
          <Link 
            href={item.path || "#"}
            onClick={() => handleNavClick(item)}
          >
            <span className="flex items-center gap-3">
              {Icon && <Icon className="h-5 w-5" />}
              <span>{item.labelAr || item.labelKey}</span>
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  // Group items with and without dividers
  const navGroups: NavItem[][] = [];
  let currentGroup: NavItem[] = [];

  treeFiltered.forEach((item) => {
    if (item.divider && currentGroup.length > 0) {
      navGroups.push(currentGroup);
      currentGroup = [item];
    } else {
      currentGroup.push(item);
    }
  });

  if (currentGroup.length > 0) {
    navGroups.push(currentGroup);
  }

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full" dir="rtl">
        <Sidebar side="right" collapsible="offcanvas" className="border-l-0">
          <SidebarContent className="pr-0">
            <SidebarGroup>
              <SidebarGroupLabel className="text-lg font-bold mb-4 pt-2">
                <div className="flex items-center gap-3">
                  <img 
                    src="/branding/sabq-logo.png" 
                    alt="سبق" 
                    className="h-8 w-auto object-contain"
                    data-testid="img-sabq-logo"
                  />
                  <div className="flex flex-col pt-1">
                    <span className="text-sm font-semibold tracking-wide">Sabq Smart</span>
                    <span className="text-[10px] text-muted-foreground font-normal">v2.0.0</span>
                  </div>
                </div>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                {navGroups.map((group, groupIndex) => (
                  <SidebarMenu key={groupIndex} className={groupIndex > 0 ? "mt-4 pt-4 border-t" : ""}>
                    {group.map(renderNavItem)}
                  </SidebarMenu>
                ))}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <SidebarInset className="flex flex-col flex-1 w-full min-w-0 min-h-0 overflow-hidden">
          <header className="flex h-14 md:h-16 shrink-0 items-center gap-2 md:gap-4 border-b px-3 md:px-6">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              asChild
              className="hidden sm:flex"
              data-testid="button-view-site"
            >
              <Link href="/" target="_blank">
                <Globe className="h-4 w-4" />
                <span>الرئيسية</span>
              </Link>
            </Button>
            <ThemeToggle />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 md:h-9 md:w-9 rounded-full" data-testid="button-user-menu">
                  <Avatar className="h-8 w-8 md:h-9 md:w-9">
                    {user?.profileImageUrl && (
                      <AvatarImage src={user.profileImageUrl} alt={user?.firstName || 'صورة المستخدم'} />
                    )}
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {getInitials(user?.firstName, user?.lastName, user?.email)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <div className="flex items-center gap-3 p-3">
                  <Avatar className="h-10 w-10">
                    {user?.profileImageUrl && (
                      <AvatarImage src={user.profileImageUrl} alt={user?.firstName || 'صورة المستخدم'} />
                    )}
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
                      {user?.role === "admin" ? "مدير" : user?.role === "editor" ? "محرر" : "كاتب"}
                    </p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/profile" className="flex items-center gap-2 cursor-pointer" data-testid="link-profile">
                    <User className="h-4 w-4" />
                    <span>الملف الشخصي</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="sm:hidden">
                  <Link href="/" target="_blank" className="flex items-center gap-2 cursor-pointer">
                    <Globe className="h-4 w-4" />
                    <span>الرئيسية</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleLogout}
                  className="text-destructive focus:text-destructive cursor-pointer"
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4 ml-2" />
                  <span>تسجيل الخروج</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          
          <InternalAnnouncement />
          <AutoPublishBanner />
          {role !== 'opinion_author' && role !== 'angle_writer' && (
            <div className="px-3 md:px-6 pt-3">
              <EditorPresenceBar />
            </div>
          )}
          
          <div className="flex-1 overflow-auto p-3 md:p-6">
            <AppBreadcrumbs role={role} flags={flags} />
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
