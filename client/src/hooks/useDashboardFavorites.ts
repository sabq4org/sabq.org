/**
 * مفضلة قائمة لوحة التحكم — مشتركة بين الشريط الجانبي والصفحة الرئيسية.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { NavItem } from "@/nav/types";

export const DASHBOARD_FAVORITES_STORAGE_KEY = "sabq.sidebar.favorites.v1";
export const DASHBOARD_MAX_FAVORITES = 5;
const FAVORITES_SYNC_EVENT = "sabq:dashboard-favorites-changed";

function readFavoriteIds(): string[] {
  try {
    const stored = localStorage.getItem(DASHBOARD_FAVORITES_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.slice(0, DASHBOARD_MAX_FAVORITES) : [];
  } catch {
    return [];
  }
}

export function useDashboardFavorites(navigableItems: NavItem[]) {
  const { toast } = useToast();
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readFavoriteIds());

  useEffect(() => {
    try {
      localStorage.setItem(DASHBOARD_FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds));
    } catch (error) {
      console.error("Failed to save sidebar favorites:", error);
    }
  }, [favoriteIds]);

  // مزامنة بين التبويبات / الصفحة الرئيسية والشريط (نفس التبويب + تبويبات أخرى)
  useEffect(() => {
    const sync = () => {
      const next = readFavoriteIds();
      setFavoriteIds((current) =>
        current.length === next.length && current.every((id, i) => id === next[i]) ? current : next,
      );
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DASHBOARD_FAVORITES_STORAGE_KEY) return;
      sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(FAVORITES_SYNC_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(FAVORITES_SYNC_EVENT, sync);
    };
  }, []);

  const favoriteItems = useMemo(() => {
    return favoriteIds.flatMap((id) => {
      const item = navigableItems.find((candidate) => candidate.id === id);
      return item ? [item] : [];
    });
  }, [favoriteIds, navigableItems]);

  const toggleFavorite = useCallback(
    (item: NavItem) => {
      setFavoriteIds((current) => {
        let next = current;
        if (current.includes(item.id)) {
          next = current.filter((id) => id !== item.id);
        } else if (current.length >= DASHBOARD_MAX_FAVORITES) {
          toast({
            title: "اكتملت المفضلة",
            description: `يمكن تثبيت ${DASHBOARD_MAX_FAVORITES} عناصر كحد أقصى`,
          });
          return current;
        } else {
          next = [...current, item.id];
        }
        queueMicrotask(() => window.dispatchEvent(new Event(FAVORITES_SYNC_EVENT)));
        return next;
      });
    },
    [toast],
  );

  return { favoriteIds, favoriteItems, toggleFavorite, maxFavorites: DASHBOARD_MAX_FAVORITES };
}
