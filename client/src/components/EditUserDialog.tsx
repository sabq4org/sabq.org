import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth, hasRole } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FormSection, FormFieldRow } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, IdCard, User, UserCheck, Phone, Briefcase, Shield, Key, Eye, EyeOff, Mail } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ImageUpload } from "@/components/ImageUpload";

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
}

interface Role {
  id: string;
  name: string;
  nameAr: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  firstNameEn: string | null;
  lastNameEn: string | null;
  phoneNumber: string | null;
  profileImageUrl: string | null;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  roles: Role[];
  hasPressCard?: boolean;
  jobTitle?: string | null;
  department?: string | null;
  pressIdNumber?: string | null;
  cardValidUntil?: string | null;
}

interface ArticleEditorPermission {
  code: string;
  label: string;
  labelEn: string;
  description: string;
}

interface PermissionOverride {
  id: string;
  userId: string;
  permissionCode: string;
  effect: "allow" | "deny";
  reason?: string;
  grantedBy?: string;
  createdAt: string;
}

const editUserSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  firstName: z.string().min(2, "الاسم الأول يجب أن يكون حرفين على الأقل"),
  lastName: z.string().min(2, "اسم العائلة يجب أن يكون حرفين على الأقل"),
  firstNameEn: z.union([z.string().min(2, "English first name must be at least 2 characters"), z.literal("")]).optional(),
  lastNameEn: z.union([z.string().min(2, "English last name must be at least 2 characters"), z.literal("")]).optional(),
  phoneNumber: z.string().regex(/^[0-9+\-\s()]*$/, "رقم الهاتف غير صحيح").optional().or(z.literal("")),
  profileImageUrl: z.string().nullable().optional(),
  bioAr: z.string().optional().or(z.literal("")),
  bio: z.string().optional().or(z.literal("")),
  titleAr: z.string().optional().or(z.literal("")),
  title: z.string().optional().or(z.literal("")),
  roleIds: z.array(z.string().uuid("معرف الدور غير صحيح")).min(1, "يجب اختيار دور واحد على الأقل"),
  status: z.enum(["active", "pending", "suspended", "banned", "locked"]).default("active"),
  emailVerified: z.boolean().default(false),
  phoneVerified: z.boolean().default(false),
  hasPressCard: z.boolean().optional(),
  jobTitle: z.union([z.string(), z.literal(""), z.null()]).optional(),
  department: z.union([z.string(), z.literal(""), z.null()]).optional(),
  pressIdNumber: z.union([z.string(), z.literal(""), z.null()]).optional(),
  cardValidUntil: z.union([z.string(), z.literal(""), z.null()]).optional(),
});

type FormData = z.infer<typeof editUserSchema>;

