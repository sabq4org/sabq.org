import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListChecks, Search, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { motion } from "framer-motion";
import ActivityLogsInsights from "@/components/ActivityLogsInsights";
import ActivityLogDrawer from "@/components/ActivityLogDrawer";
import { DashboardLayout } from "@/components/DashboardLayout";
import { getActionPresentation, getEntityTypeLabel } from "@/lib/activityUtils";

interface ActivityLog {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: Record<string, any> | null;
  newValue: Record<string, any> | null;
  metadata: { ip?: string; userAgent?: string; reason?: string } | null;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  } | null;
}

const columnHelper = createColumnHelper<ActivityLog>();

export default function ActivityLogsPage() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const limit = 50;

  // Fetch activity logs
  const { data: logsData, isLoading: logsLoading, error: logsError } = useQuery({
    queryKey: ['/api/admin/activity-logs', page, searchQuery, actionFilter, entityTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (searchQuery) params.append('searchQuery', searchQuery);
      if (actionFilter && actionFilter !== 'all') params.append('action', actionFilter);
      if (entityTypeFilter && entityTypeFilter !== 'all') params.append('entityType', entityTypeFilter);

      const response = await fetch(`/api/admin/activity-logs?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('ليس لديك صلاحية لعرض سجلات النشاط');
        }
        throw new Error('فشل تحميل سجلات النشاط');
      }
      return response.json();
    },
    retry: false,
  });

  // Fetch analytics
  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = useQuery({
    queryKey: ['/api/admin/activity-logs/analytics'],
    queryFn: async () => {
      const response = await fetch('/api/admin/activity-logs/analytics', {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('ليس لديك صلاحية لعرض التحليلات');
        }
        throw new Error('فشل تحميل التحليلات');
      }
      return response.json();
    },
    retry: false,
  });

  const columns = [
    columnHelper.accessor('user', {
      id: 'user',
      header: 'المستخدم',
      cell: (info) => {
        const user = info.getValue();
        if (!user) {
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback>?</AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">مستخدم محذوف</span>
            </div>
          );
        }
        const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
        const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}` || user?.email?.[0];
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={user.profileImageUrl || undefined} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">{userName}</p>
              <p className="text-xs text-muted-foreground" dir="ltr">{user.email}</p>
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor('action', {
      header: 'العملية',
      cell: (info) => {
        const actionPresentation = getActionPresentation(info.getValue());
        const ActionIcon = actionPresentation.icon;
        return (
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-full ${actionPresentation.bgColor} ${actionPresentation.textColor}`}>
              <ActionIcon className="h-3.5 w-3.5" />
            </div>
            <Badge variant={actionPresentation.badgeVariant} data-testid={`badge-action-${info.row.id}`}>
              {actionPresentation.label}
            </Badge>
          </div>
        );
      },
    }),
    columnHelper.accessor('entityType', {
      header: 'نوع الكيان',
      cell: (info) => (
        <span className="text-sm">{getEntityTypeLabel(info.getValue())}</span>
      ),
    }),
    columnHelper.accessor('entityId', {
      header: 'المعرّف',
      cell: (info) => (
        <code className="text-xs bg-muted px-2 py-1 rounded" dir="ltr">{info.getValue().substring(0, 8)}...</code>
      ),
    }),
    columnHelper.accessor('createdAt', {
      header: 'الوقت',
      cell: (info) => (
        <span className="text-sm text-muted-foreground">
          {format(new Date(info.getValue()), 'PPp', { locale: ar })}
        </span>
      ),
    }),
  ];

  const table = useReactTable({
    data: logsData?.logs || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: logsData?.totalPages || 0,
  });

  const handleRowClick = (log: ActivityLog) => {
    setSelectedLog(log);
    setDrawerOpen(true);
  };

  // If there's an error, show error page
  if (logsError) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-6 space-y-6" data-testid="activity-logs-page">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                <ListChecks className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">سجلات النشاط</h1>
                <p className="text-muted-foreground">تتبع جميع العمليات والتغييرات في النظام</p>
              </div>
            </div>
          </motion.div>

          {/* Error Alert */}
          <Card className="border-destructive" data-testid="error-alert">
            <CardHeader>
              <CardTitle className="text-destructive">حدث خطأ</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {logsError?.message || 'فشل تحميل البيانات. يرجى المحاولة مرة أخرى.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6" dir="rtl" data-testid="activity-logs-page">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center justify-end gap-3 mb-2">
            <div className="text-right">
              <h1 className="text-3xl font-bold">سجلات النشاط</h1>
              <p className="text-muted-foreground">تتبع جميع العمليات والتغييرات في النظام</p>
            </div>
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
              <ListChecks className="h-6 w-6 text-white" />
            </div>
          </div>
        </motion.div>

        {/* Analytics Dashboard */}
        {!analyticsError && (
          <ActivityLogsInsights analytics={analytics} isLoading={analyticsLoading} />
        )}

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card data-testid="filters-card">
            <CardHeader className="text-right">
              <CardTitle className="flex items-center justify-end gap-2">
                <span>الفلاتر</span>
                <Filter className="h-5 w-5" />
              </CardTitle>
              <CardDescription>تصفية السجلات حسب المعايير</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="relative">
                  <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    className="pr-10"
                    data-testid="input-search"
                  />
                </div>

                <Select
                  value={actionFilter}
                  onValueChange={(value) => {
                    setActionFilter(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger data-testid="select-action-filter">
                    <SelectValue placeholder="نوع العملية" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع العمليات</SelectItem>
                    <SelectItem value="create">إنشاء</SelectItem>
                    <SelectItem value="update">تحديث</SelectItem>
                    <SelectItem value="delete">حذف</SelectItem>
                    <SelectItem value="publish">نشر</SelectItem>
                    <SelectItem value="archive">أرشفة</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={entityTypeFilter}
                  onValueChange={(value) => {
                    setEntityTypeFilter(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger data-testid="select-entity-filter">
                    <SelectValue placeholder="نوع الكيان" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الأنواع</SelectItem>
                    <SelectItem value="article">مقال</SelectItem>
                    <SelectItem value="user">مستخدم</SelectItem>
                    <SelectItem value="category">تصنيف</SelectItem>
                    <SelectItem value="comment">تعليق</SelectItem>
                    <SelectItem value="role">دور</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Logs Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card data-testid="logs-table-card">
            <CardHeader className="text-right">
              <CardTitle>السجلات</CardTitle>
              <CardDescription>
                {logsData ? `عرض ${logsData.logs.length} من ${logsData.total} سجل` : 'جاري التحميل...'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="space-y-3" data-testid="table-loading">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : logsData?.logs.length === 0 ? (
                <div className="text-center py-12" data-testid="empty-state">
                  <ListChecks className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">لا توجد سجلات</p>
                  <p className="text-sm text-muted-foreground mt-2">لم يتم العثور على أي سجلات نشاط</p>
                </div>
              ) : (
                <>
                  <div className="rounded-md border" dir="rtl">
                    <Table data-testid="logs-table">
                      <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                          <TableRow key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                              <TableHead key={header.id} className="text-right">
                                {flexRender(header.column.columnDef.header, header.getContext())}
                              </TableHead>
                            ))}
                          </TableRow>
                        ))}
                      </TableHeader>
                      <TableBody>
                        {table.getRowModel().rows.map((row) => (
                          <TableRow
                            key={row.id}
                            className="cursor-pointer hover-elevate"
                            onClick={() => handleRowClick(row.original)}
                            data-testid={`log-row-${row.id}`}
                          >
                            {row.getVisibleCells().map((cell) => (
                              <TableCell key={cell.id}>
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between mt-4" dir="rtl">
                    <p className="text-sm text-muted-foreground">
                      صفحة {page} من {logsData.totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(logsData.totalPages, p + 1))}
                        disabled={page >= logsData.totalPages}
                        data-testid="button-next-page"
                      >
                        التالي
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronRight className="h-4 w-4" />
                        السابق
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Activity Log Drawer */}
        <ActivityLogDrawer
          log={selectedLog}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
        />
      </div>
    </DashboardLayout>
  );
}
