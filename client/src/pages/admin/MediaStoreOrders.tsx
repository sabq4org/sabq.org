import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  ShoppingBag,
  Clock,
  CreditCard,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Search,
  Calendar,
  User,
  Mail,
  Phone,
  Building,
  FileText,
  Download,
  ExternalLink,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface StatsData {
  totalOrders: number;
  pendingOrders: number;
  paidOrders: number;
  processingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalRevenueHalalas: number;
  totalRevenueSAR: string;
}

interface Order {
  id: string;
  orderNumber: string;
  serviceId: string;
  serviceType: string;
  serviceName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerCompany: string | null;
  contentTitle: string | null;
  priceHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
  priceSAR: string;
  vatSAR: string;
  totalSAR: string;
  currency: string;
  status: string;
  paymentMethod: string | null;
  paidAt: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OrderDetails extends Order {
  trackingToken: string;
  contentBody: string | null;
  contentUrl: string | null;
  attachments: string[];
  socialHandle: string | null;
  additionalNotes: string | null;
  executionNotes: string | null;
  executionUrl: string | null;
  metadata: Record<string, any> | null;
  events: {
    id: string;
    eventType: string;
    description: string;
    metadata: Record<string, any> | null;
    creatorName: string | null;
    createdAt: string;
  }[];
}

interface OrdersResponse {
  success: boolean;
  data: {
    orders: Order[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  };
}

const formatPrice = (amount: number | string): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return num.toLocaleString('en-US') + ' ر.س';
};

const getStatusBadge = (status: string) => {
  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
    pending: { label: "قيد الانتظار", variant: "secondary", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
    payment_pending: { label: "بانتظار الدفع", variant: "secondary", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
    paid: { label: "تم الدفع", variant: "default", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
    processing: { label: "قيد التنفيذ", variant: "default", className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
    completed: { label: "مكتمل", variant: "default", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
    cancelled: { label: "ملغي", variant: "destructive", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
    refunded: { label: "مسترجع", variant: "outline", className: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" },
  };

  const config = statusConfig[status] || { label: status, variant: "outline" as const, className: "" };
  
  return (
    <Badge variant={config.variant} className={config.className} data-testid={`badge-status-${status}`}>
      {config.label}
    </Badge>
  );
};

export default function MediaStoreOrders() {
  const { toast } = useToast();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [newStatus, setNewStatus] = useState("");
  const [statusNotes, setStatusNotes] = useState("");

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<{ success: boolean; data: StatsData }>({
    queryKey: ["/api/media-store/admin/stats"],
  });

  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders } = useQuery<OrdersResponse>({
    queryKey: ["/api/media-store/admin/orders", page, statusFilter, searchQuery, startDate, endDate],
  });

  const { data: orderDetails, isLoading: detailsLoading, refetch: refetchDetails } = useQuery<{ success: boolean; data: OrderDetails }>({
    queryKey: ["/api/media-store/admin/orders", selectedOrderId],
    enabled: !!selectedOrderId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, notes }: { orderId: string; status: string; notes?: string }) => {
      return apiRequest(`/api/media-store/admin/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, notes }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({
        title: "تم التحديث",
        description: "تم تحديث حالة الطلب بنجاح",
      });
      refetchOrders();
      refetchStats();
      if (selectedOrderId) {
        refetchDetails();
      }
      setNewStatus("");
      setStatusNotes("");
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الحالة",
        variant: "destructive",
      });
    },
  });

  const handleRefresh = () => {
    refetchStats();
    refetchOrders();
    toast({
      title: "تم التحديث",
      description: "تم تحديث البيانات بنجاح",
    });
  };

  const handleRowClick = (orderId: string) => {
    setSelectedOrderId(orderId);
    setIsSheetOpen(true);
    setNewStatus("");
    setStatusNotes("");
  };

  const handleStatusUpdate = () => {
    if (!selectedOrderId || !newStatus) return;
    updateStatusMutation.mutate({
      orderId: selectedOrderId,
      status: newStatus,
      notes: statusNotes || undefined,
    });
  };

  const handleSearch = () => {
    setPage(1);
    refetchOrders();
  };

  const statsData = stats?.data;
  const orders = ordersData?.data?.orders || [];
  const pagination = ordersData?.data?.pagination;
  const details = orderDetails?.data;

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 md:p-6 space-y-6" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600">
              <ShoppingBag className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-page-title">إدارة طلبات المتجر الإعلامي</h1>
              <p className="text-muted-foreground">إدارة ومتابعة جميع طلبات الخدمات الإعلامية</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            data-testid="button-refresh"
          >
            <RefreshCw className="w-4 h-4 ml-2" />
            تحديث
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="hover-elevate active-elevate-2 transition-all bg-purple-50 dark:bg-purple-950/30" data-testid="card-total-orders">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الطلبات</CardTitle>
              <div className="p-2 rounded-md bg-purple-500/20">
                <ShoppingBag className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-orders">
                {statsLoading ? "..." : (statsData?.totalOrders || 0).toLocaleString('en-US')}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate active-elevate-2 transition-all bg-yellow-50 dark:bg-yellow-950/30" data-testid="card-pending-orders">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">قيد الانتظار</CardTitle>
              <div className="p-2 rounded-md bg-yellow-500/20">
                <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600" data-testid="text-pending-orders">
                {statsLoading ? "..." : (statsData?.pendingOrders || 0).toLocaleString('en-US')}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate active-elevate-2 transition-all bg-blue-50 dark:bg-blue-950/30" data-testid="card-paid-orders">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">تم الدفع</CardTitle>
              <div className="p-2 rounded-md bg-blue-500/20">
                <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600" data-testid="text-paid-orders">
                {statsLoading ? "..." : (statsData?.paidOrders || 0).toLocaleString('en-US')}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate active-elevate-2 transition-all bg-orange-50 dark:bg-orange-950/30" data-testid="card-processing-orders">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">قيد التنفيذ</CardTitle>
              <div className="p-2 rounded-md bg-orange-500/20">
                <Loader2 className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600" data-testid="text-processing-orders">
                {statsLoading ? "..." : (statsData?.processingOrders || 0).toLocaleString('en-US')}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate active-elevate-2 transition-all bg-green-50 dark:bg-green-950/30" data-testid="card-completed-orders">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">مكتمل</CardTitle>
              <div className="p-2 rounded-md bg-green-500/20">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-completed-orders">
                {statsLoading ? "..." : (statsData?.completedOrders || 0).toLocaleString('en-US')}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="hover-elevate active-elevate-2 transition-all bg-emerald-50 dark:bg-emerald-950/30" data-testid="card-revenue">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإيرادات</CardTitle>
            <div className="p-2 rounded-md bg-emerald-500/20">
              <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600" data-testid="text-total-revenue">
              {statsLoading ? "..." : formatPrice(statsData?.totalRevenueSAR || "0")}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-filters">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="w-5 h-5" />
              البحث والتصفية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="بحث باسم العميل أو البريد أو رقم الطلب..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  data-testid="input-search"
                />
              </div>
              
              <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
                <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="pending">قيد الانتظار</SelectItem>
                  <SelectItem value="payment_pending">بانتظار الدفع</SelectItem>
                  <SelectItem value="paid">تم الدفع</SelectItem>
                  <SelectItem value="processing">قيد التنفيذ</SelectItem>
                  <SelectItem value="completed">مكتمل</SelectItem>
                  <SelectItem value="cancelled">ملغي</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-[150px]"
                  data-testid="input-start-date"
                />
                <span className="text-muted-foreground">إلى</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-[150px]"
                  data-testid="input-end-date"
                />
              </div>

              <Button onClick={handleSearch} data-testid="button-search">
                <Search className="w-4 h-4 ml-2" />
                بحث
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-orders-table">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>قائمة الطلبات</span>
              {pagination && (
                <span className="text-sm font-normal text-muted-foreground">
                  {pagination.total} طلب
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                لا توجد طلبات
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right py-3 px-2">رقم الطلب</th>
                        <th className="text-right py-3 px-2">الخدمة</th>
                        <th className="text-right py-3 px-2">العميل</th>
                        <th className="text-right py-3 px-2">البريد</th>
                        <th className="text-right py-3 px-2">الهاتف</th>
                        <th className="text-right py-3 px-2">المبلغ</th>
                        <th className="text-right py-3 px-2">الحالة</th>
                        <th className="text-right py-3 px-2">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr
                          key={order.id}
                          className="border-b hover-elevate cursor-pointer transition-colors"
                          onClick={() => handleRowClick(order.id)}
                          data-testid={`row-order-${order.id}`}
                        >
                          <td className="py-3 px-2 font-mono text-xs">{order.orderNumber}</td>
                          <td className="py-3 px-2">{order.serviceName}</td>
                          <td className="py-3 px-2">{order.customerName}</td>
                          <td className="py-3 px-2 text-muted-foreground text-xs">{order.customerEmail}</td>
                          <td className="py-3 px-2 text-muted-foreground text-xs" dir="ltr">{order.customerPhone || "-"}</td>
                          <td className="py-3 px-2 font-medium">{formatPrice(order.totalSAR)}</td>
                          <td className="py-3 px-2">{getStatusBadge(order.status)}</td>
                          <td className="py-3 px-2 text-muted-foreground text-xs">
                            {new Date(order.createdAt).toLocaleDateString("ar-SA-u-ca-gregory")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      data-testid="button-prev-page"
                    >
                      السابق
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      صفحة {page} من {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={!pagination.hasMore}
                      data-testid="button-next-page"
                    >
                      التالي
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
            <SheetHeader>
              <SheetTitle className="text-right">تفاصيل الطلب</SheetTitle>
            </SheetHeader>

            {detailsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : details ? (
              <ScrollArea className="h-[calc(100vh-100px)] pr-4">
                <div className="space-y-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">رقم الطلب</p>
                      <p className="font-mono font-bold" data-testid="text-order-number">{details.orderNumber}</p>
                    </div>
                    {getStatusBadge(details.status)}
                  </div>

                  <Separator />

                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      معلومات العميل
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span>{details.customerName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span>{details.customerEmail}</span>
                      </div>
                      {details.customerPhone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <span dir="ltr">{details.customerPhone}</span>
                        </div>
                      )}
                      {details.customerCompany && (
                        <div className="flex items-center gap-2">
                          <Building className="w-4 h-4 text-muted-foreground" />
                          <span>{details.customerCompany}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      تفاصيل الطلب
                    </h3>
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">الخدمة</p>
                        <p className="font-medium">{details.serviceName}</p>
                      </div>
                      {details.contentTitle && (
                        <div>
                          <p className="text-muted-foreground">عنوان المحتوى</p>
                          <p>{details.contentTitle}</p>
                        </div>
                      )}
                      {details.contentBody && (
                        <div>
                          <p className="text-muted-foreground">نص المحتوى</p>
                          <p className="whitespace-pre-wrap bg-muted p-3 rounded-md text-xs">{details.contentBody}</p>
                        </div>
                      )}
                      {details.contentUrl && (
                        <div>
                          <p className="text-muted-foreground">رابط المحتوى</p>
                          <a href={details.contentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />
                            {details.contentUrl}
                          </a>
                        </div>
                      )}
                      {details.socialHandle && (
                        <div>
                          <p className="text-muted-foreground">حساب التواصل الاجتماعي</p>
                          <p>{details.socialHandle}</p>
                        </div>
                      )}
                      {details.additionalNotes && (
                        <div>
                          <p className="text-muted-foreground">ملاحظات إضافية</p>
                          <p className="whitespace-pre-wrap">{details.additionalNotes}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      التسعير
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">السعر الأساسي</span>
                        <span>{formatPrice(details.priceSAR)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ضريبة القيمة المضافة (15%)</span>
                        <span>{formatPrice(details.vatSAR)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>الإجمالي</span>
                        <span className="text-green-600">{formatPrice(details.totalSAR)}</span>
                      </div>
                    </div>
                  </div>

                  {details.attachments && details.attachments.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                          <Download className="w-4 h-4" />
                          المرفقات
                        </h3>
                        <div className="space-y-2">
                          {details.attachments.map((attachment, index) => (
                            <a
                              key={index}
                              href={attachment}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 p-2 rounded-md bg-muted hover-elevate text-sm"
                            >
                              <Download className="w-4 h-4" />
                              <span>مرفق {index + 1}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {details.executionUrl && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="font-semibold mb-3">رابط التنفيذ</h3>
                        <a
                          href={details.executionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          عرض النتيجة
                        </a>
                      </div>
                    </>
                  )}

                  <Separator />

                  <div>
                    <h3 className="font-semibold mb-3">تحديث الحالة</h3>
                    <div className="space-y-3">
                      <div>
                        <Label>الحالة الجديدة</Label>
                        <Select value={newStatus} onValueChange={setNewStatus}>
                          <SelectTrigger data-testid="select-new-status">
                            <SelectValue placeholder="اختر الحالة" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">قيد الانتظار</SelectItem>
                            <SelectItem value="paid">تم الدفع</SelectItem>
                            <SelectItem value="processing">قيد التنفيذ</SelectItem>
                            <SelectItem value="completed">مكتمل</SelectItem>
                            <SelectItem value="cancelled">ملغي</SelectItem>
                            <SelectItem value="refunded">مسترجع</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>ملاحظات (اختياري)</Label>
                        <Textarea
                          value={statusNotes}
                          onChange={(e) => setStatusNotes(e.target.value)}
                          placeholder="أضف ملاحظات حول تغيير الحالة..."
                          data-testid="textarea-status-notes"
                        />
                      </div>
                      <Button
                        onClick={handleStatusUpdate}
                        disabled={!newStatus || updateStatusMutation.isPending}
                        className="w-full"
                        data-testid="button-update-status"
                      >
                        {updateStatusMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin ml-2" />
                        ) : (
                          <CheckCircle className="w-4 h-4 ml-2" />
                        )}
                        تحديث الحالة
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      سجل الأحداث
                    </h3>
                    {details.events && details.events.length > 0 ? (
                      <div className="space-y-3">
                        {details.events.map((event) => (
                          <div key={event.id} className="border-r-2 border-muted pr-3 pb-3">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-sm">{event.description}</p>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <span>{new Date(event.createdAt).toLocaleString("ar-SA-u-ca-gregory")}</span>
                              {event.creatorName && (
                                <>
                                  <span>•</span>
                                  <span>{event.creatorName}</span>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">لا توجد أحداث</p>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>تاريخ الإنشاء: {new Date(details.createdAt).toLocaleString("ar-SA-u-ca-gregory")}</p>
                    {details.paidAt && <p>تاريخ الدفع: {new Date(details.paidAt).toLocaleString("ar-SA-u-ca-gregory")}</p>}
                    {details.executedAt && <p>تاريخ التنفيذ: {new Date(details.executedAt).toLocaleString("ar-SA-u-ca-gregory")}</p>}
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                لم يتم العثور على الطلب
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
}