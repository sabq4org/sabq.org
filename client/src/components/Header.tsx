import { Menu, User, LogOut, LayoutDashboard, Bell, Newspaper, Brain, Sparkles, ExternalLink, Zap, Home, Clock, BookOpen, Boxes, Bookmark, ChevronLeft, FolderOpen, Search } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAccountMenu } from "@/components/UserAccountMenu";
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
import kingsCupEmblem from "@assets/kings-cup-logo.png";
import type { Category } from "@shared/schema";
import { SearchDialog } from "./SearchDialog";
import { hasPermission } from "@/hooks/useAuth";

interface HeaderProps {
  user?: { name?: string | null; email?: string; role?: string; profileImageUrl?: string | null; permissions?: string[] } | null;
  onMenuClick?: () => void;
  /** افتراضيًا الهيدر لاصق أعلى الصفحة. صفحات معيّنة (مثل لوحة المباريات) تعطّله
   *  ليُمرَّر طبيعيًا ويختفي عند النزول مُفسحًا المجال لشريط فلاتر لاصق وحده. */
  sticky?: boolean;
}

export function Header({ user, onMenuClick, sticky = true }: HeaderProps) {
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

  // إظهار رابط كأس الملك في الهيدر فقط عند تفعيل البلوك من لوحة التحكم
  const { data: kingsCupOverview } = useQuery<{ blockHidden?: boolean }>({
    queryKey: ["/api/kings-cup/overview"],
    staleTime: 5 * 60_000,
  });
  const showKingsCupLink = Boolean(kingsCupOverview) && kingsCupOverview?.blockHidden !== true;
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
    { name: "عقل سبق", href: "/sabq-ai", icon: Brain },
  ];

  return (
    <>
    <header role="banner" aria-label="رأس الصفحة الرئيسي" className={`${sticky ? "sticky top-0" : "relative"} z-50 w-full border-b bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60`} dir="rtl">
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
                  width={751}
                  height={681}
                  loading="eager"
                  decoding="async"
                />
              </span>
            </Link>
            {showKingsCupLink && (
              <Link href="/kings-cup">
                <span
                  className="flex items-center hover-elevate active-elevate-2 rounded-md px-2 py-1.5 cursor-pointer border-s border-border/60 ps-3"
                  data-testid="link-kings-cup-header"
                  aria-label="تغطية كأس خادم الحرمين الشريفين"
                >
                  <span className="rounded-md p-0.5 bg-white">
                    <img
                      src={kingsCupEmblem}
                      alt="كأس خادم الحرمين الشريفين"
                      className="h-9 w-auto object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                </span>
              </Link>
            )}
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
                  width={751}
                  height={681}
                  loading="eager"
                  decoding="async"
                />
              </span>
            </Link>
            {showKingsCupLink && (
              <Link href="/kings-cup">
                <span
                  className="flex items-center hover-elevate active-elevate-2 rounded-md px-1.5 py-1 cursor-pointer border-s border-border/60 ps-2.5"
                  data-testid="link-kings-cup-header-mobile"
                  aria-label="تغطية كأس خادم الحرمين الشريفين"
                >
                  <span className="rounded-md p-0.5 bg-white">
                    <img
                      src={kingsCupEmblem}
                      alt="كأس خادم الحرمين الشريفين"
                      className="h-8 w-auto object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                </span>
              </Link>
            )}
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
                    {section.icon && (
                      <section.icon
                        className={`h-3.5 w-3.5 ${section.href === "/sabq-ai" ? "text-primary" : ""}`}
                        aria-hidden="true"
                      />
                    )}
                    {section.name}
                  </span>
                </Link>
              )
            ))}
            {/* discover-users hidden */}
          </nav>

          {/* Actions - Right side */}
          {/* max-sm: shrink icon buttons (.w-9) to 32px + zero gap so the header fits narrow Android/Chrome widths; the EN language pill (size=sm, no .w-9) is left untouched */}
          <div className="flex items-center gap-0.5 max-sm:gap-0 max-sm:[&_.w-9]:size-8">
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
            <div className="md:hidden flex items-center gap-0.5 max-sm:gap-0">
              <SearchDialog />
              <LanguageSwitcher />
              <ThemeToggle />

              {/* Notification Bell - Mobile */}
              {user && <NotificationBell />}

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
                  <DropdownMenuContent align="end" className="w-72">
                    <UserAccountMenu
                      user={user}
                      onLogout={handleLogout}
                      testIdSuffix="-mobile"
                    />
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
            <div className="hidden md:flex items-center gap-1">
              <SearchDialog />
              <AccessibilitySettings variant="desktop" />
              <LanguageSwitcher />
              <VariantSwitcher />
              <ThemeToggle />
              
              {/* Notification Bell - Desktop */}
              {user && <NotificationBell />}

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
                  <DropdownMenuContent align="start" className="w-72">
                    <UserAccountMenu user={user} onLogout={handleLogout} />
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
        <SheetContent
          side="right"
          dir="rtl"
          className="w-[300px] flex flex-col p-0 text-right [&>button]:left-4 [&>button]:right-auto"
        >
          <SheetHeader className="flex-shrink-0 p-4 pl-12 border-b text-right sm:text-right">
            <div className="flex items-center gap-3">
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
                  width={751}
                  height={681}
                  decoding="async"
                />
              </Link>
              <SheetTitle className="flex-1 text-right text-lg font-bold">القائمة</SheetTitle>
            </div>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto text-right [&_a]:block [&_a>span]:w-full">
            {/* التصفح الرئيسي - Main Navigation */}
            <div className="p-3">
              <h3 className="px-3 py-2 text-xs font-semibold text-foreground/65 uppercase tracking-wider">
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
                <Link href="/sabq-ai">
                  <span
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover-elevate active-elevate-2 cursor-pointer"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid="link-mobile-sabq-ai"
                  >
                    <Brain className="h-5 w-5 text-primary" aria-hidden="true" />
                    عقل سبق
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
              <h3 className="px-3 py-2 text-xs font-semibold text-foreground/65 uppercase tracking-wider">
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
                        className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-xs font-medium text-foreground hover-elevate active-elevate-2 cursor-pointer"
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
                <h3 className="px-3 py-2 text-xs font-semibold text-foreground/65 uppercase tracking-wider">
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


            {/* النمط البصري - Visual Style */}
            <div className="p-3 border-t">
              <h3 className="px-3 py-2 text-xs font-semibold text-foreground/65 uppercase tracking-wider">
                النمط البصري
              </h3>
              <VariantSwitcher inline onSelect={() => setMobileMenuOpen(false)} />
            </div>

            {/* إعدادات الوصول - Accessibility Settings */}
            <div className="p-3 border-t">
              <h3 className="px-3 py-2 text-xs font-semibold text-foreground/65 uppercase tracking-wider">
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
