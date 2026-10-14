import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, apiUrl } from "@/lib/queryClient";
import { hasRealEmail } from "@shared/authEmail";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VerificationChips, VerificationSummary } from "@/components/account/VerificationChips";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { EditUserDialog } from "@/components/EditUserDialog";
import {
  Users,
  UserCheck,
  UserX,
  Ban,
  Search,
  Eye,
  Shield,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Briefcase,
  UserCog,
  Send,
  Mail,
  RotateCcw,
  FileText,
  Clock,
  Phone,
  Building2,
  SlidersHorizontal,
  Activity,
} from "lucide-react";

interface StaffUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  status: string;
  emailVerified: boolean;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
  role: string;
  roleName: string | null;
  roleNameAr: string | null;
  roleId: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  articleCount?: number;
  articlesCount?: number;
  totalArticles?: number;
  department?: string | null;
  titleAr?: string | null;
}

interface Role {
  id: string;
  name: string;
  nameAr: string;
}

const STAFF_ROLES = [
  "admin",
  "system_admin",
  "editor",
  "reporter",
  "comments_moderator",
  "content_manager",
  "opinion_author",
  "publisher",
  "reader",
];

const STAFF_ROLE_LABELS: Record<string, string> = {
  admin: "مدير عام",
  system_admin: "مدير النظام",
  editor: "محرر",
  reporter: "مراسل",
  comments_moderator: "مشرف تعليقات",
  content_manager: "مدير محتوى",
  opinion_author: "كاتب مقال رأي",
  publisher: "ناشر",
  reader: "قارئ",
};

type DepartmentId = "all" | "editorial" | "field" | "opinion" | "management" | "moderation";

