import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePublisherDialog } from "@/components/admin/publishers/CreatePublisherDialog";
import { 
  Plus, 
  Search, 
  Eye, 
  Edit, 
  UserCheck, 
  UserX, 
  Building2,
  CreditCard,
  Calendar
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { Publisher, PublisherCredit } from "@shared/schema";

interface PublisherWithCredits extends Publisher {
  user?: {
    username?: string;
    email: string;
  };
  totalRemainingCredits?: number;
  activePackages?: number;
}

export default function AdminPublishers() {
  useRoleProtection('admin');
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingPublisher, setEditingPublisher] = useState<Publisher | null>(null);

  const isActiveParam = statusFilter === "all" ? undefined : (statusFilter === "active" ? 'true' : 'false');
  
  const { data: publishersData, isLoading } = useQuery<{
    publishers: PublisherWithCredits[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: ["/api/publishers", page, isActiveParam],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20'
      });
      
      if (isActiveParam !== undefined) {
        params.append('isActive', isActiveParam);
      }
      
      const response = await fetch(`/api/publishers?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch publishers');
      }
      return response.json();
    }
  });

  const filteredPublishers = publishersData?.publishers.filter((publisher) => {
    const matchesSearch = search
      ? publisher.agencyName.toLowerCase().includes(search.toLowerCase()) ||
        publisher.agencyNameEn?.toLowerCase().includes(search.toLowerCase()) ||
        publisher.email.toLowerCase().includes(search.toLowerCase())
      : true;
    
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "active"
        ? publisher.isActive && !publisher.suspendedUntil
        : publisher.suspendedUntil || !publisher.isActive;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">إدارة الناشرين</h1>
          <p className="text-muted-foreground">
            إدارة حسابات الناشرين وباقات الرصيد
          </p>
        </div>
        <Button 
          onClick={() => setShowCreateDialog(true)} 
          data-testid="button-add-publisher"
        >
          <Plus className="ml-2 h-4 w-4" />
          إضافة ناشر جديد
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            قائمة الناشرين
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث عن ناشر (الاسم، البريد الإلكتروني...)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-10"
                  dir="rtl"
                  data-testid="input-search"
                />
              </div>
            </div>
            <div className="w-full md:w-48">
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="suspended">معطل</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">اسم الوكالة</TableHead>
                  <TableHead className="text-right">الشخص المسؤول</TableHead>
                  <TableHead className="text-right">البريد الإلكتروني</TableHead>
                  <TableHead className="text-right">الهاتف</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">الرصيد المتبقي</TableHead>
                  <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                  <TableHead className="text-right">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      جاري التحميل...
                    </TableCell>
                  </TableRow>
                ) : filteredPublishers && filteredPublishers.length > 0 ? (
                  filteredPublishers.map((publisher) => (
                    <TableRow key={publisher.id} data-testid={`row-publisher-${publisher.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="text-sm">{publisher.agencyName}</span>
                          {publisher.agencyNameEn && (
                            <span className="text-xs text-muted-foreground">{publisher.agencyNameEn}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{publisher.contactPerson}</span>
                          {publisher.contactPersonEn && (
                            <span className="text-xs text-muted-foreground">{publisher.contactPersonEn}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <a href={`mailto:${publisher.email}`} className="text-sm text-primary hover:underline">
                          {publisher.email}
                        </a>
                      </TableCell>
                      <TableCell>
                        <a href={`tel:${publisher.phoneNumber}`} className="text-sm hover:underline">
                          {publisher.phoneNumber}
                        </a>
                      </TableCell>
                      <TableCell>
                        {publisher.isActive && !publisher.suspendedUntil ? (
                          <Badge variant="default" className="gap-1">
                            <UserCheck className="h-3 w-3" />
                            نشط
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <UserX className="h-3 w-3" />
                            معطل
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium" data-testid={`text-credits-${publisher.id}`}>
                            {publisher.totalRemainingCredits || 0}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(publisher.createdAt), "dd/MM/yyyy", { locale: ar })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingPublisher(publisher)}
                            data-testid={`button-edit-${publisher.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Link href={`/dashboard/admin/publishers/${publisher.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`button-view-${publisher.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      لا توجد نتائج
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {publishersData && publishersData.total > publishersData.limit && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                عرض {Math.min(page * publishersData.limit, publishersData.total)} من {publishersData.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  السابق
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * publishersData.limit >= publishersData.total}
                  data-testid="button-next-page"
                >
                  التالي
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <CreatePublisherDialog
        open={showCreateDialog || !!editingPublisher}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setEditingPublisher(null);
          }
        }}
        publisher={editingPublisher || undefined}
        mode={editingPublisher ? "edit" : "create"}
      />
      </div>
    </DashboardLayout>
  );
}
