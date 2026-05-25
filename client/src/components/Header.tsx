import { Menu, User, LogOut, LayoutDashboard, Bell, Newspaper, MessageSquare, Brain, Sparkles, ExternalLink, Zap, Home, Clock, BookOpen, Boxes, Bookmark, ChevronLeft, FolderOpen, Search, Eye } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { VariantSwitcher } from "./VariantSwitcher";
import { AccessibilitySettings } from "./AccessibilitySettings";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { AdSlot } from "./AdSlot";
import { BreakingNewsTicker } from "./BreakingNewsTicker";
import { NotificationBell } from "./NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/ThemeProvider";
import logoImage from "@assets/sabq-logo.png";
import type { Category } from "@shared/schema";
import { SearchDialog } from "./SearchDialog";
import { hasPermission } from "@/hooks/useAuth";
import { HajjEidGreetingBar, HajjEidHeaderDecor } from "./seasonal/HajjEidTheme";

interface HeaderProps {
  user?: { name?: string | null; email?: string; role?: string; profileImageUrl?: string | null; permissions?: string[] } | null;
  onMenuClick?: () => void;
}

export function Header({ user, onMenuClick }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const { theme, appTheme } = useTheme();

  // Determine logo based on theme and active app theme
  const currentLogo = appTheme?.assets?.logoLight && theme === 'light'
    ? appTheme.assets.logoLight
    : appTheme?.assets?.logoDark && theme === 'dark'
    ? appTheme.assets.logoDark
    : logoImage;

  // Fetch categories
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

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

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'س';
  };

  const mainSections: Array<{ name: string; href: string; external?: boolean; icon?: typeof Zap }> = [
    { name: "الأخبار", href: "/news" },
    { name: "التصنيفات", href: "/categories" },
    { name: "مقالات", href: "/opinion" },
    { name: "مُقترب", href: "/muqtarab" },
    { name: "لحظة بلحظة", href: "/moment-by-moment" },
  ];

  return (
    <>
    <HajjEidGreetingBar />
    <header role="banner" aria-label="رأس الصفحة الرئيسي" className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60" dir="rtl">
      <HajjEidHeaderDecor />
      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo - Left side (Desktop only) */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/" onClick={(e) => {
              if (window.location.pathname === '/') {
                e.preventDefault();
                window.location.reload();
              }
            }}>
              <span className="flex items-center gap-3 hover-elevate active-elevate-2 rounded-md px-2 py-2 cursor-pointer" data-testid="link-home" aria-label="الصفحة الرئيسية">
                <img 
                  src={currentLogo} 
                  alt="سبق - SABQ" 
                  className="h-12 w-auto object-contain"
                />
              </span>
            </Link>
          </div>

          {/* Mobile Logo */}
          <div className="md:hidden flex items-center">
            <Link href="/" onClick={(e) => {
              if (window.location.pathname === '/') {
                e.preventDefault();
                window.location.reload();
              }
            }}>
              <span className="flex items-center gap-3 hover-elevate active-elevate-2 rounded-md px-2 py-2 cursor-pointer" data-testid="link-home-mobile" aria-label="الصفحة الرئيسية">
                <img 
                  src={currentLogo} 
                  alt="سبق - SABQ" 
                  className="h-11 w-auto object-contain"
                />
              </span>
            </Link>
          </div>

          {/* Main Navigation - Center (Desktop only) */}
          <nav id="main-nav" role="navigation" aria-label="القائمة الرئيسية" tabIndex={-1} className="hidden md:flex items-center gap-6 flex-1 justify-center">
            {mainSections.map((section) => (
              section.external ? (
                <a 
                  key={section.name} 
                  href={section.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-foreground hover:text-primary transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1" 
                  data-testid={`link-section-${section.name}`}
                >
                  {section.name}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <Link key={section.name} href={section.href}>
                  <span 
                    className="text-sm font-medium text-foreground hover:text-primary transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1" 
                    data-testid={`link-section-${section.name}`}
                    aria-current={location === section.href ? "page" : undefined}
                  >
                    {section.icon && <section.icon className="h-3.5 w-3.5" />}
                    {section.name}
                  </span>
                </Link>
              )
            ))}
            {/* discover-users hidden */}
          </nav>

          {/* Actions - Right side */}
          <div className="flex items-center gap-2">
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden hover-elevate active-elevate-2"
              onClick={() => setMobileMenuOpen(true)}
              data-testid="button-menu"
              aria-label="فتح القائمة"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>

            {/* Mobile Actions */}
            <div className="md:hidden flex items-center gap-1">
              <SearchDialog />
              <Link href="/lite">
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover-elevate active-elevate-2"
                  data-testid="button-quick-browse-mobile"
                  aria-label="تصفح سريع"
                >
                  <Zap className="h-5 w-5" aria-hidden="true" />
                </Button>
              </Link>
              <LanguageSwitcher />
              <VariantSwitcher />
              <ThemeToggle />
              
              {/* Notification Bell - Mobile - TEMPORARILY HIDDEN */}
              {/* {user && <NotificationBell />} */}

              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="hover-elevate active-elevate-2"
                      data-testid="button-user-menu-mobile"
                      aria-label="قائمة المستخدم"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage 
                          src={user.profileImageUrl || ""} 
                          alt={user.name || user.email || ""}
                          className="object-cover"
                        />
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                          {getInitials(user.name || undefined, user.email)}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <DropdownMenuSeparator />
                    {hasPermission(user as any, "dashboard.view") && (
                      <>
                        <DropdownMenuItem asChild>
                          <a href="/dashboard" className="flex w-full items-center cursor-pointer" data-testid="link-dashboard-mobile">
                            <LayoutDashboard className="ml-2 h-4 w-4" aria-hidden="true" />
                            لوحة التحكم
                          </a>
                        </DropdownMenuItem>
                        {hasPermission(user as any, "dashboard.view_messages") && (
                          <DropdownMenuItem asChild>
                            <a href="/dashboard/communications" className="flex w-full items-center cursor-pointer" data-testid="link-communications-mobile">
                              <MessageSquare className="ml-2 h-4 w-4" aria-hidden="true" />
                              قنوات الاتصال
                            </a>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem asChild>
                      <a href="/daily-brief" className="flex w-full items-center cursor-pointer" data-testid="link-daily-brief-mobile">
                        <Newspaper className="ml-2 h-4 w-4" aria-hidden="true" />
                        ملخصي اليومي
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/profile" className="flex w-full items-center cursor-pointer" data-testid="link-profile-mobile">
                        <User className="ml-2 h-4 w-4" aria-hidden="true" />
                        الملف الشخصي
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/focus/weekly" className="flex w-full items-center cursor-pointer" data-testid="link-focus-weekly-mobile">
                        <Eye className="ml-2 h-4 w-4" aria-hidden="true" />
                        تقرير القراءة الأسبوعي
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/notification-settings" className="flex w-full items-center cursor-pointer" data-testid="link-notification-settings-mobile">
                        <Bell className="ml-2 h-4 w-4" aria-hidden="true" />
                        إعدادات الإشعارات
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={handleLogout}
                      className="flex w-full items-center cursor-pointer" 
                      data-testid="link-logout-mobile"
                    >
                      <LogOut className="ml-2 h-4 w-4" aria-hidden="true" />
                      تسجيل الخروج
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button asChild size="icon" variant="ghost" data-testid="button-login-mobile" aria-label="تسجيل الدخول">
                  <a href="/login">
                    <User className="h-5 w-5" aria-hidden="true" />
                  </a>
                </Button>
              )}
            </div>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-2">
              <SearchDialog />
              <AccessibilitySettings variant="desktop" />
              <LanguageSwitcher />
              <VariantSwitcher />
              <ThemeToggle />
              
              {/* Notification Bell - Desktop - TEMPORARILY HIDDEN */}
              {/* {user && <NotificationBell />} */}

              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="hover-elevate active-elevate-2"
                      data-testid="button-user-menu"
                      aria-label="قائمة المستخدم"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage 
                          src={user.profileImageUrl || ""} 
                          alt={user.name || user.email || ""}
                          className="object-cover"
                        />
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                          {getInitials(user.name || undefined, user.email)}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <DropdownMenuSeparator />
                    {hasPermission(user as any, "dashboard.view") && (
                      <>
                        <DropdownMenuItem asChild>
                          <a href="/dashboard" className="flex w-full items-center cursor-pointer" data-testid="link-dashboard">
                            <LayoutDashboard className="ml-2 h-4 w-4" aria-hidden="true" />
                            لوحة التحكم
                          </a>
                        </DropdownMenuItem>
                        {hasPermission(user as any, "dashboard.view_messages") && (
                          <DropdownMenuItem asChild>
                            <a href="/dashboard/communications" className="flex w-full items-center cursor-pointer" data-testid="link-communications">
                              <MessageSquare className="ml-2 h-4 w-4" aria-hidden="true" />
                              قنوات الاتصال
                            </a>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem asChild>
                      <a href="/daily-brief" className="flex w-full items-center cursor-pointer" data-testid="link-daily-brief">
                        <Newspaper className="ml-2 h-4 w-4" aria-hidden="true" />
                        ملخصي اليومي
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/profile" className="flex w-full items-center cursor-pointer" data-testid="link-profile">
                        <User className="ml-2 h-4 w-4" aria-hidden="true" />
                        الملف الشخصي
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/focus/weekly" className="flex w-full items-center cursor-pointer" data-testid="link-focus-weekly">
                        <Eye className="ml-2 h-4 w-4" aria-hidden="true" />
                        تقرير القراءة الأسبوعي
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/notification-settings" className="flex w-full items-center cursor-pointer" data-testid="link-notification-settings">
                        <Bell className="ml-2 h-4 w-4" aria-hidden="true" />
                        إعدادات الإشعارات
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={handleLogout}
                      className="flex w-full items-center cursor-pointer" 
                      data-testid="link-logout"
                    >
                      <LogOut className="ml-2 h-4 w-4" aria-hidden="true" />
                      تسجيل الخروج
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button asChild data-testid="button-login">
                  <a href="/login">
                    تسجيل الدخول
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="right" className="w-[300px] flex flex-col p-0">
          <SheetHeader className="flex-shrink-0 p-4 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-right text-lg font-bold">القائمة</SheetTitle>
              <Link href="/" onClick={(e) => {
                setMobileMenuOpen(false);
                if (window.location.pathname === '/') {
                  e.preventDefault();
                  window.location.reload();
                }
              }}>
                <img 
                  src={currentLogo} 
                  alt="سبق - SABQ" 
                  className="h-10 w-auto object-contain"
                  data-testid="img-mobile-menu-logo"
                />
              </Link>
            </div>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto">
            {/* التصفح الرئيسي - Main Navigation */}
            <div className="p-3">
              <h3 className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                التصفح الرئيسي
              </h3>
              <div className="space-y-1">
                <Link href="/" onClick={(e) => {
                  setMobileMenuOpen(false);
                  if (window.location.pathname === '/') {
                    e.preventDefault();
                    window.location.reload();
                  }
                }}>
                  <span
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover-elevate active-elevate-2 cursor-pointer"
                    data-testid="link-mobile-home"
                  >
                    <Home className="h-5 w-5 text-primary" aria-hidden="true" />
                    الرئيسية
                  </span>
                </Link>
                <Link href="/news">
                  <span
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover-elevate active-elevate-2 cursor-pointer"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="link-mobile-news"
                  >
                    <Newspaper className="h-5 w-5 text-primary" aria-hidden="true" />
                    الأخبار
                  </span>
                </Link>
                <Link href="/moment-by-moment">
                  <span
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover-elevate active-elevate-2 cursor-pointer"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="link-mobile-moment"
                  >
                    <Clock className="h-5 w-5 text-red-500" aria-hidden="true" />
                    لحظة بلحظة
                  </span>
                </Link>
                <Link href="/opinion">
                  <span
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover-elevate active-elevate-2 cursor-pointer"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="link-mobile-opinion"
                  >
                    <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
                    مقالات
                  </span>
                </Link>
                <Link href="/muqtarab">
                  <span
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover-elevate active-elevate-2 cursor-pointer"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="link-mobile-muqtarab"
                  >
                    <Boxes className="h-5 w-5 text-primary" aria-hidden="true" />
                    مُقترب
                  </span>
                </Link>
                <Link href="/lite">
                  <span
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover-elevate active-elevate-2 cursor-pointer bg-primary/5 border border-primary/20"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="link-mobile-lite"
                  >
                    <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
                    تصفح سريع
                  </span>
                </Link>
              </div>
            </div>

            {/* استكشف أكثر - Discover More */}
            <div className="p-3 border-t">
              <h3 className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                استكشف أكثر
              </h3>
              <div className="space-y-1">
                {/* discover-users hidden */}
                <Link href="/categories">
                  <span
                    className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium hover-elevate active-elevate-2 cursor-pointer"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="link-mobile-all-categories"
                  >
                    <span className="flex items-center gap-3">
                      <FolderOpen className="h-5 w-5 text-primary" aria-hidden="true" />
                      كل التصنيفات
                    </span>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                </Link>
              </div>
              
              {/* Categories Quick Links */}
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {categories
                  .filter((cat) => cat.status === "active" && cat.type === "core")
                  .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
                  .slice(0, 6)
                  .map((category) => (
                    <Link key={category.id} href={`/category/${category.englishSlug || category.slug}`}>
                      <span
                        className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium bg-muted/50 hover-elevate active-elevate-2 cursor-pointer"
                        onClick={() => setMobileMenuOpen(false)}
                        data-testid={`link-mobile-category-${category.slug}`}
                      >
                        {category.icon && <span className="text-base">{category.icon}</span>}
                        <span className="truncate">{category.nameAr}</span>
                      </span>
                    </Link>
                  ))}
              </div>
            </div>

            {/* أدواتي - My Tools (Logged-in users) */}
            {user && (
              <div className="p-3 border-t">
                <h3 className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  أدواتي
                </h3>
                <div className="space-y-1">
                  {hasPermission(user as any, "dashboard.view") && (
                    <Link href="/dashboard">
                      <span
                        className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover-elevate active-elevate-2 cursor-pointer"
                        onClick={() => setMobileMenuOpen(false)}
                        data-testid="link-mobile-dashboard"
                      >
                        <LayoutDashboard className="h-5 w-5 text-primary" aria-hidden="true" />
                        لوحة التحكم
                      </span>
                    </Link>
                  )}
                  <Link href="/daily-brief">
                    <span
                      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover-elevate active-elevate-2 cursor-pointer"
                      onClick={() => setMobileMenuOpen(false)}
                      data-testid="link-mobile-daily-brief"
                    >
                      <Newspaper className="h-5 w-5 text-primary" aria-hidden="true" />
                      ملخصي اليومي
                    </span>
                  </Link>
                  <Link href="/profile">
                    <span
                      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover-elevate active-elevate-2 cursor-pointer"
                      onClick={() => setMobileMenuOpen(false)}
                      data-testid="link-mobile-profile"
                    >
                      <User className="h-5 w-5 text-primary" aria-hidden="true" />
                      الملف الشخصي
                    </span>
                  </Link>
                  <Link href="/profile?tab=bookmarks">
                    <span
                      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover-elevate active-elevate-2 cursor-pointer"
                      onClick={() => setMobileMenuOpen(false)}
                      data-testid="link-mobile-bookmarks"
                    >
                      <Bookmark className="h-5 w-5 text-primary" aria-hidden="true" />
                      المحفوظات
                    </span>
                  </Link>
                  <Link href="/notification-settings">
                    <span
                      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover-elevate active-elevate-2 cursor-pointer"
                      onClick={() => setMobileMenuOpen(false)}
                      data-testid="link-mobile-notification-settings"
                    >
                      <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
                      إعدادات الإشعارات
                    </span>
                  </Link>
                </div>
              </div>
            )}


            {/* إعدادات الوصول - Accessibility Settings */}
            <div className="p-3 border-t">
              <h3 className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                إعدادات الوصول
              </h3>
              <div className="px-3">
                <AccessibilitySettings variant="mobile" />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          {user && (
            <div className="flex-shrink-0 p-3 border-t bg-muted/30">
              <button
                onClick={() => {
                  handleLogout();
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-3 w-full rounded-md px-3 py-2.5 text-sm font-medium text-destructive hover-elevate active-elevate-2 cursor-pointer"
                data-testid="button-mobile-logout"
              >
                <LogOut className="h-5 w-5" aria-hidden="true" />
                تسجيل الخروج
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <BreakingNewsTicker />
    </header>
    </>
  );
}