const DEPARTMENTS: {
  id: DepartmentId;
  label: string;
  roles: string[];
  badgeClass: string;
}[] = [
  {
    id: "all",
    label: "كل الأقسام",
    roles: STAFF_ROLES,
    badgeClass: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  },
  {
    id: "editorial",
    label: "غرفة الأخبار والتحرير",
    roles: ["editor", "content_manager", "publisher"],
    badgeClass: "border-emerald-300/80 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  },
  {
    id: "field",
    label: "المراسلون والتغطية",
    roles: ["reporter"],
    badgeClass: "border-cyan-300/80 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200",
  },
  {
    id: "opinion",
    label: "كتّاب الرأي",
    roles: ["opinion_author"],
    badgeClass: "border-violet-300/80 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  },
  {
    id: "management",
    label: "الإدارة والنظام",
    roles: ["admin", "system_admin"],
    badgeClass: "border-amber-300/80 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  },
  {
    id: "moderation",
    label: "الإشراف والمجتمع",
    roles: ["comments_moderator", "reader"],
    badgeClass: "border-sky-300/80 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  },
];

function getDepartmentForRole(role: string) {
  return (
    DEPARTMENTS.find((d) => d.id !== "all" && d.roles.includes(role)) || {
      id: "editorial" as DepartmentId,
      label: "الفريق التحريري",
      roles: [],
      badgeClass:
        "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
    }
  );
}

function getRoleTaskSummary(role: string): string {
  switch (role) {
    case "admin":
    case "system_admin":
      return "إشراف كامل وإدارة صلاحيات";
    case "editor":
      return "تحرير ومراجعة الأخبار";
    case "content_manager":
      return "إدارة النشر والأجندة";
    case "reporter":
      return "تغطية ميدانية وتقارير";
    case "opinion_author":
      return "مقالات وزوايا رأي";
    case "comments_moderator":
      return "إشراف التفاعل والتعليقات";
    case "publisher":
      return "نشر وتوزيع المحتوى";
    default:
      return "عضو فريق";
  }
}

function getActivityFreshness(lastActivityAt: string | null): {
  label: string;
  dotClass: string;
  isRecent: boolean;
} {
  if (!lastActivityAt) {
    return {
      label: "بدون نشاط مسجل",
      dotClass: "bg-slate-400",
      isRecent: false,
    };
  }
  const diffDays = (Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 1) {
    return { label: "نشط اليوم", dotClass: "bg-emerald-500", isRecent: true };
  }
  if (diffDays <= 7) {
    return { label: "نشط هذا الأسبوع", dotClass: "bg-sky-500", isRecent: true };
  }
  if (diffDays <= 30) {
    return { label: "نشط هذا الشهر", dotClass: "bg-amber-500", isRecent: false };
  }
  return { label: "غير نشط مؤخراً", dotClass: "bg-slate-400", isRecent: false };
}

const MOBILE_COLUMN_LABELS: Record<string, string> = {
   email: "البريد والتواصل",
  verification: "التوثيق",
  roleNameAr: "الدور والقسم",
  productivity: "الإنتاجية والمهام",
  status: "الحالة",
  lastActivityAt: "آخر نشاط",
};

export default function StaffMembers() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentId>("all");

  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<StaffUser | null>(null);

  const [suspendReason, setSuspendReason] = useState("");
  const [suspendDuration, setSuspendDuration] = useState("7");
  const [banReason, setBanReason] = useState("");
  const [banIsPermanent, setBanIsPermanent] = useState(false);
  const [banDuration, setBanDuration] = useState("30");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [sendCredentialsDialogOpen, setSendCredentialsDialogOpen] = useState(false);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Fetch users for each staff role separately to ensure we get ALL staff members
  // (not limited by the 500 user default API limit)
  // Store users with their associated roles for proper filtering
  const { data: usersWithRolesData = { users: [], userRolesMap: new Map() }, isLoading: usersLoading } = useQuery<{
    users: StaffUser[];
    userRolesMap: Map<string, string[]>;
  }>({
    queryKey: ["/api/admin/users", "staff", "all-roles"],
    queryFn: async () => {
      // Fetch all staff roles in parallel
      const rolePromises = STAFF_ROLES.map(async (queriedRole) => {
        const res = await fetch(apiUrl(`/api/admin/users?role=${encodeURIComponent(queriedRole)}&limit=1000`));
        if (!res.ok) return { role: queriedRole, users: [] as StaffUser[] };
        const data = await res.json();
        let usersArray: StaffUser[] = [];
        if (Array.isArray(data)) usersArray = data;
        else if (data && Array.isArray(data.users)) usersArray = data.users;
        else if (data && Array.isArray(data.items)) usersArray = data.items;
        return { role: queriedRole, users: usersArray };
      });

      const allRoleResults = await Promise.all(rolePromises);

      // Build a map of userId -> roles[] and deduplicated users list
      const userRolesMap = new Map<string, string[]>();
      const usersMap = new Map<string, StaffUser>();

      allRoleResults.forEach(({ role, users }) => {
        const safeUsers = Array.isArray(users) ? users : [];
        safeUsers.forEach((u) => {
          // Track all roles for this user
          const existingRoles = userRolesMap.get(u.id) || [];
          if (!existingRoles.includes(role)) {
            existingRoles.push(role);
          }
          userRolesMap.set(u.id, existingRoles);

          // Store user with original API role for display
          if (!usersMap.has(u.id)) {
            usersMap.set(u.id, u);
          }
        });
      });

      return {
        users: Array.from(usersMap.values()),
        userRolesMap,
      };
    },
    enabled: !!user,
  });

  const allUsers = Array.isArray(usersWithRolesData?.users) ? usersWithRolesData.users : [];
  const userRolesMap = usersWithRolesData?.userRolesMap instanceof Map ? usersWithRolesData.userRolesMap : new Map<string, string[]>();

  const { data: rolesRaw } = useQuery<Role[]>({
    queryKey: ["/api/admin/roles"],
    enabled: !!user,
  });
  const roles = Array.isArray(rolesRaw) ? rolesRaw : [];

  const staffRoles = useMemo(() => {
    return roles.filter((r) => STAFF_ROLES.includes(r.name));
  }, [roles]);

  const filteredUsers = useMemo(() => {
    return allUsers.filter((u) => {
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      const userRoles = userRolesMap.get(u.id) || [u.role];
      // Department filter check
      if (departmentFilter !== "all") {
        const dept = DEPARTMENTS.find((d) => d.id === departmentFilter);
        if (dept && !userRoles.some((r: string) => dept.roles.includes(r))) {
          return false;
        }
      }
      // Role filter check
      if (roleFilter !== "all") {
        if (!userRoles.includes(roleFilter)) return false;
      }
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const fullName = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
        const emailMatch = (u.email || "").toLowerCase().includes(search);
        const phoneMatch = (u.phoneNumber || "").toLowerCase().includes(search);
        if (!fullName.includes(search) && !emailMatch && !phoneMatch) {
          return false;
        }
      }
      return true;
    });
  }, [allUsers, statusFilter, departmentFilter, roleFilter, searchTerm, userRolesMap]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STAFF_ROLES.forEach((role: string) => (counts[role] = 0));
    userRolesMap.forEach((userRolesList: string[]) => {
      userRolesList.forEach((role: string) => {
        if (counts[role] !== undefined) {
          counts[role]++;
        }
      });
    });
    return counts;
  }, [userRolesMap]);

  const productivityStats = useMemo(() => {
    let activeCount = 0;
    let recentlyActiveCount = 0;
    let totalArticles = 0;
    allUsers.forEach((u) => {
      if (u.status === "active") activeCount++;
      if (getActivityFreshness(u.lastActivityAt).isRecent) recentlyActiveCount++;
      const count = u.articleCount ?? u.articlesCount ?? u.totalArticles ?? 0;
      if (typeof count === "number" && count > 0) totalArticles += count;
    });
    return {
      activeCount,
      recentlyActiveCount,
      totalArticles,
      opinionCount: roleCounts.opinion_author || 0,
    };
  }, [allUsers, roleCounts]);

  const suspendMutation = useMutation({
    mutationFn: async ({ userId, reason, duration }: { userId: string; reason: string; duration?: number }) => {
      return await apiRequest(`/api/dashboard/users/${userId}/suspend`, {
        method: "POST",
        body: JSON.stringify({ reason, duration }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "تم التعليق", description: "تم تعليق المستخدم بنجاح" });
      setSuspendDialogOpen(false);
      setSuspendReason("");
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message || "فشل تعليق المستخدم", variant: "destructive" });
    },
  });

  const banMutation = useMutation({
    mutationFn: async ({ userId, reason, isPermanent, duration }: { userId: string; reason: string; isPermanent: boolean; duration?: number }) => {
      return await apiRequest(`/api/dashboard/users/${userId}/ban`, {
        method: "POST",
        body: JSON.stringify({ reason, isPermanent, duration }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "تم الحظر", description: "تم حظر المستخدم بنجاح" });
      setBanDialogOpen(false);
      setBanReason("");
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message || "فشل حظر المستخدم", variant: "destructive" });
    },
  });

  const unsuspendMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/dashboard/users/${userId}/unsuspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "تم إلغاء التعليق", description: "أصبحت عضوية الموظف نشطة مرة أخرى" });
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message || "فشل إلغاء تعليق المستخدم", variant: "destructive" });
    },
  });

  const unbanMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/dashboard/users/${userId}/unban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "تم رفع الحظر", description: "أصبحت عضوية الموظف نشطة مرة أخرى" });
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message || "فشل رفع الحظر عن المستخدم", variant: "destructive" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      return await apiRequest(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ roleId }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "تم التحديث", description: "تم تغيير دور المستخدم بنجاح" });
      setRoleDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "خطأ", description: error.message || "فشل تغيير الدور", variant: "destructive" });
    },
  });

  const sendCredentialsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/admin/staff/send-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "تم الإرسال",
        description: `تم إرسال بيانات الدخول بنجاح إلى ${data.summary?.success || 0} موظف`,
      });
      setSendCredentialsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل إرسال بيانات الدخول",
        variant: "destructive",
      });
    },
  });

  const columnHelper = createColumnHelper<StaffUser>();
  const columns = [
    columnHelper.accessor("firstName", {
      header: "الموظف",
      cell: (info) => {
        const staffUser = info.row.original;
        const fullName = [staffUser.firstName, staffUser.lastName].filter(Boolean).join(" ") || "بدون اسم";
        const dept = getDepartmentForRole(staffUser.role);
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 shrink-0 ring-1 ring-border/60" data-testid={`avatar-staff-${staffUser.id}`}>
              <AvatarImage src={staffUser.profileImageUrl || undefined} />
              <AvatarFallback className="bg-sky-100/80 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200 font-semibold">
                {(staffUser.firstName?.[0] || "") + (staffUser.lastName?.[0] || "") || "م"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="font-semibold text-foreground" data-testid={`text-staff-name-${staffUser.id}`}>
                {fullName}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3 w-3 shrink-0" />
                  {staffUser.department || dept.label}
                </span>
              </div>
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor("email", {
      header: "البريد الإلكتروني",
      cell: (info) => {
        const staffUser = info.row.original;
        const emailVal = info.getValue();
        const isReal = hasRealEmail(emailVal);
        return (
          <div className="flex flex-col items-end md:items-start gap-1">
            <span
              className={isReal ? "font-mono text-[13px] break-all" : "text-xs text-muted-foreground"}
              data-testid={`text-staff-email-${staffUser.id}`}
            >
              {isReal ? emailVal : "لم يُضف بريد"}
            </span>
            {staffUser.phoneNumber && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-mono" dir="ltr">
                <Phone className="h-3 w-3 shrink-0" />
                {staffUser.phoneNumber}
              </span>
            )}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "verification",
      header: "التوثيق",
      cell: (info) => <VerificationChips user={info.row.original} idForTest={info.row.original.id} />,
    }),
    columnHelper.accessor("roleNameAr", {
      header: "الدور والقسم",
      cell: (info) => {
        const staffUser = info.row.original;
        const roleLabel = staffUser.roleNameAr || STAFF_ROLE_LABELS[staffUser.role] || staffUser.role;
        const extraRoles = (userRolesMap.get(staffUser.id) || []).filter(
          (r: string) => r !== staffUser.role && r !== "reader"
        );
        const dept = getDepartmentForRole(staffUser.role);
        return (
          <div className="flex flex-wrap items-center gap-1">
            <Badge
              variant="outline"
              className={`py-0.5 font-medium ${dept.badgeClass}`}
              data-testid={`badge-staff-role-${staffUser.id}`}
            >
              {roleLabel}
            </Badge>
            {extraRoles.map((extraRole: string) => (
              <Badge key={extraRole} variant="secondary" className="py-0.5 text-[11px]">
                {STAFF_ROLE_LABELS[extraRole] || extraRole}
              </Badge>
            ))}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "productivity",
      header: "الإنتاجية والمهام",
      cell: (info) => {
        const staffUser = info.row.original;
        const articles =
          staffUser.articleCount ?? staffUser.articlesCount ?? staffUser.totalArticles ?? null;
        return (
          <div className="flex flex-col items-end md:items-start gap-1">
            {typeof articles === "number" && articles > 0 ? (
              <Badge variant="secondary" className="gap-1 py-0.5 tabular-nums">
                <FileText className="h-3 w-3 text-sky-600 dark:text-sky-400" />
                {articles.toLocaleString("en-US")} مادة منشورة
              </Badge>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground/85">
                <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                {staffUser.titleAr || getRoleTaskSummary(staffUser.role)}
              </span>
            )}
            {staffUser.createdAt && (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                منذ{" "}
                {new Date(staffUser.createdAt).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor("status", {
      header: "الحالة",
      cell: (info) => {
        const status = info.getValue();
        const variants: Record<string, { variant: "default" | "outline" | "secondary" | "destructive"; label: string }> = {
          active: { variant: "default", label: "نشط" },
          pending: { variant: "outline", label: "بانتظار التفعيل" },
          suspended: { variant: "secondary", label: "معلق" },
          banned: { variant: "destructive", label: "محظور" },
          locked: { variant: "secondary", label: "مقفل" },
          deleted: { variant: "destructive", label: "محذوف" },
        };
        const config = variants[status] || { variant: "outline" as const, label: status || "غير معروف" };
        return (
          <Badge variant={config.variant} className="py-0.5" data-testid={`badge-staff-status-${info.row.original.id}`}>
            {config.label}
          </Badge>
        );
      },
    }),
    columnHelper.accessor("lastActivityAt", {
      header: "آخر نشاط",
      cell: (info) => {
        const lastActivity = info.getValue();
        const freshness = getActivityFreshness(lastActivity);
        return (
          <div className="flex flex-col items-end md:items-start gap-0.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
              <span className={`h-2 w-2 rounded-full ${freshness.dotClass}`} />
              {freshness.label}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums" data-testid={`text-staff-activity-${info.row.original.id}`}>
              {lastActivity
                ? new Date(lastActivity).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "لا يوجد"}
            </span>
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "الإجراءات",
      cell: (info) => {
        const rowUser = info.row.original;
        const isCurrentUser = rowUser.id === user?.id;
        const status = rowUser.status;
        return (
          <div className="flex flex-wrap items-center justify-end gap-1 md:justify-start">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.open(`/profile/${rowUser.id}`, "_blank")}
              title="عرض الملف"
              data-testid={`action-staff-view-${rowUser.id}`}
            >
              <Eye className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectedUser(rowUser);
                setEditDialogOpen(true);
              }}
              title="تعديل البيانات"
              data-testid={`action-staff-edit-${rowUser.id}`}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectedUser(rowUser);
                setSelectedRoleId(rowUser.roleId || "");
                setRoleDialogOpen(true);
              }}
              disabled={isCurrentUser}
              title="تغيير الدور"
              data-testid={`action-staff-role-${rowUser.id}`}
            >
              <Shield className="w-4 h-4" />
            </Button>
            {status === "banned" ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => unbanMutation.mutate(rowUser.id)}
                disabled={isCurrentUser || unbanMutation.isPending}
                title="رفع الحظر"
                className="text-emerald-600 hover:text-emerald-600"
                data-testid={`action-staff-unban-${rowUser.id}`}
              >
                {unbanMutation.isPending && unbanMutation.variables === rowUser.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
              </Button>
            ) : (
              <>
                {status === "suspended" ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => unsuspendMutation.mutate(rowUser.id)}
                    disabled={isCurrentUser || unsuspendMutation.isPending}
                    title="إلغاء التعليق"
                    className="text-emerald-600 hover:text-emerald-600"
                    data-testid={`action-staff-unsuspend-${rowUser.id}`}
                  >
                    {unsuspendMutation.isPending && unsuspendMutation.variables === rowUser.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserCheck className="w-4 h-4" />
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedUser(rowUser);
                      setSuspendDialogOpen(true);
                    }}
                    disabled={isCurrentUser}
                    title="تعليق"
                    data-testid={`action-staff-suspend-${rowUser.id}`}
                  >
                    <UserX className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSelectedUser(rowUser);
                    setBanDialogOpen(true);
                  }}
                  disabled={isCurrentUser}
                  title="حظر"
                  className="text-destructive hover:text-destructive"
                  data-testid={`action-staff-ban-${rowUser.id}`}
                >
                  <Ban className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        );
      },
    }),
  ];

  const table = useReactTable({
    data: filteredUsers,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    state: {
      sorting,
      pagination,
    },
  });

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setRoleFilter("all");
    setDepartmentFilter("all");
  };

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1600px]" contentClassName="px-4 pb-10 sm:px-6">
        <DashboardPageHeader
          icon={Users}
          title="منسوبي سبق"
          description="دليل الكادر التحريري والميداني والإداري — متابعة الأقسام، الصلاحيات، الإنتاجية، والتوثيق"
          titleTestId="heading-staff-title"
          actions={
            <Button
              onClick={() => setSendCredentialsDialogOpen(true)}
              className="gap-2 shadow-xs"
              data-testid="button-send-credentials"
            >
              <Mail className="h-4 w-4" />
              إرسال بيانات الدخول للجميع
            </Button>
          }
        />

        {/* Top 4-Card KPI Summary Strip */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            className={`cursor-pointer rounded-2xl border-sky-200/60 bg-gradient-to-br from-sky-50/55 via-card to-card shadow-xs transition-all hover:shadow-md dark:border-sky-900/40 dark:from-sky-950/20 ${
              roleFilter === "all" && departmentFilter === "all" ? "ring-2 ring-sky-500/40" : ""
            }`}
            onClick={() => {
              setRoleFilter("all");
              setDepartmentFilter("all");
            }}
            data-testid="card-staff-total"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي المنسوبين</CardTitle>
              <span className="rounded-xl bg-sky-100/80 p-2 dark:bg-sky-950/50">
                <Users className="h-4 w-4 text-sky-700 dark:text-sky-300" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums tracking-tight" data-testid="text-staff-total">
                {usersLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
                ) : (
                  allUsers.length.toLocaleString("en-US")
                )}
              </div>
              {!usersLoading && (
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <Activity className="h-3 w-3" />
                    نشط: {productivityStats.activeCount.toLocaleString("en-US")}
                  </span>
                  <span className="tabular-nums">
                    خلال أسبوع: {productivityStats.recentlyActiveCount.toLocaleString("en-US")}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer rounded-2xl border-emerald-200/60 bg-gradient-to-br from-emerald-50/55 via-card to-card shadow-xs transition-all hover:shadow-md dark:border-emerald-900/40 dark:from-emerald-950/20 ${
              roleFilter === "editor" ? "ring-2 ring-emerald-500/40" : ""
            }`}
            onClick={() => {
              setDepartmentFilter("all");
              setRoleFilter("editor");
            }}
            data-testid="card-staff-editors"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">المحررون</CardTitle>
              <span className="rounded-xl bg-emerald-100/80 p-2 dark:bg-emerald-950/50">
                <Pencil className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums tracking-tight" data-testid="text-staff-editors">
                {usersLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                ) : (
                  (roleCounts.editor || 0).toLocaleString("en-US")
                )}
              </div>
              {!usersLoading && (
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  مديرو محتوى: {(roleCounts.content_manager || 0).toLocaleString("en-US")} · ناشرون:{" "}
                  {(roleCounts.publisher || 0).toLocaleString("en-US")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer rounded-2xl border-cyan-200/60 bg-gradient-to-br from-cyan-50/55 via-card to-card shadow-xs transition-all hover:shadow-md dark:border-cyan-900/40 dark:from-cyan-950/20 ${
              roleFilter === "reporter" ? "ring-2 ring-cyan-500/40" : ""
            }`}
            onClick={() => {
              setDepartmentFilter("all");
              setRoleFilter("reporter");
            }}
            data-testid="card-staff-reporters"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">المراسلون</CardTitle>
              <span className="rounded-xl bg-cyan-100/80 p-2 dark:bg-cyan-950/50">
                <Briefcase className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums tracking-tight" data-testid="text-staff-reporters">
                {usersLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
                ) : (
                  (roleCounts.reporter || 0).toLocaleString("en-US")
                )}
              </div>
              {!usersLoading && (
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  كتّاب الرأي: {productivityStats.opinionCount.toLocaleString("en-US")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer rounded-2xl border-amber-200/60 bg-gradient-to-br from-amber-50/50 via-card to-card shadow-xs transition-all hover:shadow-md dark:border-amber-900/40 dark:from-amber-950/20 ${
              roleFilter === "admin" ? "ring-2 ring-amber-500/40" : ""
            }`}
            onClick={() => {
              setDepartmentFilter("all");
              setRoleFilter("admin");
            }}
            data-testid="card-staff-admins"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">المدراء</CardTitle>
              <span className="rounded-xl bg-amber-100/80 p-2 dark:bg-amber-950/50">
                <UserCog className="h-4 w-4 text-amber-700 dark:text-amber-300" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums tracking-tight" data-testid="text-staff-admins">
                {usersLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                ) : (
                  ((roleCounts.admin || 0) + (roleCounts.system_admin || 0)).toLocaleString("en-US")
                )}
              </div>
              {!usersLoading && (
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  مشرفو التعليقات: {(roleCounts.comments_moderator || 0).toLocaleString("en-US")}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Search & Department/Role Quick Filter Pills */}
        <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-xs dark:border-sky-900/35 dark:from-sky-950/15">
          <CardContent className="pt-5 space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالاسم، البريد الإلكتروني، أو رقم الجوال..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10 pl-9"
                    data-testid="input-staff-search"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      aria-label="مسح البحث"
                      className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <VerificationSummary users={allUsers} className="mt-2.5" />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[155px]" data-testid="select-staff-role">
                    <SelectValue placeholder="الدور" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأدوار</SelectItem>
                    {STAFF_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {STAFF_ROLE_LABELS[role] || role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[155px]" data-testid="select-staff-status">
                    <SelectValue placeholder="الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الحالات</SelectItem>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="pending">بانتظار التفعيل</SelectItem>
                    <SelectItem value="suspended">معلق</SelectItem>
                    <SelectItem value="banned">محظور</SelectItem>
                  </SelectContent>
                </Select>

                <Button variant="outline" onClick={clearFilters} data-testid="button-staff-clear-filters">
                  <X className="w-4 h-4 ml-2" />
                  مسح الفلاتر
                </Button>
              </div>
            </div>

            {/* Department & Role Filter Pills */}
            <div className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-muted/25 p-3">
              {/* Department Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  القسم:
                </span>
                {DEPARTMENTS.map((dept) => {
                  const active = departmentFilter === dept.id;
                  return (
                    <button
                      key={dept.id}
                      type="button"
                      onClick={() => {
                        setDepartmentFilter(dept.id);
                        if (dept.id !== "all" && roleFilter !== "all" && !dept.roles.includes(roleFilter)) {
                          setRoleFilter("all");
                        }
                      }}
                      className={`no-min-touch-size inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        active
                          ? "border-sky-600 bg-sky-600 text-white shadow-2xs dark:border-sky-500 dark:bg-sky-500"
                          : "border-border/70 bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span>{dept.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Role & Status Pills */}
              <div className="flex flex-col gap-2 border-t border-border/50 pt-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    الدور:
                  </span>
                  <button
                    type="button"
                    onClick={() => setRoleFilter("all")}
                    className={`no-min-touch-size inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      roleFilter === "all"
                        ? "border-emerald-600 bg-emerald-600 text-white shadow-2xs dark:border-emerald-500 dark:bg-emerald-500"
                        : "border-border/70 bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    الكل ({allUsers.length.toLocaleString("en-US")})
                  </button>
                  {STAFF_ROLES.filter((r) => r !== "reader").map((role) => {
                    const active = roleFilter === role;
                    const count = roleCounts[role] || 0;
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setRoleFilter(role)}
                        className={`no-min-touch-size inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          active
                            ? "border-emerald-600 bg-emerald-600 text-white shadow-2xs dark:border-emerald-500 dark:bg-emerald-500"
                            : "border-border/70 bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <span>{STAFF_ROLE_LABELS[role] || role}</span>
                        <span className="tabular-nums opacity-80">({count.toLocaleString("en-US")})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Staff Directory Table / Responsive Mobile Cards */}
        <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-xs dark:border-sky-900/35 dark:from-sky-950/15">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              {usersLoading ? (
                <div className="flex flex-col justify-center items-center gap-2 py-12" data-testid="loading-staff-spinner">
                  <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                  <span className="text-sm text-muted-foreground">جاري تحميل قائمة المنسوبين...</span>
                </div>
              ) : (
                <Table>
                  <TableHeader className="hidden md:table-header-group">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id} className="bg-muted/30">
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id} className="text-right font-semibold">
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody className="flex flex-col gap-3 p-3 md:table-row-group md:p-0">
                    {table.getRowModel().rows.length > 0 ? (
                      table.getRowModel().rows.map((row) => (
                        <TableRow
                          key={row.id}
                          className="flex flex-col gap-2.5 rounded-2xl border border-border/75 bg-card/95 p-4 shadow-2xs transition-colors hover:bg-muted/30 md:table-row md:rounded-none md:border-0 md:border-b md:bg-transparent md:p-0 md:shadow-none"
                          data-testid={`row-staff-${row.original.id}`}
                        >
                          {row.getVisibleCells().map((cell) => {
                            const colId = cell.column.id;
                            const isIdentity = colId === "firstName";
                            const isActions = colId === "actions";
                            const mobileLabel = MOBILE_COLUMN_LABELS[colId];
                            return (
                              <TableCell
                                key={cell.id}
                                className={
                                  isIdentity
                                    ? "block p-0 text-right md:table-cell md:p-4"
                                    : isActions
                                      ? "block border-t border-border/50 pt-2.5 p-0 text-right md:table-cell md:border-0 md:p-4"
                                      : "flex items-center justify-between gap-2 p-0 text-right md:table-cell md:p-4"
                                }
                              >
                                {mobileLabel && (
                                  <span className="text-xs font-medium text-muted-foreground md:hidden">
                                    {mobileLabel}
                                  </span>
                                )}
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow className="block md:table-row">
                        <TableCell colSpan={columns.length} className="block text-center py-12 md:table-cell">
                          <p className="text-muted-foreground" data-testid="text-staff-empty">
                            لا توجد نتائج
                          </p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-t border-border/60">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">عدد الصفوف:</span>
                <Select
                  value={String(table.getState().pagination.pageSize)}
                  onValueChange={(value) => table.setPageSize(Number(value))}
                >
                  <SelectTrigger className="w-[100px] tabular-nums" data-testid="select-staff-page-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  data-testid="button-staff-previous-page"
                >
                  <ChevronRight className="w-4 h-4" />
                  السابق
                </Button>
                <span className="text-sm tabular-nums" data-testid="text-staff-page-info">
                  صفحة {(table.getState().pagination.pageIndex + 1).toLocaleString("en-US")} من{" "}
                  {(table.getPageCount() || 1).toLocaleString("en-US")}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  data-testid="button-staff-next-page"
                >
                  التالي
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </DashboardPageShell>

      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent data-testid="dialog-staff-suspend">
          <DialogHeader>
            <DialogTitle>تعليق الموظف</DialogTitle>
            <DialogDescription>
              قم بتعليق الموظف "{selectedUser?.email}" مؤقتاً
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="suspend-reason">السبب *</Label>
              <Textarea
                id="suspend-reason"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="اذكر سبب التعليق..."
                data-testid="textarea-staff-suspend-reason"
              />
            </div>
            <div>
              <Label htmlFor="suspend-duration">المدة</Label>
              <Select value={suspendDuration} onValueChange={setSuspendDuration}>
                <SelectTrigger id="suspend-duration" data-testid="select-staff-suspend-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">يوم واحد</SelectItem>
                  <SelectItem value="3">3 أيام</SelectItem>
                  <SelectItem value="7">أسبوع</SelectItem>
                  <SelectItem value="30">شهر</SelectItem>
                  <SelectItem value="permanent">دائم</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)} data-testid="button-staff-suspend-cancel">
              إلغاء
            </Button>
            <Button
              onClick={() => {
                if (selectedUser && suspendReason) {
                  suspendMutation.mutate({
                    userId: selectedUser.id,
                    reason: suspendReason,
                    duration: suspendDuration === "permanent" ? undefined : Number(suspendDuration),
                  });
                }
              }}
              disabled={!suspendReason || suspendMutation.isPending}
              data-testid="button-staff-suspend-confirm"
            >
              {suspendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "تعليق"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent data-testid="dialog-staff-ban">
          <DialogHeader>
            <DialogTitle>حظر الموظف</DialogTitle>
            <DialogDescription>
              قم بحظر الموظف "{selectedUser?.email}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="ban-reason">السبب *</Label>
              <Textarea
                id="ban-reason"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="اذكر سبب الحظر..."
                data-testid="textarea-staff-ban-reason"
              />
            </div>
            <div className="flex items-center space-x-2 space-x-reverse">
              <Checkbox
                id="ban-permanent"
                checked={banIsPermanent}
                onCheckedChange={(checked) => setBanIsPermanent(checked as boolean)}
                data-testid="checkbox-staff-ban-permanent"
              />
              <Label htmlFor="ban-permanent">حظر دائم</Label>
            </div>
            {!banIsPermanent && (
              <div>
                <Label htmlFor="ban-duration">المدة</Label>
                <Select value={banDuration} onValueChange={setBanDuration}>
                  <SelectTrigger id="ban-duration" data-testid="select-staff-ban-duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">أسبوع</SelectItem>
                    <SelectItem value="30">شهر</SelectItem>
                    <SelectItem value="90">3 أشهر</SelectItem>
                    <SelectItem value="365">سنة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanDialogOpen(false)} data-testid="button-staff-ban-cancel">
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedUser && banReason) {
                  banMutation.mutate({
                    userId: selectedUser.id,
                    reason: banReason,
                    isPermanent: banIsPermanent,
                    duration: banIsPermanent ? undefined : Number(banDuration),
                  });
                }
              }}
              disabled={!banReason || banMutation.isPending}
              data-testid="button-staff-ban-confirm"
            >
              {banMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "حظر"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent data-testid="dialog-staff-role">
          <DialogHeader>
            <DialogTitle>تغيير الدور</DialogTitle>
            <DialogDescription>
              اختر دوراً جديداً للموظف "{selectedUser?.email}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="role-select">الدور *</Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger id="role-select" data-testid="select-staff-new-role">
                  <SelectValue placeholder="اختر الدور" />
                </SelectTrigger>
                <SelectContent>
                  {staffRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)} data-testid="button-staff-role-cancel">
              إلغاء
            </Button>
            <Button
              onClick={() => {
                if (selectedUser && selectedRoleId) {
                  changeRoleMutation.mutate({
                    userId: selectedUser.id,
                    roleId: selectedRoleId,
                  });
                }
              }}
              disabled={!selectedRoleId || changeRoleMutation.isPending}
              data-testid="button-staff-role-confirm"
            >
              {changeRoleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditUserDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        userId={selectedUser?.id || null}
      />

      <Dialog open={sendCredentialsDialogOpen} onOpenChange={setSendCredentialsDialogOpen}>
        <DialogContent data-testid="dialog-send-credentials">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              إرسال بيانات الدخول
            </DialogTitle>
            <DialogDescription>
              سيتم إرسال بريد إلكتروني لكل موظف يحتوي على بيانات الدخول الخاصة به
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-amber-50 dark:bg-muted/40 border border-amber-200 dark:border-border rounded-lg p-4">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>تنبيه:</strong> سيتم إنشاء كلمة مرور مؤقتة جديدة لكل موظف وسيُطلب منه تغييرها عند أول تسجيل دخول.
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>سيتم إرسال البريد إلى <strong className="tabular-nums">{allUsers.length.toLocaleString("en-US")}</strong> موظف</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSendCredentialsDialogOpen(false)}
              data-testid="button-send-credentials-cancel"
            >
              إلغاء
            </Button>
            <Button
              onClick={() => sendCredentialsMutation.mutate()}
              disabled={sendCredentialsMutation.isPending}
              data-testid="button-send-credentials-confirm"
            >
              {sendCredentialsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 ml-2" />
                  إرسال للجميع
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
