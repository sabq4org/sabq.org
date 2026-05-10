import { Menu, User, LogOut, LayoutDashboard, Bell, Newspaper } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { EnglishNotificationBell } from "@/components/en/EnglishNotificationBell";
import LanguageSwitcher from "@/components/LanguageSwitcher";
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
import type { EnCategory } from "@shared/schema";

interface EnglishHeaderProps {
  user?: { name?: string | null; email?: string; role?: string; profileImageUrl?: string | null };
  onMenuClick?: () => void;
}

export function EnglishHeader({ user, onMenuClick }: EnglishHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { theme, appTheme } = useTheme();

  // Determine logo based on theme and active app theme
  const currentLogo = appTheme?.assets?.logoLight && theme === 'light'
    ? appTheme.assets.logoLight
    : appTheme?.assets?.logoDark && theme === 'dark'
    ? appTheme.assets.logoDark
    : logoImage;

  // Fetch English categories
  const { data: categoriesRaw } = useQuery<EnCategory[]>({
    queryKey: ["/api/en/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const handleLogout = async () => {
    try {
      await apiRequest("/api/logout", { method: "POST" });
      toast({
        title: "Logged out",
        description: "See you soon",
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
    return 'S';
  };

  const mainSections = [
    { name: "News", href: "/en/news" },
    { name: "Categories", href: "/en/categories" },
    { name: "Moment by Moment", href: "/en/moment-by-moment" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo - Left side (Desktop only) */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/en">
              <span className="flex items-center gap-3 hover-elevate active-elevate-2 rounded-md px-2 py-2 cursor-pointer" data-testid="link-home">
                <img 
                  src={currentLogo} 
                  alt="SABQ - Sabq" 
                  className="h-10 w-auto object-contain"
                />
              </span>
            </Link>
          </div>

          {/* Mobile Logo */}
          <div className="md:hidden flex items-center">
            <Link href="/en">
              <span className="flex items-center gap-3 hover-elevate active-elevate-2 rounded-md px-2 py-2 cursor-pointer" data-testid="link-home-mobile">
                <img 
                  src={currentLogo} 
                  alt="SABQ - Sabq" 
                  className="h-10 w-auto object-contain"
                />
              </span>
            </Link>
          </div>

          {/* Main Navigation - Center (Desktop only) */}
          <nav className="hidden md:flex items-center gap-6 flex-1 justify-center">
            {mainSections.map((section) => (
              <Link key={section.name} href={section.href}>
                <span className="text-sm font-medium text-foreground hover:text-primary transition-colors whitespace-nowrap cursor-pointer" data-testid={`link-section-${section.name}`}>
                  {section.name}
                </span>
              </Link>
            ))}
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
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Mobile Actions */}
            <div className="md:hidden flex items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
              
              {/* TEMPORARILY HIDDEN */}
              {/* {user && <EnglishNotificationBell />} */}

              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="hover-elevate active-elevate-2"
                      data-testid="button-user-menu-mobile"
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
                    {(user.role === "editor" || user.role === "admin") && (
                      <>
                        <DropdownMenuItem asChild>
                          <a href="/en/dashboard" className="flex w-full items-center cursor-pointer" data-testid="link-dashboard-mobile">
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            Dashboard
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem asChild>
                      <a href="/en/daily-brief" className="flex w-full items-center cursor-pointer" data-testid="link-daily-brief-mobile">
                        <Newspaper className="mr-2 h-4 w-4" />
                        Daily Brief
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/en/profile" className="flex w-full items-center cursor-pointer" data-testid="link-profile-mobile">
                        <User className="mr-2 h-4 w-4" />
                        Profile
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/en/notification-settings" className="flex w-full items-center cursor-pointer" data-testid="link-notification-settings-mobile">
                        <Bell className="mr-2 h-4 w-4" />
                        Notification Settings
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={handleLogout}
                      className="flex w-full items-center cursor-pointer" 
                      data-testid="link-logout-mobile"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button 
                  size="icon" 
                  variant="ghost" 
                  data-testid="button-login-mobile"
                  onClick={() => window.location.href = "/login"}
                >
                  <User className="h-5 w-5" />
                </Button>
              )}
            </div>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
              
              {/* TEMPORARILY HIDDEN */}
              {/* {user && <EnglishNotificationBell />} */}

              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="hover-elevate active-elevate-2"
                      data-testid="button-user-menu"
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
                    {(user.role === "editor" || user.role === "admin") && (
                      <>
                        <DropdownMenuItem asChild>
                          <a href="/en/dashboard" className="flex w-full items-center cursor-pointer" data-testid="link-dashboard">
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            Dashboard
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem asChild>
                      <a href="/en/daily-brief" className="flex w-full items-center cursor-pointer" data-testid="link-daily-brief">
                        <Newspaper className="mr-2 h-4 w-4" />
                        Daily Brief
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/en/profile" className="flex w-full items-center cursor-pointer" data-testid="link-profile">
                        <User className="mr-2 h-4 w-4" />
                        Profile
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/en/notification-settings" className="flex w-full items-center cursor-pointer" data-testid="link-notification-settings">
                        <Bell className="mr-2 h-4 w-4" />
                        Notification Settings
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={handleLogout}
                      className="flex w-full items-center cursor-pointer" 
                      data-testid="link-logout"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button 
                  size="sm" 
                  data-testid="button-login"
                  onClick={() => window.location.href = "/login"}
                >
                  Login
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[300px] sm:w-[400px]">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 mt-8">
            {mainSections.map((section) => (
              <Link key={section.name} href={section.href}>
                <span 
                  className="flex items-center gap-3 text-lg font-medium hover:text-primary transition-colors cursor-pointer"
                  onClick={() => setMobileMenuOpen(false)}
                  data-testid={`link-mobile-${section.name}`}
                >
                  {section.name}
                </span>
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
