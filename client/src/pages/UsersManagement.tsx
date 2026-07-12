import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  PlusCircle,
  Edit,
  Trash2,
  Search,
  Users,
  KeyRound,
  UserCheck,
  Ban,
  Loader2,
  TrendingUp,
  TrendingDown,
  Eye,
  BadgeCheck,
  Phone,
  Smartphone,
  Globe,
  Award,
  ShieldCheck,
  Cake,
  MapPin,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { adminUpdateUserSchema } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AddUserDialog } from "@/components/AddUserDialog";
import { EditUserDialog } from "@/components/EditUserDialog";
import { RolesPanel } from "@/components/RolesPanel";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

// User type from API
interface UserLoyalty {
  totalPoints: number;
  currentRank: string;
  rankLevel: number;
  lifetimePoints: number;
}

interface UserDeviceInfo {
  platform?: string;
  osVersion?: string;
  appVersion?: string;
  deviceName?: string;
  deviceId?: string;
}

interface UserListItem {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  status: string;
  isProfileComplete: boolean;
  createdAt: string;
  role: string;
  roleName: string | null;
  roleNameAr: string | null;
  roleId: string | null;
  emailVerified?: boolean;
  verificationBadge?: string | null;
  lastActivityAt?: string | null;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
  country?: string | null;
  city?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  lastLoginAt?: string | null;
  lastDeviceInfo?: UserDeviceInfo | null;
  twoFactorEnabled?: boolean;
  suspendedUntil?: string | null;
  bannedUntil?: string | null;
  suspensionReason?: string | null;
  banReason?: string | null;
  loyalty?: UserLoyalty | null;
}

/** عرض أوضح في الإدارة لحسابات الجوال بلا اسم. */
function adminUserLabel(user: {
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
}): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (user.phoneNumber?.trim()) return `عضو جوال · ${user.phoneNumber.trim()}`;
  if (user.email?.toLowerCase().includes("@phone.sabq.org")) return "عضو جوال";
  return "بدون اسم";
}

// Role type
interface Role {
  id: string;
  name: string;
  nameAr: string;
}

// KPIs interface
interface KPIs {
  total: number;
  emailVerified: number;
  emailVerifiedTrend: number;
  withPhone: number;
  withPhoneTrend: number;
  suspended: number;
  suspendedTrend: number;
  banned: number;
  bannedTrend: number;
}

const LATIN_DATE = "ar-SA-u-ca-gregory-nu-latn";

function formatLatinNumber(value: number) {
  return value.toLocaleString("en-US");
}

type UserFormValues = z.infer<typeof adminUpdateUserSchema>;

