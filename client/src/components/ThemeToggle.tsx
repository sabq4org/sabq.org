import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      aria-label={theme === "light" ? "تفعيل الوضع الليلي المريح" : "تفعيل الوضع الفاتح"}
      title={theme === "light" ? "الوضع الليلي المريح" : "الوضع الفاتح"}
      data-testid="button-theme-toggle"
      className="hover-elevate active-elevate-2"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">
        {theme === "light" ? "تفعيل الوضع الليلي المريح" : "تفعيل الوضع الفاتح"}
      </span>
    </Button>
  );
}
