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
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface StaffUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  status: string;
  emailVerified: boolean;
  role: string;
  roleName: string | null;
  roleNameAr: string | null;
  roleId: string | null;
  createdAt: string;
  lastActivityAt: string | null;
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

export default function StaffMembers() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

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
        const res = await fetch(`/api/admin/users?role=${encodeURIComponent(queriedRole)}&limit=1000`);
        if (!res.ok) return { role: queriedRole, users: [] as StaffUser[] };
        const data = await res.json();
        let usersArray: StaffUser[] = [];
        if (Array.isArray(data)) usersArray = data;
        else if (data.users && Array.isArray(data.users)) usersArray = data.users;
        return { role: queriedRole, users: usersArray };
      });
      
      const allRoleResults = await Promise.all(rolePromises);
      
      // Build a map of userId -> roles[] and deduplicated users list
      const userRolesMap = new Map<string, string[]>();
      const usersMap = new Map<string, StaffUser>();
      
      allRoleResults.forEach(({ role, users }) => {
        users.forEach(u => {
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
        userRolesMap 
      };
    },
    enabled: !!user,
  });

  const allUsers = usersWithRolesData.users;
  const userRolesMap = usersWithRolesData.userRolesMap;

  const { data: rolesRaw } = useQuery<Role[]>({
    queryKey: ["/api/admin/roles"],
    enabled: !!user,
  });
  const roles = Array.isArray(rolesRaw) ? rolesRaw : [];

  const staffRoles = useMemo(() => {
    return roles.filter(r => STAFF_ROLES.includes(r.name));
  }, [roles]);

  const filteredUsers = useMemo(() => {
    return allUsers.filter((u) => {
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      // Use userRolesMap to check if user has the filtered role
      if (roleFilter !== "all") {
        const userRoles = userRolesMap.get(u.id) || [];
        if (!userRoles.includes(roleFilter)) return false;
      }
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const fullName = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
        if (!fullName.includes(search) && !u.email.toLowerCase().includes(search)) {
          return false;
        }
      }
      return true;
    });
  }, [allUsers, statusFilter, roleFilter, searchTerm, userRolesMap]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STAFF_ROLES.forEach((role: string) => counts[role] = 0);
    // Count users for each role using the roles map
    userRolesMap.forEach((userRolesList: string[]) => {
      userRolesList.forEach((role: string) => {
        if (counts[role] !== undefined) {
          counts[role]++;
        }
      });
    });
    return counts;
  }, [userRolesMap]);

  const suspendMutation = useMutation({
    mutationFn: async ({ userId, reason, duration }: { userId: string; reason: string; duration: string }) => {
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
    mutationFn: async ({ userId, reason, isPermanent, duration }: { userId: string; reason: string; isPermanent: boolean; duration?: string }) => {
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
        return (
          <div className="flex items-center gap-3">
            <Avatar data-testid={`avatar-staff-${staffUser.id}`}>
              <AvatarImage src={staffUser.profileImageUrl || undefined} />
              <AvatarFallback>
                {(staffUser.firstName?.[0] || "") + (staffUser.lastName?.[0] || "")}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium" data-testid={`text-staff-name-${staffUser.id}`}>{fullName}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor("email", {
      header: "البريد الإلكتروني",
      cell: (info) => (
        <span data-testid={`text-staff-email-${info.row.original.id}`}>{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor("roleNameAr", {
      header: "الدور",
      cell: (info) => {
        const staffUser = info.row.original;
        const roleLabel = staffUser.roleNameAr || STAFF_ROLE_LABELS[staffUser.role] || staffUser.role;
        return (
          <Badge variant="outline" data-testid={`badge-staff-role-${staffUser.id}`}>
            {roleLabel}
          </Badge>
        );
      },
    }),
    columnHelper.accessor("status", {
      header: "الحالة",
      cell: (info) => {
        const status = info.getValue();
        const variants: Record<string, any> = {
          active: { variant: "default" as const, label: "نشط" },
          suspended: { variant: "secondary" as const, label: "معلق" },
          banned: { variant: "destructive" as const, label: "محظور" },
        };
        const config = variants[status] || variants.active;
        return (
          <Badge variant={config.variant} data-testid={`badge-staff-status-${info.row.original.id}`}>
            {config.label}
          </Badge>
        );
      },
    }),
    columnHelper.accessor("lastActivityAt", {
      header: "آخر نشاط",
      cell: (info) => {
        const lastActivity = info.getValue();
        return (
          <span data-testid={`text-staff-activity-${info.row.original.id}`}>
            {lastActivity ? format(new Date(lastActivity), "dd MMM yyyy", { locale: ar }) : "لا يوجد"}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "الإجراءات",
      cell: (info) => {
        const rowUser = info.row.original;
        const isCurrentUser = rowUser.id === user?.id;
        return (
          <div className="flex items-center gap-1">
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
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6" dir="rtl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold" data-testid="heading-staff-title">منسوبي سبق</h1>
              <p className="text-muted-foreground mt-1">إدارة فريق العمل والموظفين</p>
            </div>
          </div>
          <Button
            onClick={() => setSendCredentialsDialogOpen(true)}
            className="gap-2"
            data-testid="button-send-credentials"
          >
            <Mail className="h-4 w-4" />
            إرسال بيانات الدخول للجميع
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="hover-elevate cursor-pointer" onClick={() => setRoleFilter("all")} data-testid="card-staff-total">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي المنسوبين</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-staff-total">
                {usersLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : allUsers.length}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer" onClick={() => setRoleFilter("editor")} data-testid="card-staff-editors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">المحررون</CardTitle>
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-staff-editors">
                {usersLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : roleCounts.editor || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer" onClick={() => setRoleFilter("reporter")} data-testid="card-staff-reporters">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">المراسلون</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-staff-reporters">
                {usersLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : roleCounts.reporter || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer" onClick={() => setRoleFilter("admin")} data-testid="card-staff-admins">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">المدراء</CardTitle>
              <UserCog className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-staff-admins">
                {usersLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (roleCounts.admin || 0) + (roleCounts.system_admin || 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالاسم أو البريد..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10"
                    data-testid="input-staff-search"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[150px]" data-testid="select-staff-role">
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
                  <SelectTrigger className="w-[150px]" data-testid="select-staff-status">
                    <SelectValue placeholder="الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الحالات</SelectItem>
                    <SelectItem value="active">نشط</SelectItem>
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
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              {usersLoading ? (
                <div className="flex justify-center items-center py-12" data-testid="loading-staff-spinner">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id} className="text-right">
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.length > 0 ? (
                      table.getRowModel().rows.map((row) => (
                        <TableRow key={row.id} data-testid={`row-staff-${row.original.id}`}>
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id} className="text-right">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={columns.length} className="text-center py-12">
                          <p className="text-muted-foreground" data-testid="text-staff-empty">لا توجد نتائج</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">عدد الصفوف:</span>
                <Select
                  value={String(table.getState().pagination.pageSize)}
                  onValueChange={(value) => table.setPageSize(Number(value))}
                >
                  <SelectTrigger className="w-[100px]" data-testid="select-staff-page-size">
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

              <div className="flex items-center gap-2">
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
                <span className="text-sm" data-testid="text-staff-page-info">
                  صفحة {table.getState().pagination.pageIndex + 1} من {table.getPageCount() || 1}
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
      </div>

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
                    duration: suspendDuration,
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
                    duration: banIsPermanent ? undefined : banDuration,
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
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>تنبيه:</strong> سيتم إنشاء كلمة مرور مؤقتة جديدة لكل موظف وسيُطلب منه تغييرها عند أول تسجيل دخول.
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>سيتم إرسال البريد إلى <strong>{allUsers.length}</strong> موظف</p>
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
