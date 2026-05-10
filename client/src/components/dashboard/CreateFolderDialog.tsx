import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { MediaFolder } from "@shared/schema";

const folderFormSchema = z.object({
  name: z.string().min(1, "اسم المجلد مطلوب"),
  description: z.string().optional(),
  parentId: z.string().nullable().optional(),
});

type FolderFormValues = z.infer<typeof folderFormSchema>;

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: MediaFolder[];
  editingFolder?: MediaFolder | null;
}

export function CreateFolderDialog({
  open,
  onOpenChange,
  folders,
  editingFolder,
}: CreateFolderDialogProps) {
  const { toast } = useToast();

  const form = useForm<FolderFormValues>({
    resolver: zodResolver(folderFormSchema),
    defaultValues: {
      name: editingFolder?.name || "",
      description: editingFolder?.description || "",
      parentId: editingFolder?.parentId || null,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FolderFormValues) => {
      return apiRequest("/api/media/folders", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/folders"] });
      toast({
        title: "تم الإنشاء بنجاح",
        description: "تم إنشاء المجلد الجديد",
      });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "فشل الإنشاء",
        description: error.message || "حدث خطأ أثناء إنشاء المجلد",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FolderFormValues) => {
      return apiRequest(`/api/media/folders/${editingFolder?.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/folders"] });
      toast({
        title: "تم التحديث بنجاح",
        description: "تم تحديث المجلد",
      });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "فشل التحديث",
        description: error.message || "حدث خطأ أثناء تحديث المجلد",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    form.reset();
    onOpenChange(false);
  };

  const onSubmit = (data: FolderFormValues) => {
    if (editingFolder) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle data-testid="heading-folder-dialog">
            {editingFolder ? "تعديل المجلد" : "مجلد جديد"}
          </DialogTitle>
          <DialogDescription>
            {editingFolder ? "قم بتعديل معلومات المجلد" : "قم بإنشاء مجلد جديد لتنظيم الوسائط"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم المجلد *</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-folder-name" />
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
                  <FormLabel>الوصف (اختياري)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} data-testid="input-folder-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="parentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>المجلد الأب (اختياري)</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || undefined}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-parent-folder">
                        <SelectValue placeholder="بدون مجلد أب" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="null">بدون مجلد أب</SelectItem>
                      {folders
                        .filter((f) => f.id !== editingFolder?.id)
                        .map((folder) => (
                          <SelectItem key={folder.id} value={folder.id}>
                            {folder.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isPending}
                data-testid="button-cancel"
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save">
                {isPending
                  ? "جاري الحفظ..."
                  : editingFolder
                  ? "حفظ التعديلات"
                  : "إنشاء المجلد"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
