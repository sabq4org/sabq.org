/**
 * محتوى قائمة حساب المستخدم في الهيدر —
 * بطاقة ولاء بارزة + روابط أقل ازدحامًا.
 */
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  ChevronLeft,
  Eye,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Newspaper,
  Settings,
  Trophy,
  User as UserIcon,
} from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { hasPermission, type User as AuthUser } from "@/hooks/useAuth";
import { tierProgress } from "@shared/loyalty";
import { formatNumber } from "@/lib/format";

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
  email?: string;
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

export function UserAccountMenu({ user, onLogout, testIdSuffix = "" }: Props) {
  const suffix = testIdSuffix;
  const { data: loyalty } = useQuery<LoyaltySummary>({
    queryKey: ["/api/loyalty/summary"],
  });

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
              محفظتي
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

      <DropdownMenuSeparator />

      <DropdownMenuItem asChild>
        <a
          href="/daily-brief"
          className="flex w-full items-center cursor-pointer"
          data-testid={`link-daily-brief${suffix}`}
        >
          <Newspaper className="ml-2 h-4 w-4" aria-hidden="true" />
          ملخصي اليومي
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a
          href="/profile"
          className="flex w-full items-center cursor-pointer"
          data-testid={`link-profile${suffix}`}
        >
          <UserIcon className="ml-2 h-4 w-4" aria-hidden="true" />
          الملف الشخصي
        </a>
      </DropdownMenuItem>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger data-testid={`button-account-settings${suffix}`}>
          <Settings className="ml-2 h-4 w-4" aria-hidden="true" />
          إعدادات
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-[12rem]">
          <DropdownMenuItem asChild>
            <a
              href="/focus/weekly"
              className="flex w-full items-center cursor-pointer"
              data-testid={`link-focus-weekly${suffix}`}
            >
              <Eye className="ml-2 h-4 w-4" aria-hidden="true" />
              تقرير القراءة الأسبوعي
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href="/notification-settings"
              className="flex w-full items-center cursor-pointer"
              data-testid={`link-notification-settings${suffix}`}
            >
              <Bell className="ml-2 h-4 w-4" aria-hidden="true" />
              إعدادات الإشعارات
            </a>
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {hasPermission(user as AuthUser, "dashboard.view") && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a
              href="/dashboard"
              className="flex w-full items-center cursor-pointer"
              data-testid={`link-dashboard${suffix}`}
            >
              <LayoutDashboard className="ml-2 h-4 w-4" aria-hidden="true" />
              لوحة التحكم
            </a>
          </DropdownMenuItem>
          {hasPermission(user as AuthUser, "dashboard.view_messages") && (
            <DropdownMenuItem asChild>
              <a
                href="/dashboard/communications"
                className="flex w-full items-center cursor-pointer"
                data-testid={`link-communications${suffix}`}
              >
                <MessageSquare className="ml-2 h-4 w-4" aria-hidden="true" />
                قنوات الاتصال
              </a>
            </DropdownMenuItem>
          )}
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
