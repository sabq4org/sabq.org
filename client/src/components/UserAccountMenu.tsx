/**
 * محتوى قائمة حساب المستخدم في الهيدر —
 * بطاقة ولاء + شرائح سريعة + روابط بلا قوائم فرعية.
 */
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, LogOut, Trophy } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { User as AuthUser } from "@/hooks/useAuth";
import { tierProgress } from "@shared/loyalty";
import { formatNumber } from "@/lib/format";
import { getQueryFn } from "@/lib/queryClient";
import {
  ACCOUNT_QUICK_CHIPS,
  getMemberMenuItems,
  getStaffMenuItems,
} from "@/nav/accountMenuItems";

type LoyaltySummary = {
  points: {
    totalPoints: number;
    lifetimePoints: number;
    currentRank: string;
    rankLevel: number;
  } | null;
  weekPoints: number;
  streakDays: number;
};

type MenuUser = {
  name?: string | null;
  email?: string | null;
  role?: string;
  profileImageUrl?: string | null;
  permissions?: string[];
};

type Props = {
  user: MenuUser;
  onLogout: () => void;
  /** لاحقة testid للتمييز بين موبايل وديسكتوب */
  testIdSuffix?: string;
};

type NotificationsResponse = {
  unreadCount?: number;
};

export function UserAccountMenu({ user, onLogout, testIdSuffix = "" }: Props) {
  const suffix = testIdSuffix;
  const authUser = user as AuthUser;

  const { data: loyalty } = useQuery<LoyaltySummary>({
    queryKey: ["/api/loyalty/summary"],
  });

  const { data: bookmarksRaw } = useQuery<unknown>({
    queryKey: ["/api/profile/bookmarks"],
  });
  const bookmarksCount = Array.isArray(bookmarksRaw) ? bookmarksRaw.length : 0;

  const { data: notifData } = useQuery<NotificationsResponse>({
    queryKey: ["/api/notifications", { limit: 20, read: false }],
    queryFn: getQueryFn<NotificationsResponse>({ on401: "returnNull", silent: true }),
  });
  const inboxCount = notifData?.unreadCount ?? 0;

  const lifetime = loyalty?.points?.lifetimePoints ?? 0;
  const balance = loyalty?.points?.totalPoints ?? 0;
  const { current, next, pointsToNext } = tierProgress(lifetime);
  const progressPct = next
    ? Math.min(
        100,
        ((lifetime - current.minLifetimePoints) /
          (next.minLifetimePoints - current.minLifetimePoints)) *
          100,
      )
    : 100;

  const memberItems = getMemberMenuItems(authUser);
  const staffItems = getStaffMenuItems(authUser);

  const chipCount = (key?: "bookmarks" | "inbox") => {
    if (key === "bookmarks") return bookmarksCount;
    if (key === "inbox") return inboxCount;
    return undefined;
  };

  return (
    <>
      <div className="px-3 py-2.5" dir="rtl">
        <p className="text-sm font-bold truncate">{user.name || "عضو سبق"}</p>
        {user.email && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
        )}
      </div>

      <div className="px-2 pb-2" dir="rtl">
        <a
          href="/loyalty"
          className="block rounded-lg border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-primary/5 px-3 py-2.5 hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`link-loyalty-wallet${suffix}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full shrink-0"
                  style={{ backgroundColor: `${current.color}22`, color: current.color }}
                >
                  <Trophy className="h-3 w-3" aria-hidden="true" />
                </span>
                <span className="text-sm font-extrabold truncate" style={{ color: current.color }}>
                  {current.nameAr}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-xl font-extrabold tabular-nums leading-none">
                  {formatNumber(balance)}
                </span>
                <span className="text-xs text-muted-foreground">نقطة</span>
              </div>
            </div>
            <span className="text-[11px] font-bold text-primary inline-flex items-center gap-0.5 shrink-0 mt-0.5">
              نقاطي ومكافآتي
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>
          {next && (
            <div className="mt-2">
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{ width: `${progressPct}%`, backgroundColor: current.color }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {formatNumber(pointsToNext)} للمستوى التالي · {next.nameAr}
              </p>
            </div>
          )}
        </a>
      </div>

      {/* شرائح سريعة */}
      <div className="grid grid-cols-3 gap-1 px-2 pb-2" dir="rtl">
        {ACCOUNT_QUICK_CHIPS.map((chip) => {
          const Icon = chip.icon;
          const count = chipCount(chip.countKey);
          return (
            <a
              key={chip.id}
              href={chip.href}
              className="flex flex-col items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 px-1 py-2 text-center hover:bg-muted/70 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
              data-testid={`${chip.testId}${suffix}`}
            >
              <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-[10px] font-semibold leading-tight truncate max-w-full px-0.5">
                {chip.labelAr}
              </span>
              {typeof count === "number" && count > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </a>
          );
        })}
      </div>

      <DropdownMenuSeparator />

      {memberItems.map((item) => {
        const Icon = item.icon;
        return (
          <DropdownMenuItem key={item.id} asChild>
            <a
              href={item.href}
              className="flex w-full items-center cursor-pointer"
              data-testid={`${item.testId}${suffix}`}
            >
              <Icon className="ml-2 h-4 w-4" aria-hidden="true" />
              {item.labelAr}
            </a>
          </DropdownMenuItem>
        );
      })}

      {staffItems.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground">
            أدوات العمل
          </DropdownMenuLabel>
          {staffItems.map((item) => {
            const Icon = item.icon;
            return (
              <DropdownMenuItem key={item.id} asChild>
                <a
                  href={item.href}
                  className="flex w-full items-center cursor-pointer"
                  data-testid={`${item.testId}${suffix}`}
                >
                  <Icon className="ml-2 h-4 w-4" aria-hidden="true" />
                  {item.labelAr}
                </a>
              </DropdownMenuItem>
            );
          })}
        </>
      )}

      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={onLogout}
        className="flex w-full items-center cursor-pointer"
        data-testid={`link-logout${suffix}`}
      >
        <LogOut className="ml-2 h-4 w-4" aria-hidden="true" />
        تسجيل الخروج
      </DropdownMenuItem>
    </>
  );
}
