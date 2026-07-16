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

function writeFavoriteIds(ids: string[]) {
  try {
    localStorage.setItem(DASHBOARD_FAVORITES_STORAGE_KEY, JSON.stringify(ids));
  } catch (error) {
    console.error("Failed to save sidebar favorites:", error);
  }
}

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function useDashboardFavorites(navigableItems: NavItem[]) {
  const { toast } = useToast();
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readFavoriteIds());

  // مزامنة بين الشريط والرئيسية (وبعد الكتابة المتزامنة لـ localStorage)
  useEffect(() => {
    const sync = () => {
      const next = readFavoriteIds();
      setFavoriteIds((current) => (sameIds(current, next) ? current : next));
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
      const label = item.labelAr || item.labelKey;
      setFavoriteIds((current) => {
        let next: string[];
        let action: "added" | "removed" | "full" = "added";
        if (current.includes(item.id)) {
          next = current.filter((id) => id !== item.id);
          action = "removed";
        } else if (current.length >= DASHBOARD_MAX_FAVORITES) {
          toast({
            title: "اكتملت المفضلة",
            description: `يمكن تثبيت ${DASHBOARD_MAX_FAVORITES} عناصر كحد أقصى`,
          });
          return current;
        } else {
          next = [...current, item.id];
          action = "added";
        }

        // اكتب قبل بثّ المزامنة — وإلا المستمع يقرأ القيمة القديمة ويعيد التراجع
        writeFavoriteIds(next);
        queueMicrotask(() => {
          window.dispatchEvent(new Event(FAVORITES_SYNC_EVENT));
          if (action === "added") {
            toast({ title: "أُضيفت للمفضلة", description: label });
          } else if (action === "removed") {
            toast({ title: "أُزيلت من المفضلة", description: label });
          }
        });
        return next;
      });
    },
    [toast],
  );

  return { favoriteIds, favoriteItems, toggleFavorite, maxFavorites: DASHBOARD_MAX_FAVORITES };
}
