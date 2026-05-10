import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Edit2,
  Trash2,
  LayoutGrid,
  CheckCircle,
  Clock,
  Search,
  AlertCircle,
  Calendar as CalendarIcon,
  MapPin,
  Image as ImageIcon,
  Video,
  Code
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import { cn } from "@/lib/utils";

// Types
type Placement = {
  id: string;
  campaignId: string;
  adGroupId: string | null;
  creativeId: string;
  inventorySlotId: string;
  priority: number;
  startDate: string;
  endDate: string | null;
  status: "scheduled" | "active" | "paused" | "expired";
  createdAt: string;
  updatedAt: string;
  creative?: {
    id: string;
    name: string;
    type: string;
    content: string;
    size: string;
  };
  inventorySlot?: {
    id: string;
    name: string;
    location: string;
    size: string;
  };
};

type Creative = {
  id: string;
  adGroupId: string;
  name: string;
  type: string;
  content: string;
  size: string;
  status: string;
};

type InventorySlot = {
  id: string;
  name: string;
  location: string;
  size: string;
  pageType: string;
  isActive: boolean;
};

type AdGroup = {
  id: string;
  campaignId: string;
  name: string;
  status: string;
};

// Location labels
const locationLabels: Record<string, string> = {
  header: "الترويسة",
  sidebar: "الشريط الجانبي",
  footer: "التذييل",
  inline: "داخل المحتوى",
  between_articles: "بين المقالات",
};

// Status colors
const statusColors: Record<Placement["status"], "default" | "secondary" | "outline" | "destructive"> = {
  scheduled: "outline",
  active: "default",
  paused: "secondary",
  expired: "destructive",
};

// Status labels
const statusLabels: Record<Placement["status"], string> = {
  scheduled: "مجدول",
  active: "نشط",
  paused: "متوقف",
  expired: "منتهي",
};

// Form schema
const formSchema = z.object({
  creativeId: z.string().uuid({ message: "يجب اختيار البنر" }),
  inventorySlotId: z.string().uuid({ message: "يجب اختيار مكان العرض" }),
  priority: z.coerce.number().int().min(1, "الأولوية يجب أن تكون على الأقل 1").max(10, "الأولوية يجب ألا تتجاوز 10").default(5),
  startDate: z.date({ required_error: "تاريخ البداية مطلوب" }),
  endDate: z.date().optional().nullable(),
  status: z.enum(["scheduled", "active", "paused"]).default("scheduled"),
}).refine((data) => !data.endDate || data.endDate > data.startDate, {
  message: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية",
  path: ["endDate"],
});

