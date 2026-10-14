import { useState, useEffect, useMemo } from "react";
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
  X,
  SlidersHorizontal,
  Mail,
  AlertCircle,
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
import { hasRealEmail, isSyntheticPhoneEmail } from "@shared/authEmail";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AddUserDialog } from "@/components/AddUserDialog";
import { EditUserDialog } from "@/components/EditUserDialog";
import { RolesPanel } from "@/components/RolesPanel";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
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
  if (isSyntheticPhoneEmail(user.email)) return "عضو جوال";
  return "بدون اسم";
}

/** خلية البريد: الاصطناعي التاريخي (@phone.sabq.org) والمفقود يظهران «لم يُضف بريد»،
 *  وعلامة التوثيق لا تظهر إلا لبريد حقيقي مرّ بتحقق فعلي. */
function EmailCell({ email, emailVerified }: { email?: string | null; emailVerified?: boolean }) {
  if (!hasRealEmail(email)) {
    return (
      <Badge variant="outline" className="py-0.5 text-xs font-normal text-muted-foreground border-dashed">
        لم يُضف بريد
      </Badge>
    );
  }
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-sm break-all font-mono text-[13px]">{email}</span>
      {emailVerified && (
        <BadgeCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" aria-label="بريد موثق" />
      )}
    </div>
  );
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

type VerificationQuickFilter =
  | "all"
  | "email_verified"
  | "phone_verified"
  | "two_factor"
  | "missing_email";

const LATIN_DATE = "ar-SA-u-ca-gregory-nu-latn";

function formatLatinNumber(value: number | undefined | null) {
  const safe = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return safe.toLocaleString("en-US");
}

type UserFormValues = z.infer<typeof adminUpdateUserSchema>;

