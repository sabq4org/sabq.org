import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Archive, Send, Search } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: string;
  status: string;
  channels: string[];
  targetRoles: string[] | null;
  targetUserIds: string[] | null;
  startAt: string | null;
  endAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export default function AnnouncementsList() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [channelFilters, setChannelFilters] = useState<string[]>([]);
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);

  const pageSize = 20;

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
    if (priorityFilter && priorityFilter !== 'all') params.append('priority', priorityFilter);
    if (channelFilters.length > 0) params.append('channels', channelFilters.join(','));
    if (search) params.append('search', search);
    return params.toString() ? `?${params.toString()}` : '';
  };

  const { data: announcements, isLoading } = useQuery<Announcement[]>({
    queryKey: ['/api/announcements', statusFilter, priorityFilter, channelFilters, search],
    queryFn: () => fetch(`/api/announcements${buildQueryString()}`).then(r => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      toast({ title: "✅ تم حذف الإعلان بنجاح" });
      setDeleteDialogId(null);
    },
    onError: () => {
      toast({ title: "❌ فشل حذف الإعلان", variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/announcements/${id}/publish`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      toast({ title: "✅ تم نشر الإعلان بنجاح" });
    },
    onError: () => {
      toast({ title: "❌ فشل نشر الإعلان", variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/announcements/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      toast({ title: "✅ تم أرشفة الإعلان بنجاح" });
    },
    onError: () => {
      toast({ title: "❌ فشل أرشفة الإعلان", variant: "destructive" });
    },
  });

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, { variant: any; className: string }> = {
      critical: { variant: "destructive" as const, className: "bg-red-500" },
      high: { variant: "default" as const, className: "bg-orange-500" },
      medium: { variant: "secondary" as const, className: "bg-blue-500 text-white" },
      low: { variant: "outline" as const, className: "bg-gray-500" },
    };
    const config = variants[priority] || variants.low;
    
    const labels: Record<string, string> = {
      critical: "حرج",
      high: "عالي",
      medium: "متوسط",
      low: "منخفض",
    };
    
    return (
      <Badge variant={config.variant} className={config.className}>
        {labels[priority] || priority}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      draft: { variant: "outline" as const, label: "مسودة" },
      scheduled: { variant: "secondary" as const, label: "مجدول" },
      published: { variant: "default" as const, label: "منشور" },
      expired: { variant: "destructive" as const, label: "منتهي" },
      archived: { variant: "secondary" as const, label: "مؤرشف" },
    };
    const config = variants[status] || variants.draft;
    
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTargetAudience = (announcement: Announcement) => {
    if (announcement.targetUserIds && announcement.targetUserIds.length > 0) {
      return `${announcement.targetUserIds.length} مستخدم`;
    }
    if (announcement.targetRoles && announcement.targetRoles.length > 0) {
      return announcement.targetRoles.join(", ");
    }
    return "الكل";
  };

  const filteredAnnouncements = announcements?.filter(ann => {
    if (search && !ann.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (priorityFilter !== 'all' && ann.priority !== priorityFilter) return false;
    if (channelFilters.length > 0 && !ann.channels.some(ch => channelFilters.includes(ch))) return false;
    return true;
  }) || [];

  const paginatedAnnouncements = filteredAnnouncements.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filteredAnnouncements.length / pageSize);

  const toggleChannelFilter = (channel: string) => {
    setChannelFilters(prev => 
      prev.includes(channel) ? prev.filter(c => c !== channel) : [...prev, channel]
    );
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-3 md:p-6 space-y-4 md:space-y-6" dir="rtl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-bold">الإعلانات الداخلية</h1>
          <Button
            onClick={() => setLocation('/dashboard/announcements/new')}
            data-testid="button-create-announcement"
            size="sm"
            className="w-full sm:w-auto"
          >
            <Plus className="ml-2 h-4 w-4" />
            إنشاء إعلان جديد
          </Button>
        </div>

        <div className="flex flex-col gap-3 md:gap-4 p-3 md:p-4 bg-card rounded-lg border">
          <div className="flex flex-col md:flex-row gap-3 md:gap-4 md:items-end">
            <div className="flex-1">
              <label className="text-xs md:text-sm font-medium mb-1.5 md:mb-2 block">بحث</label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث في العناوين..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-9 md:pr-10 h-9 md:h-10 text-sm"
                  data-testid="input-search"
                />
              </div>
            </div>

            <div className="w-full md:w-48">
              <label className="text-xs md:text-sm font-medium mb-1.5 md:mb-2 block">الحالة</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status" className="h-9 md:h-10 text-sm">
                  <SelectValue placeholder="اختر الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="scheduled">مجدول</SelectItem>
                  <SelectItem value="published">منشور</SelectItem>
                  <SelectItem value="expired">منتهي</SelectItem>
                  <SelectItem value="archived">مؤرشف</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-full md:w-48">
              <label className="text-xs md:text-sm font-medium mb-1.5 md:mb-2 block">الأولوية</label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger data-testid="select-priority" className="h-9 md:h-10 text-sm">
                  <SelectValue placeholder="اختر الأولوية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="low">منخفض</SelectItem>
                  <SelectItem value="medium">متوسط</SelectItem>
                  <SelectItem value="high">عالي</SelectItem>
                  <SelectItem value="critical">حرج</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs md:text-sm font-medium mb-1.5 md:mb-2 block">القنوات</label>
            <div className="flex flex-wrap gap-3 md:gap-4">
              {['dashboard', 'email', 'mobile', 'web'].map(channel => (
                <div key={channel} className="flex items-center gap-1.5 md:gap-2">
                  <Checkbox
                    id={`channel-${channel}`}
                    checked={channelFilters.includes(channel)}
                    onCheckedChange={() => toggleChannelFilter(channel)}
                    data-testid={`checkbox-channel-${channel}`}
                    className="h-3.5 w-3.5 md:h-4 md:w-4"
                  />
                  <label htmlFor={`channel-${channel}`} className="text-xs md:text-sm cursor-pointer whitespace-nowrap">
                    {channel === 'dashboard' && 'لوحة التحكم'}
                    {channel === 'email' && 'البريد الإلكتروني'}
                    {channel === 'mobile' && 'تطبيق الجوال'}
                    {channel === 'web' && 'الموقع'}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 md:h-20 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">العنوان</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الأولوية</TableHead>
                    <TableHead className="text-right">القنوات</TableHead>
                    <TableHead className="text-right">الجمهور</TableHead>
                    <TableHead className="text-right">التواريخ</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedAnnouncements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        لا توجد إعلانات
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedAnnouncements.map((announcement) => (
                      <TableRow key={announcement.id} data-testid={`row-announcement-${announcement.id}`}>
                        <TableCell className="font-medium max-w-xs truncate">{announcement.title}</TableCell>
                        <TableCell>{getStatusBadge(announcement.status)}</TableCell>
                        <TableCell>{getPriorityBadge(announcement.priority)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {announcement.channels.map(ch => (
                              <Badge key={ch} variant="outline" className="text-xs">
                                {ch === 'dashboard' && 'لوحة'}
                                {ch === 'email' && 'بريد'}
                                {ch === 'mobile' && 'جوال'}
                                {ch === 'web' && 'ويب'}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{getTargetAudience(announcement)}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {announcement.publishedAt ? (
                              <div>نشر: {format(new Date(announcement.publishedAt), 'dd MMM yyyy', { locale: ar })}</div>
                            ) : announcement.startAt ? (
                              <div>يبدأ: {format(new Date(announcement.startAt), 'dd MMM yyyy', { locale: ar })}</div>
                            ) : (
                              <div>أنشئ: {format(new Date(announcement.createdAt), 'dd MMM yyyy', { locale: ar })}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setLocation(`/dashboard/announcements/${announcement.id}/edit`)}
                              data-testid={`button-edit-${announcement.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>

                            {(announcement.status === 'draft' || announcement.status === 'scheduled') && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => publishMutation.mutate(announcement.id)}
                                disabled={publishMutation.isPending}
                                data-testid={`button-publish-${announcement.id}`}
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            )}

                            {announcement.status === 'published' && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => archiveMutation.mutate(announcement.id)}
                                disabled={archiveMutation.isPending}
                                data-testid={`button-archive-${announcement.id}`}
                              >
                                <Archive className="h-4 w-4" />
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setDeleteDialogId(announcement.id)}
                              data-testid={`button-delete-${announcement.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {paginatedAnnouncements.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  لا توجد إعلانات
                </div>
              ) : (
                paginatedAnnouncements.map((announcement) => (
                  <div 
                    key={announcement.id} 
                    className="border rounded-lg p-3 space-y-3 hover-elevate"
                    data-testid={`card-announcement-${announcement.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm flex-1 break-words leading-snug">
                        {announcement.title}
                      </h3>
                      <div className="flex gap-1 shrink-0">
                        {getStatusBadge(announcement.status)}
                        {getPriorityBadge(announcement.priority)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {announcement.channels.map(ch => (
                        <Badge key={ch} variant="outline" className="text-xs">
                          {ch === 'dashboard' && 'لوحة'}
                          {ch === 'email' && 'بريد'}
                          {ch === 'mobile' && 'جوال'}
                          {ch === 'web' && 'ويب'}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{getTargetAudience(announcement)}</span>
                      <span>
                        {announcement.publishedAt ? (
                          <>نشر: {format(new Date(announcement.publishedAt), 'dd MMM yyyy', { locale: ar })}</>
                        ) : announcement.startAt ? (
                          <>يبدأ: {format(new Date(announcement.startAt), 'dd MMM yyyy', { locale: ar })}</>
                        ) : (
                          <>أنشئ: {format(new Date(announcement.createdAt), 'dd MMM yyyy', { locale: ar })}</>
                        )}
                      </span>
                    </div>

                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLocation(`/dashboard/announcements/${announcement.id}/edit`)}
                        data-testid={`button-edit-${announcement.id}`}
                        className="flex-1"
                      >
                        <Edit className="ml-2 h-3.5 w-3.5" />
                        تعديل
                      </Button>

                      {(announcement.status === 'draft' || announcement.status === 'scheduled') && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => publishMutation.mutate(announcement.id)}
                          disabled={publishMutation.isPending}
                          data-testid={`button-publish-${announcement.id}`}
                          className="flex-1"
                        >
                          <Send className="ml-2 h-3.5 w-3.5" />
                          نشر
                        </Button>
                      )}

                      {announcement.status === 'published' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => archiveMutation.mutate(announcement.id)}
                          disabled={archiveMutation.isPending}
                          data-testid={`button-archive-${announcement.id}`}
                          className="flex-1"
                        >
                          <Archive className="ml-2 h-3.5 w-3.5" />
                          أرشفة
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteDialogId(announcement.id)}
                        data-testid={`button-delete-${announcement.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  صفحة {page} من {totalPages}
                </div>
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
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    data-testid="button-next-page"
                  >
                    التالي
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        <AlertDialog open={!!deleteDialogId} onOpenChange={() => setDeleteDialogId(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف هذا الإعلان؟ هذا الإجراء لا يمكن التراجع عنه.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <AlertDialogAction
                onClick={() => deleteDialogId && deleteMutation.mutate(deleteDialogId)}
                className="bg-destructive hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                حذف
              </AlertDialogAction>
              <AlertDialogCancel data-testid="button-cancel-delete">
                إلغاء
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