type FormValues = z.infer<typeof formSchema>;

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-16 w-16 rounded" />
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
        <h3 className="text-xl font-semibold mb-2">لا توجد روابط</h3>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          قم بإنشاء أول ربط لعرض البنرات في أماكن العرض
        </p>
        <Button
          onClick={onCreateClick}
          data-testid="button-create-first-placement"
        >
          <Plus className="h-4 w-4 ml-2" />
          إنشاء أول ربط
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PlacementsManagement() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();
  const params = useParams();
  const campaignId = params.campaignId;
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlacement, setEditingPlacement] = useState<Placement | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [placementToDelete, setPlacementToDelete] = useState<Placement | null>(null);

  const isAdmin = ["admin", "superadmin", "system_admin", "advertiser"].includes(user?.role || "");

  useEffect(() => {
    document.title = "إدارة أماكن عرض البنرات - لوحة تحكم الإعلانات";
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      creativeId: "",
      inventorySlotId: "",
      priority: 5,
      startDate: new Date(),
      endDate: null,
      status: "scheduled",
    },
  });

  // Watch for creative and slot selection to show size mismatch warning
  const selectedCreativeId = form.watch("creativeId");
  const selectedSlotId = form.watch("inventorySlotId");

  // Fetch placements
  const { data: placementsRaw, isLoading: isLoadingPlacements } = useQuery<Placement[]>({
    queryKey: ["/api/ads/campaigns", campaignId, "placements"],
    enabled: !!campaignId && !!user,
  });
  const placements = Array.isArray(placementsRaw) ? placementsRaw : [];

  // Fetch ad groups
  const { data: adGroupsRaw } = useQuery<AdGroup[]>({
    queryKey: ["/api/ads/ad-groups", { campaignId }],
    queryFn: async () => {
      const res = await fetch(`/api/ads/ad-groups?campaignId=${campaignId}`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error("فشل في جلب المجموعات الإعلانية");
      return res.json();
    },
    enabled: !!campaignId && dialogOpen,
  });
  const adGroups = Array.isArray(adGroupsRaw) ? adGroupsRaw : [];

  // Fetch creatives from campaign
  const { data: creativesRaw, isLoading: isLoadingCreatives } = useQuery<Creative[]>({
    queryKey: ["/api/ads/campaigns", campaignId, "creatives"],
    queryFn: async () => {
      const res = await fetch(`/api/ads/campaigns/${campaignId}/creatives`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error("فشل في جلب البنرات");
      return res.json();
    },
    enabled: !!campaignId && dialogOpen,
  });
  const creatives = Array.isArray(creativesRaw) ? creativesRaw : [];

  // Fetch inventory slots
  const { data: slotsRaw, isLoading: isLoadingSlots } = useQuery<InventorySlot[]>({
    queryKey: ["/api/ads/inventory-slots"],
    queryFn: async () => {
      const res = await fetch("/api/ads/inventory-slots", {
        credentials: "include"
      });
      if (!res.ok) throw new Error("فشل في جلب أماكن العرض");
      const data = await res.json();
      return data.filter((slot: InventorySlot) => slot.isActive);
    },
    enabled: dialogOpen,
  });
  const slots = Array.isArray(slotsRaw) ? slotsRaw : [];

  // Get selected creative and slot
  const selectedCreative = creatives.find(c => c.id === selectedCreativeId);
  const selectedSlot = slots.find(s => s.id === selectedSlotId);
  const hasSizeMismatch = selectedCreative && selectedSlot && selectedCreative.size !== selectedSlot.size;

  // Calculate stats
  const totalPlacements = placements.length;
  const activePlacements = placements.filter(p => p.status === "active").length;
  const scheduledPlacements = placements.filter(p => p.status === "scheduled").length;

  // Filter placements by search
  const filteredPlacements = placements.filter(placement => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      placement.creative?.name.toLowerCase().includes(term) ||
      placement.inventorySlot?.name.toLowerCase().includes(term)
    );
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      return apiRequest(`/api/ads/campaigns/${campaignId}/placements`, {
        method: "POST",
        body: JSON.stringify({
          ...values,
          startDate: values.startDate.toISOString(),
          endDate: values.endDate?.toISOString() || null,
        }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/campaigns", campaignId, "placements"] });
      toast({
        title: "تم إنشاء الربط بنجاح",
        description: "تم إضافة الربط الجديد بنجاح",
      });
      setDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      const message = error.message || "حدث خطأ أثناء إنشاء الربط";
      let description = message;
      
      if (error.status === 409) {
        description = "يوجد تداخل في جدولة هذا البنر في نفس المكان";
      } else if (error.status === 403) {
        description = "ليس لديك صلاحية لتنفيذ هذا الإجراء";
      } else if (error.status === 404) {
        description = "الحملة أو البنر أو مكان العرض غير موجود";
      }
      
      toast({
        variant: "destructive",
        title: "خطأ في الإنشاء",
        description,
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: FormValues }) => {
      return apiRequest(`/api/ads/campaigns/${campaignId}/placements/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...values,
          startDate: values.startDate.toISOString(),
          endDate: values.endDate?.toISOString() || null,
        }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/campaigns", campaignId, "placements"] });
      toast({
        title: "تم تحديث الربط بنجاح",
        description: "تم تحديث الربط بنجاح",
      });
      setDialogOpen(false);
      setEditingPlacement(null);
      form.reset();
    },
    onError: (error: any) => {
      const message = error.message || "حدث خطأ أثناء تحديث الربط";
      let description = message;
      
      if (error.status === 409) {
        description = "يوجد تداخل في جدولة هذا البنر في نفس المكان";
      } else if (error.status === 403) {
        description = "ليس لديك صلاحية لتنفيذ هذا الإجراء";
      } else if (error.status === 404) {
        description = "الربط غير موجود";
      }
      
      toast({
        variant: "destructive",
        title: "خطأ في التحديث",
        description,
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/ads/campaigns/${campaignId}/placements/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/campaigns", campaignId, "placements"] });
      toast({
        title: "تم حذف الربط بنجاح",
        description: "تم حذف الربط بنجاح",
      });
      setDeleteDialogOpen(false);
      setPlacementToDelete(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "خطأ في الحذف",
        description: error.message || "حدث خطأ أثناء حذف الربط",
      });
    },
  });

  const handleCreate = () => {
    setEditingPlacement(null);
    form.reset({
      creativeId: "",
      inventorySlotId: "",
      priority: 5,
      startDate: new Date(),
      endDate: null,
      status: "scheduled",
    });
    setDialogOpen(true);
  };

  const handleEdit = (placement: Placement) => {
    setEditingPlacement(placement);
    form.reset({
      creativeId: placement.creativeId,
      inventorySlotId: placement.inventorySlotId,
      priority: placement.priority,
      startDate: new Date(placement.startDate),
      endDate: placement.endDate ? new Date(placement.endDate) : null,
      status: placement.status === "expired" ? "paused" : placement.status,
    });
    setDialogOpen(true);
  };

  const handleDelete = (placement: Placement) => {
    setPlacementToDelete(placement);
    setDeleteDialogOpen(true);
  };

  const onSubmit = (values: FormValues) => {
    if (editingPlacement) {
      updateMutation.mutate({ id: editingPlacement.id, values });
    } else {
      createMutation.mutate(values);
    }
  };

  if (!campaignId) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>خطأ</AlertTitle>
            <AlertDescription>معرف الحملة غير صحيح</AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">إدارة أماكن العرض</h1>
            <p className="text-muted-foreground mt-1">
              ربط البنرات بأماكن العرض وإدارة الجدولة
            </p>
          </div>
          {isAdmin && (
            <Button
              onClick={handleCreate}
              data-testid="button-create-placement"
            >
              <Plus className="h-4 w-4 ml-2" />
              إضافة ربط جديد
            </Button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الروابط</CardTitle>
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-placements">
                {totalPlacements}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                عدد الروابط الكلي
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">الروابط النشطة</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-active-placements">
                {activePlacements}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                الروابط التي يتم عرضها حالياً
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">الروابط المجدولة</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-scheduled-placements">
                {scheduledPlacements}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                في انتظار وقت العرض
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        {placements.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث عن البنر أو مكان العرض..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
                data-testid="input-search"
              />
            </div>
          </div>
        )}

        {/* Placements Table */}
        {isLoadingPlacements ? (
          <TableSkeleton />
        ) : placements.length === 0 ? (
          <EmptyState onCreateClick={handleCreate} />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>البنر</TableHead>
                  <TableHead>مكان العرض</TableHead>
                  <TableHead>الأولوية</TableHead>
                  <TableHead>الجدولة</TableHead>
                  <TableHead>الحالة</TableHead>
                  {isAdmin && <TableHead className="text-left">الإجراءات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlacements.map((placement) => (
                  <TableRow key={placement.id} data-testid={`row-placement-${placement.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {placement.creative?.type === "image" ? (
                          <div className="relative h-12 w-12 rounded overflow-hidden bg-muted">
                            <img 
                              src={placement.creative.content} 
                              alt={placement.creative.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : placement.creative?.type === "video" ? (
                          <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                            <Video className="h-6 w-6 text-muted-foreground" />
                          </div>
                        ) : (
                          <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                            <Code className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium">{placement.creative?.name || "غير معروف"}</div>
                          <div className="text-sm text-muted-foreground">
                            {placement.creative?.size || "N/A"}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{placement.inventorySlot?.name || "غير معروف"}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {locationLabels[placement.inventorySlot?.location || ""] || placement.inventorySlot?.location}
                          <span className="mx-1">•</span>
                          {placement.inventorySlot?.size || "N/A"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{placement.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{format(new Date(placement.startDate), "dd MMM yyyy", { locale: arSA })}</div>
                        {placement.endDate && (
                          <div className="text-muted-foreground">
                            {format(new Date(placement.endDate), "dd MMM yyyy", { locale: arSA })}
                          </div>
                        )}
                        {!placement.endDate && (
                          <div className="text-muted-foreground">بلا نهاية</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColors[placement.status]}>
                        {statusLabels[placement.status]}
                      </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-left">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(placement)}
                            data-testid={`button-edit-placement-${placement.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(placement)}
                            data-testid={`button-delete-placement-${placement.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingPlacement ? "تعديل الربط" : "إنشاء ربط جديد"}
              </DialogTitle>
              <DialogDescription>
                {editingPlacement 
                  ? "قم بتعديل معلومات الربط بين البنر ومكان العرض"
                  : "قم بربط البنر بمكان العرض وتحديد الجدولة والأولوية"}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Creative Selection */}
                <FormField
                  control={form.control}
                  name="creativeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>البنر *</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isLoadingCreatives}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-creative">
                            <SelectValue placeholder="اختر البنر" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {creatives.map((creative) => (
                            <SelectItem key={creative.id} value={creative.id}>
                              <div className="flex items-center gap-2">
                                {creative.type === "image" && <ImageIcon className="h-4 w-4" />}
                                {creative.type === "video" && <Video className="h-4 w-4" />}
                                {creative.type === "html" && <Code className="h-4 w-4" />}
                                <span>{creative.name}</span>
                                <span className="text-muted-foreground">({creative.size})</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        اختر البنر الذي تريد عرضه
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Inventory Slot Selection */}
                <FormField
                  control={form.control}
                  name="inventorySlotId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>مكان العرض *</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isLoadingSlots}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-slot">
                            <SelectValue placeholder="اختر مكان العرض" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {slots.map((slot) => (
                            <SelectItem key={slot.id} value={slot.id}>
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                <span>{slot.name}</span>
                                <span className="text-muted-foreground">
                                  ({locationLabels[slot.location]} - {slot.size})
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        اختر مكان العرض في الموقع
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Size Mismatch Warning */}
                {hasSizeMismatch && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>تحذير</AlertTitle>
                    <AlertDescription>
                      حجم البنر ({selectedCreative?.size}) لا يتطابق مع حجم مكان العرض ({selectedSlot?.size})
                    </AlertDescription>
                  </Alert>
                )}

                {/* Priority */}
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الأولوية (1-10) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          {...field}
                          data-testid="input-priority"
                        />
                      </FormControl>
                      <FormDescription>
                        الأولوية عند عرض البنرات (10 = أعلى أولوية)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Start Date */}
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>تاريخ البداية *</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-right font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="input-start-date"
                            >
                              <CalendarIcon className="ml-2 h-4 w-4" />
                              {field.value ? (
                                format(field.value, "PPP", { locale: arSA })
                              ) : (
                                <span>اختر التاريخ</span>
                              )}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        تاريخ بداية عرض البنر
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* End Date */}
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>تاريخ النهاية (اختياري)</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-right font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="input-end-date"
                            >
                              <CalendarIcon className="ml-2 h-4 w-4" />
                              {field.value ? (
                                format(field.value, "PPP", { locale: arSA })
                              ) : (
                                <span>بلا نهاية</span>
                              )}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value || undefined}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        اترك فارغاً للعرض بلا نهاية
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Status */}
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الحالة *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="scheduled">مجدول</SelectItem>
                          <SelectItem value="active">نشط</SelectItem>
                          <SelectItem value="paused">متوقف</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        حالة العرض الحالية
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    إلغاء
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-save-placement"
                  >
                    {(createMutation.isPending || updateMutation.isPending) ? "جاري الحفظ..." : "حفظ"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>هل أنت متأكد من حذف هذا الربط؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم حذف الربط بين البنر ومكان العرض. لن يتم حذف البنر نفسه.
                هذا الإجراء لا يمكن التراجع عنه.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => placementToDelete && deleteMutation.mutate(placementToDelete.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
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
