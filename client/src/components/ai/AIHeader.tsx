import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { 
  Brain, 
  Menu, 
  X, 
  Search,
  Moon,
  Sun,
  Globe,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "next-themes";

interface Category {
  slug: string;
  nameAr: string;
  nameEn?: string;
}

interface AIHeaderProps {
  categories?: Category[];
  baseUrl?: string;
  logoUrl?: string;
}

// Default categories (full AI section - 7 categories)
const defaultCategories: Category[] = [
  { slug: "ai-news", nameAr: "آي سبق - أخبار AI", nameEn: "AI News" },
  { slug: "ai-insights", nameAr: "آي عمق - تحليلات", nameEn: "AI Insights" },
  { slug: "ai-opinions", nameAr: "آي رأي - آراء", nameEn: "AI Opinions" },
  { slug: "ai-tools", nameAr: "آي تطبيق - أدوات", nameEn: "AI Tools" },
  { slug: "ai-voice", nameAr: "آي صوت - بودكاست", nameEn: "AI Voice" },
  { slug: "ai-academy", nameAr: "آي أكاديمي - تعليم", nameEn: "AI Academy" },
  { slug: "ai-community", nameAr: "آي تواصل - مجتمع", nameEn: "AI Community" },
];

export default function AIHeader({ categories = defaultCategories, baseUrl = "/ai", logoUrl }: AIHeaderProps) {
  const actualLogoUrl = logoUrl || baseUrl;
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [location] = useLocation();
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navItems = (categories || []).map(cat => ({
    href: `${baseUrl}/category/${cat.slug}`,
    label: language === "ar" ? cat.nameAr : (cat.nameEn || cat.nameAr)
  }));

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled 
          ? "bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/50" 
          : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo Section */}
          <div className="flex items-center gap-4">
            <Link href={actualLogoUrl}>
              <div className="flex items-center gap-2 cursor-pointer group">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 10 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center"
                >
                  <Brain className="w-6 h-6 text-white" />
                </motion.div>
                <div className="flex flex-col">
                  <span className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                    آي فوكس
                  </span>
                  <span className="text-xs text-gray-500">iFox AI</span>
                </div>
              </div>
            </Link>

            {/* Live Indicator */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/30 rounded-full">
              <Activity className="w-3 h-3 text-green-400" />
              <span className="text-xs text-green-400 font-medium">LIVE</span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <Button
                  variant="ghost"
                  className={`text-gray-300 hover:text-white hover:bg-slate-800/50 ${
                    location.startsWith(item.href) ? "bg-slate-800/50 text-white" : ""
                  }`}
                  data-testid={`nav-${item.href.split('/').pop()}`}
                >
                  {item.label}
                </Button>
              </Link>
            ))}
          </nav>

          {/* Right Section */}
          <div className="flex items-center gap-2">
            {/* Search Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="text-gray-400 hover:text-white hover:bg-slate-800/50"
              data-testid="button-search"
            >
              <Search className="w-5 h-5" />
            </Button>

            {/* Language Switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-gray-400 hover:text-white hover:bg-slate-800/50"
                  data-testid="button-language"
                >
                  <Globe className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-slate-900 border-slate-800">
                <DropdownMenuItem
                  onClick={() => setLanguage("ar")}
                  className="text-gray-300 hover:text-white hover:bg-slate-800"
                >
                  العربية
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLanguage("en")}
                  className="text-gray-300 hover:text-white hover:bg-slate-800"
                >
                  English
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="text-gray-400 hover:text-white hover:bg-slate-800/50"
              data-testid="button-theme"
            >
              {theme === "dark" ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </Button>

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden text-gray-400 hover:text-white hover:bg-slate-800/50"
              data-testid="button-mobile-menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </Button>

            {/* Back to Main Site */}
            <Link href="/">
              <Button
                variant="outline"
                className="hidden md:flex border-slate-700 text-gray-300 hover:text-white hover:bg-slate-800/50"
                data-testid="button-back-to-main"
              >
                {language === "ar" ? "الموقع الرئيسي" : "Main Site"}
              </Button>
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        {isSearchOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="py-4 border-t border-slate-800"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <Input
                type="search"
                placeholder={language === "ar" ? "ابحث في محتوى AI..." : "Search AI content..."}
                className="w-full pl-10 bg-slate-900/50 border-slate-800 text-white placeholder:text-gray-500 focus:border-blue-500"
                data-testid="input-search"
              />
            </div>
          </motion.div>
        )}

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden py-4 border-t border-slate-800"
          >
            <div className="flex flex-col gap-2">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant="ghost"
                    className={`w-full justify-start text-gray-300 hover:text-white hover:bg-slate-800/50 ${
                      location.startsWith(item.href) ? "bg-slate-800/50 text-white" : ""
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.label}
                  </Button>
                </Link>
              ))}
              <Link href="/">
                <Button
                  variant="outline"
                  className="w-full mt-2 border-slate-700 text-gray-300 hover:text-white hover:bg-slate-800/50"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {language === "ar" ? "الموقع الرئيسي" : "Main Site"}
                </Button>
              </Link>
            </div>
          </motion.nav>
        )}
      </div>
    </motion.header>
  );
}