import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
  Shield, Users, Key, Lock, Plus, Trash2,
  FileText, FolderOpen, MessageSquare, UserCog, Settings, 
  Calendar, Image, Bot, Mic, Microscope, 
  MessageCircle, Mail, ImageIcon, BarChart2, LayoutGrid, 
  Briefcase, Pin, Search, X, CheckSquare, Square, Sparkles
} from "lucide-react";
import type { RoleWithPermissions, Permission } from "@shared/schema";

function ModuleIcon({ module }: { module: string }) {
  const iconProps = { className: "w-4 h-4 text-primary shrink-0" };
  switch (module) {
    case "articles": return <FileText {...iconProps} />;
    case "categories": return <FolderOpen {...iconProps} />;
    case "users": return <Users {...iconProps} />;
    case "comments": return <MessageSquare {...iconProps} />;
    case "staff": return <UserCog {...iconProps} />;
    case "system": return <Settings {...iconProps} />;
    case "calendar": return <Calendar {...iconProps} />;
    case "visual_ai": return <Image {...iconProps} />;
    case "ifox": return <Bot {...iconProps} />;
    case "audio_newsletters": return <Mic {...iconProps} />;
    case "omq": return <Microscope {...iconProps} />;
    case "whatsapp_agent": return <MessageCircle {...iconProps} />;
    case "email_agent": return <Mail {...iconProps} />;
    case "media_library": return <ImageIcon {...iconProps} />;
    case "infographics": return <BarChart2 {...iconProps} />;
    case "analytics": return <BarChart2 {...iconProps} />;
    case "story_cards": return <LayoutGrid {...iconProps} />;
    case "publisher_sales": return <Briefcase {...iconProps} />;
    case "muqtarab": return <Pin {...iconProps} />;
    default: return <Shield {...iconProps} />;
  }
}

type RoleTypeFilter = "all" | "system" | "custom";

// ترتيب الوحدات وأسماؤها العربية
const moduleOrder = [
  "articles", "categories", "infographics", "muqtarab", "omq",
  "visual_ai", "ifox", "audio_newsletters", "story_cards",
  "media_library", "whatsapp_agent", "email_agent",
  "analytics", "publisher_sales",
  "users", "staff", "comments", "calendar", "system"
];

const moduleNames: Record<string, string> = {
  articles: "المقالات",
  categories: "التصنيفات",
  users: "المستخدمين",
  comments: "التعليقات",
  staff: "الكادر",
  system: "النظام",
  calendar: "التقويم التحريري",
  visual_ai: "توليد الصور بالذكاء الاصطناعي",
  ifox: "iFox - توليد المحتوى",
  audio_newsletters: "النشرات الصوتية",
  omq: "التحليل العميق",
  whatsapp_agent: "وكيل الواتساب",
  email_agent: "وكيل البريد",
  media_library: "مكتبة الوسائط",
  infographics: "الإنفوجرافيك",
  analytics: "التحليلات",
  story_cards: "بطاقات القصص",
  publisher_sales: "نظام الناشرين",
  muqtarab: "مُقترب",
};

