// Smart Blocks Page v2.0 - Added carousel layout support
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Blocks, Plus, Edit, Trash2, Eye } from "lucide-react";
import type { SmartBlock, InsertSmartBlock } from "@shared/schema";
import { insertSmartBlockSchema } from "@shared/schema";

const placementOptions = [
  { value: 'below_featured', label: 'بعد البانر الرئيسي' },
  { value: 'above_all_news', label: 'قبل جميع الأخبار' },
  { value: 'between_all_and_murqap', label: 'بين الأخبار والمرقاب' },
  { value: 'above_footer', label: 'قبل التذييل' },
] as const;

const layoutStyleOptions = [
  { value: 'grid', label: 'شبكة (Grid) - 4 أعمدة' },
  { value: 'list', label: 'قائمة (List) - صور جانبية كبيرة' },
  { value: 'featured', label: 'مميز (Featured) - مقال كبير + مقالات صغيرة' },
  { value: 'carousel', label: 'كاروسيل (Carousel) - تمرير أفقي' },
] as const;

export default function SmartBlocksPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<SmartBlock | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const form = useForm<InsertSmartBlock>({
    resolver: zodResolver(insertSmartBlockSchema),
    defaultValues: {
      title: '',
      keyword: '',
      color: '#3B82F6',
      backgroundColor: '',
      placement: 'below_featured',
      layoutStyle: 'grid',
      limitCount: 6,
      isActive: true,
    },
  });

  const { data: blocksRaw, isLoading } = useQuery<SmartBlock[]>({
    queryKey: ['/api/smart-blocks'],
    queryFn: async () => {
      const res = await fetch('/api/smart-blocks', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch blocks');
      return await res.json();
    },
  });
  const blocks = Array.isArray(blocksRaw) ? blocksRaw : [];

  const createMutation = useMutation({
    mutationFn: async (data: InsertSmartBlock) => {
      return await apiRequest('/api/smart-blocks', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/smart-blocks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/smart-blocks/query/articles'], exact: false });
      toast({
        title: "تم الإنشاء",
        description: "تم إنشاء البلوك الذكي بنجاح",
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل إنشاء البلوك الذكي",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertSmartBlock }) => {
      return await apiRequest(`/api/smart-blocks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/smart-blocks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/smart-blocks/query/articles'], exact: false });
      toast({
        title: "تم التحديث",
        description: "تم تحديث البلوك الذكي بنجاح",
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل تحديث البلوك الذكي",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/smart-blocks/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/smart-blocks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/smart-blocks/query/articles'], exact: false });
      toast({
        title: "تم الحذف",
        description: "تم حذف البلوك الذكي بنجاح",
      });
      setDeleteId(null);
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل حذف البلوك الذكي",
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return await apiRequest(`/api/smart-blocks/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/smart-blocks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/smart-blocks/query/articles'], exact: false });
      toast({
        title: variables.isActive ? "تم التفعيل" : "تم التعطيل",
        description: variables.isActive 
          ? "تم تفعيل البلوك الذكي بنجاح" 
          : "تم تعطيل البلوك الذكي بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل تحديث حالة البلوك الذكي",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: InsertSmartBlock) => {
    if (editingBlock) {
      updateMutation.mutate({ id: editingBlock.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (block: SmartBlock) => {
    setEditingBlock(block);
    form.reset({
      title: block.title,
      keyword: block.keyword,
      color: block.color,
      backgroundColor: block.backgroundColor || '',
      placement: block.placement as any,
      layoutStyle: block.layoutStyle as any,
      limitCount: block.limitCount,
      isActive: block.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingBlock(null);
    form.reset({
      title: '',
      keyword: '',
      color: '#3B82F6',
      backgroundColor: '',
      placement: 'below_featured',
      layoutStyle: 'grid',
      limitCount: 6,
      isActive: true,
    });
  };

  const getPlacementLabel = (placement: string) => {
    return placementOptions.find(opt => opt.value === placement)?.label || placement;
  };

  const getLayoutStyleLabel = (layoutStyle: string) => {
    return layoutStyleOptions.find(opt => opt.value === layoutStyle)?.label || layoutStyle;
  };

  const formValues = form.watch();

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={Blocks}
          title="البلوكات الذكية"
          description="إدارة البلوكات الذكية لعرض محتوى مخصص في الصفحة الرئيسية"
          titleTestId="heading-smart-blocks"
          actions={<Button
            onClick={() => {
              setEditingBlock(null);
              form.reset({
                title: '',
                keyword: '',
                color: '#3B82F6',
                backgroundColor: '',
                placement: 'below_featured',
                layoutStyle: 'grid',
                limitCount: 6,
                isActive: true,
              });
              setIsDialogOpen(true);
            }}
            data-testid="button-create-smart-block"
          >
            <Plus className="h-4 w-4 ml-2" />
            إنشاء بلوك جديد
          </Button>}
        />

        {/* Stats Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card data-testid="card-stat-total">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                إجمالي البلوكات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-total">{blocks.length}</div>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-active">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                البلوكات النشطة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-stat-active">
                {blocks.filter(b => b.isActive).length}
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-inactive">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                البلوكات غير النشطة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground" data-testid="text-stat-inactive">
                {blocks.filter(b => !b.isActive).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Blocks Table */}
        <Card>
          <CardHeader>
            <CardTitle>جميع البلوكات</CardTitle>
            <CardDescription>
              عرض وإدارة جميع البلوكات الذكية في النظام
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                جاري التحميل...
              </div>
            ) : blocks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Blocks className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>لا توجد بلوكات ذكية حتى الآن</p>
                <p className="text-sm">انقر على "إنشاء بلوك جديد" للبدء</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">اللون</TableHead>
                      <TableHead className="text-right">الخلفية</TableHead>
                      <TableHead className="text-right">العنوان</TableHead>
                      <TableHead className="text-right">الكلمة المفتاحية</TableHead>
                      <TableHead className="text-right">الموضع</TableHead>
                      <TableHead className="text-right">الشكل</TableHead>
                      <TableHead className="text-right">العدد</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blocks.map((block) => (
                      <TableRow key={block.id} data-testid={`row-block-${block.id}`}>
                        <TableCell>
                          <div
                            className="w-8 h-8 rounded-full border-2 border-white shadow-sm"
                            style={{ backgroundColor: block.color }}
                            data-testid={`color-preview-${block.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          {block.backgroundColor ? (
                            <div
                              className="w-8 h-8 rounded border-2 border-gray-300 shadow-sm"
                              style={{ backgroundColor: block.backgroundColor }}
                              data-testid={`bg-color-preview-${block.id}`}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium" data-testid={`text-title-${block.id}`}>
                          {block.title}
                        </TableCell>
                        <TableCell data-testid={`text-keyword-${block.id}`}>
                          <Badge variant="outline">{block.keyword}</Badge>
                        </TableCell>
                        <TableCell data-testid={`text-placement-${block.id}`}>
                          {getPlacementLabel(block.placement)}
                        </TableCell>
                        <TableCell data-testid={`text-layout-${block.id}`}>
                          <Badge variant="secondary">{getLayoutStyleLabel(block.layoutStyle || 'grid')}</Badge>
                        </TableCell>
                        <TableCell data-testid={`text-limit-${block.id}`}>
                          {block.limitCount}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={block.isActive}
                              onCheckedChange={(checked) => {
                                toggleActiveMutation.mutate({ 
                                  id: block.id, 
                                  isActive: checked 
                                });
                              }}
                              disabled={toggleActiveMutation.isPending}
                              data-testid={`switch-status-${block.id}`}
                            />
                            <span className={`text-sm ${block.isActive ? 'text-green-600' : 'text-muted-foreground'}`}>
                              {block.isActive ? 'نشط' : 'معطل'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEdit(block)}
                              data-testid={`button-edit-block-${block.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteId(block.id)}
                              data-testid={`button-delete-block-${block.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
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
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle data-testid="dialog-title">
                {editingBlock ? 'تعديل البلوك الذكي' : 'إنشاء بلوك ذكي جديد'}
              </DialogTitle>
              <DialogDescription>
                {editingBlock 
                  ? 'قم بتعديل معلومات البلوك الذكي'
                  : 'أنشئ بلوك ذكي جديد لعرض محتوى مخصص'}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                {/* Title */}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>العنوان (60 حرف كحد أقصى)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="مثال: أخبار التقنية"
                          maxLength={60}
                          data-testid="input-block-title"
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        {field.value?.length || 0} / 60
                      </p>
                    </FormItem>
                  )}
                />

                {/* Keyword */}
                <FormField
                  control={form.control}
                  name="keyword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الكلمة المفتاحية (100 حرف كحد أقصى)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="مثال: تقنية، ذكاء اصطناعي، برمجة"
                          maxLength={100}
                          data-testid="input-block-keyword"
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        {field.value?.length || 0} / 100
                      </p>
                    </FormItem>
                  )}
                />

                {/* Color */}
                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>اللون (HEX)</FormLabel>
                      <FormControl>
                        <div className="flex gap-3 items-center">
                          <Input
                            type="color"
                            value={field.value}
                            onChange={field.onChange}
                            className="w-20 h-10 cursor-pointer"
                            data-testid="input-block-color"
                          />
                          <Input
                            value={field.value}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                                field.onChange(val);
                              }
                            }}
                            placeholder="#3B82F6"
                            maxLength={7}
                            className="flex-1"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Background Color */}
                <FormField
                  control={form.control}
                  name="backgroundColor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>لون الخلفية (اختياري)</FormLabel>
                      <FormControl>
                        <div className="flex gap-3 items-center">
                          <Input
                            type="color"
                            value={field.value || '#ffffff'}
                            onChange={field.onChange}
                            className="w-20 h-10 cursor-pointer"
                            data-testid="input-block-background-color"
                          />
                          <Input
                            value={field.value || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                                field.onChange(val);
                              }
                            }}
                            placeholder="اتركه فارغاً لعدم استخدام خلفية"
                            maxLength={7}
                            className="flex-1"
                          />
                          {field.value && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => field.onChange('')}
                              data-testid="button-clear-background-color"
                            >
                              مسح
                            </Button>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        لون الخلفية الكاملة للبلوك (اختياري) - سيمتد على عرض الصفحة بالكامل
                      </p>
                    </FormItem>
                  )}
                />

                {/* Placement */}
                <FormField
                  control={form.control}
                  name="placement"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الموضع في الصفحة الرئيسية</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-block-placement">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {placementOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Layout Style */}
                <FormField
                  control={form.control}
                  name="layoutStyle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>شكل عرض الأخبار</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-block-layout-style">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {layoutStyleOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        {field.value === 'grid' && 'عرض الأخبار في شبكة 4 أعمدة (مناسب لعرض عدة أخبار)'}
                        {field.value === 'list' && 'عرض الأخبار في قائمة عمودية مع صور كبيرة (مناسب للقراءة السريعة)'}
                        {field.value === 'featured' && 'خبر مميز كبير + أخبار صغيرة (مناسب لتسليط الضوء على خبر واحد)'}
                        {field.value === 'carousel' && 'تمرير أفقي للأخبار مثل "مقترحة لك" (مناسب للتوصيات الشخصية)'}
                      </p>
                    </FormItem>
                  )}
                />

                {/* Limit Count */}
                <FormField
                  control={form.control}
                  name="limitCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>عدد المقالات ({field.value || 6})</FormLabel>
                      <FormControl>
                        <Slider
                          min={1}
                          max={24}
                          step={1}
                          value={[field.value || 6]}
                          onValueChange={([value]) => field.onChange(value)}
                          data-testid="slider-block-limit"
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        سيتم عرض {field.value || 6} مقالات في هذا البلوك
                      </p>
                    </FormItem>
                  )}
                />

                {/* Is Active */}
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>تفعيل البلوك</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-block-active"
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Preview */}
                <div className="border rounded-lg p-4 space-y-3 bg-muted/50">
                  <p className="text-sm font-medium">معاينة مباشرة:</p>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: formValues.color }}
                    />
                    <h3 
                      className="text-xl font-bold" 
                      style={{ color: formValues.color }}
                      data-testid="preview-title"
                    >
                      {formValues.title || 'عنوان البلوك'}
                    </h3>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>الكلمة المفتاحية: {formValues.keyword || 'غير محدد'}</p>
                    <p>الموضع: {getPlacementLabel(formValues.placement || 'below_featured')}</p>
                    <p>الشكل: {getLayoutStyleLabel(formValues.layoutStyle || 'grid')}</p>
                    <p>عدد المقالات: {formValues.limitCount}</p>
                    <p>الحالة: {formValues.isActive ? 'نشط' : 'غير نشط'}</p>
                  </div>
                </div>

                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleCloseDialog} 
                    data-testid="button-cancel-smart-block"
                  >
                    إلغاء
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit-smart-block"
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? 'جاري الحفظ...'
                      : editingBlock
                      ? 'تحديث'
                      : 'إنشاء'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف هذا البلوك الذكي؟ لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
