import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { adminUpdateUserRolesSchema } from "@shared/schema";
import { z } from "zod";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { PermissionMatrix } from "./PermissionMatrix";
import { Separator } from "@/components/ui/separator";

interface RolesPanelProps {
  userId: string;
  currentRoles: string[];
  open: boolean;
  onClose: () => void;
}

interface Role {
  id: string;
  name: string;
  nameAr: string;
}

type FormData = z.infer<typeof adminUpdateUserRolesSchema>;

export function RolesPanel({ userId, currentRoles, open, onClose }: RolesPanelProps) {
  const { toast } = useToast();

  const { data: rolesRaw, isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/admin/roles"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/admin/roles");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });
  const roles = Array.isArray(rolesRaw) ? rolesRaw : [];

  const form = useForm<FormData>({
    resolver: zodResolver(adminUpdateUserRolesSchema),
    defaultValues: {
      roleIds: currentRoles,
      reason: "",
    },
  });

  const selectedRoleIds = form.watch("roleIds");

  const updateRolesMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return await apiRequest(`/api/admin/users/${userId}/roles`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      toast({
        title: "تم تحديث الأدوار بنجاح",
        description: "تم تحديث أدوار المستخدم في النظام",
      });
      form.reset();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ في تحديث الأدوار",
        description: error.message || "حدث خطأ أثناء تحديث الأدوار",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    updateRolesMutation.mutate(data);
  };

  const hasChanges = JSON.stringify(selectedRoleIds) !== JSON.stringify(currentRoles);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[500px] overflow-y-auto" data-testid="sheet-roles-panel" dir="rtl">
        <SheetHeader>
          <SheetTitle data-testid="sheet-title">تعديل أدوار المستخدم</SheetTitle>
          <SheetDescription data-testid="sheet-description">
            اختر الأدوار المناسبة للمستخدم وسيتم تحديث صلاحياته تلقائياً
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
            <div className="space-y-3">
              <FormLabel data-testid="label-roles">الأدوار المتاحة</FormLabel>
              {rolesLoading ? (
                <p className="text-sm text-muted-foreground" data-testid="roles-loading">
                  جاري تحميل الأدوار...
                </p>
              ) : (
                <div className="space-y-2" data-testid="roles-list">
                  {roles?.map((role) => (
                    <FormField
                      key={role.id}
                      control={form.control}
                      name="roleIds"
                      render={({ field }) => {
                        return (
                          <FormItem
                            key={role.id}
                            className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-3 hover-elevate"
                          >
                            <FormControl>
                              <Checkbox
                                data-testid={`checkbox-role-${role.id}`}
                                checked={field.value?.includes(role.id)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...field.value, role.id])
                                    : field.onChange(
                                        field.value?.filter(
                                          (value) => value !== role.id
                                        )
                                      );
                                }}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal cursor-pointer flex-1" data-testid={`label-role-${role.id}`}>
                              {role.nameAr}
                            </FormLabel>
                          </FormItem>
                        );
                      }}
                    />
                  ))}
                </div>
              )}
              <FormMessage data-testid="error-roleIds" />
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel data-testid="label-reason">سبب التغيير (اختياري)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="اذكر سبب تغيير أدوار هذا المستخدم..."
                      className="min-h-[80px]"
                      data-testid="textarea-reason"
                    />
                  </FormControl>
                  <FormMessage data-testid="error-reason" />
                </FormItem>
              )}
            />

            <Separator />

            <div className="space-y-3">
              <PermissionMatrix selectedRoleIds={selectedRoleIds} />
            </div>

            <SheetFooter className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={updateRolesMutation.isPending}
                data-testid="button-cancel"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={updateRolesMutation.isPending || !hasChanges}
                data-testid="button-submit"
              >
                {updateRolesMutation.isPending && (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" data-testid="spinner-submit" />
                )}
                حفظ التعديلات
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