export function EditUserDialog({ open, onOpenChange, userId }: EditUserDialogProps) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  // Only system_admin can edit staff emails
  const canEditEmail = hasRole(currentUser, "system_admin");

  const resetPasswordMutation = useMutation({
    mutationFn: async (password: string) => {
      return await apiRequest(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword: password }),
      });
    },
    onSuccess: () => {
      toast({
        title: "تم تغيير كلمة المرور",
        description: "تم تحديث كلمة المرور بنجاح",
      });
      setNewPassword("");
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ في تغيير كلمة المرور",
        description: error.message || "حدث خطأ أثناء تغيير كلمة المرور",
        variant: "destructive",
      });
    },
  });

  const handleResetPassword = () => {
    if (newPassword.length < 8) {
      toast({
        title: "كلمة المرور قصيرة",
        description: "كلمة المرور يجب أن تكون 8 أحرف على الأقل",
        variant: "destructive",
      });
      return;
    }
    resetPasswordMutation.mutate(newPassword);
  };

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

  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ["/api/admin/users", userId],
    enabled: open && !!userId,
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
  });

  const { data: staffData } = useQuery<{ bio?: string; bioAr?: string; title?: string; titleAr?: string } | null>({
    queryKey: ["/api/admin/users", userId, "staff"],
    enabled: open && !!userId,
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}/staff`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: articleEditorPermissionsRaw } = useQuery<ArticleEditorPermission[]>({
    queryKey: ["/api/admin/article-editor-permissions"],
    enabled: open && !!userId,
    queryFn: async () => {
      const res = await fetch("/api/admin/article-editor-permissions");
      if (!res.ok) return [];
      return res.json();
    },
  });
  const articleEditorPermissions = Array.isArray(articleEditorPermissionsRaw) ? articleEditorPermissionsRaw : [];

  const { data: permissionOverridesRaw } = useQuery<PermissionOverride[]>({
    queryKey: ["/api/admin/users", userId, "permission-overrides"],
    enabled: open && !!userId,
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}/permission-overrides`);
      if (!res.ok) return [];
      return res.json();
    },
  });
  const permissionOverrides = Array.isArray(permissionOverridesRaw) ? permissionOverridesRaw : [];

  const setPermissionOverrideMutation = useMutation({
    mutationFn: async ({ permissionCode, effect }: { permissionCode: string; effect: "allow" | "deny" }) => {
      return await apiRequest(`/api/admin/users/${userId}/permission-overrides`, {
        method: "POST",
        body: JSON.stringify({ permissionCode, effect }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId, "permission-overrides"] });
      toast({
        title: "تم تحديث الصلاحية",
        description: "تم حفظ التغييرات بنجاح",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ في تحديث الصلاحية",
        description: error.message || "حدث خطأ أثناء تحديث الصلاحية",
        variant: "destructive",
      });
    },
  });

  const removePermissionOverrideMutation = useMutation({
    mutationFn: async (permissionCode: string) => {
      return await apiRequest(`/api/admin/users/${userId}/permission-overrides/${encodeURIComponent(permissionCode)}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId, "permission-overrides"] });
      toast({
        title: "تم إعادة الصلاحية للافتراضي",
        description: "تم حفظ التغييرات بنجاح",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ في تحديث الصلاحية",
        description: error.message || "حدث خطأ أثناء تحديث الصلاحية",
        variant: "destructive",
      });
    },
  });

  const getPermissionOverride = (permissionCode: string): PermissionOverride | undefined => {
    return permissionOverrides.find(o => o.permissionCode === permissionCode);
  };

  const getPermissionState = (permissionCode: string): "default" | "allow" | "deny" => {
    const override = getPermissionOverride(permissionCode);
    if (!override) return "default";
    return override.effect;
  };

  const handlePermissionChange = (permissionCode: string, newState: string) => {
    if (newState === "default") {
      removePermissionOverrideMutation.mutate(permissionCode);
    } else if (newState === "allow" || newState === "deny") {
      setPermissionOverrideMutation.mutate({ permissionCode, effect: newState });
    }
  };

  const form = useForm<FormData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      firstNameEn: "",
      lastNameEn: "",
      phoneNumber: "",
      profileImageUrl: null,
      bioAr: "",
      bio: "",
      titleAr: "",
      title: "",
      roleIds: [],
      status: "active",
      emailVerified: false,
      phoneVerified: false,
      hasPressCard: false,
      jobTitle: "",
      department: "",
      pressIdNumber: "",
      cardValidUntil: "",
    },
  });

  useEffect(() => {
    if (!open) {
      setNewPassword("");
      setShowPassword(false);
    }
  }, [open]);

  useEffect(() => {
    if (user) {
      form.reset({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        firstNameEn: user.firstNameEn || "",
        lastNameEn: user.lastNameEn || "",
        phoneNumber: user.phoneNumber || "",
        profileImageUrl: user.profileImageUrl,
        bioAr: staffData?.bioAr || "",
        bio: staffData?.bio || "",
        titleAr: staffData?.titleAr || "",
        title: staffData?.title || "",
        roleIds: user.roles?.map(r => r.id) || [],
        status: user.status as any,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        hasPressCard: user.hasPressCard || false,
        jobTitle: user.jobTitle || "",
        department: user.department || "",
        pressIdNumber: user.pressIdNumber || "",
        cardValidUntil: user.cardValidUntil || "",
      });
    }
  }, [user, staffData, form]);

  const updateUserMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { roleIds, bioAr, bio, titleAr, title, hasPressCard, jobTitle, department, pressIdNumber, cardValidUntil, email, ...userData } = data;
      
      // Prepare press card data
      const pressCardData = {
        hasPressCard,
        jobTitle: jobTitle || null,
        department: department || null,
        pressIdNumber: pressIdNumber || null,
        cardValidUntil: cardValidUntil || null,
      };
      
      await apiRequest(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...userData, ...pressCardData, email }),
      });

      if (roleIds && roleIds.length > 0) {
        await apiRequest(`/api/admin/users/${userId}/roles`, {
          method: "PATCH",
          body: JSON.stringify({ roleIds }),
        });
      }

      // Only update staff data if at least one field has a value
      if (bioAr || bio || titleAr || title) {
        await apiRequest(`/api/admin/users/${userId}/staff`, {
          method: "PATCH",
          body: JSON.stringify({ bioAr, bio, titleAr, title }),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId, "staff"] });
      
      toast({
        title: "تم تحديث المستخدم بنجاح",
        description: "تم حفظ التغييرات بنجاح",
      });
      
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ في تحديث المستخدم",
        description: error.message || "حدث خطأ أثناء تحديث المستخدم",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    // Log form state for debugging
    console.log('📝 Form submission data:', data);
    console.log('📝 Form errors:', form.formState.errors);
    updateUserMutation.mutate(data);
  };
  
  const onError = (errors: any) => {
    console.error('❌ Form validation errors:', errors);
    toast({
      title: "خطأ في التحقق من البيانات",
      description: "يرجى التحقق من جميع الحقول المطلوبة",
      variant: "destructive",
    });
  };

  if (!userId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col" data-testid="dialog-edit-user" dir="rtl">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title">تعديل بيانات المستخدم</DialogTitle>
          <DialogDescription data-testid="dialog-description">
            قم بتعديل بيانات المستخدم وأدواره
          </DialogDescription>
        </DialogHeader>

        {userLoading ? (
          <div className="flex items-center justify-center py-8" data-testid="loading-user">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onError)} className="flex flex-col flex-1 min-h-0">
              <div className="space-y-6 overflow-y-auto flex-1 px-1 py-2">
                {/* Email Section - Only system_admin can edit */}
                <FormSection
                  title="البريد الإلكتروني"
                  description={canEditEmail ? "تعديل عنوان البريد الإلكتروني للمستخدم" : "مسؤول النظام فقط يمكنه تعديل البريد الإلكتروني"}
                  icon={Mail}
                >
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-email">البريد الإلكتروني *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            placeholder="example@sabq.org"
                            data-testid="input-email"
                            dir="ltr"
                            disabled={!canEditEmail}
                            className={!canEditEmail ? "bg-muted cursor-not-allowed" : ""}
                          />
                        </FormControl>
                        <FormMessage data-testid="error-email" />
                      </FormItem>
                    )}
                  />
                </FormSection>

                {/* Basic Info Section */}
                <FormSection
                  title="البيانات الأساسية"
                  description="الاسم بالعربية والإنجليزية"
                  icon={User}
                >
                  <FormFieldRow columns={2}>
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel data-testid="label-firstName">الاسم الأول *</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="أحمد"
                              data-testid="input-firstName"
                            />
                          </FormControl>
                          <FormMessage data-testid="error-firstName" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel data-testid="label-lastName">اسم العائلة *</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="محمد"
                              data-testid="input-lastName"
                            />
                          </FormControl>
                          <FormMessage data-testid="error-lastName" />
                        </FormItem>
                      )}
                    />
                  </FormFieldRow>
                  <FormFieldRow columns={2}>
                    <FormField
                      control={form.control}
                      name="firstNameEn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel data-testid="label-firstNameEn">English First Name</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Ahmed"
                              data-testid="input-firstNameEn"
                              dir="ltr"
                            />
                          </FormControl>
                          <FormMessage data-testid="error-firstNameEn" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastNameEn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel data-testid="label-lastNameEn">English Last Name</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Mohammed"
                              data-testid="input-lastNameEn"
                              dir="ltr"
                            />
                          </FormControl>
                          <FormMessage data-testid="error-lastNameEn" />
                        </FormItem>
                      )}
                    />
                  </FormFieldRow>
                </FormSection>

                {/* Contact Info Section */}
                <FormSection
                  title="معلومات التواصل"
                  description="رقم الهاتف والصورة الشخصية"
                  icon={Phone}
                >
                  <FormField
                    control={form.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-phoneNumber">رقم الهاتف</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="tel"
                            placeholder="+966 50 123 4567"
                            data-testid="input-phoneNumber"
                            dir="ltr"
                          />
                        </FormControl>
                        <FormMessage data-testid="error-phoneNumber" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="profileImageUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-profileImage">الصورة الشخصية</FormLabel>
                        <FormControl>
                          <ImageUpload
                            value={field.value}
                            onChange={field.onChange}
                            disabled={updateUserMutation.isPending}
                          />
                        </FormControl>
                        <FormMessage data-testid="error-profileImage" />
                      </FormItem>
                    )}
                  />
                </FormSection>

                {/* Staff Info Section */}
                <FormSection
                  title="معلومات الموظف"
                  description="هذه الحقول تظهر في صفحة المراسل العامة"
                  icon={Briefcase}
                >
                  <FormField
                    control={form.control}
                    name="bioAr"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-bioAr">السيرة الذاتية (عربي)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="نبذة مختصرة عن الكاتب..."
                            data-testid="textarea-bioAr"
                            dir="rtl"
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage data-testid="error-bioAr" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-bio">Biography (English)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Brief bio about the writer..."
                            data-testid="textarea-bio"
                            dir="ltr"
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage data-testid="error-bio" />
                      </FormItem>
                    )}
                  />
                  <FormFieldRow columns={2}>
                    <FormField
                      control={form.control}
                      name="titleAr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel data-testid="label-titleAr">المسمى الوظيفي (عربي)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="مثال: كاتب صحفي"
                              data-testid="input-titleAr"
                              dir="rtl"
                            />
                          </FormControl>
                          <FormMessage data-testid="error-titleAr" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel data-testid="label-title">Job Title (English)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="e.g. Journalist"
                              data-testid="input-title"
                              dir="ltr"
                            />
                          </FormControl>
                          <FormMessage data-testid="error-title" />
                        </FormItem>
                      )}
                    />
                  </FormFieldRow>
                </FormSection>

                {/* Roles & Permissions Section */}
                <FormSection
                  title="الأدوار والصلاحيات"
                  description="اختر الأدوار المناسبة للمستخدم"
                  icon={UserCheck}
                >
                  <div className="space-y-3">
                    <FormLabel data-testid="label-roles">الأدوار *</FormLabel>
                    {rolesLoading ? (
                      <p className="text-sm text-muted-foreground" data-testid="roles-loading">
                        جاري تحميل الأدوار...
                      </p>
                    ) : (
                      <div className="space-y-2 border rounded-md p-3 bg-muted/30" data-testid="roles-list">
                        {roles?.map((role) => (
                          <FormField
                            key={role.id}
                            control={form.control}
                            name="roleIds"
                            render={({ field }) => {
                              return (
                                <FormItem
                                  key={role.id}
                                  className="flex flex-row items-center gap-3 space-y-0"
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
                                  <FormLabel className="text-sm font-normal cursor-pointer" data-testid={`label-role-${role.id}`}>
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

                  <div className="space-y-3 mt-4">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between gap-2 rounded-lg border p-3 bg-muted/30">
                          <div className="space-y-0.5">
                            <FormLabel data-testid="label-status">حالة الحساب</FormLabel>
                            <FormDescription data-testid="description-status">
                              {field.value === "active" ? "الحساب نشط" : "الحساب معطل"}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              data-testid="switch-status"
                              checked={field.value === "active"}
                              onCheckedChange={(checked) =>
                                field.onChange(checked ? "active" : "pending")
                              }
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="emailVerified"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between gap-2 rounded-lg border p-3 bg-muted/30">
                          <div className="space-y-0.5">
                            <FormLabel data-testid="label-emailVerified">تأكيد البريد الإلكتروني</FormLabel>
                            <FormDescription data-testid="description-emailVerified">
                              {field.value ? "تم التأكيد" : "غير مؤكد"}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              data-testid="switch-emailVerified"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phoneVerified"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between gap-2 rounded-lg border p-3 bg-muted/30">
                          <div className="space-y-0.5">
                            <FormLabel data-testid="label-phoneVerified">تأكيد رقم الهاتف</FormLabel>
                            <FormDescription data-testid="description-phoneVerified">
                              {field.value ? "تم التأكيد" : "غير مؤكد"}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              data-testid="switch-phoneVerified"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </FormSection>

                {/* Password Reset Section */}
                <FormSection
                  title="تغيير كلمة المرور"
                  description="إعادة تعيين كلمة مرور جديدة للمستخدم"
                  icon={Key}
                >
                  <div className="space-y-3">
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="كلمة المرور الجديدة (8 أحرف على الأقل)"
                        data-testid="input-new-password"
                        className="pl-10"
                        dir="ltr"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleResetPassword}
                      disabled={!newPassword || resetPasswordMutation.isPending}
                      data-testid="button-reset-password"
                      className="w-full"
                    >
                      {resetPasswordMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin ml-2" />
                      ) : (
                        <Key className="h-4 w-4 ml-2" />
                      )}
                      تغيير كلمة المرور
                    </Button>
                  </div>
                </FormSection>

                {/* Press Card Section */}
                <FormSection
                  title="البطاقة الصحفية الرقمية"
                  description="إعدادات البطاقة الصحفية للمستخدم"
                  icon={IdCard}
                >
                  <FormField
                    control={form.control}
                    name="hasPressCard"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between gap-2 rounded-lg border p-4 bg-muted/30">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            تفعيل البطاقة الصحفية
                          </FormLabel>
                          <FormDescription>
                            منح المستخدم صلاحية إصدار بطاقة صحفية رقمية
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-has-press-card"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  {form.watch('hasPressCard') && (
                    <div className="space-y-4 mt-4">
                      <FormFieldRow columns={2}>
                        <FormField
                          control={form.control}
                          name="jobTitle"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>المنصب الوظيفي</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ''} placeholder="محرر، مراسل، رئيس قسم..." data-testid="input-job-title" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="department"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>القسم</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ''} placeholder="القسم الرياضي، السياسي..." data-testid="input-department" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </FormFieldRow>
                      <FormFieldRow columns={2}>
                        <FormField
                          control={form.control}
                          name="pressIdNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>رقم البطاقة الصحفية</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ''} placeholder="PRESS-12345" data-testid="input-press-id-number" />
                              </FormControl>
                              <FormDescription>
                                رقم فريد للبطاقة الصحفية
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="cardValidUntil"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>صالحة حتى</FormLabel>
                              <FormControl>
                                <Input 
                                  type="date" 
                                  {...field} 
                                  value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''} 
                                  data-testid="input-card-valid-until"
                                />
                              </FormControl>
                              <FormDescription>
                                تاريخ انتهاء صلاحية البطاقة (اختياري)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </FormFieldRow>
                    </div>
                  )}
                </FormSection>

                {/* Article Editor Permissions Section */}
                <FormSection
                  title="صلاحيات محرر المقالات"
                  description="تخصيص صلاحيات المحرر لهذا المستخدم"
                  icon={Shield}
                >
                  <div className="space-y-3" data-testid="article-editor-permissions">
                    {articleEditorPermissions.length === 0 ? (
                      <p className="text-sm text-muted-foreground" data-testid="permissions-loading">
                        جاري تحميل الصلاحيات...
                      </p>
                    ) : (
                      articleEditorPermissions.map((permission) => {
                        const currentState = getPermissionState(permission.code);
                        const isUpdating = setPermissionOverrideMutation.isPending || removePermissionOverrideMutation.isPending;
                        
                        return (
                          <div
                            key={permission.code}
                            className="flex flex-col gap-2 rounded-lg border p-3 bg-muted/30"
                            data-testid={`permission-row-${permission.code}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium" data-testid={`permission-label-${permission.code}`}>
                                  {permission.label}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {permission.description}
                                </p>
                              </div>
                              <ToggleGroup
                                type="single"
                                value={currentState}
                                onValueChange={(value) => {
                                  if (value && value !== currentState) {
                                    handlePermissionChange(permission.code, value);
                                  }
                                }}
                                disabled={isUpdating}
                                className="shrink-0"
                                data-testid={`permission-toggle-${permission.code}`}
                              >
                                <ToggleGroupItem
                                  value="deny"
                                  aria-label="معطّل"
                                  className={`text-xs px-2 ${currentState === "deny" ? "bg-destructive/20 text-destructive border-destructive" : ""}`}
                                  data-testid={`permission-deny-${permission.code}`}
                                >
                                  معطّل
                                </ToggleGroupItem>
                                <ToggleGroupItem
                                  value="default"
                                  aria-label="افتراضي"
                                  className={`text-xs px-2 ${currentState === "default" ? "bg-muted" : ""}`}
                                  data-testid={`permission-default-${permission.code}`}
                                >
                                  افتراضي
                                </ToggleGroupItem>
                                <ToggleGroupItem
                                  value="allow"
                                  aria-label="مفعّل"
                                  className={`text-xs px-2 ${currentState === "allow" ? "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500" : ""}`}
                                  data-testid={`permission-allow-${permission.code}`}
                                >
                                  مفعّل
                                </ToggleGroupItem>
                              </ToggleGroup>
                            </div>
                            {currentState !== "default" && (
                              <div className="flex items-center gap-1.5">
                                <span 
                                  className={`text-xs px-1.5 py-0.5 rounded ${
                                    currentState === "allow" 
                                      ? "bg-green-500/10 text-green-700 dark:text-green-400" 
                                      : "bg-destructive/10 text-destructive"
                                  }`}
                                  data-testid={`permission-status-${permission.code}`}
                                >
                                  {currentState === "allow" ? "تجاوز: مفعّل" : "تجاوز: معطّل"}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </FormSection>
              </div>

            <DialogFooter className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={updateUserMutation.isPending}
                  data-testid="button-cancel"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  data-testid="button-submit"
                >
                  {updateUserMutation.isPending && (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" data-testid="spinner-submit" />
                  )}
                  حفظ التغييرات
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
