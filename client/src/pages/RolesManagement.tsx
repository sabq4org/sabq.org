import { useState } from "react";
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
  Briefcase, Pin 
} from "lucide-react";
import type { RoleWithPermissions, Permission } from "@shared/schema";

function ModuleIcon({ module }: { module: string }) {
  const iconProps = { className: "w-5 h-5 text-primary" };
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
    const permIds = new Set(role.permissions.map(p => p.id));
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

  // Handle save permissions
  const handleSavePermissions = () => {
    if (!editingRole) return;
    updatePermissionsMutation.mutate({
      roleId: editingRole.id,
      permissionIds: Array.from(selectedPermissions),
    });
  };

  // Group permissions by module
  const permissionsByModule = allPermissions.reduce((acc, perm) => {
    if (!acc[perm.module]) {
      acc[perm.module] = [];
    }
    acc[perm.module].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

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

  // ترتيب الصلاحيات حسب الوحدات
  const sortedModules = Object.keys(permissionsByModule).sort((a, b) => {
    const indexA = moduleOrder.indexOf(a);
    const indexB = moduleOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1600px]" contentClassName="px-4 pb-10 sm:px-6">
        <DashboardPageHeader
          icon={Shield}
          title="إدارة الأدوار والصلاحيات"
          description={<span data-testid="text-description">تحكم في صلاحيات كل دور في النظام</span>}
          titleTestId="heading-title"
          actions={<Button
            onClick={() => setIsCreateDialogOpen(true)}
            data-testid="button-create-role"
          >
            <Plus className="w-4 h-4 ml-2" />
            إنشاء دور جديد
          </Button>}
        />

        {rolesLoading ? (
          <div className="flex justify-center p-8" data-testid="loading-roles">
            <p className="text-muted-foreground">جارِ تحميل الأدوار...</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right" data-testid="header-role">الدور</TableHead>
                  <TableHead className="text-right" data-testid="header-description">الوصف</TableHead>
                  <TableHead className="text-right" data-testid="header-users">المستخدمين</TableHead>
                  <TableHead className="text-right" data-testid="header-permissions">الصلاحيات</TableHead>
                  <TableHead className="text-right" data-testid="header-actions">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id} data-testid={`row-role-${role.id}`}>
                    <TableCell data-testid={`cell-name-${role.id}`}>
                      <div className="flex items-center gap-2">
                        {role.isSystem && <Lock className="w-4 h-4 text-yellow-600" data-testid={`icon-lock-${role.id}`} />}
                        <span className="font-medium">{role.nameAr}</span>
                        <Badge variant="outline" data-testid={`badge-name-${role.id}`}>{role.name}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`cell-description-${role.id}`}>
                      {role.description}
                    </TableCell>
                    <TableCell data-testid={`cell-usercount-${role.id}`}>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="tabular-nums">{(role.userCount || 0).toLocaleString("en-US")}</span>
                      </div>
                    </TableCell>
                    <TableCell data-testid={`cell-permcount-${role.id}`}>
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-muted-foreground" />
                        <span className="tabular-nums">{(role.permissions?.length || 0).toLocaleString("en-US")}</span>
                      </div>
                    </TableCell>
                    <TableCell data-testid={`cell-actions-${role.id}`}>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
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
                            onClick={() => setDeletingRole(role)}
                            data-testid={`button-delete-${role.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Create Role Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-md" dir="rtl" data-testid="dialog-create-role">
            <DialogHeader>
              <DialogTitle data-testid="dialog-create-title">إنشاء دور جديد</DialogTitle>
              <DialogDescription data-testid="dialog-create-description">
                أدخل معلومات الدور الجديد
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="roleName" data-testid="label-role-name">الاسم (بالإنجليزية)</Label>
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
                <Label htmlFor="roleNameAr" data-testid="label-role-name-ar">الاسم (بالعربية)</Label>
                <Input
                  id="roleNameAr"
                  placeholder="مثال: مراجع المحتوى"
                  value={newRoleNameAr}
                  onChange={(e) => setNewRoleNameAr(e.target.value)}
                  data-testid="input-role-name-ar"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="roleDescription" data-testid="label-role-description">الوصف (اختياري)</Label>
                <Textarea
                  id="roleDescription"
                  placeholder="وصف مختصر لهذا الدور..."
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
          <AlertDialogContent dir="rtl" data-testid="dialog-delete-role">
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

        {/* Edit Permissions Dialog */}
        <Dialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" dir="rtl" data-testid="dialog-edit-permissions">
            <DialogHeader>
              <DialogTitle data-testid="dialog-title">
                تعديل صلاحيات: {editingRole?.nameAr}
              </DialogTitle>
              <DialogDescription data-testid="dialog-description">
                اختر الصلاحيات المطلوبة لهذا الدور
              </DialogDescription>
            </DialogHeader>

            {permissionsLoading ? (
              <div className="flex justify-center p-8" data-testid="loading-permissions">
                <p className="text-muted-foreground">جارِ تحميل الصلاحيات...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {sortedModules.map((module) => {
                  const perms = permissionsByModule[module];
                  if (!perms || perms.length === 0) return null;
                  return (
                    <div key={module} className="space-y-3 border rounded-lg p-4 bg-muted/30" data-testid={`module-${module}`}>
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-lg flex items-center gap-2" data-testid={`module-title-${module}`}>
                          <ModuleIcon module={module} />
                          {moduleNames[module] || module}
                        </h3>
                        <Badge variant="secondary" className="tabular-nums" data-testid={`badge-count-${module}`}>
                          {perms.filter(p => selectedPermissions.has(p.id)).length.toLocaleString("en-US")} / {perms.length.toLocaleString("en-US")}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-2">
                        {perms.map((perm) => (
                          <div 
                            key={perm.id} 
                            className={`flex items-start gap-3 p-2 rounded-md transition-colors ${
                              selectedPermissions.has(perm.id) ? 'bg-primary/10' : 'hover:bg-muted/50'
                            }`}
                            data-testid={`permission-${perm.id}`}
                          >
                            <Checkbox
                              id={perm.id}
                              checked={selectedPermissions.has(perm.id)}
                              onCheckedChange={() => togglePermission(perm.id)}
                              data-testid={`checkbox-${perm.id}`}
                            />
                            <div className="flex-1">
                              <Label 
                                htmlFor={perm.id} 
                                className="cursor-pointer font-medium"
                                data-testid={`label-${perm.id}`}
                              >
                                {perm.labelAr}
                              </Label>
                              <p className="text-xs text-muted-foreground" data-testid={`code-${perm.id}`}>
                                {perm.code}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div className="flex justify-end gap-3 pt-4 border-t">
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
