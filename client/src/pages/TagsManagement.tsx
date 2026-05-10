import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Tag as TagIcon,
  PlusCircle,
  Edit,
  Trash2,
  Search,
  Loader2,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  ChevronsRight,
  ChevronsLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import type { Tag } from "@shared/schema";
import { insertTagSchema } from "@shared/schema";
import { Link } from "wouter";

// Form schema for client-side validation
const tagFormSchema = insertTagSchema.extend({
  nameAr: z.string().min(2, "الاسم العربي يجب أن يكون حرفين على الأقل"),
  nameEn: z.string().min(2, "الاسم الإنجليزي يجب أن يكون حرفين على الأقل"),
  slug: z.string().optional(),
  description: z.string().optional().or(z.literal("")),
  color: z.string().optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]),
});

type TagFormValues = z.infer<typeof tagFormSchema>;

export default function TagsManagement() {
  const { toast } = useToast();

  // State for dialogs and filters
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Form
  const form = useForm<TagFormValues>({
    resolver: zodResolver(tagFormSchema),
    defaultValues: {
      nameAr: "",
      nameEn: "",
      slug: "",
      description: "",
      color: "#3b82f6",
      status: "active",
    },
  });

  // Auto-generate slug from nameEn
  const watchNameEn = form.watch("nameEn");
  
  // Generate slug when nameEn changes (only if slug is empty or matches auto-generated pattern)
  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };

  // Fetch tags
  const { data: tagsRaw, isLoading } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });
  const tags = Array.isArray(tagsRaw) ? tagsRaw : [];

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: TagFormValues) => {
      // Auto-generate slug if not provided
      const slug = data.slug || generateSlug(data.nameEn);
      return await apiRequest("/api/tags", {
        method: "POST",
        body: JSON.stringify({ ...data, slug }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: "تم إنشاء الوسم",
        description: "تم إضافة الوسم بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إنشاء الوسم",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TagFormValues> }) => {
      return await apiRequest(`/api/tags/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setEditingTag(null);
      form.reset();
      toast({
        title: "تم تحديث الوسم",
        description: "تم تحديث الوسم بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الوسم",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/tags/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setDeletingTag(null);
      toast({
        title: "تم حذف الوسم",
        description: "تم حذف الوسم بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف الوسم",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    form.reset({
      nameAr: tag.nameAr,
      nameEn: tag.nameEn,
      slug: tag.slug,
      description: tag.description || "",
      color: tag.color || "#3b82f6",
      status: (tag.status || "active") as "active" | "inactive",
    });
  };

  const onSubmit = (data: TagFormValues) => {
    if (editingTag) {
      updateMutation.mutate({ id: editingTag.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Filter tags
  const filteredTags = tags.filter((tag) => {
    const matchesSearch = searchQuery
      ? tag.nameAr.includes(searchQuery) ||
        tag.nameEn.includes(searchQuery) ||
        tag.slug.includes(searchQuery)
      : true;
    
    const matchesStatus = statusFilter === "all" || tag.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredTags.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTags = filteredTags.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2">
                  <TagIcon className="h-5 w-5" />
                  إدارة الوسوم ({filteredTags.length})
                </CardTitle>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pr-10 w-48"
                    data-testid="input-search-tags"
                  />
                </div>
                <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                  <SelectTrigger className="w-32" data-testid="select-filter-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="inactive">معطل</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => {
                    setIsCreateDialogOpen(true);
                    form.reset();
                  }}
                  className="gap-2"
                  data-testid="button-add-tag"
                >
                  <PlusCircle className="h-4 w-4" />
                  إضافة وسم جديد
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                    <Skeleton className="h-12 w-12 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredTags.length > 0 ? (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right p-3 font-semibold">الاسم العربي</th>
                        <th className="text-right p-3 font-semibold">الاسم الإنجليزي</th>
                        <th className="text-right p-3 font-semibold">Slug</th>
                        <th className="text-right p-3 font-semibold">اللون</th>
                        <th className="text-right p-3 font-semibold">الاستخدامات</th>
                        <th className="text-right p-3 font-semibold">الحالة</th>
                        <th className="text-right p-3 font-semibold">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTags.map((tag) => (
                      <tr key={tag.id} className="border-b hover-elevate transition-all" data-testid={`tag-row-${tag.id}`}>
                        <td className="p-3" data-testid={`tag-name-ar-${tag.id}`}>
                          <span className="font-medium">{tag.nameAr}</span>
                        </td>
                        <td className="p-3 text-muted-foreground" data-testid={`tag-name-en-${tag.id}`}>
                          {tag.nameEn}
                        </td>
                        <td className="p-3">
                          <code className="text-xs bg-muted px-2 py-1 rounded" data-testid={`tag-slug-${tag.id}`}>
                            {tag.slug}
                          </code>
                        </td>
                        <td className="p-3">
                          {tag.color && (
                            <Badge
                              style={{
                                backgroundColor: tag.color,
                                color: "#ffffff",
                              }}
                              data-testid={`tag-color-${tag.id}`}
                            >
                              {tag.color}
                            </Badge>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium" data-testid={`tag-usage-${tag.id}`}>
                              {tag.usageCount}
                            </span>
                            {tag.usageCount > 0 && (
                              <Link href={`/dashboard/tags/${tag.id}/articles`}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  data-testid={`button-view-articles-${tag.id}`}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              </Link>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={tag.status === "active" ? "default" : "secondary"}
                            data-testid={`tag-status-${tag.id}`}
                          >
                            {tag.status === "active" ? "نشط" : "معطل"}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(tag)}
                              data-testid={`button-edit-tag-${tag.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingTag(tag)}
                              data-testid={`button-delete-tag-${tag.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>عرض</span>
                      <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                        <SelectTrigger className="w-20 h-8" data-testid="select-items-per-page">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                      <span>من أصل {filteredTags.length} وسم</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        data-testid="button-first-page"
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      
                      <div className="flex items-center gap-1 mx-2">
                        <span className="text-sm text-muted-foreground">صفحة</span>
                        <span className="text-sm font-medium">{currentPage}</span>
                        <span className="text-sm text-muted-foreground">من</span>
                        <span className="text-sm font-medium">{totalPages}</span>
                      </div>

                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        data-testid="button-next-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        data-testid="button-last-page"
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery || statusFilter !== "all" ? "لا توجد نتائج" : "لا توجد وسوم"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog
        open={isCreateDialogOpen || !!editingTag}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingTag(null);
            form.reset();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTag ? "تعديل الوسم" : "إضافة وسم جديد"}
            </DialogTitle>
            <DialogDescription>
              {editingTag ? "تعديل بيانات الوسم" : "أضف وسماً جديداً للمقالات"}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nameAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم بالعربية *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-tag-name-ar" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nameEn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم بالإنجليزية *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            // Auto-generate slug if it's empty or not manually edited
                            const currentSlug = form.getValues("slug");
                            if (!currentSlug || currentSlug === generateSlug(watchNameEn)) {
                              form.setValue("slug", generateSlug(e.target.value));
                            }
                          }}
                          data-testid="input-tag-name-en"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>المعرف (Slug)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ""}
                        placeholder="يتم توليده تلقائياً"
                        data-testid="input-tag-slug"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الوصف</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value || ""}
                        rows={3}
                        data-testid="input-tag-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>اللون</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            type="color"
                            {...field}
                            value={field.value || "#3b82f6"}
                            className="h-10 w-20 p-1 cursor-pointer"
                            data-testid="input-tag-color"
                          />
                        </FormControl>
                        <Input
                          value={field.value || "#3b82f6"}
                          onChange={(e) => field.onChange(e.target.value)}
                          placeholder="#3b82f6"
                          className="flex-1"
                        />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الحالة</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-tag-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">نشط</SelectItem>
                          <SelectItem value="inactive">معطل</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    setEditingTag(null);
                    form.reset();
                  }}
                  data-testid="button-cancel-tag"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-tag"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingTag ? "تحديث" : "حفظ"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingTag}
        onOpenChange={(open) => {
          if (!open) setDeletingTag(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الوسم "{deletingTag?.nameAr}" نهائياً. هذا الإجراء لا يمكن التراجع عنه.
              {deletingTag && deletingTag.usageCount > 0 && (
                <span className="block mt-2 text-destructive font-semibold">
                  تحذير: هذا الوسم مستخدم في {deletingTag.usageCount} مقال
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingTag && deleteMutation.mutate(deletingTag.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
