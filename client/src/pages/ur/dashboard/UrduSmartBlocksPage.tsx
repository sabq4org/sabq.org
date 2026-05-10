import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UrduDashboardLayout } from "@/components/ur/UrduDashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Blocks, Plus, Edit, Trash2 } from "lucide-react";
import type { UrSmartBlock, InsertUrSmartBlock } from "@shared/schema";
import { insertUrSmartBlockSchema } from "@shared/schema";

const placementOptions = [
  { value: 'below_featured', label: 'مین بینر کے نیچے' },
  { value: 'above_all_news', label: 'تمام خبروں سے اوپر' },
  { value: 'between_all_and_murqap', label: 'خبروں اور مرقاب کے درمیان' },
  { value: 'above_footer', label: 'فوٹر سے اوپر' },
] as const;

const layoutStyleOptions = [
  { value: 'grid', label: 'گرڈ - 4 کالم' },
  { value: 'list', label: 'فہرست - بڑی سائیڈ تصاویر' },
  { value: 'featured', label: 'نمایاں - بڑا + چھوٹے مضامین' },
] as const;

export default function UrduSmartBlocksPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<UrSmartBlock | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const form = useForm<InsertUrSmartBlock>({
    resolver: zodResolver(insertUrSmartBlockSchema),
    defaultValues: {
      title: '',
      keyword: '',
      color: '#3B82F6',
      placement: 'below_featured',
      layoutStyle: 'grid',
      limitCount: 6,
      isActive: true,
    },
  });

  const { data: blocksRaw, isLoading } = useQuery<UrSmartBlock[]>({
    queryKey: ['/api/ur/smart-blocks'],
  });
  const blocks = Array.isArray(blocksRaw) ? blocksRaw : [];

  const createMutation = useMutation({
    mutationFn: async (data: InsertUrSmartBlock) => {
      return await apiRequest('/api/ur/smart-blocks', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ur/smart-blocks'] });
      toast({
        title: "بنایا گیا",
        description: "سمارٹ بلاک کامیابی سے بنایا گیا",
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "خرابی",
        description: "سمارٹ بلاک بنانے میں ناکامی",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertUrSmartBlock }) => {
      return await apiRequest(`/api/ur/smart-blocks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ur/smart-blocks'] });
      toast({
        title: "اپ ڈیٹ کیا گیا",
        description: "سمارٹ بلاک کامیابی سے اپ ڈیٹ کیا گیا",
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "خرابی",
        description: "سمارٹ بلاک اپ ڈیٹ کرنے میں ناکامی",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/ur/smart-blocks/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ur/smart-blocks'] });
      toast({
        title: "حذف کیا گیا",
        description: "سمارٹ بلاک کامیابی سے حذف کیا گیا",
      });
      setDeleteId(null);
    },
    onError: () => {
      toast({
        title: "خرابی",
        description: "سمارٹ بلاک حذف کرنے میں ناکامی",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: InsertUrSmartBlock) => {
    if (editingBlock) {
      updateMutation.mutate({ id: editingBlock.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (block: UrSmartBlock) => {
    setEditingBlock(block);
    form.reset({
      title: block.title,
      keyword: block.keyword,
      color: block.color,
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
    <UrduDashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Blocks className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold" data-testid="heading-smart-blocks">
                سمارٹ بلاکس
              </h1>
            </div>
            <p className="text-muted-foreground mt-2">
              ہوم پیج پر حسب ضرورت مواد دکھانے کے لیے سمارٹ بلاکس کا نظم کریں
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingBlock(null);
              form.reset({
                title: '',
                keyword: '',
                color: '#3B82F6',
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
            نیا بلاک بنائیں
          </Button>
        </div>

        {/* Stats Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card data-testid="card-stat-total">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                کل بلاکس
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-total">{blocks.length}</div>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-active">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                فعال بلاکس
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
                غیر فعال بلاکس
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
            <CardTitle>تمام بلاکس</CardTitle>
            <CardDescription>
              سسٹم میں تمام سمارٹ بلاکس دیکھیں اور ان کا نظم کریں
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                لوڈ ہو رہا ہے...
              </div>
            ) : blocks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Blocks className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>ابھی تک کوئی سمارٹ بلاکس نہیں</p>
                <p className="text-sm">شروع کرنے کے لیے "نیا بلاک بنائیں" پر کلک کریں</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>رنگ</TableHead>
                      <TableHead>عنوان</TableHead>
                      <TableHead>مطلوبہ لفظ</TableHead>
                      <TableHead>مقام</TableHead>
                      <TableHead>لے آؤٹ</TableHead>
                      <TableHead>تعداد</TableHead>
                      <TableHead>حالت</TableHead>
                      <TableHead>اعمال</TableHead>
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
                          <Badge 
                            variant={block.isActive ? "default" : "secondary"}
                            data-testid={`badge-status-${block.id}`}
                          >
                            {block.isActive ? 'فعال' : 'غیر فعال'}
                          </Badge>
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle data-testid="dialog-title">
                {editingBlock ? 'سمارٹ بلاک میں ترمیم کریں' : 'نیا سمارٹ بلاک بنائیں'}
              </DialogTitle>
              <DialogDescription>
                {editingBlock 
                  ? 'سمارٹ بلاک کی معلومات اپ ڈیٹ کریں'
                  : 'حسب ضرورت مواد دکھانے کے لیے نیا سمارٹ بلاک بنائیں'}
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
                      <FormLabel>عنوان (زیادہ سے زیادہ 60 حروف)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="مثال: ٹیکنالوجی نیوز"
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
                      <FormLabel>مطلوبہ لفظ (زیادہ سے زیادہ 100 حروف)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="مثال: ٹیکنالوجی، AI، پروگرامنگ"
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
                      <FormLabel>رنگ (HEX)</FormLabel>
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
                            data-testid="input-block-color-hex"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Placement */}
                <FormField
                  control={form.control}
                  name="placement"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ہوم پیج پر مقام</FormLabel>
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
                      <FormLabel>لے آؤٹ انداز</FormLabel>
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
                        {field.value === 'grid' && 'مضامین کو 4 کالم گرڈ میں دکھائیں (متعدد مضامین دکھانے کے لیے موزوں)'}
                        {field.value === 'list' && 'مضامین کو بڑی تصاویر کے ساتھ عمودی فہرست میں دکھائیں (تیزی سے پڑھنے کے لیے موزوں)'}
                        {field.value === 'featured' && 'بڑا نمایاں مضمون + چھوٹے مضامین (ایک مضمون کو نمایاں کرنے کے لیے موزوں)'}
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
                      <FormLabel>مضامین کی تعداد ({field.value || 6})</FormLabel>
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
                        اس بلاک میں {field.value || 6} مضامین دکھائے جائیں گے
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
                        <FormLabel>بلاک فعال کریں</FormLabel>
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
                  <p className="text-sm font-medium">لائیو پیش نظارہ:</p>
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
                      {formValues.title || 'بلاک کا عنوان'}
                    </h3>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>مطلوبہ لفظ: {formValues.keyword || 'متعین نہیں'}</p>
                    <p>مقام: {getPlacementLabel(formValues.placement || 'below_featured')}</p>
                    <p>لے آؤٹ: {getLayoutStyleLabel(formValues.layoutStyle || 'grid')}</p>
                    <p>مضامین کی تعداد: {formValues.limitCount}</p>
                    <p>حالت: {formValues.isActive ? 'فعال' : 'غیر فعال'}</p>
                  </div>
                </div>

                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleCloseDialog} 
                    data-testid="button-cancel-smart-block"
                  >
                    منسوخ کریں
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit-smart-block"
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? 'محفوظ ہو رہا ہے...'
                      : editingBlock
                      ? 'اپ ڈیٹ کریں'
                      : 'بنائیں'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>حذف کی تصدیق</AlertDialogTitle>
              <AlertDialogDescription>
                کیا آپ واقعی اس سمارٹ بلاک کو حذف کرنا چاہتے ہیں؟ یہ عمل واپس نہیں ہو سکتا۔
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">منسوخ کریں</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                حذف کریں
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </UrduDashboardLayout>
  );
}
