import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { TrendingUp, Telescope, Radar, Brain, Plus, Eye, Edit, Trash2, FileText } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MirqabEntryWithDetails } from "@shared/schema";

export default function MirqabDashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("sabq_index");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: entriesRaw, isLoading } = useQuery<MirqabEntryWithDetails[]>({
    queryKey: ['/api/mirqab/entries', activeTab, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('type', activeTab);
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      const url = `/api/mirqab/entries?${params.toString()}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch entries');
      return await res.json();
    },
  });
  const entries = Array.isArray(entriesRaw) ? entriesRaw : [];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/mirqab/entries/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mirqab/entries'] });
      toast({
        title: "تم الحذف",
        description: "تم حذف المدخل بنجاح",
      });
      setDeleteId(null);
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل حذف المدخل",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
      draft: { label: 'مسودة', variant: 'secondary' },
      scheduled: { label: 'مجدولة', variant: 'outline' },
      published: { label: 'منشورة', variant: 'default' },
      archived: { label: 'مؤرشفة', variant: 'secondary' },
    };
    const config = variants[status] || { label: status, variant: 'secondary' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const stats = {
    total: entries.length,
    draft: entries.filter(e => e.status === 'draft').length,
    published: entries.filter(e => e.status === 'published').length,
    scheduled: entries.filter(e => e.status === 'scheduled').length,
  };

  const tabs = [
    { value: 'sabq_index', label: 'مؤشر سبق', icon: TrendingUp, createPath: '/dashboard/mirqab/sabq-index/new' },
    { value: 'next_story', label: 'قصة قادمة', icon: Telescope, createPath: '/dashboard/mirqab/next-stories/new' },
    { value: 'radar', label: 'الرادار', icon: Radar, createPath: '/dashboard/mirqab/radar/new' },
    { value: 'algorithm_article', label: 'الخوارزمي يكتب', icon: Brain, createPath: '/dashboard/mirqab/algorithm-writes/new' },
  ];

  const currentTab = tabs.find(t => t.value === activeTab);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="heading-title">
              لوحة تحكم المرقاب
            </h1>
            <p className="text-muted-foreground" data-testid="text-description">
              إدارة محتوى المرقاب والمؤشرات
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card 
            data-testid="card-stat-total"
            className={`cursor-pointer transition-all hover-elevate active-elevate-2 ${statusFilter === 'all' ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                إجمالي المنشورات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-total">{stats.total}</div>
            </CardContent>
          </Card>
          <Card 
            data-testid="card-stat-published"
            className={`cursor-pointer transition-all hover-elevate active-elevate-2 ${statusFilter === 'published' ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setStatusFilter('published')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                منشورة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-published">{stats.published}</div>
            </CardContent>
          </Card>
          <Card 
            data-testid="card-stat-draft"
            className={`cursor-pointer transition-all hover-elevate active-elevate-2 ${statusFilter === 'draft' ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setStatusFilter('draft')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                مسودات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-draft">{stats.draft}</div>
            </CardContent>
          </Card>
          <Card 
            data-testid="card-stat-scheduled"
            className={`cursor-pointer transition-all hover-elevate active-elevate-2 ${statusFilter === 'scheduled' ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setStatusFilter('scheduled')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                مجدولة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-scheduled">{stats.scheduled}</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>إدارة المحتوى</CardTitle>
                <CardDescription>عرض وإدارة محتوى المرقاب</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                    <SelectValue placeholder="تصفية حسب الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الحالات</SelectItem>
                    <SelectItem value="draft">مسودة</SelectItem>
                    <SelectItem value="scheduled">مجدولة</SelectItem>
                    <SelectItem value="published">منشورة</SelectItem>
                    <SelectItem value="archived">مؤرشفة</SelectItem>
                  </SelectContent>
                </Select>
                {currentTab && (
                  <Link href={currentTab.createPath}>
                    <Button data-testid="button-create-new">
                      <Plus className="w-4 h-4 ml-2" />
                      إنشاء جديد
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4" data-testid="tabs-list">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger key={tab.value} value={tab.value} data-testid={`tab-${tab.value}`}>
                      <Icon className="w-4 h-4 ml-2" />
                      {tab.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {tabs.map((tab) => (
                <TabsContent key={tab.value} value={tab.value} className="mt-6">
                  {isLoading ? (
                    <div className="text-center py-8 text-muted-foreground">
                      جاري التحميل...
                    </div>
                  ) : entries.length === 0 ? (
                    <div className="text-center py-12" data-testid="empty-state">
                      <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-semibold mb-2">لا توجد عناصر</h3>
                      <p className="text-muted-foreground mb-4">ابدأ بإنشاء محتوى جديد</p>
                      <Link href={tab.createPath}>
                        <Button>
                          <Plus className="w-4 h-4 ml-2" />
                          إنشاء جديد
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>العنوان</TableHead>
                          <TableHead>الحالة</TableHead>
                          <TableHead>تاريخ النشر</TableHead>
                          <TableHead>المشاهدات</TableHead>
                          <TableHead>الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.map((entry) => (
                          <TableRow key={entry.id} data-testid={`row-entry-${entry.id}`}>
                            <TableCell className="font-medium" data-testid={`text-title-${entry.id}`}>
                              {entry.title}
                            </TableCell>
                            <TableCell data-testid={`badge-status-${entry.id}`}>
                              {getStatusBadge(entry.status)}
                            </TableCell>
                            <TableCell data-testid={`text-date-${entry.id}`}>
                              {entry.publishedAt 
                                ? format(new Date(entry.publishedAt), 'dd/MM/yyyy', { locale: ar })
                                : '-'
                              }
                            </TableCell>
                            <TableCell data-testid={`text-views-${entry.id}`}>
                              {entry.views || 0}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 justify-end">
                                <Link href={`/mirqab/${activeTab === 'sabq_index' ? 'sabq-index' : activeTab}/${entry.id}`}>
                                  <Button variant="ghost" size="sm" data-testid={`button-view-${entry.id}`}>
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </Link>
                                <Link href={`/dashboard/mirqab/${activeTab === 'sabq_index' ? 'sabq-index' : activeTab}/${entry.id}/edit`}>
                                  <Button variant="ghost" size="sm" data-testid={`button-edit-${entry.id}`}>
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                </Link>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => setDeleteId(entry.id)}
                                  data-testid={`button-delete-${entry.id}`}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف هذا المدخل نهائياً ولا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              data-testid="button-confirm-delete"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
