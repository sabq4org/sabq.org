import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { 
  Brain, 
  Menu, 
  X, 
  Search,
  Activity,
  Sparkles,
  BarChart3,
  FileText,
  TrendingUp,
  Home
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface OmqHeaderProps {
  onSearch?: (query: string) => void;
}

export default function OmqHeader({ onSearch }: OmqHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [location] = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navItems = [
    { href: "/omq", label: "كل التحليلات", icon: FileText },
    { href: "/omq/stats", label: "الإحصائيات", icon: BarChart3 },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchQuery.trim());
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    if (onSearch) {
      onSearch("");
    }
  };

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled 
          ? "bg-slate-950/95 backdrop-blur-xl border-b border-indigo-500/20" 
          : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo Section */}
          <div className="flex items-center gap-4">
            <Link href="/omq">
              <div className="flex items-center gap-3 cursor-pointer group">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 10 }}
                  whileTap={{ scale: 0.95 }}
                  className="relative"
                >
                  <div className="w-11 h-11 bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                    <Brain className="w-6 h-6 text-white" />
                  </div>
                  <motion.div
                    className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 opacity-50"
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.5, 0.2, 0.5],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                </motion.div>
                <div className="flex flex-col">
                  <span className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">
                    عُمق
                  </span>
                  <span className="text-xs text-indigo-400/80">Deep Analysis</span>
                </div>
              </div>
            </Link>

            {/* Live AI Indicator */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-full">
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [1, 0.7, 1],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              </motion.div>
              <span className="text-xs text-indigo-300 font-medium">AI-Powered</span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <Button
                  variant="ghost"
                  className={`text-gray-300 hover:text-white hover:bg-indigo-500/20 gap-2 ${
                    location === item.href ? "bg-indigo-500/20 text-white" : ""
                  }`}
                  data-testid={`nav-${item.href.split('/').pop()}`}
                >
                  <item.icon className="w-4 h-4" />
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
              className="text-gray-400 hover:text-white hover:bg-indigo-500/20"
              data-testid="button-search-toggle"
            >
              <Search className="w-5 h-5" />
            </Button>

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden text-gray-400 hover:text-white hover:bg-indigo-500/20"
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
                className="hidden md:flex border-indigo-500/30 text-indigo-300 hover:text-white hover:bg-indigo-500/20 hover:border-indigo-500/50 gap-2"
                data-testid="button-back-to-main"
              >
                <Home className="w-4 h-4" />
                الرئيسية
              </Button>
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        {isSearchOpen && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="py-4 border-t border-indigo-500/20"
            onSubmit={handleSearch}
          >
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400/50" />
                <Input
                  type="search"
                  placeholder="ابحث في التحليلات العميقة..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pr-10 bg-slate-900/50 border-indigo-500/30 text-white placeholder:text-gray-500 focus:border-indigo-500"
                  data-testid="input-search"
                />
              </div>
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleClearSearch}
                  className="text-gray-400 hover:text-white hover:bg-indigo-500/20"
                  data-testid="button-clear-search"
                >
                  <X className="w-5 h-5" />
                </Button>
              )}
            </div>
          </motion.form>
        )}

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden py-4 border-t border-indigo-500/20"
          >
            <div className="flex flex-col gap-2">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant="ghost"
                    className={`w-full justify-start text-gray-300 hover:text-white hover:bg-indigo-500/20 gap-2 ${
                      location === item.href ? "bg-indigo-500/20 text-white" : ""
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Button>
                </Link>
              ))}
              <Link href="/">
                <Button
                  variant="outline"
                  className="w-full mt-2 border-indigo-500/30 text-indigo-300 hover:text-white hover:bg-indigo-500/20 gap-2"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Home className="w-4 h-4" />
                  الرئيسية
                </Button>
              </Link>
            </div>
          </motion.nav>
        )}
      </div>
    </motion.header>
  );
}
