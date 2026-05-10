import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  ArrowLeft,
  Play, 
  Pause, 
  CheckCircle, 
  Trash2,
  Plus,
  Edit,
  Users,
  MousePointerClick,
  TrendingUp,
  Trophy
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const variantSchema = z.object({
  name: z.string().min(1, "الاسم مطلوب"),
  isControl: z.boolean(),
  trafficAllocation: z.number().min(0).max(100),
  variantData: z.object({
    headline: z.string().optional(),
    imageUrl: z.string().optional(),
    excerpt: z.string().optional(),
    ctaText: z.string().optional(),
    layout: z.string().optional(),
  }),
});

type VariantFormValues = z.infer<typeof variantSchema>;

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D"];

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { color: string; label: string }> = {
    draft: { color: "bg-gray-500", label: "مسودة" },
    running: { color: "bg-green-500", label: "قيد التشغيل" },
    paused: { color: "bg-yellow-500", label: "متوقف" },
    completed: { color: "bg-blue-500", label: "مكتمل" },
  };

  const variant = variants[status] || variants.draft;

  return (
    <Badge className={`${variant.color} text-white`} data-testid={`badge-status-${status}`}>
      {variant.label}
    </Badge>
  );
}

export default function ABTestDetail() {
  const { toast } = useToast();
  const [, params] = useRoute("/dashboard/ab-tests/:id");
  const experimentId = params?.id;

  const [addVariantOpen, setAddVariantOpen] = useState(false);
  const [editVariantOpen, setEditVariantOpen] = useState(false);
  const [variantToEdit, setVariantToEdit] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: "experiment" | "variant"; id: string } | null>(null);

  const { data: experimentData, isLoading } = useQuery({
    queryKey: ["/api/ab-tests", experimentId],
    queryFn: () => fetch(`/api/ab-tests/${experimentId}`).then((res) => res.json()),
    enabled: !!experimentId,
  });

  const { data: analytics } = useQuery({
    queryKey: ["/api/ab-tests", experimentId, "analytics"],
    queryFn: () => fetch(`/api/ab-tests/${experimentId}/analytics`).then((res) => res.json()),
    enabled: !!experimentId,
  });

  const experiment = experimentData;
  const variants = experimentData?.variants || [];

  const startMutation = useMutation({
    mutationFn: () => apiRequest(`/api/ab-tests/${experimentId}/start`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ab-tests"] });
      toast({ title: "تم بدء التجربة" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => apiRequest(`/api/ab-tests/${experimentId}/pause`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ab-tests"] });
      toast({ title: "تم إيقاف التجربة مؤقتاً" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => apiRequest(`/api/ab-tests/${experimentId}/complete`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ab-tests"] });
      toast({ title: "تم إكمال التجربة" });
    },
  });

  const deleteExperimentMutation = useMutation({
    mutationFn: () => apiRequest(`/api/ab-tests/${experimentId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ab-tests"] });
      toast({ title: "تم حذف التجربة" });
      window.location.href = "/dashboard/ab-tests";
    },
  });

  const addVariantMutation = useMutation({
    mutationFn: (data: VariantFormValues) =>
      apiRequest("/api/ab-tests/variants", {
        method: "POST",
        body: JSON.stringify({ ...data, experimentId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ab-tests", experimentId] });
      toast({ title: "تم إضافة الخيار بنجاح" });
      setAddVariantOpen(false);
      addForm.reset();
    },
  });

  const updateVariantMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<VariantFormValues> }) =>
      apiRequest(`/api/ab-tests/variants/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ab-tests", experimentId] });
      toast({ title: "تم تحديث الخيار بنجاح" });
      setEditVariantOpen(false);
      setVariantToEdit(null);
    },
  });

  const deleteVariantMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/ab-tests/variants/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ab-tests", experimentId] });
      toast({ title: "تم حذف الخيار بنجاح" });
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    },
  });

  const addForm = useForm<VariantFormValues>({
    resolver: zodResolver(variantSchema),
    defaultValues: {
      name: "",
      isControl: false,
      trafficAllocation: 0,
      variantData: {},
    },
  });

  const editForm = useForm<VariantFormValues>({
    resolver: zodResolver(variantSchema),
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6" dir="rtl">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!experiment) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">التجربة غير موجودة</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const conversionRate =
    experiment.totalExposures > 0
      ? ((experiment.totalConversions / experiment.totalExposures) * 100).toFixed(2)
      : "0.00";

  const winnerVariant = variants.reduce((prev: any, current: any) =>
    current.conversionRate > (prev?.conversionRate || 0) ? current : prev
  , null);

  const chartData = analytics?.variants?.map((v: any) => ({
    name: v.variant.name,
    exposures: v.exposures,
    conversions: v.conversions,
    conversionRate: v.variant.conversionRate,
  })) || [];

  const pieData = variants.map((v: any) => ({
    name: v.name,
    value: v.trafficAllocation,
  }));

  const handleDelete = () => {
    if (!itemToDelete) return;

    if (itemToDelete.type === "experiment") {
      deleteExperimentMutation.mutate();
    } else {
      deleteVariantMutation.mutate(itemToDelete.id);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/ab-tests">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold" data-testid="text-experiment-name">{experiment.name}</h1>
              <StatusBadge status={experiment.status} />
            </div>
            {experiment.description && (
              <p className="text-muted-foreground mt-1" data-testid="text-experiment-description">
                {experiment.description}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {experiment.status === "draft" && (
              <Button
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
                data-testid="button-start-experiment"
              >
                <Play className="ml-2 h-4 w-4" />
                بدء التجربة
              </Button>
            )}

            {experiment.status === "running" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => pauseMutation.mutate()}
                  disabled={pauseMutation.isPending}
                  data-testid="button-pause-experiment"
                >
                  <Pause className="ml-2 h-4 w-4" />
                  إيقاف
                </Button>
                <Button
                  variant="outline"
                  onClick={() => completeMutation.mutate()}
                  disabled={completeMutation.isPending}
                  data-testid="button-complete-experiment"
                >
                  <CheckCircle className="ml-2 h-4 w-4" />
                  إكمال
                </Button>
              </>
            )}

            {experiment.status === "paused" && (
              <>
                <Button
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending}
                  data-testid="button-resume-experiment"
                >
                  <Play className="ml-2 h-4 w-4" />
                  استئناف
                </Button>
                <Button
                  variant="outline"
                  onClick={() => completeMutation.mutate()}
                  disabled={completeMutation.isPending}
                  data-testid="button-complete-experiment"
                >
                  <CheckCircle className="ml-2 h-4 w-4" />
                  إكمال
                </Button>
              </>
            )}

            {experiment.status === "draft" && (
              <Button
                variant="destructive"
                onClick={() => {
                  setItemToDelete({ type: "experiment", id: experimentId! });
                  setDeleteDialogOpen(true);
                }}
                data-testid="button-delete-experiment"
              >
                <Trash2 className="ml-2 h-4 w-4" />
                حذف
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                إجمالي المشاهدات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold" data-testid="text-total-exposures">
                {experiment.totalExposures.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MousePointerClick className="h-4 w-4 text-primary" />
                إجمالي التحويلات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold" data-testid="text-total-conversions">
                {experiment.totalConversions.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                معدل التحويل
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary" data-testid="text-conversion-rate">
                {conversionRate}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                الفائز
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold" data-testid="text-winner">
                {winnerVariant ? winnerVariant.name : "لا يوجد"}
              </p>
              {winnerVariant && (
                <p className="text-xs text-muted-foreground">
                  {winnerVariant.conversionRate.toFixed(2)}%
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>الخيارات (Variants)</CardTitle>
              {experiment.status === "draft" && (
                <Dialog open={addVariantOpen} onOpenChange={setAddVariantOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-add-variant">
                      <Plus className="ml-2 h-4 w-4" />
                      إضافة خيار
                    </Button>
                  </DialogTrigger>
                  <DialogContent dir="rtl">
                    <DialogHeader>
                      <DialogTitle>إضافة خيار جديد</DialogTitle>
                      <DialogDescription>
                        أضف خياراً جديداً للتجربة
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...addForm}>
                      <form onSubmit={addForm.handleSubmit((data) => addVariantMutation.mutate(data))} className="space-y-4">
                        <FormField
                          control={addForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>الاسم</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="مثال: C" data-testid="input-variant-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={addForm.control}
                            name="isControl"
                            render={({ field }) => (
                              <FormItem className="flex items-center gap-2 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-is-control"
                                  />
                                </FormControl>
                                <FormLabel className="cursor-pointer">خيار التحكم</FormLabel>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={addForm.control}
                            name="trafficAllocation"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>نسبة الزيارات (%)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    {...field}
                                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                                    data-testid="input-traffic-allocation"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {experiment.testType === "headline" && (
                          <FormField
                            control={addForm.control}
                            name="variantData.headline"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>العنوان الرئيسي</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="أدخل العنوان..." data-testid="input-headline" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {experiment.testType === "image" && (
                          <FormField
                            control={addForm.control}
                            name="variantData.imageUrl"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>رابط الصورة</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="https://..." data-testid="input-image-url" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {experiment.testType === "cta" && (
                          <FormField
                            control={addForm.control}
                            name="variantData.ctaText"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>نص زر الإجراء</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="اقرأ المزيد" data-testid="input-cta" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setAddVariantOpen(false)}>
                            إلغاء
                          </Button>
                          <Button type="submit" disabled={addVariantMutation.isPending} data-testid="button-submit-variant">
                            {addVariantMutation.isPending ? "جاري الإضافة..." : "إضافة"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">التحكم</TableHead>
                  <TableHead className="text-right">نسبة الزيارات</TableHead>
                  <TableHead className="text-right">المحتوى</TableHead>
                  <TableHead className="text-right">المشاهدات</TableHead>
                  <TableHead className="text-right">التحويلات</TableHead>
                  <TableHead className="text-right">معدل التحويل</TableHead>
                  {experiment.status === "draft" && <TableHead className="text-right">إجراءات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((variant: any) => (
                  <TableRow key={variant.id} data-testid={`row-variant-${variant.id}`}>
                    <TableCell className="font-medium" data-testid={`text-variant-name-${variant.id}`}>
                      {variant.name}
                    </TableCell>
                    <TableCell>
                      {variant.isControl && (
                        <Badge variant="outline" data-testid={`badge-control-${variant.id}`}>تحكم</Badge>
                      )}
                    </TableCell>
                    <TableCell data-testid={`text-traffic-${variant.id}`}>{variant.trafficAllocation}%</TableCell>
                    <TableCell className="max-w-xs truncate" data-testid={`text-data-${variant.id}`}>
                      {variant.variantData.headline || variant.variantData.imageUrl || variant.variantData.ctaText || "-"}
                    </TableCell>
                    <TableCell data-testid={`text-exposures-${variant.id}`}>{variant.exposures.toLocaleString()}</TableCell>
                    <TableCell data-testid={`text-conversions-${variant.id}`}>{variant.conversions.toLocaleString()}</TableCell>
                    <TableCell className="font-semibold text-primary" data-testid={`text-rate-${variant.id}`}>
                      {variant.conversionRate.toFixed(2)}%
                    </TableCell>
                    {experiment.status === "draft" && (
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setVariantToEdit(variant);
                              editForm.reset(variant);
                              setEditVariantOpen(true);
                            }}
                            data-testid={`button-edit-${variant.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {variants.length > 2 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setItemToDelete({ type: "variant", id: variant.id });
                                setDeleteDialogOpen(true);
                              }}
                              data-testid={`button-delete-${variant.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>التحليلات</CardTitle>
            <CardDescription>رسوم بيانية وإحصائيات مفصلة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold mb-4">معدل التحويل حسب الخيار</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="conversionRate" fill="#0088FE" name="معدل التحويل %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-4">توزيع الزيارات</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry: any) => `${entry.name}: ${entry.value}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-4">المشاهدات والتحويلات</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="exposures" fill="#0088FE" name="المشاهدات" />
                  <Bar dataKey="conversions" fill="#00C49F" name="التحويلات" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={editVariantOpen} onOpenChange={setEditVariantOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل الخيار</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((data) =>
                variantToEdit && updateVariantMutation.mutate({ id: variantToEdit.id, data })
              )}
              className="space-y-4"
            >
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الاسم</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="isControl"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-edit-control"
                        />
                      </FormControl>
                      <FormLabel className="cursor-pointer">خيار التحكم</FormLabel>
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="trafficAllocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>نسبة الزيارات (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                          data-testid="input-edit-traffic"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditVariantOpen(false)}>
                  إلغاء
                </Button>
                <Button type="submit" disabled={updateVariantMutation.isPending} data-testid="button-submit-edit">
                  {updateVariantMutation.isPending ? "جاري التحديث..." : "تحديث"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا العنصر؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} data-testid="button-confirm-delete">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
