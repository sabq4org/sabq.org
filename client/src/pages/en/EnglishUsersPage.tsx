import { useState } from "react";
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
import { EnglishDashboardLayout } from "@/components/en/EnglishDashboardLayout";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Users,
  UserCheck,
  UserX,
  Ban,
  Search,
  MoreVertical,
  Eye,
  Shield,
  Award,
  Trash2,
  TrendingUp,
  TrendingDown,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";

// Types
interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  status: string;
  emailVerified: boolean;
  verificationBadge: string;
  role: string;
  roleName: string | null;
  roleNameAr: string | null;
  roleId: string | null;
  createdAt: string;
  lastActivityAt: string | null;
}

interface KPIs {
  total: number;
  emailVerified: number;
  emailVerifiedTrend: number;
  suspended: number;
  suspendedTrend: number;
  banned: number;
  bannedTrend: number;
}

interface Role {
  id: string;
  name: string;
  nameAr: string;
}

export default function EnglishUsersPage() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [verificationFilter, setVerificationFilter] = useState<string>("all");

  // Dialog state
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [badgeDialogOpen, setBadgeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Form state
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendDuration, setSuspendDuration] = useState("7");
  const [banReason, setBanReason] = useState("");
  const [banIsPermanent, setBanIsPermanent] = useState(false);
  const [banDuration, setBanDuration] = useState("30");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedBadge, setSelectedBadge] = useState("none");

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Fetch KPIs
  const { data: kpis, isLoading: kpisLoading } = useQuery<KPIs>({
    queryKey: ["/api/dashboard/users/kpis"],
    enabled: !!user,
  });

  // Build query params
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    if (roleFilter && roleFilter !== "all") params.set("roleId", roleFilter);
    return params.toString();
  };

  // Fetch users
  const { data: usersRaw, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users", searchTerm, statusFilter, roleFilter],
    queryFn: async () => {
      const query = buildQueryParams();
      const url = `/api/admin/users${query ? `?${query}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      // API returns { users: [...], items: [...] } for backward compatibility
      // Always return an array
      if (Array.isArray(data)) return data;
      if (data.users && Array.isArray(data.users)) return data.users;
      return [];
    },
    enabled: !!user,
  });
  const users = Array.isArray(usersRaw) ? usersRaw : [];

  // Fetch roles
  const { data: rolesRaw } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
    enabled: !!user,
  });
  const roles = Array.isArray(rolesRaw) ? rolesRaw : [];

  // Filter users by verification
  const filteredUsers = users.filter((u) => {
    if (verificationFilter === "all") return true;
    if (verificationFilter === "verified") return u.emailVerified;
    if (verificationFilter === "unverified") return !u.emailVerified;
    return true;
  });

  // Suspend mutation
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
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/users/kpis"] });
      toast({ title: "Suspended", description: "User suspended successfully" });
      setSuspendDialogOpen(false);
      setSuspendReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to suspend user", variant: "destructive" });
    },
  });

  // Ban mutation
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
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/users/kpis"] });
      toast({ title: "Banned", description: "User banned successfully" });
      setBanDialogOpen(false);
      setBanReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to ban user", variant: "destructive" });
    },
  });

  // Change role mutation
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
      toast({ title: "Updated", description: "User role changed successfully" });
      setRoleDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to change role", variant: "destructive" });
    },
  });

  // Set badge mutation
  const setBadgeMutation = useMutation({
    mutationFn: async ({ userId, badge }: { userId: string; badge: string }) => {
      return await apiRequest(`/api/admin/users/${userId}/verification-badge`, {
        method: "PATCH",
        body: JSON.stringify({ badge }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Updated", description: "Verification badge updated successfully" });
      setBadgeDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update badge", variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/users/kpis"] });
      toast({ title: "Deleted", description: "User deleted successfully" });
      setDeleteDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete user", variant: "destructive" });
    },
  });

  // Table columns
  const columnHelper = createColumnHelper<User>();
  const columns = [
    columnHelper.accessor("firstName", {
      header: "User",
      cell: (info) => {
        const user = info.row.original;
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "No name";
        return (
          <div className="flex items-center gap-3">
            <Avatar data-testid={`avatar-${user.id}`}>
              <AvatarImage src={user.profileImageUrl || undefined} />
              <AvatarFallback>
                {(user.firstName?.[0] || "") + (user.lastName?.[0] || "")}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium" data-testid={`text-name-${user.id}`}>{fullName}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor("email", {
      header: "Email",
      cell: (info) => {
        const user = info.row.original;
        return (
          <div className="flex items-center gap-2">
            <span data-testid={`text-email-${user.id}`}>{info.getValue()}</span>
            {user.emailVerified && (
              <Badge variant="outline" className="text-xs" data-testid={`badge-verified-${user.id}`}>
                <UserCheck className="w-3 h-3 mr-1" />
                Verified
              </Badge>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const status = info.getValue();
        const variants: Record<string, any> = {
          active: { variant: "default" as const, color: "text-green-600", label: "Active" },
          suspended: { variant: "secondary" as const, color: "text-orange-600", label: "Suspended" },
          banned: { variant: "destructive" as const, color: "text-red-600", label: "Banned" },
        };
        const config = variants[status] || variants.active;
        return (
          <Badge variant={config.variant} data-testid={`badge-status-${info.row.original.id}`}>
            {config.label}
          </Badge>
        );
      },
    }),
    columnHelper.accessor("roleName", {
      header: "Role",
      cell: (info) => {
        const user = info.row.original;
        return user.roleName ? (
          <Badge variant="outline" data-testid={`badge-role-${user.id}`}>{info.getValue()}</Badge>
        ) : (
          <span className="text-muted-foreground">No role</span>
        );
      },
    }),
    columnHelper.accessor("verificationBadge", {
      header: "Verification Badge",
      cell: (info) => {
        const badge = info.getValue();
        const labels: Record<string, string> = {
          none: "None",
          silver: "Silver",
          gold: "Gold",
        };
        const colors: Record<string, string> = {
          none: "text-muted-foreground",
          silver: "text-gray-500",
          gold: "text-yellow-600",
        };
        return (
          <div className="flex items-center gap-1" data-testid={`badge-verification-${info.row.original.id}`}>
            {badge !== "none" && <Award className={`w-4 h-4 ${colors[badge]}`} />}
            <span className={colors[badge]}>{labels[badge] || badge}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor("createdAt", {
      header: "Registration Date",
      cell: (info) => (
        <span data-testid={`text-created-${info.row.original.id}`}>
          {format(new Date(info.getValue()), "dd MMM yyyy")}
        </span>
      ),
    }),
    columnHelper.accessor("lastActivityAt", {
      header: "Last Activity",
      cell: (info) => {
        const lastActivity = info.getValue();
        return (
          <span data-testid={`text-activity-${info.row.original.id}`}>
            {lastActivity ? format(new Date(lastActivity), "dd MMM yyyy") : "None"}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "Actions",
      cell: (info) => {
        const user = info.row.original;
        const isCurrentUser = user.id === user.id;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid={`button-actions-${user.id}`}>
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => window.open(`/profile/${user.id}`, "_blank")}
                data-testid={`action-view-${user.id}`}
              >
                <Eye className="w-4 h-4 mr-2" />
                View Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedUser(user);
                  setSuspendDialogOpen(true);
                }}
                disabled={isCurrentUser}
                data-testid={`action-suspend-${user.id}`}
              >
                <UserX className="w-4 h-4 mr-2" />
                Suspend
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedUser(user);
                  setBanDialogOpen(true);
                }}
                disabled={isCurrentUser}
                data-testid={`action-ban-${user.id}`}
              >
                <Ban className="w-4 h-4 mr-2" />
                Ban
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedUser(user);
                  setSelectedRoleId(user.roleId || "");
                  setRoleDialogOpen(true);
                }}
                disabled={isCurrentUser}
                data-testid={`action-role-${user.id}`}
              >
                <Shield className="w-4 h-4 mr-2" />
                Change Role
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedUser(user);
                  setSelectedBadge(user.verificationBadge);
                  setBadgeDialogOpen(true);
                }}
                data-testid={`action-badge-${user.id}`}
              >
                <Award className="w-4 h-4 mr-2" />
                Verification Badge
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedUser(user);
                  setDeleteDialogOpen(true);
                }}
                disabled={isCurrentUser}
                className="text-destructive"
                data-testid={`action-delete-${user.id}`}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }),
  ];

  // Table instance
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

  // Handle KPI click
  const handleKPIClick = (filter: string) => {
    if (filter === "total") {
      setStatusFilter("all");
      setVerificationFilter("all");
    } else if (filter === "emailVerified") {
      setVerificationFilter("verified");
    } else if (filter === "suspended") {
      setStatusFilter("suspended");
    } else if (filter === "banned") {
      setStatusFilter("banned");
    }
  };

  // Clear filters
  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setRoleFilter("all");
    setVerificationFilter("all");
  };

  return (
    <EnglishDashboardLayout>
      <div className="p-6 space-y-6" dir="ltr">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-title">Users Management</h1>
          <p className="text-muted-foreground mt-1">Manage and track all users in the system</p>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card
            className="hover-elevate cursor-pointer"
            onClick={() => handleKPIClick("total")}
            data-testid="card-kpi-total"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total">
                {kpisLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : kpis?.total || 0}
              </div>
            </CardContent>
          </Card>

          <Card
            className="hover-elevate cursor-pointer"
            onClick={() => handleKPIClick("emailVerified")}
            data-testid="card-kpi-verified"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Email Verified</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-verified">
                {kpisLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : kpis?.emailVerified || 0}
              </div>
              {!kpisLoading && kpis && (
                <div className={`flex items-center text-xs ${kpis.emailVerifiedTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {kpis.emailVerifiedTrend >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                  <span>{Math.abs(kpis.emailVerifiedTrend)}%</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card
            className="hover-elevate cursor-pointer"
            onClick={() => handleKPIClick("suspended")}
            data-testid="card-kpi-suspended"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suspended</CardTitle>
              <UserX className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-suspended">
                {kpisLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : kpis?.suspended || 0}
              </div>
              {!kpisLoading && kpis && (
                <div className={`flex items-center text-xs ${kpis.suspendedTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {kpis.suspendedTrend >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                  <span>{Math.abs(kpis.suspendedTrend)}%</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card
            className="hover-elevate cursor-pointer"
            onClick={() => handleKPIClick("banned")}
            data-testid="card-kpi-banned"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Banned</CardTitle>
              <Ban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-banned">
                {kpisLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : kpis?.banned || 0}
              </div>
              {!kpisLoading && kpis && (
                <div className={`flex items-center text-xs ${kpis.bannedTrend >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {kpis.bannedTrend >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                  <span>{Math.abs(kpis.bannedTrend)}%</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]" data-testid="select-status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="banned">Banned</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[140px]" data-testid="select-role">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={verificationFilter} onValueChange={setVerificationFilter}>
                  <SelectTrigger className="w-[140px]" data-testid="select-verification">
                    <SelectValue placeholder="Verification" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="unverified">Unverified</SelectItem>
                  </SelectContent>
                </Select>

                {(searchTerm || statusFilter !== "all" || roleFilter !== "all" || verificationFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearFilters}
                    data-testid="button-clear-filters"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {usersLoading ? (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-32 text-center">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : table.getRowModel().rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id} data-testid={`row-user-${row.original.id}`}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{" "}
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                  filteredUsers.length
                )}{" "}
                of {filteredUsers.length} users
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Suspend Dialog */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent data-testid="dialog-suspend">
          <DialogHeader>
            <DialogTitle>Suspend User</DialogTitle>
            <DialogDescription>
              Suspend user "{selectedUser?.email}". They won't be able to log in during the suspension period.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="suspend-reason">Reason</Label>
              <Textarea
                id="suspend-reason"
                placeholder="Enter suspension reason..."
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                data-testid="textarea-suspend-reason"
              />
            </div>
            <div>
              <Label htmlFor="suspend-duration">Duration (days)</Label>
              <Input
                id="suspend-duration"
                type="number"
                min="1"
                value={suspendDuration}
                onChange={(e) => setSuspendDuration(e.target.value)}
                data-testid="input-suspend-duration"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSuspendDialogOpen(false)}
              data-testid="button-suspend-cancel"
            >
              Cancel
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
              data-testid="button-suspend-confirm"
            >
              {suspendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban Dialog */}
      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent data-testid="dialog-ban">
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
            <DialogDescription>
              Ban user "{selectedUser?.email}". This is a serious action.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="ban-reason">Reason</Label>
              <Textarea
                id="ban-reason"
                placeholder="Enter ban reason..."
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                data-testid="textarea-ban-reason"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ban-permanent"
                checked={banIsPermanent}
                onCheckedChange={(checked) => setBanIsPermanent(checked as boolean)}
                data-testid="checkbox-ban-permanent"
              />
              <Label htmlFor="ban-permanent" className="cursor-pointer">
                Permanent ban
              </Label>
            </div>
            {!banIsPermanent && (
              <div>
                <Label htmlFor="ban-duration">Duration (days)</Label>
                <Input
                  id="ban-duration"
                  type="number"
                  min="1"
                  value={banDuration}
                  onChange={(e) => setBanDuration(e.target.value)}
                  data-testid="input-ban-duration"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBanDialogOpen(false)}
              data-testid="button-ban-cancel"
            >
              Cancel
            </Button>
            <Button
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
              data-testid="button-ban-confirm"
              className="bg-destructive hover:bg-destructive/90"
            >
              {banMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ban"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent data-testid="dialog-role">
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Select a new role for user "{selectedUser?.email}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="role-select">Role</Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger id="role-select" data-testid="select-new-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRoleDialogOpen(false)}
              data-testid="button-role-cancel"
            >
              Cancel
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
              data-testid="button-role-confirm"
            >
              {changeRoleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Badge Dialog */}
      <Dialog open={badgeDialogOpen} onOpenChange={setBadgeDialogOpen}>
        <DialogContent data-testid="dialog-badge">
          <DialogHeader>
            <DialogTitle>Verification Badge</DialogTitle>
            <DialogDescription>
              Choose a verification badge for user "{selectedUser?.email}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="badge-select">Badge</Label>
              <Select value={selectedBadge} onValueChange={setSelectedBadge}>
                <SelectTrigger id="badge-select" data-testid="select-badge">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                  <SelectItem value="gold">Gold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBadgeDialogOpen(false)}
              data-testid="button-badge-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedUser) {
                  setBadgeMutation.mutate({
                    userId: selectedUser.id,
                    badge: selectedBadge,
                  });
                }
              }}
              disabled={setBadgeMutation.isPending}
              data-testid="button-badge-confirm"
            >
              {setBadgeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete user "{selectedUser?.email}"? Their status will be set to "banned".
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedUser) {
                  deleteMutation.mutate(selectedUser.id);
                }
              }}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-confirm"
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </EnglishDashboardLayout>
  );
}