export default function UsersManagement() {
  const [location, setLocation] = useLocation();
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  // Redirect non-admin users to home
  useEffect(() => {
    if (!isUserLoading && user && !hasRole(user, "admin", "system_admin")) {
      setLocation("/");
    }
  }, [isUserLoading, user, setLocation]);

  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserListItem | null>(null);
  const [addingUser, setAddingUser] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  // Pagination state (added 2026-05-20). Resets to page 1 whenever a
  // filter changes so we don't end up on page 5 of an empty result.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, roleFilter, pageSize]);
  const [editingUserRoles, setEditingUserRoles] = useState<{
    userId: string;
    currentRoles: string[];
  } | null>(null);
  const [resettingPassword, setResettingPassword] = useState<UserListItem | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [permanentDeletingUser, setPermanentDeletingUser] = useState<UserListItem | null>(null);
  const [viewingDetails, setViewingDetails] = useState<UserListItem | null>(null);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(adminUpdateUserSchema),
    defaultValues: {
      status: "active",
      roleId: undefined,
    },
  });

  // Fetch users (paged). Response shape:
  //   { users, items, total, page, pageSize, hasMore }
  // We pre-fetch slightly more than `pageSize` and then filter out
  // staff-roles client-side because that filter doesn't exist server-side.
  // The `total` we display is the server-reported total before the
  // staff-roles filter — it can be slightly off when the page boundary
  // straddles a staff row, but it's good enough for "صفحة X من Y".
  type UsersResponse = {
    items?: UserListItem[];
    users?: UserListItem[];
    total?: number;
    page?: number;
    pageSize?: number;
    hasMore?: boolean;
  };
  const { data: usersResponse, isLoading } = useQuery<UsersResponse>({
    queryKey: ["/api/admin/users", searchQuery, statusFilter, roleFilter, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (roleFilter !== "all") params.append("roleId", roleFilter);
      params.append("page", String(page));
      params.append("pageSize", String(pageSize));

      try {
        return await apiRequest(`/api/admin/users?${params}`);
      } catch {
        return { items: [], users: [], total: 0, page, pageSize, hasMore: false };
      }
    },
    enabled: !!user,
  });
  const allFetchedUsers: UserListItem[] = Array.isArray(usersResponse?.users)
    ? usersResponse!.users
    : Array.isArray(usersResponse?.items)
      ? usersResponse!.items as any
      : [];
  const totalUsers = usersResponse?.total ?? allFetchedUsers.length;
  // Filter to show only regular readers (not staff members).
  // Staff roles are managed in /dashboard/staff.
  const staffRoles = ['admin', 'system_admin', 'editor', 'correspondent', 'reporter', 'moderator', 'content_manager', 'opinion_author'];
  const users = allFetchedUsers.filter((u) => !staffRoles.includes(u.role));
  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));

  // Fetch roles
  const { data: rolesRaw } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
    queryFn: async () => {
      try {
        const data = await apiRequest("/api/roles");
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
  });
  const roles = Array.isArray(rolesRaw) ? rolesRaw : [];

  // Fetch KPIs
  const { data: kpis, isLoading: kpisLoading } = useQuery<KPIs>({
    queryKey: ["/api/dashboard/users/kpis"],
    enabled: !!user,
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UserFormValues }) => {
      return await apiRequest(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingUser(null);
      form.reset();
      toast({
        title: "تم تحديث المستخدم",
        description: "تم تحديث بيانات المستخدم بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث المستخدم",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/users/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDeletingUser(null);
      toast({
        title: "تم حذف المستخدم",
        description: "تم حظر المستخدم بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف المستخدم",
        variant: "destructive",
      });
    },
  });

  // Permanent delete mutation (for banned users only)
  const permanentDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/users/${id}/permanent`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setPermanentDeletingUser(null);
      toast({
        title: "تم الحذف النهائي",
        description: "تم حذف المستخدم نهائياً من قاعدة البيانات",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في الحذف النهائي",
        variant: "destructive",
      });
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      return await apiRequest(`/api/admin/users/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword: password }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: () => {
      setResettingPassword(null);
      setNewPassword("");
      toast({
        title: "تم إعادة تعيين كلمة المرور",
        description: "تم إعادة تعيين كلمة المرور بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إعادة تعيين كلمة المرور",
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleEdit = (user: UserListItem) => {
    setEditingUser(user);
    form.reset({
      status: user.status as "active" | "suspended" | "banned",
      roleId: user.roleId || undefined,
    });
  };

  const handleSubmit = (data: UserFormValues) => {
    if (!editingUser) return;
    updateMutation.mutate({ id: editingUser.id, data });
  };

  const handleDelete = () => {
    if (!deletingUser) return;
    deleteMutation.mutate(deletingUser.id);
  };

  const handleEditRoles = async (user: UserListItem) => {
    try {
      const roles = await apiRequest(`/api/admin/users/${user.id}/roles`);
      setEditingUserRoles({
        userId: user.id,
        currentRoles: (Array.isArray(roles) ? roles : []).map((r: Role) => r.id),
      });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في جلب أدوار المستخدم",
        variant: "destructive",
      });
    }
  };

  const handleResetPassword = () => {
    if (!resettingPassword || !newPassword) return;
    if (newPassword.length < 8) {
      toast({
        title: "خطأ",
        description: "يجب أن تكون كلمة المرور 8 أحرف على الأقل",
        variant: "destructive",
      });
      return;
    }
    resetPasswordMutation.mutate({ id: resettingPassword.id, password: newPassword });
  };

  const handlePermanentDelete = () => {
    if (!permanentDeletingUser) return;
    permanentDeleteMutation.mutate(permanentDeletingUser.id);
  };

  // Formatters & badges
  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleDateString(LATIN_DATE);
    } catch {
      return "—";
    }
  };
  const formatRelative = (value?: string | null) => {
    if (!value) return "بدون نشاط";
    const date = new Date(value);
    const diffMs = Date.now() - date.getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return "الآن";
    if (min < 60) return `قبل ${formatLatinNumber(min)} د`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `قبل ${formatLatinNumber(hr)} س`;
    const days = Math.floor(hr / 24);
    if (days < 30) return `قبل ${formatLatinNumber(days)} يوم`;
    return date.toLocaleDateString(LATIN_DATE);
  };
  const getPlatformLabel = (info?: UserDeviceInfo | null) => {
    if (!info?.platform) return null;
    const p = info.platform.toLowerCase();
    if (p.includes("ios")) return "iOS";
    if (p.includes("android")) return "Android";
    if (p.includes("web")) return "Web";
    return info.platform;
  };
  const getRankColor = (level?: number) => {
    switch (level) {
      case 5: return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800";
      case 4: return "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800";
      case 3: return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800";
      case 2: return "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800";
      default: return "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900/50 dark:text-slate-200 dark:border-slate-700";
    }
  };
  const getGenderLabel = (g?: string | null) => {
    if (!g) return "—";
    if (g === "male") return "ذكر";
    if (g === "female") return "أنثى";
    return g;
  };

  // Status badge
  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      active: "default",
      suspended: "secondary",
      banned: "destructive",
    };
    const labels: Record<string, string> = {
      active: "نشط",
      suspended: "معلق",
      banned: "محظور",
    };
    return (
      <Badge variant={variants[status] || "default"} data-testid={`badge-status-${status}`}>
        {labels[status] || status}
      </Badge>
    );
  };

  if (!isUserLoading && user && !hasRole(user, "admin", "system_admin")) {
    return null;
  }

  if (user?.id) {
    (globalThis as any).__currentUserId = user.id;
  }

  return (
    <DashboardLayout>
      <div className="relative min-h-full overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(27,173,248,0.07),_transparent_55%),radial-gradient(ellipse_at_bottom_left,_rgba(16,185,129,0.045),_transparent_45%),linear-gradient(180deg,_rgba(240,249,255,0.55)_0%,_transparent_26%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(27,173,248,0.1),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(16,185,129,0.05),_transparent_45%),linear-gradient(180deg,_rgba(8,47,73,0.22)_0%,_transparent_28%)]"
        />
        <div className="relative space-y-6" dir="rtl">
        {/* Header */}
        <header className="relative overflow-hidden rounded-2xl border border-sky-200/60 bg-gradient-to-l from-sky-50/80 via-background to-emerald-50/40 p-5 shadow-sm dark:border-sky-900/40 dark:from-sky-950/30 dark:via-background dark:to-emerald-950/20 sm:p-6">
          <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-44 w-44 rounded-full bg-[#1BADF8]/10 blur-3xl dark:bg-[#1BADF8]/15" />
          <div aria-hidden className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-[#1BADF8]/15 p-2.5 text-[#078fd1] dark:text-[#45c0f5]">
                <Users className="h-5 w-5 sm:h-6 sm:w-6" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-title">
                  إدارة المستخدمين
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  إدارة حسابات المستخدمين والصلاحيات
                </p>
              </div>
            </div>
            <Button onClick={() => setAddingUser(true)} data-testid="button-add-user" className="gap-2">
              <PlusCircle className="h-4 w-4" />
              إضافة مستخدم
            </Button>
          </div>
        </header>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card
            className="cursor-pointer rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/50 via-card to-card shadow-sm transition-shadow hover:shadow-md dark:border-sky-900/35 dark:from-sky-950/15"
            onClick={() => setStatusFilter("all")}
            data-testid="card-kpi-total"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي المستخدمين</CardTitle>
              <span className="rounded-lg bg-sky-100/80 p-1.5 dark:bg-sky-950/40">
                <Users className="h-4 w-4 text-sky-700 dark:text-sky-300" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums" data-testid="text-total">
                {kpisLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : formatLatinNumber(kpis?.total || 0)}
              </div>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer rounded-2xl border-emerald-200/55 bg-gradient-to-br from-emerald-50/50 via-card to-card shadow-sm transition-shadow hover:shadow-md dark:border-emerald-900/35 dark:from-emerald-950/15"
            onClick={() => setStatusFilter("all")}
            data-testid="card-kpi-verified"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">الموثقون بالبريد</CardTitle>
              <span className="rounded-lg bg-emerald-100/80 p-1.5 dark:bg-emerald-950/40">
                <UserCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums" data-testid="text-verified">
                {kpisLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : formatLatinNumber(kpis?.emailVerified || 0)}
              </div>
              {!kpisLoading && kpis && (
                <div className={`mt-1 flex items-center text-xs tabular-nums ${kpis.emailVerifiedTrend >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {kpis.emailVerifiedTrend >= 0 ? <TrendingUp className="ml-1 h-3 w-3" /> : <TrendingDown className="ml-1 h-3 w-3" />}
                  <span>{formatLatinNumber(Math.abs(kpis.emailVerifiedTrend))}%</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer rounded-2xl border-cyan-200/55 bg-gradient-to-br from-cyan-50/50 via-card to-card shadow-sm transition-shadow hover:shadow-md dark:border-cyan-900/35 dark:from-cyan-950/15"
            onClick={() => setStatusFilter("all")}
            data-testid="card-kpi-with-phone"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">الجوالات المسجّلة</CardTitle>
              <span className="rounded-lg bg-cyan-100/80 p-1.5 dark:bg-cyan-950/40">
                <Phone className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums" data-testid="text-with-phone">
                {kpisLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : formatLatinNumber(kpis?.withPhone || 0)}
              </div>
              {!kpisLoading && kpis && (
                <div className={`mt-1 flex items-center text-xs tabular-nums ${kpis.withPhoneTrend >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {kpis.withPhoneTrend >= 0 ? <TrendingUp className="ml-1 h-3 w-3" /> : <TrendingDown className="ml-1 h-3 w-3" />}
                  <span>{formatLatinNumber(Math.abs(kpis.withPhoneTrend))}%</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer rounded-2xl border-rose-200/55 bg-gradient-to-br from-rose-50/45 via-card to-card shadow-sm transition-shadow hover:shadow-md dark:border-rose-900/35 dark:from-rose-950/15"
            onClick={() => setStatusFilter("banned")}
            data-testid="card-kpi-banned"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">المحظورون</CardTitle>
              <span className="rounded-lg bg-rose-100/80 p-1.5 dark:bg-rose-950/40">
                <Ban className="h-4 w-4 text-rose-700 dark:text-rose-300" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums" data-testid="text-banned">
                {kpisLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : formatLatinNumber(kpis?.banned || 0)}
              </div>
              {!kpisLoading && kpis && (
                <div className={`mt-1 flex items-center text-xs tabular-nums ${kpis.bannedTrend >= 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {kpis.bannedTrend >= 0 ? <TrendingUp className="ml-1 h-3 w-3" /> : <TrendingDown className="ml-1 h-3 w-3" />}
                  <span>{formatLatinNumber(Math.abs(kpis.bannedTrend))}%</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Card */}
        <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15">
          <CardHeader>
            <CardTitle data-testid="heading-users">قائمة المستخدمين</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="mb-6 flex flex-col gap-4 md:flex-row">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالاسم أو البريد..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-10"
                    data-testid="input-search"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[200px]" data-testid="select-status-filter">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="suspended">معلق</SelectItem>
                  <SelectItem value="banned">محظور</SelectItem>
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full md:w-[200px]" data-testid="select-role-filter">
                  <SelectValue placeholder="الدور" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأدوار</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto">
              {isLoading ? (
                <div className="text-center py-8" data-testid="text-loading">جاري التحميل...</div>
              ) : users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground" data-testid="text-empty">
                  لا توجد مستخدمون
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right py-3 px-4">المستخدم</th>
                      <th className="text-right py-3 px-4">البريد الإلكتروني</th>
                      <th className="text-right py-3 px-4 hidden md:table-cell">الجوال</th>
                      <th className="text-right py-3 px-4 hidden lg:table-cell">العضوية</th>
                      <th className="text-right py-3 px-4">الحالة</th>
                      <th className="text-right py-3 px-4 hidden xl:table-cell">آخر نشاط</th>
                      <th className="text-right py-3 px-4 hidden lg:table-cell">تاريخ التسجيل</th>
                      <th className="text-right py-3 px-4">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b hover-elevate" data-testid={`row-user-${user.id}`}>
                        <td className="py-3 px-4 align-top">
                          <div className="flex items-start gap-3">
                            <Avatar className="shrink-0 mt-0.5" data-testid={`avatar-${user.id}`}>
                              <AvatarImage src={user.profileImageUrl || undefined} />
                              <AvatarFallback>
                                {(user.firstName?.[0] || "") + (user.lastName?.[0] || "")}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium flex items-start gap-1 flex-wrap" data-testid={`text-name-${user.id}`}>
                                <span className="break-words">
                                  {adminUserLabel(user)}
                                </span>
                                {user.verificationBadge === "gold" && (
                                  <BadgeCheck className="h-4 w-4 text-amber-500 shrink-0 mt-1" aria-label="موثق ذهبي" />
                                )}
                                {user.verificationBadge === "silver" && (
                                  <BadgeCheck className="h-4 w-4 text-slate-400 shrink-0 mt-1" aria-label="موثق فضي" />
                                )}
                              </div>
                              {(user.country || user.city) && (
                                <div className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                                  <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                                  <span className="break-words">{[user.city, user.country].filter(Boolean).join("، ")}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 align-top" data-testid={`text-email-${user.id}`}>
                          <div className="flex items-start gap-1.5">
                            <span className="text-sm break-all">{user.email}</span>
                            {user.emailVerified && (
                              <BadgeCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" aria-label="بريد موثق" />
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell align-top" data-testid={`text-phone-${user.id}`}>
                          {user.phoneNumber ? (
                            <div className="flex items-center gap-1.5 text-sm" dir="ltr">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="break-all">{user.phoneNumber}</span>
                              {user.phoneVerified && (
                                <BadgeCheck className="h-4 w-4 text-emerald-500 shrink-0" aria-label="جوال موثق" />
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 hidden lg:table-cell align-top" data-testid={`text-loyalty-${user.id}`}>
                          {user.loyalty ? (
                            <div className="flex flex-col gap-0.5">
                              <Badge variant="outline" className={`gap-1 w-fit ${getRankColor(user.loyalty.rankLevel)}`}>
                                <Award className="h-3 w-3" />
                                <span className="text-xs">{user.loyalty.currentRank}</span>
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatLatinNumber(user.loyalty.totalPoints)} نقطة
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 align-top">{getStatusBadge(user.status)}</td>
                        <td className="py-3 px-4 hidden xl:table-cell text-sm text-muted-foreground align-top" data-testid={`text-last-activity-${user.id}`}>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span>{formatRelative(user.lastActivityAt || user.lastLoginAt)}</span>
                          </div>
                          {getPlatformLabel(user.lastDeviceInfo) && (
                            <div className="text-xs flex items-center gap-1 mt-0.5">
                              <Smartphone className="h-3 w-3 shrink-0" />
                              <span>{getPlatformLabel(user.lastDeviceInfo)}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 hidden lg:table-cell align-top" data-testid={`text-date-${user.id}`}>
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="py-3 px-4 align-top">
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setViewingDetails(user)}
                              data-testid={`button-view-details-${user.id}`}
                              title="عرض التفاصيل"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditRoles(user)}
                              disabled={user.id === (globalThis as any).__currentUserId}
                              data-testid={`button-edit-roles-${user.id}`}
                            >
                              <Users className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(user)}
                              disabled={user.id === (globalThis as any).__currentUserId}
                              data-testid={`button-edit-${user.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setResettingPassword(user);
                                setNewPassword("");
                              }}
                              disabled={user.id === (globalThis as any).__currentUserId}
                              data-testid={`button-reset-password-${user.id}`}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingUser(user)}
                              disabled={user.id === (globalThis as any).__currentUserId}
                              data-testid={`button-delete-${user.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            {/* Permanent delete button - only for banned users */}
                            {(user.status === "banned" || user.status === "deleted") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setPermanentDeletingUser(user)}
                                disabled={user.id === (globalThis as any).__currentUserId}
                                className="text-destructive hover:text-destructive"
                                title="حذف نهائي"
                                data-testid={`button-permanent-delete-${user.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination controls — only render once we know how many
                pages exist. Shows page X of Y, count of currently-shown
                rows, page-size selector, and prev/next/first/last
                buttons. Resets to page 1 when filters change (see the
                effect above the useQuery). */}
            {totalUsers > 0 && (
              <div className="mt-4 flex flex-col items-center justify-between gap-3 px-4 pb-4 text-sm sm:flex-row">
                <div className="text-muted-foreground" data-testid="pagination-status">
                  عرض <span className="font-bold tabular-nums text-foreground">{formatLatinNumber((page - 1) * pageSize + 1)}</span>
                  {" – "}
                  <span className="font-bold tabular-nums text-foreground">
                    {formatLatinNumber(Math.min(page * pageSize, totalUsers))}
                  </span>
                  {" من "}
                  <span className="font-bold tabular-nums text-foreground">{formatLatinNumber(totalUsers)}</span>
                  {" قارئ"}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">صفوف لكل صفحة:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums"
                    data-testid="select-page-size"
                  >
                    {[50, 100, 200, 500].map((n) => (
                      <option key={n} value={n}>{formatLatinNumber(n)}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                    data-testid="button-page-first"
                  >
                    الأولى
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    data-testid="button-page-prev"
                  >
                    السابقة
                  </Button>
                  <span className="px-3 text-muted-foreground tabular-nums">
                    {formatLatinNumber(page)} / {formatLatinNumber(totalPages)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    data-testid="button-page-next"
                  >
                    التالية
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(totalPages)}
                    disabled={page >= totalPages}
                    data-testid="button-page-last"
                  >
                    الأخيرة
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Edit Dialog */}
      <EditUserDialog 
        open={!!editingUser} 
        onOpenChange={(open) => !open && setEditingUser(null)}
        userId={editingUser?.id || null}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent data-testid="dialog-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف المستخدم "{deletingUser?.email}"؟ سيتم تعيين حالته إلى "محظور".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "جاري الحذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Confirmation Dialog */}
      <AlertDialog open={!!permanentDeletingUser} onOpenChange={(open) => !open && setPermanentDeletingUser(null)}>
        <AlertDialogContent data-testid="dialog-permanent-delete">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">حذف نهائي</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-semibold text-destructive">
                تحذير: هذا الإجراء لا يمكن التراجع عنه!
              </p>
              <p>
                هل أنت متأكد من حذف المستخدم "{permanentDeletingUser?.email}" نهائياً؟
              </p>
              <p>
                سيتم نقل جميع مقالات هذا المستخدم إلى حساب "صحيفة سبق" وحذف بياناته بشكل كامل.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-permanent-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePermanentDelete}
              disabled={permanentDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-permanent-delete"
            >
              {permanentDeleteMutation.isPending ? "جاري الحذف النهائي..." : "حذف نهائي"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resettingPassword} onOpenChange={(open) => !open && setResettingPassword(null)}>
        <DialogContent data-testid="dialog-reset-password">
          <DialogHeader>
            <DialogTitle>إعادة تعيين كلمة المرور</DialogTitle>
            <DialogDescription>
              إعادة تعيين كلمة المرور للمستخدم "{resettingPassword?.email}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="new-password" className="text-sm font-medium">
                كلمة المرور الجديدة
              </label>
              <Input
                id="new-password"
                type="password"
                placeholder="أدخل كلمة المرور الجديدة (8 أحرف على الأقل)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                data-testid="input-new-password"
              />
              <p className="text-xs text-muted-foreground">
                يجب أن تكون كلمة المرور 8 أحرف على الأقل
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResettingPassword(null)}
              data-testid="button-cancel-reset"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={resetPasswordMutation.isPending || !newPassword || newPassword.length < 8}
              data-testid="button-confirm-reset"
            >
              {resetPasswordMutation.isPending ? "جاري إعادة التعيين..." : "إعادة تعيين"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Details Sheet */}
      <Sheet open={!!viewingDetails} onOpenChange={(open) => !open && setViewingDetails(null)}>
        <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto" data-testid="sheet-user-details">
          {viewingDetails && (
            <>
              <SheetHeader className="text-right">
                <div className="flex items-center gap-3 mb-2">
                  <Avatar className="h-14 w-14">
                    <AvatarImage src={viewingDetails.profileImageUrl || undefined} />
                    <AvatarFallback className="text-lg">
                      {(viewingDetails.firstName?.[0] || "") + (viewingDetails.lastName?.[0] || "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <SheetTitle className="flex items-center gap-1.5 text-base">
                      <span className="truncate">
                        {adminUserLabel(viewingDetails)}
                      </span>
                      {viewingDetails.verificationBadge === "gold" && (
                        <BadgeCheck className="h-5 w-5 text-amber-500" aria-label="موثق ذهبي" />
                      )}
                      {viewingDetails.verificationBadge === "silver" && (
                        <BadgeCheck className="h-5 w-5 text-slate-400" aria-label="موثق فضي" />
                      )}
                    </SheetTitle>
                    <SheetDescription className="text-xs">
                      {getStatusBadge(viewingDetails.status)}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-4 mt-4 text-sm">
                {/* Loyalty / Membership */}
                <section>
                  <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Award className="h-3.5 w-3.5" /> العضوية والولاء
                  </h4>
                  {viewingDetails.loyalty ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">الرتبة</span>
                        <Badge variant="outline" className={`gap-1 ${getRankColor(viewingDetails.loyalty.rankLevel)}`}>
                          <Award className="h-3 w-3" />
                          {viewingDetails.loyalty.currentRank}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">المستوى</span>
                        <span className="font-medium tabular-nums">{formatLatinNumber(viewingDetails.loyalty.rankLevel)} من 5</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">النقاط الحالية</span>
                        <span className="font-medium tabular-nums">{formatLatinNumber(viewingDetails.loyalty.totalPoints)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">إجمالي النقاط</span>
                        <span className="font-medium tabular-nums">{formatLatinNumber(viewingDetails.loyalty.lifetimePoints)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-xs">لا توجد بيانات ولاء</p>
                  )}
                </section>

                <Separator />

                {/* Contact */}
                <section>
                  <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider mb-2">
                    معلومات الاتصال
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">البريد</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium" dir="ltr">{viewingDetails.email}</span>
                        {viewingDetails.emailVerified && <BadgeCheck className="h-4 w-4 text-emerald-500" />}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">الجوال</span>
                      <div className="flex items-center gap-1.5">
                        {viewingDetails.phoneNumber ? (
                          <>
                            <span className="font-medium" dir="ltr">{viewingDetails.phoneNumber}</span>
                            {viewingDetails.phoneVerified && <BadgeCheck className="h-4 w-4 text-emerald-500" />}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Personal */}
                <section>
                  <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider mb-2">
                    البيانات الشخصية
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">الجنس</span>
                      <span className="font-medium">{getGenderLabel(viewingDetails.gender)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Cake className="h-3 w-3" /> تاريخ الميلاد
                      </span>
                      <span className="font-medium">{formatDate(viewingDetails.birthDate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Globe className="h-3 w-3" /> الدولة
                      </span>
                      <span className="font-medium">{viewingDetails.country || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> المدينة
                      </span>
                      <span className="font-medium">{viewingDetails.city || "—"}</span>
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Activity */}
                <section>
                  <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider mb-2">
                    النشاط والأمان
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">تاريخ التسجيل</span>
                      <span className="font-medium">{formatDate(viewingDetails.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">آخر نشاط</span>
                      <span className="font-medium">{formatRelative(viewingDetails.lastActivityAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">آخر تسجيل دخول</span>
                      <span className="font-medium">{formatRelative(viewingDetails.lastLoginAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Smartphone className="h-3 w-3" /> آخر جهاز
                      </span>
                      <span className="font-medium">
                        {getPlatformLabel(viewingDetails.lastDeviceInfo) || "—"}
                        {viewingDetails.lastDeviceInfo?.appVersion && (
                          <span className="text-muted-foreground"> · {viewingDetails.lastDeviceInfo.appVersion}</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" /> المصادقة الثنائية
                      </span>
                      <Badge variant={viewingDetails.twoFactorEnabled ? "default" : "outline"} className="text-xs">
                        {viewingDetails.twoFactorEnabled ? "مفعّلة" : "غير مفعّلة"}
                      </Badge>
                    </div>
                  </div>
                </section>

                {(viewingDetails.suspensionReason || viewingDetails.banReason || viewingDetails.suspendedUntil || viewingDetails.bannedUntil) && (
                  <>
                    <Separator />
                    <section>
                      <h4 className="font-semibold text-destructive text-xs uppercase tracking-wider mb-2">
                        الحظر/التعليق
                      </h4>
                      <div className="space-y-2">
                        {viewingDetails.suspensionReason && (
                          <div>
                            <div className="text-muted-foreground text-xs">سبب التعليق</div>
                            <div className="font-medium">{viewingDetails.suspensionReason}</div>
                          </div>
                        )}
                        {viewingDetails.suspendedUntil && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">معلّق حتى</span>
                            <span className="font-medium">{formatDate(viewingDetails.suspendedUntil)}</span>
                          </div>
                        )}
                        {viewingDetails.banReason && (
                          <div>
                            <div className="text-muted-foreground text-xs">سبب الحظر</div>
                            <div className="font-medium">{viewingDetails.banReason}</div>
                          </div>
                        )}
                        {viewingDetails.bannedUntil && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">محظور حتى</span>
                            <span className="font-medium">{formatDate(viewingDetails.bannedUntil)}</span>
                          </div>
                        )}
                      </div>
                    </section>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Add User Dialog */}
      <AddUserDialog
        open={addingUser}
        onOpenChange={setAddingUser}
      />

      {/* Roles Panel */}
      {editingUserRoles && (
        <RolesPanel
          userId={editingUserRoles.userId}
          currentRoles={editingUserRoles.currentRoles}
          open={true}
          onClose={() => setEditingUserRoles(null)}
        />
      )}
    </DashboardLayout>
  );
}

function UserRoles({ userId }: { userId: string }) {
  const { data: userRoles, isLoading } = useQuery<Role[]>({
    queryKey: ["/api/admin/users", userId, "roles"],
    queryFn: async () => {
      try {
        return await apiRequest(`/api/admin/users/${userId}/roles`);
      } catch {
        return [];
      }
    },
  });

  if (isLoading) {
    return <span className="text-muted-foreground text-sm" data-testid={`text-roles-loading-${userId}`}>...</span>;
  }

  if (!userRoles || userRoles.length === 0) {
    return <span className="text-muted-foreground" data-testid={`text-no-roles-${userId}`}>بدون أدوار</span>;
  }

  return (
    <div className="flex gap-1 flex-wrap" data-testid={`div-roles-${userId}`}>
      {userRoles.map((role) => (
        <Badge key={role.id} variant="outline" data-testid={`badge-role-${userId}-${role.id}`}>
          {role.nameAr}
        </Badge>
      ))}
    </div>
  );
}
