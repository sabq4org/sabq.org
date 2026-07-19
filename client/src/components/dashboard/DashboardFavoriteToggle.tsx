import { Star } from "lucide-react";
import { useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth, getHighestRole } from "@/hooks/useAuth";
import { useDashboardFavorites } from "@/hooks/useDashboardFavorites";
import { useNav } from "@/nav/useNav";
import { resolveUserRole } from "@/lib/roleMapping";
import type { NavItem } from "@/nav/types";
import { cn } from "@/lib/utils";

type DashboardFavoriteToggleProps = {
  className?: string;
  /** إن مُرِّر يُستخدم مباشرة بدل استنتاج الصفحة النشطة من المسار */
  item?: NavItem | null;
};

/**
 * نجمة تفضيل بجانب اسم الصفحة — يُفضَّل القسم بعد الدخول إليه، لا من القائمة.
 */
export function DashboardFavoriteToggle({ className, item: itemProp }: DashboardFavoriteToggleProps) {
  const [pathname] = useLocation();
  const { user } = useAuth();
  const highestRole = getHighestRole(user);
  const role = resolveUserRole(highestRole);
  const flags = useMemo(
    () => ({ aiDeepAnalysis: false, smartThemes: true, audioSummaries: false }),
    [],
  );
  const { activeItem, flat } = useNav({
    role,
    flags,
    pathname,
    permissions: user?.permissions || [],
    allRoles: user?.roles && user.roles.length > 0 ? user.roles : user?.role ? [user.role] : [],
  });
  const navigableItems = useMemo(() => {
    const seen = new Set<string>();
    return flat.filter((navItem) => {
      if (!navItem.path || seen.has(navItem.path)) return false;
      seen.add(navItem.path);
      return true;
    });
  }, [flat]);
  const { favoriteIds, toggleFavorite } = useDashboardFavorites(navigableItems);

  const item = itemProp === undefined ? activeItem : itemProp;
  if (!item?.path || !item.id) return null;

  const label = item.labelAr || item.labelKey;
  const isFavorite = favoriteIds.includes(item.id);

  return (
    <button
      type="button"
      onClick={() => toggleFavorite(item)}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isFavorite && "text-warning",
        className,
      )}
      aria-label={isFavorite ? `إزالة ${label} من المفضلة` : `إضافة ${label} إلى المفضلة`}
      title={isFavorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
      data-testid={`page-favorite-toggle-${item.id}`}
    >
      <Star className={cn("h-5 w-5", isFavorite && "fill-current")} />
    </button>
  );
}