export default function UsersManagement() {
  const [, setLocation] = useLocation();
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
  const [verificationFilter, setVerificationFilter] = useState<VerificationQuickFilter>("all");
  // Pagination state (added 2026-05-20). Resets to page 1 whenever a
  // filter changes so we don't end up on page 5 of an empty result.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, roleFilter, verificationFilter, pageSize]);

  const [editingUserRoles, setEditingUserRoles] = useState<{
    userId: string;
    currentRoles: string[];
  } | null>(null);
  const [resettingPassword, setResettingPassword] = useState<UserListItem | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [permanentDeletingUser, setPermanentDeletingUser] = useState<UserListItem | null>(null);
  const [viewingDetails, setViewingDetails] = useState<UserListItem | null>(null);
  const [promotingUser, setPromotingUser] = useState<UserListItem | null>(null);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(adminUpdateUserSchema),
    defaultValues: {
      status: "active",
      roleId: undefined,
    },
  });

  // Fetch users (paged). Response shape:
  //   { users, items, total, page, pageSize, hasMore }
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
      ? (usersResponse!.items as UserListItem[])
      : [];
  const totalUsers = usersResponse?.total ?? allFetchedUsers.length;
  // Filter to show only regular readers (not staff members).
  // Staff roles are managed in /dashboard/staff.
  const staffRoles = [
    "admin",
    "system_admin",
    "editor",
    "correspondent",
    "reporter",
    "moderator",
    "content_manager",
    "opinion_author",
  ];
  const baseUsers = useMemo(
    () => allFetchedUsers.filter((u) => !staffRoles.includes(u.role)),
    [allFetchedUsers]
  );

  const users = useMemo(() => {
    if (verificationFilter === "all") return baseUsers;
    return baseUsers.filter((u) => {
      if (verificationFilter === "email_verified") {
        return hasRealEmail(u.email) && Boolean(u.emailVerified);
      }
      if (verificationFilter === "phone_verified") {
        return Boolean(u.phoneNumber && u.phoneVerified);
      }
      if (verificationFilter === "two_factor") {
        return Boolean(u.twoFactorEnabled);
      }
      if (verificationFilter === "missing_email") {
        return !hasRealEmail(u.email);
      }
      return true;
    });
  }, [baseUsers, verificationFilter]);

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

  const promoteReporterMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/users/${id}/promote-reporter`, {
        method: "POST",
      });
    },
    onSuccess: (data: { message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setPromotingUser(null);
      toast({
        title: "تمت الترقية إلى مراسل",
        description: data?.message || "ستظهر العضوية مراسل في التطبيق واستكمال الملف",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "تعذر الترقية",
        description: error.message || "فشل في ترقية العضوية إلى مراسل",
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleEdit = (targetUser: UserListItem) => {
    setEditingUser(targetUser);
    form.reset({
      status: targetUser.status as "active" | "suspended" | "banned",
      roleId: targetUser.roleId || undefined,
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

  const handleEditRoles = async (targetUser: UserListItem) => {
    try {
      const fetchedRoles = await apiRequest(`/api/admin/users/${targetUser.id}/roles`);
      setEditingUserRoles({
        userId: targetUser.id,
        currentRoles: (Array.isArray(fetchedRoles) ? fetchedRoles : []).map((r: Role) => r.id),
      });
    } catch {
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

  const hasActiveFilters =
    Boolean(searchQuery) ||
    statusFilter !== "all" ||
    roleFilter !== "all" ||
    verificationFilter !== "all";

  const clearAllFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setRoleFilter("all");
    setVerificationFilter("all");
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
      case 5:
        return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800";
      case 4:
        return "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800";
      case 3:
        return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800";
      case 2:
        return "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800";
      default:
        return "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900/50 dark:text-slate-200 dark:border-slate-700";
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
      <Badge
        variant={variants[status] || "default"}
        className="py-0.5"
        data-testid={`badge-status-${status}`}
      >
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
      <DashboardPageShell maxWidthClassName="max-w-[1600px]" contentClassName="px-4 pb-10 sm:px-6">
        <div className="space-y-6" dir="rtl">
          {/* Unified Editorial Header */}
          <DashboardPageHeader
            icon={Users}
            title="إدارة المستخدمين"
            description="سجل أعضاء وقراء صحيفة سبق — متابعة التوثيق، برنامج الولاء، وإدارة الحسابات والصلاحيات"
            titleTestId="heading-title"
            actions={
              <Button
                onClick={() => setAddingUser(true)}
                data-testid="button-add-user"
                className="gap-2 shadow-xs"
              >
                <PlusCircle className="h-4 w-4" />
                إضافة مستخدم
              </Button>
            }
          />

          {/* Top 4-Card KPI Summary Strip */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <Card
              className={`cursor-pointer rounded-2xl border-sky-200/60 bg-gradient-to-br from-sky-50/55 via-card to-card shadow-xs transition-all hover:shadow-md dark:border-sky-900/40 dark:from-sky-950/20 ${
                statusFilter === "all" && verificationFilter === "all"
                  ? "ring-2 ring-sky-500/40"
                  : ""
              }`}
              onClick={() => {
                setStatusFilter("all");
                setVerificationFilter("all");
              }}
              data-testid="card-kpi-total"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  إجمالي المستخدمين
                </CardTitle>
                <span className="rounded-xl bg-sky-100/80 p-2 dark:bg-sky-950/50">
                  <Users className="h-4 w-4 text-sky-700 dark:text-sky-300" />
                </span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums tracking-tight" data-testid="text-total">
                  {kpisLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
                  ) : (
                    formatLatinNumber(kpis?.total ?? totalUsers ?? 0)
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  جميع حسابات القراء والأعضاء المسجلة
                </p>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer rounded-2xl border-emerald-200/60 bg-gradient-to-br from-emerald-50/55 via-card to-card shadow-xs transition-all hover:shadow-md dark:border-emerald-900/40 dark:from-emerald-950/20 ${
                verificationFilter === "email_verified" ? "ring-2 ring-emerald-500/40" : ""
              }`}
              onClick={() => {
                setStatusFilter("all");
                setVerificationFilter((prev) =>
                  prev === "email_verified" ? "all" : "email_verified"
                );
              }}
              data-testid="card-kpi-verified"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  الموثقون بالبريد
                </CardTitle>
                <span className="rounded-xl bg-emerald-100/80 p-2 dark:bg-emerald-950/50">
                  <UserCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                </span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums tracking-tight" data-testid="text-verified">
                  {kpisLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                  ) : (
                    formatLatinNumber(kpis?.emailVerified || 0)
                  )}
                </div>
                {!kpisLoading && kpis && (
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`inline-flex items-center font-medium tabular-nums ${
                        (Number(kpis.emailVerifiedTrend) || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {(Number(kpis.emailVerifiedTrend) || 0) >= 0 ? (
                        <TrendingUp className="ml-1 h-3 w-3" />
                      ) : (
                        <TrendingDown className="ml-1 h-3 w-3" />
                      )}
                      {formatLatinNumber(Math.abs(Number(kpis.emailVerifiedTrend) || 0))}%
                    </span>
                    {(Number(kpis.total) || 0) > 0 && (
                      <span className="text-muted-foreground tabular-nums">
                        {formatLatinNumber(
                          Math.round(((Number(kpis.emailVerified) || 0) / Number(kpis.total)) * 100)
                        )}
                        % من الإجمالي
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer rounded-2xl border-cyan-200/60 bg-gradient-to-br from-cyan-50/55 via-card to-card shadow-xs transition-all hover:shadow-md dark:border-cyan-900/40 dark:from-cyan-950/20 ${
                verificationFilter === "phone_verified" ? "ring-2 ring-cyan-500/40" : ""
              }`}
              onClick={() => {
                setStatusFilter("all");
                setVerificationFilter((prev) =>
                  prev === "phone_verified" ? "all" : "phone_verified"
                );
              }}
              data-testid="card-kpi-with-phone"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  الجوالات المسجّلة
                </CardTitle>
                <span className="rounded-xl bg-cyan-100/80 p-2 dark:bg-cyan-950/50">
                  <Phone className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
                </span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums tracking-tight" data-testid="text-with-phone">
                  {kpisLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
                  ) : (
                    formatLatinNumber(kpis?.withPhone || 0)
                  )}
                </div>
                {!kpisLoading && kpis && (
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`inline-flex items-center font-medium tabular-nums ${
                        (Number(kpis.withPhoneTrend) || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {(Number(kpis.withPhoneTrend) || 0) >= 0 ? (
                        <TrendingUp className="ml-1 h-3 w-3" />
                      ) : (
                        <TrendingDown className="ml-1 h-3 w-3" />
                      )}
                      {formatLatinNumber(Math.abs(Number(kpis.withPhoneTrend) || 0))}%
                    </span>
                    {(Number(kpis.total) || 0) > 0 && (
                      <span className="text-muted-foreground tabular-nums">
                        {formatLatinNumber(
                          Math.round(((Number(kpis.withPhone) || 0) / Number(kpis.total)) * 100)
                        )}
                        % من الإجمالي
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer rounded-2xl border-rose-200/60 bg-gradient-to-br from-rose-50/50 via-card to-card shadow-xs transition-all hover:shadow-md dark:border-rose-900/40 dark:from-rose-950/20 ${
                statusFilter === "banned" ? "ring-2 ring-rose-500/40" : ""
              }`}
              onClick={() => setStatusFilter((prev) => (prev === "banned" ? "all" : "banned"))}
              data-testid="card-kpi-banned"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  المحظورون
                </CardTitle>
                <span className="rounded-xl bg-rose-100/80 p-2 dark:bg-rose-950/50">
                  <Ban className="h-4 w-4 text-rose-700 dark:text-rose-300" />
                </span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums tracking-tight" data-testid="text-banned">
                  {kpisLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-rose-600" />
                  ) : (
                    formatLatinNumber(kpis?.banned || 0)
                  )}
                </div>
                {!kpisLoading && kpis && (
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`inline-flex items-center font-medium tabular-nums ${
                        (Number(kpis.bannedTrend) || 0) >= 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {(Number(kpis.bannedTrend) || 0) >= 0 ? (
                        <TrendingUp className="ml-1 h-3 w-3" />
                      ) : (
                        <TrendingDown className="ml-1 h-3 w-3" />
                      )}
                      {formatLatinNumber(Math.abs(Number(kpis.bannedTrend) || 0))}%
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      معلق: {formatLatinNumber(kpis.suspended || 0)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Main User Directory Card */}
          <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/35 via-card to-card shadow-xs dark:border-sky-900/35 dark:from-sky-950/15">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2.5">
                  <CardTitle className="text-lg font-bold" data-testid="heading-users">
                    قائمة المستخدمين
                  </CardTitle>
                  <Badge variant="secondary" className="py-0.5 tabular-nums">
                    {formatLatinNumber(totalUsers)} عضو
                  </Badge>
                </div>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="no-min-touch-size inline-flex items-center gap-1.5 self-start rounded-full border border-border bg-background/80 px-3 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:self-auto"
                  >
                    <X className="h-3.5 w-3.5" />
                    إعادة ضبط الفلاتر
                  </button>
                )}
              </div>
            </CardHeader>

            <CardContent className="pt-5">
              {/* Search & Select Filters */}
              <div className="mb-4 flex flex-col gap-3 md:flex-row">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="بحث بالاسم، البريد الإلكتروني، أو رقم الجوال..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pr-10 pl-9"
                      data-testid="input-search"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        aria-label="مسح البحث"
                        className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:flex">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[170px]" data-testid="select-status-filter">
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
                    <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-role-filter">
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
              </div>

              {/* Quick Filter Pills (Status + Verification) */}
              <div className="mb-5 flex flex-col gap-2.5 rounded-xl border border-border/60 bg-muted/25 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    الحالة:
                  </span>
                  {[
                    { id: "all", label: "الكل" },
                    { id: "active", label: "نشط" },
                    { id: "suspended", label: "معلق" },
                    { id: "banned", label: "محظور" },
                  ].map((pill) => {
                    const active = statusFilter === pill.id;
                    return (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => setStatusFilter(pill.id)}
                        className={`no-min-touch-size inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          active
                            ? "border-sky-600 bg-sky-600 text-white shadow-2xs dark:border-sky-500 dark:bg-sky-500"
                            : "border-border/70 bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {pill.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="ml-1 text-xs font-medium text-muted-foreground">التوثيق والأمان:</span>
                  {(
                    [
                      { id: "all", label: "الكل" },
                      { id: "email_verified", label: "بريد موثق" },
                      { id: "phone_verified", label: "جوال موثق" },
                      { id: "two_factor", label: "2FA مفعّل" },
                      { id: "missing_email", label: "بدون بريد" },
                    ] as { id: VerificationQuickFilter; label: string }[]
                  ).map((pill) => {
                    const active = verificationFilter === pill.id;
                    return (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => setVerificationFilter(pill.id)}
                        className={`no-min-touch-size inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          active
                            ? "border-emerald-600 bg-emerald-600 text-white shadow-2xs dark:border-emerald-500 dark:bg-emerald-500"
                            : "border-border/70 bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {pill.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Users Directory (Responsive Mobile Cards + Desktop Table) */}
              <div className="overflow-x-auto">
                {isLoading ? (
                  <div
                    className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground"
                    data-testid="text-loading"
                  >
                    <Loader2 className="h-7 w-7 animate-spin text-sky-600" />
                    <span>جاري التحميل...</span>
                  </div>
                ) : users.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/80 py-12 text-center text-muted-foreground"
                    data-testid="text-empty"
                  >
                    <Users className="h-8 w-8 text-muted-foreground/60" />
                    <p className="font-medium">لا توجد مستخدمون</p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="no-min-touch-size mt-1 rounded-full border border-border bg-background px-3 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        عرض جميع المستخدمين
                      </button>
                    )}
                  </div>
                ) : (
                  <table className="w-full border-collapse">
                    <thead className="hidden md:table-header-group">
                      <tr className="border-b border-border/70 bg-muted/30 text-xs font-semibold text-muted-foreground">
                        <th className="py-3 px-4 text-right">المستخدم</th>
                        <th className="py-3 px-4 text-right">البريد الإلكتروني والتوثيق</th>
                        <th className="py-3 px-4 text-right">الجوال</th>
                        <th className="py-3 px-4 text-right">العضوية والولاء</th>
                        <th className="py-3 px-4 text-right">الحالة</th>
                        <th className="py-3 px-4 text-right">آخر نشاط</th>
                        <th className="py-3 px-4 text-right">تاريخ التسجيل</th>
                        <th className="py-3 px-4 text-right">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="flex flex-col gap-3 md:table-row-group md:divide-y md:divide-border/60">
                      {users.map((rowUser) => {
                        const isSelf = rowUser.id === (globalThis as any).__currentUserId;
                        const realEmail = hasRealEmail(rowUser.email);
                        return (
                          <tr
                            key={rowUser.id}
                            className="flex flex-col gap-2.5 rounded-2xl border border-border/75 bg-card/95 p-4 shadow-2xs transition-colors hover:bg-muted/30 md:table-row md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none"
                            data-testid={`row-user-${rowUser.id}`}
                          >
                            {/* User Identity */}
                            <td className="block md:table-cell md:py-3.5 md:px-4 md:align-top">
                              <div className="flex items-start gap-3">
                                <Avatar
                                  className="h-10 w-10 shrink-0 ring-1 ring-border/60 mt-0.5"
                                  data-testid={`avatar-${rowUser.id}`}
                                >
                                  <AvatarImage src={rowUser.profileImageUrl || undefined} />
                                  <AvatarFallback className="bg-sky-100/80 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200 font-semibold">
                                    {(rowUser.firstName?.[0] || "") + (rowUser.lastName?.[0] || "") || "ع"}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <div
                                    className="font-semibold flex items-center gap-1.5 flex-wrap text-foreground"
                                    data-testid={`text-name-${rowUser.id}`}
                                  >
                                    <span className="break-words">{adminUserLabel(rowUser)}</span>
                                    {rowUser.verificationBadge === "gold" && (
                                      <BadgeCheck
                                        className="h-4 w-4 text-amber-500 shrink-0"
                                        aria-label="موثق ذهبي"
                                      />
                                    )}
                                    {rowUser.verificationBadge === "silver" && (
                                      <BadgeCheck
                                        className="h-4 w-4 text-slate-400 shrink-0"
                                        aria-label="موثق فضي"
                                      />
                                    )}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    <Badge
                                      variant="secondary"
                                      className="py-0.5 text-[11px] font-medium"
                                    >
                                      {rowUser.roleNameAr || "قارئ"}
                                    </Badge>
                                    {(rowUser.country || rowUser.city) && (
                                      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                                        <MapPin className="h-3 w-3 shrink-0" />
                                        <span className="break-words">
                                          {[rowUser.city, rowUser.country].filter(Boolean).join("، ")}
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Email & Verification Indicators */}
                            <td
                              className="flex flex-col gap-1.5 border-t border-border/40 pt-2.5 md:table-cell md:border-0 md:py-3.5 md:px-4 md:align-top"
                              data-testid={`text-email-${rowUser.id}`}
                            >
                              <div className="flex items-center justify-between gap-2 md:block">
                                <span className="text-xs font-medium text-muted-foreground md:hidden">
                                  البريد الإلكتروني
                                </span>
                                <EmailCell
                                  email={rowUser.email}
                                  emailVerified={rowUser.emailVerified}
                                />
                              </div>
                              {/* Verification Chips Strip (Email / Phone / 2FA) */}
                              <div className="flex flex-wrap items-center gap-1 md:mt-1">
                                {realEmail && rowUser.emailVerified && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                                    <Mail className="h-2.5 w-2.5" />
                                    بريد موثق
                                  </span>
                                )}
                                {realEmail && !rowUser.emailVerified && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                    <AlertCircle className="h-2.5 w-2.5" />
                                    بريد غير موثق
                                  </span>
                                )}
                                {rowUser.phoneNumber && rowUser.phoneVerified && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                                    <Phone className="h-2.5 w-2.5" />
                                    جوال موثق
                                  </span>
                                )}
                                {rowUser.twoFactorEnabled && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
                                    <ShieldCheck className="h-2.5 w-2.5" />
                                    2FA
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Phone */}
                            <td
                              className="flex items-center justify-between gap-2 md:table-cell md:py-3.5 md:px-4 md:align-top"
                              data-testid={`text-phone-${rowUser.id}`}
                            >
                              <span className="text-xs font-medium text-muted-foreground md:hidden">
                                رقم الجوال
                              </span>
                              {rowUser.phoneNumber ? (
                                <div className="flex items-center gap-1.5 text-sm font-mono" dir="ltr">
                                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="break-all">{rowUser.phoneNumber}</span>
                                  {rowUser.phoneVerified && (
                                    <BadgeCheck
                                      className="h-4 w-4 text-emerald-500 shrink-0"
                                      aria-label="جوال موثق"
                                    />
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>

                            {/* Loyalty / Membership */}
                            <td
                              className="flex items-center justify-between gap-2 md:table-cell md:py-3.5 md:px-4 md:align-top"
                              data-testid={`text-loyalty-${rowUser.id}`}
                            >
                              <span className="text-xs font-medium text-muted-foreground md:hidden">
                                العضوية والولاء
                              </span>
                              {rowUser.loyalty ? (
                                <div className="flex items-center gap-2 md:flex-col md:items-start md:gap-0.5">
                                  <Badge
                                    variant="outline"
                                    className={`gap-1 py-0.5 w-fit ${getRankColor(rowUser.loyalty.rankLevel)}`}
                                  >
                                    <Award className="h-3 w-3" />
                                    <span className="text-xs">{rowUser.loyalty.currentRank}</span>
                                  </Badge>
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    {formatLatinNumber(rowUser.loyalty.totalPoints)} نقطة
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>

                            {/* Account Status */}
                            <td className="flex items-center justify-between gap-2 md:table-cell md:py-3.5 md:px-4 md:align-top">
                              <span className="text-xs font-medium text-muted-foreground md:hidden">
                                الحالة
                              </span>
                              <div className="flex flex-wrap items-center gap-1.5 md:flex-col md:items-start md:gap-1">
                                {getStatusBadge(rowUser.status)}
                                {!rowUser.isProfileComplete && (
                                  <span className="text-[11px] text-amber-600 dark:text-amber-400">
                                    ملف غير مكتمل
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Last Activity */}
                            <td
                              className="flex items-center justify-between gap-2 text-sm text-muted-foreground md:table-cell md:py-3.5 md:px-4 md:align-top"
                              data-testid={`text-last-activity-${rowUser.id}`}
                            >
                              <span className="text-xs font-medium text-muted-foreground md:hidden">
                                آخر نشاط
                              </span>
                              <div className="flex items-center gap-2 md:flex-col md:items-start md:gap-0.5">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 shrink-0" />
                                  <span>
                                    {formatRelative(rowUser.lastActivityAt || rowUser.lastLoginAt)}
                                  </span>
                                </div>
                                {getPlatformLabel(rowUser.lastDeviceInfo) && (
                                  <div className="text-xs flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5">
                                    <Smartphone className="h-3 w-3 shrink-0" />
                                    <span>{getPlatformLabel(rowUser.lastDeviceInfo)}</span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Registration Date */}
                            <td
                              className="flex items-center justify-between gap-2 text-sm tabular-nums md:table-cell md:py-3.5 md:px-4 md:align-top"
                              data-testid={`text-date-${rowUser.id}`}
                            >
                              <span className="text-xs font-medium text-muted-foreground md:hidden">
                                تاريخ التسجيل
                              </span>
                              <span>{formatDate(rowUser.createdAt)}</span>
                            </td>

                            {/* Actions */}
                            <td className="block border-t border-border/50 pt-2.5 md:table-cell md:border-0 md:py-3.5 md:px-4 md:align-top">
                              <div className="flex flex-wrap items-center justify-end gap-1 md:justify-start">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setViewingDetails(rowUser)}
                                  data-testid={`button-view-details-${rowUser.id}`}
                                  title="عرض التفاصيل"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setPromotingUser(rowUser)}
                                  disabled={isSelf}
                                  data-testid={`button-promote-reporter-${rowUser.id}`}
                                  title="ترقية إلى مراسل"
                                >
                                  <UserCheck className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEditRoles(rowUser)}
                                  disabled={isSelf}
                                  data-testid={`button-edit-roles-${rowUser.id}`}
                                  title="إدارة الأدوار"
                                >
                                  <Users className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEdit(rowUser)}
                                  disabled={isSelf}
                                  data-testid={`button-edit-${rowUser.id}`}
                                  title="تعديل الحساب"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setResettingPassword(rowUser);
                                    setNewPassword("");
                                  }}
                                  disabled={isSelf}
                                  data-testid={`button-reset-password-${rowUser.id}`}
                                  title="إعادة تعيين كلمة المرور"
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeletingUser(rowUser)}
                                  disabled={isSelf}
                                  data-testid={`button-delete-${rowUser.id}`}
                                  title="حظر المستخدم"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                                {/* Permanent delete button - only for banned users */}
                                {(rowUser.status === "banned" || rowUser.status === "deleted") && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setPermanentDeletingUser(rowUser)}
                                    disabled={isSelf}
                                    className="text-destructive hover:text-destructive"
                                    title="حذف نهائي"
                                    data-testid={`button-permanent-delete-${rowUser.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination controls */}
              {totalUsers > 0 && (
                <div className="mt-5 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-4 text-sm sm:flex-row">
                  <div className="text-muted-foreground" data-testid="pagination-status">
                    عرض{" "}
                    <span className="font-bold tabular-nums text-foreground">
                      {formatLatinNumber((page - 1) * pageSize + 1)}
                    </span>
                    {" – "}
                    <span className="font-bold tabular-nums text-foreground">
                      {formatLatinNumber(Math.min(page * pageSize, totalUsers))}
                    </span>
                    {" من "}
                    <span className="font-bold tabular-nums text-foreground">
                      {formatLatinNumber(totalUsers)}
                    </span>
                    {" قارئ"}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">صفوف لكل صفحة:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="rounded-lg border border-input bg-background px-2.5 py-1 text-sm tabular-nums"
                      data-testid="select-page-size"
                    >
                      {[50, 100, 200, 500].map((n) => (
                        <option key={n} value={n}>
                          {formatLatinNumber(n)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-1">
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
                    <span className="px-3 text-muted-foreground tabular-nums font-medium">
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
      </DashboardPageShell>

      {/* Edit Dialog */}
      <EditUserDialog 
        open={!!editingUser} 
        onOpenChange={(open) => !open && setEditingUser(null)}
        userId={editingUser?.id || null}
      />

      <AlertDialog open={!!promotingUser} onOpenChange={(open) => !open && setPromotingUser(null)}>
        <AlertDialogContent data-testid="dialog-promote-reporter">
          <AlertDialogHeader>
            <AlertDialogTitle>ترقية إلى مراسل</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم تحويل عضوية "{promotingUser ? adminUserLabel(promotingUser) : ""}" من قارئ إلى مراسل،
              ومزامنة الدور في الصلاحيات وصفحة المراسل حتى يتمكن من استكمال الملف وإصدار شهادة التعريف.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-promote-reporter">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => promotingUser && promoteReporterMutation.mutate(promotingUser.id)}
              disabled={promoteReporterMutation.isPending}
              data-testid="button-confirm-promote-reporter"
            >
              {promoteReporterMutation.isPending ? "جاري الترقية..." : "ترقية إلى مراسل"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent data-testid="dialog-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف المستخدم "{deletingUser ? adminUserLabel(deletingUser) : ""}"؟ سيتم تعيين حالته إلى "محظور".
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
                هل أنت متأكد من حذف المستخدم "{permanentDeletingUser ? adminUserLabel(permanentDeletingUser) : ""}" نهائياً؟
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
                        {hasRealEmail(viewingDetails.email) ? (
                          <>
                            <span className="font-medium" dir="ltr">{viewingDetails.email}</span>
                            {viewingDetails.emailVerified && (
                              <BadgeCheck className="h-4 w-4 text-emerald-500" aria-label="بريد موثق" />
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">لم يُضف بريد — الملف غير مكتمل</span>
                        )}
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
  const { data: userRolesRaw, isLoading } = useQuery<Role[]>({
    queryKey: ["/api/admin/users", userId, "roles"],
    queryFn: async () => {
      try {
        const res = await apiRequest(`/api/admin/users/${userId}/roles`);
        return Array.isArray(res) ? res : [];
      } catch {
        return [];
      }
    },
  });
  const userRoles = Array.isArray(userRolesRaw) ? userRolesRaw : [];

  if (isLoading) {
    return <span className="text-muted-foreground text-sm" data-testid={`text-roles-loading-${userId}`}>...</span>;
  }

  if (userRoles.length === 0) {
    return <span className="text-muted-foreground" data-testid={`text-no-roles-${userId}`}>بدون أدوار</span>;
  }

  return (
    <div className="flex gap-1 flex-wrap" data-testid={`div-roles-${userId}`}>
      {userRoles.map((role) => (
        <Badge key={role.id} variant="outline" className="py-0.5" data-testid={`badge-role-${userId}-${role.id}`}>
          {role.nameAr}
        </Badge>
      ))}
    </div>
  );
}
