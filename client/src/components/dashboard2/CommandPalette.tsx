import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  FilePlus2,
  Newspaper,
  ImagePlus,
  BellRing,
  CalendarDays,
  Gauge,
  LayoutDashboard,
  Search,
  type LucideIcon,
} from "lucide-react";
import { hasPermission, hasRole, type User } from "@/hooks/useAuth";
import type { NavItem } from "@/nav/types";

interface ArticleHit {
  id: string;
  title: string;
  categoryName?: string | null;
}

interface SearchResponse {
  results?: ArticleHit[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navItems: NavItem[];
  user: User | null;
}

const QUICK_ACTION_DEFS: {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  allowed: (user: User | null) => boolean;
}[] = [
  { id: "new-article", label: "خبر جديد", href: "/dashboard/articles/new", icon: FilePlus2, allowed: (u) => hasPermission(u, "articles.create") },
  { id: "articles", label: "إدارة الأخبار والمقالات", href: "/dashboard/articles", icon: Newspaper, allowed: (u) => hasPermission(u, "articles.view") },
  { id: "media", label: "رفع وسائط إلى المكتبة", href: "/dashboard/media-library", icon: ImagePlus, allowed: (u) => hasPermission(u, "media.upload") || hasPermission(u, "media.view") },
  { id: "push", label: "إرسال إشعار Push", href: "/dashboard/push-notifications", icon: BellRing, allowed: (u) => hasRole(u, "admin") },
  { id: "calendar", label: "التقويم التحريري", href: "/dashboard/calendar", icon: CalendarDays, allowed: () => true },
  { id: "classic", label: "اللوحة الكلاسيكية", href: "/dashboard", icon: LayoutDashboard, allowed: () => true },
  { id: "command", label: "مركز القيادة (هذه الصفحة)", href: "/dashboard2", icon: Gauge, allowed: () => true },
];

export function CommandPalette({ open, onOpenChange, navItems, user }: CommandPaletteProps) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebounced("");
    }
  }, [open]);

  const canViewArticles = hasPermission(user, "articles.view");

  const { data: searchData, isFetching } = useQuery<SearchResponse>({
    queryKey: [`/api/search?q=${encodeURIComponent(debounced)}&limit=5`],
    enabled: open && canViewArticles && debounced.length >= 2,
  });

  const quickActions = useMemo(() => QUICK_ACTION_DEFS.filter((a) => a.allowed(user)), [user]);
  const sections = useMemo(() => navItems.filter((item) => !!item.path), [navItems]);
  const results = Array.isArray(searchData?.results) ? searchData!.results.slice(0, 5) : [];

  const go = (href: string) => {
    onOpenChange(false);
    setLocation(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="ابحث عن صفحة، أداة، أو خبر…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-1 py-6 text-center">
            <Search className="h-5 w-5 text-muted-foreground/60" />
            <span className="text-sm text-muted-foreground">لا نتائج مطابقة</span>
          </div>
        </CommandEmpty>

        {debounced.length >= 2 && canViewArticles ? (
          <CommandGroup heading="نتائج الأخبار">
            {isFetching && results.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">جارٍ البحث…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">لا أخبار مطابقة</div>
            ) : (
              results.map((hit) => (
                <CommandItem
                  key={hit.id}
                  value={`خبر ${hit.title} ${hit.categoryName ?? ""}`}
                  onSelect={() => go(`/dashboard/articles/${hit.id}/edit`)}
                  className="gap-2"
                >
                  <Newspaper className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                  {hit.categoryName ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">{hit.categoryName}</Badge>
                  ) : null}
                </CommandItem>
              ))
            )}
          </CommandGroup>
        ) : null}

        {quickActions.length > 0 ? (
          <>
            {debounced.length >= 2 && canViewArticles ? <CommandSeparator /> : null}
            <CommandGroup heading="إجراءات سريعة">
              {quickActions.map((action) => (
                <CommandItem
                  key={action.id}
                  value={`إجراء ${action.label}`}
                  onSelect={() => go(action.href)}
                  className="gap-2"
                >
                  <action.icon className="h-4 w-4 text-primary" />
                  <span>{action.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        {sections.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="الأقسام والأدوات">
              {sections.map((item) => {
                const Icon = item.icon;
                const label = item.labelAr || item.labelKey;
                return (
                  <CommandItem
                    key={item.id}
                    value={`قسم ${label}`}
                    onSelect={() => go(item.path!)}
                    className="gap-2"
                  >
                    {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : <LayoutDashboard className="h-4 w-4 text-muted-foreground" />}
                    <span>{label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
