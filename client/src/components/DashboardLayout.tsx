import { ReactNode, useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth, getHighestRole } from "@/hooks/useAuth";
import { LogOut, ChevronDown, Globe, User, Search, Star, Plus, PenLine, Mic, Newspaper, BadgeCheck, BadgeAlert } from "lucide-react";
import { useDashboardFavorites } from "@/hooks/useDashboardFavorites";
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
import { DirectionProvider } from "@radix-ui/react-direction";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./ThemeToggle";
import { DashboardThemePickerButton } from "./DashboardThemePickerButton";
import { AutoPublishBanner } from "./AutoPublishBanner";
import { EditorPresenceBar } from "./admin/EditorPresenceBar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useNav, trackNavClick } from "@/nav/useNav";
import { AppBreadcrumbs } from "./AppBreadcrumbs";
import { InternalAnnouncement } from "./InternalAnnouncement";
import { MeetingCallAlert } from "./meetings/MeetingCallAlert";
import { DashboardThemeProvider } from "@/dashboard-themes/DashboardThemeProvider";
import type { UserRole } from "@/nav/types";
import { resolveUserRole } from "@/lib/roleMapping";
import type { NavItem } from "@/nav/types";
import { cn } from "@/lib/utils";
import { MEDIA_LICENSE_DASHBOARD_WARNING } from "@shared/mediaLicense";
import { useMediaLicenseGate } from "@/hooks/useMediaLicenseGate";

interface DashboardLayoutProps {
  children: ReactNode;
}

