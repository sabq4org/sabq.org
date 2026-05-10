import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  MapPin, 
  Monitor,
  DollarSign,
  Edit2,
  Trash2,
  LayoutGrid,
  Search
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";

// Types
type InventorySlot = {
  id: string;
  name: string;
  location: "header" | "sidebar" | "footer" | "inline" | "between_articles";
  size: string;
  pageType: "all" | "home" | "article" | "category";
  deviceType: "desktop" | "mobile" | "tablet" | "all";
  isActive: boolean;
  floorPrice: number;
  createdAt: string;
  updatedAt: string;
};

// Location labels
const locationLabels: Record<InventorySlot["location"], string> = {
  header: "الترويسة",
  sidebar: "الشريط الجانبي",
  footer: "التذييل",
  inline: "داخل المحتوى",
  between_articles: "بين المقالات",
};

// Page type labels
const pageTypeLabels: Record<InventorySlot["pageType"], string> = {
  all: "جميع الصفحات",
  home: "الصفحة الرئيسية",
  article: "صفحات المقالات",
  category: "صفحات الأقسام",
};

// Device type labels
const deviceTypeLabels: Record<InventorySlot["deviceType"], string> = {
  all: "جميع الأجهزة",
  desktop: "الكمبيوتر فقط",
  mobile: "الهاتف فقط",
  tablet: "التابلت فقط",
};

// Available sizes
const availableSizes = [
  { value: "728x90", label: "728x90 (Leaderboard)" },
  { value: "300x250", label: "300x250 (Medium Rectangle)" },
  { value: "160x600", label: "160x600 (Wide Skyscraper)" },
  { value: "970x250", label: "970x250 (Billboard)" },
  { value: "300x600", label: "300x600 (Half Page)" },
  { value: "320x50", label: "320x50 (Mobile Banner)" },
];

// Form schema
const formSchema = z.object({
  name: z.string().min(1, "اسم المكان مطلوب"),
  location: z.enum(["header", "sidebar", "footer", "inline", "between_articles"], {
    required_error: "الموقع مطلوب"
  }),
  size: z.string().min(1, "الحجم مطلوب"),
  pageType: z.enum(["all", "home", "article", "category"], {
    required_error: "نوع الصفحة مطلوب"
  }),
  deviceType: z.enum(["desktop", "mobile", "tablet", "all"], {
    required_error: "نوع الجهاز مطلوب"
  }).default("all"),
  floorPrice: z.coerce.number().min(0, "السعر يجب أن يكون صفراً أو أكثر").optional().default(0),
  isActive: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-12 w-12 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-primary/10 p-6 mb-4">
          <LayoutGrid className="h-12 w-12 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-2">لا توجد أماكن عرض</h3>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          قم بإنشاء أول مكان عرض إعلاني على موقعك
        </p>
        <Button
          onClick={onCreateClick}
          data-testid="button-create-first-slot"
        >
          <Plus className="h-4 w-4 ml-2" />
          إنشاء أول مكان عرض
        </Button>
      </CardContent>
    </Card>
  );
}