export default function RolesManagement() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  const [editingRole, setEditingRole] = useState<RoleWithPermissions | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleNameAr, setNewRoleNameAr] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [deletingRole, setDeletingRole] = useState<RoleWithPermissions | null>(null);

  // Filters for roles list
  const [searchQuery, setSearchQuery] = useState("");
  const [roleTypeFilter, setRoleTypeFilter] = useState<RoleTypeFilter>("all");

  // Filters inside permissions matrix dialog
  const [permissionSearchQuery, setPermissionSearchQuery] = useState("");
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>("all");

  // Fetch roles
  const { data: rolesRaw, isLoading: rolesLoading } = useQuery<RoleWithPermissions[]>({
    queryKey: ["/api/admin/roles"],
    enabled: !!user,
  });
  const roles = Array.isArray(rolesRaw) ? rolesRaw : [];

  // Fetch all permissions
  const { data: allPermissionsRaw, isLoading: permissionsLoading } = useQuery<Permission[]>({
    queryKey: ["/api/permissions"],
    enabled: !!user && !!editingRole,
  });
  const allPermissions = Array.isArray(allPermissionsRaw) ? allPermissionsRaw : [];

  // KPI metrics
  const totalRolesCount = roles.length;
  const systemRolesCount = useMemo(() => roles.filter((r) => Boolean(r.isSystem)).length, [roles]);
  const customRolesCount = useMemo(() => roles.filter((r) => !r.isSystem).length, [roles]);
  const totalAssignedPermissions = useMemo(
    () =>
      roles.reduce(
        (sum, r) => sum + (Array.isArray(r.permissions) ? r.permissions.length : 0),
        0
      ),
    [roles]
  );
  const avgPermissionsPerRole =
    totalRolesCount > 0 ? Math.round(totalAssignedPermissions / totalRolesCount) : 0;
  const maxPermissionsInRole = useMemo(
    () =>
      Math.max(
        1,
        ...roles.map((r) => (Array.isArray(r.permissions) ? r.permissions.length : 0))
      ),
    [roles]
  );

  // Filtered roles
  const filteredRoles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return roles.filter((role) => {
      if (roleTypeFilter === "system" && !role.isSystem) return false;
      if (roleTypeFilter === "custom" && role.isSystem) return false;
      if (!q) return true;
      const nameArMatch = (role.nameAr || "").toLowerCase().includes(q);
      const nameEnMatch = (role.name || "").toLowerCase().includes(q);
      const descMatch = (role.description || "").toLowerCase().includes(q);
      return nameArMatch || nameEnMatch || descMatch;
    });
  }, [roles, roleTypeFilter, searchQuery]);

  // Update role permissions mutation
  const updatePermissionsMutation = useMutation({
    mutationFn: async (data: { roleId: string; permissionIds: string[] }) => {
      return await apiRequest(`/api/admin/roles/${data.roleId}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({ permissionIds: data.permissionIds }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/roles"] });
      toast({
        title: "تم التحديث",
        description: "تم تحديث صلاحيات الدور بنجاح",
      });
      setTimeout(() => {
        setEditingRole(null);
        setSelectedPermissions(new Set());
      }, 300);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل تحديث الصلاحيات",
        variant: "destructive",
      });
    },
  });

  // Create role mutation
  const createRoleMutation = useMutation({
    mutationFn: async (data: { name: string; nameAr: string; description: string }) => {
      return await apiRequest("/api/admin/roles", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/roles"] });
      toast({
        title: "تم إنشاء الدور",
        description: "تم إنشاء الدور الجديد بنجاح",
      });
      setIsCreateDialogOpen(false);
      setNewRoleName("");
      setNewRoleNameAr("");
      setNewRoleDescription("");
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل إنشاء الدور",
        variant: "destructive",
      });
    },
  });

  // Delete role mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      return await apiRequest(`/api/admin/roles/${roleId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/roles"] });
      toast({
        title: "تم الحذف",
        description: "تم حذف الدور بنجاح",
      });
      setDeletingRole(null);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل حذف الدور",
        variant: "destructive",
      });
    },
  });

  // Handle create role
  const handleCreateRole = () => {
    if (!newRoleName.trim() || !newRoleNameAr.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم الدور باللغتين",
        variant: "destructive",
      });
      return;
    }
    createRoleMutation.mutate({
      name: newRoleName,
      nameAr: newRoleNameAr,
      description: newRoleDescription,
    });
  };

  // Handle edit role permissions
  const handleEditPermissions = (role: RoleWithPermissions) => {
    setEditingRole(role);
    setPermissionSearchQuery("");
    setSelectedModuleFilter("all");
    const safePerms = Array.isArray(role.permissions) ? role.permissions : [];
    const permIds = new Set(safePerms.map((p) => p.id));
    setSelectedPermissions(permIds);
  };

  // Handle permission toggle
  const togglePermission = (permissionId: string) => {
    const newSet = new Set(selectedPermissions);
    if (newSet.has(permissionId)) {
      newSet.delete(permissionId);
    } else {
      newSet.add(permissionId);
    }
    setSelectedPermissions(newSet);
  };

  // Toggle all permissions in a module
  const toggleModulePermissions = (perms: Permission[]) => {
    const newSet = new Set(selectedPermissions);
    const allSelected = perms.every((p) => newSet.has(p.id));
    if (allSelected) {
      perms.forEach((p) => newSet.delete(p.id));
    } else {
      perms.forEach((p) => newSet.add(p.id));
    }
    setSelectedPermissions(newSet);
  };

  // Handle save permissions
  const handleSavePermissions = () => {
    if (!editingRole) return;
    updatePermissionsMutation.mutate({
      roleId: editingRole.id,
      permissionIds: Array.from(selectedPermissions),
    });
  };

  // Group permissions by module
  const permissionsByModule = useMemo(() => {
    return allPermissions.reduce((acc, perm) => {
      if (!acc[perm.module]) {
        acc[perm.module] = [];
      }
      acc[perm.module].push(perm);
      return acc;
    }, {} as Record<string, Permission[]>);
  }, [allPermissions]);

  // ترتيب الصلاحيات حسب الوحدات
  const sortedModules = useMemo(() => {
    return Object.keys(permissionsByModule).sort((a, b) => {
      const indexA = moduleOrder.indexOf(a);
      const indexB = moduleOrder.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [permissionsByModule]);

  // Filtered modules and permissions inside the dialog
  const filteredSortedModules = useMemo(() => {
    return sortedModules.filter((mod) =>
      selectedModuleFilter === "all" ? true : mod === selectedModuleFilter
    );
  }, [sortedModules, selectedModuleFilter]);

  const getRoleModulesPreview = (role: RoleWithPermissions) => {
    const perms = Array.isArray(role.permissions) ? role.permissions : [];
    const uniqueModules = Array.from(new Set(perms.map((p) => p.module).filter(Boolean)));
    return uniqueModules;
  };

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1600px]" contentClassName="px-4 pb-10 sm:px-6 space-y-6">
        <DashboardPageHeader
          icon={Shield}
          title="إدارة الأدوار والصلاحيات (RBAC)"
          description={
            <span data-testid="text-description">
              مصفوفة الأدوار الوظيفية وصلاحيات الوصول الدقيقة لأقسام لوحة التحكم والأنظمة التحريرية
            </span>
          }
          titleTestId="heading-title"
          actions={
            <Button
              onClick={() => setIsCreateDialogOpen(true)}
              className="gap-2 font-semibold shadow-xs"
              data-testid="button-create-role"
            >
              <Plus className="w-4 h-4" />
              إنشاء دور جديد
            </Button>
          }
        />

        {/* 4-Card Editorial KPI Summary Strip */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4" data-testid="roles-kpi-strip">
          {/* Card 1: Total Roles */}
          <div className="relative overflow-hidden rounded-2xl border border-sky-200/60 bg-gradient-to-br from-sky-50/70 via-card to-card p-4 sm:p-5 shadow-xs dark:border-sky-900/40 dark:from-sky-950/25">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">إجمالي الأدوار</p>
                <p className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums" data-testid="kpi-total-roles">
                  {totalRolesCount.toLocaleString("en-US")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  موزعة بين النظامية والمخصصة
                </p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Shield className="h-5 w-5" />
              </span>
            </div>
          </div>

          {/* Card 2: System Roles */}
          <div className="relative overflow-hidden rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/70 via-card to-card p-4 sm:p-5 shadow-xs dark:border-amber-900/40 dark:from-amber-950/25">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">الأدوار النظامية المحمية</p>
                <p className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums" data-testid="kpi-system-roles">
                  {systemRolesCount.toLocaleString("en-US")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  أدوار أساسية محمية من الحذف
                </p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Lock className="h-5 w-5" />
              </span>
            </div>
          </div>

          {/* Card 3: Custom Roles */}
          <div className="relative overflow-hidden rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/70 via-card to-card p-4 sm:p-5 shadow-xs dark:border-emerald-900/40 dark:from-emerald-950/25">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">الأدوار المخصصة</p>
                <p className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums" data-testid="kpi-custom-roles">
                  {customRolesCount.toLocaleString("en-US")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  قابلة للتخصيص وتعديل الصلاحيات
                </p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <UserCog className="h-5 w-5" />
              </span>
            </div>
          </div>

          {/* Card 4: Total Assigned Permissions */}
          <div className="relative overflow-hidden rounded-2xl border border-violet-200/60 bg-gradient-to-br from-violet-50/70 via-card to-card p-4 sm:p-5 shadow-xs dark:border-violet-900/40 dark:from-violet-950/25">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">إجمالي الصلاحيات الممنوحة</p>
                <p className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums" data-testid="kpi-total-permissions">
                  {totalAssignedPermissions.toLocaleString("en-US")}
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  بمتوسط {avgPermissionsPerRole.toLocaleString("en-US")} صلاحية لكل دور
                </p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Key className="h-5 w-5" />
              </span>
            </div>
          </div>
        </div>

        {/* Search & Quick Filter Bar */}
        <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-3.5 sm:flex-row sm:items-center sm:justify-between shadow-2xs">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم الدور بالعربية أو الإنجليزية أو الوصف..."
              className="h-9 pr-9 pl-8 text-sm bg-background"
              data-testid="input-search-roles"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="مسح البحث"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="تصفية الأدوار حسب النوع">
            {[
              { id: "all" as const, label: "الكل", count: totalRolesCount },
              { id: "system" as const, label: "أدوار نظامية", count: systemRolesCount },
              { id: "custom" as const, label: "أدوار مخصصة", count: customRolesCount },
            ].map((pill) => {
              const active = roleTypeFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setRoleTypeFilter(pill.id)}
                  data-testid={`filter-role-${pill.id}`}
                  className={`no-min-touch-size inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                    active
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>{pill.label}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${
                      active
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-background text-foreground/80"
                    }`}
                  >
                    {pill.count.toLocaleString("en-US")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {rolesLoading ? (
          <div className="flex justify-center rounded-2xl border border-border/60 bg-card p-10" data-testid="loading-roles">
            <p className="text-muted-foreground text-sm">جارِ تحميل الأدوار...</p>
          </div>
        ) : filteredRoles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
            <Shield className="h-10 w-10 text-muted-foreground/50" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground text-sm">لا توجد أدوار مطابقة لبحثك</p>
              <p className="text-xs text-muted-foreground">جرب تغيير كلمات البحث أو إعادة ضبط فلتر النوع</p>
            </div>
            {(searchQuery || roleTypeFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                className="no-min-touch-size h-8 text-xs"
                onClick={() => {
                  setSearchQuery("");
                  setRoleTypeFilter("all");
                }}
              >
                إعادة ضبط الفلاتر
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Polished Table */}
            <div className="hidden md:block overflow-x-auto rounded-2xl border border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-right font-bold" data-testid="header-role">الدور</TableHead>
                    <TableHead className="text-right font-bold" data-testid="header-description">الوصف</TableHead>
                    <TableHead className="text-right font-bold" data-testid="header-users">المستخدمين</TableHead>
                    <TableHead className="text-right font-bold" data-testid="header-permissions">الصلاحيات والوحدات</TableHead>
                    <TableHead className="text-right font-bold" data-testid="header-actions">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRoles.map((role) => {
                    const permCount = Array.isArray(role.permissions) ? role.permissions.length : 0;
                    const permPercent = Math.min(100, Math.round((permCount / maxPermissionsInRole) * 100));
                    const roleModules = getRoleModulesPreview(role);

                    return (
                      <TableRow key={role.id} className="group transition-colors hover:bg-muted/30" data-testid={`row-role-${role.id}`}>
                        <TableCell className="align-top py-3.5" data-testid={`cell-name-${role.id}`}>
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              {role.isSystem && (
                                <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" data-testid={`icon-lock-${role.id}`} />
                              )}
                              <span className="font-bold text-foreground">{role.nameAr}</span>
                              <Badge variant="outline" className="font-mono text-[11px]" data-testid={`badge-name-${role.id}`}>
                                {role.name}
                              </Badge>
                            </div>
                            <div>
                              {role.isSystem ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                  دور نظامي محمي
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                  دور مخصص
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top py-3.5 max-w-xs text-muted-foreground text-sm leading-relaxed" data-testid={`cell-description-${role.id}`}>
                          {role.description || <span className="text-xs italic text-muted-foreground/70">بدون وصف إضافي</span>}
                        </TableCell>
                        <TableCell className="align-top py-3.5" data-testid={`cell-usercount-${role.id}`}>
                          <div className="inline-flex items-center gap-2 rounded-xl bg-muted/50 px-2.5 py-1">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            <span className="font-semibold tabular-nums text-sm">
                              {(role.userCount || 0).toLocaleString("en-US")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="align-top py-3.5 min-w-[240px]" data-testid={`cell-permcount-${role.id}`}>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <Key className="w-4 h-4 text-primary" />
                                <span className="font-bold tabular-nums text-sm">
                                  {permCount.toLocaleString("en-US")}
                                </span>
                                <span className="text-xs text-muted-foreground">صلاحية</span>
                              </div>
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                {roleModules.length.toLocaleString("en-US")} وحدة
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  role.isSystem ? "bg-amber-500" : "bg-primary"
                                }`}
                                style={{ width: `${Math.max(permCount > 0 ? 8 : 0, permPercent)}%` }}
                              />
                            </div>
                            {roleModules.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                {roleModules.slice(0, 3).map((mod) => (
                                  <span
                                    key={mod}
                                    className="inline-flex items-center rounded-md border border-border/70 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                                  >
                                    {moduleNames[mod] || mod}
                                  </span>
                                ))}
                                {roleModules.length > 3 && (
                                  <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary tabular-nums">
                                    +{(roleModules.length - 3).toLocaleString("en-US")}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-top py-3.5" data-testid={`cell-actions-${role.id}`}>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="no-min-touch-size h-8 text-xs font-semibold"
                              onClick={() => handleEditPermissions(role)}
                              disabled={role.isSystem}
                              data-testid={`button-edit-${role.id}`}
                            >
                              {role.isSystem ? "محمي" : "تعديل الصلاحيات"}
                            </Button>
                            {!role.isSystem && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="no-min-touch-size h-8 w-8"
                                onClick={() => setDeletingRole(role)}
                                data-testid={`button-delete-${role.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Clean Responsive Cards */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {filteredRoles.map((role) => {
                const permCount = Array.isArray(role.permissions) ? role.permissions.length : 0;
                const permPercent = Math.min(100, Math.round((permCount / maxPermissionsInRole) * 100));
                const roleModules = getRoleModulesPreview(role);

                return (
                  <div
                    key={role.id}
                    className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {role.isSystem && (
                            <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          )}
                          <h3 className="font-bold text-foreground text-base">{role.nameAr}</h3>
                          <Badge variant="outline" className="font-mono text-[11px]">
                            {role.name}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {role.description || "بدون وصف إضافي"}
                        </p>
                      </div>
                      {role.isSystem ? (
                        <Badge variant="secondary" className="shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px]">
                          نظامي محمي
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="shrink-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px]">
                          مخصص
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-2.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">المستخدمين:</span>
                        <span className="font-bold tabular-nums text-foreground">
                          {(role.userCount || 0).toLocaleString("en-US")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-primary" />
                        <span className="text-muted-foreground">الصلاحيات:</span>
                        <span className="font-bold tabular-nums text-foreground">
                          {permCount.toLocaleString("en-US")}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${role.isSystem ? "bg-amber-500" : "bg-primary"}`}
                          style={{ width: `${Math.max(permCount > 0 ? 8 : 0, permPercent)}%` }}
                        />
                      </div>
                      {roleModules.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          {roleModules.slice(0, 4).map((mod) => (
                            <span
                              key={mod}
                              className="inline-flex items-center rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {moduleNames[mod] || mod}
                            </span>
                          ))}
                          {roleModules.length > 4 && (
                            <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary tabular-nums">
                              +{(roleModules.length - 4).toLocaleString("en-US")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
                      <Button
                        size="sm"
                        variant="outline"
                        className="no-min-touch-size h-8 text-xs font-semibold flex-1"
                        onClick={() => handleEditPermissions(role)}
                        disabled={role.isSystem}
                      >
                        {role.isSystem ? "دور نظامي محمي" : "تعديل الصلاحيات"}
                      </Button>
                      {!role.isSystem && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="no-min-touch-size h-8 w-8 shrink-0"
                          onClick={() => setDeletingRole(role)}
                          aria-label={`حذف ${role.nameAr}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Create Role Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-md rounded-2xl" dir="rtl" data-testid="dialog-create-role">
            <DialogHeader>
              <DialogTitle data-testid="dialog-create-title">إنشاء دور جديد</DialogTitle>
              <DialogDescription data-testid="dialog-create-description">
                أدخل معلومات الدور الجديد لتخصيص صلاحياته لاحقاً
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="roleName" data-testid="label-role-name">الاسم البرمجي (بالإنجليزية)</Label>
                <Input
                  id="roleName"
                  placeholder="مثال: content_reviewer"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  data-testid="input-role-name"
                />
                <p className="text-xs text-muted-foreground">سيتم تحويل الاسم إلى صيغة مناسبة تلقائياً</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="roleNameAr" data-testid="label-role-name-ar">الاسم العرضي (بالعربية)</Label>
                <Input
                  id="roleNameAr"
                  placeholder="مثال: مراجع المحتوى"
                  value={newRoleNameAr}
                  onChange={(e) => setNewRoleNameAr(e.target.value)}
                  data-testid="input-role-name-ar"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="roleDescription" data-testid="label-role-description">الوصف الوظيفي (اختياري)</Label>
                <Textarea
                  id="roleDescription"
                  placeholder="وصف مختصر لمسؤوليات وصلاحيات هذا الدور..."
                  value={newRoleDescription}
                  onChange={(e) => setNewRoleDescription(e.target.value)}
                  rows={3}
                  data-testid="input-role-description"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                data-testid="button-cancel-create"
              >
                إلغاء
              </Button>
              <Button
                onClick={handleCreateRole}
                disabled={createRoleMutation.isPending}
                data-testid="button-confirm-create"
              >
                {createRoleMutation.isPending ? "جارِ الإنشاء..." : "إنشاء الدور"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deletingRole} onOpenChange={(open) => !open && setDeletingRole(null)}>
          <AlertDialogContent className="rounded-2xl" dir="rtl" data-testid="dialog-delete-role">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="dialog-delete-title">تأكيد الحذف</AlertDialogTitle>
              <AlertDialogDescription data-testid="dialog-delete-description">
                هل أنت متأكد من حذف دور "{deletingRole?.nameAr}"؟
                <br />
                لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deletingRole && deleteRoleMutation.mutate(deletingRole.id)}
                data-testid="button-confirm-delete"
              >
                {deleteRoleMutation.isPending ? "جارِ الحذف..." : "حذف"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit Permissions Matrix Dialog */}
        <Dialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto rounded-2xl" dir="rtl" data-testid="dialog-edit-permissions">
            <DialogHeader className="space-y-1.5 border-b border-border/60 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <DialogTitle className="flex items-center gap-2 text-lg font-bold" data-testid="dialog-title">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span>تعديل صلاحيات: {editingRole?.nameAr}</span>
                </DialogTitle>
                <Badge variant="outline" className="tabular-nums font-semibold">
                  محدد: {selectedPermissions.size.toLocaleString("en-US")} / {allPermissions.length.toLocaleString("en-US")}
                </Badge>
              </div>
              <DialogDescription data-testid="dialog-description">
                اختر الصلاحيات المطلوبة لهذا الدور أو ابحث بسرعة حسب القسم أو الكود البرمجي
              </DialogDescription>
            </DialogHeader>

            {permissionsLoading ? (
              <div className="flex justify-center p-8" data-testid="loading-permissions">
                <p className="text-muted-foreground">جارِ تحميل الصلاحيات...</p>
              </div>
            ) : (
              <div className="space-y-5 pt-2">
                {/* Matrix Search & Module Quick Filter */}
                <div className="space-y-3 rounded-xl border border-border/70 bg-muted/25 p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={permissionSearchQuery}
                      onChange={(e) => setPermissionSearchQuery(e.target.value)}
                      placeholder="ابحث داخل الصلاحيات بالاسم العربي أو الكود (مثال: articles.publish)..."
                      className="h-9 pr-9 pl-8 text-xs sm:text-sm bg-background"
                      data-testid="input-search-permissions"
                    />
                    {permissionSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setPermissionSearchQuery("")}
                        className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedModuleFilter("all")}
                      className={`no-min-touch-size rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        selectedModuleFilter === "all"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background border border-border/70 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      كل الأقسام ({sortedModules.length.toLocaleString("en-US")})
                    </button>
                    {sortedModules.map((mod) => (
                      <button
                        key={mod}
                        type="button"
                        onClick={() => setSelectedModuleFilter(mod)}
                        className={`no-min-touch-size rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          selectedModuleFilter === mod
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "bg-background border border-border/70 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {moduleNames[mod] || mod}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredSortedModules.map((module) => {
                  const rawPerms = permissionsByModule[module] || [];
                  const q = permissionSearchQuery.trim().toLowerCase();
                  const perms = q
                    ? rawPerms.filter(
                        (p) =>
                          (p.labelAr || "").toLowerCase().includes(q) ||
                          (p.code || "").toLowerCase().includes(q) ||
                          (moduleNames[module] || module).toLowerCase().includes(q)
                      )
                    : rawPerms;

                  if (perms.length === 0) return null;
                  const selectedInModuleCount = rawPerms.filter((p) => selectedPermissions.has(p.id)).length;
                  const allModuleSelected = rawPerms.length > 0 && selectedInModuleCount === rawPerms.length;

                  return (
                    <div key={module} className="space-y-3 border rounded-xl p-4 bg-muted/20" data-testid={`module-${module}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                        <h3 className="font-bold text-base flex items-center gap-2" data-testid={`module-title-${module}`}>
                          <ModuleIcon module={module} />
                          <span>{moduleNames[module] || module}</span>
                        </h3>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleModulePermissions(rawPerms)}
                            className="no-min-touch-size inline-flex items-center gap-1 rounded-lg border border-border/70 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {allModuleSelected ? (
                              <>
                                <CheckSquare className="h-3.5 w-3.5 text-primary" />
                                <span>إلغاء تحديد القسم</span>
                              </>
                            ) : (
                              <>
                                <Square className="h-3.5 w-3.5" />
                                <span>تحديد كامل القسم</span>
                              </>
                            )}
                          </button>
                          <Badge variant="secondary" className="tabular-nums font-semibold" data-testid={`badge-count-${module}`}>
                            {selectedInModuleCount.toLocaleString("en-US")} / {rawPerms.length.toLocaleString("en-US")}
                          </Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pr-1">
                        {perms.map((perm) => (
                          <div 
                            key={perm.id} 
                            className={`flex items-start gap-3 p-2.5 rounded-xl border transition-colors ${
                              selectedPermissions.has(perm.id)
                                ? "border-primary/30 bg-primary/10"
                                : "border-transparent bg-background/60 hover:bg-muted/50"
                            }`}
                            data-testid={`permission-${perm.id}`}
                          >
                            <Checkbox
                              id={perm.id}
                              checked={selectedPermissions.has(perm.id)}
                              onCheckedChange={() => togglePermission(perm.id)}
                              data-testid={`checkbox-${perm.id}`}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <Label 
                                htmlFor={perm.id} 
                                className="cursor-pointer font-semibold text-sm block"
                                data-testid={`label-${perm.id}`}
                              >
                                {perm.labelAr}
                              </Label>
                              <p className="text-xs font-mono text-muted-foreground truncate mt-0.5" data-testid={`code-${perm.id}`}>
                                {perm.code}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div className="sticky bottom-0 flex justify-end gap-3 pt-4 pb-1 bg-background/95 backdrop-blur-xs border-t">
                  <Button
                    variant="outline"
                    onClick={() => setEditingRole(null)}
                    data-testid="button-cancel"
                  >
                    إلغاء
                  </Button>
                  <Button
                    onClick={handleSavePermissions}
                    disabled={updatePermissionsMutation.isPending}
                    data-testid="button-save"
                  >
                    {updatePermissionsMutation.isPending ? "جارِ الحفظ..." : "حفظ التغييرات"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </DashboardPageShell>
    </DashboardLayout>
  );
}