const OPEN_GROUP_STORAGE_KEY = "sabq.sidebar.open-group.v2";

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location, navigate] = useLocation();
  const { user, isLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();
  
  const [openGroupId, setOpenGroupId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(OPEN_GROUP_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      if (openGroupId) {
        localStorage.setItem(OPEN_GROUP_STORAGE_KEY, openGroupId);
      } else {
        localStorage.removeItem(OPEN_GROUP_STORAGE_KEY);
      }
    } catch (error) {
      console.error("Failed to save sidebar state:", error);
    }
  }, [openGroupId]);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

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
  
  const { treeFiltered, activeItem, parents, flat } = useNav({
    role,
    flags,
    pathname: location,
    permissions: user?.permissions || [], // Always pass array (empty if undefined)
    // Pass the full role set so excludeRoles can hide entries when ANY of
    // the user's roles matches (e.g. an account with both admin and
    // opinion_author should drop opinion-author-excluded entries).
    allRoles: user?.roles && user.roles.length > 0 ? user.roles : (user?.role ? [user.role] : []),
  });

  useEffect(() => {
    const activeGroup = parents.find((parent) => parent.children && parent.children.length > 0);
    setOpenGroupId(activeGroup?.id || null);
  }, [location, parents]);

  const navigableItems = useMemo(() => {
    const seenPaths = new Set<string>();
    return flat.filter((item) => {
      if (!item.path || seenPaths.has(item.path)) return false;
      seenPaths.add(item.path);
      return true;
    });
  }, [flat]);

  const quickCreateItem = navigableItems.find((item) =>
    item.id === "new_article"
    || item.id === "opinion_author_new_article"
    || item.id === "reporter_new_article"
  );
  const { favoriteItems } = useDashboardFavorites(navigableItems);
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase("ar");
  const searchResults = normalizedSearch
    ? navigableItems
        .filter((item) => (item.labelAr || item.labelKey).toLocaleLowerCase("ar").includes(normalizedSearch))
        .slice(0, 8)
    : [];

  // بطاقة هوية أعلى الشريط — كتّاب الرأي/الزاوية والمراسل ومدير المحتوى
  const isIdentitySidebar =
    role === "opinion_author" || role === "angle_writer" || role === "reporter" || role === "content_manager";
  const {
    isMediaLicensed,
    showExpiringSoonBadge,
    showExpiredBadge,
    showUnlicensedBadge,
    showWarningBanner: showMediaLicenseWarningBanner,
    createBlocked,
    createBlockedReason,
    openMediaLicenseForm,
  } = useMediaLicenseGate();

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

  const identityDisplayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.firstName || user.name || user.email || (
        role === "reporter"
          ? "مراسل"
          : role === "content_manager"
            ? "مدير محتوى"
            : "كاتب"
      );
  const identityRoleLabel =
    role === "reporter"
      ? "مراسل"
      : role === "angle_writer"
        ? "كاتب زاوية"
        : role === "content_manager"
          ? "مدير محتوى"
          : "كاتب رأي";
  const IdentityRoleIcon =
    role === "reporter" ? Mic : role === "content_manager" ? Newspaper : PenLine;

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = activeItem?.id === item.id;
    const hasChildren = item.children && item.children.length > 0;

    if (hasChildren) {
      const isOpen = openGroupId === item.id;

      return (
        <Collapsible
          key={item.id}
          open={isOpen}
          onOpenChange={(nextOpen) => setOpenGroupId(nextOpen ? item.id : null)}
        >
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton
                tooltip={item.labelAr || item.labelKey}
                className="w-full"
              >
                <span className="flex items-center gap-3 flex-1">
                  {Icon && <Icon className="h-4 w-4" />}
                  <span>{item.labelAr || item.labelKey}</span>
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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
                          <span className="flex min-w-0 items-center gap-3">
                            {ChildIcon && <ChildIcon className="h-4 w-4 shrink-0" />}
                            <span className="truncate">{child.labelAr || child.labelKey}</span>
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
            <span className="flex min-w-0 items-center gap-3">
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              <span className="truncate">{item.labelAr || item.labelKey}</span>
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  // Group items with and without dividers
  const navGroups: NavItem[][] = [];
  let currentGroup: NavItem[] = [];

  const navigationTree = quickCreateItem
    ? treeFiltered.filter((item) => item.id !== quickCreateItem.id)
    : treeFiltered;

  navigationTree.forEach((item) => {
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
    <DashboardThemeProvider>
    <DirectionProvider dir="rtl">
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
              {isIdentitySidebar && (
                <div className="mb-3 px-2" data-testid="sidebar-identity-card">
                  <div className="relative overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar-accent/30">
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/12 via-primary/5 to-transparent"
                    />
                    <div className="relative space-y-2.5 p-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12 border shadow-sm">
                          {user.profileImageUrl ? (
                            <AvatarImage src={user.profileImageUrl} alt={identityDisplayName} />
                          ) : null}
                          <AvatarFallback className="bg-primary text-sm text-primary-foreground">
                            {getInitials(user.firstName, user.lastName, user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1 text-start">
                          <p
                            className="truncate text-sm font-bold leading-snug tracking-tight"
                            data-testid="sidebar-identity-name"
                            title={identityDisplayName}
                          >
                            {identityDisplayName}
                          </p>
                          {user.email && (
                            <p
                              className="mt-0.5 truncate text-[11px] text-muted-foreground"
                              data-testid="sidebar-identity-email"
                              title={user.email}
                            >
                              <span dir="ltr" className="inline-block max-w-full truncate align-bottom">
                                {user.email}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          className={cn(
                            "gap-1 border-0 bg-primary/12 text-primary hover:bg-primary/15",
                          )}
                          data-testid="sidebar-identity-role-badge"
                        >
                          <IdentityRoleIcon className="h-3 w-3" />
                          {identityRoleLabel}
                        </Badge>
                        {isMediaLicensed && (
                          <Badge
                            className="gap-1 border-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                            data-testid="sidebar-identity-licensed-badge"
                          >
                            <BadgeCheck className="h-3 w-3" />
                            مرخّص
                          </Badge>
                        )}
                        {showExpiringSoonBadge && (
                          <Badge
                            role="button"
                            tabIndex={0}
                            title="اضغط لتحديث بيانات الترخيص"
                            className="cursor-pointer gap-1 border-0 bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:text-white dark:hover:bg-red-600"
                            onClick={openMediaLicenseForm}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openMediaLicenseForm();
                              }
                            }}
                            data-testid="sidebar-identity-expiring-license-badge"
                          >
                            <BadgeAlert className="h-3 w-3" />
                            جدّد الترخيص
                          </Badge>
                        )}
                        {showExpiredBadge && (
                          <Badge
                            role="button"
                            tabIndex={0}
                            title="اضغط لتحديث الترخيص المنتهي"
                            className="cursor-pointer gap-1 border-0 bg-rose-100 text-rose-900 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-200 dark:hover:bg-rose-900/60"
                            onClick={openMediaLicenseForm}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openMediaLicenseForm();
                              }
                            }}
                            data-testid="sidebar-identity-expired-license-badge"
                          >
                            <BadgeAlert className="h-3 w-3" />
                            منتهٍ
                          </Badge>
                        )}
                        {showUnlicensedBadge && (
                          <Badge
                            role="button"
                            tabIndex={0}
                            title="اضغط لإرسال الترخيص المهني"
                            className="cursor-pointer gap-1 border-0 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60"
                            onClick={openMediaLicenseForm}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openMediaLicenseForm();
                              }
                            }}
                            data-testid="sidebar-identity-unlicensed-badge"
                          >
                            <BadgeAlert className="h-3 w-3" />
                            غير مرخّص
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="mb-3 space-y-3 px-2">
                {quickCreateItem && (
                  createBlocked ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full justify-start gap-2 shadow-sm opacity-60"
                      title={createBlockedReason}
                      onClick={openMediaLicenseForm}
                      data-testid="sidebar-quick-create-article-blocked"
                    >
                      <Plus className="h-4 w-4" />
                      <span>{role === "opinion_author" ? "إنشاء مقال جديد" : "إنشاء خبر جديد"}</span>
                    </Button>
                  ) : (
                    <Button asChild className="w-full justify-start gap-2 shadow-sm">
                      <Link
                        href={quickCreateItem.path || "/dashboard/articles/new"}
                        onClick={() => handleNavClick(quickCreateItem)}
                        data-testid="sidebar-quick-create-article"
                      >
                        <Plus className="h-4 w-4" />
                        <span>{role === "opinion_author" ? "إنشاء مقال جديد" : "إنشاء خبر جديد"}</span>
                      </Link>
                    </Button>
                  )
                )}

                <div className="relative">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="ابحث في لوحة التحكم"
                    className="h-9 w-full rounded-md border border-sidebar-border bg-sidebar-accent/40 pr-9 pl-12 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-background"
                    aria-label="البحث في لوحة التحكم"
                    data-testid="sidebar-navigation-search"
                  />
                  <kbd className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    ⌘K
                  </kbd>
                </div>

                {!normalizedSearch && (
                  <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/20 p-2" data-testid="sidebar-favorites">
                    <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground">
                      <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                      <span>المفضلة</span>
                    </div>
                    {favoriteItems.length > 0 ? (
                      <div className="space-y-0.5">
                        {favoriteItems.map((item) => {
                          const FavoriteIcon = item.icon;
                          return (
                            <Link
                              key={item.id}
                              href={item.path || "#"}
                              onClick={() => handleNavClick(item)}
                              className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-sidebar-accent"
                              data-testid={`sidebar-favorite-link-${item.id}`}
                            >
                              {FavoriteIcon && <FavoriteIcon className="h-3.5 w-3.5 shrink-0" />}
                              <span className="truncate">{item.labelAr || item.labelKey}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="px-1 py-1 text-[11px] leading-relaxed text-muted-foreground">
                        ادخل أي قسم واضغط ★ بجانب اسم الصفحة لتثبيتها هنا.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <SidebarGroupContent>
                {normalizedSearch ? (
                  <div className="px-2">
                    <p className="mb-2 px-2 text-[11px] font-medium text-muted-foreground">
                      {searchResults.length > 0 ? `${searchResults.length} نتائج` : "لا توجد نتائج"}
                    </p>
                    <div className="space-y-1">
                      {searchResults.map((item) => {
                        const ResultIcon = item.icon;
                        return (
                          <Link
                            key={item.id}
                            href={item.path || "#"}
                            onClick={() => {
                              handleNavClick(item);
                              setSearchQuery("");
                            }}
                            className="flex min-w-0 items-center gap-2 rounded-md border border-transparent px-2 py-2 text-sm hover:border-sidebar-border hover:bg-sidebar-accent"
                          >
                            {ResultIcon && <ResultIcon className="h-4 w-4 shrink-0" />}
                            <span className="truncate">{item.labelAr || item.labelKey}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  navGroups.map((group, groupIndex) => (
                    <SidebarMenu key={groupIndex} className={groupIndex > 0 ? "mt-4 pt-4 border-t" : ""}>
                      {group.map(renderNavItem)}
                    </SidebarMenu>
                  ))
                )}
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
            {role !== "opinion_author" && role !== "angle_writer" && (
              <EditorPresenceBar />
            )}
            <DashboardThemePickerButton />
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
                      {(user as { roleLabel?: string | null })?.roleLabel
                        || (user?.role === "system_admin" || user?.role === "system.admin" || user?.role === "superadmin" || user?.role === "super_admin"
                          ? "مسؤول النظام"
                          : user?.role === "admin"
                            ? "مسؤول النظام"
                            : user?.role === "editor"
                              ? "محرر"
                            : user?.role === "reporter"
                              ? "مراسل"
                              : user?.role === "content_manager"
                                ? "مدير محتوى"
                                : user?.role === "opinion_author"
                                  ? "كاتب رأي"
                                  : user?.role === "angle_writer"
                                    ? "كاتب زاوية"
                                    : user?.role === "author"
                                      ? "كاتب"
                                      : "عضو")}
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
          <MeetingCallAlert />

          <div className="flex-1 overflow-auto p-3 md:p-6">
            <AppBreadcrumbs
              role={role}
              flags={flags}
              permissions={user?.permissions || []}
              allRoles={
                user?.roles && user.roles.length > 0
                  ? user.roles
                  : user?.role
                    ? [user.role]
                    : []
              }
            />
            {showMediaLicenseWarningBanner ? (
              <button
                type="button"
                onClick={openMediaLicenseForm}
                className="mb-4 w-full rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-start text-sm font-medium leading-relaxed text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200 dark:hover:bg-red-950/70"
                data-testid="banner-media-license-warning"
              >
                {MEDIA_LICENSE_DASHBOARD_WARNING}
              </button>
            ) : null}
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
    </DirectionProvider>
    </DashboardThemeProvider>
  );
}