export default function InventorySlotsManagement() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<InventorySlot | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState<InventorySlot | null>(null);

  // Allow advertiser, admin, superadmin, and system_admin to manage inventory slots
  const isAdmin = user?.role && ["admin", "superadmin", "system_admin", "advertiser"].includes(user.role) ? true : false;

  useEffect(() => {
    document.title = "إدارة أماكن العرض الإعلانية - لوحة تحكم الإعلانات";
  }, []);

  // Debug log
  useEffect(() => {
    if (user) {
      console.log("[InventorySlotsManagement] User role:", user.role, "isAdmin:", isAdmin);
    }
  }, [user, isAdmin]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      location: "header",
      size: "728x90",
      pageType: "all",
      deviceType: "all",
      floorPrice: 0,
      isActive: true,
    },
  });

  // Fetch inventory slots
  const { data: slotsRaw, isLoading } = useQuery<InventorySlot[]>({
    queryKey: ["/api/ads/inventory-slots"],
    enabled: !!user,
  });
  const slots = Array.isArray(slotsRaw) ? slotsRaw : [];

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      return apiRequest("/api/ads/inventory-slots", {
        method: "POST",
        body: JSON.stringify(values),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/inventory-slots"] });
      toast({
        title: "تم إنشاء مكان العرض بنجاح",
        description: "تم إضافة مكان العرض الجديد بنجاح",
      });
      setDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "خطأ في الإنشاء",
        description: error.message || "حدث خطأ أثناء إنشاء مكان العرض",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: FormValues }) => {
      return apiRequest(`/api/ads/inventory-slots/${id}`, {
        method: "PUT",
        body: JSON.stringify(values),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/inventory-slots"] });
      toast({
        title: "تم تحديث مكان العرض بنجاح",
        description: "تم حفظ التغييرات بنجاح",
      });
      setDialogOpen(false);
      setEditingSlot(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "خطأ في التحديث",
        description: error.message || "حدث خطأ أثناء تحديث مكان العرض",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/ads/inventory-slots/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/inventory-slots"] });
      toast({
        title: "تم حذف مكان العرض بنجاح",
        description: "تم حذف مكان العرض من النظام",
      });
      setDeleteDialogOpen(false);
      setSlotToDelete(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "خطأ في الحذف",
        description: error.message || "حدث خطأ أثناء حذف مكان العرض",
      });
    },
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ slot, isActive }: { slot: InventorySlot; isActive: boolean }) => {
      // Send complete payload to satisfy backend validation
      const payload = {
        name: slot.name,
        location: slot.location,
        size: slot.size,
        pageType: slot.pageType,
        deviceType: slot.deviceType || "all",
        floorPrice: slot.floorPrice,
        isActive: isActive,
      };
      return apiRequest(`/api/ads/inventory-slots/${slot.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/inventory-slots"] });
      toast({
        title: "تم تحديث حالة مكان العرض",
        description: "تم تغيير حالة مكان العرض بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "خطأ في التحديث",
        description: error.message || "حدث خطأ أثناء تحديث حالة مكان العرض",
      });
    },
  });

  // Filter slots by search term
  const filteredSlots = slots.filter((slot) =>
    slot.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = () => {
    setEditingSlot(null);
    form.reset({
      name: "",
      location: "header",
      size: "728x90",
      deviceType: "all",
      pageType: "all",
      floorPrice: 0,
      isActive: true,
    });
    setDialogOpen(true);
  };

  const handleEdit = (slot: InventorySlot) => {
    setEditingSlot(slot);
    form.reset({
      name: slot.name,
      location: slot.location,
      size: slot.size,
      pageType: slot.pageType,
      deviceType: slot.deviceType || "all",
      floorPrice: slot.floorPrice,
      isActive: slot.isActive,
    });
    setDialogOpen(true);
  };

  const handleDelete = (slot: InventorySlot) => {
    setSlotToDelete(slot);
    setDeleteDialogOpen(true);
  };

  const handleToggleActive = (slot: InventorySlot) => {
    toggleActiveMutation.mutate({
      slot: slot,
      isActive: !slot.isActive,
    });
  };

  const onSubmit = (values: FormValues) => {
    if (editingSlot) {
      updateMutation.mutate({ id: editingSlot.id, values });
    } else {
      createMutation.mutate(values);
    }
  };

  const confirmDelete = () => {
    if (slotToDelete) {
      deleteMutation.mutate(slotToDelete.id);
    }
  };

  const formatPrice = (priceInCents: number) => {
    const priceInRiyals = priceInCents / 100;
    return new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(priceInRiyals);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6" dir="rtl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-end gap-3 mb-2">
            <div className="text-right">
              <h1 className="text-3xl font-bold">أماكن العرض الإعلانية</h1>
              <p className="text-muted-foreground">
                إدارة أماكن ظهور الإعلانات على موقع سبق الذكية
              </p>
            </div>
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600">
              <LayoutGrid className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        {/* Stats Card */}
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card className="hover-elevate active-elevate-2 transition-all bg-blue-50 dark:bg-blue-950/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الأماكن</CardTitle>
              <div className="p-2 rounded-md bg-blue-500/20">
                <LayoutGrid className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-slots">
                {slots.length.toLocaleString('en-US')}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate active-elevate-2 transition-all bg-green-50 dark:bg-green-950/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">الأماكن النشطة</CardTitle>
              <div className="p-2 rounded-md bg-green-500/20">
                <MapPin className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-active-slots">
                {slots.filter((s) => s.isActive).length.toLocaleString('en-US')}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate active-elevate-2 transition-all bg-gray-50 dark:bg-gray-950/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">الأماكن غير النشطة</CardTitle>
              <div className="p-2 rounded-md bg-gray-500/20">
                <Monitor className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600 dark:text-gray-400" data-testid="text-inactive-slots">
                {slots.filter((s) => !s.isActive).length.toLocaleString('en-US')}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Card */}
        <Card className="bg-gradient-to-br from-background to-muted/20">
          <CardHeader>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <CardTitle>قائمة أماكن العرض</CardTitle>
                <CardDescription>
                  إدارة جميع أماكن عرض الإعلانات على الموقع
                </CardDescription>
              </div>
              {isAdmin && (
                <Button
                  onClick={handleCreate}
                  data-testid="button-create-slot"
                >
                  <Plus className="h-4 w-4 ml-2" />
                  إنشاء مكان عرض جديد
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {/* Search */}
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="البحث عن مكان عرض..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-10"
                  data-testid="input-search-slots"
                />
              </div>
            </div>

            {/* Loading State */}
            {isLoading && <TableSkeleton />}

            {/* Empty State */}
            {!isLoading && filteredSlots.length === 0 && slots.length === 0 && (
              <EmptyState onCreateClick={handleCreate} />
            )}

            {/* No Results State */}
            {!isLoading && filteredSlots.length === 0 && slots.length > 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">لا توجد نتائج للبحث</p>
              </div>
            )}

            {/* Table */}
            {!isLoading && filteredSlots.length > 0 && (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right">الموقع</TableHead>
                      <TableHead className="text-right">الحجم</TableHead>
                      <TableHead className="text-right">نوع الصفحة</TableHead>
                      <TableHead className="text-right">نوع الجهاز</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">الحد الأدنى للسعر</TableHead>
                      <TableHead className="text-left">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSlots.map((slot) => (
                      <TableRow key={slot.id} data-testid={`row-slot-${slot.id}`}>
                        <TableCell className="font-medium" data-testid={`text-slot-name-${slot.id}`}>
                          {slot.name}
                        </TableCell>
                        <TableCell data-testid={`text-slot-location-${slot.id}`}>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            {locationLabels[slot.location]}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`text-slot-size-${slot.id}`}>
                          {slot.size}
                        </TableCell>
                        <TableCell data-testid={`text-slot-page-type-${slot.id}`}>
                          <div className="flex items-center gap-2">
                            <Monitor className="h-4 w-4 text-muted-foreground" />
                            {pageTypeLabels[slot.pageType]}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`text-slot-device-type-${slot.id}`}>
                          <Badge variant="outline">
                            {deviceTypeLabels[slot.deviceType || "all"]}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`badge-slot-status-${slot.id}`}>
                          <Badge
                            variant={slot.isActive ? "default" : "secondary"}
                            className={slot.isActive ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" : ""}
                          >
                            {slot.isActive ? "نشط" : "غير نشط"}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`text-slot-price-${slot.id}`}>
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            {formatPrice(slot.floorPrice)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            {isAdmin && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleToggleActive(slot)}
                                  data-testid={`button-toggle-active-${slot.id}`}
                                  disabled={toggleActiveMutation.isPending}
                                >
                                  {slot.isActive ? "تعطيل" : "تفعيل"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEdit(slot)}
                                  data-testid={`button-edit-slot-${slot.id}`}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(slot)}
                                  data-testid={`button-delete-slot-${slot.id}`}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {!isAdmin && (
                              <span className="text-sm text-muted-foreground">
                                (عرض فقط)
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-[500px]" dir="rtl">
            <DialogHeader>
              <DialogTitle data-testid="dialog-title">
                {editingSlot ? "تعديل مكان العرض" : "إنشاء مكان عرض جديد"}
              </DialogTitle>
              <DialogDescription>
                {editingSlot
                  ? "قم بتحديث معلومات مكان العرض الإعلاني"
                  : "أضف مكان عرض إعلاني جديد على الموقع"}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="مثال: بنر رئيسي في الصفحة الرئيسية"
                          data-testid="input-slot-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Location */}
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الموقع</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-slot-location">
                            <SelectValue placeholder="اختر الموقع" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="header">الترويسة</SelectItem>
                          <SelectItem value="sidebar">الشريط الجانبي</SelectItem>
                          <SelectItem value="footer">التذييل</SelectItem>
                          <SelectItem value="inline">داخل المحتوى</SelectItem>
                          <SelectItem value="between_articles">بين المقالات</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Size */}
                <FormField
                  control={form.control}
                  name="size"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الحجم</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-slot-size">
                            <SelectValue placeholder="اختر الحجم" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableSizes.map((size) => (
                            <SelectItem key={size.value} value={size.value}>
                              {size.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Page Type */}
                <FormField
                  control={form.control}
                  name="pageType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>نوع الصفحة</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-slot-page-type">
                            <SelectValue placeholder="اختر نوع الصفحة" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">جميع الصفحات</SelectItem>
                          <SelectItem value="home">الصفحة الرئيسية</SelectItem>
                          <SelectItem value="article">صفحات المقالات</SelectItem>
                          <SelectItem value="category">صفحات الأقسام</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Device Type */}
                <FormField
                  control={form.control}
                  name="deviceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>نوع الجهاز</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-slot-device-type">
                            <SelectValue placeholder="اختر نوع الجهاز" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">جميع الأجهزة</SelectItem>
                          <SelectItem value="desktop">الكمبيوتر فقط</SelectItem>
                          <SelectItem value="mobile">الهاتف فقط</SelectItem>
                          <SelectItem value="tablet">التابلت فقط</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        حدد الأجهزة التي سيظهر عليها هذا المكان
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Floor Price */}
                <FormField
                  control={form.control}
                  name="floorPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الحد الأدنى للسعر (بالهللات)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min="0"
                          placeholder="0"
                          data-testid="input-slot-floor-price"
                        />
                      </FormControl>
                      <FormDescription>
                        أدخل السعر بالهللات (100 هللة = 1 ريال)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Is Active */}
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          تفعيل مكان العرض
                        </FormLabel>
                        <FormDescription>
                          يمكن تعطيله لاحقاً من قائمة الأماكن
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-slot-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    data-testid="button-cancel-dialog"
                  >
                    إلغاء
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit-dialog"
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? "جاري الحفظ..."
                      : editingSlot
                      ? "حفظ التغييرات"
                      : "إنشاء مكان العرض"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="delete-dialog-title">
                هل أنت متأكد من حذف مكان العرض؟
              </AlertDialogTitle>
              <AlertDialogDescription>
                سيتم حذف "{slotToDelete?.name}" بشكل نهائي من النظام. هذا الإجراء لا يمكن التراجع عنه.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">
                إلغاء
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "جاري الحذف..." : "حذف"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
